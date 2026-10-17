# Portable `.ascii` result format

An `.ascii` file is a gzip-compressed UTF-8 JSON document. The JSON carries conversion output only: it never embeds source video/image pixels, thumbnails, or working data. The ASCII text is plain JSON string data inside the gzip stream, not a separately Base64-encoded frame.

## Version 1 schema

```json
{
  "format": "ascii-gpu-studio",
  "version": 1,
  "contentType": "image",
  "filters": {
    "edgeDetection": {
      "enabled": false,
      "threshold": 56,
      "smoothing": 0,
      "mode": "edges",
      "intensity": 0.65
    },
    "flattenColors": {
      "enabled": false,
      "colorCount": 16,
      "smoothing": 4,
      "palette": []
    }
  },
  "render": {
    "columns": 96,
    "rows": 54,
    "cellWidth": 14,
    "cellHeight": 24,
    "width": 1344,
    "height": 1296,
    "cellAspect": 0.5833,
    "font": {
      "family": "IBM Plex Mono",
      "size": 20,
      "weight": 500,
      "ascent": 15,
      "descent": 4
    },
    "mode": "bitmap",
    "colors": {
      "mode": "mono",
      "foreground": "#d5f5e9",
      "background": "#101715"
    },
    "fit": "contain"
  },
  "frames": [
    {
      "timestampMs": 0,
      "durationMs": 0,
      "text": "..."
    }
  ]
}
```

An image has exactly one page and no audio. Video pages are complete frames sampled at 100 ms intervals; each frame records its timestamp and display duration. In source-color mode, a page can also store `colors`: Base64-encoded RGB bytes, three bytes per cell in row-major order. This compact binary field is for cell colors only; frame text stays directly in JSON.

Black-and-white rendering uses `render.colors.mode: "bw"` with white foreground and black background. Its pages omit per-cell RGB data and use only the lightest and densest charset glyphs after luminance thresholding.

Video audio is optional and stored as `{ mimeType, offsetMs, dataBase64 }`. For `.ascii` export, the browser records the source audio track in a supported audio-only container (normally WebM/Opus in Chromium or MP4/AAC in Safari) and embeds those bytes. `offsetMs` is relative to the ASCII frame timeline. HTML playback uses the audio clock when audio is present and a monotonic clock otherwise. MP4 export from a loaded source video demuxes audio directly from the original local file; MP4 export from an imported `.ascii` document decodes its embedded audio. Both paths encode the audio as AAC.

The serialization and validation boundary lives in `src/ascii-document.js`; image/video frame capture is in `src/ascii-export.js`. Full-frame pages are used in v1 so a future version can introduce delta frames or chunk compression behind the same reader/player boundary.

`filters.edgeDetection` records the settings used to make the pages. The pages already contain the filtered ASCII result; readers and the offline HTML player display them directly and do not rerun edge detection.

`filters.flattenColors` stores the selected color count, bilateral smoothing strength, and the palette as hexadecimal sRGB colors. Video palettes are sampled globally from six evenly spaced frames and held fixed for the entire sequence. In RGB mode, each cell's stored color is selected from this palette, so the HTML player reproduces the flat colors without rerunning quantization.

## Vector glyph rendering

Bitmap rendering remains the default. Vector documents set `render.mode` to `"vector"` and store:

```json
{
  "mode": "vector",
  "unitsPerEm": 1000,
  "glyphs": {
    "O": {
      "path": "M…",
      "advanceWidth": 600
    }
  }
}
```

`glyphs` is a document-wide map keyed by Unicode code point; each outline is shared by every occurrence and video page. Paths retain the parsed font curves in font units, including multiple contours. Readers fill paths with the even-odd rule, without stroke. Only characters actually present in the pages are included. No font atlas, raster glyph, source font binary, or original media is embedded in this mode. Family, weight, font size, cell metrics, foreground/background and per-cell colors remain part of `render`. `render.font.license` records the bundled font's SIL OFL 1.1 designation and copyright attribution alongside the derived paths.

The Studio bundles IBM Plex Mono, Cousine, and Lora under the SIL Open Font License 1.1 to make font selection and offline vector playback deterministic. Their notices are included in `public/licenses/`. The standalone HTML requires no installed font, CDN, or network request when `render.mode` is `"vector"`; it uses the embedded paths and the same `Path2D` even-odd fill used by PNG.

## Legacy import

The Studio still recognizes the earlier ZIP-based `ascii-gpu-asset` projects on import for compatibility. New exports use only the gzip JSON result format above.
