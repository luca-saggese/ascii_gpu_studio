import { test, expect } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';
import { readFile } from 'node:fs/promises';

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

test('imports an image, renders through WebGL2, and exports the source project', async ({
  page,
}) => {
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
  await page.screenshot({ path: 'docs/screenshots/image-preview.png' });
  await page.getByRole('button', { name: 'ASCII text' }).click();
  const textPreview = page.getByLabel('Plain text ASCII preview');
  await expect(textPreview).toBeVisible();
  await expect(page.locator('.stage-status')).toContainText('text chars');
  const textRows = await textPreview.textContent();
  expect(textRows.split('\n')).toHaveLength(Number(await canvas.getAttribute('data-rows')));
  expect(textRows).toMatch(/[@#XMAHGS]/);
  await page.screenshot({ path: 'docs/screenshots/plain-text-ascii.png' });
  await page.getByRole('button', { name: 'GPU', exact: true }).click();
  await expect(canvas).toBeVisible();
  const before = await canvas.evaluate((element) => element.toDataURL());
  await page.getByLabel('Columns').fill('120');
  await expect(canvas).toHaveAttribute('data-columns', '120');
  const after = await canvas.evaluate((element) => element.toDataURL());
  expect(after).not.toBe(before);
  const download = page.waitForEvent('download');
  await page.locator('.top-actions .primary').click();
  const projectDownload = await download;
  expect(projectDownload.suggestedFilename()).toBe('studio-sample.ascii');
  await page.locator('input[type=file]').setInputFiles(await projectDownload.path());
  await expect(canvas).toHaveAttribute('data-columns', '120');
  const pngDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PNG' }).click();
  const pngPath = await (await pngDownload).path();
  const pngBytes = await readFile(pngPath);
  expect(pngBytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(pngBytes.readUInt32BE(16)).toBeGreaterThan(0);
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
}) => {
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
  await page.waitForTimeout(180);
  expect(await video.evaluate((element) => element.currentTime)).toBeCloseTo(pausedAt, 1);
  await page.screenshot({ path: 'docs/screenshots/video-playback.png' });
});
