export function renderAsciiPage(context, page, render) {
  const vectorPathCache = context.vectorPathCache ?? new Map();
  context.vectorPathCache = vectorPathCache;
  const { columns, rows, cellWidth, cellHeight, width, height, font } = render;
  const { foreground, background, mode } = render.colors;
  context.canvas.width = width;
  context.canvas.height = height;
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);
  context.font = `${font.weight} ${font.size}px ${font.family}`;
  context.textAlign = 'center';
  context.textBaseline = 'alphabetic';
  context.fillStyle = foreground;
  const lines = page.text.split('\n');
  let colors = page.cellColors ?? null;
  if (page.colors) {
    const binary = atob(page.colors);
    if (binary.length !== columns * rows * 3)
      throw new Error('Colori per cella non validi nel documento ASCII.');
    colors = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }
  if (colors && colors.length !== columns * rows * 3)
    throw new Error('Colori per cella non validi nel documento ASCII.');
  const vectorBatches = new Map();
  for (let y = 0; y < rows; y += 1) {
    const line = Array.from(lines[y] || '');
    const baseline = y * cellHeight + (cellHeight + font.ascent - font.descent) / 2;
    for (let x = 0; x < columns; x += 1) {
      const glyph = line[x] || ' ';
      if (mode === 'rgb' && colors) {
        const index = (y * columns + x) * 3;
        context.fillStyle = `rgb(${colors[index]} ${colors[index + 1]} ${colors[index + 2]})`;
      } else {
        context.fillStyle = foreground;
      }
      if (render.mode === 'vector') {
        const outline = render.glyphs?.[glyph];
        if (!outline) throw new Error(`Geometria vettoriale mancante per il glifo ${glyph}.`);
        let path = vectorPathCache.get(outline.path);
        if (!path) {
          path = new Path2D(outline.path);
          vectorPathCache.set(outline.path, path);
        }
        const scale = font.size / render.unitsPerEm;
        const left = x * cellWidth + (cellWidth - outline.advanceWidth * scale) / 2;
        const color = context.fillStyle;
        let batch = vectorBatches.get(color);
        if (!batch) {
          batch = new Path2D();
          vectorBatches.set(color, batch);
        }
        batch.addPath(path, new DOMMatrix([scale, 0, 0, scale, left, baseline]));
      } else {
        context.fillText(glyph, x * cellWidth + cellWidth / 2, baseline);
      }
    }
  }
  for (const [color, path] of vectorBatches) {
    context.fillStyle = color;
    context.fill(path, 'evenodd');
  }
  if (mode === 'bw') {
    const pixels = context.getImageData(0, 0, width, height);
    for (let offset = 0; offset < pixels.data.length; offset += 4) {
      const value =
        pixels.data[offset] * 0.2126 +
        pixels.data[offset + 1] * 0.7152 +
        pixels.data[offset + 2] * 0.0722;
      const channel = value >= 127.5 ? 255 : 0;
      pixels.data[offset] = channel;
      pixels.data[offset + 1] = channel;
      pixels.data[offset + 2] = channel;
      pixels.data[offset + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
  }
  return context.canvas;
}

export function renderAsciiPng(asciiDocument, signal) {
  if (typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined') {
    return new Promise((resolve, reject) => {
      let worker;
      const workerUrl = URL.createObjectURL(
        new Blob(
          [
            `const render=${renderAsciiPage.toString()};onmessage=async({data})=>{try{const canvas=new OffscreenCanvas(data.render.width,data.render.height);render(canvas.getContext('2d'),data.page,data.render);postMessage(await canvas.convertToBlob({type:'image/png'}))}catch(error){postMessage({error:error.message})}}`,
          ],
          { type: 'text/javascript' },
        ),
      );
      worker = new Worker(workerUrl);
      const cleanup = () => {
        worker.terminate();
        URL.revokeObjectURL(workerUrl);
        signal?.removeEventListener('abort', onAbort);
      };
      const onAbort = () => {
        cleanup();
        reject(new DOMException('Esportazione annullata.', 'AbortError'));
      };
      if (signal?.aborted) {
        onAbort();
        return;
      }
      signal?.addEventListener('abort', onAbort, { once: true });
      worker.onmessage = ({ data }) => {
        cleanup();
        if (data instanceof Blob) resolve(data);
        else reject(new Error(data.error || 'Esportazione PNG non riuscita.'));
      };
      worker.onerror = () => {
        cleanup();
        reject(new Error('Worker di rendering PNG non disponibile.'));
      };
      worker.postMessage({
        page: JSON.parse(JSON.stringify(asciiDocument.frames[0])),
        render: JSON.parse(JSON.stringify(asciiDocument.render)),
      });
    });
  }
  const canvas = globalThis.document.createElement('canvas');
  renderAsciiPage(canvas.getContext('2d'), asciiDocument.frames[0], asciiDocument.render);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('Non è stato possibile generare il PNG ASCII.')),
      'image/png',
    ),
  );
}
