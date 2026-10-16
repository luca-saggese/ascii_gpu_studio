<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { DEFAULT_SCENE } from '../../../src/core.js';
import { readAscii } from '../../../src/format.js';
import { createAsciiRenderer } from '../../../src/renderer.js';

const props = defineProps({
  src: { type: [String, Blob], required: true },
  autoplay: { type: Boolean, default: false },
  loop: { type: Boolean, default: false },
  muted: { type: Boolean, default: false },
});
const emit = defineEmits(['ready', 'error', 'play', 'pause', 'timeupdate', 'ended']);
const canvas = ref(null);
const video = ref(null);
const player = ref(null);
const time = ref(0);
const duration = ref(0);
const isVideo = ref(false);
let objectUrl = '';
let frameHandle = null;
let resizeObserver = null;
let disposed = false;

function fail(error) {
  emit('error', error instanceof Error ? error : new Error(String(error)));
}

function updateFrame() {
  if (!video.value || video.value.paused || disposed) return;
  player.value?.renderFrame();
  time.value = video.value.currentTime;
  emit('timeupdate', time.value);
  if ('requestVideoFrameCallback' in video.value)
    frameHandle = video.value.requestVideoFrameCallback(updateFrame);
  else frameHandle = requestAnimationFrame(updateFrame);
}

function onLoaded() {
  if (!video.value) return;
  duration.value = video.value.duration || 0;
  player.value?.setSource(video.value);
  player.value?.renderFrame();
  emit('ready', {
    kind: 'video',
    duration: duration.value,
    width: video.value.videoWidth,
    height: video.value.videoHeight,
  });
}

async function load() {
  try {
    if (typeof props.src === 'string' && !props.src.toLowerCase().endsWith('.ascii')) {
      throw new Error('AsciiPlayer richiede un URL di progetto .ascii.');
    }
    const bytes =
      props.src instanceof Blob
        ? new Uint8Array(await props.src.arrayBuffer())
        : new Uint8Array(await (await fetch(props.src)).arrayBuffer());
    const asset = await readAscii(bytes);
    const blob = new Blob([asset.media], { type: asset.manifest.media.mime });
    objectUrl = URL.createObjectURL(blob);
    await createRenderer(asset.scene);
    isVideo.value = asset.manifest.media.kind === 'video';
    if (isVideo.value) {
      video.value.src = objectUrl;
      video.value.loop = props.loop;
      video.value.muted = props.muted;
      if (props.autoplay) await play();
    } else {
      const image = new Image();
      image.onload = () => {
        player.value?.setSource(image);
        emit('ready', { kind: 'image', width: image.naturalWidth, height: image.naturalHeight });
      };
      image.onerror = () =>
        fail(new Error('Impossibile decodificare il media del progetto .ascii.'));
      image.src = objectUrl;
    }
  } catch (error) {
    fail(error);
  }
}

async function createRenderer(scene) {
  if (!canvas.value) return;
  player.value?.dispose();
  player.value = createAsciiRenderer({ canvas: canvas.value, scene, onError: fail });
  resizeObserver = new ResizeObserver(() => player.value?.resize());
  resizeObserver.observe(canvas.value.parentElement);
}

async function play() {
  if (!video.value) return;
  try {
    await video.value.play();
    emit('play');
    updateFrame();
  } catch (error) {
    fail(error);
  }
}

function pause() {
  video.value?.pause();
  emit('pause');
  if (frameHandle !== null) {
    if ('cancelVideoFrameCallback' in video.value)
      video.value.cancelVideoFrameCallback(frameHandle);
    else cancelAnimationFrame(frameHandle);
    frameHandle = null;
  }
}

function seek(seconds) {
  if (!video.value) return;
  video.value.currentTime = Math.max(0, Math.min(duration.value, Number(seconds) || 0));
  time.value = video.value.currentTime;
  player.value?.renderFrame();
}

function capturePng() {
  if (!player.value) return Promise.reject(new Error('Il renderer non è pronto.'));
  return player.value.capturePng();
}

watch(
  () => props.loop,
  (value) => {
    if (video.value) video.value.loop = value;
  },
);
watch(
  () => props.muted,
  (value) => {
    if (video.value) video.value.muted = value;
  },
);
onMounted(load);
onBeforeUnmount(() => {
  disposed = true;
  pause();
  resizeObserver?.disconnect();
  player.value?.dispose();
  if (objectUrl) URL.revokeObjectURL(objectUrl);
});

defineExpose({ play, pause, seek, capturePng });
</script>

<template>
  <div class="ascii-player">
    <canvas ref="canvas" aria-label="ASCII media preview" />
    <video
      ref="video"
      class="ascii-player__media"
      :loop="loop"
      :muted="muted"
      playsinline
      preload="metadata"
      @loadedmetadata="onLoaded"
      @ended="emit('ended')"
      @error="fail(new Error('Il browser non supporta il codec del video.'))"
    />
    <div v-if="isVideo" class="ascii-player__controls">
      <button type="button" @click="video?.paused ? play() : pause()">
        {{ video?.paused ? 'Play' : 'Pause' }}
      </button>
      <input
        aria-label="Video position"
        type="range"
        min="0"
        :max="duration || 1"
        step="0.01"
        :value="time"
        @input="seek($event.target.value)"
      />
      <span>{{ time.toFixed(1) }} / {{ duration.toFixed(1) }}s</span>
    </div>
  </div>
</template>

<style>
.ascii-player {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #101715;
}
.ascii-player canvas {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}
.ascii-player__media {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
.ascii-player__controls {
  position: absolute;
  inset: auto 0 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  background: #101715e8;
  color: #e9eeec;
  font: 12px sans-serif;
}
.ascii-player__controls input {
  flex: 1;
}
</style>
