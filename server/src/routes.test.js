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
      generateImage: vi.fn(async () => Buffer.from([1, 2, 3])),
      listImageModels: vi.fn(async () => [{ id: 'model-a' }, { id: 'model-b' }])
    };
    return {
      app: createApp({ outputRoot, routerClient }),
      routerClient
    };
  }

  async function waitForBatchStatus(app, batchId, expectedStatus = 'done') {
    const deadline = Date.now() + 1000;

    while (Date.now() < deadline) {
      const response = await request(app).get(`/api/batches/${batchId}`).expect(200);
      if (response.body.status === expectedStatus) {
        return response;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    return request(app).get(`/api/batches/${batchId}`).expect(200);
  }

  it('validates batch input', async () => {
    const { app } = await createTestApp();

    const response = await request(app)
      .post('/api/validate')
      .send([{ screen: 'home', prompt: 'Create a home screen' }])
      .expect(200);

    expect(response.body.ok).toBe(true);
    expect(response.body.items[0].safeName).toBe('001_home');
  });

  it('lists image models through 9Router client', async () => {
    const { app, routerClient } = await createTestApp();

    const response = await request(app)
      .get('/api/models/image')
      .query({ routerUrl: 'http://localhost:20128', apiKey: 'secret' })
      .expect(200);

    expect(response.body.models).toEqual([{ id: 'model-a' }, { id: 'model-b' }]);
    expect(routerClient.listImageModels).toHaveBeenCalledWith({
      routerUrl: 'http://localhost:20128',
      apiKey: 'secret',
      timeoutMs: 300000
    });
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

    const fetched = await waitForBatchStatus(app, created.body.id);
    expect(fetched.body.items[0].status).toBe('done');
    expect(fetched.body.items[0].versions[0].filename).toBe('001_home.png');
  });

  it('lists batch history summaries newest first', async () => {
    const { app } = await createTestApp();

    const first = await request(app)
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

    const second = await request(app)
      .post('/api/batches')
      .send({
        settings: {
          routerUrl: 'http://localhost:20128',
          apiKey: '',
          model: 'model-b',
          concurrency: 1,
          autoRetries: 0,
          timeoutMs: 300000
        },
        items: [
          { screen: 'home', prompt: 'Create a home screen' },
          { screen: 'checkout', prompt: 'Create a checkout screen' }
        ]
      })
      .expect(201);

    await waitForBatchStatus(app, second.body.id);

    const response = await request(app).get('/api/batches').expect(200);

    expect(response.body.batches.map((batch) => batch.id)).toEqual([second.body.id, first.body.id]);
    expect(response.body.batches[0]).toEqual(
      expect.objectContaining({
        id: second.body.id,
        model: 'model-b',
        total: 2,
        done: 2,
        failed: 0
      })
    );
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

    await waitForBatchStatus(app, created.body.id);

    const response = await request(app).get(`/api/batches/${created.body.id}/zip`).expect(200);
    expect(response.headers['content-type']).toContain('application/zip');
    expect(response.headers['content-disposition']).toContain(`${created.body.id}.zip`);
  });

  it('validates approved zip downloads when selected done items are not approved', async () => {
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

    await waitForBatchStatus(app, created.body.id);

    const initial = await request(app)
      .get(`/api/batches/${created.body.id}/zip`)
      .query({ reviewStatus: 'approved' })
      .expect(200);
    expect(initial.headers['content-type']).toContain('application/zip');

    await request(app)
      .post(`/api/batches/${created.body.id}/items/item-1/regenerate`)
      .send({ prompt: 'Create another home screen' })
      .expect(200);
    await waitForBatchStatus(app, created.body.id);

    await request(app)
      .get(`/api/batches/${created.body.id}/zip`)
      .query({ reviewStatus: 'approved' })
      .expect(400)
      .expect(({ body }) => {
        expect(body.error).toContain('not approved');
      });

    await request(app)
      .post(`/api/batches/${created.body.id}/items/item-1/review-version`)
      .send({ versionId: 'v2', reviewStatus: 'approved' })
      .expect(200);

    const response = await request(app)
      .get(`/api/batches/${created.body.id}/zip`)
      .query({ reviewStatus: 'approved' })
      .expect(200);

    expect(response.headers['content-type']).toContain('application/zip');
  });

  it('updates image version review status', async () => {
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

    await waitForBatchStatus(app, created.body.id);

    const updated = await request(app)
      .post(`/api/batches/${created.body.id}/items/item-1/review-version`)
      .send({ versionId: 'v1', reviewStatus: 'approved' })
      .expect(200);

    expect(updated.body.items[0].versions[0].reviewStatus).toBe('approved');
  });

  it('deletes a batch and removes it from history', async () => {
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

    await request(app).delete(`/api/batches/${created.body.id}`).expect(200);

    const history = await request(app).get('/api/batches').expect(200);
    expect(history.body.batches).toEqual([]);
  });

  it('updates batch display metadata and includes it in history', async () => {
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

    const updated = await request(app)
      .patch(`/api/batches/${created.body.id}/metadata`)
      .send({ name: 'Launch screens', note: 'First pass for checkout flow' })
      .expect(200);

    expect(updated.body.name).toBe('Launch screens');
    expect(updated.body.note).toBe('First pass for checkout flow');

    const history = await request(app).get('/api/batches').expect(200);
    expect(history.body.batches[0]).toEqual(
      expect.objectContaining({
        name: 'Launch screens',
        note: 'First pass for checkout flow'
      })
    );
  });
});
