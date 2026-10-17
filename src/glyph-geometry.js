import { parse } from 'opentype.js';
import ibmPlexMonoUrl from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff?url';
import ibmPlexMonoMediumUrl from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff?url';
import cousineUrl from '@fontsource/cousine/files/cousine-latin-400-normal.woff?url';
import loraUrl from '@fontsource/lora/files/lora-latin-400-normal.woff?url';
import loraMediumUrl from '@fontsource/lora/files/lora-latin-500-normal.woff?url';
import { fontFamilyFor } from './core.js';

const fontUrls = [
  ['IBM Plex Mono', 400, ibmPlexMonoUrl],
  ['IBM Plex Mono', 500, ibmPlexMonoMediumUrl],
  ['Cousine', 400, cousineUrl],
  ['Lora', 400, loraUrl],
  ['Lora', 500, loraMediumUrl],
];
const fonts = new Map();
const outlines = new Map();
let fontsPromise;
const fontLicenses = {
  'IBM Plex Mono': { license: 'SIL Open Font License 1.1', copyright: 'Copyright 2017 IBM Corp.' },
  Cousine: {
    license: 'SIL Open Font License 1.1',
    copyright: 'Copyright 2026 The Cousine Project Authors',
  },
  Lora: {
    license: 'SIL Open Font License 1.1',
    copyright: 'Copyright 2011 The Lora Project Authors',
  },
};

export function loadOutlineFonts() {
  if (!fontsPromise) {
    fontsPromise = Promise.all(
      fontUrls.map(async ([family, weight, url]) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Impossibile caricare il font ${family}.`);
        const font = parse(await response.arrayBuffer());
        fonts.set(`${family}:${weight}`, font);
        await document.fonts.load(`${weight} 20px "${family}"`);
      }),
    );
  }
  return fontsPromise;
}

export function vectorGlyphs(fontFamily, text, weight = 400) {
  const family = fontFamilyFor(fontFamily);
  const font = fonts.get(`${family}:${weight}`) ?? fonts.get(`${family}:400`);
  if (!font) throw new Error(`I contorni vettoriali del font ${family} non sono disponibili.`);
  const glyphs = {};
  const precision = 2;
  for (const character of new Set(Array.from(text))) {
    const key = `${family}:${weight}:${precision}:${character}`;
    let geometry = outlines.get(key);
    if (!geometry) {
      const glyph = font.charToGlyph(character);
      geometry = {
        path: font.getPath(character, 0, 0, font.unitsPerEm).toPathData(precision),
        advanceWidth: glyph.advanceWidth ?? font.unitsPerEm,
      };
      outlines.set(key, geometry);
    }
    glyphs[character] = geometry;
  }
  return { family, unitsPerEm: font.unitsPerEm, glyphs, fontLicense: fontLicenses[family] };
}
