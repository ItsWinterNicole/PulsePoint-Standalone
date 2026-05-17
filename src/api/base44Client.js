const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8787/api';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, options);
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) {
    const message = contentType.includes('application/json')
      ? JSON.stringify(await response.json())
      : await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }
  if (contentType.includes('audio/') || contentType.includes('application/octet-stream')) {
    return response;
  }
  return contentType.includes('application/json') ? response.json() : response.text();
}

function entityApi(entity) {
  return {
    list: (sort, limit, skip) => {
      const params = new URLSearchParams();
      if (sort) params.set('sort', sort);
      if (limit != null) params.set('limit', limit);
      if (skip != null) params.set('skip', skip);
      return request(`/entities/${entity}?${params.toString()}`);
    },
    filter: (criteria = {}, sort, limit, skip) => request(`/entities/${entity}/filter`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ criteria, sort, limit, skip }),
    }),
    create: (data) => request(`/entities/${entity}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data || {}),
    }),
    update: (id, data) => request(`/entities/${entity}/${encodeURIComponent(id)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data || {}),
    }),
    delete: (id) => request(`/entities/${entity}/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    bulkCreate: (rows) => request(`/entities/${entity}/bulk`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows }),
    }),
  };
}

const entityNames = [
  'Session', 'HeartRateTimeline', 'EMGTimeline', 'AudioExport', 'CompareAnalysisResult',
  'CascadeAnalysisResult', 'SessionClusterAnalysis', 'Journal', 'CustomMethod', 'User',
];

export const base44 = {
  entities: Object.fromEntries(entityNames.map((name) => [name, entityApi(name)])),
  auth: {
    me: () => request('/auth/me'),
    updateMe: (data) => request('/auth/me', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data || {}),
    }),
    logout: () => Promise.resolve(),
    redirectToLogin: () => Promise.resolve(),
  },
  integrations: {
    Core: {
      InvokeLLM: (payload) => request('/ai/invoke', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload || {}),
      }),
      UploadFile: async ({ file }) => {
        const form = new FormData();
        form.append('file', file);
        return request('/files/upload', { method: 'POST', body: form });
      },
    },
  },
  functions: {
    invoke: (name, payload) => request(`/functions/${name}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload || {}),
    }),
  },
};
