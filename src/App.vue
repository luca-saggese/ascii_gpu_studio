<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { DEFAULT_SCENE, fontFamilyFor, getAppearanceColors, validateScene } from './core.js';
import { createAsciiRenderer } from './renderer.js';
import { loadOutlineFonts } from './glyph-geometry.js';
import { readAscii } from './format.js';
import { deserializeAsciiDocument, serializeAsciiDocument } from './ascii-document.js';
import { captureAsciiDocument } from './ascii-export.js';
import { renderAsciiPage, renderAsciiPng } from './ascii-render.js';
import { createPlayableHtml } from './templates/playable-template.js';
import { assertDeterministicMp4Support, encodeAsciiMp4 } from './mp4-export.js';

const DEFAULTS_STORAGE_KEY = 'ascii-gpu-studio:scene-defaults:v1';
let defaultsLoadError = '';

function cloneScene(value) {
  return JSON.parse(JSON.stringify(value));
}

function renderCurrentFrame() {
  if (!mediaSize.value.width || !mediaSize.value.height) return;
  renderer.value?.renderFrame();
  if (scene.value.rendering?.mode !== 'vector' || asciiMode.value || !vectorCanvas.value) return;
  if (!outlineFontsReady) {
    if (!outlineFontsLoading) {
      outlineFontsLoading = loadOutlineFonts()
        .then(() => {
          outlineFontsReady = true;
          renderCurrentFrame();
        })
        .catch((cause) => {
          error.value = cause.message;
        });
    }
    return;
  }
  try {
    const capture = renderer.value?.captureText();
    if (!capture?.vectorGlyphs) return;
    renderAsciiPage(vectorCanvas.value.getContext('2d'), capture, {
      columns: capture.columns,
      rows: capture.rows,
      cellWidth: capture.cellWidth,
      cellHeight: capture.cellHeight,
      width: capture.outputWidth,
      height: capture.outputHeight,
      font: {
        family: capture.vectorFamily,
        size: capture.fontSize,
        weight: scene.value.typography.fontWeight,
        ascent: capture.ascent,
        descent: capture.descent,
        baseline: capture.baseline,
      },
      colors: {
        mode: scene.value.appearance.mode,
        ...getAppearanceColors(scene.value.appearance),
      },
      mode: 'vector',
      unitsPerEm: capture.unitsPerEm,
      glyphs: capture.vectorGlyphs,
    });
    vectorCanvas.value.dataset.columns = String(capture.columns);
    vectorCanvas.value.dataset.rows = String(capture.rows);
    vectorCanvas.value.dataset.outputWidth = String(capture.outputWidth);
    vectorCanvas.value.dataset.outputHeight = String(capture.outputHeight);
    vectorCanvas.value.dataset.cellWidth = String(capture.cellWidth);
    vectorCanvas.value.dataset.cellHeight = String(capture.cellHeight);
    vectorCanvas.value.dataset.sourceWidth = String(capture.sourceWidth);
    vectorCanvas.value.dataset.sourceHeight = String(capture.sourceHeight);
    statsLabel.value = {
      ...statsLabel.value,
      columns: capture.columns,
      rows: capture.rows,
      outputWidth: capture.outputWidth,
      outputHeight: capture.outputHeight,
      renderWidth: capture.outputWidth,
      renderHeight: capture.outputHeight,
      cellWidth: capture.cellWidth,
      cellHeight: capture.cellHeight,
      cellAdvance: capture.cellAdvance,
    };
  } catch (cause) {
    error.value = cause.message;
  }
}

function readSavedDefaults() {
  const saved = window.localStorage.getItem(DEFAULTS_STORAGE_KEY);
  if (saved === null) return null;
  const parsed = JSON.parse(saved);
  validateScene(parsed);
  parsed.rendering ??= cloneScene(DEFAULT_SCENE.rendering);
  parsed.typography.fontFamily = fontFamilyFor(parsed.typography.fontFamily);
  parsed.typography.lineHeight ??= 1.3;
  parsed.appearance.fit = 'contain';
  return cloneScene(parsed);
}

function getInitialScene() {
  try {
    return readSavedDefaults() ?? cloneScene(DEFAULT_SCENE);
  } catch (cause) {
    defaultsLoadError = `Impossibile caricare i parametri predefiniti salvati: ${cause.message}`;
    return cloneScene(DEFAULT_SCENE);
  }
}

const canvas = ref(null);
const vectorCanvas = ref(null);
const picker = ref(null);
const exportMenu = ref(null);
const exportButton = ref(null);
const video = ref(null);
const scene = ref(getInitialScene());
const appearanceColors = computed(() => getAppearanceColors(scene.value.appearance));
const mediaFile = ref(null);
const mediaName = ref('');
const mediaKind = ref('');
const mediaUrl = ref('');
const mediaSize = ref({ width: 0, height: 0 });
const asciiDocument = ref(null);
const statsLabel = ref({
  columns: 0,
  rows: 0,
  outputWidth: 0,
  outputHeight: 0,
  cellWidth: 0,
  cellHeight: 0,
  cellAdvance: 0,
  backend: 'WebGL2',
});
const playing = ref(false);
const currentTime = ref(0);
const duration = ref(0);
const error = ref(defaultsLoadError);
const message = ref('');
const busy = ref(false);
const exportProgress = ref(0);
const exportAbort = ref(null);
const exportMenuOpen = ref(false);
const renderer = ref(null);
const activeTab = ref('controls');
const asciiMode = ref(false);
const asciiText = ref('');
let videoFrame = null;
let observer = null;
let lastTextFrameTime = 0;
let lastScene = JSON.stringify(scene.value);
let exportWarning = '';
let outlineFontsReady = false;
let outlineFontsLoading = null;

const currentTimeLabel = computed(() => formatTime(currentTime.value));
const durationLabel = computed(() => formatTime(duration.value));
const asciiPreviewStyle = computed(() => {
  const font = asciiDocument.value?.render.font ?? scene.value.typography;
  const fontSize = Math.max(1, font.size ?? font.fontSize);
  const cellWidth = Math.max(1, statsLabel.value.cellWidth || 1);
  const cellHeight = Math.max(1, statsLabel.value.cellHeight || 1);
  const cellAdvance = Math.min(cellWidth, Math.max(0, statsLabel.value.cellAdvance || cellWidth));
  const colors = asciiDocument.value?.render.colors ?? {
    mode: scene.value.appearance.mode,
    ...getAppearanceColors(scene.value.appearance),
  };
  return {
    '--columns': Math.max(1, statsLabel.value.columns),
    '--rows': Math.max(1, statsLabel.value.rows),
    '--font-size': fontSize,
    '--cell-width': cellWidth,
    '--cell-height': cellHeight,
    '--cell-line-height': cellHeight / fontSize,
    '--cell-spacing': (cellWidth - cellAdvance) / fontSize,
    '--preview-font': `"${fontFamilyFor(font.family ?? scene.value.typography.fontFamily)}"`,
    '--preview-weight': font.weight ?? scene.value.typography.fontWeight,
    '--preview-foreground': colors.foreground,
    '--preview-background': colors.background,
  };
});
const hasContent = computed(() => Boolean(mediaFile.value || asciiDocument.value));

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
    await document.fonts.load(
      `${scene.value.typography.fontWeight} ${scene.value.typography.fontSize}px "${fontFamilyFor(scene.value.typography.fontFamily)}"`,
    );
    renderer.value = createAsciiRenderer({
      canvas: canvas.value,
      scene: scene.value,
      onError: (err) => {
        error.value = err.message;
      },
      onStats: (value) => {
        statsLabel.value = value;
      },
    });
    if (renderer.value.getStats().backend === 'Canvas2D fallback') {
      notify('WebGL2 non disponibile: anteprima attiva con Canvas 2D.');
    }
    renderCurrentFrame();
    observer = new ResizeObserver(() => renderer.value?.resize());
    observer.observe(canvas.value.parentElement);
  } catch (err) {
    error.value = err.message;
  }
}

async function importFile(file) {
  if (!file || busy.value) return;
  error.value = '';
  if (file.name.toLowerCase().endsWith('.ascii')) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
        const project = await deserializeAsciiDocument(bytes);
        pauseVideo();
        video.value?.removeAttribute('src');
        video.value?.load();
        if (mediaUrl.value) URL.revokeObjectURL(mediaUrl.value);
        mediaUrl.value = '';
        mediaFile.value = null;
        asciiDocument.value = project;
        mediaName.value = file.name;
        mediaKind.value = project.contentType;
        mediaSize.value = {
          width: project.render.width,
          height: project.render.height,
        };
        statsLabel.value = {
          ...statsLabel.value,
          columns: project.render.columns,
          rows: project.render.rows,
          outputWidth: project.render.width,
          outputHeight: project.render.height,
          renderWidth: project.render.width,
          renderHeight: project.render.height,
          cellWidth: project.render.cellWidth,
          cellHeight: project.render.cellHeight,
          cellAdvance: project.render.cellWidth,
        };
        asciiText.value = project.frames[0].text;
        asciiMode.value = true;
        currentTime.value = 0;
        duration.value =
          Math.max(...project.frames.map((frame) => frame.timestampMs + frame.durationMs)) / 1000;
        notify('Documento ASCII caricato');
        return;
      }
      const project = await readAscii(bytes);
      asciiDocument.value = null;
      scene.value = project.scene;
      scene.value.rendering ??= cloneScene(DEFAULT_SCENE.rendering);
      scene.value.typography.fontFamily = fontFamilyFor(scene.value.typography.fontFamily);
      scene.value.typography.lineHeight ??= 1.3;
      scene.value.appearance.fit = 'contain';
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
  asciiDocument.value = null;
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
      if (asciiMode.value) updateAsciiText();
      else renderCurrentFrame();
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
  if (scene.value.flattenColors.enabled) {
    ensureVideoPalette().catch((cause) => {
      error.value = cause.message;
    });
  }
  if (asciiMode.value) updateAsciiText();
  else renderCurrentFrame();
}

function updateAsciiText(isVideoFrame = false) {
  if (asciiDocument.value) {
    asciiText.value = asciiDocument.value.frames[0].text;
    return;
  }
  const now = performance.now();
  if (isVideoFrame && now - lastTextFrameTime < 125) return;
  try {
    const result = renderer.value?.captureText();
    if (result) {
      lastTextFrameTime = now;
      asciiText.value = result.text;
      statsLabel.value = {
        ...statsLabel.value,
        columns: result.columns,
        rows: result.rows,
        outputWidth: result.outputWidth,
        outputHeight: result.outputHeight,
        cellWidth: result.cellWidth,
        cellHeight: result.cellHeight,
        cellAdvance: result.cellAdvance,
      };
    }
  } catch (err) {
    error.value = err.message;
  }
}

function renderVideoFrame() {
  if (!video.value || video.value.paused || video.value.ended) return;
  if (asciiMode.value) updateAsciiText(true);
  else renderCurrentFrame();
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
  if (asciiMode.value) updateAsciiText();
  else renderCurrentFrame();
}

function onVideoEnded() {
  playing.value = false;
  if (asciiMode.value) updateAsciiText();
  else renderCurrentFrame();
}

function dropFile(event) {
  if (busy.value) return;
  const file = event.dataTransfer?.files?.[0];
  if (file) importFile(file);
}

function updateScene() {
  renderer.value?.setScene(scene.value);
  if (scene.value.flattenColors.enabled && mediaKind.value === 'video') {
    ensureVideoPalette().catch((cause) => {
      error.value = cause.message;
    });
  }
  if (asciiMode.value) updateAsciiText();
  else renderCurrentFrame();
}

async function ensureVideoPalette() {
  if (
    scene.value.flattenColors.enabled &&
    mediaKind.value === 'video' &&
    video.value?.videoWidth &&
    Number.isFinite(video.value.duration)
  ) {
    await renderer.value?.prepareVideoPalette(video.value);
    if (asciiMode.value) updateAsciiText();
    else renderCurrentFrame();
  }
}

watch(asciiMode, (enabled) => {
  if (enabled) updateAsciiText();
  else renderCurrentFrame();
});

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

function exportBaseName() {
  return mediaName.value.replace(/\.(ascii|[^.]+)$/i, '') || 'ascii-art';
}

async function buildExportDocument({
  signal,
  progressStart = 0,
  progressEnd = 1,
  includeAudio = true,
} = {}) {
  if (asciiDocument.value) return asciiDocument.value;
  if (!renderer.value || !mediaFile.value) throw new Error('Carica prima un’immagine o un video.');
  await ensureVideoPalette();
  const wasPlaying = mediaKind.value === 'video' && !video.value.paused;
  if (wasPlaying) pauseVideo();
  try {
    return await captureAsciiDocument({
      renderer: renderer.value,
      scene: scene.value,
      kind: mediaKind.value,
      video: mediaKind.value === 'video' ? video.value : null,
      signal,
      includeAudio,
      onProgress: (progress) => {
        exportProgress.value = Math.min(
          100,
          Math.round((progressStart + progress * (progressEnd - progressStart)) * 100),
        );
      },
      onWarning: (warning) => {
        exportWarning = warning;
      },
    });
  } finally {
    if (wasPlaying) playVideo();
  }
}

async function performExport(kind) {
  if (!hasContent.value || busy.value) return;
  exportMenuOpen.value = false;
  busy.value = true;
  exportProgress.value = 0;
  exportWarning = '';
  error.value = '';
  const controller = new AbortController();
  exportAbort.value = controller;
  try {
    if (kind === 'mp4') {
      const dimensions =
        asciiDocument.value?.render ??
        (() => {
          const capture = renderer.value?.captureText();
          if (!capture) throw new Error('Carica prima un video.');
          return {
            width: Math.ceil(capture.outputWidth / 2) * 2,
            height: Math.ceil(capture.outputHeight / 2) * 2,
          };
        })();
      await assertDeterministicMp4Support(
        dimensions.width + (dimensions.width % 2),
        dimensions.height + (dimensions.height % 2),
      );
      const model = await buildExportDocument({
        signal: controller.signal,
        progressStart: 0,
        progressEnd: 0.45,
        includeAudio: false,
      });
      const blob = await encodeAsciiMp4(model, {
        signal: controller.signal,
        sourceFile: mediaFile.value,
        onProgress: (progress) => {
          exportProgress.value = Math.round((0.45 + progress * 0.55) * 100);
        },
      });
      download(blob, `${exportBaseName()}.mp4`);
      notify(exportWarning || 'Export MP4 completato');
      return;
    }
    const model = await buildExportDocument({ signal: controller.signal });
    if (kind === 'ascii') {
      const bytes = await serializeAsciiDocument(model);
      download(new Blob([bytes], { type: 'application/gzip' }), `${exportBaseName()}.ascii`);
    } else if (kind === 'png') {
      download(await renderAsciiPng(model), `${exportBaseName()}.png`);
    } else if (kind === 'html') {
      download(await createPlayableHtml(model), `${exportBaseName()}-playable.html`);
    }
    notify(exportWarning || 'Export completato');
  } catch (err) {
    if (err.name !== 'AbortError') error.value = err.message;
    else notify('Esportazione annullata');
  } finally {
    exportAbort.value = null;
    busy.value = false;
  }
}

function cancelExport() {
  exportAbort.value?.abort();
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
  try {
    scene.value = readSavedDefaults() ?? cloneScene(DEFAULT_SCENE);
    error.value = '';
  } catch (cause) {
    error.value = `Impossibile caricare i parametri predefiniti salvati: ${cause.message}`;
    scene.value = cloneScene(DEFAULT_SCENE);
  }
}

function saveDefaults() {
  try {
    validateScene(scene.value);
    window.localStorage.setItem(DEFAULTS_STORAGE_KEY, JSON.stringify(scene.value));
    notify('Parametri predefiniti salvati');
    error.value = '';
  } catch (cause) {
    error.value = `Impossibile salvare i parametri predefiniti: ${cause.message}`;
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  document.addEventListener('pointerdown', onOutsideExportClick);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  document.removeEventListener('pointerdown', onOutsideExportClick);
  cancelExport();
  pauseVideo();
  observer?.disconnect();
  renderer.value?.dispose();
  if (mediaUrl.value) URL.revokeObjectURL(mediaUrl.value);
});

function onOutsideExportClick(event) {
  if (!exportMenu.value?.contains(event.target)) exportMenuOpen.value = false;
}

function onExportMenuKeydown(event) {
  const options = [...exportMenu.value.querySelectorAll('[role="menuitem"]:not(:disabled)')];
  const index = options.indexOf(document.activeElement);
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const offset = event.key === 'ArrowDown' ? 1 : -1;
    options[(index + offset + options.length) % options.length]?.focus();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    exportMenuOpen.value = false;
    exportButton.value?.focus();
  }
}

function onKeydown(event) {
  if (event.key === 'Escape' && exportMenuOpen.value) {
    event.preventDefault();
    exportMenuOpen.value = false;
    exportButton.value?.focus();
    return;
  }
  const target = event.target;
  const typing =
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'o') {
    event.preventDefault();
    picker.value?.click();
  } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    performExport('ascii');
  } else if (event.code === 'Space' && !typing && mediaKind.value === 'video') {
    event.preventDefault();
    playing.value ? pauseVideo() : playVideo();
  }
}
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
          :disabled="!mediaFile || busy"
          title="Reset settings"
          aria-label="Reset settings"
          @click="resetScene"
        >
          ↺
        </button>
        <span class="top-divider" />
        <button class="button subtle" @click="picker?.click()">Open file <kbd>⌘O</kbd></button>
        <div ref="exportMenu" class="export-menu-wrap">
          <button
            ref="exportButton"
            class="button primary"
            :disabled="!hasContent || busy"
            aria-haspopup="menu"
            :aria-expanded="exportMenuOpen"
            aria-controls="export-menu"
            @click="exportMenuOpen = !exportMenuOpen"
            @keydown.arrow-down.prevent="
              exportMenuOpen = true;
              nextTick(() => exportMenu?.querySelector('[role=menuitem]')?.focus());
            "
          >
            <span>↓</span> Export <kbd>⌘S</kbd>
          </button>
          <div
            v-if="exportMenuOpen"
            id="export-menu"
            class="export-menu"
            role="menu"
            aria-label="Export options"
            @keydown="onExportMenuKeydown"
          >
            <button role="menuitem" :disabled="busy" @click="performExport('ascii')">
              Export ASCII
            </button>
            <button
              v-if="mediaKind === 'image'"
              role="menuitem"
              :disabled="busy"
              @click="performExport('png')"
            >
              Export PNG
            </button>
            <button
              v-else-if="mediaKind === 'video'"
              role="menuitem"
              :disabled="busy"
              @click="performExport('mp4')"
            >
              Export video (.mp4)
            </button>
            <button role="menuitem" :disabled="busy" @click="performExport('html')">
              Export HTML playable
            </button>
          </div>
        </div>
        <div v-if="busy" class="export-progress" role="status" aria-live="polite">
          <span>{{ exportProgress }}%</span>
          <button class="button subtle" @click="cancelExport">Cancel</button>
        </div>
      </div>
    </header>
    <div class="workspace">
      <aside
        class="sidebar"
        :class="{ 'mobile-hidden': activeTab === 'preview' }"
        :inert="busy || Boolean(asciiDocument)"
      >
        <div class="panel-heading">
          <div>
            <span class="eyebrow">WORKSPACE</span>
            <h1>Studio</h1>
          </div>
          <div class="panel-heading-actions">
            <button class="button subtle save-defaults" @click="saveDefaults">Save defaults</button>
            <button class="icon-button small" title="Reset settings" @click="resetScene">↻</button>
          </div>
        </div>
        <div class="settings-scroll">
          <details class="inspector-section" open>
            <summary class="section-title">
              <span class="section-icon">▧</span>
              <h2>Source</h2>
              <span class="section-line" />
            </summary>
            <button v-if="!hasContent" class="source-drop" @click="picker?.click()">
              <span class="upload-icon">↑</span><strong>Choose a file</strong
              ><span>Image or video · up to 100 MB</span>
            </button>
            <div v-else class="source-card">
              <span class="file-icon">{{ mediaKind === 'video' ? '▶' : '▧' }}</span
              ><span class="source-meta"
                ><strong>{{ mediaName }}</strong
                ><small
                  >{{ mediaSize.width }} × {{ mediaSize.height }} ·
                  {{
                    mediaFile ? `${(mediaFile.size / 1048576).toFixed(1)} MB` : 'ASCII document'
                  }}</small
                ></span
              ><button
                class="icon-button small"
                aria-label="Replace source"
                @click="picker?.click()"
              >
                ↻
              </button>
            </div>
            <div class="control-row">
              <label>Fit mode</label><span class="control-value">Contain</span>
            </div>
          </details>
          <details class="inspector-section" open>
            <summary class="section-title">
              <span class="section-icon">▤</span>
              <h2>Typography</h2>
              <span class="section-line" />
            </summary>
            <div class="control-row">
              <label for="font">Typeface</label
              ><select id="font" v-model="scene.typography.fontFamily">
                <option value="IBM Plex Mono">IBM Plex Mono</option>
                <option value="Cousine">Cousine</option>
              </select>
            </div>
            <label class="check-row"
              ><input
                v-model="scene.rendering.mode"
                type="checkbox"
                true-value="vector"
                false-value="bitmap"
              />
              Rendering vettoriale</label
            >
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
            <label class="field-label" for="font-size"
              >Font size <output>{{ scene.typography.fontSize }} px</output></label
            >
            <input
              id="font-size"
              v-model.number="scene.typography.fontSize"
              type="range"
              min="8"
              max="48"
              step="1"
            />
            <div class="range-ends"><span>8 px</span><span>48 px</span></div>
            <label class="field-label" for="line-height"
              >Line height <output>{{ scene.typography.lineHeight.toFixed(2) }}×</output></label
            >
            <input
              id="line-height"
              v-model.number="scene.typography.lineHeight"
              type="range"
              min="1"
              max="2"
              step="0.05"
            />
          </details>
          <details class="inspector-section" open>
            <summary class="section-title">
              <span class="section-icon">◐</span>
              <h2>Appearance</h2>
              <span class="section-line" />
            </summary>
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
              <button
                :class="{ selected: scene.appearance.mode === 'bw' }"
                aria-label="Black and white"
                title="Render only black and white"
                @click="scene.appearance.mode = 'bw'"
              >
                B/W
              </button>
            </div>
            <div class="color-row">
              <label for="foreground">Ink color</label>
              <div class="color-control">
                <input
                  id="foreground"
                  :value="appearanceColors.foreground"
                  :disabled="scene.appearance.mode === 'bw'"
                  type="color"
                  @input="scene.appearance.foreground = $event.target.value"
                /><code>{{ appearanceColors.foreground.toUpperCase() }}</code>
              </div>
            </div>
            <div class="color-row">
              <label for="background">Canvas</label>
              <div class="color-control">
                <input
                  id="background"
                  :value="appearanceColors.background"
                  :disabled="scene.appearance.mode === 'bw'"
                  type="color"
                  @input="scene.appearance.background = $event.target.value"
                /><code>{{ appearanceColors.background.toUpperCase() }}</code>
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
          </details>
          <details class="inspector-section edge-section" open>
            <summary class="section-title">
              <span class="section-icon">⌁</span>
              <h2>Edge Detection</h2>
              <span class="section-line" />
            </summary>
            <label class="check-row">
              <input v-model="scene.edgeDetection.enabled" type="checkbox" /> Enable edge detection
            </label>
            <template v-if="scene.edgeDetection.enabled">
              <label class="field-label" for="edge-threshold"
                >Threshold <output>{{ scene.edgeDetection.threshold }}</output></label
              >
              <div class="edge-threshold">
                <input
                  id="edge-threshold"
                  v-model.number="scene.edgeDetection.threshold"
                  type="range"
                  min="0"
                  max="255"
                  step="1"
                />
                <input
                  v-model.number="scene.edgeDetection.threshold"
                  aria-label="Threshold value"
                  type="number"
                  min="0"
                  max="255"
                  step="1"
                />
              </div>
              <label class="field-label" for="edge-smoothing"
                >Smoothing <output>{{ scene.edgeDetection.smoothing || 'Off' }}</output></label
              >
              <input
                id="edge-smoothing"
                v-model.number="scene.edgeDetection.smoothing"
                type="range"
                min="0"
                max="3"
                step="1"
              />
              <div class="control-row">
                <label for="edge-mode">Modalità bordi</label>
                <select id="edge-mode" v-model="scene.edgeDetection.mode">
                  <option value="edges">Solo bordi</option>
                  <option value="image">Bordi + immagine</option>
                </select>
              </div>
              <template v-if="scene.edgeDetection.mode === 'image'">
                <label class="field-label" for="edge-intensity"
                  >Intensità bordi
                  <output>{{ scene.edgeDetection.intensity.toFixed(2) }}</output></label
                >
                <input
                  id="edge-intensity"
                  v-model.number="scene.edgeDetection.intensity"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                />
              </template>
            </template>
          </details>
          <details class="inspector-section flatten-section" open>
            <summary class="section-title">
              <span class="section-icon">▦</span>
              <h2>Flatten Colors</h2>
              <span class="section-line" />
            </summary>
            <label class="check-row">
              <input v-model="scene.flattenColors.enabled" type="checkbox" /> Enable color
              flattening
            </label>
            <template v-if="scene.flattenColors.enabled">
              <label class="field-label" for="flatten-color-count"
                >Numero di colori <output>{{ scene.flattenColors.colorCount }}</output></label
              >
              <input
                id="flatten-color-count"
                v-model.number="scene.flattenColors.colorCount"
                type="range"
                min="2"
                max="64"
                step="1"
              />
              <p class="filter-help">
                Riduce la palette globale e uniforma le campiture; non aggiunge dithering.
              </p>
              <label class="field-label" for="flatten-smoothing"
                >Smoothing <output>{{ scene.flattenColors.smoothing }}</output></label
              >
              <input
                id="flatten-smoothing"
                v-model.number="scene.flattenColors.smoothing"
                type="range"
                min="0"
                max="10"
                step="1"
              />
              <p class="filter-help">
                Bilaterale: attenua texture e variazioni locali preservando i contorni. Non cambia
                il numero di colori.
              </p>
            </template>
          </details>
        </div>
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
            <div v-if="mediaFile" class="view-switch" role="group" aria-label="Preview mode">
              <button :class="{ selected: !asciiMode }" @click="asciiMode = false">GPU</button>
              <button :class="{ selected: asciiMode }" @click="asciiMode = true">ASCII text</button>
            </div>
            <span class="render-badge"
              ><i />
              {{
                asciiMode
                  ? 'TEXT'
                  : scene.rendering.mode === 'vector'
                    ? 'VECTOR'
                    : statsLabel.backend
              }}</span
            >
          </div>
        </div>
        <div class="stage-wrap" @dragover.prevent @drop.prevent="dropFile">
          <div v-if="!hasContent" class="empty-state">
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
          <div v-else-if="mediaFile" v-show="!asciiMode" class="canvas-frame">
            <canvas
              ref="canvas"
              aria-label="ASCII rendering preview"
              :class="{ 'bitmap-hidden': scene.rendering.mode === 'vector' }"
            />
            <canvas
              v-show="scene.rendering.mode === 'vector'"
              ref="vectorCanvas"
              class="vector-preview"
              aria-label="ASCII vector rendering preview"
            />
            <div class="canvas-label"><i /> LIVE PREVIEW</div>
          </div>
          <div
            v-if="hasContent && (asciiMode || asciiDocument)"
            class="ascii-preview"
            :style="asciiPreviewStyle"
          >
            <pre aria-label="Plain text ASCII preview">{{ asciiText }}</pre>
            <div class="canvas-label"><i /> PLAIN TEXT · {{ statsLabel.columns }} COLUMNS</div>
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
            {{ hasContent ? `${mediaSize.width} × ${mediaSize.height}` : 'Ready to create' }}</span
          ><span v-if="hasContent"
            >{{ statsLabel.columns }} × {{ statsLabel.rows }} <span class="muted">cells</span>
            <span v-if="statsLabel.outputWidth" class="muted"
              >·
              {{
                asciiMode
                  ? `${statsLabel.columns} × ${statsLabel.rows} text chars`
                  : `${statsLabel.renderWidth} × ${statsLabel.renderHeight} GPU px`
              }}</span
            ></span
          ><span class="status-right">{{
            asciiDocument ? 'ASCII document' : '100% · GPU accelerated'
          }}</span>
        </div>
        <div v-if="mediaFile && mediaKind === 'video'" class="video-controls" :inert="busy">
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
        Controls
      </button>
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
