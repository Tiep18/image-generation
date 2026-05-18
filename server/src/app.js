import cors from 'cors';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBatchService } from './batches.js';
import { createRouterClient } from './routerClient.js';
import { createRoutes } from './routes.js';
import { createBatchStore } from './store.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultOutputRoot = path.resolve(dirname, '..', '..', 'outputs');

export function createApp({ outputRoot = defaultOutputRoot, routerClient = createRouterClient() } = {}) {
  const app = express();
  const store = createBatchStore(outputRoot);
  const batchService = createBatchService({ store, routerClient });

  app.use(cors());
  app.use(express.json({ limit: '2mb' }));
  app.use('/outputs', express.static(outputRoot));

  app.get('/api/health', (req, res) => {
    res.json({ ok: true });
  });
  app.use('/api', createRoutes({ store, batchService, outputRoot }));

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    res.status(500).json({ error: error.message });
  });

  return app;
}
