# Execution status

Current milestone: M6 — release hardening, **partial implementation; not release-ready**  
Latest verified commit: pending milestone commits  
Last checks: lint pending final run; unit pending final run; build pending final run; E2E Chromium 5/5 PASS (latest full run before final validation)

## Works now

- Responsive Vue 3/Vite Studio with empty state, local image/video import, error handling, and no media upload.
- Real WebGL2 fragment shader with measured glyph atlas, live columns/font/charset/color/fit/brightness/contrast/invert controls, and PNG capture.
- Native HTML video audio and media clock, `requestVideoFrameCallback` rendering/fallback, user-triggered play/pause/seek/loop/mute/volume.
- `.ascii` v1 ZIP export/import containing manifest, original source, preview PNG, and settings; streaming path/entry/expanded-size checks.
- Vue `AsciiPlayer` example loads a real package and renders it.
- Chromium E2E covers empty state, responsive widths, image render/parameter change, `.ascii` export/import, PNG signature, malicious traversal rejection, Vue runtime, and video controls.

## Does not work / not claimed

- Edge-aware/perceptual selection, temporal hysteresis, custom charset text entry, editing/history/undo, presets, custom font uploads, TXT/SVG export.
- WebM export and video frame-step; audio playback is the original `<video>` audio track only. The fixture confirms a source audio track exists and native video plays, but browser test does not acoustically verify audible output.
- React/Web Component packages, external Vue consumer install/publish, Canvas2D fallback, WebGL context restoration.
- CI/browser matrix, screen-reader audit, quantitative performance/memory benchmarks, and hand-reviewed screenshots on other operating systems.
- `.ascii` hard limits prevent oversized extraction, but the implementation still holds extracted file bytes in memory; archives are local, not streamed from remote storage.

## Known limits

- WebGL2 is required; unavailable contexts show an error and do not fall back.
- Browser codec support/autoplay policy governs video. Source file cap 100 MiB; ZIP cap 110 MiB compressed, 200 MiB expanded, 32 entries.
- `@ascii-gpu/vue` is currently a local workspace source package, not yet a standalone publishable package.
- The image preview stores the original media but handles EXIF/magic-byte validation and unusual color profiles are not yet hardened.

## Next three actions

1. Run final lint, unit, build, format, and full Chromium E2E after final code changes.
2. Finish docs with exact check results and tested limitations, then checkpoint commits.
3. Continue AGPU-041 and AGPU-051 before claiming release readiness.
