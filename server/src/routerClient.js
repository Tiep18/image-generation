export function createRouterClient({ fetchImpl = fetch } = {}) {
  async function requestJson({ routerUrl, apiKey, path, timeoutMs }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers = {};
      if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
      }

      const response = await fetchImpl(`${routerUrl.replace(/\/$/, '')}${path}`, {
        method: 'GET',
        headers,
        signal: controller.signal
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(`9Router request failed (${response.status}): ${message}`);
      }

      return response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    async listImageModels({ routerUrl, apiKey, timeoutMs }) {
      const payload = await requestJson({ routerUrl, apiKey, path: '/v1/models/image', timeoutMs });
      return Array.isArray(payload.data) ? payload.data : [];
    },

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
