export const DEFAULT_SCENE = Object.freeze({
  version: 1,
  grid: { columns: 96, maxCells: 40000 },
  typography: {
    charset: ' .,:;irsXA253hMHGS#9B&@',
    fontFamily: 'monospace',
    fontSize: 14,
    fontWeight: 500,
  },
  appearance: {
    mode: 'mono',
    foreground: '#d5f5e9',
    background: '#101715',
    brightness: 0,
    contrast: 1,
    gamma: 1,
    invert: false,
    fit: 'contain',
  },
  edgeDetection: {
    enabled: false,
    threshold: 56,
    smoothing: 0,
    mode: 'edges',
    intensity: 0.65,
  },
  flattenColors: { enabled: false, colorCount: 16, smoothing: 4 },
  playback: { loop: true, autoplay: false, muted: false, volume: 1 },
});

export function validateScene(scene) {
  const columns = Number(scene?.grid?.columns);
  const charset = scene?.typography?.charset;
  const maxCells = Number(scene?.grid?.maxCells);
  const fontSize = Number(scene?.typography?.fontSize);
  const brightness = Number(scene?.appearance?.brightness);
  const contrast = Number(scene?.appearance?.contrast);
  const gamma = Number(scene?.appearance?.gamma);
  const edge = scene?.edgeDetection ?? DEFAULT_SCENE.edgeDetection;
  const flatten = scene?.flattenColors ?? DEFAULT_SCENE.flattenColors;
  if (!Number.isInteger(columns) || columns < 16 || columns > 320)
    throw new Error('La griglia deve avere da 16 a 320 colonne.');
  if (!Number.isInteger(maxCells) || maxCells < columns || maxCells > 100000)
    throw new Error('Il limite celle deve essere un intero tra le colonne e 100.000.');
  if (
    typeof charset !== 'string' ||
    Array.from(new Set(Array.from(charset))).length < 2 ||
    Array.from(charset).length > 128
  ) {
    throw new Error('Il charset deve contenere da 2 a 128 glifi.');
  }
  if (!Number.isFinite(fontSize) || fontSize < 4 || fontSize > 96)
    throw new Error('La dimensione del font deve essere compresa tra 4 e 96 px.');
  if (!Number.isFinite(brightness) || brightness < -1 || brightness > 1)
    throw new Error('La luminosità deve essere compresa tra -1 e 1.');
  if (!Number.isFinite(contrast) || contrast < 0.2 || contrast > 3)
    throw new Error('Il contrasto deve essere compreso tra 0,2 e 3.');
  if (!Number.isFinite(gamma) || gamma < 0.05 || gamma > 5)
    throw new Error('Il gamma deve essere compreso tra 0,05 e 5.');
  if (!['mono', 'rgb'].includes(scene.appearance.mode))
    throw new Error('Modalità colore non supportata.');
  if (!['contain', 'cover', 'stretch'].includes(scene.appearance.fit))
    throw new Error('Modalità di adattamento non supportata.');
  if (
    typeof edge?.enabled !== 'boolean' ||
    !Number.isInteger(edge.threshold) ||
    edge.threshold < 0 ||
    edge.threshold > 255 ||
    !Number.isInteger(edge.smoothing) ||
    edge.smoothing < 0 ||
    edge.smoothing > 3 ||
    !['edges', 'image'].includes(edge.mode) ||
    !Number.isFinite(edge.intensity) ||
    edge.intensity < 0 ||
    edge.intensity > 1
  )
    throw new Error('Impostazioni Edge Detection non valide.');
  if (
    typeof flatten?.enabled !== 'boolean' ||
    !Number.isInteger(flatten.colorCount) ||
    flatten.colorCount < 2 ||
    flatten.colorCount > 64 ||
    !Number.isInteger(flatten.smoothing) ||
    flatten.smoothing < 0 ||
    flatten.smoothing > 10
  )
    throw new Error('Impostazioni Flatten Colors non valide.');
  for (const value of [scene.appearance.foreground, scene.appearance.background]) {
    if (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value))
      throw new Error('I colori devono essere valori esadecimali #RRGGBB.');
  }
  return true;
}

export function gridForSource(width, height, columns, cellAspect = 0.58) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  return {
    columns,
    rows: Math.max(1, Math.round(((columns * safeHeight) / safeWidth) * cellAspect)),
  };
}

export function coverageOrder(characters, fontFamily = 'monospace', size = 32, weight = 400) {
  const canvas = document.createElement('canvas');
  canvas.width = size * 2;
  canvas.height = size * 2;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return Array.from(characters);
  context.font = `${weight} ${size}px ${fontFamily}`;
  context.textBaseline = 'top';
  return Array.from(new Set(Array.from(characters)))
    .map((glyph) => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillText(glyph, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let coverage = 0;
      for (let i = 3; i < pixels.length; i += 4) coverage += pixels[i];
      return { glyph, coverage };
    })
    .sort((a, b) => a.coverage - b.coverage)
    .map(({ glyph }) => glyph);
}
