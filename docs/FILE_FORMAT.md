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
      "family": "monospace",
      "size": 20,
      "weight": 500,
      "ascent": 15,
      "descent": 4
    },
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

Video audio is optional and stored as `{ mimeType, offsetMs, dataBase64 }`. The current browser capture path records the source audio track as WebM/Opus and embeds those bytes. `offsetMs` is relative to the ASCII frame timeline. HTML playback uses the audio clock when audio is present and a monotonic clock otherwise.

The serialization and validation boundary lives in `src/ascii-document.js`; image/video frame capture is in `src/ascii-export.js`. Full-frame pages are used in v1 so a future version can introduce delta frames or chunk compression behind the same reader/player boundary.

`filters.edgeDetection` records the settings used to make the pages. The pages already contain the filtered ASCII result; readers and the offline HTML player display them directly and do not rerun edge detection.

## Legacy import

The Studio still recognizes the earlier ZIP-based `ascii-gpu-asset` projects on import for compatibility. New exports use only the gzip JSON result format above.
