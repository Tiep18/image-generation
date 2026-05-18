import { PassThrough } from 'node:stream';
import path from 'node:path';
import archiver from 'archiver';

export function createBatchZip({ batch, outputRoot }) {
  const archive = archiver('zip', { zlib: { level: 9 } });
  const stream = new PassThrough();
  archive.pipe(stream);

  let selectedCount = 0;
  batch.items.forEach((item) => {
    const version = item.versions.find((candidate) => candidate.id === item.selectedVersionId);
    if (!version) {
      return;
    }
    selectedCount += 1;
    archive.file(path.join(outputRoot, batch.id, version.filename), { name: version.filename });
  });

  archive.append(JSON.stringify(batch, null, 2), { name: 'metadata.json' });
  archive.finalize();

  return { stream, selectedCount };
}
