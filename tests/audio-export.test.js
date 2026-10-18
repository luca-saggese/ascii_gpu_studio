import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  Input,
  Output,
  WebMOutputFormat,
} from 'mediabunny';
import { extractSourceAudio } from '../src/audio-export.js';
import { captureAsciiDocument } from '../src/ascii-export.js';
import { DEFAULT_SCENE } from '../src/core.js';

async function fixture(name) {
  return new Blob([await readFile(new URL(`./fixtures/${name}`, import.meta.url))]);
}

function openInput(blob) {
  return new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) });
}

async function readAudio(input) {
  const track = await input.getPrimaryAudioTrack();
  const packets = [];
  for await (const packet of new EncodedPacketSink(track).packets()) packets.push(packet);
  return { codec: await track.getCodec(), packets };
}

describe('local source audio extraction', () => {
  it('copies only original audio packets without changing their bytes or timestamps', async () => {
    const file = await fixture('motion-with-audio.webm');
    const audio = await extractSourceAudio(file);
    expect(audio.type).toBe('audio/webm');
    const original = openInput(file);
    const extracted = openInput(audio);
    try {
      expect(await extracted.getVideoTracks()).toHaveLength(0);
      const before = await readAudio(original);
      const after = await readAudio(extracted);
      expect(after.codec).toBe('opus');
      expect(after.packets.length).toBeGreaterThan(0);
      expect(after.packets).toHaveLength(before.packets.length);
      for (let index = 0; index < before.packets.length; index += 1) {
        expect(after.packets[index].data).toEqual(before.packets[index].data);
        expect(after.packets[index].timestamp).toBeCloseTo(before.packets[index].timestamp, 3);
      }
    } finally {
      original.dispose();
      extracted.dispose();
    }
  });

  it('preserves a delayed audio start instead of shifting it to the video start', async () => {
    const input = openInput(await fixture('motion-with-audio.webm'));
    const target = new BufferTarget();
    const output = new Output({ format: new WebMOutputFormat(), target });
    const source = new EncodedAudioPacketSource('opus');
    output.addAudioTrack(source);
    try {
      const track = await input.getPrimaryAudioTrack();
      const decoderConfig = await track.getDecoderConfig();
      await output.start();
      for await (const packet of new EncodedPacketSink(track).packets())
        await source.add(packet.clone({ timestamp: packet.timestamp + 0.5 }), { decoderConfig });
      source.close();
      await output.finalize();
    } finally {
      input.dispose();
    }
    const delayed = new Blob([target.buffer]);
    const original = openInput(delayed);
    const extracted = openInput(await extractSourceAudio(delayed));
    try {
      const before = await readAudio(original);
      const after = await readAudio(extracted);
      expect(after.packets[0].timestamp).toBeGreaterThan(0.4);
      expect(after.packets[0].timestamp).toBeCloseTo(before.packets[0].timestamp, 3);
    } finally {
      original.dispose();
      extracted.dispose();
    }
  });

  it('returns no audio for a silent source', async () => {
    expect(await extractSourceAudio(await fixture('video-silent.webm'))).toBeNull();
  });

  it('reports missing and unreadable files instead of returning silent success', async () => {
    await expect(extractSourceAudio(null)).rejects.toThrow(/originale/);
    await expect(extractSourceAudio(new Blob(['invalid media']))).rejects.toThrow();
  });

  it('honors cancellation before and during packet extraction', async () => {
    const file = await fixture('motion-with-audio.webm');
    const controller = new AbortController();
    controller.abort();
    await expect(extractSourceAudio(file, { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    const running = new AbortController();
    await expect(
      extractSourceAudio(file, {
        duration: 3,
        signal: running.signal,
        onProgress: () => running.abort(),
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('warns explicitly but still exports frames if source audio extraction fails', async () => {
    const warnings = [];
    const model = await captureAsciiDocument({
      kind: 'video',
      scene: DEFAULT_SCENE,
      video: { duration: 0.05, currentTime: 0, paused: true },
      sourceFile: new Blob(['unreadable video']),
      renderer: {
        captureText: () => ({
          text: '@',
          columns: 1,
          rows: 1,
          cellWidth: 8,
          cellHeight: 12,
          outputWidth: 8,
          outputHeight: 12,
        }),
      },
      onWarning: (warning) => warnings.push(warning),
    });
    expect(model.frames).toHaveLength(1);
    expect(model).not.toHaveProperty('audio');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Audio non incluso:');
    expect(warnings[0]).toContain('L’esportazione ASCII prosegue senza audio');
  });
});
