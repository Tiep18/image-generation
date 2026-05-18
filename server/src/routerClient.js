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
        if (size) {
          body.size = size;
        }
        if (quality) {
          body.quality = quality;
        }

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
