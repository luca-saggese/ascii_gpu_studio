# TODO — execution backlog

Each status reflects the tested user-facing path, not code presence alone. Estimates are coarse.

## Completed

- [x] AGPU-001 [P0] Bootstrap Vue/Vite JavaScript project — M0; `9c9633c`.
- [x] AGPU-010 [P0] Import local images and render glyph atlas with WebGL2 — M1; E2E verifies complete, distinct glyph masks; `9c9633c`, `e835d84`.
- [x] AGPU-011 [P0] Wire charset, font family/size, columns, fit, color, contrast, brightness, invert — M2 baseline; E2E changes columns; `9c9633c`, `e835d84`.
- [x] AGPU-013 [P0] Add plain-text ASCII preview beside WebGL view and report actual framebuffer resolution — E2E compares text rows, distinct GPU glyph masks and aspect ratio; text-mode video refresh capped at 8 fps.
- [x] AGPU-020 [P0] Play, pause, seek, loop, mute, and volume native video with source audio — M3 baseline; synthetic VP8/Opus decode and controls verified in Chromium; `9c9633c`, `c229bda`.
- [x] AGPU-030 [P0] Write/import bounded versioned `.ascii`, preserve source, scene, preview thumbnail, and render — M5; unit and browser round-trip tests; `9c9633c`.
- [x] AGPU-031 [P0] Export PNG from WebGL canvas — M5; browser validates PNG signature and nonzero dimensions; `9c9633c`.
- [x] AGPU-032 [P0] Vue `AsciiPlayer` wrapper and runnable example — M5; browser loads a generated `.ascii` and renders it; `9c9633c`.
- [x] AGPU-040 [P0] Reject ZIP traversal and drive-absolute paths during bounded streaming extraction — unit/E2E cover path rejection; `06410a5`.
- [x] AGPU-014 [P1] Remove user font-size control and improve raster detail — fixed internal 20 px glyph size, 4×–8× GPU-aware atlas scale, and 32–320 column control; covered by Chromium E2E.

## In progress

- [ ] AGPU-050 [P0] Release hardening and delivery evidence — M6; complete the multi-browser matrix and review E2E screenshots.
- [ ] AGPU-041 [P0] Add a dedicated ZIP expanded-limit regression fixture; streaming limit implemented but the 200 MiB abort path is not independently exercised.

## Backlog

- [ ] AGPU-012 [P0] Validate image magic bytes, EXIF orientation, alpha handling, and browser texture limits.
- [ ] AGPU-021 [P0] Verify native audio output across browser policies/devices and include a manual audio check.
- [ ] AGPU-033 [P0] Make Vue SDK self-contained/publishable and test consumer install from an external project.
- [ ] AGPU-042 [P0] Add tested WebGL context loss/restoration and a user-visible recovery path.
- [ ] AGPU-051 [P0] Add CI workflow, browser installation/cache, npm/license audit, and accessibility review.
- [ ] AGPU-052 [P1] Add edge-aware selection, temporal hysteresis, golden quality comparisons, and measured FPS benchmarks.
- [ ] AGPU-053 [P1] Add custom charset entry, preset library, undo/redo, custom font handling, TXT/SVG export.
- [ ] AGPU-054 [P1] Add React and Web Component wrappers.
- [ ] AGPU-055 [P2] Evaluate adaptive quality, GIF animation, webcam, and WebM recording with verified audio.

## Blocked

- None. P0 hardening and support breadth remain incomplete but do not prevent further local development.
