const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { after, before, test } = require('node:test');

const ROOT = path.resolve(__dirname, '..');
let dataDir;
let origin;
let portalPort;
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

async function startPortal() {
  portalPort = await reservePort();
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
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Test portal did not become healthy.\n${processOutput}`);
}

async function stopPortal() {
  if (!portalProcess || portalProcess.exitCode !== null) return;
  portalProcess.kill('SIGTERM');
  await Promise.race([once(portalProcess, 'exit'), new Promise(resolve => setTimeout(resolve, 3000))]);
  if (portalProcess.exitCode === null) portalProcess.kill();
}

async function apiAt(baseUrl, pathname, { method = 'GET', body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookie) headers.cookie = cookie;
  const response = await fetch(new URL(pathname, baseUrl), {
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

async function openLiveUpdateStream(cookie) {
  const controller = new AbortController();
  const response = await fetch(new URL(`/api/updates?clientId=${randomUUID()}`, origin), {
    headers: { accept: 'text/event-stream', cookie },
    signal: controller.signal,
  });
  assert.equal(response.status, 200, 'participant should have an active live-update stream');
  return {
    reader: response.body.getReader(),
    close: async () => {
      controller.abort();
      try { await response.body.cancel(); } catch {}
    },
  };
}

async function waitForUpdate(reader, predicate, timeoutMs = 4000) {
  const decoder = new TextDecoder();
  let buffered = '';
  const readUntilMatch = async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) throw new Error('Live-update stream closed before the expected event arrived.');
      buffered += decoder.decode(value, { stream: true });
      const frames = buffered.split(/\r?\n\r?\n/);
      buffered = frames.pop() || '';
      for (const frame of frames) {
        const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
        if (!data) continue;
        const message = JSON.parse(data);
        if (predicate(message)) return message;
      }
    }
  };
  let timeout;
  try {
    return await Promise.race([
      readUntilMatch(),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Timed out waiting for a live-update event.')), timeoutMs); }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

function assertStatus(response, expected, action) {
  assert.equal(response.status, expected, `${action}: ${JSON.stringify(response.body)}\n${processOutput}`);
}

async function makeResponseDropProxy(pathToDrop) {
  let dropped = false;
  let resolveDrop;
  const droppedResponse = new Promise(resolve => { resolveDrop = resolve; });
  const server = http.createServer((clientRequest, clientResponse) => {
    const upstream = http.request({
      hostname: '127.0.0.1',
      port: portalPort,
      path: clientRequest.url,
      method: clientRequest.method,
      headers: { ...clientRequest.headers, host: `127.0.0.1:${portalPort}` },
    }, upstreamResponse => {
      if (!dropped && clientRequest.method === 'POST' && clientRequest.url === pathToDrop) {
        dropped = true;
        upstreamResponse.resume();
        upstreamResponse.once('end', () => {
          clientResponse.destroy();
          resolveDrop();
        });
        return;
      }
      clientResponse.writeHead(upstreamResponse.statusCode, upstreamResponse.headers);
      upstreamResponse.pipe(clientResponse);
    });
    upstream.once('error', error => {
      if (!clientResponse.destroyed) clientResponse.destroy(error);
    });
    clientRequest.once('aborted', () => upstream.destroy());
    clientRequest.pipe(upstream);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    droppedResponse,
    close: async () => {
      const closed = once(server, 'close');
      server.close();
      await closed;
    },
  };
}

function countRows(sql, ...parameters) {
  const database = new DatabaseSync(path.join(dataDir, 'portal.sqlite'));
  try {
    return database.prepare(sql).get(...parameters).count;
  } finally {
    database.close();
  }
}

before(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aspect-portal-mobile-resilience-'));
  await startPortal();
});

after(async () => {
  await stopPortal();
  if (dataDir && path.basename(dataDir).startsWith('aspect-portal-mobile-resilience-')) {
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});

test('discussion/file retries are safe and project access revocation reaches active sessions', async () => {
  const setup = await apiAt(origin, '/api/auth/setup', {
    method: 'POST',
    body: {
      name: 'Mobile Resilience Administrator',
      email: 'mobile-resilience-admin@example.test',
      password: 'Mobile-resilience-password-2030!',
    },
  });
  assertStatus(setup, 201, 'create isolated test administrator');
  const cookie = setup.cookie;

  const deniedAdminProjects = await apiAt(origin, '/api/system-development', { cookie });
  assertStatus(deniedAdminProjects, 404, 'deny Projects access to a platform administrator without an explicit grant');
  const ungrantedAdminStream = await openLiveUpdateStream(cookie);
  try {
    const ungrantedAccessState = await waitForUpdate(ungrantedAdminStream.reader, message => message.collaborationAccessChanged?.hasAccess === false);
    assert.deepEqual(ungrantedAccessState.collaborationAccessChanged, { hasAccess: false }, 'reconcile stale browser access when a live session reconnects');
  } finally {
    await ungrantedAdminStream.close();
  }
  const adminProjectAccess = await apiAt(origin, `/api/admin/system-development-members/${encodeURIComponent(setup.body.user.id)}`, {
    method: 'PATCH', cookie, body: { access: true },
  });
  assertStatus(adminProjectAccess, 200, 'grant Projects access explicitly to the platform administrator');

  const createdProject = await apiAt(origin, '/api/system-development/projects', {
    method: 'POST', cookie,
    body: { title: 'Mobile retry resilience sample', purpose: 'Verify safe retries.' },
  });
  assertStatus(createdProject, 201, 'create isolated test project');
  const projectId = createdProject.body.id;

  const postPath = `/api/system-development/projects/${encodeURIComponent(projectId)}/posts`;
  const postBody = { body: 'A collaboration update sent before the connection dropped.', parentId: null, requestId: randomUUID() };
  const postProxy = await makeResponseDropProxy(postPath);
  try {
    await assert.rejects(apiAt(postProxy.origin, postPath, { method: 'POST', cookie, body: postBody }));
    await postProxy.droppedResponse;
  } finally {
    await postProxy.close();
  }

  const retriedPost = await apiAt(origin, postPath, { method: 'POST', cookie, body: postBody });
  assertStatus(retriedPost, 200, 'retry update with its original request ID');
  const duplicatePost = await apiAt(origin, postPath, { method: 'POST', cookie, body: postBody });
  assertStatus(duplicatePost, 200, 'repeat update request after successful retry');
  assert.equal(duplicatePost.body.id, retriedPost.body.id);
  assert.equal(countRows('SELECT COUNT(*) AS count FROM system_development_project_posts WHERE project_id=?', projectId), 1);
  assert.equal(countRows('SELECT COUNT(*) AS count FROM system_development_project_events WHERE project_id=? AND detail=?', projectId, 'Posted an update in the collaboration project.'), 1);

  const initialDiscussion = await apiAt(origin, postPath, { cookie });
  assertStatus(initialDiscussion, 200, 'load project discussion after reconnect');
  assert.deepEqual(initialDiscussion.body.posts.map(post => post.id), [retriedPost.body.id]);
  const replyBody = { body: 'A reply added while the other session was away.', parentId: retriedPost.body.id, requestId: randomUUID() };
  const postedReply = await apiAt(origin, postPath, { method: 'POST', cookie, body: replyBody });
  assertStatus(postedReply, 201, 'add a reply for discussion catch-up');
  const caughtUpDiscussion = await apiAt(origin, `${postPath}?since=${encodeURIComponent(retriedPost.body.createdAt)}`, { cookie });
  assertStatus(caughtUpDiscussion, 200, 'fetch posts since the last displayed discussion update');
  assert.ok(caughtUpDiscussion.body.posts.some(post => post.id === postedReply.body.id));
  assert.equal(caughtUpDiscussion.body.posts.find(post => post.id === postedReply.body.id).parentId, retriedPost.body.id);
  const invalidDiscussionCursor = await apiAt(origin, `${postPath}?since=not-a-date`, { cookie });
  assertStatus(invalidDiscussionCursor, 400, 'reject an invalid discussion catch-up cursor');
  const anonymousDiscussion = await apiAt(origin, postPath);
  assert.equal(anonymousDiscussion.status, 401, 'require sign-in to read a project discussion');

  const conflictPost = await apiAt(origin, postPath, {
    method: 'POST', cookie,
    body: { ...postBody, body: 'Different content must not reuse the old request ID.' },
  });
  assertStatus(conflictPost, 409, 'reject a conflicting update with a reused request ID');

  const filePath = `/api/system-development/projects/${encodeURIComponent(projectId)}/documents`;
  const fileBytes = Buffer.from('A small synthetic project file for mobile retry testing.\n');
  const fileBody = { name: 'mobile-retry-sample.txt', requestId: randomUUID(), content: fileBytes.toString('base64') };
  const fileProxy = await makeResponseDropProxy(filePath);
  try {
    await assert.rejects(apiAt(fileProxy.origin, filePath, { method: 'POST', cookie, body: fileBody }));
    await fileProxy.droppedResponse;
  } finally {
    await fileProxy.close();
  }

  const retriedFile = await apiAt(origin, filePath, { method: 'POST', cookie, body: fileBody });
  assertStatus(retriedFile, 200, 'retry upload with its original request ID');
  const duplicateFile = await apiAt(origin, filePath, { method: 'POST', cookie, body: fileBody });
  assertStatus(duplicateFile, 200, 'repeat upload request after successful retry');
  assert.equal(duplicateFile.body.id, retriedFile.body.id);
  assert.equal(countRows('SELECT COUNT(*) AS count FROM system_development_project_documents WHERE project_id=?', projectId), 1);
  assert.equal(countRows('SELECT COUNT(*) AS count FROM system_development_project_events WHERE project_id=? AND detail=?', projectId, 'Shared file added: mobile-retry-sample.txt.'), 1);

  const conflictFile = await apiAt(origin, filePath, {
    method: 'POST', cookie,
    body: { ...fileBody, content: Buffer.from('Different file content.\n').toString('base64') },
  });
  assertStatus(conflictFile, 409, 'reject different file contents with a reused request ID');

  const portals = await apiAt(origin, '/api/auth/portals', { cookie });
  assertStatus(portals, 200, 'load administrator portals for participant setup');
  const rootPortal = portals.body.find(portal => !portal.parentId);
  assert.ok(rootPortal, 'the isolated test installation should provide an organization portal');
  const selectedRoot = await apiAt(origin, '/api/auth/select-company', {
    method: 'POST', cookie, body: { companySlug: rootPortal.slug },
  });
  assertStatus(selectedRoot, 200, 'select the organization portal before adding a teammate');

  const participantCreated = await apiAt(origin, '/api/company-users', {
    method: 'POST', cookie,
    body: { name: 'Mobile Project Participant', email: 'mobile-project-participant@example.test' },
  });
  assertStatus(participantCreated, 201, 'create a project participant');
  const participantLogin = await apiAt(origin, '/api/auth/login', {
    method: 'POST',
    body: { email: 'mobile-project-participant@example.test', password: participantCreated.body.temporaryPassword },
  });
  assertStatus(participantLogin, 200, 'sign in as the project participant');
  const participantPassword = 'Mobile-project-participant-password-2030!';
  const passwordChanged = await apiAt(origin, '/api/auth/password', {
    method: 'POST', cookie: participantLogin.cookie,
    body: { currentPassword: participantCreated.body.temporaryPassword, newPassword: participantPassword },
  });
  assertStatus(passwordChanged, 200, 'finish participant account setup');
  const selectedParticipantPortal = await apiAt(origin, '/api/auth/select-company', {
    method: 'POST', cookie: participantLogin.cookie, body: { companySlug: rootPortal.slug },
  });
  assertStatus(selectedParticipantPortal, 200, 'select the participant organization portal');
  const participant = { id: participantCreated.body.id, cookie: participantLogin.cookie };
  const globalAccess = await apiAt(origin, `/api/admin/system-development-members/${encodeURIComponent(participant.id)}`, {
    method: 'PATCH', cookie, body: { access: true },
  });
  assertStatus(globalAccess, 200, 'grant Collaboration access to the participant');
  const deniedDiscussion = await apiAt(origin, postPath, { cookie: participant.cookie });
  assertStatus(deniedDiscussion, 404, 'deny discussion access before the participant is added to the project');

  const projectPath = `/api/system-development/projects/${encodeURIComponent(projectId)}`;
  const participantStream = await openLiveUpdateStream(participant.cookie);
  try {
    const addedParticipant = await apiAt(origin, projectPath, {
      method: 'PATCH', cookie,
      body: { memberUserIds: [createdProject.body.createdByUserId, participant.id] },
    });
    assertStatus(addedParticipant, 200, 'add participant to project');
    const accessGranted = await waitForUpdate(participantStream.reader, message => message.projectAccessChanged?.projectId === projectId);
    assert.deepEqual(accessGranted.projectAccessChanged, { projectId, accessible: true });

    const readableFile = await fetch(new URL(`/api/system-development/documents/${encodeURIComponent(retriedFile.body.id)}/download`, origin), { headers: { cookie: participant.cookie } });
    assert.equal(readableFile.status, 200, 'confirm the participant can access a shared project file');
    assert.equal(await readableFile.text(), fileBytes.toString());

    const removedParticipant = await apiAt(origin, projectPath, {
      method: 'PATCH', cookie,
      body: { memberUserIds: [createdProject.body.createdByUserId] },
    });
    assertStatus(removedParticipant, 200, 'remove participant from project');
    const accessRevoked = await waitForUpdate(participantStream.reader, message => message.projectAccessChanged?.projectId === projectId);
    assert.deepEqual(accessRevoked.projectAccessChanged, { projectId, accessible: false });
    const removedDiscussion = await apiAt(origin, postPath, { cookie: participant.cookie });
    assertStatus(removedDiscussion, 404, 'deny discussion catch-up after project access is removed');

    const visibleProjects = await apiAt(origin, '/api/system-development', { cookie: participant.cookie });
    assertStatus(visibleProjects, 200, 'load projects after access was removed');
    assert.equal(visibleProjects.body.projects.some(project => project.id === projectId), false);
    const deniedFile = await apiAt(origin, `/api/system-development/documents/${encodeURIComponent(retriedFile.body.id)}/download`, { cookie: participant.cookie });
    assertStatus(deniedFile, 404, 'deny a stale project-file link after access was removed');
    const participantNotifications = await apiAt(origin, '/api/notifications', { cookie: participant.cookie });
    assertStatus(participantNotifications, 200, 'refresh notifications after project access was removed');
    assert.equal(participantNotifications.body.notifications.some(notification => notification.entityId === projectId), false);

    const restoredParticipant = await apiAt(origin, projectPath, {
      method: 'PATCH', cookie,
      body: { memberUserIds: [createdProject.body.createdByUserId, participant.id] },
    });
    assertStatus(restoredParticipant, 200, 'restore project access for global-access revocation check');
    await waitForUpdate(participantStream.reader, message => message.projectAccessChanged?.projectId === projectId);

    const revokedGlobalAccess = await apiAt(origin, `/api/admin/system-development-members/${encodeURIComponent(participant.id)}`, {
      method: 'PATCH', cookie, body: { access: false },
    });
    assertStatus(revokedGlobalAccess, 200, 'remove the participant from Collaboration');
    const globalAccessEvent = await waitForUpdate(participantStream.reader, message => Object.hasOwn(message, 'collaborationAccessChanged'));
    assert.deepEqual(globalAccessEvent.collaborationAccessChanged, { hasAccess: false });
    const deniedCollaboration = await apiAt(origin, '/api/system-development', { cookie: participant.cookie });
    assertStatus(deniedCollaboration, 404, 'deny Collaboration after global access was removed');
    const globallyRevokedDiscussion = await apiAt(origin, postPath, { cookie: participant.cookie });
    assertStatus(globallyRevokedDiscussion, 404, 'deny discussion catch-up after global Collaboration access is removed');
  } finally {
    await participantStream.close();
  }
});
