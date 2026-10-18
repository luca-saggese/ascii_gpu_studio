const GAUSSIAN = [1, 2, 1];
const SOBEL_X = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
const SOBEL_Y = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

function luminanceAt(data, width, height, x, y) {
  const px = Math.max(0, Math.min(width - 1, x));
  const py = Math.max(0, Math.min(height - 1, y));
  const index = (py * width + px) * 4;
  return (data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722) / 255;
}

function blurredLuminance(data, width, height, x, y, smoothing) {
  if (smoothing === 0) return luminanceAt(data, width, height, x, y);
  let value = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      value +=
        luminanceAt(data, width, height, x + dx * smoothing, y + dy * smoothing) *
        GAUSSIAN[dx + 1] *
        GAUSSIAN[dy + 1];
    }
  }
  return value / 16;
}

export function edgeMagnitude(data, width, height, x, y, smoothing = 0) {
  const samples = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      samples.push(blurredLuminance(data, width, height, x + dx, y + dy, smoothing));
    }
  }
  let gx = 0;
  let gy = 0;
  for (let i = 0; i < 9; i += 1) {
    gx += samples[i] * SOBEL_X[i];
    gy += samples[i] * SOBEL_Y[i];
  }
  return Math.min(1, Math.hypot(gx, gy) / Math.SQRT2 / 4);
}

export function createEdgeMap(data, width, height, options, basePixels = data) {
  const { threshold, smoothing, mode, intensity } = options;
  const thresholdValue = threshold / 100;
  const luminance = new Float64Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      luminance[y * width + x] =
        (data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722) / 255;
    }
  }
  const blurred = new Float64Array(luminance.length);
  if (smoothing === 0) {
    blurred.set(luminance);
  } else {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let value = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          const sampleY = Math.max(0, Math.min(height - 1, y + dy * smoothing));
          const verticalWeight = GAUSSIAN[dy + 1];
          for (let dx = -1; dx <= 1; dx += 1) {
            const sampleX = Math.max(0, Math.min(width - 1, x + dx * smoothing));
            value += luminance[sampleY * width + sampleX] * verticalWeight * GAUSSIAN[dx + 1];
          }
        }
        blurred[y * width + x] = value / 16;
      }
    }
  }
  const values = new Float32Array(luminance.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const top = Math.max(0, y - 1);
      const bottom = Math.min(height - 1, y + 1);
      const left = Math.max(0, x - 1);
      const right = Math.min(width - 1, x + 1);
      const gx =
        -blurred[top * width + left] +
        blurred[top * width + right] -
        2 * blurred[y * width + left] +
        2 * blurred[y * width + right] -
        blurred[bottom * width + left] +
        blurred[bottom * width + right];
      const gy =
        -blurred[top * width + left] -
        2 * blurred[top * width + x] -
        blurred[top * width + right] +
        blurred[bottom * width + left] +
        2 * blurred[bottom * width + x] +
        blurred[bottom * width + right];
      const magnitude = Math.min(1, Math.hypot(gx, gy) / Math.SQRT2 / 4);
      const edge = magnitude >= thresholdValue ? magnitude : 0;
      const i = y * width + x;
      const offset = i * 4;
      const sourceLuminance =
        (basePixels[offset] * 0.2126 +
          basePixels[offset + 1] * 0.7152 +
          basePixels[offset + 2] * 0.0722) /
        255;
      values[i] = mode === 'edges' ? 1 - edge : sourceLuminance * (1 - edge * intensity);
    }
  }
  return values;
}
