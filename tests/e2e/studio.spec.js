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

test('saves parameter defaults for reset and future sessions', async ({ page }) => {
  await page.goto('/');
  await page.locator('#columns').fill('144');
  await page.getByLabel('Enable edge detection').check();
  await page.getByLabel('Threshold value').fill('91');
  await page.getByRole('button', { name: 'Save defaults' }).click();
  await expect(page.getByText('Parametri predefiniti salvati')).toBeVisible();
  await page.locator('#columns').fill('72');
  await page.getByLabel('Enable edge detection').uncheck();
  await page.locator('.panel-heading-actions .icon-button').click();
  await expect(page.locator('#columns')).toHaveValue('144');
  await expect(page.getByLabel('Enable edge detection')).toBeChecked();
  await expect(page.getByLabel('Threshold value')).toHaveValue('91');
  await page.reload();
  await expect(page.locator('#columns')).toHaveValue('144');
  await expect(page.getByLabel('Enable edge detection')).toBeChecked();
  await expect(page.getByLabel('Threshold value')).toHaveValue('91');
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
  await expect(canvas).toHaveAttribute('data-columns', '96');
  await expect(canvas).toHaveAttribute('data-rows', /[1-9]/);
  await expect(page.getByLabel('Columns')).toHaveAttribute('max', '320');
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
  const textRows = await textPreview.textContent();
  expect(textRows.split('\n')).toHaveLength(renderedRows);
  expect(textRows).toMatch(/[@#XMAHGS]/);
  await page.screenshot({ path: 'docs/screenshots/plain-text-ascii.png' });
  await page.getByRole('button', { name: 'GPU', exact: true }).click();
  await expect(canvas).toBeVisible();
  const before = await canvas.evaluate((element) => element.toDataURL());
  await page.getByLabel('Columns').fill('120');
  await expect(canvas).toHaveAttribute('data-columns', '120');
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
  expect(asciiDocument.render.columns).toBe(120);
  expect(asciiDocument.frames).toHaveLength(1);
  expect(asciiDocument.frames[0].colors).toBeTruthy();
  expect(asciiDocument).not.toHaveProperty('source');
  expect(asciiDocument).not.toHaveProperty('thumbnail');
  await page.locator('input[type=file]').setInputFiles({
    name: projectDownload.suggestedFilename(),
    mimeType: 'application/gzip',
    buffer: asciiBytes,
  });
  await expect(page.getByLabel('Plain text ASCII preview')).toContainText(/[@#XMAHGS]/);
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
  await expect(canvas).toHaveAttribute('data-columns', '96');
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
  await expect(page.getByLabel('Threshold value')).toHaveValue('56');
  await page.getByLabel('Threshold value').fill('12');
  await expect.poll(() => canvas.evaluate((element) => element.toDataURL())).not.toBe(original);
  await page.getByRole('button', { name: 'Bordi + immagine' }).click();
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
  await expect(page.getByLabel('ASCII media preview')).toHaveAttribute('data-columns', '64');
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
  await expect(canvas).toHaveAttribute('data-columns', '96');
  await expect(page.locator('.stage-status')).toContainText('96 ×');
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

  await page.getByRole('button', { name: /Export/ }).click();
  await page.getByRole('menuitem', { name: 'Export video (.mp4)' }).click();
  await expect(page.getByRole('alert')).toContainText(/Export MP4 non supportato/);

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
