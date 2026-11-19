const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { after, before, test } = require('node:test');

const ROOT = path.resolve(__dirname, '..');
let dataDir;
let origin;
let portalProcess;
let processOutput = '';

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

async function getRaw(pathname, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request(new URL(pathname, origin), { headers }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
    });
    request.once('error', reject);
    request.end();
  });
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
  const result = text ? JSON.parse(text) : null;
  return {
    status: response.status,
    body: result,
    cookie: response.headers.get('set-cookie')?.split(';', 1)[0],
    headers: response.headers,
  };
}

function assertStatus(response, expected, message) {
  assert.equal(response.status, expected, `${message}: ${JSON.stringify(response.body)}`);
}

async function createMember(adminCookie, name, email) {
  const created = await api('/api/company-users', {
    method: 'POST', cookie: adminCookie, body: { name, email },
  });
  assertStatus(created, 201, 'create member');
  const login = await api('/api/auth/login', {
    method: 'POST', body: { email, password: created.body.temporaryPassword },
  });
  assertStatus(login, 200, 'member sign in');
  const cookie = login.cookie;
  const changed = await api('/api/auth/password', {
    method: 'POST', cookie,
    body: { currentPassword: created.body.temporaryPassword, newPassword: 'Phase1-test-password-2030!' },
  });
  assertStatus(changed, 200, 'change temporary password');
  return { id: created.body.id, cookie };
}

before(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aspect-portal-phase1-'));
  const port = await reservePort();
  origin = `http://127.0.0.1:${port}`;
  portalProcess = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: String(port),
      ASPECT_DATA_DIR: dataDir,
      ASPECT_PILOT_MODE: '0',
      ASPECT_SETUP_TOKEN: '',
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
});

after(async () => {
  if (portalProcess && portalProcess.exitCode === null) {
    portalProcess.kill('SIGTERM');
    await Promise.race([once(portalProcess, 'exit'), new Promise(resolve => setTimeout(resolve, 3000))]);
    if (portalProcess.exitCode === null) portalProcess.kill();
  }
  if (dataDir && path.basename(dataDir).startsWith('aspect-portal-phase1-')) {
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});

test('static assets compress and revalidate while HTML and APIs stay private from shared caching', async () => {
  const assetPath = '/app.js?v=phase1-regression';
  const compressed = await getRaw(assetPath, { 'accept-encoding': 'br, gzip' });
  assert.equal(compressed.status, 200);
  assert.equal(compressed.headers['content-encoding'], 'br');
  assert.match(compressed.headers['cache-control'], /max-age=31536000/);
  assert.match(compressed.headers['cache-control'], /immutable/);
  assert.match(compressed.headers.vary || '', /accept-encoding/i);
  assert.ok(compressed.headers.etag);
  assert.deepEqual(
    zlib.brotliDecompressSync(compressed.body),
    await fs.readFile(path.join(ROOT, 'public', 'app.js')),
  );

  const revalidated = await getRaw(assetPath, {
    'accept-encoding': 'br',
    'if-none-match': compressed.headers.etag,
  });
  assert.equal(revalidated.status, 304);
  assert.equal(revalidated.body.length, 0);

  const html = await getRaw('/', { 'accept-encoding': 'gzip' });
  assert.equal(html.status, 200);
  assert.equal(html.headers['cache-control'], 'no-store');
  assert.equal(html.headers['content-encoding'], 'gzip');

  const health = await getRaw('/api/health', { 'accept-encoding': 'br, gzip' });
  assert.equal(health.status, 200);
  assert.equal(health.headers['cache-control'], 'no-store');
  assert.equal(health.headers['content-encoding'], undefined);

  const unknownPage = await getRaw('/missing-test-page', { accept: 'text/html' });
  assert.equal(unknownPage.status, 200);
  assert.match(unknownPage.body.toString('utf8'), /<html/i);
});

test('calendar event times and edit permissions stay consistent for members and platform administrators', async () => {
  const setup = await api('/api/auth/setup', {
    method: 'POST',
    body: { name: 'Audit Administrator', email: 'audit-admin@example.test', password: 'Phase1-admin-password-2030!' },
  });
  assertStatus(setup, 201, 'create isolated platform administrator');
  const adminCookie = setup.cookie;
  const initialStatus = await api('/api/auth/status', { cookie: adminCookie });
  assertStatus(initialStatus, 200, 'read the initial signed-in session');
  assert.equal(initialStatus.body.user.canAccessSystemDevelopment, false, 'platform administrators should need an explicit collaboration grant');
  const deniedAdminProjects = await api('/api/system-development', { cookie: adminCookie });
  assertStatus(deniedAdminProjects, 404, 'deny projects to a platform administrator without an explicit grant');
  const adminProjectAccess = await api(`/api/admin/system-development-members/${encodeURIComponent(initialStatus.body.user.id)}`, {
    method: 'PATCH', cookie: adminCookie, body: { access: true },
  });
  assertStatus(adminProjectAccess, 200, 'grant Projects access explicitly to the platform administrator');
  assert.equal(adminProjectAccess.body.hasAccess, true);
  const expiryDatabase = new DatabaseSync(path.join(dataDir, 'portal.sqlite'));
  const adminSession = expiryDatabase.prepare('SELECT token_hash FROM sessions WHERE user_id=?').get(initialStatus.body.user.id);
  assert.ok(adminSession, 'the administrator should have a saved session');
  expiryDatabase.prepare('UPDATE sessions SET expires_at=? WHERE token_hash=?').run(new Date(Date.now() + 60 * 60 * 1000).toISOString(), adminSession.token_hash);
  expiryDatabase.close();
  const renewedStatus = await api('/api/auth/status', { cookie: adminCookie });
  assertStatus(renewedStatus, 200, 'renew an active session near its idle timeout');
  assert.equal(renewedStatus.body.sessionExpired, false);
  assert.match(renewedStatus.cookie || '', /^aspect_session=/);
  const renewedDatabase = new DatabaseSync(path.join(dataDir, 'portal.sqlite'));
  const renewedSession = renewedDatabase.prepare('SELECT expires_at FROM sessions WHERE token_hash=?').get(adminSession.token_hash);
  assert.ok(Date.parse(renewedSession.expires_at) - Date.now() > 6 * 86400000, 'active use should extend the idle timeout');
  renewedDatabase.close();
  const portals = await api('/api/auth/portals', { cookie: adminCookie });
  assertStatus(portals, 200, 'load administrator portals');
  const root = portals.body.find(portal => !portal.parentId);
  assert.ok(root, 'the test installation should create a root company portal');
  const selected = await api('/api/auth/select-company', {
    method: 'POST', cookie: adminCookie, body: { companySlug: root.slug },
  });
  assertStatus(selected, 200, 'select root portal');

  const owner = await createMember(adminCookie, 'Calendar Owner', 'calendar-owner@example.test');
  const otherMember = await createMember(adminCookie, 'Other Member', 'other-member@example.test');
  const client = await api('/api/clients', {
    method: 'POST', cookie: adminCookie,
    body: { companyId: root.id, name: 'Calendar Client', contactName: 'Casey Client', email: 'casey-client@example.test', phone: '555-0100', location: 'Local test office', notes: 'Synthetic client used to verify calendar client selection.' },
  });
  assertStatus(client, 201, 'create a client for calendar event selection');
  const additionalAdmin = await createMember(adminCookie, 'Additional Platform Admin', 'additional-admin@example.test');
  const testDatabase = new DatabaseSync(path.join(dataDir, 'portal.sqlite'));
  testDatabase.prepare("UPDATE users SET role='admin' WHERE id=?").run(additionalAdmin.id);
  testDatabase.prepare('DELETE FROM memberships WHERE user_id=?').run(additionalAdmin.id);
  testDatabase.close();
  for (const member of [owner, otherMember]) {
    const memberPortal = await api('/api/auth/select-company', {
      method: 'POST', cookie: member.cookie, body: { companySlug: root.slug },
    });
    assertStatus(memberPortal, 200, 'select assigned member portal');
  }
  const companyClients = await api('/api/clients?companyId=' + encodeURIComponent(root.id), { cookie: owner.cookie });
  assertStatus(companyClients, 200, 'search clients from a company calendar');
  assert.ok(companyClients.body.some(item => item.id === client.body.id), 'company members can find the client to link to an event');

  const created = await api('/api/calendar/events', {
    method: 'POST', cookie: owner.cookie,
    body: {
      title: 'Calendar regression 11 to 12',
      startDate: '2030-01-15', endDate: '2030-01-15',
      startTime: '11:00', endTime: '12:00', timeZone: 'America/New_York',
       clientId: client.body.id,
      allDay: false, location: '', description: '', attendeeIds: [], externalAttendees: [],
      locationType: 'On-site', meetingType: 'Other',
    },
  });
  assertStatus(created, 201, 'create 11 a.m. calendar event');
  const eventId = created.body.event.id;
  assert.equal(created.body.event.startsAt, '2030-01-15T16:00:00.000Z');
  assert.equal(created.body.event.endsAt, '2030-01-15T17:00:00.000Z');
  assert.equal(created.body.event.clientId, client.body.id);
  assert.equal(created.body.event.clientName, 'Calendar Client');
  assert.equal(created.body.event.canManage, true);
  assert.equal(created.body.event.status, 'scheduled');
  const inviteAdmin = await api(`/api/calendar/events/${encodeURIComponent(created.body.event.id)}`, {
    method: 'PATCH', cookie: owner.cookie, body: { attendeeIds: [additionalAdmin.id] },
  });
  assertStatus(inviteAdmin, 200, 'allow inviting an active platform admin without company membership');
  assert.ok(inviteAdmin.body.event.attendees.some(attendee => attendee.id === additionalAdmin.id));
  assert.ok(inviteAdmin.body.event.attendees.some(attendee => attendee.id === owner.id));
  for (const attendee of inviteAdmin.body.event.attendees) {
    assert.match(attendee.calendarColor, /^(gold|green|coral|blue|violet|teal|rose|orange)$/);
  }

  const query = new URLSearchParams({
    from: '2030-01-15T00:00:00.000Z', to: '2030-01-16T00:00:00.000Z',
    fromDate: '2030-01-15', toDate: '2030-01-16',
  });
  const memberCalendar = await api(`/api/calendar?${query}`, { cookie: owner.cookie });
  assertStatus(memberCalendar, 200, 'read the member calendar');
  const memberEvent = memberCalendar.body.events.find(event => event.id === eventId);
  assert.ok(memberEvent);
  assert.equal(memberEvent.startsAt, '2030-01-15T16:00:00.000Z');
  assert.equal(memberEvent.endsAt, '2030-01-15T17:00:00.000Z');
  assert.equal(memberEvent.clientId, client.body.id, 'company members see the linked client');
  assert.equal(memberEvent.clientName, 'Calendar Client');
  assert.equal(memberCalendar.body.companies.find(company => company.id === root.id).canManageClients, false);
  assert.equal(memberEvent.canManage, true);

  const lunch = await api('/api/calendar/events', {
    method: 'POST', cookie: owner.cookie,
    body: {
      eventType: 'lunch', title: 'ignored title', startDate: '2030-01-15', endDate: '2030-01-15',
      startTime: '12:00', endTime: '13:00', timeZone: 'America/New_York', allDay: false,
      location: '', description: '', attendeeIds: [otherMember.id], externalAttendees: [],
      locationType: 'On-site', meetingType: 'Other',
    },
  });
  assertStatus(lunch, 201, 'create a timed lunch block');
  assert.equal(lunch.body.event.eventType, 'lunch');
  assert.equal(lunch.body.event.title, 'Lunch Break');
  assert.equal(lunch.body.event.startsAt, '2030-01-15T17:00:00.000Z');
  assert.equal(lunch.body.event.endsAt, '2030-01-15T18:00:00.000Z');
  assert.equal(lunch.body.event.allDay, false);
  assert.deepEqual(lunch.body.event.attendees.map(person => person.id), [owner.id], 'a lunch block belongs only to its creator');
  assert.deepEqual(lunch.body.event.externalAttendees, [], 'a lunch block does not send guest invitations');

  const unavailable = await api('/api/calendar/events', {
    method: 'POST', cookie: owner.cookie,
    body: {
      eventType: 'unavailable', title: 'ignored title', startDate: '2030-01-20', endDate: '2030-01-26',
      startTime: null, endTime: null, timeZone: 'America/New_York', allDay: false,
      location: '', description: '', attendeeIds: [otherMember.id], externalAttendees: [],
      locationType: 'On-site', meetingType: 'Other',
    },
  });
  assertStatus(unavailable, 201, 'create a week-long not-working block');
  assert.equal(unavailable.body.event.eventType, 'unavailable');
  assert.equal(unavailable.body.event.title, 'Time Off');
  assert.equal(unavailable.body.event.allDay, true, 'not-working blocks stay all day even if the request says otherwise');
  assert.equal(unavailable.body.event.startDate, '2030-01-20');
  assert.equal(unavailable.body.event.endDateExclusive, '2030-01-27', 'the selected end date is included');
  assert.deepEqual(unavailable.body.event.attendees.map(person => person.id), [owner.id]);
  assert.deepEqual(unavailable.body.event.externalAttendees, []);

  const blockQuery = new URLSearchParams({
    from: '2030-01-20T00:00:00.000Z', to: '2030-01-27T00:00:00.000Z',
    fromDate: '2030-01-20', toDate: '2030-01-27',
  });
  const sharedCalendar = await api('/api/calendar?' + blockQuery.toString(), { cookie: otherMember.cookie });
  assertStatus(sharedCalendar, 200, 'read another member’s shared company calendar');
  assert.ok(sharedCalendar.body.events.some(event => event.id === unavailable.body.event.id), 'the weekly block is visible to other company members');
  const blockWorkItems = await api('/api/work-items', { cookie: owner.cookie });
  assertStatus(blockWorkItems, 200, 'load work items after adding availability blocks');
  assert.ok(!blockWorkItems.body.events.some(event => [lunch.body.event.id, unavailable.body.event.id].includes(event.id)), 'availability blocks stay out of Tasks & Requests');
  assert.equal(blockWorkItems.body.events.find(event => event.id === eventId).clientName, 'Calendar Client', 'Tasks & Requests event details retain the selected client');

  const invalidClient = await api('/api/calendar/events', {
    method: 'POST', cookie: owner.cookie,
    body: {
      title: 'Calendar invalid client', startDate: '2030-01-16', endDate: '2030-01-16',
      startTime: '11:00', endTime: '12:00', timeZone: 'America/New_York', allDay: false,
      clientId: 'not-a-client-in-this-company', location: '', description: '', attendeeIds: [], externalAttendees: [],
      locationType: 'On-site', meetingType: 'Other',
    },
  });
  assertStatus(invalidClient, 400, 'reject a client that is not in the selected company');

  const ownerEdit = await api('/api/calendar/events/' + encodeURIComponent(eventId), {
    method: 'PATCH', cookie: owner.cookie, body: { title: 'Member owner corrected title' },
  });
  assertStatus(ownerEdit, 200, 'allow the member who created the event to edit it');
  assert.equal(ownerEdit.body.event.clientId, client.body.id, 'editing other event details preserves its client link');

  const canceled = await api('/api/calendar/events/' + encodeURIComponent(eventId) + '/cancellation', {
    method: 'POST', cookie: owner.cookie, body: { canceled: true },
  });
  assertStatus(canceled, 200, 'allow the event organizer to cancel a meeting');
  assert.equal(canceled.body.event.status, 'canceled');
  assert.equal(canceled.body.event.canceledByName, 'Calendar Owner');
  assert.ok(canceled.body.event.canceledAt, 'record when the meeting was canceled');
  const canceledCalendar = await api(`/api/calendar?${query}`, { cookie: otherMember.cookie });
  assertStatus(canceledCalendar, 200, 'show canceled meetings on the shared company calendar');
  assert.equal(canceledCalendar.body.events.find(event => event.id === eventId)?.status, 'canceled');
  const canceledWorkItems = await api('/api/work-items', { cookie: otherMember.cookie });
  assertStatus(canceledWorkItems, 200, 'show cancellation status in the shared work list');
  assert.equal(canceledWorkItems.body.events.find(event => event.id === eventId)?.status, 'canceled');
  const activity = await api(`/api/companies/${encodeURIComponent(root.id)}/activities`, { cookie: adminCookie });
  assertStatus(activity, 200, 'show the cancellation in company activity');
  assert.ok(activity.body.some(item => item.title === 'Calendar event canceled' && item.detail.includes('Calendar Owner')));
  const forbiddenCancel = await api('/api/calendar/events/' + encodeURIComponent(eventId) + '/cancellation', {
    method: 'POST', cookie: otherMember.cookie, body: { canceled: false },
  });
  assertStatus(forbiddenCancel, 403, 'prevent other members from changing cancellation status');

  const otherCalendar = await api(`/api/calendar?${query}`, { cookie: otherMember.cookie });
  assertStatus(otherCalendar, 200, 'read the other member calendar');
  const otherEvent = otherCalendar.body.events.find(event => event.id === eventId);
  assert.ok(otherEvent);
  assert.equal(otherEvent.canManage, false);
  const forbiddenEdit = await api(`/api/calendar/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH', cookie: otherMember.cookie, body: { title: 'Unauthorized edit' },
  });
  assertStatus(forbiddenEdit, 403, 'prevent another member from changing the event');

  const adminCalendar = await api(`/api/calendar?${query}`, { cookie: adminCookie });
  assertStatus(adminCalendar, 200, 'read the administrator calendar');
  assert.equal(adminCalendar.body.companies.find(company => company.id === root.id).canManageClients, true);
  const additionalAdminPerson = adminCalendar.body.people.find(person => person.id === additionalAdmin.id);
  assert.ok(additionalAdminPerson, 'include other platform administrators in the calendar invite directory');
  assert.equal(additionalAdminPerson.role, 'Platform administrator');
  assert.match(additionalAdminPerson.calendarColor, /^(gold|green|coral|blue|violet|teal|rose|orange)$/);
  assert.deepEqual(additionalAdminPerson.companyIds, [], 'platform admins do not need a company membership to be inviteable');
  const adminEvent = adminCalendar.body.events.find(event => event.id === eventId);
  assert.ok(adminEvent);
  assert.equal(adminEvent.canManage, true);
  const adminEdit = await api(`/api/calendar/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH', cookie: adminCookie, body: { title: 'Administrator corrected title' },
  });
  assertStatus(adminEdit, 200, 'allow administrator to change the company event');
  assert.equal(adminEdit.body.event.title, 'Administrator corrected title');
  const reinstated = await api('/api/calendar/events/' + encodeURIComponent(eventId) + '/cancellation', {
    method: 'POST', cookie: adminCookie, body: { canceled: false },
  });
  assertStatus(reinstated, 200, 'allow a platform administrator to reinstate the event');
  assert.equal(reinstated.body.event.status, 'scheduled');
  assert.equal(reinstated.body.event.canceledAt, null);

  const developmentProject = await api('/api/system-development/projects', {
    method: 'POST', cookie: adminCookie,
    body: { companyId: root.id, title: 'Checklist status regression', meetingDate: '2030-02-01', notes: '' },
  });
  assertStatus(developmentProject, 201, 'create a system development project for checklist status regression');
  const item = await api(`/api/system-development/projects/${encodeURIComponent(developmentProject.body.id)}/items`, {
    method: 'POST', cookie: adminCookie,
    body: { title: 'Checklist-driven status', status: 'Planned', checklist: [{ text: 'First step', checked: false }, { text: 'Final step', checked: false }] },
  });
  assertStatus(item, 201, 'create a development item with unchecked checklist steps');
  assert.equal(item.body.status, 'Planned');
  const partial = await api(`/api/system-development/items/${encodeURIComponent(item.body.id)}`, {
    method: 'PATCH', cookie: adminCookie, body: { checklist: [{ text: 'First step', checked: true }, { text: 'Final step', checked: false }] },
  });
  assertStatus(partial, 200, 'automatically move an item to In progress when a checklist step is checked');
  assert.equal(partial.body.status, 'In progress');
  const blocked = await api(`/api/system-development/items/${encodeURIComponent(item.body.id)}`, {
    method: 'PATCH', cookie: adminCookie, body: { status: 'Blocked' },
  });
  assertStatus(blocked, 200, 'allow a user to mark work as Blocked');
  const stillBlocked = await api(`/api/system-development/items/${encodeURIComponent(item.body.id)}`, {
    method: 'PATCH', cookie: adminCookie, body: { checklist: [{ text: 'First step', checked: true }, { text: 'Final step', checked: false }] },
  });
  assert.equal(stillBlocked.body.status, 'Blocked', 'checklist progress does not clear an unresolved blocker');
  const complete = await api(`/api/system-development/items/${encodeURIComponent(item.body.id)}`, {
    method: 'PATCH', cookie: adminCookie, body: { checklist: [{ text: 'First step', checked: true }, { text: 'Final step', checked: true }] },
  });
  assert.equal(complete.body.status, 'Complete', 'all checked steps automatically complete the item');
  const reopened = await api(`/api/system-development/items/${encodeURIComponent(item.body.id)}`, {
    method: 'PATCH', cookie: adminCookie, body: { checklist: [{ text: 'First step', checked: true }, { text: 'Final step', checked: false }] },
  });
  assert.equal(reopened.body.status, 'In progress', 'unchecking a completed step reopens the item');
  const reset = await api(`/api/system-development/items/${encodeURIComponent(item.body.id)}`, {
    method: 'PATCH', cookie: adminCookie, body: { checklist: [{ text: 'First step', checked: false }, { text: 'Final step', checked: false }] },
  });
  assert.equal(reset.body.status, 'Planned', 'clearing all checklist steps returns the item to Planned');
});
