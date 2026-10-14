// Thin wrappers over the server's JSON API. Every call throws an Error with
// the server's own message, so screens can show it as-is.

async function call(method, url, body, headers = {}) {
  const init = { method, headers: { ...headers } };
  if (body !== undefined) {
    if (body instanceof Blob) init.body = body;
    else { init.body = JSON.stringify(body); init.headers['Content-Type'] = 'application/json'; }
  }
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${res.status} ${res.statusText}`);
  return data;
}

export const api = {
  addLink: (url) => call('POST', '/api/routines', { url }),
  upload: (file) => call('POST', '/api/routines/upload', file, {
    'Content-Type': file.type || 'video/mp4',
    'X-Filename': encodeURIComponent(file.name || 'My clip'),
  }),
  status: (id) => call('GET', `/api/routines/${id}`),
  library: () => call('GET', '/api/routines'),
  pose: (id) => call('GET', `/api/routines/${id}/pose`),
  savePose: (id, pose) => call('PUT', `/api/routines/${id}/pose`, pose),
  coach: (id, report) => call('POST', `/api/routines/${id}/coach`, { report }),
  config: () => call('GET', '/api/config'),
  scout: (refresh) => call('GET', `/api/scout${refresh ? '?refresh=1' : ''}`),
  scores: (id) => call('GET', `/api/routines/${id}/scores`),
  postScore: (id, entry) => call('POST', `/api/routines/${id}/scores`, entry),
};

export const mediaUrl = (id) => `/media/${id}`;
