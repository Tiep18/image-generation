# Batch Image Generator

Local web app for generating image batches from `{ screen, prompt }` JSON through a 9Router-compatible image API.

For a compact handoff document aimed at future AI/code sessions, read [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md).

## Core Workflow

1. Paste or import a JSON array of `{ screen, prompt }` objects.
2. Configure 9Router URL, model, size, quality, retries, timeout, and concurrency.
3. Generate images through the backend queue.
4. Review generated versions in the persistent review panel.
5. Retry failed items or regenerate completed items.
6. Approve, reject, or reset review status for selected image versions.
7. Export either all selected versions or only approved selected versions.

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

Each item needs a non-empty `screen` and `prompt`. The backend sanitizes `screen` into ordered safe filenames such as `001_home.png`.

## Review Rules

- First generated versions are `approved` by default.
- Regenerated versions are `pending` by default and must be reviewed.
- A version can be marked `approved`, `rejected`, or `pending`.
- `Download approved` validates that every selected completed item is approved before exporting.

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

Run verification:

```bash
npm run test
npm run lint
```

## Environment

The frontend calls `http://127.0.0.1:3001` by default. Override it with:

```text
VITE_API_BASE=http://127.0.0.1:3001
```
