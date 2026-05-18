import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BatchQueue } from './queue.js';

function buildEffectivePrompt(settings, prompt) {
  return [settings.promptPrefix, prompt, settings.promptSuffix]
    .filter((part) => typeof part === 'string' && part.trim() !== '')
    .join('\n\n');
}

function nextVersion(item) {
  const number = item.versions.length + 1;
  return {
    id: `v${number}`,
    filename: number === 1 ? `${item.safeName}.png` : `${item.safeName}-v${number}.png`,
    createdAt: new Date().toISOString()
  };
}

function summarizeStatus(items, currentStatus = '') {
  if (currentStatus === 'paused' && items.some((item) => item.status === 'queued' || item.status === 'generating' || item.status === 'regenerating')) {
    return 'paused';
  }
  if (currentStatus === 'canceled' && items.some((item) => item.status === 'canceled')) {
    return 'canceled';
  }
  if (items.some((item) => item.status === 'queued' || item.status === 'generating' || item.status === 'regenerating')) {
    return 'running';
  }
  if (items.some((item) => item.status === 'failed')) {
    return 'failed';
  }
  if (items.every((item) => item.status === 'done')) {
    return 'done';
  }
  if (items.some((item) => item.status === 'canceled')) {
    return 'canceled';
  }
  return 'running';
}

function createAttemptRecord({ attempt, mode, startedAtMs, status, error = '' }) {
  const finishedAtMs = Date.now();
  return {
    attempt,
    mode,
    status,
    startedAt: new Date(startedAtMs).toISOString(),
    finishedAt: new Date(finishedAtMs).toISOString(),
    durationMs: Math.max(0, finishedAtMs - startedAtMs),
    error
  };
}

export function createBatchService({ store, routerClient }) {
  const queues = new Map();
  const batchLocks = new Map();

  async function withBatchLock(batchId, operation) {
    const previous = batchLocks.get(batchId) || Promise.resolve();
    const current = previous.catch(() => {}).then(operation);
    batchLocks.set(batchId, current.catch(() => {}));
    return current;
  }

  async function updateBatch(batchId, updater) {
    return withBatchLock(batchId, async () => {
      const batch = await store.getBatch(batchId);
      await updater(batch);
      batch.status = summarizeStatus(batch.items, batch.status);
      await store.saveBatch(batch);
      return batch;
    });
  }

  async function processItem({ batchId, itemId, mode }) {
    let batch = await updateBatch(batchId, async (draft) => {
      const item = draft.items.find((candidate) => candidate.id === itemId);
      if (!item || item.status === 'canceled') {
        return;
      }
      item.status = mode === 'regenerate' ? 'regenerating' : 'generating';
      item.effectivePrompt = buildEffectivePrompt(draft.settings, item.prompt);
      item.lastError = '';
    });

    let item = batch.items.find((candidate) => candidate.id === itemId);
    if (!item || item.status === 'canceled') {
      return;
    }

    const maxAttempts = Number(batch.settings.autoRetries || 0) + 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const startedAtMs = Date.now();
      try {
        const image = await routerClient.generateImage({
          routerUrl: batch.settings.routerUrl,
          apiKey: batch.settings.apiKey,
          model: batch.settings.model,
          prompt: item.effectivePrompt,
          size: batch.settings.size,
          quality: batch.settings.quality,
          negativePrompt: batch.settings.negativePrompt,
          timeoutMs: batch.settings.timeoutMs
        });

        await withBatchLock(batchId, async () => {
          batch = await store.getBatch(batchId);
          item = batch.items.find((candidate) => candidate.id === itemId);
          const version = nextVersion(item);
          await writeFile(path.join(store.outputRoot, batch.id, version.filename), image);
          item.versions.push(version);
          item.selectedVersionId = version.id;
          item.status = 'done';
          item.attempts += 1;
          item.attemptHistory = item.attemptHistory || [];
          item.attemptHistory.push(createAttemptRecord({ attempt, mode, startedAtMs, status: 'done' }));
          item.lastError = '';
          batch.status = summarizeStatus(batch.items, batch.status);
          await store.saveBatch(batch);
        });
        return;
      } catch (error) {
        await withBatchLock(batchId, async () => {
          batch = await store.getBatch(batchId);
          item = batch.items.find((candidate) => candidate.id === itemId);
          item.attempts += 1;
          item.attemptHistory = item.attemptHistory || [];
          item.attemptHistory.push(
            createAttemptRecord({
              attempt,
              mode,
              startedAtMs,
              status: 'failed',
              error: error.message
            })
          );
          item.lastError = error.message;
          item.status = attempt >= maxAttempts ? 'failed' : item.status;
          batch.status = summarizeStatus(batch.items, batch.status);
          await store.saveBatch(batch);
        });
      }
    }
  }

  function ensureQueue(batch) {
    if (!queues.has(batch.id)) {
      queues.set(
        batch.id,
        new BatchQueue({
          concurrency: batch.settings.concurrency,
          worker: processItem
        })
      );
    }
    return queues.get(batch.id);
  }

  return {
    async listImageModels({ routerUrl, apiKey, timeoutMs }) {
      return routerClient.listImageModels({ routerUrl, apiKey, timeoutMs });
    },

    async createBatch({ settings, items }) {
      const preparedItems = items.map((item) => ({
        ...item,
        prompt: item.prompt.trim()
      }));
      const batch = await store.createBatch({ settings, items: preparedItems });
      const queue = ensureQueue(batch);
      batch.items.forEach((item) => queue.add({ batchId: batch.id, itemId: item.id, mode: 'generate' }));
      return batch;
    },

    async waitForIdle(batchId) {
      const queue = queues.get(batchId);
      if (!queue) {
        return;
      }
      await queue.waitForIdle();
    },

    async retryItem(batchId, itemId) {
      const batch = await updateBatch(batchId, async (draft) => {
        const item = draft.items.find((candidate) => candidate.id === itemId);
        item.status = 'queued';
        item.lastError = '';
      });
      ensureQueue(batch).add({ batchId, itemId, mode: 'generate' });
      return batch;
    },

    async regenerateItem(batchId, itemId, { prompt } = {}) {
      const batch = await updateBatch(batchId, async (draft) => {
        const item = draft.items.find((candidate) => candidate.id === itemId);
        if (typeof prompt === 'string' && prompt.trim() !== '') {
          item.prompt = prompt.trim();
        }
        item.status = 'queued';
        item.lastError = '';
      });
      ensureQueue(batch).add({ batchId, itemId, mode: 'regenerate' });
      return batch;
    },

    async pauseBatch(batchId) {
      queues.get(batchId)?.pause();
      return updateBatch(batchId, async (draft) => {
        draft.status = 'paused';
      });
    },

    async resumeBatch(batchId) {
      const batch = await updateBatch(batchId, async (draft) => {
        draft.status = 'running';
      });
      ensureQueue(batch).resume();
      return batch;
    },

    async cancelBatch(batchId) {
      queues.get(batchId)?.cancel();
      return updateBatch(batchId, async (draft) => {
        draft.items.forEach((item) => {
          if (item.status === 'queued') {
            item.status = 'canceled';
          }
        });
        draft.status = 'canceled';
      });
    },

    async deleteBatch(batchId) {
      const queue = queues.get(batchId);
      queue?.cancel();
      await queue?.waitForIdle();
      batchLocks.delete(batchId);
      queues.delete(batchId);
      return store.deleteBatch(batchId);
    },

    async updateBatchMetadata(batchId, metadata) {
      return withBatchLock(batchId, () => store.updateBatchMetadata(batchId, metadata));
    },

    async selectVersion(batchId, itemId, versionId) {
      return updateBatch(batchId, async (draft) => {
        const item = draft.items.find((candidate) => candidate.id === itemId);
        if (!item.versions.some((version) => version.id === versionId)) {
          throw new Error(`Version ${versionId} does not exist for ${itemId}`);
        }
        item.selectedVersionId = versionId;
      });
    }
  };
}
