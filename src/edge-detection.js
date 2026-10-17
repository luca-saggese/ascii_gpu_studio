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

export function createEdgeMap(data, width, height, options) {
  const { threshold, smoothing, mode, intensity } = options;
  const thresholdValue = threshold / 255;
  const edgeMap = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const magnitude = edgeMagnitude(data, width, height, x, y, smoothing);
      edgeMap[y * width + x] = magnitude >= thresholdValue ? magnitude : 0;
    }
  }
  const values = new Float32Array(edgeMap.length);
  for (let i = 0; i < edgeMap.length; i += 1) {
    const edge = edgeMap[i];
    const offset = i * 4;
    const sourceLuminance =
      (data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722) / 255;
    values[i] = mode === 'edges' ? 1 - edge : sourceLuminance * (1 - edge * intensity);
  }
  return values;
}
