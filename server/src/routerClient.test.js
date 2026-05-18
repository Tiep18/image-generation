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
    expect([...buffer]).toEqual([1, 2, 3]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:20128/v1/images/generations?response_format=binary',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer secret',
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify({
          model: 'model-a',
          prompt: 'prompt',
          size: '1024x1024',
          quality: 'standard'
        })
      })
    );
  });

  it('omits authorization when api key is blank', async () => {
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array([1]), { status: 200 }));
    const client = createRouterClient({ fetchImpl });

    await client.generateImage({
      routerUrl: 'http://localhost:20128/',
      apiKey: '',
      model: 'model-a',
      prompt: 'prompt',
      timeoutMs: 300000
    });

    const [, options] = fetchImpl.mock.calls[0];
    expect(options.headers.Authorization).toBeUndefined();
  });

  it('throws a useful error for failed responses', async () => {
    const fetchImpl = vi.fn(async () => new Response('bad request', { status: 400 }));
    const client = createRouterClient({ fetchImpl });

    await expect(
      client.generateImage({
        routerUrl: 'http://localhost:20128',
        apiKey: '',
        model: 'model-a',
        prompt: 'prompt',
        timeoutMs: 300000
      })
    ).rejects.toThrow('9Router request failed (400): bad request');
  });
});
