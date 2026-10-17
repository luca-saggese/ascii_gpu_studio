# Export workflow delivery report

## Implemented

- One **Export** dropdown, shown in the existing dark/teal UI. It offers ASCII, a source-appropriate PNG or MP4 action, and HTML playable. Outside click, Escape, arrow-key menu navigation, disabled states, video progress, and cancellation are wired.
- Version 1 `.ascii` is gzip-compressed UTF-8 JSON. It stores only rendered text pages and render parameters, with timestamps/durations for video, and compact Base64 RGB bytes per cell where needed. Image documents contain one page and no audio. The decoder validates the schema; older ZIP-based projects remain importable.
- Video-to-ASCII frame capture seeks through the source at a fixed 100 ms timeline, independent of preview callbacks. It yields between frames, reports progress, supports cancel, restores the source playback position, and includes captured audio when the browser exposes a capturable audio track (WebM/Opus in Chromium, MP4/AAC where supported in Safari).
- Audio extraction is optional: if the browser lacks capture/recording support or audio recording fails, frame export still completes without audio and reports the omission.
- PNG uses the ASCII page model and configured cell/font/color dimensions, not the source raster or Studio UI. It renders through OffscreenCanvas in a worker where available.
- HTML playable is a single offline `.html`: it embeds the compressed `.ascii` bytes as Base64, includes a self-contained player and the same page renderer, and has play/pause, seek, clock, volume, mute, and fullscreen controls. With audio it follows the audio clock; without audio it uses a monotonic clock. ASCII data is passed to `fillText`, never `innerHTML`.
- Old ZIP `.ascii` projects still import. New `.ascii` exports do not contain their original image/video or thumbnails.
- Edge Detection is available before conversion: fixed-scale Sobel over luminance, configurable threshold and Gaussian smoothing, Solo bordi and Bordi + immagine modes, adjustable blend intensity, and preserved source colors in RGB mode. The live preview evaluates it in WebGL2. ASCII capture oversamples at 2× grid resolution; exported frame pages are already filtered, and `.ascii` stores the chosen settings as metadata for inspection only.
- Save defaults persists the complete validated scene locally; Studio startup and Reset settings restore it. Storage or invalid-data errors are surfaced instead of silently ignored.
- Flatten Colors uses bilateral smoothing and OKLab palette assignment (2–64 colors, default 16), with no dithering. A video palette is sampled from six distributed timestamps and held for the clip. Preview and ASCII capture use the same fixed palette; in RGB mode final cell colors are palette entries, saved alongside palette/settings metadata so offline HTML does not recalculate the filter.
- **Rendering vettoriale** is an opt-in scene setting; bitmap remains the default. The Studio parses outlines from bundled IBM Plex Mono, Cousine, or Lora OpenType/WOFF fonts, caches paths by family/weight/glyph/precision, and fills contours without stroke using the even-odd rule. Preview does not use the bitmap glyph atlas in vector mode. Version 1 `.ascii` stores each used outline once across all pages; PNG and offline HTML render that geometry directly and embed no glyph raster/font dependency. Font license notices are included in `public/licenses/`.

## Verified

| Check               | Result                     |
| ------------------- | -------------------------- |
| `pnpm lint`         | Passed                     |
| `pnpm test`         | Passed — 15 tests          |
| `pnpm build`        | Passed                     |
| `pnpm format:check` | Passed                     |
| `pnpm test:e2e`     | Passed — 16 Chromium tests |

E2E additionally verifies vector preview and export, accented characters/punctuation, and that the `O` counter remains empty under even-odd path filling. It covers live Edge Detection preview and metadata, flattened image quantization and palette-only cell colors, a single global palette shared across all video frames, video frame export when audio capture is unavailable, image export in RGB mode, gzip JSON shape and absence of embedded source/thumbnail, PNG dimensions and sampled-pixel equality against the offline HTML render, HTML opened from a local file, menu visibility/close behavior, video timestamp ordering and end duration, video audio capture and offline playback/seek, MP4 playback with H.264/AAC tracks and MP4 playback without audio.

## MP4 export

MP4 output is encoded from the stored ASCII frame pages on the deterministic 100 ms timeline using WebCodecs H.264 and Mediabunny's MP4 muxer. For a loaded source video, audio is demuxed from the original file (not recorded from playback), decoded and re-encoded as AAC, clipped to the frame timeline, and muxed as a synchronized track. When exporting an imported `.ascii` document, its embedded audio is used instead. Chromium E2E confirms source-video MP4 contains H.264/AAC tracks, matches the source duration within 100 ms, and decodes successfully. A silent-video regression verifies video-only MP4 is supported. On unsupported devices, the app checks codec capability and reports an explicit error instead of emitting an invalid file. Safari is not yet part of the automated test matrix.

## Additional limitations

- Video audio extraction for `.ascii` uses `HTMLMediaElement.captureStream()` and MediaRecorder; MIME selection prefers WebM/Opus and also accepts MP4/AAC. It is browser-dependent and runs in real time; browsers without capture or a supported audio recorder report the omission. Video frame sampling itself remains deterministic.
- Bitmap HTML retains its existing system-font dependency and can differ across systems. Vector HTML is font-independent because it embeds used outline paths; font choices are bundled SIL OFL 1.1 assets for reproducible outlines.
- Vector preview uses Canvas 2D `Path2D`, not WebGL, so large grids and video can render more slowly than bitmap mode.
- Video page sampling is fixed at 10 fps, not source-native frame rate. It preserves the sampled timeline/duration but cannot represent motion faster than the sampling interval.
- The former 20-million-cumulative-cell ceiling has been removed. Long exports allocate page text and optional audio bytes in memory; video exports remain capped at 30 minutes and can be cancelled. Browser memory and compressed/expanded document size caps can still constrain very large files; compression itself has no fine-grained progress reporting.
- Safari/Firefox/WebKit matrix and measured performance coverage remain release work.

## Format and implementation references

- [`.ascii` schema and legacy import](./FILE_FORMAT.md)
- [Renderer/export architecture](./ARCHITECTURE.md)
- [Execution status](./STATUS.md)
- [Backlog](./TODO.md)
