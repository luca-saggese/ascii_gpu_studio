export const DEFAULT_SCENE = Object.freeze({
  version: 1,
  grid: { maxCells: 40000 },
  typography: {
    charset: ' .,:;irsXA253hMHGS#9B&@',
    fontFamily: 'IBM Plex Mono',
    fontSize: 14,
    lineHeight: 1.3,
    fontWeight: 500,
  },
  rendering: { mode: 'bitmap' },
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
  const columns = scene?.grid?.columns === undefined ? undefined : Number(scene.grid.columns);
  const charset = scene?.typography?.charset;
  const maxCells = Number(scene?.grid?.maxCells);
  const fontSize = Number(scene?.typography?.fontSize);
  const lineHeight = Number(scene?.typography?.lineHeight ?? 1.3);
  const brightness = Number(scene?.appearance?.brightness);
  const contrast = Number(scene?.appearance?.contrast);
  const gamma = Number(scene?.appearance?.gamma);
  const edge = scene?.edgeDetection ?? DEFAULT_SCENE.edgeDetection;
  const flatten = scene?.flattenColors ?? DEFAULT_SCENE.flattenColors;
  const rendering = scene?.rendering ?? DEFAULT_SCENE.rendering;
  if (columns !== undefined && (!Number.isInteger(columns) || columns < 16 || columns > 320))
    throw new Error('Il limite storico della griglia deve essere da 16 a 320 colonne.');
  if (!Number.isInteger(maxCells) || maxCells < 1 || maxCells > 100000)
    throw new Error('Il limite celle deve essere un intero tra 1 e 100.000.');
  if (
    typeof charset !== 'string' ||
    Array.from(new Set(Array.from(charset))).length < 2 ||
    Array.from(charset).length > 128
  ) {
    throw new Error('Il charset deve contenere da 2 a 128 glifi.');
  }
  if (!Number.isFinite(fontSize) || fontSize < 4 || fontSize > 96)
    throw new Error('La dimensione del font deve essere compresa tra 4 e 96 px.');
  if (!Number.isFinite(lineHeight) || lineHeight < 1 || lineHeight > 2)
    throw new Error('L’interlinea deve essere compresa tra 1 e 2.');
  if (!Number.isFinite(brightness) || brightness < -1 || brightness > 1)
    throw new Error('La luminosità deve essere compresa tra -1 e 1.');
  if (!Number.isFinite(contrast) || contrast < 0.2 || contrast > 3)
    throw new Error('Il contrasto deve essere compreso tra 0,2 e 3.');
  if (!Number.isFinite(gamma) || gamma < 0.05 || gamma > 5)
    throw new Error('Il gamma deve essere compreso tra 0,05 e 5.');
  if (!['mono', 'rgb', 'bw'].includes(scene.appearance.mode))
    throw new Error('Modalità colore non supportata.');
  if (!['contain', 'cover', 'stretch'].includes(scene.appearance.fit))
    throw new Error('Modalità di adattamento non supportata.');
  if (!['bitmap', 'vector'].includes(rendering.mode))
    throw new Error('Modalità di rendering dei glifi non supportata.');
  if (
    ![
      'IBM Plex Mono',
      'Cousine',
      'Lora',
      'monospace',
      'Courier New',
      'ui-monospace',
      'serif',
    ].includes(scene.typography.fontFamily)
  )
    throw new Error('Font non supportato.');
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

export function getAppearanceColors(appearance) {
  if (appearance.mode === 'bw') return { foreground: '#ffffff', background: '#000000' };
  return { foreground: appearance.foreground, background: appearance.background };
}

export function fontFamilyFor(fontFamily) {
  if (fontFamily === 'Courier New' || fontFamily === 'Cousine') return 'Cousine';
  return 'IBM Plex Mono';
}

export function calculateContentLayout(
  sourceWidth,
  sourceHeight,
  cellWidth,
  cellHeight,
  maxCells = 40000,
) {
  if (
    ![sourceWidth, sourceHeight, cellWidth, cellHeight, maxCells].every(Number.isFinite) ||
    sourceWidth <= 0 ||
    sourceHeight <= 0 ||
    cellWidth < 1 ||
    cellHeight < 1 ||
    !Number.isInteger(maxCells) ||
    maxCells < 1
  ) {
    throw new Error('Dimensioni della sorgente o delle celle non valide.');
  }
  const scale = Math.min(1024 / sourceWidth, 576 / sourceHeight);
  const targetWidth = sourceWidth * scale;
  const targetHeight = sourceHeight * scale;
  let columns = Math.floor(targetWidth / cellWidth);
  let rows = Math.floor(targetHeight / cellHeight);
  if (columns < 1 || rows < 1) {
    throw new Error(
      'Il font selezionato non permette almeno una cella per asse entro 1024 × 576 px. Riduci dimensione o interlinea.',
    );
  }
  if (columns * rows > maxCells) {
    const reduction = Math.sqrt(maxCells / (columns * rows));
    columns = Math.max(1, Math.floor(columns * reduction));
    rows = Math.max(1, Math.floor(rows * reduction));
    while (columns * rows > maxCells) {
      if (columns / targetWidth > rows / targetHeight) columns -= 1;
      else rows -= 1;
    }
  }
  const outputWidth = columns * cellWidth;
  const outputHeight = rows * cellHeight;
  return {
    sourceWidth,
    sourceHeight,
    targetWidth,
    targetHeight,
    columns,
    rows,
    cellWidth,
    cellHeight,
    outputWidth,
    outputHeight,
    aspectRatio: outputWidth / outputHeight,
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
