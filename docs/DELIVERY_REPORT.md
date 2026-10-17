# Export workflow delivery report

## Implemented

- One **Export** dropdown, shown in the existing dark/teal UI. It offers ASCII, a source-appropriate PNG or MP4 action, and HTML playable. Outside click, Escape, arrow-key menu navigation, disabled states, video progress, and cancellation are wired.
- Version 1 `.ascii` is gzip-compressed UTF-8 JSON. It stores only rendered text pages and render parameters, with timestamps/durations for video, and compact Base64 RGB bytes per cell where needed. Image documents contain one page and no audio. The decoder validates the schema; older ZIP-based projects remain importable.
- Video-to-ASCII frame capture seeks through the source at a fixed 100 ms timeline, independent of preview callbacks. It yields between frames, reports progress, supports cancel, restores the source playback position, and includes captured WebM/Opus audio when the browser exposes a capturable audio track.
- PNG uses the ASCII page model and configured cell/font/color dimensions, not the source raster or Studio UI. It renders through OffscreenCanvas in a worker where available.
- HTML playable is a single offline `.html`: it embeds the compressed `.ascii` bytes as Base64, includes a self-contained player and the same page renderer, and has play/pause, seek, clock, volume, mute, and fullscreen controls. With audio it follows the audio clock; without audio it uses a monotonic clock. ASCII data is passed to `fillText`, never `innerHTML`.
- Old ZIP `.ascii` projects still import. New `.ascii` exports do not contain their original image/video or thumbnails.

## Verified

| Check               | Result            |
| ------------------- | ----------------- |
| `pnpm lint`         | Pending final run |
| `pnpm test`         | Pending final run |
| `pnpm build`        | Pending final run |
| `pnpm format:check` | Pending final run |
| `pnpm test:e2e`     | Pending final run |

E2E now covers image export in RGB mode, gzip JSON shape and absence of embedded source/thumbnail, PNG dimensions and sampled-pixel equality against the offline HTML render, HTML opened from a local file, menu visibility/close behavior, video timestamp ordering and end duration, video audio capture and offline playback/seek, and a video fixture with no audio.

## MP4 limitation — explicit

The MP4 menu action is implemented as a capability-checked operation but does not generate an MP4 in the verified environment. Playwright Chromium reports `MediaRecorder` MP4 support, but `VideoEncoder` and `AudioEncoder` (WebCodecs) are absent. Real-time `MediaRecorder` output cannot guarantee deterministic frame timestamps or no dropped frames, so the app stops with an actionable error rather than returning a misleading or incorrect `.mp4`. A deterministic WebCodecs pipeline and a verified MP4 muxer remain unimplemented.

## Additional limitations

- Video audio extraction for `.ascii` uses `HTMLMediaElement.captureStream()` and MediaRecorder with WebM/Opus. It is browser-dependent and runs in real time; browsers without capture or a supported audio recorder report an error. Video frame sampling itself remains deterministic.
- HTML uses the locally installed monospace font family, not an embedded font binary. Glyph appearances can differ across systems with different fonts.
- Video page sampling is fixed at 10 fps, not source-native frame rate. It preserves the sampled timeline/duration but cannot represent motion faster than the sampling interval.
- Long exports allocate page text and optional audio bytes in memory. The frame builder limits video exports to 30 minutes and can be cancelled; compression itself has no fine-grained progress reporting.
- MP4, external font embedding, browser matrix, and measured performance coverage remain release work.

## Format and implementation references

- [`.ascii` schema and legacy import](./FILE_FORMAT.md)
- [Renderer/export architecture](./ARCHITECTURE.md)
- [Execution status](./STATUS.md)
- [Backlog](./TODO.md)
