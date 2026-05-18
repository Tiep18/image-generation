import { describe, expect, it } from 'vitest';
import { normalizeBatchInput, sanitizeScreenName } from './validation.js';

describe('sanitizeScreenName', () => {
  it('creates safe lowercase filenames', () => {
    expect(sanitizeScreenName(' Home Screen / Hero ')).toBe('home-screen-hero');
  });

  it('removes Vietnamese marks before replacing unsafe characters', () => {
    expect(sanitizeScreenName('Màn hình thanh toán')).toBe('man-hinh-thanh-toan');
  });

  it('normalizes Vietnamese d with stroke in filenames', () => {
    expect(sanitizeScreenName('Đồng hồ đá')).toBe('dong-ho-da');
  });

  it('uses screen fallback when the value has no safe characters', () => {
    expect(sanitizeScreenName('!!!')).toBe('screen');
  });
});

describe('normalizeBatchInput', () => {
  it('accepts valid screen and prompt objects', () => {
    const result = normalizeBatchInput([
      { screen: 'home', prompt: 'Create a home screen' },
      { screen: 'home', prompt: 'Create another home screen' }
    ]);

    expect(result.ok).toBe(true);
    expect(result.items.map((item) => item.safeName)).toEqual(['001-home', '002-home']);
  });

  it('prefixes filenames with the screen order from the input array', () => {
    const result = normalizeBatchInput([
      { screen: 'Home Screen', prompt: 'Create a home screen' },
      { screen: 'Checkout', prompt: 'Create a checkout screen' },
      { screen: 'Product Detail', prompt: 'Create a product detail screen' }
    ]);

    expect(result.ok).toBe(true);
    expect(result.items.map((item) => item.safeName)).toEqual([
      '001-home-screen',
      '002-checkout',
      '003-product-detail'
    ]);
  });

  it('reports item-level validation errors', () => {
    const result = normalizeBatchInput([{ screen: '', prompt: '' }]);

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      { index: 0, field: 'screen', message: 'screen must be a non-empty string' },
      { index: 0, field: 'prompt', message: 'prompt must be a non-empty string' }
    ]);
  });

  it('rejects non-array input', () => {
    const result = normalizeBatchInput({ screen: 'home', prompt: 'prompt' });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      { index: -1, field: 'root', message: 'input must be a JSON array' }
    ]);
  });
});
