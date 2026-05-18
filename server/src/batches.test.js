import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createBatchService } from './batches.js';
import { createBatchStore } from './store.js';

function baseSettings(overrides = {}) {
  return {
    routerUrl: 'http://localhost:20128',
    apiKey: '',
    model: 'model-a',
    size: '1024x1024',
    quality: 'standard',
    concurrency: 2,
    autoRetries: 1,
    timeoutMs: 300000,
    promptPrefix: '',
    promptSuffix: '',
    negativePrompt: '',
    ...overrides
  };
}

function sampleItems() {
  return [
    { id: 'item-1', screen: 'one', safeName: 'one', prompt: 'one prompt' },
    { id: 'item-2', screen: 'two', safeName: 'two', prompt: 'two prompt' },
    { id: 'item-3', screen: 'three', safeName: 'three', prompt: 'three prompt' }
  ];
}

describe('batch service', () => {
  it('generates with bounded concurrency and saves image versions', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'batch-service-'));
    const store = createBatchStore(root);
    let active = 0;
    let maxActive = 0;
    const generateImage = vi.fn(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return Buffer.from([1, 2, 3]);
    });

    const service = createBatchService({ store, routerClient: { generateImage } });
    const batch = await service.createBatch({
      settings: baseSettings({ concurrency: 2, negativePrompt: 'no text artifacts' }),
      items: sampleItems()
    });

    await service.waitForIdle(batch.id);
    const saved = await store.getBatch(batch.id);

    expect(maxActive).toBeLessThanOrEqual(2);
    expect(saved.status).toBe('done');
    expect(saved.items.every((item) => item.status === 'done')).toBe(true);
    expect(saved.items[0].versions[0].filename).toBe('one.png');
    expect(generateImage).toHaveBeenCalledWith(expect.objectContaining({ negativePrompt: 'no text artifacts' }));
    await expect(readFile(path.join(root, batch.id, 'one.png'))).resolves.toEqual(Buffer.from([1, 2, 3]));
  });

  it('retries failed attempts before marking an item done', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'batch-service-'));
    const store = createBatchStore(root);
    let attempts = 0;
    const generateImage = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('temporary provider failure');
      }
      return Buffer.from([4, 5, 6]);
    });

    const service = createBatchService({ store, routerClient: { generateImage } });
    const batch = await service.createBatch({
      settings: baseSettings({ concurrency: 1, autoRetries: 1 }),
      items: [{ id: 'item-1', screen: 'one', safeName: 'one', prompt: 'one prompt' }]
    });

    await service.waitForIdle(batch.id);
    const saved = await store.getBatch(batch.id);

    expect(saved.items[0].status).toBe('done');
    expect(saved.items[0].attempts).toBe(2);
    expect(saved.items[0].lastError).toBe('');
    expect(saved.items[0].attemptHistory).toHaveLength(2);
    expect(saved.items[0].attemptHistory[0]).toEqual(
      expect.objectContaining({
        status: 'failed',
        error: 'temporary provider failure'
      })
    );
    expect(saved.items[0].attemptHistory[1]).toEqual(expect.objectContaining({ status: 'done' }));
    expect(saved.items[0].attemptHistory[1].durationMs).toBeGreaterThanOrEqual(0);
  });

  it('regenerates a done item as a new selected version', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'batch-service-'));
    const store = createBatchStore(root);
    const generateImage = vi
      .fn()
      .mockResolvedValueOnce(Buffer.from([1]))
      .mockResolvedValueOnce(Buffer.from([2]));

    const service = createBatchService({ store, routerClient: { generateImage } });
    const batch = await service.createBatch({
      settings: baseSettings({ concurrency: 1 }),
      items: [{ id: 'item-1', screen: 'one', safeName: 'one', prompt: 'one prompt' }]
    });

    await service.waitForIdle(batch.id);
    await service.regenerateItem(batch.id, 'item-1', { prompt: 'updated prompt' });
    await service.waitForIdle(batch.id);
    const saved = await store.getBatch(batch.id);

    expect(saved.items[0].prompt).toBe('updated prompt');
    expect(saved.items[0].versions.map((version) => version.filename)).toEqual(['one.png', 'one-v2.png']);
    expect(saved.items[0].selectedVersionId).toBe('v2');
  });

  it('keeps paused status while queued work remains', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'batch-service-'));
    const store = createBatchStore(root);
    let releaseFirst;
    const firstImage = new Promise((resolve) => {
      releaseFirst = () => resolve(Buffer.from([1]));
    });
    const generateImage = vi.fn().mockReturnValueOnce(firstImage).mockResolvedValue(Buffer.from([2]));

    const service = createBatchService({ store, routerClient: { generateImage } });
    const batch = await service.createBatch({
      settings: baseSettings({ concurrency: 1 }),
      items: sampleItems()
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    const paused = await service.pauseBatch(batch.id);

    expect(paused.status).toBe('paused');
    releaseFirst();
    await service.cancelBatch(batch.id);
    await service.waitForIdle(batch.id);
  });

  it('marks a batch canceled when queued work is canceled', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'batch-service-'));
    const store = createBatchStore(root);
    let releaseFirst;
    const firstImage = new Promise((resolve) => {
      releaseFirst = () => resolve(Buffer.from([1]));
    });
    const generateImage = vi.fn().mockReturnValueOnce(firstImage).mockResolvedValue(Buffer.from([2]));

    const service = createBatchService({ store, routerClient: { generateImage } });
    const batch = await service.createBatch({
      settings: baseSettings({ concurrency: 1 }),
      items: sampleItems()
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    const canceled = await service.cancelBatch(batch.id);

    expect(canceled.status).toBe('canceled');
    expect(canceled.items.filter((item) => item.status === 'canceled')).toHaveLength(2);
    releaseFirst();
    await service.waitForIdle(batch.id);
  });
});
