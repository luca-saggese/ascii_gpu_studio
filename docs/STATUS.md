# Execution status

Current milestone: M6 — release hardening, **partial implementation; not release-ready**

Latest verified implementation commit: `e835d84` (`fix(renderer): sample complete glyphs with measured cell metrics`); subsequent renderer/text-preview fixes are verified in the working tree and awaiting commit.

Additional checkpoints: `9c9633c` (Studio/runtime implementation), `c229bda` (video audio decode E2E), `06410a5` (archive path hardening)

Latest working-tree checks: `pnpm lint` PASS; `pnpm test` PASS (5 tests); `pnpm build` PASS (116.47 kB JS, 13.19 kB CSS); `pnpm format:check` PASS; `pnpm test:e2e` PASS (6 Chromium scenarios, including dark-to-dense glyph mapping, distinct glyph masks, and source audio decode).

## Works now

- Responsive Vue 3/Vite Studio with empty state, local image/video import, error handling, and no media upload.
- Real WebGL2 fragment shader with measured glyph atlas, live columns/font/charset/color/fit/brightness/contrast/invert controls, and PNG capture.
- Toggle between WebGL output and normal monospace ASCII text; framebuffer uses up to 2× device-pixel atlas resolution and preserves cell aspect ratio. Status reports actual WebGL framebuffer pixels.
- Corrected tonal mapping so dark pixels select denser glyphs and bright pixels select lighter glyphs; a black/white split-image browser regression verifies the behavior.
- Native HTML video audio and media clock, `requestVideoFrameCallback` rendering/fallback, user-triggered play/pause/seek/loop/mute/volume.
- `.ascii` v1 ZIP export/import containing manifest, original source, preview PNG, and settings; streaming path/entry/expanded-size checks.
- Vue `AsciiPlayer` example loads a real package and renders it.
- Chromium E2E covers empty state, responsive widths, image render/parameter change, `.ascii` export/import, PNG signature, malicious traversal rejection, Vue runtime, and video controls.

## Does not work / not claimed

- Edge-aware/perceptual selection, temporal hysteresis, custom charset text entry, editing/history/undo, presets, custom font uploads, TXT/SVG export.
- WebM export and video frame-step; audio playback is the original `<video>` audio track only. The synthetic Opus stream is confirmed decoded during native video playback; audible output still depends on browser/device audio policy.
- React/Web Component packages, external Vue consumer install/publish, Canvas2D fallback, WebGL context restoration.
- CI/browser matrix, screen-reader audit, quantitative performance/memory benchmarks, and hand-reviewed screenshots on other operating systems.
- `.ascii` hard limits prevent oversized extraction, but the implementation still holds extracted file bytes in memory; archives are local, not streamed from remote storage.
- Expanded-size enforcement is implemented during decompression, but there is not yet a dedicated ZIP-bomb regression fixture that drives the 200 MiB cap.

## Known limits

- WebGL2 is required; unavailable contexts show an error and do not fall back.
- Browser codec support/autoplay policy governs video. Source file cap 100 MiB; ZIP cap 110 MiB compressed, 200 MiB expanded, 32 entries.
- `@ascii-gpu/vue` is currently a local workspace source package, not yet a standalone publishable package.
- The image preview stores the original media but handles EXIF/magic-byte validation and unusual color profiles are not yet hardened.

## Next three actions

1. Add a ZIP expansion-limit regression fixture and WebGL context loss/restore coverage.
2. Make the Vue SDK package self-contained and verify an external consumer installation.
3. Add CI and Firefox/WebKit E2E before claiming release readiness.
