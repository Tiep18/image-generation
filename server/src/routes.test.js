import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';

describe('routes', () => {
  async function createTestApp() {
    const outputRoot = await mkdtemp(path.join(tmpdir(), 'batch-routes-'));
    const routerClient = {
      generateImage: vi.fn(async () => Buffer.from([1, 2, 3]))
    };
    return {
      app: createApp({ outputRoot, routerClient }),
      routerClient
    };
  }

  it('validates batch input', async () => {
    const { app } = await createTestApp();

    const response = await request(app)
      .post('/api/validate')
      .send([{ screen: 'home', prompt: 'Create a home screen' }])
      .expect(200);

    expect(response.body.ok).toBe(true);
    expect(response.body.items[0].safeName).toBe('home');
  });

  it('creates and reads a generated batch', async () => {
    const { app } = await createTestApp();

    const created = await request(app)
      .post('/api/batches')
      .send({
        settings: {
          routerUrl: 'http://localhost:20128',
          apiKey: '',
          model: 'model-a',
          size: '1024x1024',
          quality: 'standard',
          concurrency: 1,
          autoRetries: 0,
          timeoutMs: 300000,
          promptPrefix: '',
          promptSuffix: '',
          negativePrompt: ''
        },
        items: [{ screen: 'home', prompt: 'Create a home screen' }]
      })
      .expect(201);

    await new Promise((resolve) => setTimeout(resolve, 20));

    const fetched = await request(app).get(`/api/batches/${created.body.id}`).expect(200);
    expect(fetched.body.items[0].status).toBe('done');
    expect(fetched.body.items[0].versions[0].filename).toBe('home.png');
  });

  it('downloads a zip for selected versions', async () => {
    const { app } = await createTestApp();

    const created = await request(app)
      .post('/api/batches')
      .send({
        settings: {
          routerUrl: 'http://localhost:20128',
          apiKey: '',
          model: 'model-a',
          concurrency: 1,
          autoRetries: 0,
          timeoutMs: 300000
        },
        items: [{ screen: 'home', prompt: 'Create a home screen' }]
      })
      .expect(201);

    await new Promise((resolve) => setTimeout(resolve, 20));

    const response = await request(app).get(`/api/batches/${created.body.id}/zip`).expect(200);
    expect(response.headers['content-type']).toContain('application/zip');
    expect(response.headers['content-disposition']).toContain(`${created.body.id}.zip`);
  });
});
