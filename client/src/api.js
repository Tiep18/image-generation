const API_BASE = (import.meta.env.VITE_API_BASE || 'http://127.0.0.1:3001').replace(/\/$/, '');

async function readJson(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

export async function createBatch(payload) {
  const response = await fetch(`${API_BASE}/api/batches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(data.error || JSON.stringify(data));
  }
  return data;
}

export async function listBatches() {
  const response = await fetch(`${API_BASE}/api/batches`);
  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(data.error || JSON.stringify(data));
  }
  return data.batches || [];
}

export async function listImageModels({ routerUrl, apiKey }) {
  const params = new URLSearchParams({ routerUrl, apiKey });
  const response = await fetch(`${API_BASE}/api/models/image?${params.toString()}`);
  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(data.error || JSON.stringify(data));
  }
  return data.models || [];
}

export async function getBatch(batchId) {
  const response = await fetch(`${API_BASE}/api/batches/${batchId}`);
  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(data.error || JSON.stringify(data));
  }
  return data;
}

export async function deleteBatch(batchId) {
  const response = await fetch(`${API_BASE}/api/batches/${batchId}`, { method: 'DELETE' });
  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(data.error || JSON.stringify(data));
  }
  return data;
}

export async function updateBatchMetadata(batchId, metadata) {
  const response = await fetch(`${API_BASE}/api/batches/${batchId}/metadata`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metadata)
  });
  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(data.error || JSON.stringify(data));
  }
  return data;
}

export async function postBatchAction(path, body = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(data.error || JSON.stringify(data));
  }
  return data;
}

export function getZipUrl(batchId, options = {}) {
  const params = new URLSearchParams();
  if (options.reviewStatus) {
    params.set('reviewStatus', options.reviewStatus);
  }
  const query = params.toString();
  return `${API_BASE}/api/batches/${batchId}/zip${query ? `?${query}` : ''}`;
}

export function getOutputUrl(batchId, filename) {
  return `${API_BASE}/outputs/${batchId}/${filename}`;
}
