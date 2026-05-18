# Batch Image Generator

Local web app for generating image batches from `{ screen, prompt }` JSON through a 9Router-compatible image API.

## Planned Workflow

1. Paste or import a JSON array.
2. Configure 9Router URL, optional API key, model, size, retries, and concurrency.
3. Generate images in a bounded parallel queue.
4. Preview, retry, regenerate, and select versions.
5. Download selected outputs as ZIP.

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
