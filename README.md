<div align="center">

# ASCII GPU Studio

**Turn images and videos into live ASCII art—with WebGL2 speed, original audio, and exports that play anywhere.**

A local-first creative studio for making, previewing, exporting, and playing ASCII video.

[Live demo](https://ascii.d-dr.com) · [Quick start](#quick-start) · [Features](#features) · [Verification](#verification)

</div>

<p align="center">
  <img src="docs/screenshots/studio-showcase.png" alt="ASCII GPU Studio converting an image to ASCII art with typography and rendering controls" width="100%">
</p>

## Meet ASCII GPU Studio

ASCII GPU Studio transforms local images and videos into richly shaded ASCII artwork. Explore the result in a real-time **WebGL2** preview, fine-tune the look with image and color controls, then export a portable `.ascii` project, a PNG, or a self-contained HTML player.

Video is a first-class format: convert a clip into timestamped ASCII frames, preserve its original audio when the browser can capture it, and play the result in the browser or right in your terminal with Python 3. All media processing happens locally in your browser—your source files are never uploaded.

## Features

- **Real-time WebGL2 rendering** — a GPU shader samples the image and selects glyphs from a high-resolution font atlas, with a Canvas 2D fallback when WebGL2 is unavailable.
- **Images and video** — import local media, preview video with its original browser audio, and convert video into timestamped ASCII frames.
- **Selectable, copyable ASCII** — switch to plain text, select the output, and copy it wherever you like.
- **Bitmap or true vector glyphs** — choose fast atlas rendering or OpenType outlines with preserved counters. Vector geometry is reused in preview, PNG, and offline HTML.
- **Audio-aware playback and export** — ASCII video documents can include captured source audio. The standalone HTML player supports synchronized playback and audio; the terminal player can play embedded audio through FFplay. If browser audio capture is unavailable, ASCII video export still completes without audio and reports the omission.
- **One-click exports** — save portable gzip-JSON `.ascii` projects, render PNG images, or create a self-contained playable HTML page. Video export to MP4 is offered when the browser provides the required deterministic encoding capabilities.
- **Creative image controls** — tune typography, glyph density, brightness, contrast, and inversion; detect edges with Sobel; or flatten colors into a stable perceptual palette without dithering.
- **Reusable Vue player** — integrate exported ASCII projects with the included Vue component and runnable example.
- **Private by design** — import, conversion, and export stay on your device.

## Quick start

Requirements: **Node.js 22–24** and **pnpm 11.24.0**.

```sh
pnpm install
pnpm dev
```

Open the local Vite URL, import an image or video, adjust the settings, and choose an output from **Export**.

## Play ASCII video in your terminal

The included Python 3 player reads exported `.ascii` video documents directly—no Python packages required. It follows frame timestamps and drops late frames to avoid accumulating playback delay. Install **FFmpeg/FFplay** to hear embedded audio.

```sh
python3 tools/play_ascii.py video.ascii
python3 tools/play_ascii.py video.ascii --fps 24
python3 tools/play_ascii.py video.ascii --no-audio --no-color
```

Audio is optional in `.ascii` documents. Silent exports play normally; when audio is present, FFplay handles the track while the terminal player schedules the ASCII frames. Startup and device latency from the external audio player may cause a small initial sync offset.

## Portable `.ascii` projects and HTML playback

`.ascii` files are gzip-compressed JSON containing the finished ASCII frames, timing, grid and visual settings—not the original image or video. Video documents may also include captured audio. Open them in ASCII GPU Studio, use the Python terminal player, or export a **standalone playable HTML** page for offline browser playback. The HTML player embeds its renderer and project data, supports video audio when present, and makes no CDN, font, or network requests.

Bitmap and vector rendering modes are recorded in the project. Vector documents include deduplicated outlines for the glyphs they use, so their offline appearance does not depend on installed fonts. See the [format specification](docs/FILE_FORMAT.md).

## Verification

```sh
pnpm lint
pnpm test
pnpm build
pnpm format:check
```

Browser end-to-end tests use Playwright and Chromium:

```sh
pnpm exec playwright install chromium
pnpm test:e2e
```

The browser suite covers WebGL2 glyph rendering, vector outlines and counters, selectable ASCII text, `.ascii` projects, PNG, offline HTML playback, the Vue player, and video controls. Python player tests:

```sh
python3 -m unittest discover -s tools -p 'test_*.py'
```

## Technology

JavaScript ES Modules · Vue 3 · Vite · WebGL2 · Canvas 2D · Python 3 terminal player

## Project status

The Studio is functional and actively developed. Browser support for deterministic MP4 encoding depends on WebCodecs H.264/AAC availability; unsupported configurations report a capability error rather than silently producing an unreliable file. Safari has not yet been included in the automated browser matrix. See the [verified status and limitations](docs/STATUS.md), [backlog](docs/TODO.md), and [delivery report](docs/DELIVERY_REPORT.md).

- [Architecture](docs/ARCHITECTURE.md)
- [Vue player API](docs/API.md)

## License

Released under the [MIT License](LICENSE).
