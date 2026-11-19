const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { after, before, test } = require('node:test');

const ROOT = path.resolve(__dirname, '..');
let dataDir;
let origin;
let portalPort;
let portalProcess;
let smtpServer;
let smtpPort;
let smtpMessages = [];
let smtpSockets = new Set();
let processOutput = '';

async function startSmtpCapture() {
  smtpServer = net.createServer(socket => {
    smtpSockets.add(socket);
    socket.once('close', () => smtpSockets.delete(socket));
    socket.setEncoding('utf8');
    socket.write('220 local.test ESMTP\r\n');
    let buffer = '';
    let inData = false;
    let dataLines = [];
    socket.on('data', chunk => {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (inData) {
          if (line === '.') {
            inData = false;
            smtpMessages.push(dataLines.join('\r\n'));
            dataLines = [];
            socket.write('250 queued\r\n');
          } else {
            dataLines.push(line.startsWith('..') ? line.slice(1) : line);
          }
          continue;
        }
        const command = line.toUpperCase();
        if (command.startsWith('EHLO') || command.startsWith('HELO')) socket.write('250 local.test\r\n');
        else if (command.startsWith('MAIL FROM') || command.startsWith('RCPT TO') || command === 'RSET' || command === 'NOOP') socket.write('250 OK\r\n');
        else if (command === 'DATA') {
          inData = true;
          socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
        } else if (command === 'QUIT') socket.write('221 Bye\r\n');
        else socket.write('250 OK\r\n');
      }
    });
  });
  await new Promise((resolve, reject) => {
    smtpServer.once('error', reject);
    smtpServer.listen(0, '127.0.0.1', resolve);
  });
  smtpPort = smtpServer.address().port;
}

async function reservePort() {
  const probe = http.createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const { port } = probe.address();
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  return port;
}

async function api(pathname, { method = 'GET', body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookie) headers.cookie = cookie;
  const response = await fetch(new URL(pathname, origin), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
    cookie: response.headers.get('set-cookie')?.split(';', 1)[0],
  };
}

function assertStatus(response, expected, action) {
  assert.equal(response.status, expected, `${action}: ${JSON.stringify(response.body)}\n${processOutput}`);
}

function decodeQuotedPrintable(value) {
  return value.replace(/=\r?\n/g, '').replace(/=([A-F\d]{2})/gi, (_, byte) => String.fromCharCode(parseInt(byte, 16)));
}

async function waitForMessages(count) {
  for (let attempt = 0; attempt < 600; attempt++) {
    if (smtpMessages.length >= count) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.fail(`Expected ${count} SMTP messages, received ${smtpMessages.length}.\n${processOutput}`);
}

async function startPortal() {
  portalPort ||= await reservePort();
  origin = `http://127.0.0.1:${portalPort}`;
  processOutput = '';
  portalProcess = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: String(portalPort),
      ASPECT_DATA_DIR: dataDir,
      ASPECT_PILOT_MODE: '0',
      ASPECT_SETUP_TOKEN: '',
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: String(smtpPort),
      SMTP_FROM: 'portal@example.test',
      SMTP_USER: '',
      SMTP_PASS: '',
      SMTP_SECURE: 'false',
      PORTAL_PUBLIC_URL: origin,
    },
    windowsHide: true,
  });
  for (const stream of [portalProcess.stdout, portalProcess.stderr]) {
    stream.setEncoding('utf8');
    stream.on('data', chunk => { processOutput = (processOutput + chunk).slice(-6000); });
  }
  for (let attempt = 0; attempt < 600; attempt++) {
    if (portalProcess.exitCode !== null) throw new Error(`Test portal exited during startup.\n${processOutput}`);
    try {
      const response = await fetch(new URL('/api/health', origin));
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Test portal did not become healthy.\n${processOutput}`);
}

async function stopPortal() {
  if (!portalProcess || portalProcess.exitCode !== null) return;
  portalProcess.kill('SIGTERM');
  await Promise.race([once(portalProcess, 'exit'), new Promise(resolve => setTimeout(resolve, 3000))]);
  if (portalProcess.exitCode === null) portalProcess.kill();
}

before(async () => {
  smtpMessages = [];
  await startSmtpCapture();
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aspect-portal-calendar-updates-'));
  await startPortal();
});

after(async () => {
  await stopPortal();
  for (const socket of smtpSockets) socket.destroy();
  if (smtpServer?.listening) {
    const closed = once(smtpServer, 'close');
    smtpServer.close();
    await closed;
  }
  if (dataDir && path.basename(dataDir).startsWith('aspect-portal-calendar-updates-')) {
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});

test('event edits notify existing external guests without changing their RSVP or original link', async () => {
  const setup = await api('/api/auth/setup', {
    method: 'POST',
    body: { name: 'Calendar Update Administrator', email: 'calendar-update-admin@example.test', password: 'Calendar-update-password-2030!' },
  });
  assertStatus(setup, 201, 'create test administrator');
  const portals = await api('/api/auth/portals', { cookie: setup.cookie });
  assertStatus(portals, 200, 'load company portals');
  const companyPortal = portals.body.find(portal => portal.parentId);
  assert.ok(companyPortal, 'a company portal should exist');
  const selected = await api('/api/auth/select-company', {
    method: 'POST', cookie: setup.cookie, body: { companySlug: companyPortal.slug },
  });
  assertStatus(selected, 200, 'select the company portal');

  const created = await api('/api/calendar/events', {
    method: 'POST', cookie: setup.cookie,
    body: {
      title: 'External guest update regression',
      startDate: '2030-01-15', endDate: '2030-01-15',
      startTime: '11:00', endTime: '12:00', timeZone: 'America/New_York',
      allDay: false, location: 'Virtual', description: 'Initial decisions', attendeeIds: [],
      externalAttendees: [{ name: 'External Guest', email: 'external-guest@example.test' }],
      locationType: 'Virtual meeting', meetingType: 'Project planning',
    },
  });
  assertStatus(created, 201, 'create calendar event with an external guest');
  assert.equal(created.body.inviteDelivery.invitations, 1);
  assert.equal(created.body.inviteDelivery.updates, 0);
  await waitForMessages(1);

  const initialMessage = decodeQuotedPrintable(smtpMessages[0]);
  const tokenMatch = initialMessage.match(/calendar-rsvp\.html\?token=([A-Za-z0-9_-]{32,})/);
  assert.ok(tokenMatch, 'initial invitation should contain an RSVP link');
  const originalToken = tokenMatch[1];
  await stopPortal();
  const legacyDatabase = new DatabaseSync(path.join(dataDir, 'portal.sqlite'));
  legacyDatabase.exec('ALTER TABLE calendar_event_external_attendees DROP COLUMN responded_at');
  legacyDatabase.close();
  await startPortal();
  const initialLink = await api(`/api/calendar/external-rsvp?token=${encodeURIComponent(originalToken)}`);
  assertStatus(initialLink, 200, 'load the original RSVP link');
  const accepted = await api('/api/calendar/external-rsvp', {
    method: 'POST', body: { token: originalToken, response: 'accepted' },
  });
  assertStatus(accepted, 200, 'record the external guest RSVP');
  const responseDatabase = new DatabaseSync(path.join(dataDir, 'portal.sqlite'));
  const storedResponse = responseDatabase.prepare('SELECT response,responded_at FROM calendar_event_external_attendees WHERE token_hash=?').get(
    createHash('sha256').update(originalToken).digest('hex'),
  );
  responseDatabase.close();
  assert.equal(storedResponse.response, 'accepted');
  assert.ok(storedResponse.responded_at, 'the RSVP timestamp should be persisted');

  const changed = await api(`/api/calendar/events/${encodeURIComponent(created.body.event.id)}`, {
    method: 'PATCH', cookie: setup.cookie,
    body: { startTime: '12:00', endTime: '13:00', description: 'Updated decisions' },
  });
  assertStatus(changed, 200, 'update the meeting time and guest-facing details');
  assert.equal(changed.body.inviteDelivery.invitations, 0);
  assert.equal(changed.body.inviteDelivery.updates, 1);
  await waitForMessages(2);

  const updateMessage = decodeQuotedPrintable(smtpMessages[1]);
  assert.match(updateMessage, /Subject: Calendar update: External guest update regression/i);
  assert.match(updateMessage, /original invitation/i);
  assert.match(updateMessage, /updated decisions/i);
  assert.doesNotMatch(updateMessage, /calendar-rsvp\.html\?token=/i, 'an event edit must not rotate or replace the RSVP link');

  const originalLinkStillWorks = await api(`/api/calendar/external-rsvp?token=${encodeURIComponent(originalToken)}`);
  assertStatus(originalLinkStillWorks, 200, 'load the updated event through the original RSVP link');
  assert.equal(originalLinkStillWorks.body.response, 'accepted');
  assert.equal(originalLinkStillWorks.body.event.startsAt, '2030-01-15T17:00:00.000Z');
  assert.equal(originalLinkStillWorks.body.event.endsAt, '2030-01-15T18:00:00.000Z');
  const updatedResponseDatabase = new DatabaseSync(path.join(dataDir, 'portal.sqlite'));
  const updatedStoredResponse = updatedResponseDatabase.prepare('SELECT response,responded_at FROM calendar_event_external_attendees WHERE token_hash=?').get(
    createHash('sha256').update(originalToken).digest('hex'),
  );
  updatedResponseDatabase.close();
  assert.equal(updatedStoredResponse.response, 'accepted');
  assert.equal(updatedStoredResponse.responded_at, storedResponse.responded_at, 'editing event details must preserve the response timestamp');

  const noDetailsChanged = await api(`/api/calendar/events/${encodeURIComponent(created.body.event.id)}`, {
    method: 'PATCH', cookie: setup.cookie,
    body: { externalAttendees: [{ name: 'External Guest', email: 'external-guest@example.test' }] },
  });
  assertStatus(noDetailsChanged, 200, 'save an unchanged external guest list');
  assert.equal(noDetailsChanged.body.inviteDelivery.queued, 0);
  assert.equal(smtpMessages.length, 2, 'an unchanged event should not send another update notice');
});
