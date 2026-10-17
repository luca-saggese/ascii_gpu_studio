const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const srgbToLinear = (value) =>
  value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
const linearToSrgb = (value) =>
  value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;

export function rgbToOklab(red, green, blue) {
  const r = srgbToLinear(red / 255);
  const g = srgbToLinear(green / 255);
  const b = srgbToLinear(blue / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToRgb([lightness, axisA, axisB]) {
  const l = (lightness + 0.3963377774 * axisA + 0.2158037573 * axisB) ** 3;
  const m = (lightness - 0.1055613458 * axisA - 0.0638541728 * axisB) ** 3;
  const s = (lightness - 0.0894841775 * axisA - 1.291485548 * axisB) ** 3;
  return [
    clamp(
      Math.round(linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s) * 255),
      0,
      255,
    ),
    clamp(
      Math.round(linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s) * 255),
      0,
      255,
    ),
    clamp(
      Math.round(linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s) * 255),
      0,
      255,
    ),
  ];
}

function distanceSquared(left, right) {
  return (left[0] - right[0]) ** 2 + (left[1] - right[1]) ** 2 + (left[2] - right[2]) ** 2;
}

export function sampleSourceColors(source, size = 48) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas 2D non disponibile per campionare la palette.');
  context.drawImage(source, 0, 0, size, size);
  return { data: context.getImageData(0, 0, size, size).data, width: size, height: size };
}

export function collectVideoColorSamples(video, sampleCount = 6, sampleSize = 48) {
  if (!Number.isFinite(video.duration) || video.duration <= 0)
    return Promise.reject(new Error('Durata del video non disponibile per la palette globale.'));
  const wasPaused = video.paused;
  const previousTime = video.currentTime;
  const canvas = document.createElement('canvas');
  canvas.width = sampleSize;
  canvas.height = sampleSize;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context)
    return Promise.reject(new Error('Canvas 2D non disponibile per campionare il video.'));
  video.pause();
  const samples = [];
  const waitForSeek = () =>
    new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        video.removeEventListener('seeked', onSeeked);
        reject(new Error('Ricerca frame fallita durante il campionamento della palette.'));
      }, 5000);
      const onSeeked = () => {
        window.clearTimeout(timeout);
        resolve();
      };
      video.addEventListener('seeked', onSeeked, { once: true });
    });
  return (async () => {
    try {
      for (let index = 0; index < sampleCount; index += 1) {
        const time = video.duration * ((index + 0.5) / sampleCount);
        if (Math.abs(video.currentTime - time) > 0.015) {
          const seeked = waitForSeek();
          video.currentTime = time;
          await seeked;
        }
        context.drawImage(video, 0, 0, sampleSize, sampleSize);
        samples.push({
          data: context.getImageData(0, 0, sampleSize, sampleSize).data,
          width: sampleSize,
          height: sampleSize,
        });
      }
      return samples;
    } finally {
      if (Number.isFinite(previousTime) && Math.abs(video.currentTime - previousTime) > 0.015) {
        const seeked = waitForSeek();
        video.currentTime = Math.min(previousTime, Math.max(0, video.duration - 0.001));
        await seeked;
      }
      if (!wasPaused) await video.play();
    }
  })();
}

function bilateralSmooth(image, strength) {
  const { data, width, height } = image;
  const output = new Uint8ClampedArray(data);
  if (strength <= 0) return output;
  const radius = Math.min(3, Math.ceil(strength / 3));
  const spatialSigma = 0.8 + strength * 0.12;
  const rangeSigma = 0.025 + strength * 0.018;
  const rangeScale = -0.5 / (rangeSigma * rangeSigma);
  const spatialScale = -0.5 / (spatialSigma * spatialSigma);
  const lab = new Float32Array(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      lab.set(rgbToOklab(data[offset], data[offset + 1], data[offset + 2]), (y * width + x) * 3);
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const labOffset = pixel * 3;
      const centerL = lab[labOffset];
      const centerA = lab[labOffset + 1];
      const centerB = lab[labOffset + 2];
      let totalWeight = 0;
      let redTotal = 0;
      let greenTotal = 0;
      let blueTotal = 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        const sampleY = clamp(y + dy, 0, height - 1);
        for (let dx = -radius; dx <= radius; dx += 1) {
          const sampleX = clamp(x + dx, 0, width - 1);
          const samplePixel = sampleY * width + sampleX;
          const sampleOffset = samplePixel * 4;
          const sampleLabOffset = samplePixel * 3;
          const deltaL = centerL - lab[sampleLabOffset];
          const deltaA = centerA - lab[sampleLabOffset + 1];
          const deltaB = centerB - lab[sampleLabOffset + 2];
          const weight = Math.exp(
            (dx * dx + dy * dy) * spatialScale +
              (deltaL * deltaL + deltaA * deltaA + deltaB * deltaB) * rangeScale,
          );
          totalWeight += weight;
          redTotal += data[sampleOffset] * weight;
          greenTotal += data[sampleOffset + 1] * weight;
          blueTotal += data[sampleOffset + 2] * weight;
        }
      }
      const outputOffset = pixel * 4;
      output[outputOffset] = redTotal / totalWeight;
      output[outputOffset + 1] = greenTotal / totalWeight;
      output[outputOffset + 2] = blueTotal / totalWeight;
    }
  }
  return output;
}

export function buildColorPalette(images, count, smoothing) {
  const colors = [];
  for (const image of images) {
    const smoothed = bilateralSmooth(image, smoothing);
    for (let offset = 0; offset < smoothed.length; offset += 4) {
      colors.push(rgbToOklab(smoothed[offset], smoothed[offset + 1], smoothed[offset + 2]));
    }
  }
  if (!colors.length) return [];
  const centers = [colors[0]];
  while (centers.length < count) {
    let farthest = colors[0];
    let maxDistance = -1;
    for (const color of colors) {
      const nearest = Math.min(...centers.map((center) => distanceSquared(color, center)));
      if (nearest > maxDistance) {
        maxDistance = nearest;
        farthest = color;
      }
    }
    centers.push([...farthest]);
  }
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (const color of colors) {
      let nearest = 0;
      let distance = distanceSquared(color, centers[0]);
      for (let index = 1; index < centers.length; index += 1) {
        const nextDistance = distanceSquared(color, centers[index]);
        if (nextDistance < distance) {
          distance = nextDistance;
          nearest = index;
        }
      }
      const sum = sums[nearest];
      sum[0] += color[0];
      sum[1] += color[1];
      sum[2] += color[2];
      sum[3] += 1;
    }
    centers.forEach((center, index) => {
      const sum = sums[index];
      if (sum[3]) centers[index] = [sum[0] / sum[3], sum[1] / sum[3], sum[2] / sum[3]];
    });
  }
  return centers.map(oklabToRgb);
}

export function flattenPixelData(image, settings, palette) {
  if (!palette.length) throw new Error('Palette colori non disponibile.');
  const { data, width, height } = image;
  const smoothed = bilateralSmooth(image, settings.smoothing);
  const paletteLab = palette.map(([r, g, b]) => rgbToOklab(r, g, b));
  const output = new Uint8ClampedArray(smoothed.length);
  for (let offset = 0; offset < smoothed.length; offset += 4) {
    const source = rgbToOklab(smoothed[offset], smoothed[offset + 1], smoothed[offset + 2]);
    let nearest = 0;
    let minDistance = distanceSquared(source, paletteLab[0]);
    for (let index = 1; index < paletteLab.length; index += 1) {
      const distance = distanceSquared(source, paletteLab[index]);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = index;
      }
    }
    output[offset] = palette[nearest][0];
    output[offset + 1] = palette[nearest][1];
    output[offset + 2] = palette[nearest][2];
    output[offset + 3] = data[offset + 3];
  }
  return { data: output, width, height };
}

export function paletteAsHex(palette) {
  return palette.map(
    (color) => `#${color.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`,
  );
}
