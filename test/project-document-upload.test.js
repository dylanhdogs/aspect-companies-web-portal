const assert = require('node:assert/strict');
const test = require('node:test');
const uploadProjectDocument = require('../public/project-document-upload.js');

test('project file upload keeps its starting project when the active project changes during file preparation', async () => {
  let activeProjectId = 'project-original';
  let finishReading;
  let sentRequest;
  const pendingRead = new Promise(resolve => { finishReading = resolve; });

  const upload = uploadProjectDocument({
    getProjectId: () => activeProjectId,
    file: { name: 'team-plan.pdf' },
    requestId: 'request-1',
    signal: new AbortController().signal,
    readFile: () => pendingRead,
    sendRequest: async (url, options, onProgress) => {
      sentRequest = { url, options, onProgress };
      return { ok: true };
    },
    onUploadProgress: () => {},
  });

  activeProjectId = 'project-next';
  finishReading('cGRmLWRhdGE=');
  assert.deepEqual(await upload, { ok: true });
  assert.equal(sentRequest.url, '/api/system-development/projects/project-original/documents');
  assert.deepEqual(JSON.parse(sentRequest.options.body), {
    name: 'team-plan.pdf',
    requestId: 'request-1',
    content: 'cGRmLWRhdGE=',
  });
});

test('project file upload does not send after cancellation during preparation', async () => {
  const controller = new AbortController();
  let sent = false;
  const readFile = (_file, _onProgress, signal) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('File preparation cancelled.')), { once: true });
  });

  const upload = uploadProjectDocument({
    getProjectId: () => 'project-1',
    file: { name: 'team-plan.pdf' },
    requestId: 'request-1',
    signal: controller.signal,
    readFile,
    sendRequest: async () => { sent = true; },
  });

  controller.abort();
  await assert.rejects(upload, /File preparation cancelled/);
  assert.equal(sent, false);
});
