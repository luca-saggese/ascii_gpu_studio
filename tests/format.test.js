import { describe, expect, it } from 'vitest';
import { File } from 'node:buffer';
import { strToU8, zipSync } from 'fflate';
import { DEFAULT_SCENE } from '../src/core.js';
import { exportAscii, readAscii } from '../src/format.js';

describe('.ascii project format', () => {
  it('round trips a media file and its scene', async () => {
    const original = new File([new Uint8Array([1, 2, 3])], 'sample.png', { type: 'image/png' });
    const scene = structuredClone(DEFAULT_SCENE);
    scene.grid.columns = 133;
    const archive = await exportAscii({ scene, file: original, title: 'Sample' });
    const result = await readAscii(new Uint8Array(await archive.arrayBuffer()));
    expect(result.manifest.asset.title).toBe('Sample');
    expect(result.scene.grid.columns).toBe(133);
    expect([...result.media]).toEqual([1, 2, 3]);
  });

  it('rejects path traversal and invalid manifests', async () => {
    const traversal = zipSync({
      'manifest.json': strToU8(
        JSON.stringify({
          format: 'ascii-gpu-asset',
          formatVersion: 1,
          media: { path: '../source.png' },
          scene: DEFAULT_SCENE,
        }),
      ),
      '../source.png': new Uint8Array([1]),
    });
    await expect(readAscii(traversal)).rejects.toThrow(/Percorso non sicuro/);
    const invalid = zipSync({ 'manifest.json': strToU8('{}') });
    await expect(readAscii(invalid)).rejects.toThrow(/versione/i);
  });
});
