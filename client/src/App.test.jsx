// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.jsx';

describe('App', () => {
  beforeEach(() => {
    window.localStorage.clear();
    global.fetch = vi.fn(async (url, options) => {
      if (String(url).endsWith('/api/batches') && !options) {
        return new Response(
          JSON.stringify({
            batches: [
              {
                id: 'batch-1',
                createdAt: '2026-05-18T10:00:00.000Z',
                name: 'Launch screens',
                note: 'First pass',
                status: 'done',
                model: 'model-a',
                total: 1,
                done: 1,
                failed: 0
              },
              {
                id: 'batch-2',
                createdAt: '2026-05-18T10:05:00.000Z',
                name: 'Checkout fixes',
                note: 'Needs retry',
                status: 'failed',
                model: 'model-b',
                total: 2,
                done: 1,
                failed: 1
              }
            ]
          }),
          { status: 200 }
        );
      }

      if (String(url).includes('/api/models/image')) {
        return new Response(
          JSON.stringify({
            models: [{ id: 'model-a' }, { id: 'model-b' }]
          }),
          { status: 200 }
        );
      }

      if (String(url).endsWith('/api/batches') && options?.method === 'POST') {
        return new Response(
          JSON.stringify({
            id: 'batch-1',
            status: 'running',
            items: [
              {
                id: 'item-1',
                screen: 'home',
                prompt: 'Create a home screen',
                status: 'queued',
                selectedVersionId: '',
                versions: []
              }
            ]
          }),
          { status: 201 }
        );
      }

      if (String(url).endsWith('/api/batches/batch-1')) {
        if (options?.method === 'DELETE') {
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }

        return new Response(
          JSON.stringify({
            id: 'batch-1',
            name: '',
            note: '',
            status: 'done',
            settings: {
              routerUrl: 'http://router-from-batch',
              apiKey: '',
              model: 'model-a',
              size: '512x512',
              quality: 'hd',
              concurrency: 4,
              autoRetries: 1,
              timeoutMs: 300000,
              promptPrefix: 'prefix from batch',
              promptSuffix: 'suffix from batch',
              negativePrompt: ''
            },
            items: [
              {
                id: 'item-1',
                screen: 'home',
                prompt: 'Create a home screen with a very long prompt that should stay visually contained inside a fixed card body instead of stretching the entire grid height and making neighboring cards uneven.',
                status: 'done',
                attempts: 2,
                attemptHistory: [
                  {
                    attempt: 1,
                    mode: 'generate',
                    status: 'failed',
                    durationMs: 1250,
                    error: 'temporary provider failure'
                  },
                  {
                    attempt: 2,
                    mode: 'generate',
                    status: 'done',
                    durationMs: 61000,
                    error: ''
                  }
                ],
                selectedVersionId: 'v1',
                versions: [{ id: 'v1', filename: 'home.png' }]
              },
              {
                id: 'item-2',
                screen: 'checkout',
                prompt: 'Create a checkout screen',
                status: 'failed',
                attempts: 1,
                attemptHistory: [],
                selectedVersionId: '',
                versions: [],
                lastError: 'provider failure'
              },
              {
                id: 'item-3',
                screen: 'profile',
                prompt: 'Create a profile screen',
                status: 'generating',
                attempts: 0,
                attemptHistory: [],
                selectedVersionId: '',
                versions: []
              }
            ]
          }),
          { status: 200 }
        );
      }

      if (String(url).endsWith('/api/batches/batch-2')) {
        return new Response(
          JSON.stringify({
            id: 'batch-2',
            name: 'Checkout fixes',
            note: 'Needs retry',
            status: 'failed',
            items: [
              {
                id: 'item-1',
                screen: 'checkout',
                prompt: 'Create a checkout screen',
                status: 'failed',
                selectedVersionId: '',
                versions: []
              }
            ]
          }),
          { status: 200 }
        );
      }

      if (String(url).endsWith('/api/batches/batch-1/metadata') && options?.method === 'PATCH') {
        return new Response(
          JSON.stringify({
            id: 'batch-1',
            name: 'Launch screens',
            note: 'First pass',
            status: 'done',
            items: [
              {
                id: 'item-1',
                screen: 'home',
                prompt: 'Create a home screen',
                status: 'done',
                selectedVersionId: 'v1',
                versions: [{ id: 'v1', filename: 'home.png' }]
              }
            ]
          }),
          { status: 200 }
        );
      }

      return new Response('{}', { status: 200 });
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('validates JSON and starts a batch', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Batch JSON'), {
      target: { value: '[{"screen":"home","prompt":"Create a home screen"}]' }
    });
    fireEvent.change(screen.getByLabelText('Model'), {
      target: { value: 'model-a' }
    });
    fireEvent.change(screen.getByLabelText('Negative prompt'), {
      target: { value: 'no blurry text' }
    });
    fireEvent.click(screen.getByRole('button', { name: /generate batch/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:3001/api/batches',
      expect.objectContaining({ method: 'POST' })
    ));
    const createCall = global.fetch.mock.calls.find(([url, options]) =>
      String(url).endsWith('/api/batches') && options?.method === 'POST'
    );
    expect(JSON.parse(createCall[1].body).settings.negativePrompt).toBe('no blurry text');
    expect(await screen.findByText('home')).toBeTruthy();
  });

  it('reports invalid JSON before generating', () => {
    render(<App />);
    global.fetch.mockClear();

    fireEvent.change(screen.getByLabelText('Batch JSON'), {
      target: { value: '[{]' }
    });
    fireEvent.click(screen.getByRole('button', { name: /generate batch/i }));

    expect(screen.getByText(/Expected property name/i)).toBeTruthy();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('imports JSON from a file into the editor', async () => {
    render(<App />);
    const file = new File(['[{"screen":"imported","prompt":"Create imported screen"}]'], 'batch.json', {
      type: 'application/json'
    });

    fireEvent.change(screen.getByLabelText('Import JSON file'), {
      target: { files: [file] }
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Batch JSON').value).toContain('"screen":"imported"');
    });
  });

  it('restores the last batch after reload', async () => {
    window.localStorage.setItem('lastBatchId', 'batch-1');

    render(<App />);

    expect(await screen.findByText('Batch batch-1')).toBeTruthy();
    expect(await screen.findByText('home')).toBeTruthy();
  });

  it('loads image models and selects one', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /load models/i }));

    expect(await screen.findByRole('option', { name: 'model-a' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'model-b' } });

    expect(screen.getByLabelText('Model').value).toBe('model-b');
  });

  it('shows a loading state while loading image models', async () => {
    let resolveModels;
    global.fetch = vi.fn(async (url) => {
      if (String(url).endsWith('/api/batches')) {
        return new Response(JSON.stringify({ batches: [] }), { status: 200 });
      }
      if (String(url).includes('/api/models/image')) {
        return new Promise((resolve) => {
          resolveModels = () =>
            resolve(new Response(JSON.stringify({ models: [{ id: 'model-a' }] }), { status: 200 }));
        });
      }
      return new Response('{}', { status: 200 });
    });

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /load models/i }));

    expect(await screen.findByText('Loading models...')).toBeTruthy();
    resolveModels();
    expect(await screen.findByRole('option', { name: 'model-a' })).toBeTruthy();
  });

  it('persists settings changes in local storage', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'model-a' } });
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'secret-key' } });

    await waitFor(() => {
      expect(JSON.parse(window.localStorage.getItem('batchImageSettings')).model).toBe('model-a');
      expect(JSON.parse(window.localStorage.getItem('batchImageSettings')).apiKey).toBeUndefined();
    });
  });

  it('restores saved settings and applies presets', async () => {
    window.localStorage.setItem(
      'batchImageSettings',
      JSON.stringify({
        routerUrl: 'http://saved-router',
        model: 'saved/model',
        size: '512x512',
        quality: 'standard',
        concurrency: 2,
        autoRetries: 1
      })
    );

    render(<App />);

    expect(screen.getByLabelText('Model').value).toBe('saved/model');
    fireEvent.click(screen.getByRole('button', { name: /quality/i }));

    expect(screen.getByLabelText('Quality').value).toBe('hd');
    expect(screen.getByLabelText('Auto retries').value).toBe('2');
  });

  it('deletes the selected batch after confirmation', async () => {
    window.localStorage.setItem('lastBatchId', 'batch-1');
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<App />);

    expect(await screen.findByText('Batch batch-1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /delete batch/i }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:3001/api/batches/batch-1',
        expect.objectContaining({ method: 'DELETE' })
      )
    );
    expect(window.localStorage.getItem('lastBatchId')).toBe('batch-2');
  });

  it('updates the selected batch name and note', async () => {
    window.localStorage.setItem('lastBatchId', 'batch-1');
    vi.spyOn(window, 'prompt')
      .mockReturnValueOnce('Launch screens')
      .mockReturnValueOnce('First pass');

    render(<App />);

    expect(await screen.findByText('Batch batch-1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /edit details/i }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:3001/api/batches/batch-1/metadata',
        expect.objectContaining({ method: 'PATCH' })
      )
    );
    expect((await screen.findAllByText('Launch screens')).length).toBeGreaterThan(0);
    expect(screen.getByText('First pass')).toBeTruthy();
  });

  it('filters history by search text and status', async () => {
    render(<App />);

    expect(await screen.findByRole('button', { name: /launch screens/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /checkout fixes/i })).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Search history'), { target: { value: 'checkout' } });

    expect(screen.queryByRole('button', { name: /launch screens/i })).toBeNull();
    expect(screen.getByRole('button', { name: /checkout fixes/i })).toBeTruthy();

    fireEvent.change(screen.getByLabelText('History status'), { target: { value: 'done' } });

    expect(screen.getByText('No matching batches.')).toBeTruthy();
  });

  it('filters batch items by search text and status', async () => {
    window.localStorage.setItem('lastBatchId', 'batch-1');

    render(<App />);

    expect(await screen.findByText('home')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search items'), { target: { value: 'missing screen' } });

    expect(screen.getByText('No matching items.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search items'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Item status'), { target: { value: 'canceled' } });

    expect(screen.getByText('No matching items.')).toBeTruthy();
  });

  it('shows progress and sorts failed and running items before done items', async () => {
    window.localStorage.setItem('lastBatchId', 'batch-1');

    render(<App />);

    expect(await screen.findByText('33% complete')).toBeTruthy();
    const cards = await screen.findAllByLabelText(/screen item/i);
    expect(cards.map((card) => card.getAttribute('aria-label'))).toEqual([
      'screen item checkout',
      'screen item profile',
      'screen item home'
    ]);
  });

  it('keeps long prompts in a constrained card body', async () => {
    window.localStorage.setItem('lastBatchId', 'batch-1');

    render(<App />);

    const prompt = await screen.findByText(/very long prompt/i);
    expect(prompt.className).toContain('prompt-preview');
    expect(prompt.closest('.prompt-box')).toBeTruthy();
    expect(prompt.closest('.item-body')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'home' }).className).toContain('item-title');
  });

  it('regenerates an item with an inline prompt editor', async () => {
    window.localStorage.setItem('lastBatchId', 'batch-1');

    render(<App />);

    expect(await screen.findByText('Batch batch-1')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: /^regenerate$/i }).find((button) => !button.disabled));
    fireEvent.change(screen.getByLabelText('Regenerate prompt for home'), {
      target: { value: 'Updated inline prompt' }
    });
    fireEvent.click(screen.getByRole('button', { name: /submit regenerate/i }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:3001/api/batches/batch-1/items/item-1/regenerate',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ prompt: 'Updated inline prompt' })
        })
      )
    );
  });

  it('retries selected failed items', async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /checkout fixes/i }));
    expect(await screen.findByText('checkout')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Select checkout for retry'));
    fireEvent.click(screen.getByRole('button', { name: /retry selected/i }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:3001/api/batches/batch-2/items/item-1/retry',
        expect.objectContaining({ method: 'POST' })
      )
    );
  });

  it('duplicates the selected batch into the input form', async () => {
    window.localStorage.setItem('lastBatchId', 'batch-1');

    render(<App />);

    expect(await screen.findByText('Batch batch-1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /duplicate/i }));

    await waitFor(() => {
      expect(JSON.parse(screen.getByLabelText('Batch JSON').value)).toEqual([
        {
          screen: 'home',
          prompt: 'Create a home screen with a very long prompt that should stay visually contained inside a fixed card body instead of stretching the entire grid height and making neighboring cards uneven.'
        },
        { screen: 'checkout', prompt: 'Create a checkout screen' },
        { screen: 'profile', prompt: 'Create a profile screen' }
      ]);
    });
    expect(screen.getByLabelText('Model').value).toBe('model-a');
    expect(screen.getByLabelText('Size').value).toBe('512x512');
    expect(screen.getByLabelText('Quality').value).toBe('hd');
    expect(screen.getByText('Batch copied to input. Review settings, then generate.')).toBeTruthy();
  });

  it('shows attempt history and latest duration for generated items', async () => {
    window.localStorage.setItem('lastBatchId', 'batch-1');

    render(<App />);

    expect(await screen.findByText('Attempts: 2')).toBeTruthy();
    expect(screen.getByText('Last duration: 1m 1s')).toBeTruthy();
    expect(screen.getByText('Last result: done')).toBeTruthy();
  });
});
