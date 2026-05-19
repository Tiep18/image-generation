# Project Context for Future AI Sessions

This document is the fastest way to understand the project before making changes.

## Purpose

Batch Image Generator is a local web app for creating many UI/image mockups from JSON input. The user supplies a JSON array of objects with:

```json
[
  { "screen": "home", "prompt": "Create a home screen" }
]
```

The app sends prompts to a 9Router-compatible image API, saves outputs locally, lets the user review/regenerate versions, and exports ZIP files.

## Tech Stack

- Root package: npm workspaces, ES modules.
- Frontend: React, Vite, lucide-react icons, plain CSS.
- Backend: Node.js, Express, archiver.
- Tests: Vitest, React Testing Library, Supertest.
- Storage: local filesystem under `outputs/<batch-id>/`.

Key scripts:

```bash
npm run dev
npm run test
npm run lint
npm run build
```

`npm run lint` runs Node syntax checks for server entry files and Vite production build for the client.

## Important Paths

```text
client/src/App.jsx          Main React UI and app state
client/src/api.js           Frontend API client and ZIP download helper
client/src/validation.js    Client-side JSON shape validation
client/src/App.css          App styling

server/src/app.js           Express app composition
server/src/routes.js        HTTP API routes
server/src/batches.js       Batch lifecycle and generation orchestration
server/src/queue.js         Bounded parallel queue
server/src/routerClient.js  9Router HTTP client
server/src/store.js         Filesystem metadata storage
server/src/validation.js    Backend validation and safe filename generation
server/src/zip.js           ZIP stream creation

outputs/<batch-id>/         Generated images and metadata.json
```

## Runtime Architecture

The frontend talks to the backend via `client/src/api.js`. The backend persists each batch as:

```text
outputs/<batch-id>/metadata.json
outputs/<batch-id>/<image files>.png
```

Generation flow:

1. Frontend validates JSON enough for immediate UI feedback.
2. `POST /api/batches` sends `settings` and `items`.
3. Backend normalizes input, creates a batch, and queues each item.
4. `BatchQueue` runs generation with bounded concurrency.
5. `routerClient.generateImage()` calls:
   `/v1/images/generations?response_format=binary`
6. Backend writes the binary PNG and updates `metadata.json`.
7. Frontend polls active batches every 1500ms until terminal status.

The app uses local filesystem storage, not a database. Reload persistence comes from `metadata.json` plus `localStorage.lastBatchId`.

## 9Router Integration

Default router URL:

```text
http://localhost:20128
```

Image generation request:

```text
POST <routerUrl>/v1/images/generations?response_format=binary
```

Payload fields:

```json
{
  "model": "provider/model-id",
  "prompt": "effective prompt",
  "size": "1024x1024",
  "quality": "standard",
  "negative_prompt": "optional"
}
```

The effective prompt is built server-side from:

```text
promptPrefix + prompt + promptSuffix
```

Only non-empty parts are included, separated by blank lines.

## Domain Model

Batch:

```json
{
  "id": "20260518-110207-0001",
  "createdAt": "ISO timestamp",
  "name": "",
  "note": "",
  "status": "running | paused | done | failed | canceled",
  "settings": {},
  "items": []
}
```

Item:

```json
{
  "id": "item-1",
  "screen": "home",
  "safeName": "001-home",
  "prompt": "Create a home screen",
  "effectivePrompt": "computed prompt",
  "status": "queued | generating | regenerating | done | failed | canceled",
  "attempts": 0,
  "attemptHistory": [],
  "lastError": "",
  "selectedVersionId": "v1",
  "versions": []
}
```

Version:

```json
{
  "id": "v1",
  "filename": "001-home.png",
  "createdAt": "ISO timestamp",
  "reviewStatus": "approved | pending | rejected"
}
```

Review rules:

- First generated versions use `reviewStatus: "approved"`.
- Regenerated versions use `reviewStatus: "pending"`.
- Users can set `approved`, `rejected`, or `pending` from the review panel.
- ZIP export with `reviewStatus=approved` validates that every selected completed item is approved.

## Backend API

Health and validation:

```text
GET  /api/health
POST /api/validate
GET  /api/models/image?routerUrl=...&apiKey=...
```

Batch lifecycle:

```text
GET    /api/batches
POST   /api/batches
GET    /api/batches/:batchId
DELETE /api/batches/:batchId
PATCH  /api/batches/:batchId/metadata
POST   /api/batches/:batchId/pause
POST   /api/batches/:batchId/resume
POST   /api/batches/:batchId/cancel
```

Item/version actions:

```text
POST /api/batches/:batchId/items/:itemId/retry
POST /api/batches/:batchId/items/:itemId/regenerate
POST /api/batches/:batchId/items/:itemId/select-version
POST /api/batches/:batchId/items/:itemId/review-version
```

`review-version` body:

```json
{
  "versionId": "v1",
  "reviewStatus": "approved"
}
```

Downloads:

```text
GET /api/batches/:batchId/zip
GET /api/batches/:batchId/zip?reviewStatus=approved
GET /outputs/:batchId/:filename
```

The approved ZIP endpoint returns a JSON error if selected completed items are not approved. The frontend handles that error inside the app instead of navigating to raw JSON.

## Frontend Behavior

Important UI state lives in `App.jsx`.

- Settings are saved to `localStorage` under `batchImageSettings`, excluding `apiKey`.
- Last active batch id is saved to `localStorage.lastBatchId`.
- On load, the app restores batch history and opens the last active batch or newest batch.
- Active batches are polled every 1500ms.
- Batch history supports search/status filtering.
- Item list supports search, item status filtering, and review status filtering.
- Failed items can be retried individually, all at once, or by selected failed items.
- Done items can be regenerated with an edited prompt.
- Image thumbnails open a persistent review panel instead of a modal.
- The selected thumbnail uses `aria-pressed` and a visual outline.
- ZIP downloads use `fetch`; JSON errors are displayed in-app as `message`.

## ZIP Export Semantics

Normal ZIP:

- Exports selected version for each item that has one.
- Includes `metadata.json`.

Approved ZIP:

- Uses `GET /api/batches/:batchId/zip?reviewStatus=approved`.
- First validates selected completed items.
- If any selected completed item is missing an approved selected version, the API returns:

```json
{
  "error": "Cannot export approved ZIP: N selected item(s) are not approved.",
  "items": ["screen names"]
}
```

- If valid, exports selected versions whose `reviewStatus` is `approved`.

## Testing Guidance

Use TDD for behavior changes. Existing tests cover:

- Backend validation, store, queue/generation service, router client, routes, ZIP behavior.
- Frontend API URL helpers, validation, and main app workflows.

Run focused tests during development:

```bash
npm run test --workspace server
npm run test --workspace client
```

Run full verification before claiming work is done:

```bash
npm run test
npm run lint
```

## Development Notes and Constraints

- Keep API key out of localStorage. Existing code intentionally strips it before saving settings.
- Preserve filesystem persistence unless the user explicitly asks to add a database.
- Avoid changing generated outputs in `outputs/` unless the task is about data cleanup.
- Prefer extending existing route/service/store patterns instead of adding new frameworks.
- For UI changes, keep the operational dashboard style: dense, practical, and not landing-page-like.
- For generated filename behavior, preserve ordered safe names such as `001-home.png`.
