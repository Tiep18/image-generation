# Batch Image Generator

Local web app for generating image batches from `{ screen, prompt }` JSON through a 9Router-compatible image API.

## Workflow

1. Paste or import a JSON array.
2. Configure 9Router URL, optional API key, model, size, retries, and concurrency.
3. Generate images in a bounded parallel queue.
4. Preview, retry, regenerate, and select versions.
5. Download selected outputs as ZIP.

## Input Format

```json
[
  {
    "screen": "home",
    "prompt": "Create a polished home screen for a productivity app"
  },
  {
    "screen": "checkout",
    "prompt": "Create a clean checkout screen with payment summary"
  }
]
```

Each item needs a non-empty `screen` and `prompt`. `screen` is sanitized before being used as a filename.

## Features

- Local React UI and Express API.
- 9Router-compatible image generation through `/v1/images/generations?response_format=binary`.
- Parallel queue with configurable concurrency.
- Automatic retries per image.
- Manual retry for failed images.
- Regenerate completed images with an edited prompt.
- Preview thumbnails and larger image modal.
- Version selection per screen.
- ZIP export for selected versions.
- Server-side output storage under `outputs/<batch-id>/`.

## Development

Install dependencies:

```bash
npm install
```

Run the local app:

```bash
npm run dev
```

Default URLs:

```text
Frontend: http://127.0.0.1:5173
Backend:  http://127.0.0.1:3001
```

Run tests:

```bash
npm run test
```
