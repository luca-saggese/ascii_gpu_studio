import { getAppearanceColors } from './core.js';
import { serializeAsciiDocument } from './ascii-document.js';
import { extractSourceAudio } from './audio-export.js';

const FRAME_INTERVAL_MS = 100;
const MAX_EXPORT_FRAMES = 18000;

function bytesToBase64(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

async function blobToBase64(blob) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Lettura della traccia audio non riuscita.'));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

function waitForSeek(video, time, signal) {
  if (Math.abs(video.currentTime - time) < 0.001) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      signal?.removeEventListener('abort', onAbort);
    };
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException('Esportazione annullata.', 'AbortError'));
    };
    video.addEventListener('seeked', onSeeked, { once: true });
    signal?.addEventListener('abort', onAbort, { once: true });
    video.currentTime = time;
  });
}

function encodeCellColors(colors) {
  return colors?.length ? bytesToBase64(new Uint8Array(colors)) : undefined;
}

function capturePage(capture, timestampMs, durationMs) {
  return {
    timestampMs,
    durationMs,
    text: capture.text,
    ...(capture.cellColors ? { colors: encodeCellColors(capture.cellColors) } : {}),
  };
}

function createDocument({ kind, scene, firstPage, audio }) {
  const {
    columns,
    rows,
    cellWidth,
    cellHeight,
    outputWidth,
    outputHeight,
    sourceWidth,
    sourceHeight,
    targetWidth,
    targetHeight,
    fontSize,
    ascent,
    descent,
    baseline,
  } = firstPage.capture;
  return {
    format: 'ascii-gpu-studio',
    version: 1,
    contentType: kind,
    filters: {
      edgeDetection: JSON.parse(
        JSON.stringify(
          scene.edgeDetection ?? {
            enabled: false,
            threshold: 1,
            smoothing: 0,
            mode: 'edges',
            intensity: 0.65,
          },
        ),
      ),
      flattenColors: {
        ...(scene.flattenColors ?? {
          enabled: false,
          colorCount: 16,
          smoothing: 4,
        }),
        palette: firstPage.capture.palette ?? [],
      },
    },
    render: {
      columns,
      rows,
      cellWidth,
      cellHeight,
      width: outputWidth,
      height: outputHeight,
      cellAspect: cellWidth / cellHeight,
      source: { width: sourceWidth, height: sourceHeight },
      target: { width: targetWidth, height: targetHeight },
      font: {
        family: firstPage.capture.vectorFamily ?? scene.typography.fontFamily,
        size: fontSize,
        weight: scene.typography.fontWeight,
        lineHeight: scene.typography.lineHeight ?? 1.3,
        ascent,
        descent,
        baseline,
        ...(firstPage.capture.vectorFontLicense
          ? { license: firstPage.capture.vectorFontLicense }
          : {}),
      },
      mode: firstPage.capture.vectorGlyphs ? 'vector' : 'bitmap',
      ...(firstPage.capture.vectorGlyphs
        ? {
            unitsPerEm: firstPage.capture.unitsPerEm,
            glyphs: { ...firstPage.capture.vectorGlyphs },
          }
        : {}),
      colors: {
        mode: scene.appearance.mode,
        ...getAppearanceColors(scene.appearance),
      },
      fit: 'contain',
    },
    frames: [firstPage.frame],
    ...(audio ? { audio } : {}),
  };
}

export async function captureAsciiDocument({
  renderer,
  scene,
  kind,
  video = null,
  sourceFile = null,
  signal,
  onProgress = () => {},
  onWarning = () => {},
  includeAudio = true,
}) {
  if (signal?.aborted) throw new DOMException('Esportazione annullata.', 'AbortError');
  if (kind === 'image') {
    const capture = renderer.captureText();
    const frame = capturePage(capture, 0, 0);
    const document = createDocument({
      kind,
      scene,
      firstPage: { frame, capture },
      audio: null,
    });
    onProgress(1);
    return document;
  }
  if (!video || !Number.isFinite(video.duration) || video.duration <= 0)
    throw new Error('La durata del video non è ancora disponibile.');
  const frameCount = Math.ceil((video.duration * 1000) / FRAME_INTERVAL_MS);
  if (frameCount > MAX_EXPORT_FRAMES)
    throw new Error('Il video supera il limite di 30 minuti per la conversione ASCII.');
  const wasPlaying = !video.paused;
  const previousTime = video.currentTime;
  try {
    let audio = null;
    if (includeAudio) {
      try {
        const extracted = await extractSourceAudio(sourceFile, {
          signal,
          duration: video.duration,
          onProgress: (progress) => onProgress(progress * 0.4),
        });
        if (extracted)
          audio = {
            mimeType: extracted.type,
            offsetMs: 0,
            dataBase64: await blobToBase64(extracted),
          };
      } catch (error) {
        if (error.name === 'AbortError') throw error;
        onWarning(`Audio non incluso: ${error.message} L’esportazione ASCII prosegue senza audio.`);
      }
    }
    await waitForSeek(video, 0, signal);
    const firstCapture = renderer.captureText();
    const firstFrame = capturePage(
      firstCapture,
      0,
      Math.min(FRAME_INTERVAL_MS, video.duration * 1000),
    );
    const document = createDocument({
      kind,
      scene,
      firstPage: { frame: firstFrame, capture: firstCapture },
      audio,
    });
    for (let index = 1; index < frameCount; index += 1) {
      if (signal?.aborted) throw new DOMException('Esportazione annullata.', 'AbortError');
      const timestampMs = index * FRAME_INTERVAL_MS;
      await waitForSeek(video, timestampMs / 1000, signal);
      const capture = renderer.captureText();
      document.frames.push(
        capturePage(
          capture,
          timestampMs,
          Math.min(FRAME_INTERVAL_MS, video.duration * 1000 - timestampMs),
        ),
      );
      if (document.render.mode === 'vector')
        Object.assign(document.render.glyphs, capture.vectorGlyphs);
      onProgress(0.4 + 0.6 * (index / Math.max(frameCount - 1, 1)));
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    onProgress(1);
    return document;
  } finally {
    await waitForSeek(video, Math.min(previousTime, Math.max(0, video.duration - 0.001)));
    if (wasPlaying) await video.play();
  }
}

export async function exportAsciiDocument(options) {
  const document = await captureAsciiDocument(options);
  return { document, bytes: await serializeAsciiDocument(document) };
}
