import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createBatchStore } from './store.js';

describe('batch store', () => {
  it('creates and persists batch metadata', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'batch-store-'));
    const store = createBatchStore(root);
    const batch = await store.createBatch({
      settings: { model: 'test-model' },
      items: [{ id: 'item-1', screen: 'home', safeName: 'home', prompt: 'prompt' }]
    });

    expect(batch.status).toBe('running');
    expect(batch.items[0].status).toBe('queued');

    const saved = JSON.parse(await readFile(path.join(root, batch.id, 'metadata.json'), 'utf8'));
    expect(saved.settings.model).toBe('test-model');
    expect(saved.items[0].versions).toEqual([]);
  });

  it('loads saved batches and lists newest first', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'batch-store-'));
    const store = createBatchStore(root);
    const first = await store.createBatch({
      settings: { model: 'first' },
      items: [{ id: 'item-1', screen: 'first', safeName: 'first', prompt: 'prompt' }]
    });
    const second = await store.createBatch({
      settings: { model: 'second' },
      items: [{ id: 'item-1', screen: 'second', safeName: 'second', prompt: 'prompt' }]
    });

    const loaded = await store.getBatch(first.id);
    const listed = await store.listBatches();

    expect(loaded.settings.model).toBe('first');
    expect(listed).toEqual([second.id, first.id]);
  });
});
