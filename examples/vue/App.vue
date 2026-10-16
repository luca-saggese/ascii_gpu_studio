<script setup>
import { onMounted, ref } from 'vue';
import { strToU8, zipSync } from 'fflate';
import { AsciiPlayer } from '../../packages/vue/src/index.js';

const player = ref(null);
const ready = ref(false);
const error = ref('');
const project = ref(null);

onMounted(async () => {
  try {
    const media = strToU8(await (await fetch('/tests/fixtures/studio-sample.svg')).text());
    const manifest = {
      format: 'ascii-gpu-asset',
      formatVersion: 1,
      media: { kind: 'image', path: 'media/source.svg', mime: 'image/svg+xml' },
      scene: {
        version: 1,
        grid: { columns: 64, maxCells: 40000 },
        typography: {
          charset: ' .:-=+*#%@',
          fontFamily: 'monospace',
          fontSize: 14,
          fontWeight: 500,
        },
        appearance: {
          mode: 'mono',
          foreground: '#d5f5e9',
          background: '#101715',
          brightness: 0,
          contrast: 1,
          gamma: 1,
          invert: false,
          fit: 'contain',
        },
      },
    };
    project.value = new Blob([
      zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest)), 'media/source.svg': media }),
    ]);
  } catch (cause) {
    error.value = cause.message;
  }
});

async function savePreview() {
  try {
    const blob = await player.value?.capturePng();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'vue-ascii-preview.png';
    link.click();
    URL.revokeObjectURL(url);
  } catch (cause) {
    error.value = cause.message;
  }
}
</script>

<template>
  <main>
    <h1>ASCII GPU Studio — Vue runtime</h1>
    <p v-if="!ready && !error">Loading local project asset…</p>
    <p v-if="error" role="alert">
      {{ error }}
    </p>
    <AsciiPlayer
      v-if="project"
      ref="player"
      :src="project"
      @ready="ready = true"
      @error="error = $event.message"
    />
    <button :disabled="!ready" @click="savePreview">Capture PNG</button>
  </main>
</template>
