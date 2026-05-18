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
                status: 'done',
                model: 'model-a',
                total: 1,
                done: 1,
                failed: 0
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
        return new Response(
          JSON.stringify({
            id: 'batch-1',
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
    fireEvent.click(screen.getByRole('button', { name: /generate batch/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:3001/api/batches',
      expect.objectContaining({ method: 'POST' })
    ));
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

  it('persists settings changes in local storage', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'model-a' } });

    await waitFor(() => {
      expect(JSON.parse(window.localStorage.getItem('batchImageSettings')).model).toBe('model-a');
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
});
