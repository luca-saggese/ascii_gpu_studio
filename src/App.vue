<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { DEFAULT_SCENE } from './core.js';
import { createAsciiRenderer } from './renderer.js';
import { exportAscii, readAscii } from './format.js';

const canvas = ref(null);
const picker = ref(null);
const video = ref(null);
const scene = ref(structuredClone(DEFAULT_SCENE));
const mediaFile = ref(null);
const mediaName = ref('');
const mediaKind = ref('');
const mediaUrl = ref('');
const mediaSize = ref({ width: 0, height: 0 });
const playing = ref(false);
const currentTime = ref(0);
const duration = ref(0);
const error = ref('');
const message = ref('');
const busy = ref(false);
const renderer = ref(null);
const activeTab = ref('controls');
let videoFrame = null;
let observer = null;
let lastScene = JSON.stringify(scene.value);

const currentTimeLabel = computed(() => formatTime(currentTime.value));
const durationLabel = computed(() => formatTime(duration.value));
const statsLabel = computed(
  () => renderer.value?.getStats() || { columns: 0, rows: 0, backend: 'WebGL2' },
);

function formatTime(seconds) {
  const value = Number.isFinite(seconds) ? seconds : 0;
  return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
}

function notify(text) {
  message.value = text;
  window.setTimeout(() => {
    if (message.value === text) message.value = '';
  }, 2800);
}

async function initializeRenderer() {
  await nextTick();
  if (!canvas.value || renderer.value) return;
  try {
    renderer.value = createAsciiRenderer({
      canvas: canvas.value,
      scene: scene.value,
      onError: (err) => {
        error.value = err.message;
      },
    });
    observer = new ResizeObserver(() => renderer.value?.resize());
    observer.observe(canvas.value.parentElement);
  } catch (err) {
    error.value = err.message;
  }
}

async function importFile(file) {
  if (!file) return;
  error.value = '';
  if (file.name.toLowerCase().endsWith('.ascii')) {
    try {
      const project = await readAscii(new Uint8Array(await file.arrayBuffer()));
      scene.value = project.scene;
      const restored = new File([project.media], project.manifest.media.path.split('/').pop(), {
        type: project.manifest.media.mime,
      });
      await loadMedia(restored);
      notify('Progetto .ascii ripristinato');
    } catch (err) {
      error.value = err.message;
    }
    return;
  }
  if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
    error.value = 'Scegli un’immagine o un video supportato dal browser.';
    return;
  }
  if (file.size > 100 * 1024 * 1024) {
    error.value = 'Il file supera il limite di 100 MB.';
    return;
  }
  await loadMedia(file);
}

async function loadMedia(file) {
  if (mediaUrl.value) URL.revokeObjectURL(mediaUrl.value);
  mediaFile.value = file;
  mediaName.value = file.name;
  mediaKind.value = file.type.startsWith('video/') ? 'video' : 'image';
  mediaUrl.value = URL.createObjectURL(file);
  await initializeRenderer();
  if (mediaKind.value === 'video') {
    await nextTick();
    video.value.src = mediaUrl.value;
    video.value.load();
  } else {
    const image = new Image();
    image.onload = () => {
      mediaSize.value = { width: image.naturalWidth, height: image.naturalHeight };
      renderer.value?.setSource(image);
    };
    image.onerror = () => {
      error.value = 'Impossibile decodificare questa immagine.';
    };
    image.src = mediaUrl.value;
  }
}

function onVideoReady() {
  if (!video.value) return;
  duration.value = video.value.duration || 0;
  mediaSize.value = { width: video.value.videoWidth, height: video.value.videoHeight };
  video.value.loop = scene.value.playback.loop;
  video.value.muted = scene.value.playback.muted;
  video.value.volume = scene.value.playback.volume;
  renderer.value?.setSource(video.value);
  renderer.value?.renderFrame();
}

function renderVideoFrame() {
  if (!video.value || video.value.paused || video.value.ended) return;
  renderer.value?.renderFrame();
  currentTime.value = video.value.currentTime;
  if ('requestVideoFrameCallback' in video.value)
    videoFrame = video.value.requestVideoFrameCallback(renderVideoFrame);
  else videoFrame = requestAnimationFrame(renderVideoFrame);
}

function playVideo() {
  if (!video.value) return;
  video.value
    .play()
    .then(() => {
      playing.value = true;
      renderVideoFrame();
    })
    .catch(() => {
      error.value = 'La riproduzione è stata bloccata dal browser. Premi play per riprovare.';
    });
}

function pauseVideo() {
  video.value?.pause();
  playing.value = false;
  if (videoFrame !== null) {
    if (video.value && 'cancelVideoFrameCallback' in video.value)
      video.value.cancelVideoFrameCallback(videoFrame);
    else cancelAnimationFrame(videoFrame);
    videoFrame = null;
  }
}

function seekVideo(event) {
  if (!video.value) return;
  video.value.currentTime = Number(event.target.value);
  currentTime.value = video.value.currentTime;
  renderer.value?.renderFrame();
}

function onVideoEnded() {
  playing.value = false;
  renderer.value?.renderFrame();
}

function dropFile(event) {
  const file = event.dataTransfer?.files?.[0];
  if (file) importFile(file);
}

function updateScene() {
  renderer.value?.setScene(scene.value);
}

watch(
  scene,
  (value) => {
    const serialized = JSON.stringify(value);
    if (serialized !== lastScene) {
      lastScene = serialized;
      updateScene();
    }
  },
  { deep: true },
);

async function saveProject() {
  if (!mediaFile.value) return;
  busy.value = true;
  try {
    const preview = renderer.value ? await renderer.value.capturePng() : null;
    const blob = await exportAscii({
      scene: scene.value,
      file: mediaFile.value,
      title: mediaName.value.replace(/\.[^.]+$/, ''),
      preview,
    });
    download(blob, `${mediaName.value.replace(/\.[^.]+$/, '')}.ascii`);
  } catch (err) {
    error.value = err.message;
  } finally {
    busy.value = false;
  }
}

async function savePng() {
  if (!renderer.value) return;
  try {
    download(await renderer.value.capturePng(), 'ascii-gpu-preview.png');
  } catch (err) {
    error.value = err.message;
  }
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function resetScene() {
  scene.value = structuredClone(DEFAULT_SCENE);
}

function onKeydown(event) {
  const target = event.target;
  const typing =
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'o') {
    event.preventDefault();
    picker.value?.click();
  } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    saveProject();
  } else if (event.code === 'Space' && !typing && mediaKind.value === 'video') {
    event.preventDefault();
    playing.value ? pauseVideo() : playVideo();
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  pauseVideo();
  observer?.disconnect();
  renderer.value?.dispose();
  if (mediaUrl.value) URL.revokeObjectURL(mediaUrl.value);
});
</script>

<template>
  <main class="studio">
    <header class="topbar">
      <a class="brand" href="#" aria-label="ASCII GPU Studio home"
        ><span class="brand-mark">A</span><span>ASCII<span class="brand-light">GPU</span></span></a
      >
      <div class="project-name">
        <strong>Untitled study</strong><span class="save-state"><i /> Local project</span>
      </div>
      <div class="top-actions">
        <button
          class="icon-button"
          :disabled="!mediaFile"
          title="Reset settings"
          aria-label="Reset settings"
          @click="resetScene"
        >
          ↺
        </button>
        <span class="top-divider" />
        <button class="button subtle" @click="picker?.click()">Open file <kbd>⌘O</kbd></button>
        <button class="button primary" :disabled="!mediaFile || busy" @click="saveProject">
          <span>↓</span> Export <kbd>⌘S</kbd>
        </button>
      </div>
    </header>
    <div class="workspace">
      <aside class="sidebar" :class="{ 'mobile-hidden': activeTab === 'preview' }">
        <div class="panel-heading">
          <div>
            <span class="eyebrow">WORKSPACE</span>
            <h1>Studio</h1>
          </div>
          <button class="icon-button small" title="Reset settings" @click="resetScene">↻</button>
        </div>
        <section class="inspector-section">
          <div class="section-title">
            <span class="section-icon">▧</span>
            <h2>Source</h2>
            <span class="section-line" />
          </div>
          <button v-if="!mediaFile" class="source-drop" @click="picker?.click()">
            <span class="upload-icon">↑</span><strong>Choose a file</strong
            ><span>Image or video · up to 100 MB</span>
          </button>
          <div v-else class="source-card">
            <span class="file-icon">{{ mediaKind === 'video' ? '▶' : '▧' }}</span
            ><span class="source-meta"
              ><strong>{{ mediaName }}</strong
              ><small
                >{{ mediaSize.width }} × {{ mediaSize.height }} ·
                {{ (mediaFile.size / 1048576).toFixed(1) }} MB</small
              ></span
            ><button class="icon-button small" aria-label="Replace source" @click="picker?.click()">
              ↻
            </button>
          </div>
          <div class="control-row">
            <label for="fit">Fit mode</label
            ><select id="fit" v-model="scene.appearance.fit">
              <option value="contain">Contain</option>
              <option value="cover">Cover</option>
              <option value="stretch">Stretch</option>
            </select>
          </div>
        </section>
        <section class="inspector-section">
          <div class="section-title">
            <span class="section-icon">▤</span>
            <h2>Typography</h2>
            <span class="section-line" />
          </div>
          <div class="control-row">
            <label for="font">Typeface</label
            ><select id="font" v-model="scene.typography.fontFamily">
              <option value="monospace">System Mono</option>
              <option value="Courier New">Courier New</option>
              <option value="ui-monospace">UI Monospace</option>
              <option value="serif">Serif</option>
            </select>
          </div>
          <div class="control-row">
            <label for="charset">Character set</label
            ><select
              id="charset"
              :value="scene.typography.charset"
              @change="scene.typography.charset = $event.target.value"
            >
              <option value=" .:-=+*#%@">Classic</option>
              <option value=" .,:;irsXA253hMHGS#9B&@">Detailed</option>
              <option value=" ░▒▓█">Blocks</option>
              <option value=" 01">Binary</option>
            </select>
          </div>
          <label class="field-label" for="columns"
            >Columns <output>{{ scene.grid.columns }}</output></label
          >
          <input
            id="columns"
            v-model.number="scene.grid.columns"
            type="range"
            min="32"
            max="180"
            step="1"
          />
          <div class="range-ends"><span>32</span><span>180</span></div>
          <label class="field-label" for="fontsize"
            >Character size <output>{{ scene.typography.fontSize }} px</output></label
          >
          <input
            id="fontsize"
            v-model.number="scene.typography.fontSize"
            type="range"
            min="8"
            max="28"
            step="1"
          />
        </section>
        <section class="inspector-section">
          <div class="section-title">
            <span class="section-icon">◐</span>
            <h2>Appearance</h2>
            <span class="section-line" />
          </div>
          <div class="mode-switch" role="group" aria-label="Color mode">
            <button
              :class="{ selected: scene.appearance.mode === 'mono' }"
              @click="scene.appearance.mode = 'mono'"
            >
              Monochrome</button
            ><button
              :class="{ selected: scene.appearance.mode === 'rgb' }"
              @click="scene.appearance.mode = 'rgb'"
            >
              Source color
            </button>
          </div>
          <div class="color-row">
            <label for="foreground">Ink color</label>
            <div class="color-control">
              <input id="foreground" v-model="scene.appearance.foreground" type="color" /><code>{{
                scene.appearance.foreground.toUpperCase()
              }}</code>
            </div>
          </div>
          <div class="color-row">
            <label for="background">Canvas</label>
            <div class="color-control">
              <input id="background" v-model="scene.appearance.background" type="color" /><code>{{
                scene.appearance.background.toUpperCase()
              }}</code>
            </div>
          </div>
          <label class="field-label" for="contrast"
            >Contrast <output>{{ scene.appearance.contrast.toFixed(1) }}</output></label
          ><input
            id="contrast"
            v-model.number="scene.appearance.contrast"
            type="range"
            min="0.2"
            max="2.5"
            step="0.1"
          />
          <label class="field-label" for="brightness"
            >Brightness
            <output
              >{{ scene.appearance.brightness > 0 ? '+' : ''
              }}{{ scene.appearance.brightness.toFixed(2) }}</output
            ></label
          ><input
            id="brightness"
            v-model.number="scene.appearance.brightness"
            type="range"
            min="-0.5"
            max="0.5"
            step="0.02"
          />
          <label class="check-row"
            ><input v-model="scene.appearance.invert" type="checkbox" /> Invert luminance</label
          >
        </section>
        <div class="sidebar-footer">
          <span class="privacy-icon">◈</span
          ><span
            ><strong>Private by design</strong><small>Your files stay on this device</small></span
          ><span class="status-dot" />
        </div>
      </aside>
      <section class="stage-column" :class="{ 'mobile-hidden': activeTab === 'controls' }">
        <div class="stage-toolbar">
          <div class="breadcrumbs">
            <span>Projects</span><span class="crumb-sep">/</span
            ><strong>{{ mediaName || 'Untitled study' }}</strong>
          </div>
          <div class="stage-actions">
            <span class="render-badge"><i /> WebGL2</span
            ><button class="button subtle" :disabled="!mediaFile" @click="savePng">
              Export PNG <span class="download-icon">↓</span>
            </button>
          </div>
        </div>
        <div class="stage-wrap" @dragover.prevent @drop.prevent="dropFile">
          <div v-if="!mediaFile" class="empty-state">
            <div class="empty-orbit"><span>Ａ</span><i class="orbit-dot" /></div>
            <span class="eyebrow">YOUR CREATIVE CANVAS</span>
            <h2>Turn pixels into<br /><em>something different.</em></h2>
            <p>
              Bring an image or video into the studio.<br />Your original media never leaves your
              device.
            </p>
            <button class="button primary large" @click="picker?.click()">
              Open an image <span>↗</span>
            </button>
            <div class="supported">
              <span>PNG</span><span>JPG</span><span>WEBP</span><span>MP4</span><span>WEBM</span>
            </div>
          </div>
          <div v-else class="canvas-frame">
            <canvas ref="canvas" aria-label="ASCII rendering preview" />
            <div class="canvas-label"><i /> LIVE PREVIEW</div>
          </div>
          <div class="stage-corner top-left" />
          <div class="stage-corner top-right" />
          <div class="stage-corner bottom-left" />
          <div class="stage-corner bottom-right" />
          <div v-if="error" class="error-toast" role="alert">
            <span>!</span>{{ error }}<button @click="error = ''">×</button>
          </div>
          <div v-if="message" class="toast" role="status">
            {{ message }}
          </div>
        </div>
        <div class="stage-status">
          <span
            ><i class="status-dot" />
            {{ mediaFile ? `${mediaSize.width} × ${mediaSize.height}` : 'Ready to create' }}</span
          ><span v-if="mediaFile"
            >{{ statsLabel.columns }} × {{ statsLabel.rows }} <span class="muted">cells</span></span
          ><span class="status-right">100% <span class="muted">·</span> GPU accelerated</span>
        </div>
        <div v-if="mediaKind === 'video'" class="video-controls">
          <button
            class="play-button"
            :aria-label="playing ? 'Pause video' : 'Play video'"
            @click="playing ? pauseVideo() : playVideo()"
          >
            {{ playing ? 'Ⅱ' : '▶' }}</button
          ><span class="timecode">{{ currentTimeLabel }}</span
          ><input
            aria-label="Video position"
            type="range"
            min="0"
            :max="duration || 1"
            step="0.01"
            :value="currentTime"
            @input="seekVideo"
          /><span class="timecode">{{ durationLabel }}</span
          ><button
            class="icon-button small"
            :aria-label="video?.muted ? 'Unmute video' : 'Mute video'"
            @click="
              video.muted = !video.muted;
              scene.playback.muted = video.muted;
            "
          >
            {{ video?.muted ? '◌' : '◖' }}</button
          ><button
            class="loop-button"
            :class="{ active: video?.loop }"
            :aria-pressed="video?.loop"
            aria-label="Toggle loop"
            @click="
              video.loop = !video.loop;
              scene.playback.loop = video.loop;
            "
          >
            ↻</button
          ><label class="volume-control"
            ><input
              v-model.number="scene.playback.volume"
              aria-label="Volume"
              type="range"
              min="0"
              max="1"
              step="0.05"
              @input="video.volume = scene.playback.volume"
          /></label>
        </div>
      </section>
    </div>
    <nav class="mobile-tabs">
      <button :class="{ active: activeTab === 'preview' }" @click="activeTab = 'preview'">
        Preview</button
      ><button :class="{ active: activeTab === 'controls' }" @click="activeTab = 'controls'">
        Controls</button
      ><button @click="mediaFile && saveProject()">Export</button>
    </nav>
    <input
      ref="picker"
      class="visually-hidden"
      type="file"
      accept="image/png,image/jpeg,image/webp,image/avif,video/mp4,video/webm,.ascii"
      @change="
        importFile($event.target.files?.[0]);
        $event.target.value = '';
      "
    />
    <video
      ref="video"
      class="media-source"
      playsinline
      preload="metadata"
      @loadedmetadata="onVideoReady"
      @loadeddata="onVideoReady"
      @timeupdate="currentTime = video?.currentTime || 0"
      @ended="onVideoEnded"
      @error="error = 'Il browser non riesce a decodificare questo video o codec.'"
    />
  </main>
</template>
