import { test, expect } from '@playwright/test';
import { gunzipSync, strFromU8, strToU8, zipSync } from 'fflate';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

test('renders a polished empty state and adapts to mobile width', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Turn pixels into something different.' }),
  ).toBeVisible();
  await expect(page.getByText('Private by design')).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/empty-state.png' });
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      viewport.width,
    );
  }
});

test('renders true black and white without coloring glyphs', async ({ page }) => {
  await page.goto('/');
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 96;
    const context = canvas.getContext('2d');
    const image = context.createImageData(canvas.width, canvas.height);
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const offset = (y * canvas.width + x) * 4;
        image.data[offset] = Math.round((x / (canvas.width - 1)) * 255);
        image.data[offset + 1] = 255 - image.data[offset];
        image.data[offset + 2] = (y % 2) * 180;
        image.data[offset + 3] = 255;
      }
    }
    context.putImageData(image, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.locator('input[type=file]').setInputFiles({
    name: 'color-gradient.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });

  await page.getByRole('button', { name: 'Black and white' }).click();
  await expect(page.getByLabel('Ink color')).toBeDisabled();
  await expect(page.getByLabel('Canvas')).toBeDisabled();
  await expect(page.locator('.color-row code').nth(0)).toHaveText('#FFFFFF');
  await expect(page.locator('.color-row code').nth(1)).toHaveText('#000000');
  const bitmap = page.locator('canvas[aria-label="ASCII rendering preview"]');
  const bitmapColors = await bitmap.evaluate((canvas) => {
    const gl = canvas.getContext('webgl2');
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let black = 0;
    let white = 0;
    let invalid = false;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const [red, green, blue] = pixels.slice(offset, offset + 3);
      if (red !== green || green !== blue || (red !== 0 && red !== 255)) invalid = true;
      if (red === 0) black += 1;
      else if (red === 255) white += 1;
    }
    return { black, white, invalid };
  });
  expect(bitmapColors).toMatchObject({ invalid: false });
  expect(bitmapColors.black).toBeGreaterThan(0);
  expect(bitmapColors.white).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'ASCII text' }).click();
  const text = await page.locator('.ascii-preview pre').textContent();
  const textCanvas = page.getByLabel('Plain text ASCII preview');
  await expect(textCanvas).toBeVisible();
  const selectedText = await textCanvas.evaluate((element) => {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
    return {
      text: selection.toString(),
      userSelect: getComputedStyle(element).userSelect,
    };
  });
  expect(selectedText.text).toBe(text);
  expect(selectedText.userSelect).not.toBe('none');
  await page.evaluate(() => window.getSelection().removeAllRanges());
  const dimensions = await bitmap.evaluate((canvas) => ({
    width: Number(canvas.dataset.outputWidth),
    height: Number(canvas.dataset.outputHeight),
  }));
  const previewBounds = await textCanvas.boundingBox();
  expect(
    Math.abs(previewBounds.width / previewBounds.height - dimensions.width / dimensions.height),
  ).toBeLessThan(0.02);
  expect(new Set(text.replaceAll('\n', '')).size).toBeGreaterThan(2);
  await page.getByRole('button', { name: 'GPU', exact: true }).click();
  await page.getByLabel('Rendering vettoriale').check();
  const vector = page.locator('canvas[aria-label="ASCII vector rendering preview"]');
  const vectorColors = await vector.evaluate((canvas) => {
    const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    for (let offset = 0; offset < data.length; offset += 4) {
      if (
        data[offset] !== data[offset + 1] ||
        data[offset + 1] !== data[offset + 2] ||
        (data[offset] !== 0 && data[offset] !== 255)
      )
        return false;
    }
    return true;
  });
  expect(vectorColors).toBe(true);

  const pngDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export/ }).click();
  await page.getByRole('menuitem', { name: 'Export PNG' }).click();
  const pngBytes = await readFile(await (await pngDownload).path());
  expect(pngBytes.readUInt32BE(16)).toBe(dimensions.width);
  expect(pngBytes.readUInt32BE(20)).toBe(dimensions.height);
  const pngIsBinary = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let offset = 0; offset < data.length; offset += 4) {
      if (
        data[offset] !== data[offset + 1] ||
        data[offset + 1] !== data[offset + 2] ||
        (data[offset] !== 0 && data[offset] !== 255)
      )
        return false;
    }
    return true;
  }, pngBytes.toString('base64'));
  expect(pngIsBinary).toBe(true);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export/ }).click();
  await page.getByRole('menuitem', { name: 'Export ASCII' }).click();
  const document = JSON.parse(strFromU8(gunzipSync(await readFile(await (await download).path()))));
  expect(document.render.colors).toEqual({
    mode: 'bw',
    foreground: '#ffffff',
    background: '#000000',
  });
  expect(document.frames[0]).not.toHaveProperty('colors');
  expect(document.frames[0].text).toBe(text);
  expect(new Set(document.frames[0].text.replaceAll('\n', '')).size).toBeGreaterThan(2);
});

test('saves parameter defaults for reset and future sessions', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#font-size')).toHaveAttribute('min', '4');
  await expect(page.locator('#font-size')).toHaveAttribute('max', '16');
  await expect(page.locator('#font-size')).toHaveValue('8');
  await expect(page.locator('#line-height')).toHaveAttribute('min', '0.8');
  await expect(page.locator('#line-height')).toHaveAttribute('max', '1.5');
  await expect(page.locator('#line-height')).toHaveValue('1');
  await expect(page.locator('#contrast')).toHaveAttribute('min', '0.4');
  await expect(page.locator('#contrast')).toHaveAttribute('max', '1');
  await expect(page.locator('#contrast')).toHaveValue('0.4');
  await page.getByLabel('Enable edge detection').check();
  await expect(page.locator('#edge-threshold')).toHaveAttribute('max', '100');
  await expect(page.locator('#edge-smoothing')).toHaveValue('0');
  await page.locator('#font-size').fill('16');
  await page.locator('#line-height').fill('1.5');
  await page.getByLabel('Threshold value').fill('91');
  await page.getByRole('button', { name: 'Save defaults' }).click();
  await expect(page.getByText('Parametri predefiniti salvati')).toBeVisible();
  await page.locator('#font-size').fill('12');
  await page.locator('#line-height').fill('1.1');
  await page.getByLabel('Enable edge detection').uncheck();
  await page.locator('.panel-heading-actions .icon-button').click();
  await expect(page.locator('#font-size')).toHaveValue('16');
  await expect(page.locator('#line-height')).toHaveValue('1.5');
  await expect(page.getByLabel('Enable edge detection')).toBeChecked();
  await expect(page.getByLabel('Threshold value')).toHaveValue('91');
  await page.reload();
  await expect(page.locator('#font-size')).toHaveValue('16');
  await expect(page.locator('#line-height')).toHaveValue('1.5');
  await expect(page.getByLabel('Enable edge detection')).toBeChecked();
  await expect(page.getByLabel('Threshold value')).toHaveValue('91');
});

test('keeps settings scrolling inside the panel and makes every group collapsible', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  const groups = page.locator('.inspector-section');
  await expect(groups).toHaveCount(5);
  const scrollMetrics = await page.locator('.settings-scroll').evaluate((element) => ({
    overflowY: getComputedStyle(element).overflowY,
    canScroll: element.scrollHeight > element.clientHeight,
  }));
  expect(scrollMetrics).toEqual({ overflowY: 'auto', canScroll: true });
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight),
  ).toBe(true);
  const edgeGroup = groups.filter({ has: page.getByRole('heading', { name: 'Edge Detection' }) });
  await edgeGroup.locator('summary').click();
  await expect(edgeGroup).not.toHaveAttribute('open', '');
  await edgeGroup.locator('summary').click();
  await expect(edgeGroup).toHaveAttribute('open', '');
});

test('imports an image, renders through WebGL2, and exports the source project', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  const png = await page.evaluate(async () => {
    const image = new Image();
    image.src = '/tests/fixtures/studio-sample.svg';
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext('2d').drawImage(image, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];
  });

  await page.locator('input[type=file]').setInputFiles({
    name: 'studio-sample.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  await page.getByRole('button', { name: /Export/ }).click();
  await expect(page.getByRole('menuitem', { name: 'Export ASCII' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Export PNG' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Export HTML playable' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Export video (.mp4)' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await page.getByRole('button', { name: /Export/ }).click();
  await page.locator('.breadcrumbs').click();
  await expect(page.getByRole('menu')).toHaveCount(0);
  const canvas = page.locator('canvas[aria-label="ASCII rendering preview"]');
  await expect(canvas).toHaveAttribute('data-columns', /[1-9]\d*/);
  await expect(canvas).toHaveAttribute('data-rows', /[1-9]/);
  await expect(page.locator('#font-size')).toHaveAttribute('max', '16');
  await expect(page.getByText('Character size')).toHaveCount(0);
  await expect
    .poll(() => canvas.getAttribute('data-atlas-scale').then(Number))
    .toBeGreaterThanOrEqual(4);
  await expect(page.getByText('LIVE PREVIEW')).toBeVisible();
  const cellAspect = await canvas.evaluate((element) => element.width / element.height);
  const contentAspect = await canvas.evaluate(
    (element) => Number(element.dataset.outputWidth) / Number(element.dataset.outputHeight),
  );
  expect(Math.abs(cellAspect - contentAspect)).toBeLessThan(0.01);
  const glyphShapeStats = await canvas.evaluate((element) => {
    const gl = element.getContext('webgl2');
    const pixels = new Uint8Array(element.width * element.height * 4);
    gl.readPixels(0, 0, element.width, element.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const columns = Number(element.dataset.columns);
    const rows = Number(element.dataset.rows);
    let variedCells = 0;
    const glyphMasks = new Set();
    for (let cellY = 0; cellY < rows; cellY += 1) {
      for (let cellX = 0; cellX < columns; cellX += 1) {
        const xStart = Math.floor((cellX * element.width) / columns);
        const xEnd = Math.floor(((cellX + 1) * element.width) / columns);
        const yStart = Math.floor((cellY * element.height) / rows);
        const yEnd = Math.floor(((cellY + 1) * element.height) / rows);
        let horizontalVariation = false;
        let signature = '';
        for (let sampleY = 0; sampleY < 8; sampleY += 1) {
          for (let sampleX = 0; sampleX < 5; sampleX += 1) {
            const x = Math.min(
              xEnd - 1,
              xStart + Math.floor(((sampleX + 0.5) * (xEnd - xStart)) / 5),
            );
            const y = Math.min(
              yEnd - 1,
              yStart + Math.floor(((sampleY + 0.5) * (yEnd - yStart)) / 8),
            );
            const offset = ((element.height - 1 - y) * element.width + x) * 4;
            signature += pixels[offset] + pixels[offset + 1] + pixels[offset + 2] > 360 ? '1' : '0';
          }
        }
        glyphMasks.add(signature);
        for (let y = yStart; y < yEnd && !horizontalVariation; y += 1) {
          let firstPixel = -1;
          for (let x = xStart; x < xEnd; x += 1) {
            const offset = ((element.height - 1 - y) * element.width + x) * 4;
            const luminance = pixels[offset] + pixels[offset + 1] + pixels[offset + 2];
            if (firstPixel !== -1 && Math.abs(luminance - firstPixel) > 90) {
              horizontalVariation = true;
              break;
            }
            firstPixel = luminance;
          }
        }
        if (horizontalVariation) variedCells += 1;
      }
    }
    return { variedCells, uniqueGlyphs: glyphMasks.size };
  });
  expect(glyphShapeStats.variedCells).toBeGreaterThan(0);
  expect(glyphShapeStats.uniqueGlyphs).toBeGreaterThan(4);
  await expect(page.locator('.stage-status')).toContainText('px');
  const renderedRows = Number(await canvas.getAttribute('data-rows'));
  await page.screenshot({ path: 'docs/screenshots/image-preview.png' });
  await page.getByRole('button', { name: 'ASCII text' }).click();
  const textPreview = page.getByLabel('Plain text ASCII preview');
  await expect(textPreview).toBeVisible();
  await expect(page.locator('.stage-status')).toContainText('text chars');
  const textRows = await page.locator('.ascii-preview pre').textContent();
  expect(textRows.split('\n')).toHaveLength(renderedRows);
  expect(textRows).toMatch(/[@#XMAHGS]/);
  await page.screenshot({ path: 'docs/screenshots/plain-text-ascii.png' });
  await page.getByRole('button', { name: 'GPU', exact: true }).click();
  await expect(canvas).toBeVisible();
  const before = await canvas.evaluate((element) => element.toDataURL());
  const originalDimensions = await canvas.evaluate((element) => ({
    width: element.dataset.outputWidth,
    height: element.dataset.outputHeight,
  }));
  await page.locator('#font-size').fill('12');
  await expect
    .poll(() => canvas.getAttribute('data-output-width'))
    .not.toBe(originalDimensions.width);
  const after = await canvas.evaluate((element) => element.toDataURL());
  expect(after).not.toBe(before);
  await page.getByRole('button', { name: 'Source color' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export/ }).click();
  await page.getByRole('menuitem', { name: 'Export ASCII' }).click();
  const projectDownload = await download;
  expect(projectDownload.suggestedFilename()).toBe('studio-sample.ascii');
  const asciiBytes = await readFile(await projectDownload.path());
  expect(asciiBytes.subarray(0, 2)).toEqual(Buffer.from([0x1f, 0x8b]));
  const asciiDocument = JSON.parse(strFromU8(gunzipSync(asciiBytes)));
  expect(asciiDocument.contentType).toBe('image');
  expect(asciiDocument.render.columns).toBeGreaterThan(0);
  expect(asciiDocument.render.width).toBe(
    asciiDocument.render.columns * asciiDocument.render.cellWidth,
  );
  expect(asciiDocument.render.height).toBe(
    asciiDocument.render.rows * asciiDocument.render.cellHeight,
  );
  expect(asciiDocument.render.width).toBeLessThanOrEqual(1024);
  expect(asciiDocument.render.height).toBeLessThanOrEqual(576);
  expect(asciiDocument.frames).toHaveLength(1);
  expect(asciiDocument.frames[0].colors).toBeTruthy();
  expect(asciiDocument).not.toHaveProperty('source');
  expect(asciiDocument).not.toHaveProperty('thumbnail');
  await page.locator('input[type=file]').setInputFiles({
    name: projectDownload.suggestedFilename(),
    mimeType: 'application/gzip',
    buffer: asciiBytes,
  });
  await expect(page.locator('.ascii-preview pre')).toContainText(/[@#XMAHGS]/);
  const pngDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export/ }).click();
  await page.getByRole('menuitem', { name: 'Export PNG' }).click();
  const pngPath = await (await pngDownload).path();
  const pngBytes = await readFile(pngPath);
  expect(pngBytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(pngBytes.readUInt32BE(16)).toBe(asciiDocument.render.width);
  expect(pngBytes.readUInt32BE(20)).toBe(asciiDocument.render.height);
  const pngDataUrl = `data:image/png;base64,${pngBytes.toString('base64')}`;
  const htmlDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export/ }).click();
  await page.getByRole('menuitem', { name: 'Export HTML playable' }).click();
  const playable = await htmlDownload;
  expect(playable.suggestedFilename()).toBe('studio-sample-playable.html');
  const playablePath = testInfo.outputPath('studio-sample-playable.html');
  await writeFile(playablePath, await readFile(await playable.path()));
  const offlinePage = await page.context().newPage();
  await offlinePage.goto(pathToFileURL(playablePath).href);
  await expect(offlinePage.locator('canvas')).toHaveJSProperty('width', asciiDocument.render.width);
  await expect(offlinePage.locator('canvas')).toHaveJSProperty(
    'height',
    asciiDocument.render.height,
  );
  await expect(offlinePage.getByRole('status')).toHaveText('');
  const matchesPng = await offlinePage.evaluate(async (sourceUrl) => {
    const image = new Image();
    image.src = sourceUrl;
    await image.decode();
    const expectedCanvas = document.createElement('canvas');
    expectedCanvas.width = image.naturalWidth;
    expectedCanvas.height = image.naturalHeight;
    const expectedContext = expectedCanvas.getContext('2d');
    expectedContext.drawImage(image, 0, 0);
    const actualContext = document.querySelector('canvas').getContext('2d');
    const expected = expectedContext.getImageData(
      0,
      0,
      image.naturalWidth,
      image.naturalHeight,
    ).data;
    const actual = actualContext.getImageData(0, 0, image.naturalWidth, image.naturalHeight).data;
    for (let offset = 0; offset < expected.length; offset += 997) {
      if (expected[offset] !== actual[offset]) return false;
    }
    return true;
  }, pngDataUrl);
  expect(matchesPng).toBe(true);
  await offlinePage.close();
});

test('keeps the image preview working when WebGL2 context creation is unavailable', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (type === 'webgl2') return null;
      return getContext.call(this, type, ...args);
    };
  });
  await page.goto('/');
  const svg = await readFile(new URL('../../tests/fixtures/studio-sample.svg', import.meta.url));
  await page.locator('input[type=file]').setInputFiles({
    name: 'studio-sample.svg',
    mimeType: 'image/svg+xml',
    buffer: svg,
  });

  const canvas = page.locator('canvas[aria-label="ASCII rendering preview"]');
  await expect(canvas).toHaveAttribute('data-columns', /[1-9]\d*/);
  await expect(page.locator('.render-badge')).toContainText('Canvas2D fallback');
  await expect(page.locator('.toast')).toContainText('anteprima attiva con Canvas 2D');
  const rendered = await canvas.evaluate((element) => {
    const context = element.getContext('2d');
    const { data } = context.getImageData(0, 0, element.width, element.height);
    return data.some((channel, index) => index % 4 !== 3 && channel !== 0);
  });
  expect(rendered).toBe(true);
});

test('shares contained logical dimensions across bitmap, vector, PNG, and the offline player', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  const bitmap = page.locator('canvas[aria-label="ASCII rendering preview"]');
  const vector = page.locator('canvas[aria-label="ASCII vector rendering preview"]');
  const sources = [
    { width: 1920, height: 1080, targetWidth: 1024, targetHeight: 576 },
    { width: 1080, height: 1920, targetWidth: 324, targetHeight: 576 },
    { width: 1000, height: 1000, targetWidth: 576, targetHeight: 576 },
  ];
  let finalLayout;
  for (const source of sources) {
    const svg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${source.width}" height="${source.height}" viewBox="0 0 ${source.width} ${source.height}"><rect width="100%" height="100%" fill="#456"/><circle cx="${source.width / 2}" cy="${source.height / 2}" r="${Math.min(source.width, source.height) / 4}" fill="#eee"/></svg>`,
    );
    await page.locator('input[type=file]').setInputFiles({
      name: `layout-${source.width}x${source.height}.svg`,
      mimeType: 'image/svg+xml',
      buffer: svg,
    });
    await expect(bitmap).toHaveAttribute('data-source-width', String(source.width));
    const layout = await bitmap.evaluate((element) =>
      Object.fromEntries(
        [
          'sourceWidth',
          'sourceHeight',
          'columns',
          'rows',
          'cellWidth',
          'cellHeight',
          'outputWidth',
          'outputHeight',
        ].map((key) => [key, Number(element.dataset[key])]),
      ),
    );
    expect(layout.outputWidth).toBe(layout.columns * layout.cellWidth);
    expect(layout.outputHeight).toBe(layout.rows * layout.cellHeight);
    expect(layout.outputWidth).toBeLessThanOrEqual(source.targetWidth);
    expect(layout.outputHeight).toBeLessThanOrEqual(source.targetHeight);
    expect(layout.outputWidth).toBeLessThanOrEqual(1024);
    expect(layout.outputHeight).toBeLessThanOrEqual(576);
    finalLayout = layout;

    await page.getByLabel('Rendering vettoriale').check();
    await expect(vector).toHaveAttribute('data-output-width', String(layout.outputWidth));
    await expect(vector).toHaveAttribute('data-output-height', String(layout.outputHeight));
    await expect(vector).toHaveAttribute('data-columns', String(layout.columns));
    await page.setViewportSize({ width: 900, height: 900 });
    await expect(vector).toHaveAttribute('data-output-width', String(layout.outputWidth));
    await page.getByLabel('Rendering vettoriale').uncheck();

    const pngDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: /Export/ }).click();
    await page.getByRole('menuitem', { name: 'Export PNG' }).click();
    const pngFile = await pngDownload;
    const png = await readFile(await pngFile.path());
    expect(png.readUInt32BE(16)).toBe(layout.outputWidth);
    expect(png.readUInt32BE(20)).toBe(layout.outputHeight);
  }

  const asciiDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export/ }).click();
  await page.getByRole('menuitem', { name: 'Export ASCII' }).click();
  const asciiFile = await asciiDownload;
  const model = JSON.parse(strFromU8(gunzipSync(await readFile(await asciiFile.path()))));
  expect(model.render.width).toBe(finalLayout.outputWidth);
  expect(model.render.height).toBe(finalLayout.outputHeight);
  expect(model.render.font.baseline).toBeGreaterThan(0);
  expect(model.render.source).toEqual({ width: 1000, height: 1000 });

  const htmlDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export/ }).click();
  await page.getByRole('menuitem', { name: 'Export HTML playable' }).click();
  const htmlFile = await htmlDownload;
  const htmlPath = testInfo.outputPath('contained-player.html');
  await writeFile(htmlPath, await readFile(await htmlFile.path()));
  const playerPage = await page.context().newPage();
  await playerPage.goto(pathToFileURL(htmlPath).href);
  const playerCanvas = playerPage.locator('canvas[aria-label="ASCII frame"]');
  await expect(playerCanvas).toHaveJSProperty('width', finalLayout.outputWidth);
  await expect(playerCanvas).toHaveJSProperty('height', finalLayout.outputHeight);
  await expect(playerCanvas).toHaveCSS('object-fit', 'contain');
  await playerPage.locator('#fullscreen').click();
  await expect
    .poll(() => playerPage.evaluate(() => Boolean(document.fullscreenElement)))
    .toBe(true);
  await expect(playerCanvas).toHaveJSProperty('width', finalLayout.outputWidth);
  await playerPage.close();
});

test('renders and exports OpenType vector glyph outlines offline', async ({ page }, testInfo) => {
  await page.goto('/');
  const outlineChecks = await page.evaluate(async () => {
    const { loadOutlineFonts, vectorGlyphs } = await import('/src/glyph-geometry.js');
    await loadOutlineFonts();
    const outline = vectorGlyphs('IBM Plex Mono', 'Oé.,!?', 500).glyphs;
    const canvas = document.createElement('canvas');
    canvas.width = 700;
    canvas.height = 900;
    const context = canvas.getContext('2d');
    context.translate(0, 800);
    context.fill(new Path2D(outline.O.path), 'evenodd');
    return {
      characters: Object.keys(outline),
      holeAlpha: context.getImageData(300, 451, 1, 1).data[3],
      strokeAlpha: context.getImageData(80, 451, 1, 1).data[3],
    };
  });
  expect(outlineChecks.characters).toEqual(expect.arrayContaining(Array.from('Oé.,!?')));
  expect(outlineChecks.holeAlpha).toBe(0);
  expect(outlineChecks.strokeAlpha).toBeGreaterThan(0);
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, 96, 64);
    context.fillStyle = '#000';
    context.beginPath();
    context.arc(48, 32, 22, 0, Math.PI * 2);
    context.fill();
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.locator('input[type=file]').setInputFiles({
    name: 'vector-outline.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  await page.getByLabel('Rendering vettoriale').check();
  const preview = page.locator('canvas[aria-label="ASCII vector rendering preview"]');
  await expect(preview).toBeVisible();
  await expect
    .poll(() => preview.evaluate((canvas) => canvas.width * canvas.height))
    .toBeGreaterThan(0);
  const inkPixels = await preview.evaluate((canvas) => {
    const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    let count = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index] > 150 && data[index + 1] > 150 && data[index + 2] > 150) count += 1;
    }
    return count;
  });
  expect(inkPixels).toBeGreaterThan(0);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export/ }).click();
  await page.getByRole('menuitem', { name: 'Export ASCII' }).click();
  const document = JSON.parse(strFromU8(gunzipSync(await readFile(await (await download).path()))));
  expect(document.render.mode).toBe('vector');
  expect(document.render.font.family).toBe('IBM Plex Mono');
  expect(document.render.font.license.license).toBe('SIL Open Font License 1.1');
  expect(Object.keys(document.render.glyphs).length).toBeGreaterThan(0);
  for (const character of new Set(Array.from(document.frames[0].text)))
    expect(Object.hasOwn(document.render.glyphs, character)).toBe(true);

  const pngDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export/ }).click();
  await page.getByRole('menuitem', { name: 'Export PNG' }).click();
  const pngBytes = await readFile(await (await pngDownload).path());
  const pngMatchesPreview = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const expectedCanvas = document.querySelector(
      'canvas[aria-label="ASCII vector rendering preview"]',
    );
    const output = document.createElement('canvas');
    output.width = image.width;
    output.height = image.height;
    const context = output.getContext('2d');
    context.drawImage(image, 0, 0);
    const expected = expectedCanvas.getContext('2d').getImageData(0, 0, image.width, image.height);
    const actual = context.getImageData(0, 0, image.width, image.height);
    return expected.data.every((value, index) => value === actual.data[index]);
  }, pngBytes.toString('base64'));
  expect(pngMatchesPreview).toBe(true);

  const htmlDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export/ }).click();
  await page.getByRole('menuitem', { name: 'Export HTML playable' }).click();
  const previewDataUrl = await preview.evaluate((canvas) => canvas.toDataURL());
  const offlinePage = await page.context().newPage();
  const htmlPath = testInfo.outputPath('vector-player.html');
  await writeFile(htmlPath, await readFile(await (await htmlDownload).path()));
  const requests = [];
  offlinePage.on('request', (request) => requests.push(request.url()));
  await offlinePage.goto(pathToFileURL(htmlPath).href);
  await expect(offlinePage.locator('canvas')).toHaveJSProperty('width', document.render.width);
  const offlineMatchesPreview = await offlinePage.evaluate(async (previewUrl) => {
    const image = new Image();
    image.src = previewUrl;
    await image.decode();
    const canvas = document.querySelector('canvas');
    const context = canvas.getContext('2d');
    const expected = document.createElement('canvas');
    expected.width = image.width;
    expected.height = image.height;
    const expectedContext = expected.getContext('2d');
    expectedContext.drawImage(image, 0, 0);
    const source = expectedContext.getImageData(0, 0, image.width, image.height);
    const actual = context.getImageData(0, 0, image.width, image.height);
    return source.data.every((value, index) => value === actual.data[index]);
  }, previewDataUrl);
  expect(offlineMatchesPreview).toBe(true);
  expect(requests.filter((url) => url.startsWith('http'))).toEqual([]);
  await offlinePage.close();
});

test('maps dark image cells to denser glyphs than bright image cells', async ({ page }) => {
  await page.goto('/');
  const png = await page.evaluate(() => {
    const source = document.createElement('canvas');
    source.width = 320;
    source.height = 160;
    const context = source.getContext('2d');
    context.fillStyle = '#000';
    context.fillRect(0, 0, 160, 160);
    context.fillStyle = '#fff';
    context.fillRect(160, 0, 160, 160);
    return source.toDataURL('image/png').split(',')[1];
  });

  await page.locator('input[type=file]').setInputFiles({
    name: 'black-white.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  const canvas = page.locator('canvas[aria-label="ASCII rendering preview"]');
  await expect(canvas).toHaveAttribute('data-columns', /[1-9]\d*/);
  const coverage = await canvas.evaluate((element) => {
    const gl = element.getContext('webgl2');
    const pixels = new Uint8Array(element.width * element.height * 4);
    gl.readPixels(0, 0, element.width, element.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const columns = Number(element.dataset.columns);
    const middle = Math.floor(columns / 2);
    const halves = [0, 1].map((side) => {
      let foreground = 0;
      let count = 0;
      for (let y = Math.floor(element.height * 0.2); y < Math.floor(element.height * 0.8); y += 1) {
        for (
          let x = Math.floor(((side ? middle : 0) * element.width) / columns);
          x < Math.floor(((side ? columns : middle) * element.width) / columns);
          x += 1
        ) {
          const offset = ((element.height - 1 - y) * element.width + x) * 4;
          if (pixels[offset] > 140 && pixels[offset + 1] > 180 && pixels[offset + 2] > 150)
            foreground += 1;
          count += 1;
        }
      }
      return foreground / count;
    });
    return halves;
  });
  expect(coverage[0]).toBeGreaterThan(coverage[1] + 0.2);
});

test('applies Sobel edge detection live and stores its settings with converted pages', async ({
  page,
}) => {
  await page.goto('/');
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 24;
    const context = canvas.getContext('2d');
    context.fillStyle = '#000';
    context.fillRect(0, 0, 16, 24);
    context.fillStyle = '#fff';
    context.fillRect(16, 0, 16, 24);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.locator('input[type=file]').setInputFiles({
    name: 'edge-test.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  const canvas = page.locator('canvas[aria-label="ASCII rendering preview"]');
  const original = await canvas.evaluate((element) => element.toDataURL());
  await page.getByLabel('Enable edge detection').check();
  await expect(page.getByLabel('Threshold value')).toHaveValue('1');
  await page.getByLabel('Threshold value').fill('12');
  await expect.poll(() => canvas.evaluate((element) => element.toDataURL())).not.toBe(original);
  await page.locator('#edge-mode').selectOption('image');
  await expect(page.getByLabel('Intensità bordi')).toBeVisible();
  await page.getByLabel('Intensità bordi').fill('0.9');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export/ }).click();
  await page.getByRole('menuitem', { name: 'Export ASCII' }).click();
  const bytes = await readFile(await (await download).path());
  const exported = JSON.parse(strFromU8(gunzipSync(bytes)));
  expect(exported.filters.edgeDetection).toEqual({
    enabled: true,
    threshold: 12,
    smoothing: 0,
    mode: 'image',
    intensity: 0.9,
  });
  expect(exported.frames[0].text).toMatch(/\S/);
});

test('flattens image colors to a reduced perceptual palette in preview and ASCII export', async ({
  page,
}) => {
  await page.goto('/');
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    const gradient = context.createLinearGradient(0, 0, 96, 64);
    gradient.addColorStop(0, '#ef2424');
    gradient.addColorStop(0.5, '#22ca68');
    gradient.addColorStop(1, '#285ee8');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 96, 64);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.locator('input[type=file]').setInputFiles({
    name: 'color-flatten.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  await page.getByRole('button', { name: 'Source color' }).click();
  const canvas = page.locator('canvas[aria-label="ASCII rendering preview"]');
  const original = await canvas.evaluate((element) => element.toDataURL());
  await page.getByLabel('Enable color flattening').check();
  await expect.poll(() => canvas.getAttribute('data-palette-size')).toBe('16');
  await expect.poll(() => canvas.evaluate((element) => element.toDataURL())).not.toBe(original);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export/ }).click();
  await page.getByRole('menuitem', { name: 'Export ASCII' }).click();
  const bytes = await readFile(await (await download).path());
  const exported = JSON.parse(strFromU8(gunzipSync(bytes)));
  const flatten = exported.filters.flattenColors;
  expect(flatten).toMatchObject({ enabled: true, colorCount: 16, smoothing: 4 });
  expect(flatten.palette).toHaveLength(16);
  expect(exported.frames[0].colors).toBeTruthy();
  const cellColors = Buffer.from(exported.frames[0].colors, 'base64');
  const palette = new Set(
    flatten.palette.map((hex) =>
      hex
        .match(/[0-9a-f]{2}/gi)
        .map((byte) => parseInt(byte, 16))
        .join(','),
    ),
  );
  for (let offset = 0; offset < cellColors.length; offset += 3)
    expect(palette.has([...cellColors.subarray(offset, offset + 3)].join(','))).toBe(true);
});

test('keeps one globally sampled palette across video frames', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/video-silent.webm');
  const source = page.locator('video.media-source');
  await expect(source).toHaveJSProperty('videoWidth', 160);
  const sourceDuration = await source.evaluate((video) => video.duration);
  await page.getByRole('button', { name: 'Source color' }).click();
  await page.getByLabel('Enable color flattening').check();
  const canvas = page.locator('canvas[aria-label="ASCII rendering preview"]');
  await expect.poll(() => canvas.getAttribute('data-palette-size'), { timeout: 15000 }).toBe('16');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export/ }).click();
  await page.getByRole('menuitem', { name: 'Export ASCII' }).click();
  const bytes = await readFile(await (await download).path());
  const exported = JSON.parse(strFromU8(gunzipSync(bytes)));
  const palette = exported.filters.flattenColors.palette;
  expect(palette).toHaveLength(16);
  expect(exported.frames.length).toBeGreaterThan(1);
  const paletteSet = new Set(
    palette.map((hex) =>
      hex
        .match(/[0-9a-f]{2}/gi)
        .map((byte) => parseInt(byte, 16))
        .join(','),
    ),
  );
  for (const frame of exported.frames) {
    const colors = Buffer.from(frame.colors, 'base64');
    for (let offset = 0; offset < colors.length; offset += 3)
      expect(paletteSet.has([...colors.subarray(offset, offset + 3)].join(','))).toBe(true);
  }
});

test('exports video frames without audio when browser capture is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLMediaElement.prototype, 'captureStream', {
      configurable: true,
      value: undefined,
    });
  });
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/motion-with-audio.webm');
  await expect(page.locator('video.media-source')).toHaveJSProperty('videoWidth', 320);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export/ }).click();
  await page.getByRole('menuitem', { name: 'Export ASCII' }).click();
  const file = await download;
  const exported = JSON.parse(strFromU8(gunzipSync(await readFile(await file.path()))));
  expect(exported.contentType).toBe('video');
  expect(exported).not.toHaveProperty('audio');
  await expect(page.locator('.toast')).toContainText('L’esportazione ASCII prosegue senza audio');
});

test('exports a playable MP4 for video without an audio track', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/video-silent.webm');
  const source = page.locator('video.media-source');
  await expect(source).toHaveJSProperty('videoWidth', 160);
  const sourceDuration = await source.evaluate((video) => video.duration);
  await page.getByRole('button', { name: /Export/ }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Export video (.mp4)' }).click();
  const file = await download;
  const bytes = await readFile(await file.path());
  expect(bytes.subarray(4, 8).toString()).toBe('ftyp');
  const metadata = await page.evaluate(
    async (inputBytes) => {
      const source = new Uint8Array(inputBytes);
      const video = document.createElement('video');
      const url = URL.createObjectURL(new Blob([source], { type: 'video/mp4' }));
      video.src = url;
      try {
        await new Promise((resolve, reject) => {
          video.onloadedmetadata = resolve;
          video.onerror = () => reject(new Error('Generated silent MP4 could not be decoded.'));
        });
        return { duration: video.duration, atoms: new TextDecoder().decode(source) };
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    [...bytes],
  );
  expect(metadata.duration).toBeGreaterThan(0);
  expect(Math.abs(metadata.duration - sourceDuration)).toBeLessThan(0.1);
  expect(metadata.atoms).toContain('avc1');
  expect(metadata.atoms).not.toContain('mp4a');
});

test('rejects a malicious .ascii archive with traversal paths', async ({ page }) => {
  await page.goto('/');
  const malformedArchive = zipSync({
    'manifest.json': strToU8(
      JSON.stringify({
        format: 'ascii-gpu-asset',
        formatVersion: 1,
        media: { path: '../source.png', mime: 'image/png' },
      }),
    ),
    '../source.png': new Uint8Array([1, 2, 3]),
  });
  await page.locator('input[type=file]').setInputFiles({
    name: 'malicious.ascii',
    mimeType: 'application/zip',
    buffer: Buffer.from(malformedArchive),
  });
  await expect(page.getByRole('alert')).toContainText('Percorso non sicuro');
});

test('mounts the reusable Vue player against a real .ascii project', async ({ page }) => {
  await page.goto('/examples/vue/index.html');
  await expect(page.getByRole('heading', { name: 'ASCII GPU Studio — Vue runtime' })).toBeVisible();
  await expect(page.getByLabel('ASCII media preview')).toHaveAttribute('data-columns', /[1-9]\d*/);
  await expect(page.getByRole('button', { name: 'Capture PNG' })).toBeEnabled();
});

test('plays, pauses, seeks, and loops a local video with its source audio track', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/motion-with-audio.webm');
  const video = page.locator('video.media-source');
  await expect(video).toHaveJSProperty('videoWidth', 320);
  const canvas = page.locator('canvas[aria-label="ASCII rendering preview"]');
  await expect(canvas).toHaveAttribute('data-columns', /[1-9]\d*/);
  await expect(page.locator('.stage-status')).toContainText('×');
  await expect(page.getByLabel('Toggle loop')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Play video' }).click();
  await expect.poll(() => video.evaluate((element) => element.currentTime)).toBeGreaterThan(0.2);
  await expect
    .poll(() => video.evaluate((element) => element.webkitAudioDecodedByteCount || 0))
    .toBeGreaterThan(0);
  await page.getByLabel('Video position').fill('1.7');
  await expect.poll(() => video.evaluate((element) => element.currentTime)).toBeGreaterThan(1.6);
  await page.getByRole('button', { name: 'Pause video' }).click();
  const pausedAt = await video.evaluate((element) => element.currentTime);
  const sourceDurationMs = (await video.evaluate((element) => element.duration)) * 1000;
  await page.waitForTimeout(180);
  expect(await video.evaluate((element) => element.currentTime)).toBeCloseTo(pausedAt, 1);
  await page.screenshot({ path: 'docs/screenshots/video-playback.png' });

  const asciiDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export/ }).click();
  await page.getByRole('menuitem', { name: 'Export ASCII' }).click();
  const asciiFile = await asciiDownload;
  const asciiDocument = JSON.parse(strFromU8(gunzipSync(await readFile(await asciiFile.path()))));
  expect(asciiDocument.contentType).toBe('video');
  expect(asciiDocument.frames.length).toBeGreaterThan(10);
  expect(asciiDocument.audio.mimeType).toMatch(/^audio\/webm/);
  expect(asciiDocument.audio.offsetMs).toBe(0);
  expect(
    Math.abs(
      asciiDocument.frames.at(-1).timestampMs +
        asciiDocument.frames.at(-1).durationMs -
        sourceDurationMs,
    ),
  ).toBeLessThan(100);

  await page.getByRole('button', { name: /Export/ }).click();
  const mp4Download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Export video (.mp4)' }).click();
  const mp4File = await mp4Download;
  expect(mp4File.suggestedFilename()).toMatch(/\.mp4$/);
  const mp4Bytes = await readFile(await mp4File.path());
  expect(mp4Bytes.subarray(4, 8).toString()).toBe('ftyp');
  const mp4Metadata = await page.evaluate(
    async (inputBytes) => {
      const bytes = new Uint8Array(inputBytes);
      const atoms = new TextDecoder().decode(bytes);
      const videoElement = document.createElement('video');
      const url = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));
      videoElement.src = url;
      try {
        await new Promise((resolve, reject) => {
          videoElement.onloadedmetadata = resolve;
          videoElement.onerror = () => reject(new Error('Generated MP4 could not be decoded.'));
        });
        return {
          hasH264: atoms.includes('avc1'),
          hasAac: atoms.includes('mp4a'),
          duration: videoElement.duration,
          width: videoElement.videoWidth,
          height: videoElement.videoHeight,
        };
      } finally {
        URL.revokeObjectURL(url);
        videoElement.removeAttribute('src');
        videoElement.load();
      }
    },
    [...mp4Bytes],
  );
  expect(mp4Metadata.hasH264).toBe(true);
  expect(mp4Metadata.hasAac).toBe(true);
  expect(Math.abs(mp4Metadata.duration - sourceDurationMs / 1000)).toBeLessThan(0.1);
  expect(mp4Metadata.width).toBe(asciiDocument.render.width + (asciiDocument.render.width % 2));
  expect(mp4Metadata.height).toBe(asciiDocument.render.height + (asciiDocument.render.height % 2));

  await page.locator('input[type=file]').setInputFiles({
    name: asciiFile.suggestedFilename(),
    mimeType: 'application/gzip',
    buffer: await readFile(await asciiFile.path()),
  });
  const htmlDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export/ }).click();
  await page.getByRole('menuitem', { name: 'Export HTML playable' }).click();
  const htmlFile = await htmlDownload;
  const offlinePlayer = await page.context().newPage();
  const offlinePath = testInfo.outputPath('video-ascii-playable.html');
  await writeFile(offlinePath, await readFile(await htmlFile.path()));
  await offlinePlayer.goto(pathToFileURL(offlinePath).href);
  await expect(offlinePlayer.locator('.controls')).toBeVisible();
  await expect
    .poll(() => offlinePlayer.locator('audio').evaluate((element) => element.currentSrc))
    .toContain('blob:');
  await offlinePlayer.getByRole('button', { name: 'Play' }).click();
  await expect(offlinePlayer.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect
    .poll(() => offlinePlayer.locator('audio').evaluate((element) => element.currentTime))
    .toBeGreaterThan(0.1);
  await offlinePlayer.getByLabel('Seek').fill('500');
  await expect
    .poll(() => offlinePlayer.locator('audio').evaluate((element) => element.currentTime))
    .toBeCloseTo(0.5, 1);
  await expect(offlinePlayer.locator('canvas')).toBeVisible();
  await offlinePlayer.getByRole('button', { name: 'Pause' }).click();
  await offlinePlayer.close();
});

test('exports a video without audio as timestamped ASCII and an offline player', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/video-silent.webm');
  await expect(page.locator('video.media-source')).toHaveJSProperty('videoWidth', 160);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export/ }).click();
  await page.getByRole('menuitem', { name: 'Export ASCII' }).click();
  const asciiFile = await download;
  const model = JSON.parse(strFromU8(gunzipSync(await readFile(await asciiFile.path()))));
  expect(model.contentType).toBe('video');
  expect(model.frames.length).toBeGreaterThan(5);
  expect(model).not.toHaveProperty('audio');
  expect(model.frames[0].timestampMs).toBe(0);
  for (let index = 1; index < model.frames.length; index += 1) {
    expect(model.frames[index].timestampMs).toBeGreaterThan(model.frames[index - 1].timestampMs);
  }
  await page.locator('input[type=file]').setInputFiles({
    name: asciiFile.suggestedFilename(),
    mimeType: 'application/gzip',
    buffer: await readFile(await asciiFile.path()),
  });
  const htmlDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export/ }).click();
  await page.getByRole('menuitem', { name: 'Export HTML playable' }).click();
  const htmlFile = await htmlDownload;
  const offlinePath = testInfo.outputPath('silent-video-player.html');
  await writeFile(offlinePath, await readFile(await htmlFile.path()));
  const offlinePage = await page.context().newPage();
  await offlinePage.goto(pathToFileURL(offlinePath).href);
  await expect(offlinePage.locator('.controls')).toBeVisible();
  await offlinePage.getByRole('button', { name: 'Play' }).click();
  await expect(offlinePage.getByRole('button', { name: 'Pause' })).toBeVisible();
  await offlinePage.getByLabel('Seek').fill('500');
  await offlinePage.getByRole('button', { name: 'Pause' }).click();
  await offlinePage.close();
});
