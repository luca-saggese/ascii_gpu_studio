import playerSource from '../../tools/play_ascii.py?raw';
import { serializeAsciiDocument } from '../ascii-document.js';

export async function createPlayablePython(asciiDocument) {
  const bytes = await serializeAsciiDocument(asciiDocument);
  let payload = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    payload += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  const encoded = btoa(payload);
  const lines = [];
  for (let offset = 0; offset < encoded.length; offset += 100)
    lines.push(`    "${encoded.slice(offset, offset + 100)}"`);
  return new Blob(
    [
      '#!/usr/bin/env python3\n',
      '# ASCII GPU Studio: embedded ASCII frames and original audio.\n',
      '# Run: python3 this_file.py [--no-audio] [--fps 24] [--no-color]\n',
      '# Video keys: Space pause/resume, Left/Right -/+10 seconds, Ctrl+C exit.\n',
      '# Audio requires FFplay from FFmpeg; no Python packages or sidecar files required.\n',
      `EMBEDDED_ASCII = (\n${lines.join('\n')}\n)\n\n`,
      playerSource,
    ],
    { type: 'text/x-python;charset=utf-8' },
  );
}
