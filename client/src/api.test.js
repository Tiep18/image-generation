import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadApi() {
  vi.resetModules();
  return import('./api.js');
}

describe('api base url', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('uses the default local backend when VITE_API_BASE is not set', async () => {
    const api = await loadApi();

    expect(api.getZipUrl('batch-1')).toBe('http://127.0.0.1:3001/api/batches/batch-1/zip');
  });

  it('uses VITE_API_BASE when configured', async () => {
    vi.stubEnv('VITE_API_BASE', 'http://localhost:4000/');
    const api = await loadApi();

    expect(api.getZipUrl('batch-1')).toBe('http://localhost:4000/api/batches/batch-1/zip');
  });
});
