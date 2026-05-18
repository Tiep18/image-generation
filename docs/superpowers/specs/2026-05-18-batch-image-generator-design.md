# Batch Image Generator Design

## Goal

Build a local web app for generating many images from a JSON array of `{ "screen": string, "prompt": string }` objects through a 9Router-compatible image API.

## Users And Workflow

The user opens a local web app, pastes or imports JSON, selects 9Router settings, starts a batch, watches per-image progress, previews generated images, retries failures, regenerates images they do not like, and downloads the selected results as a ZIP. The backend also stores generated files under `outputs/`.

## Input Format

The primary input is a JSON array:

```json
[
  {
    "screen": "home",
    "prompt": "A polished home screen for a productivity app"
  },
  {
    "screen": "checkout",
    "prompt": "A clean checkout screen with clear payment summary"
  }
]
```

Each object must contain non-empty `screen` and `prompt` strings. `screen` is sanitized before being used as a filename. Duplicate sanitized names receive numeric suffixes.

## Architecture

The app uses a React/Vite frontend and an Express backend. The backend owns all calls to 9Router, queue processing, file writing, ZIP creation, metadata persistence, and static serving for generated image previews.

The frontend talks only to the local backend. It never calls 9Router directly, which keeps API keys out of browser storage and allows reliable server-side file output.

## Core Features

- Validate pasted JSON and report item-level errors before generation.
- Configure `NINEROUTER_URL`, optional API key, model, size, quality, concurrency, automatic retries, request timeout, prompt prefix, prompt suffix, and negative prompt.
- Generate images in parallel through a bounded queue.
- Default concurrency is `3`.
- Default automatic retries is `2`.
- Default request timeout is `5 minutes`.
- Continue running the batch when one item fails.
- Show per-item statuses: `pending`, `queued`, `generating`, `done`, `failed`, `regenerating`, `canceled`.
- Preview generated images in the page.
- Open a larger preview modal for each version.
- Manually retry failed items.
- Retry all failed items.
- Regenerate successful items when the result is not acceptable.
- Edit an item prompt before regenerate.
- Preserve versions as `screen.png`, `screen-v2.png`, `screen-v3.png`.
- Allow selecting which version is included in ZIP export.
- Pause, resume, cancel batch, and cancel queued items.
- Store batch metadata and generated files under `outputs/<batch-id>/`.
- Export selected images and metadata as ZIP.
- Keep a basic batch history by reading saved metadata.

## Backend API

- `GET /api/health`: confirms the local server is running.
- `POST /api/validate`: validates JSON input and returns normalized items.
- `GET /api/models/image`: proxies `GET /v1/models/image` from 9Router.
- `POST /api/batches`: creates a batch and starts queue processing.
- `GET /api/batches`: lists existing batches from `outputs/`.
- `GET /api/batches/:batchId`: returns batch metadata.
- `POST /api/batches/:batchId/pause`: pauses queued work.
- `POST /api/batches/:batchId/resume`: resumes queued work.
- `POST /api/batches/:batchId/cancel`: cancels queued work and prevents new attempts.
- `POST /api/batches/:batchId/items/:itemId/retry`: retries one failed item.
- `POST /api/batches/:batchId/items/:itemId/regenerate`: regenerates one item, optionally with an edited prompt.
- `POST /api/batches/:batchId/items/:itemId/select-version`: selects a version for ZIP export.
- `GET /api/batches/:batchId/zip`: downloads selected images and metadata.
- `GET /outputs/:batchId/:filename`: serves generated images for preview.

## Data Model

Batch metadata is saved as `outputs/<batch-id>/metadata.json`.

```json
{
  "id": "20260518-172000",
  "createdAt": "2026-05-18T10:20:00.000Z",
  "status": "running",
  "settings": {
    "routerUrl": "http://localhost:20128",
    "model": "gemini/gemini-3-pro-image-preview",
    "size": "1024x1024",
    "quality": "standard",
    "concurrency": 3,
    "autoRetries": 2,
    "timeoutMs": 300000,
    "promptPrefix": "",
    "promptSuffix": "",
    "negativePrompt": ""
  },
  "items": [
    {
      "id": "item-1",
      "screen": "home",
      "safeName": "home",
      "prompt": "A polished home screen for a productivity app",
      "effectivePrompt": "A polished home screen for a productivity app",
      "status": "done",
      "attempts": 1,
      "lastError": "",
      "selectedVersionId": "v1",
      "versions": [
        {
          "id": "v1",
          "filename": "home.png",
          "createdAt": "2026-05-18T10:22:00.000Z"
        }
      ]
    }
  ]
}
```

## 9Router Image Call

The backend uses:

```http
POST {NINEROUTER_URL}/v1/images/generations?response_format=binary
Authorization: Bearer {NINEROUTER_KEY}
Content-Type: application/json
```

Request body:

```json
{
  "model": "selected-model",
  "prompt": "effective prompt",
  "size": "1024x1024",
  "quality": "standard"
}
```

The API key header is omitted when the user leaves the key blank.

## Error Handling

Invalid JSON is rejected before batch creation. Item-level validation errors identify the array index and missing or invalid field.

Generation failures are stored on the item as `lastError`. Automatic retries happen inside the queue up to the configured limit. Manual retry and regenerate are separate operations that re-enter the same bounded queue.

If ZIP export has no selected successful images, the backend returns a clear error instead of an empty archive.

## Testing Strategy

Backend tests cover JSON validation, filename sanitization, queue concurrency, retry behavior, metadata updates, selected-version ZIP behavior, and mocked 9Router failures. Frontend tests cover JSON editor validation, status rendering, action button availability, and preview/version selection behavior.

## Initial Scope

The first implementation should produce a working local web app with the core batch workflow, preview, retry, regenerate, selected ZIP export, and saved outputs. Authentication accounts, cloud storage, user management, and hosted deployment are outside the initial scope.
