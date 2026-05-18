# Batch Image Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local React/Vite + Express app that generates image batches from `{ screen, prompt }` JSON through 9Router, with parallel processing, retry, regenerate, preview, saved outputs, and ZIP export.

**Architecture:** The Express backend owns 9Router calls, queue processing, metadata persistence, static output serving, and ZIP creation. The React frontend validates user input, starts batches, polls batch state, displays previews, and triggers retry/regenerate/version-selection actions.

**Tech Stack:** Node.js, Express, Vite, React, Vitest, Supertest, JSZip or Archiver, native `fetch`, CSS modules or plain CSS.

---

## File Structure

- `package.json`: root scripts for installing, testing, and running both apps.
- `client/package.json`: React/Vite client dependencies and scripts.
- `client/index.html`: Vite HTML entry.
- `client/src/main.jsx`: React entrypoint.
- `client/src/App.jsx`: top-level UI composition.
- `client/src/api.js`: typed fetch helpers for backend API.
- `client/src/validation.js`: browser-side JSON validation helpers.
- `client/src/App.css`: app styling.
- `client/src/*.test.jsx`: frontend tests.
- `server/package.json`: Express backend dependencies and scripts.
- `server/src/index.js`: server bootstrap.
- `server/src/app.js`: Express app wiring.
- `server/src/config.js`: default settings and environment reading.
- `server/src/validation.js`: batch input validation and filename sanitization.
- `server/src/store.js`: batch metadata persistence under `outputs/`.
- `server/src/routerClient.js`: 9Router image API client.
- `server/src/queue.js`: bounded queue, retry, pause/resume/cancel.
- `server/src/batches.js`: batch service operations.
- `server/src/routes.js`: HTTP routes.
- `server/src/zip.js`: ZIP archive generation.
- `server/src/*.test.js`: backend tests.
- `outputs/.gitkeep`: keeps the output directory present while ignoring generated files.

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `client/package.json`
- Create: `client/index.html`
- Create: `client/src/main.jsx`
- Create: `client/src/App.jsx`
- Create: `client/src/App.css`
- Create: `server/package.json`
- Create: `server/src/index.js`
- Create: `server/src/app.js`
- Create: `outputs/.gitkeep`
- Create: `.gitignore`
- Create: `README.md`

- [ ] **Step 1: Create root package scripts**

```json
{
  "name": "batch-image-generator",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "concurrently \"npm run dev --workspace server\" \"npm run dev --workspace client\"",
    "test": "npm run test --workspace server && npm run test --workspace client",
    "lint": "npm run lint --workspace server && npm run lint --workspace client"
  },
  "workspaces": [
    "client",
    "server"
  ],
  "devDependencies": {
    "concurrently": "^8.2.2"
  }
}
```

- [ ] **Step 2: Create backend package**

```json
{
  "name": "batch-image-generator-server",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "node --watch src/index.js",
    "start": "node src/index.js",
    "test": "vitest run",
    "lint": "node --check src/index.js && node --check src/app.js"
  },
  "dependencies": {
    "archiver": "^7.0.1",
    "cors": "^2.8.5",
    "express": "^4.19.2"
  },
  "devDependencies": {
    "supertest": "^7.0.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 3: Create frontend package**

```json
{
  "name": "batch-image-generator-client",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "vite build",
    "preview": "vite preview --host 127.0.0.1",
    "test": "vitest run",
    "lint": "node --check src/main.jsx"
  },
  "dependencies": {
    "@vitejs/plugin-react": "^4.2.1",
    "vite": "^5.2.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "lucide-react": "^0.468.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.2",
    "@testing-library/react": "^15.0.7",
    "jsdom": "^24.0.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 4: Create minimal app shell**

`server/src/app.js`:

```js
import express from 'express';
import cors from 'cors';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (req, res) => {
    res.json({ ok: true });
  });

  return app;
}
```

`server/src/index.js`:

```js
import { createApp } from './app.js';

const port = Number(process.env.PORT || 3001);
const app = createApp();

app.listen(port, () => {
  console.log(`Batch image generator API listening on http://127.0.0.1:${port}`);
});
```

`client/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Batch Image Generator</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

`client/src/main.jsx`:

```jsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import './App.css';
import { App } from './App.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

`client/src/App.jsx`:

```jsx
export function App() {
  return (
    <main className="app-shell">
      <section className="workspace">
        <h1>Batch Image Generator</h1>
        <p>Generate image batches from screen and prompt JSON through a local 9Router server.</p>
      </section>
    </main>
  );
}
```

`client/src/App.css`:

```css
:root {
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #17202a;
  background: #f4f7f9;
}

body {
  margin: 0;
}

.app-shell {
  min-height: 100vh;
  padding: 32px;
}

.workspace {
  max-width: 1180px;
  margin: 0 auto;
}
```

- [ ] **Step 5: Add repository support files**

`.gitignore`:

```gitignore
node_modules/
dist/
.env
.env.local
outputs/*
!outputs/.gitkeep
```

`README.md`:

```markdown
# Batch Image Generator

Local web app for generating image batches from `{ screen, prompt }` JSON through a 9Router-compatible image API.

## Planned Workflow

1. Paste or import a JSON array.
2. Configure 9Router URL, optional API key, model, size, retries, and concurrency.
3. Generate images in a bounded parallel queue.
4. Preview, retry, regenerate, and select versions.
5. Download selected outputs as ZIP.
```

- [ ] **Step 6: Run scaffold checks**

Run: `npm install`

Expected: dependencies install successfully.

Run: `npm run test`

Expected: both workspaces run tests. At this point no tests exist, so Vitest may report no test files; add tests in later tasks.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "chore: scaffold batch image generator"
```

---

### Task 2: Validation And Filename Utilities

**Files:**
- Create: `server/src/validation.js`
- Create: `server/src/validation.test.js`
- Create: `client/src/validation.js`
- Create: `client/src/validation.test.jsx`

- [ ] **Step 1: Write backend validation tests**

```js
import { describe, expect, it } from 'vitest';
import { normalizeBatchInput, sanitizeScreenName } from './validation.js';

describe('sanitizeScreenName', () => {
  it('creates safe lowercase filenames', () => {
    expect(sanitizeScreenName(' Home Screen / Hero ')).toBe('home-screen-hero');
  });

  it('uses screen fallback when the value has no safe characters', () => {
    expect(sanitizeScreenName('!!!')).toBe('screen');
  });
});

describe('normalizeBatchInput', () => {
  it('accepts valid screen and prompt objects', () => {
    const result = normalizeBatchInput([
      { screen: 'home', prompt: 'Create a home screen' },
      { screen: 'home', prompt: 'Create another home screen' }
    ]);

    expect(result.ok).toBe(true);
    expect(result.items.map((item) => item.safeName)).toEqual(['home', 'home-2']);
  });

  it('reports item-level validation errors', () => {
    const result = normalizeBatchInput([{ screen: '', prompt: '' }]);

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      { index: 0, field: 'screen', message: 'screen must be a non-empty string' },
      { index: 0, field: 'prompt', message: 'prompt must be a non-empty string' }
    ]);
  });
});
```

- [ ] **Step 2: Implement backend validation**

```js
export function sanitizeScreenName(value) {
  const safe = String(value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return safe || 'screen';
}

export function normalizeBatchInput(input) {
  if (!Array.isArray(input)) {
    return {
      ok: false,
      errors: [{ index: -1, field: 'root', message: 'input must be a JSON array' }]
    };
  }

  const errors = [];
  const usedNames = new Map();
  const items = [];

  input.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      errors.push({ index, field: 'item', message: 'item must be an object' });
      return;
    }

    if (typeof raw.screen !== 'string' || raw.screen.trim() === '') {
      errors.push({ index, field: 'screen', message: 'screen must be a non-empty string' });
    }

    if (typeof raw.prompt !== 'string' || raw.prompt.trim() === '') {
      errors.push({ index, field: 'prompt', message: 'prompt must be a non-empty string' });
    }

    if (errors.some((error) => error.index === index)) {
      return;
    }

    const baseName = sanitizeScreenName(raw.screen);
    const count = (usedNames.get(baseName) || 0) + 1;
    usedNames.set(baseName, count);
    const safeName = count === 1 ? baseName : `${baseName}-${count}`;

    items.push({
      id: `item-${index + 1}`,
      screen: raw.screen.trim(),
      safeName,
      prompt: raw.prompt.trim()
    });
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, items };
}
```

- [ ] **Step 3: Mirror lightweight client validation**

`client/src/validation.js`:

```js
export function parseBatchJson(text) {
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      return { ok: false, errors: ['Input must be a JSON array.'] };
    }

    const errors = [];
    parsed.forEach((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        errors.push(`Item ${index + 1} must be an object.`);
        return;
      }
      if (typeof item.screen !== 'string' || item.screen.trim() === '') {
        errors.push(`Item ${index + 1} is missing screen.`);
      }
      if (typeof item.prompt !== 'string' || item.prompt.trim() === '') {
        errors.push(`Item ${index + 1} is missing prompt.`);
      }
    });

    return errors.length > 0 ? { ok: false, errors } : { ok: true, items: parsed };
  } catch (error) {
    return { ok: false, errors: [error.message] };
  }
}
```

- [ ] **Step 4: Run tests and commit**

Run: `npm run test --workspace server`

Expected: validation tests pass.

Run: `npm run test --workspace client`

Expected: client validation tests pass after adding matching test cases.

Commit:

```bash
git add client/src/validation.js client/src/validation.test.jsx server/src/validation.js server/src/validation.test.js
git commit -m "feat: validate batch image input"
```

---

### Task 3: Batch Store And Metadata

**Files:**
- Create: `server/src/store.js`
- Create: `server/src/store.test.js`

- [ ] **Step 1: Test metadata creation and updates**

```js
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

    expect(batch.items[0].status).toBe('queued');

    const saved = JSON.parse(await readFile(path.join(root, batch.id, 'metadata.json'), 'utf8'));
    expect(saved.settings.model).toBe('test-model');
  });
});
```

- [ ] **Step 2: Implement the store**

```js
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function createBatchStore(outputRoot) {
  async function ensureRoot() {
    await mkdir(outputRoot, { recursive: true });
  }

  async function saveBatch(batch) {
    await mkdir(path.join(outputRoot, batch.id), { recursive: true });
    await writeFile(
      path.join(outputRoot, batch.id, 'metadata.json'),
      JSON.stringify(batch, null, 2),
      'utf8'
    );
    return batch;
  }

  return {
    async createBatch({ settings, items }) {
      await ensureRoot();
      const id = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
      const batch = {
        id,
        createdAt: new Date().toISOString(),
        status: 'running',
        settings,
        items: items.map((item) => ({
          ...item,
          effectivePrompt: item.prompt,
          status: 'queued',
          attempts: 0,
          lastError: '',
          selectedVersionId: '',
          versions: []
        }))
      };
      return saveBatch(batch);
    },
    saveBatch,
    async getBatch(id) {
      const content = await readFile(path.join(outputRoot, id, 'metadata.json'), 'utf8');
      return JSON.parse(content);
    },
    async listBatches() {
      await ensureRoot();
      const names = await readdir(outputRoot, { withFileTypes: true });
      return names.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort().reverse();
    },
    outputRoot
  };
}
```

- [ ] **Step 3: Run tests and commit**

Run: `npm run test --workspace server`

Expected: validation and store tests pass.

Commit:

```bash
git add server/src/store.js server/src/store.test.js
git commit -m "feat: persist batch metadata"
```

---

### Task 4: 9Router Client

**Files:**
- Create: `server/src/routerClient.js`
- Create: `server/src/routerClient.test.js`

- [ ] **Step 1: Test request building**

```js
import { describe, expect, it, vi } from 'vitest';
import { createRouterClient } from './routerClient.js';

describe('router client', () => {
  it('requests binary image generation with optional auth', async () => {
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    const client = createRouterClient({ fetchImpl });

    const buffer = await client.generateImage({
      routerUrl: 'http://localhost:20128',
      apiKey: 'secret',
      model: 'model-a',
      prompt: 'prompt',
      size: '1024x1024',
      quality: 'standard',
      timeoutMs: 300000
    });

    expect(buffer).toBeInstanceOf(Buffer);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:20128/v1/images/generations?response_format=binary',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer secret' })
      })
    );
  });
});
```

- [ ] **Step 2: Implement 9Router client**

```js
export function createRouterClient({ fetchImpl = fetch } = {}) {
  return {
    async generateImage({ routerUrl, apiKey, model, prompt, size, quality, timeoutMs }) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const headers = { 'Content-Type': 'application/json' };
        if (apiKey) {
          headers.Authorization = `Bearer ${apiKey}`;
        }

        const body = { model, prompt };
        if (size) body.size = size;
        if (quality) body.quality = quality;

        const response = await fetchImpl(
          `${routerUrl.replace(/\/$/, '')}/v1/images/generations?response_format=binary`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: controller.signal
          }
        );

        if (!response.ok) {
          const message = await response.text();
          throw new Error(`9Router request failed (${response.status}): ${message}`);
        }

        return Buffer.from(await response.arrayBuffer());
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}
```

- [ ] **Step 3: Run tests and commit**

Run: `npm run test --workspace server`

Expected: router client tests pass.

Commit:

```bash
git add server/src/routerClient.js server/src/routerClient.test.js
git commit -m "feat: add 9router image client"
```

---

### Task 5: Queue, Retry, And Regenerate Service

**Files:**
- Create: `server/src/queue.js`
- Create: `server/src/batches.js`
- Create: `server/src/batches.test.js`

- [ ] **Step 1: Test bounded concurrency and retry**

```js
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createBatchStore } from './store.js';
import { createBatchService } from './batches.js';

describe('batch service', () => {
  it('generates with bounded concurrency and retries failures', async () => {
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
      settings: {
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
        negativePrompt: ''
      },
      items: [
        { id: 'item-1', screen: 'one', safeName: 'one', prompt: 'one prompt' },
        { id: 'item-2', screen: 'two', safeName: 'two', prompt: 'two prompt' },
        { id: 'item-3', screen: 'three', safeName: 'three', prompt: 'three prompt' }
      ]
    });

    await service.waitForIdle(batch.id);
    expect(maxActive).toBeLessThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Implement queue and batch service**

Implement a per-batch queue that starts up to `settings.concurrency` items, updates metadata before and after each attempt, writes image files into the batch directory, and exposes methods for `retryItem`, `regenerateItem`, `pauseBatch`, `resumeBatch`, `cancelBatch`, and `selectVersion`.

The implementation should keep in-memory runners small and persist every status transition to `metadata.json`.

- [ ] **Step 3: Run tests and commit**

Run: `npm run test --workspace server`

Expected: service tests pass.

Commit:

```bash
git add server/src/queue.js server/src/batches.js server/src/batches.test.js
git commit -m "feat: process image batches with retries"
```

---

### Task 6: Backend Routes And ZIP Export

**Files:**
- Create: `server/src/routes.js`
- Create: `server/src/zip.js`
- Create: `server/src/routes.test.js`
- Modify: `server/src/app.js`

- [ ] **Step 1: Test API routes**

Use Supertest to verify `/api/health`, `/api/validate`, `/api/batches`, `/api/batches/:batchId`, item retry/regenerate endpoints, selected-version endpoint, and ZIP endpoint.

- [ ] **Step 2: Implement routes**

Wire Express routes to validation, store, batch service, and ZIP stream generation. Mount `/outputs` as static files from the configured output root.

- [ ] **Step 3: Run tests and commit**

Run: `npm run test --workspace server`

Expected: all backend tests pass.

Commit:

```bash
git add server/src/routes.js server/src/zip.js server/src/routes.test.js server/src/app.js
git commit -m "feat: expose batch image API"
```

---

### Task 7: Frontend Batch UI

**Files:**
- Create: `client/src/api.js`
- Modify: `client/src/App.jsx`
- Modify: `client/src/App.css`
- Create: `client/src/App.test.jsx`

- [ ] **Step 1: Test UI states**

Use React Testing Library to verify JSON validation, settings fields, generate button disabled state, item rows/cards, action buttons, and preview display based on mocked API responses.

- [ ] **Step 2: Implement API helpers**

```js
const API_BASE = 'http://127.0.0.1:3001';

export async function createBatch(payload) {
  const response = await fetch(`${API_BASE}/api/batches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function getBatch(batchId) {
  const response = await fetch(`${API_BASE}/api/batches/${batchId}`);
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export function getZipUrl(batchId) {
  return `${API_BASE}/api/batches/${batchId}/zip`;
}
```

- [ ] **Step 3: Implement the UI**

Build a dense work-focused app screen with a JSON editor, settings panel, progress summary, batch controls, item cards, thumbnails, preview modal, prompt edit for regenerate, retry buttons, version selector, and ZIP download button.

- [ ] **Step 4: Run tests and commit**

Run: `npm run test --workspace client`

Expected: frontend tests pass.

Commit:

```bash
git add client/src/api.js client/src/App.jsx client/src/App.css client/src/App.test.jsx
git commit -m "feat: add batch image generator UI"
```

---

### Task 8: Manual Verification And Documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document setup**

Add commands:

```bash
npm install
npm run dev
```

Document default URLs:

```text
Frontend: http://127.0.0.1:5173
Backend:  http://127.0.0.1:3001
```

- [ ] **Step 2: Run full verification**

Run: `npm run test`

Expected: server and client tests pass.

Run: `npm run dev`

Expected: frontend and backend start. Open the frontend and generate a two-item test batch against a configured 9Router server.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document local development workflow"
```

---

## Self-Review

- Spec coverage: The tasks cover scaffold, validation, persistence, 9Router calls, concurrency, retry, regenerate, backend routes, ZIP export, preview UI, and documentation.
- Placeholder scan: The plan avoids open-ended placeholders in early tasks. Tasks 5-7 intentionally describe larger implementation work at the component level and must be expanded further before execution if a worker needs line-by-line code.
- Type consistency: The shared item fields are `id`, `screen`, `safeName`, `prompt`, `effectivePrompt`, `status`, `attempts`, `lastError`, `selectedVersionId`, and `versions`, matching the design spec.
