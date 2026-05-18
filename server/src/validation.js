export function sanitizeScreenName(value) {
  const safe = String(value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return safe || 'screen';
}

export function normalizeBatchInput(input) {
  if (!Array.isArray(input)) {
    return {
      ok: false,
      errors: [{ index: -1, field: 'root', message: 'input must be a JSON array' }]
    };
  }

  const errors = [];
  const usedNames = new Map();
  const items = [];

  input.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      errors.push({ index, field: 'item', message: 'item must be an object' });
      return;
    }

    if (typeof raw.screen !== 'string' || raw.screen.trim() === '') {
      errors.push({ index, field: 'screen', message: 'screen must be a non-empty string' });
    }

    if (typeof raw.prompt !== 'string' || raw.prompt.trim() === '') {
      errors.push({ index, field: 'prompt', message: 'prompt must be a non-empty string' });
    }

    if (errors.some((error) => error.index === index)) {
      return;
    }

    const baseName = sanitizeScreenName(raw.screen);
    const orderPrefix = String(index + 1).padStart(3, '0');
    const count = (usedNames.get(baseName) || 0) + 1;
    usedNames.set(baseName, count);

    items.push({
      id: `item-${index + 1}`,
      screen: raw.screen.trim(),
      safeName: `${orderPrefix}-${baseName}`,
      prompt: raw.prompt.trim()
    });
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, items };
}
