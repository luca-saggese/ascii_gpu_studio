import { strFromU8, strToU8, Unzip, UnzipInflate, UnzipPassThrough, zipSync } from 'fflate';
import { DEFAULT_SCENE, validateScene } from './core.js';

const MAX_ARCHIVE_BYTES = 110 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 200 * 1024 * 1024;
const MAX_ENTRIES = 32;

function safeExtension(name) {
  const match = String(name)
    .toLowerCase()
    .match(/\.(png|jpe?g|webp|avif|mp4|webm)$/);
  if (!match) throw new Error('Formato media non supportato nel progetto .ascii.');
  return match[0];
}

export async function exportAscii({ scene, file, title = 'ASCII project', preview = null }) {
  validateScene(scene);
  if (!file || typeof file.arrayBuffer !== 'function' || typeof file.name !== 'string')
    throw new Error('Manca il file media originale.');
  if (file.size > 100 * 1024 * 1024)
    throw new Error('Il media supera il limite di 100 MB per il progetto .ascii.');
  const path = `media/source${safeExtension(file.name)}`;
  const manifest = {
    format: 'ascii-gpu-asset',
    formatVersion: 1,
    generator: { name: 'ascii-gpu-studio', version: '0.1.0' },
    asset: { title },
    media: {
      kind: file.type.startsWith('video/') ? 'video' : 'image',
      path,
      mime: file.type || 'application/octet-stream',
      preserveAudio: file.type.startsWith('video/'),
    },
    scene,
  };
  const files = {
    'manifest.json': strToU8(JSON.stringify(manifest)),
    [path]: new Uint8Array(await file.arrayBuffer()),
  };
  if (preview instanceof Blob) {
    manifest.preview = 'preview/thumbnail.png';
    files['manifest.json'] = strToU8(JSON.stringify(manifest));
    files['preview/thumbnail.png'] = new Uint8Array(await preview.arrayBuffer());
  }
  const archive = zipSync(files);
  return new Blob([archive], { type: 'application/vnd.ascii-gpu.asset+zip' });
}

export async function readAscii(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength > MAX_ARCHIVE_BYTES)
    throw new Error('Archivio .ascii superiore al limite compresso di 110 MB.');
  const entries = {};
  let count = 0;
  let expandedBytes = 0;
  let failure = '';
  const unzipper = new Unzip((entry) => {
    count += 1;
    if (count > MAX_ENTRIES) {
      failure = 'Archivio .ascii contiene troppe voci.';
      entry.terminate();
      return;
    }
    if (
      entry.name.startsWith('/') ||
      entry.name.includes('\\') ||
      entry.name.split('/').includes('..')
    ) {
      failure = 'Percorso non sicuro nell’archivio .ascii.';
      entry.terminate();
      return;
    }
    if (
      entry.originalSize !== undefined &&
      expandedBytes + entry.originalSize > MAX_EXPANDED_BYTES
    ) {
      failure = 'Archivio .ascii supera il limite estratto di 200 MB.';
      entry.terminate();
      return;
    }
    const chunks = [];
    let length = 0;
    entry.ondata = (error, chunk, final) => {
      if (error) {
        failure = 'Archivio .ascii non valido o corrotto.';
        return;
      }
      if (chunk) {
        length += chunk.byteLength;
        expandedBytes += chunk.byteLength;
        if (expandedBytes > MAX_EXPANDED_BYTES) {
          failure = 'Archivio .ascii supera il limite estratto di 200 MB.';
          entry.terminate();
          return;
        }
        chunks.push(chunk);
      }
      if (final) {
        const data = new Uint8Array(length);
        let offset = 0;
        for (const part of chunks) {
          data.set(part, offset);
          offset += part.byteLength;
        }
        entries[entry.name] = data;
      }
    };
    entry.start();
  });
  unzipper.register(UnzipInflate);
  unzipper.register(UnzipPassThrough);
  try {
    unzipper.push(bytes, true);
  } catch {
    throw new Error(failure || 'Archivio .ascii non valido o corrotto.');
  }
  if (failure) throw new Error(failure);
  if (!entries['manifest.json']) throw new Error('Manca manifest.json nel progetto .ascii.');
  let manifest;
  try {
    manifest = JSON.parse(strFromU8(entries['manifest.json']));
  } catch {
    throw new Error('Manifest .ascii non valido.');
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest))
    throw new Error('Manifest .ascii non valido.');
  if (manifest.format !== 'ascii-gpu-asset' || manifest.formatVersion !== 1)
    throw new Error('Versione del progetto .ascii non supportata.');
  if (typeof manifest.media?.path !== 'string' || !entries[manifest.media.path])
    throw new Error('File media indicato dal manifest non presente.');
  if (manifest.media.path.startsWith('/') || manifest.media.path.split('/').includes('..'))
    throw new Error('Percorso media non sicuro.');
  const saved = manifest.scene || {};
  const scene = {
    ...structuredClone(DEFAULT_SCENE),
    ...saved,
    grid: { ...DEFAULT_SCENE.grid, ...saved.grid },
    typography: { ...DEFAULT_SCENE.typography, ...saved.typography },
    appearance: { ...DEFAULT_SCENE.appearance, ...saved.appearance },
    playback: { ...DEFAULT_SCENE.playback, ...saved.playback },
  };
  validateScene(scene);
  return {
    manifest,
    scene,
    media: entries[manifest.media.path],
    preview: manifest.preview ? entries[manifest.preview] : null,
  };
}
