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
  scout: (refresh, region) => call('GET', `/api/scout?${new URLSearchParams({ ...(refresh ? { refresh: '1' } : {}), ...(region ? { region } : {}) })}`),
  related: (id, q) => call('GET', `/api/routines/${id}/related${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  search: (q) => call('GET', `/api/search?q=${encodeURIComponent(q)}`),
  scores: (id) => call('GET', `/api/routines/${id}/scores`),
  postScore: (id, entry) => call('POST', `/api/routines/${id}/scores`, entry),
};

// Signed-in calls carry the profile's sign-in code.
const auth = (code) => ({ Authorization: `Bearer ${code}` });
export const account = {
  create: (name) => call('POST', '/api/profile', { name }),
  signIn: (code) => call('POST', '/api/session', { code }),
  me: (code) => call('GET', '/api/me', undefined, auth(code)),
  runs: (code, limit = 100) => call('GET', `/api/me/runs?limit=${limit}`, undefined, auth(code)),
  saveRun: (code, run) => call('POST', '/api/me/runs', { run }, auth(code)),
  rename: (code, name) => call('PATCH', '/api/me', { name }, auth(code)),
  remove: (code) => call('DELETE', '/api/me', undefined, auth(code)),
};

export const mediaUrl = (id) => `/media/${id}`;
