import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { gunzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createPlayablePython } from '../src/templates/python-template.js';

const sample = {
  format: 'ascii-gpu-studio',
  version: 1,
  contentType: 'image',
  render: {
    columns: 5,
    rows: 1,
    cellWidth: 8,
    cellHeight: 12,
    width: 40,
    height: 12,
    cellAspect: 2 / 3,
    font: { family: 'monospace', size: 8, weight: 500, ascent: 8, descent: 2 },
    colors: { mode: 'mono', foreground: '#ffffff', background: '#000000' },
    fit: 'contain',
  },
  frames: [{ timestampMs: 0, durationMs: 0, text: 'Aé"\\B' }],
};

function runPython(source, args = []) {
  return spawnSync('python3', ['-', ...args], {
    input: source,
    encoding: 'utf8',
    timeout: 10000,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  });
}

describe('standalone Python export', () => {
  it('embeds the actual shared player and runs an image without any sidecar file', async () => {
    const source = await (await createPlayablePython(sample)).text();
    expect(source.startsWith('#!/usr/bin/env python3\n')).toBe(true);
    expect(
      source.endsWith(readFileSync(new URL('../tools/play_ascii.py', import.meta.url), 'utf8')),
    ).toBe(true);
    const result = runPython(source, ['--no-color']);
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(sample.frames[0].text);
  });

  it('retains the full audio bytes and timestamps, and plays video without an external ASCII file', async () => {
    const model = {
      ...sample,
      contentType: 'video',
      frames: [
        { ...sample.frames[0], durationMs: 50 },
        { timestampMs: 50, durationMs: 50, text: '12345' },
      ],
      audio: { mimeType: 'audio/webm', offsetMs: 25, dataBase64: btoa('original audio bytes') },
    };
    const source = await (await createPlayablePython(model)).text();
    const encoded = source.match(/EMBEDDED_ASCII = \(\n([\s\S]*?)\n\)/)[1].replace(/[\s"]/g, '');
    const embedded = JSON.parse(strFromU8(gunzipSync(Buffer.from(encoded, 'base64'))));
    expect(embedded).toEqual(model);
    const result = runPython(source, ['--no-audio', '--fps', '24']);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(sample.frames[0].text);
    const missingAudio = runPython(source, ['--ffplay', '/missing/ascii-gpu-ffplay']);
    expect(missingAudio.status).toBe(1);
    expect(missingAudio.stderr).toContain('ffplay non è installato');
    expect(missingAudio.stdout).toContain('\x1b[?25h');
    const silent = { ...model };
    delete silent.audio;
    const silentResult = runPython(await (await createPlayablePython(silent)).text());
    expect(silentResult.status, silentResult.stderr).toBe(0);
  });

  it('accepts normal player flags and rejects invalid FPS without starting playback', async () => {
    const source = await (await createPlayablePython(sample)).text();
    const help = runPython(source, ['--help']);
    expect(help.status).toBe(0);
    expect(help.stdout).toContain('--no-audio');
    expect(help.stdout).not.toContain('file .ascii gzip');
    const invalid = runPython(source, ['--fps', '0']);
    expect(invalid.status).toBe(2);
    expect(invalid.stderr).toContain('--fps');
  });
});
