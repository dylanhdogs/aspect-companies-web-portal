(function (root, factory) {
  const uploadProjectDocument = factory();
  if (typeof module === 'object' && module.exports) module.exports = uploadProjectDocument;
  else root.uploadProjectDocument = uploadProjectDocument;
})(typeof globalThis === 'undefined' ? this : globalThis, function () {
  return async function uploadProjectDocument({ getProjectId, file, requestId, signal, readFile, sendRequest, onReadProgress, onUploadProgress }) {
    const projectId = String(getProjectId?.() || '');
    if (!projectId) throw new Error('Save the project before uploading a file.');

    const content = await readFile(file, onReadProgress, signal);
    if (signal?.aborted) throw new Error('Upload cancelled.');

    const url = `/api/system-development/projects/${encodeURIComponent(projectId)}/documents`;
    const body = JSON.stringify({ name: file.name, requestId, content });
    return sendRequest(url, { method: 'POST', body, signal }, onUploadProgress);
  };
});
