import { describe, expect, it } from 'vitest';
import { File } from 'node:buffer';
import { gunzipSync, strFromU8, strToU8, zipSync } from 'fflate';
import { DEFAULT_SCENE } from '../src/core.js';
import { exportAscii, readAscii } from '../src/format.js';
import {
  deserializeAsciiDocument,
  serializeAsciiDocument,
  validateAsciiDocument,
} from '../src/ascii-document.js';
import { createPlayableHtml } from '../src/templates/playable-template.js';

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

  describe('portable ASCII result format', () => {
    const sample = {
      format: 'ascii-gpu-studio',
      version: 1,
      contentType: 'image',
      render: {
        columns: 3,
        rows: 1,
        cellWidth: 12,
        cellHeight: 20,
        width: 36,
        height: 20,
        cellAspect: 0.6,
        font: { family: 'monospace', size: 20, weight: 500, ascent: 15, descent: 4 },
        colors: { mode: 'mono', foreground: '#ffffff', background: '#000000' },
        fit: 'contain',
      },
      frames: [{ timestampMs: 0, durationMs: 0, text: '<&>' }],
    };

    it('stores gzip JSON and round-trips special ASCII data without base64 encoding the frame', async () => {
      const bytes = await serializeAsciiDocument(sample);
      expect([...bytes.slice(0, 2)]).toEqual([0x1f, 0x8b]);
      const raw = strFromU8(gunzipSync(bytes));
      expect(raw).toContain('"text":"<&>"');
      expect(raw).not.toContain(btoa('<&>'));
      expect(await deserializeAsciiDocument(bytes)).toEqual(sample);
    });

    it('embeds only the compressed ASCII payload in a self-contained playable page', async () => {
      const html = await createPlayableHtml(sample);
      const source = await html.text();
      expect(source).toContain('DecompressionStream');
      expect(source).toContain('textContent');
      expect(source).not.toContain('<&>');
      expect(source).not.toContain('https://');
    });

    it('rejects an image result with multiple frames or audio', async () => {
      await expect(
        serializeAsciiDocument({
          ...sample,
          frames: [...sample.frames, sample.frames[0]],
        }),
      ).rejects.toThrow(/immagine/);
    });

    it('round-trips vector outlines once and embeds an offline path renderer', async () => {
      const vector = {
        ...sample,
        render: {
          ...sample.render,
          font: {
            ...sample.render.font,
            license: {
              license: 'SIL Open Font License 1.1',
              copyright: 'Copyright 2017 IBM Corp.',
            },
          },
          mode: 'vector',
          unitsPerEm: 1000,
          glyphs: {
            '<': { path: 'M0 0L400 0L400 700L0 700Z', advanceWidth: 500 },
            '&': {
              path: 'M0 0L700 0L700 700L0 700ZM200 200L200 500L500 500L500 200Z',
              advanceWidth: 700,
            },
            '>': { path: 'M0 0L400 0L400 700L0 700Z', advanceWidth: 500 },
          },
        },
      };
      const bytes = await serializeAsciiDocument(vector);
      expect(await deserializeAsciiDocument(bytes)).toEqual(vector);
      const html = await createPlayableHtml(vector);
      const source = await html.text();
      expect(source).toContain("context.fill(path, 'evenodd')");
      expect(source).toContain('new Path2D(outline.path)');
      expect(source).not.toContain('font-face');
    });

    it('accepts frame data above the former cumulative cell ceiling', () => {
      const columns = 20_000_001;
      const large = {
        ...sample,
        render: {
          ...sample.render,
          columns,
          cellWidth: 1,
          cellHeight: 1,
          width: columns,
          height: 1,
        },
        frames: [{ timestampMs: 0, durationMs: 0, text: 'x'.repeat(columns) }],
      };
      expect(validateAsciiDocument(large)).toBe(large);
    });
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

  it('rejects drive-absolute archive entries', async () => {
    const archive = zipSync({
      'manifest.json': strToU8('{}'),
      'C:/outside.png': new Uint8Array([1]),
    });
    await expect(readAscii(archive)).rejects.toThrow(/Percorso non sicuro/);
  });
});
