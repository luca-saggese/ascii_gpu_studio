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
  await expect(page.getByText('LIVE PREVIEW')).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/image-preview.png' });
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
