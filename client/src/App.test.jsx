// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.jsx';

describe('App', () => {
  beforeEach(() => {
    global.fetch = vi.fn(async (url, options) => {
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

    fireEvent.change(screen.getByLabelText('Batch JSON'), {
      target: { value: '[{]' }
    });
    fireEvent.click(screen.getByRole('button', { name: /generate batch/i }));

    expect(screen.getByText(/Expected property name/i)).toBeTruthy();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
