# Runtime API

`createAsciiRenderer({ canvas, scene, onError })` creates a WebGL2 renderer. `setSource(imageOrVideoElement)`, `setScene(scene)`, `resize()`, and `renderFrame()` update the canvas. `capturePng()` returns a PNG `Blob`; `getStats()` returns current cell dimensions and backend. `dispose()` releases GL resources.

Scene colors are CSS hex values. `grid.columns` is 16–320, `grid.maxCells` caps total cells, `typography.charset` contains 2–128 codepoints, brightness is -0.5–0.5, contrast 0.2–2.5, and gamma is positive. Source must be decoded by the browser before passing it to the renderer.

The renderer additionally exposes `captureText()`, returning the plain-text grid, columns, rows, and measured font cell dimensions. This operation samples through Canvas 2D on demand and is intended for text preview/export rather than high-throughput video rendering.

The Vue wrapper is exported from `packages/vue/src/index.js` as `AsciiPlayer`. It loads an `.ascii` URL or Blob, emits `ready`, `error`, `play`, `pause`, `timeupdate`, and `ended`, and exposes `play`, `pause`, `seek(seconds)`, and `capturePng()` through its component ref. It uses native video audio and the browser video clock.

```vue
<script setup>
import { ref } from 'vue';
import { AsciiPlayer } from '@ascii-gpu/vue';
const player = ref(null);
</script>
<template>
  <AsciiPlayer ref="player" src="/assets/demo.ascii" @ready="onReady" />
</template>
```
