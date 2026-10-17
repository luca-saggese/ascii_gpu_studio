import { Gunzip, gzipSync, strFromU8, strToU8 } from 'fflate';

const FORMAT = 'ascii-gpu-studio';
const VERSION = 1;
const MAX_COMPRESSED_BYTES = 110 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 250 * 1024 * 1024;

function codePointLength(value) {
  let count = value.length;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff && value.charCodeAt(index + 1) >= 0xdc00) count -= 1;
  }
  return count;
}

async function compress(bytes) {
  if (typeof CompressionStream === 'undefined') return gzipSync(bytes);
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function decompress(bytes) {
  if (bytes.byteLength > MAX_COMPRESSED_BYTES)
    throw new Error('Il documento .ascii supera il limite compresso di 110 MB.');
  if (typeof DecompressionStream === 'undefined') {
    const chunks = [];
    let total = 0;
    let failure = null;
    const decoder = new Gunzip((error, chunk) => {
      if (error) {
        failure = error;
        return;
      }
      total += chunk.byteLength;
      if (total > MAX_EXPANDED_BYTES) {
        failure = new Error('Il documento .ascii supera il limite decompresso di 250 MB.');
        return;
      }
      chunks.push(chunk);
    });
    decoder.push(bytes, true);
    if (failure) throw failure;
    const output = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return output;
  }
  const reader = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'))
    .getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_EXPANDED_BYTES) {
        await reader.cancel();
        throw new Error('Il documento .ascii supera il limite decompresso di 250 MB.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function validateAsciiDocument(document) {
  if (
    !document ||
    document.format !== FORMAT ||
    document.version !== VERSION ||
    !['image', 'video'].includes(document.contentType) ||
    !document.render ||
    !Array.isArray(document.frames) ||
    document.frames.length === 0
  ) {
    throw new Error('Documento ASCII non valido o versione non supportata.');
  }
  if (document.contentType === 'image' && (document.frames.length !== 1 || document.audio))
    throw new Error('Un documento immagine deve contenere una sola pagina e nessun audio.');
  const {
    columns,
    rows,
    width,
    height,
    cellWidth,
    cellHeight,
    font,
    colors,
    mode = 'bitmap',
    unitsPerEm,
    glyphs,
  } = document.render;
  let previousTimestamp = -1;
  const invalidFrame = document.frames.some((frame) => {
    const lines = typeof frame?.text === 'string' ? frame.text.split('\n') : [];
    let invalidColor = false;
    if (frame?.colors !== undefined && frame.colors !== null) {
      try {
        invalidColor =
          typeof frame.colors !== 'string' ||
          !/^[\da-z+/]+={0,2}$/i.test(frame.colors) ||
          atob(frame.colors).length !== columns * rows * 3;
      } catch {
        invalidColor = true;
      }
    }
    const invalidTiming =
      !Number.isFinite(frame?.timestampMs) ||
      !Number.isFinite(frame?.durationMs) ||
      frame?.timestampMs < 0 ||
      frame?.durationMs < 0 ||
      frame?.timestampMs <= previousTimestamp;
    previousTimestamp = frame?.timestampMs;
    return (
      lines.length !== rows ||
      lines.some((line) => codePointLength(line) !== columns) ||
      (mode === 'vector' &&
        Array.from(lines.join('')).some((glyph) => !Object.hasOwn(glyphs ?? {}, glyph))) ||
      invalidColor ||
      invalidTiming
    );
  });
  if (
    ![columns, rows, width, height, cellWidth, cellHeight].every(
      (value) => Number.isInteger(value) && value > 0,
    ) ||
    width !== columns * cellWidth ||
    height !== rows * cellHeight ||
    !font ||
    typeof font.family !== 'string' ||
    !Number.isFinite(font.size) ||
    !Number.isFinite(font.weight) ||
    !Number.isFinite(font.ascent) ||
    !Number.isFinite(font.descent) ||
    (mode === 'vector' &&
      (!font.license ||
        font.license.license !== 'SIL Open Font License 1.1' ||
        typeof font.license.copyright !== 'string')) ||
    !['bitmap', 'vector'].includes(mode) ||
    (mode === 'vector' &&
      (!Number.isFinite(unitsPerEm) ||
        unitsPerEm <= 0 ||
        !glyphs ||
        typeof glyphs !== 'object' ||
        Object.values(glyphs).some(
          (glyph) =>
            !glyph ||
            typeof glyph.path !== 'string' ||
            !Number.isFinite(glyph.advanceWidth) ||
            glyph.advanceWidth < 0,
        ))) ||
    !colors ||
    !['mono', 'rgb'].includes(colors.mode) ||
    !/^#[\da-f]{6}$/i.test(colors.foreground) ||
    !/^#[\da-f]{6}$/i.test(colors.background) ||
    invalidFrame
  ) {
    throw new Error('Dimensioni o pagine del documento ASCII non valide.');
  }
  if (
    document.audio &&
    (typeof document.audio.mimeType !== 'string' ||
      !Number.isFinite(document.audio.offsetMs) ||
      typeof document.audio.dataBase64 !== 'string' ||
      !/^[\da-z+/]+={0,2}$/i.test(document.audio.dataBase64))
  )
    throw new Error('Traccia audio non valida nel documento ASCII.');
  return document;
}

export async function serializeAsciiDocument(document) {
  validateAsciiDocument(document);
  return compress(strToU8(JSON.stringify(document)));
}

export async function deserializeAsciiDocument(input) {
  const bytes =
    input instanceof Blob
      ? new Uint8Array(await input.arrayBuffer())
      : input instanceof Uint8Array
        ? input
        : new Uint8Array(input);
  try {
    const document = JSON.parse(strFromU8(await decompress(bytes)));
    return validateAsciiDocument(document);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Documento ASCII')) throw error;
    throw new Error('Il file .ascii non è un documento gzip valido.');
  }
}

export { validateAsciiDocument };
