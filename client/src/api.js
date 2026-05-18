const API_BASE = 'http://127.0.0.1:3001';

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

export async function getBatch(batchId) {
  const response = await fetch(`${API_BASE}/api/batches/${batchId}`);
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

export function getZipUrl(batchId) {
  return `${API_BASE}/api/batches/${batchId}/zip`;
}

export function getOutputUrl(batchId, filename) {
  return `${API_BASE}/outputs/${batchId}/${filename}`;
}
