export function parseBatchJson(text) {
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      return { ok: false, errors: ['Input must be a JSON array.'] };
    }

    const errors = [];
    parsed.forEach((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        errors.push(`Item ${index + 1} must be an object.`);
        return;
      }

      if (typeof item.screen !== 'string' || item.screen.trim() === '') {
        errors.push(`Item ${index + 1} is missing screen.`);
      }

      if (typeof item.prompt !== 'string' || item.prompt.trim() === '') {
        errors.push(`Item ${index + 1} is missing prompt.`);
      }
    });

    return errors.length > 0 ? { ok: false, errors } : { ok: true, items: parsed };
  } catch (error) {
    return { ok: false, errors: [error.message] };
  }
}
