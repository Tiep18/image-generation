import express from 'express';
import { createBatchZip } from './zip.js';
import { normalizeBatchInput } from './validation.js';

const defaultSettings = {
  routerUrl: 'http://localhost:20128',
  apiKey: '',
  model: '',
  size: '1024x1024',
  quality: 'standard',
  concurrency: 3,
  autoRetries: 2,
  timeoutMs: 300000,
  promptPrefix: '',
  promptSuffix: '',
  negativePrompt: ''
};

export function createRoutes({ store, batchService, outputRoot }) {
  const router = express.Router();

  function summarizeBatch(batch) {
    return {
      id: batch.id,
      createdAt: batch.createdAt,
      name: batch.name || '',
      note: batch.note || '',
      status: batch.status,
      model: batch.settings?.model || '',
      total: batch.items.length,
      done: batch.items.filter((item) => item.status === 'done').length,
      failed: batch.items.filter((item) => item.status === 'failed').length
    };
  }

  router.post('/validate', (req, res) => {
    res.json(normalizeBatchInput(req.body));
  });

  router.get('/models/image', async (req, res, next) => {
    try {
      const models = await batchService.listImageModels({
        routerUrl: req.query.routerUrl || defaultSettings.routerUrl,
        apiKey: req.query.apiKey || '',
        timeoutMs: defaultSettings.timeoutMs
      });
      res.json({ models });
    } catch (error) {
      next(error);
    }
  });

  router.get('/batches', async (req, res, next) => {
    try {
      const ids = await store.listBatches();
      const batches = await Promise.all(ids.map((id) => store.getBatch(id).then(summarizeBatch)));
      res.json({ batches });
    } catch (error) {
      next(error);
    }
  });

  router.post('/batches', async (req, res, next) => {
    try {
      const normalized = normalizeBatchInput(req.body.items);
      if (!normalized.ok) {
        res.status(400).json(normalized);
        return;
      }

      const batch = await batchService.createBatch({
        settings: { ...defaultSettings, ...req.body.settings },
        items: normalized.items
      });
      res.status(201).json(batch);
    } catch (error) {
      next(error);
    }
  });

  router.get('/batches/:batchId', async (req, res, next) => {
    try {
      res.json(await store.getBatch(req.params.batchId));
    } catch (error) {
      next(error);
    }
  });

  router.delete('/batches/:batchId', async (req, res, next) => {
    try {
      res.json(await batchService.deleteBatch(req.params.batchId));
    } catch (error) {
      next(error);
    }
  });

  router.patch('/batches/:batchId/metadata', async (req, res, next) => {
    try {
      res.json(await batchService.updateBatchMetadata(req.params.batchId, req.body));
    } catch (error) {
      next(error);
    }
  });

  router.post('/batches/:batchId/pause', async (req, res, next) => {
    try {
      res.json(await batchService.pauseBatch(req.params.batchId));
    } catch (error) {
      next(error);
    }
  });

  router.post('/batches/:batchId/resume', async (req, res, next) => {
    try {
      res.json(await batchService.resumeBatch(req.params.batchId));
    } catch (error) {
      next(error);
    }
  });

  router.post('/batches/:batchId/cancel', async (req, res, next) => {
    try {
      res.json(await batchService.cancelBatch(req.params.batchId));
    } catch (error) {
      next(error);
    }
  });

  router.post('/batches/:batchId/items/:itemId/retry', async (req, res, next) => {
    try {
      res.json(await batchService.retryItem(req.params.batchId, req.params.itemId));
    } catch (error) {
      next(error);
    }
  });

  router.post('/batches/:batchId/items/:itemId/regenerate', async (req, res, next) => {
    try {
      res.json(
        await batchService.regenerateItem(req.params.batchId, req.params.itemId, {
          prompt: req.body.prompt
        })
      );
    } catch (error) {
      next(error);
    }
  });

  router.post('/batches/:batchId/items/:itemId/select-version', async (req, res, next) => {
    try {
      res.json(
        await batchService.selectVersion(req.params.batchId, req.params.itemId, req.body.versionId)
      );
    } catch (error) {
      next(error);
    }
  });

  router.get('/batches/:batchId/zip', async (req, res, next) => {
    try {
      const batch = await store.getBatch(req.params.batchId);
      const { stream, selectedCount } = createBatchZip({ batch, outputRoot });
      if (selectedCount === 0) {
        res.status(400).json({ error: 'No selected successful images to export.' });
        return;
      }

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${batch.id}.zip"`);
      stream.pipe(res);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
