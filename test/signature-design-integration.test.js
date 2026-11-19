const assert = require('node:assert/strict');
const { createHash, createHmac } = require('node:crypto');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { after, before, test } = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const KEY_ID = 'signature-design-test-key';
const SECRET = 'local-only-test-secret-for-signature-design-receiver';
const PATHNAME = '/api/integrations/v1/signature-design/inquiries';
const SOURCE_WRITEBACK_PREFIX = '/api/integrations/v1/aspect-signature/inquiries/';
let dataDir;
let runtimeRoot;
let origin;
let portalProcess;
let processOutput = '';
let processError = null;
let adminCookie = '';
let signatureMemberCookie = '';
let signatureMemberIds = [];
let sourceStubServer;
let sourceStubOrigin = '';
const sourceRecords = new Map();
let sourceWritebackCount = 0;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function reservePort() {
  const server = http.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function api(pathname, { method = 'GET', body, cookie, headers = {} } = {}) {
  const requestHeaders = { ...headers };
  if (body !== undefined && !Object.keys(requestHeaders).some(key => key.toLowerCase() === 'content-type')) {
    requestHeaders['content-type'] = 'application/json';
  }
  if (cookie) requestHeaders.cookie = cookie;
  const response = await fetch(new URL(pathname, origin), {
    method,
    headers: requestHeaders,
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
  assert.equal(response.status, expected, action + ': ' + JSON.stringify(response.body) + '\n' + processOutput);
}

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function signedHeaders(payload, timestamp = String(Math.floor(Date.now() / 1000)), keyId = KEY_ID, secret = SECRET) {
  const digest = createHash('sha256').update(canonical(payload)).digest('hex');
  const message = 'v1\n' + timestamp + '\nPOST\n' + PATHNAME + '\n' + digest;
  return {
    'content-type': 'application/json',
    'x-signature-design-key-id': keyId,
    'x-signature-design-timestamp': timestamp,
    'x-signature-design-signature': createHmac('sha256', secret).update(message).digest('hex'),
  };
}

async function integrationPost(payload, headers = signedHeaders(payload)) {
  return api(PATHNAME, { method: 'POST', body: payload, headers });
}

async function openLiveUpdateStream(cookie) {
  const controller = new AbortController();
  const response = await fetch(new URL('/api/updates?clientId=signature-design-integration-test', origin), {
    headers: { accept: 'text/event-stream', cookie },
    signal: controller.signal,
  });
  assert.equal(response.status, 200, 'the signed-in portal user should receive a live update stream');
  return { reader: response.body.getReader(), close: () => controller.abort() };
}

async function waitForLiveUpdate(reader, predicate, timeoutMs = 4000) {
  const decoder = new TextDecoder();
  let buffered = '';
  while (true) {
    let timeout;
    let result;
    try {
      result = await Promise.race([
        reader.read(),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Timed out waiting for the Reception live update.')), timeoutMs); }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
    if (result.done) throw new Error('The live update stream closed before the Reception event arrived.');
    buffered += decoder.decode(result.value, { stream: true });
    const frames = buffered.split(/\r?\n\r?\n/);
    buffered = frames.pop() || '';
    for (const frame of frames) {
      const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
      if (!data) continue;
      const message = JSON.parse(data);
      if (predicate(message)) return message;
    }
  }
}

function payload(id, vision, sourceChannel = 'WEBSITE') {
  return {
    schemaVersion: 1,
    sourceSystem: 'signature-exteriors-design',
    sourceInquiryId: id,
    sourceCreatedAt: new Date().toISOString(),
    contact: { name: 'Synthetic ' + id, email: id + '@example.test', phone: '555-0199' },
    inquiry: {
      sourceChannel,
      referralName: 'Synthetic referral',
      projectVision: vision,
      property: { address: '123 Synthetic Test Lane', city: 'Scottsdale', state: 'AZ', postalCode: '85251' },
      description: 'Synthetic project details',
      objectives: 'Synthetic project objective',
      preliminaryScope: 'Synthetic requested scope',
      budgetExpectation: 'Synthetic budget',
      desiredTiming: 'Synthetic timing',
      clientCompany: 'Synthetic Test Company',
    },
  };
}

function payloadV2(id, vision = 'New pool', sourceRevision = 1) {
  const value = payload(id, vision);
  value.schemaVersion = 2;
  value.sourceRevision = sourceRevision;
  value.contact.company = 'Synthetic Test Company';
  value.inquiry.designInspirations = 'Synthetic inspiration';
  value.inquiry.property.jurisdiction = 'Synthetic jurisdiction';
  value.inquiry.property.hoaName = 'Synthetic HOA';
  value.sourceRecord = {
    updatedAt: new Date().toISOString(), intakeRevision: 1, legacyReviewStatus: 'PENDING', discoveryData: null, discoveryCompletedAt: null,
    siteAssessment: null, siteAssessmentData: null, romAmount: null, proposalNarrative: null, romProposalDetails: null, proposalProvidedAt: null,
    proposalClientResponse: null, romStatus: null, romDecisionAt: null, romApprovedBy: null, designAgreementStatus: null,
    designAgreementAcceptedAt: null, designAgreementAcceptedBy: null, handoffSummary: null, handoffApprovedAt: null, handoffApprovedBy: null,
    complianceVerificationStatus: null, complianceVerificationCheckedAt: null, complianceVerificationSource: null, complianceVerificationCategories: null,
    complianceVerificationLinks: null, complianceVerificationReviewedBy: null, complianceVerificationReviewedAt: null, complianceVerificationNotes: null,
    qualificationStatus: 'NEW', ownerId: null, nextAction: null, nextActionDueAt: null, declineReason: null, clientDisposition: null,
    clientDispositionComment: null, clientDispositionSource: null, clientDispositionAt: null, clientDispositionReviewStatus: null,
    clientDispositionReviewedAt: null, romPreviewSnapshot: null, romPreviewHash: null, romPreviewRevision: null, romPreviewSavedAt: null, convertedAt: null,
  };
  return value;
}

function payloadV3(id, sourceRevision = 1) {
  const value = payloadV2(id, 'New pool', sourceRevision);
  value.schemaVersion = 3;
  Object.assign(value.sourceRecord, {
    consultations: [{ title:'Synthetic site visit', activityType:'SITE_MEETING', status:'COMPLETED', notes:'Synthetic access notes' }],
    workItems: [{ stage:'INQUIRY', type:'TASK', title:'Confirm gate width', status:'OPEN', ownerName:'Synthetic Owner' }],
    criterionStates: [{ criterionId:'PROPERTY_ACCESS', answerState:'CONFIRMED', reason:'Synthetic clear access' }],
    complianceResearchJobs: [{ status:'COMPLETE', findings:{ rule:'Synthetic result' }, sources:[{ title:'Synthetic code', url:'https://example.test/code' }] }],
    savedComplianceLinks: [{ title:'Synthetic barrier rules', url:'https://example.test/barrier' }],
    project: { status:'PLANNING', poolType:'Synthetic pool', phases:[{ displayName:'Design', status:'IN_PROGRESS' }] },
  });
  return value;
}

function payloadV4(id, sourceRevision = 1) {
  const value = payloadV3(id, sourceRevision);
  value.schemaVersion = 4;
  Object.assign(value.sourceRecord, {
    createdAt: new Date().toISOString(), ownerName: 'Synthetic Owner',
    clientDispositionRecordedByName: null, clientDispositionReviewedByName: null, clientDispositionClientUserName: null,
  });
  Object.assign(value.sourceRecord.consultations[0], {
    id: 'synthetic-consultation-id', meetingMode: 'ONSITE', subject: 'Synthetic site visit', date: new Date().toISOString(),
    endAt: null, outcome: null, participants: 'Synthetic client', internalFollowers: null, nextAction: null,
    nextActionDueAt: null, cancellationReason: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), memberName: 'Synthetic Designer',
  });
  Object.assign(value.sourceRecord.workItems[0], {
    id: 'synthetic-work-item-id', criterionId: 'PROPERTY_ACCESS', description: null, priority: 'NORMAL', dueAt: null,
    clientVisible: false, completedAt: null, verifiedAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), reviewerName: null,
  });
  Object.assign(value.sourceRecord.criterionStates[0], {
    id: 'synthetic-criterion-state-id', source: 'ADMIN', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedByName: 'Synthetic Designer',
  });
  Object.assign(value.sourceRecord.complianceResearchJobs[0], {
    id: 'synthetic-research-job-id', progress: 100, querySummary: 'Synthetic local code', sourceCount: 1, errorMessage: null,
    startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });
  Object.assign(value.sourceRecord.complianceResearchJobs[0].sources[0], {
    id: 'synthetic-research-source-id', domain: 'example.test', excerpt: 'Synthetic source excerpt', authorityType: 'MUNICIPAL',
    authorityName: 'Synthetic City', retrievedAt: new Date().toISOString(),
  });
  Object.assign(value.sourceRecord.savedComplianceLinks[0], {
    id: 'synthetic-saved-link-id', domain: 'example.test', summary: 'Synthetic guide', authorityType: 'MUNICIPAL',
    authorityName: 'Synthetic City', addedAt: new Date().toISOString(),
  });
  Object.assign(value.sourceRecord.project, {
    id: 'synthetic-pool-project-id', poolShape: 'RECTANGLE', dimensions: '30 by 14 ft', estimatedBudget: '125000',
    notes: 'Synthetic project notes', currentPhase: 2, workflowEnabled: true, currentLifecycleStage: 'DESIGN', workflowVersion: 3,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });
  Object.assign(value.sourceRecord.project.phases[0], {
    id: 'synthetic-project-phase-id', name: 'DESIGN', order: 1, description: 'Synthetic design phase',
    startDate: new Date().toISOString(), completedDate: null, completedByName: 'Synthetic Designer',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    checklistItems: [{ id: 'synthetic-checklist-id', description: 'Confirm synthetic access', clientActionRequired: false, isCompleted: false,
      completedAt: null, completedByName: null, verificationStatus: 'NOT_SUBMITTED', submittedAt: null, verifiedAt: null,
      rejectionReason: null, order: 1, createdAt: new Date().toISOString() }],
  });
  return value;
}

async function startSourceStub() {
  sourceStubServer = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (request.method !== 'PATCH' || !url.pathname.startsWith(SOURCE_WRITEBACK_PREFIX)) { response.writeHead(404).end(); return; }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { response.writeHead(400).end(); return; }
    const timestamp = String(request.headers['x-aspect-signature-timestamp'] || ''), keyId = String(request.headers['x-aspect-signature-key-id'] || ''), signature = String(request.headers['x-aspect-signature-signature'] || '');
    const digest = createHash('sha256').update(canonical(body)).digest('hex'), message = `v1\n${timestamp}\nPATCH\n${url.pathname}\n${digest}`;
    const expected = createHmac('sha256', SECRET).update(message).digest('hex');
    if (keyId !== KEY_ID || Math.abs(Math.floor(Date.now()/1000) - Number(timestamp)) > 300 || signature !== expected) { response.writeHead(401).end(); return; }
    const sourceId = decodeURIComponent(url.pathname.slice(SOURCE_WRITEBACK_PREFIX.length)), current = sourceRecords.get(sourceId);
    if (!current || body.sourceInquiryId !== sourceId || body.targetIntakeId !== current.targetIntakeId) { response.writeHead(404).end(); return; }
    sourceWritebackCount++;
    if (body.expectedSourceRevision !== current.payload.sourceRevision) {
      response.writeHead(409, { 'content-type':'application/json' }).end(JSON.stringify({ error:'stale', sourceRevision:current.payload.sourceRevision, payload:current.payload })); return;
    }
    const details = body.details;
    current.payload.contact = structuredClone(details.contact);
    current.payload.inquiry = { ...current.payload.inquiry, ...structuredClone(details.inquiry), clientCompany:details.contact.company };
    if (details.inquiry.projectVision !== 'Other / needs discussion') current.payload.inquiry.description = null;
    else current.payload.inquiry.description = details.inquiry.description || 'Other / needs discussion';
    if (!details.inquiry.property) current.payload.inquiry.property = { address:'', city:'', state:'', postalCode:'', jurisdiction:'', hoaName:'' };
    if (body.schemaVersion === 4) current.payload.sourceRecord = structuredClone(body.sourceRecord);
    current.payload.sourceRevision++;
    current.payload.sourceRecord.intakeRevision++;
    current.payload.sourceRecord.updatedAt = new Date().toISOString();
    response.writeHead(200, { 'content-type':'application/json' }).end(JSON.stringify({ sourceRevision:current.payload.sourceRevision, payload:current.payload, duplicate:false }));
  });
  await new Promise((resolve, reject) => { sourceStubServer.once('error', reject); sourceStubServer.listen(0, '127.0.0.1', resolve); });
  sourceStubOrigin = `http://127.0.0.1:${sourceStubServer.address().port}`;
}

async function startPortal(enabled, writebackOrigin = '') {
  const port = await reservePort();
  origin = 'http://127.0.0.1:' + port;
  processOutput = '';
  portalProcess = spawn(process.execPath, ['server.js'], {
    cwd: runtimeRoot,
    env: {
      PATH: process.env.PATH || '',
      SystemRoot: process.env.SystemRoot || '',
      WINDIR: process.env.WINDIR || '',
      TEMP: os.tmpdir(),
      TMP: os.tmpdir(),
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: String(port),
      NODE_PATH: path.join(ROOT, 'node_modules'),
      ASPECT_DATA_DIR: dataDir,
      ASPECT_PILOT_MODE: '1',
      ASPECT_SETUP_TOKEN: '',
      ASPECT_OPEN_BROWSER: '0',
      PORTAL_PUBLIC_URL: '',
      PORTAL_LIVE_UPDATES: 'true',
      SMTP_HOST: '',
      SMTP_FROM: '',
      SMTP_USER: '',
      SMTP_PASS: '',
      SIGNATURE_DESIGN_INTEGRATION_ENABLED: enabled ? 'true' : 'false',
      SIGNATURE_DESIGN_WRITEBACK_ENABLED: writebackOrigin ? 'true' : 'false',
      SIGNATURE_DESIGN_WRITEBACK_BASE_URL: writebackOrigin,
      SIGNATURE_DESIGN_HMAC_KEY_ID: enabled ? KEY_ID : '',
      SIGNATURE_DESIGN_HMAC_SECRET: enabled ? SECRET : '',
      SIGNATURE_DESIGN_INQUIRY_ASSIGNEE_ID: '',
    },
    windowsHide: true,
  });
  for (const stream of [portalProcess.stdout, portalProcess.stderr]) {
    stream.setEncoding('utf8');
    stream.on('data', chunk => { processOutput = (processOutput + chunk).slice(-8000); });
  }
  portalProcess.once('error', error => { processError = error; });
  for (let attempt = 0; attempt < 900; attempt++) {
    if (processError) throw new Error('Could not start the isolated test portal.\n' + processError.message);
    if (portalProcess.exitCode !== null) throw new Error('Test portal exited during startup.\n' + processOutput);
    try {
      const response = await fetch(new URL('/api/health', origin));
      if (response.ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error('Test portal did not become healthy.\n' + processOutput);
}

async function waitForPortalExit(child, timeoutMs) {
  if (child.exitCode !== null) return true;
  return new Promise(resolve => {
    const timeout = setTimeout(() => {
      child.off('exit', onExit);
      resolve(false);
    }, timeoutMs);
    const onExit = () => {
      clearTimeout(timeout);
      resolve(true);
    };
    child.once('exit', onExit);
  });
}

async function stopPortal() {
  if (!portalProcess) return;
  if (portalProcess.exitCode === null) {
    portalProcess.kill('SIGTERM');
    if (!(await waitForPortalExit(portalProcess, 2000))) {
      portalProcess.kill('SIGKILL');
      if (!(await waitForPortalExit(portalProcess, 5000))) throw new Error('Test portal did not stop.\n' + processOutput);
    }
  }
  portalProcess = null;
}

before(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aspect-signature-design-'));
  runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aspect-signature-runtime-'));
  const serverSource = await fs.readFile(path.join(ROOT, 'server.js'), 'utf8');
  await fs.writeFile(path.join(runtimeRoot, 'server.js'), serverSource);
  await fs.cp(path.join(ROOT, 'public'), path.join(runtimeRoot, 'public'), { recursive: true });
  await startSourceStub();
  await startPortal(true, sourceStubOrigin);

  const setup = await api('/api/auth/setup', {
    method: 'POST',
    body: { name: 'Synthetic Test Admin', email: 'signature-integration-admin@example.test', password: 'Synthetic-Test-Admin-Password-2026!' },
  });
  assertStatus(setup, 201, 'create synthetic test administrator');
  adminCookie = setup.cookie;

  const selected = await api('/api/auth/select-company', {
    method: 'POST',
    cookie: adminCookie,
    body: { companySlug: 'aspect-companies' },
  });
  assertStatus(selected, 200, 'select root company');

  for (const [name, email] of [
    ['Synthetic Signature Member One', 'signature-member-one@example.test'],
    ['Synthetic Signature Member Two', 'signature-member-two@example.test'],
  ]) {
    const member = await api('/api/users', {
      method: 'POST',
      cookie: adminCookie,
      body: { name, email, role: 'member', companyIds: ['aspect-property'] },
    });
    assertStatus(member, 201, 'create direct Signature member');
    signatureMemberIds.push(member.body.id);
    assert.deepEqual(member.body.companyIds, ['aspect-property']);
    if (email === 'signature-member-one@example.test') {
      const login = await api('/api/auth/login', { method: 'POST', body: { email, password: member.body.temporaryPassword } });
      assertStatus(login, 200, 'sign in the synthetic Signature member');
      const passwordChanged = await api('/api/auth/password', {
        method: 'POST', cookie: login.cookie,
        body: { currentPassword: member.body.temporaryPassword, newPassword: 'Synthetic-Member-Test-Password-2026!' },
      });
      assertStatus(passwordChanged, 200, 'complete the synthetic member first-login flow');
      const selected = await api('/api/auth/select-company', {
        method: 'POST', cookie: login.cookie, body: { companySlug: 'signature-exteriors' },
      });
      assertStatus(selected, 200, 'select the member’s Signature Exteriors company portal');
      signatureMemberCookie = login.cookie;
    }
  }

});

after(async () => {
  try { await stopPortal(); }
  finally {
    if (sourceStubServer) await new Promise(resolve => sourceStubServer.close(resolve));
    if (dataDir) await fs.rm(dataDir, { recursive: true, force: true });
    if (runtimeRoot) await fs.rm(runtimeRoot, { recursive: true, force: true });
  }
});

test('Signature Design receiver validates requests, maps inquiry types, and safely deduplicates retries', async () => {
  const health = await api('/api/health');
  assertStatus(health, 200, 'health check');
  assert.equal(health.body.pilotMode, true);

  const sample = payload('synthetic-invalid-hmac', 'New pool');
  const invalidSignature = signedHeaders(sample);
  invalidSignature['x-signature-design-signature'] = '0'.repeat(64);
  assertStatus(await integrationPost(sample, invalidSignature), 401, 'invalid HMAC');

  const stale = payload('synthetic-stale-hmac', 'New pool');
  const staleTimestamp = String(Math.floor(Date.now() / 1000) - 301);
  assertStatus(await integrationPost(stale, signedHeaders(stale, staleTimestamp)), 401, 'expired timestamp');

  const wrongKeyId = payload('synthetic-wrong-key', 'New pool');
  assertStatus(await integrationPost(wrongKeyId, signedHeaders(wrongKeyId, undefined, 'wrong-key')), 401, 'wrong key ID');

  const unsupportedSource = payload('synthetic-unsupported-source', 'New pool');
  unsupportedSource.sourceSystem = 'unapproved-source';
  assertStatus(await integrationPost(unsupportedSource), 400, 'unapproved source system');

  const unsupportedVersion = payload('synthetic-unsupported-version', 'New pool');
  unsupportedVersion.schemaVersion = 5;
  assertStatus(await integrationPost(unsupportedVersion), 400, 'unsupported schema version');

  const unexpectedField = payload('synthetic-unexpected-field', 'New pool');
  unexpectedField.companyId = 'aspect-ventures';
  assertStatus(await integrationPost(unexpectedField), 400, 'caller-selected company field');

  const wrongContentType = await fetch(new URL(PATHNAME, origin), {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: '{}',
  });
  assert.equal(wrongContentType.status, 415);

  const cases = [
    ['synthetic-new-pool', 'New pool', 'New pool construction', 'PHONE', 'Phone'],
    ['synthetic-pool-remodel', 'Pool remodel', 'Pool renovation or resurfacing', 'SMS', 'Phone'],
    ['synthetic-spa-addition', 'Spa addition', 'Other', 'EMAIL', 'Email'],
    ['synthetic-outdoor-living', 'Outdoor living area', 'Outdoor living', 'WEBSITE', 'Website'],
    ['synthetic-pool-and-outdoor', 'Pool and outdoor living', 'Outdoor living', 'REFERRAL', 'Referral'],
    ['synthetic-water-feature', 'Water feature', 'Other', 'WALK_IN', 'Walk-in'],
    ['synthetic-landscape', 'Landscape project', 'Other', 'OTHER', 'Other'],
    ['synthetic-repair', 'Repair or renovation', 'Other', 'WEBSITE', 'Website'],
    ['synthetic-other', 'Other / needs discussion', 'Other', 'WEBSITE', 'Website'],
    ['synthetic-client-description', 'Other / needs discussion', 'Other', 'WEBSITE', 'Website', 'Client wants a lap pool and a small attached spa.'],
  ];
  const accepted = [];
  const liveUpdateStream = await openLiveUpdateStream(adminCookie);
  for (const [id, vision, requestType, sourceChannel, targetSource, projectDetails] of cases) {
    const testPayload = payload(id, vision, sourceChannel);
    if (projectDetails) testPayload.inquiry.description = projectDetails;
    const response = await integrationPost(testPayload);
    assertStatus(response, 201, 'create ' + id);
    assert.equal(response.body.companyId, 'aspect-property');
    assert.equal(response.body.sourceInquiryId, id);
    assert.equal(response.body.duplicate, false);
    accepted.push({ id, vision, requestType, sourceChannel, source: targetSource, intakeId: response.body.intakeId, payload: testPayload, projectDetails: testPayload.inquiry.description });
  }
  try {
    const receptionUpdate = await waitForLiveUpdate(liveUpdateStream.reader, message => message.topics?.includes('reception'));
    assert.deepEqual(receptionUpdate.topics, ['reception']);
    assert.equal(JSON.stringify(receptionUpdate).includes('synthetic-new-pool'), false, 'live update events must not include inquiry details');
  } finally {
    await liveUpdateStream.close();
  }

  const duplicate = await integrationPost(accepted[0].payload);
  assertStatus(duplicate, 200, 'identical retry');
  assert.equal(duplicate.body.duplicate, true);
  assert.equal(duplicate.body.intakeId, accepted[0].intakeId);

  const changedPayload = structuredClone(accepted[0].payload);
  changedPayload.inquiry.description = 'Changed payload for an existing source ID';
  assertStatus(await integrationPost(changedPayload), 409, 'changed payload retry');

  const database = new DatabaseSync(path.join(dataDir, 'portal.sqlite'), { readOnly: true });
  const rows = database.prepare(
    'SELECT i.id,i.company_id,i.contact_name,i.email,i.phone,i.source,i.request_type,i.status,i.summary,i.assignee_user_id,' +
    'o.source_system,o.source_record_id,o.source_channel,o.source_created_at,o.received_at,o.mapping_version FROM reception_intakes i ' +
    'JOIN reception_intake_origins o ON o.intake_id=i.id WHERE o.company_id=? AND o.source_system=? ORDER BY o.source_record_id'
  ).all('aspect-property', 'signature-exteriors-design');
  assert.equal(rows.length, cases.length, 'rejected requests and duplicate retries must not create extra intakes');
  for (const item of accepted) {
    const row = rows.find(candidate => candidate.source_record_id === item.id);
    assert.ok(row, item.id + ' should be stored');
    assert.equal(row.company_id, 'aspect-property');
    assert.equal(row.request_type, item.requestType);
    assert.equal(row.source, item.source);
    assert.equal(row.status, 'New');
    assert.equal(row.assignee_user_id, null, 'new inquiries should remain in the shared Reception queue');
    assert.equal(row.contact_name, 'Synthetic ' + item.id);
    assert.equal(row.source_system, 'signature-exteriors-design');
    assert.equal(row.source_channel, item.sourceChannel);
    assert.equal(row.mapping_version, 1);
    assert.ok(Date.parse(row.received_at));
    assert.equal(Date.parse(row.source_created_at), Date.parse(item.payload.sourceCreatedAt));
    assert.ok(row.summary.includes('Property: 123 Synthetic Test Lane, Scottsdale, AZ, 85251'));
    assert.ok(row.summary.includes('Project vision: ' + item.vision));
    assert.ok(row.summary.includes('Project details: ' + item.projectDetails));
    assert.match(row.summary, /Synthetic project objective/);
    assert.match(row.summary, /Synthetic requested scope/);
    assert.match(row.summary, /Synthetic budget/);
    assert.match(row.summary, /Synthetic timing/);
  }
  const companyIntakes = await api('/api/companies/aspect-property/reception-intakes', { cookie: adminCookie });
  assertStatus(companyIntakes, 200, 'Signature Exteriors intake list');
  const visibleImported = companyIntakes.body.filter(item => item.origin?.sourceSystem === 'signature-exteriors-design');
  assert.equal(visibleImported.length, cases.length);
  for (const item of accepted) {
    const visible = visibleImported.find(intake => intake.origin.sourceRecordId === item.id);
    assert.ok(visible, item.id + ' should be visible through the company reception API');
    assert.equal(visible.requestType, item.requestType);
    assert.equal(visible.origin.sourceChannel, item.sourceChannel);
    assert.equal(visible.origin.mappingVersion, 1);
    assert.equal(Date.parse(visible.origin.sourceCreatedAt), Date.parse(item.payload.sourceCreatedAt));
    assert.ok(Date.parse(visible.origin.receivedAt));
    assert.ok(visible.summary.includes('Property: 123 Synthetic Test Lane, Scottsdale, AZ, 85251'));
  }

  const intakeIds = accepted.map(item => item.intakeId);
  const marks = intakeIds.map(() => '?').join(',');
  const eventCount = database.prepare('SELECT COUNT(*) AS count FROM reception_intake_events WHERE intake_id IN (' + marks + ')').get(...intakeIds).count;
  const notificationRows = database.prepare(
    'SELECT entity_id,user_id FROM notifications WHERE company_id=? AND entity_type=? AND entity_id IN (' + marks + ')'
  ).all('aspect-property', 'intake', ...intakeIds);
  const eligibleRecipientIds = database.prepare(
    "SELECT DISTINCT u.id FROM users u LEFT JOIN memberships m ON m.user_id=u.id AND m.company_id=? WHERE u.active=1 AND (u.role='admin' OR m.active=1) ORDER BY u.id"
  ).all('aspect-property').map(row => row.id);
  const actor = database.prepare('SELECT id,active FROM users WHERE email=?').get('signature-design-integration@system.invalid');
  assert.equal(eventCount, cases.length);
  assert.equal(eligibleRecipientIds.some(id => signatureMemberIds.includes(id)), true);
  assert.equal(notificationRows.length, cases.length * eligibleRecipientIds.length, 'every active user with Signature portal access should be notified');
  for (const intakeId of intakeIds) {
    assert.deepEqual(notificationRows.filter(row => row.entity_id === intakeId).map(row => row.user_id).sort(), [...eligibleRecipientIds].sort());
  }
  assert.equal(actor.active, 0);
  database.close();

  const allUsers = await api('/api/users', { cookie: adminCookie });
  assertStatus(allUsers, 200, 'administrator user list');
  assert.equal(allUsers.body.some(user => user.email === 'signature-design-integration@system.invalid'), false);

  const companyUsers = await api('/api/company-users', { cookie: adminCookie });
  assertStatus(companyUsers, 200, 'company user list');
  assert.equal(companyUsers.body.some(user => user.email === 'signature-design-integration@system.invalid'), false);

  const actorLogin = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'signature-design-integration@system.invalid', password: 'not-a-usable-password' },
  });
  assertStatus(actorLogin, 401, 'system actor must not log in');
});

test('Version 3 imports the legacy structured Design inquiry snapshot', async () => {
  const sourceId = 'synthetic-design-structured-snapshot';
  const designPayload = payloadV3(sourceId);
  const created = await integrationPost(designPayload);
  assertStatus(created, 201, 'create v3 inquiry snapshot');
  const list = await api('/api/companies/aspect-property/reception-intakes', { cookie:adminCookie });
  assertStatus(list, 200, 'read v3 inquiry snapshot');
  const imported = list.body.find(item => item.id === created.body.intakeId);
  assert.ok(imported, 'the v3 inquiry should appear in the Signature Reception queue');
  assert.equal(imported.origin.mappingVersion, 3);
  assert.equal(imported.origin.sourcePayload.schemaVersion, 3);
  assert.equal(imported.origin.sourcePayload.sourceRecord.consultations[0].notes, 'Synthetic access notes');
  assert.equal(imported.origin.sourcePayload.sourceRecord.workItems[0].ownerName, 'Synthetic Owner');
  assert.equal(imported.origin.sourcePayload.sourceRecord.criterionStates[0].answerState, 'CONFIRMED');
  assert.equal(imported.origin.sourcePayload.sourceRecord.complianceResearchJobs[0].findings.rule, 'Synthetic result');
  assert.equal(Object.hasOwn(imported.origin.sourcePayload.sourceRecord, 'documents'), false, 'files stay in the Design portal');
  assert.equal(Object.hasOwn(imported.origin.sourcePayload.sourceRecord, 'criterionStateAudits'), false, 'history stays local');
});

test('Version 4 edits qualification, proposal, compliance, meetings, work items, and linked phases both ways', async () => {
  assert.ok(signatureMemberCookie, 'a Signature Exteriors member session should be available for the access check');
  const initialWritebackCount = sourceWritebackCount;
  const sourceId = 'synthetic-design-v4-bidirectional-workflow';
  const designPayload = payloadV4(sourceId);
  const created = await integrationPost(designPayload);
  assertStatus(created, 201, 'create v4 inquiry snapshot');
  sourceRecords.set(sourceId, { payload:structuredClone(designPayload), targetIntakeId:created.body.intakeId });
  const memberQueue = await api('/api/companies/aspect-property/reception-intakes', { cookie:signatureMemberCookie });
  assertStatus(memberQueue, 200, 'read the shared Signature queue as a company member');
  assert.ok(memberQueue.body.some(item => item.id === created.body.intakeId), 'a member with company access should see the imported Design inquiry');
  const workflow = structuredClone(designPayload.sourceRecord);
  workflow.discoveryData = { poolSize:'Synthetic 28 by 14 feet', siteConditions:'Synthetic flat lot' };
  workflow.siteAssessment = 'Synthetic slope and access review';
  workflow.qualificationStatus = 'QUALIFIED';
  workflow.romAmount = '142500';
  workflow.proposalNarrative = 'Synthetic Aspect-edited proposal narrative';
  workflow.complianceVerificationNotes = 'Synthetic verified compliance note';
  workflow.consultations[0].notes = 'Synthetic Aspect-edited meeting notes';
  workflow.workItems[0].title = 'Confirm access gate width';
  workflow.criterionStates[0].answerState = 'NEEDS_REVIEW';
  workflow.complianceResearchJobs[0].findings = { barrier:'Synthetic revised barrier rule' };
  workflow.savedComplianceLinks[0].summary = 'Synthetic revised code guide';
  workflow.project.phases[0].status = 'COMPLETED';
  workflow.project.phases[0].checklistItems[0].isCompleted = true;
  const details = {
    contact:{ name:designPayload.contact.name, company:designPayload.contact.company, email:designPayload.contact.email, phone:designPayload.contact.phone },
    inquiry:{ sourceChannel:designPayload.inquiry.sourceChannel, referralName:designPayload.inquiry.referralName, projectVision:designPayload.inquiry.projectVision,
      property:designPayload.inquiry.property, description:designPayload.inquiry.projectVision === 'Other / needs discussion' ? designPayload.inquiry.description : null, objectives:designPayload.inquiry.objectives,
      preliminaryScope:designPayload.inquiry.preliminaryScope, designInspirations:designPayload.inquiry.designInspirations,
      budgetExpectation:designPayload.inquiry.budgetExpectation, desiredTiming:designPayload.inquiry.desiredTiming },
  };
  const updated = await api(`/api/reception-intakes/${encodeURIComponent(created.body.intakeId)}/signature-design-details`, {
    method:'PATCH', cookie:signatureMemberCookie, body:{ expectedSourceRevision:1, details, sourceRecord:workflow },
  });
  assertStatus(updated, 200, 'write structured workflow data to the Design source');
  assert.equal(updated.body.sourceRevision, 2);
  assert.equal(sourceRecords.get(sourceId).payload.schemaVersion, 4);
  assert.equal(sourceRecords.get(sourceId).payload.sourceRecord.qualificationStatus, 'QUALIFIED');
  assert.equal(sourceRecords.get(sourceId).payload.sourceRecord.romAmount, '142500');
  assert.equal(sourceRecords.get(sourceId).payload.sourceRecord.consultations[0].notes, 'Synthetic Aspect-edited meeting notes');
  assert.equal(sourceRecords.get(sourceId).payload.sourceRecord.workItems[0].title, 'Confirm access gate width');
  assert.equal(sourceRecords.get(sourceId).payload.sourceRecord.complianceResearchJobs[0].findings.barrier, 'Synthetic revised barrier rule');
  assert.equal(sourceRecords.get(sourceId).payload.sourceRecord.project.phases[0].checklistItems[0].isCompleted, true);
  assert.equal(sourceWritebackCount, initialWritebackCount + 1, 'a member with company access should make one signed workflow writeback');
  const refreshed = await api('/api/companies/aspect-property/reception-intakes', { cookie:signatureMemberCookie });
  assertStatus(refreshed, 200, 'read back the v4 synchronized workflow as a company member');
  const latest = refreshed.body.find(item => item.id === created.body.intakeId);
  assert.equal(latest.origin.sourcePayload.sourceRecord.siteAssessment, 'Synthetic slope and access review');
  assert.equal(latest.origin.sourcePayload.sourceRecord.workItems[0].title, 'Confirm access gate width');
  assert.equal(latest.origin.syncRevision, 2);
  const duplicate = await api(`/api/reception-intakes/${encodeURIComponent(created.body.intakeId)}/signature-design-details`, {
    method:'PATCH', cookie:signatureMemberCookie, body:{ expectedSourceRevision:2, details, sourceRecord:workflow },
  });
  assertStatus(duplicate, 200, 'recognize an unchanged v4 workflow retry');
  assert.equal(duplicate.body.duplicate, true);
  assert.equal(sourceWritebackCount, initialWritebackCount + 1, 'an unchanged v4 retry should not write upstream again');
});

test('Aspect Signature edits sync to Design with revision checks and refresh conflicts safely', async () => {
  const initialWritebackCount = sourceWritebackCount;
  const sourceId = 'synthetic-bidirectional-inquiry';
  const designPayload = payloadV2(sourceId, 'New pool');
  const created = await integrationPost(designPayload);
  assertStatus(created, 201, 'create v2 inquiry with revisioned snapshot');
  assert.equal(created.body.sourceRevision, 1);
  sourceRecords.set(sourceId, { payload:structuredClone(designPayload), targetIntakeId:created.body.intakeId });

  const stream = await openLiveUpdateStream(adminCookie);
  const details = {
    contact:{ name:'Synthetic Updated Contact', company:'Synthetic Updated Company', email:'updated@example.test', phone:'555-0147' },
    inquiry:{
      sourceChannel:'REFERRAL', referralName:'Updated synthetic referral', projectVision:'Pool remodel',
      property:{ address:'456 Updated Test Avenue', city:null, state:null, postalCode:null, jurisdiction:null, hoaName:null },
      description:null, objectives:'Updated synthetic objective', preliminaryScope:'Updated synthetic scope',
      designInspirations:'Updated synthetic inspiration', budgetExpectation:'Updated synthetic budget', desiredTiming:'Updated synthetic timing',
    },
  };
  const updated = await api(`/api/reception-intakes/${encodeURIComponent(created.body.intakeId)}/signature-design-details`, {
    method:'PATCH', cookie:adminCookie, body:{ expectedSourceRevision:1, details },
  });
  assertStatus(updated, 200, 'write shared details to the Design source');
  assert.equal(updated.body.sourceRevision, 2);
  assert.equal(updated.body.intake.contactName, details.contact.name);
  assert.equal(updated.body.intake.organizationName, details.contact.company);
  assert.equal(updated.body.intake.origin.syncRevision, 2);
  assert.equal(sourceRecords.get(sourceId).payload.contact.email, details.contact.email);
  assert.equal(sourceRecords.get(sourceId).payload.inquiry.projectVision, 'Pool remodel');
  assert.equal(sourceWritebackCount, initialWritebackCount + 1, 'the target should make one signed upstream request');
  const liveUpdate = await waitForLiveUpdate(stream.reader, message => message.topics?.includes('reception'));
  assert.deepEqual(liveUpdate.topics, ['reception']);
  assert.equal(JSON.stringify(liveUpdate).includes(details.contact.email), false, 'live events must not contain inquiry details');
  await stream.close();

  const genericEdit = await api(`/api/reception-intakes/${encodeURIComponent(created.body.intakeId)}`, {
    method:'PATCH', cookie:adminCookie, body:{ summary:'Synthetic bypass attempt' },
  });
  assertStatus(genericEdit, 409, 'generic edits must not bypass bidirectional sync');

  const duplicate = await api(`/api/reception-intakes/${encodeURIComponent(created.body.intakeId)}/signature-design-details`, {
    method:'PATCH', cookie:adminCookie, body:{ expectedSourceRevision:2, details },
  });
  assertStatus(duplicate, 200, 'identical shared details should be idempotent');
  assert.equal(duplicate.body.duplicate, true);
  assert.equal(sourceWritebackCount, initialWritebackCount + 1, 'an unchanged retry should not call Design again');

  const latest = sourceRecords.get(sourceId);
  latest.payload.sourceRevision = 3;
  latest.payload.contact.name = 'Synthetic Concurrent Design Edit';
  latest.payload.inquiry.objectives = 'Updated in Design while Aspect was editing';
  const conflict = await api(`/api/reception-intakes/${encodeURIComponent(created.body.intakeId)}/signature-design-details`, {
    method:'PATCH', cookie:adminCookie, body:{ expectedSourceRevision:2, details:{ ...details, contact:{...details.contact,name:'Synthetic Aspect Conflict Edit'} } },
  });
  assertStatus(conflict, 409, 'stale edits should report a conflict');
  assert.equal(conflict.body.sourceRevision, 3);
  const refreshed = await api('/api/companies/aspect-property/reception-intakes', { cookie:adminCookie });
  assertStatus(refreshed, 200, 'read the refreshed target copy');
  const latestTarget = refreshed.body.find(item => item.id === created.body.intakeId);
  assert.equal(latestTarget.contactName, 'Synthetic Concurrent Design Edit');
  assert.equal(latestTarget.origin.syncRevision, 3);
  assert.equal(latestTarget.origin.sourcePayload.inquiry.objectives, 'Updated in Design while Aspect was editing');
});

test('Aspect edits accept v3 Design responses and preserve synchronized structured records', async () => {
  const sourceId = 'synthetic-v3-bidirectional-inquiry';
  const designPayload = payloadV3(sourceId);
  const created = await integrationPost(designPayload);
  assertStatus(created, 201, 'create v3 inquiry for two-way edit');
  sourceRecords.set(sourceId, { payload:structuredClone(designPayload), targetIntakeId:created.body.intakeId });

  const details = {
    contact:{ name:'Synthetic V3 Updated Contact', company:'Synthetic V3 Company', email:'v3-updated@example.test', phone:'555-0148' },
    inquiry:{
      sourceChannel:'REFERRAL', referralName:'Synthetic V3 referral', projectVision:'Pool remodel',
      property:{ address:'789 V3 Test Road', city:null, state:null, postalCode:null, jurisdiction:null, hoaName:null },
      description:null, objectives:'Synthetic v3 revised objectives', preliminaryScope:'Synthetic v3 revised scope',
      designInspirations:'Synthetic v3 revised inspiration', budgetExpectation:'Synthetic v3 revised budget', desiredTiming:'Synthetic v3 revised timing',
    },
  };
  const updated = await api(`/api/reception-intakes/${encodeURIComponent(created.body.intakeId)}/signature-design-details`, {
    method:'PATCH', cookie:adminCookie, body:{ expectedSourceRevision:1, details },
  });
  assertStatus(updated, 200, 'write shared details while accepting the v3 source snapshot');
  assert.equal(updated.body.sourceRevision, 2);
  assert.equal(updated.body.intake.origin.mappingVersion, 3);
  assert.equal(updated.body.intake.origin.sourcePayload.schemaVersion, 3);
  assert.equal(updated.body.intake.origin.sourcePayload.sourceRecord.consultations[0].title, 'Synthetic site visit');
  assert.equal(updated.body.intake.origin.sourcePayload.sourceRecord.workItems[0].title, 'Confirm gate width');
  assert.equal(sourceRecords.get(sourceId).payload.inquiry.objectives, details.inquiry.objectives);

  const latest = sourceRecords.get(sourceId);
  latest.payload.sourceRevision = 3;
  latest.payload.contact.name = 'Synthetic V3 Concurrent Design Edit';
  const conflict = await api(`/api/reception-intakes/${encodeURIComponent(created.body.intakeId)}/signature-design-details`, {
    method:'PATCH', cookie:adminCookie, body:{ expectedSourceRevision:2, details:{ ...details, contact:{ ...details.contact, name:'Synthetic V3 Stale Aspect Edit' } } },
  });
  assertStatus(conflict, 409, 'refresh a v3 source conflict');
  const refreshed = await api('/api/companies/aspect-property/reception-intakes', { cookie:adminCookie });
  assertStatus(refreshed, 200, 'read the refreshed v3 conflict copy');
  const latestTarget = refreshed.body.find(item => item.id === created.body.intakeId);
  assert.equal(latestTarget.contactName, 'Synthetic V3 Concurrent Design Edit');
  assert.equal(latestTarget.origin.syncRevision, 3);
  assert.equal(latestTarget.origin.sourcePayload.sourceRecord.consultations[0].title, 'Synthetic site visit');
});

test('Hostinger Compose forwards receiver settings with inbound writes disabled by default', async () => {
  const compose = await fs.readFile(path.join(ROOT, 'deploy', 'hostinger', 'docker-compose.yml'), 'utf8');
  assert.ok(compose.includes('SIGNATURE_DESIGN_INTEGRATION_ENABLED: ${SIGNATURE_DESIGN_INTEGRATION_ENABLED:-false}'));
  assert.ok(compose.includes('SIGNATURE_DESIGN_WRITEBACK_ENABLED: ${SIGNATURE_DESIGN_WRITEBACK_ENABLED:-false}'));
  assert.ok(compose.includes('SIGNATURE_DESIGN_WRITEBACK_BASE_URL: ${SIGNATURE_DESIGN_WRITEBACK_BASE_URL:-}'));
  assert.ok(compose.includes('SIGNATURE_DESIGN_HMAC_KEY_ID: ${SIGNATURE_DESIGN_HMAC_KEY_ID:-}'));
  assert.ok(compose.includes('SIGNATURE_DESIGN_HMAC_SECRET: ${SIGNATURE_DESIGN_HMAC_SECRET:-}'));
  assert.equal(compose.includes('SIGNATURE_DESIGN_INQUIRY_ASSIGNEE_ID'), false, 'delivery must not depend on one configured assignee');
});
