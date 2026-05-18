import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

let sequence = 0;

function createBatchId() {
  sequence += 1;
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+/, '')
    .replace('T', '-');
  return `${stamp}-${String(sequence).padStart(4, '0')}`;
}

export function createBatchStore(outputRoot) {
  async function ensureRoot() {
    await mkdir(outputRoot, { recursive: true });
  }

  async function saveBatch(batch) {
    await mkdir(path.join(outputRoot, batch.id), { recursive: true });
    await writeFile(
      path.join(outputRoot, batch.id, 'metadata.json'),
      JSON.stringify(batch, null, 2),
      'utf8'
    );
    return batch;
  }

  return {
    outputRoot,

    async createBatch({ settings, items }) {
      await ensureRoot();
      const batch = {
        id: createBatchId(),
        createdAt: new Date().toISOString(),
        name: '',
        note: '',
        status: 'running',
        settings,
        items: items.map((item) => ({
          ...item,
          effectivePrompt: item.prompt,
          status: 'queued',
          attempts: 0,
          lastError: '',
          selectedVersionId: '',
          versions: []
        }))
      };

      return saveBatch(batch);
    },

    saveBatch,

    async getBatch(id) {
      const content = await readFile(path.join(outputRoot, id, 'metadata.json'), 'utf8');
      return JSON.parse(content);
    },

    async deleteBatch(id) {
      await ensureRoot();
      const root = path.resolve(outputRoot);
      const target = path.resolve(outputRoot, id);
      if (!target.startsWith(`${root}${path.sep}`)) {
        throw new Error('Invalid batch id');
      }
      await rm(target, { recursive: true, force: true });
      return { ok: true };
    },

    async updateBatchMetadata(id, metadata) {
      const batch = await this.getBatch(id);
      batch.name = typeof metadata.name === 'string' ? metadata.name.trim() : batch.name || '';
      batch.note = typeof metadata.note === 'string' ? metadata.note.trim() : batch.note || '';
      return saveBatch(batch);
    },

    async listBatches() {
      await ensureRoot();
      const entries = await readdir(outputRoot, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
        .reverse();
    }
  };
}
