import { describe, expect, it } from 'vitest';
import { parseBatchJson } from './validation.js';

describe('parseBatchJson', () => {
  it('accepts a valid batch JSON array', () => {
    const result = parseBatchJson(
      JSON.stringify([{ screen: 'home', prompt: 'Create a home screen' }])
    );

    expect(result.ok).toBe(true);
    expect(result.items).toHaveLength(1);
  });

  it('rejects invalid JSON', () => {
    const result = parseBatchJson('[{]');

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('Expected');
  });

  it('reports missing item fields', () => {
    const result = parseBatchJson(JSON.stringify([{ screen: '', prompt: '' }]));

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      'Item 1 is missing screen.',
      'Item 1 is missing prompt.'
    ]);
  });
});
