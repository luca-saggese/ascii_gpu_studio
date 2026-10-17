import {
  coverageOrder,
  DEFAULT_SCENE,
  fontFamilyFor,
  getAppearanceColors,
  calculateContentLayout,
  validateScene,
} from './core.js';
import { vectorGlyphs } from './glyph-geometry.js';
import { createEdgeMap } from './edge-detection.js';
import {
  buildColorPalette,
  collectVideoColorSamples,
  flattenPixelData,
  paletteAsHex,
  sampleSourceColors,
} from './flatten-colors.js';
import { renderAsciiPage } from './ascii-render.js';

const vertex = `#version 300 es
in vec2 position;
out vec2 uv;
void main(){ uv=position*.5+.5; gl_Position=vec4(position,0.,1.); }`;

const fragment = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 color;
uniform sampler2D sourceTex;
uniform sampler2D atlasTex;
uniform vec2 sourceSize;
uniform vec2 gridSize;
uniform vec2 tileSize;
uniform float atlasScale;
uniform float glyphCount;
uniform float brightness;
uniform float contrast;
uniform float gammaValue;
uniform float invertValue;
uniform float rgbMode;
uniform float bwMode;
uniform float edgeEnabled;
uniform float edgeThreshold;
uniform float edgeSmoothing;
uniform float edgeMode;
uniform float edgeIntensity;
uniform float flattenEnabled;
uniform float flattenSmoothing;
uniform float paletteCount;
uniform vec3 foreground;
uniform vec3 background;
uniform sampler2D paletteTex;
float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
vec3 linearRgb(vec3 c){
  return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(vec3(.04045),c));
}
vec3 oklab(vec3 color){
  vec3 c=linearRgb(color);
  vec3 lms=vec3(
    .4122214708*c.r+.5363325363*c.g+.0514459929*c.b,
    .2119034982*c.r+.6806995451*c.g+.1073969566*c.b,
    .0883024619*c.r+.2817188376*c.g+.6299787005*c.b
  );
  vec3 root=pow(max(lms,vec3(0.)),vec3(1./3.));
  return vec3(
    .2104542553*root.r+.793617785*root.g-.0040720468*root.b,
    1.9779984951*root.r-2.428592205*root.g+.4505937099*root.b,
    .0259040371*root.r+.782771766*root.g-.808675766*root.b
  );
}
vec3 bilateralColor(vec3 center,vec2 point,vec2 edgeStep){
  if(flattenSmoothing<.5) return center;
  vec3 centerLab=oklab(center);
  float sigmaSpatial=.8+flattenSmoothing*.12;
  float sigmaColor=.025+flattenSmoothing*.018;
  float total=1.;
  vec3 colorTotal=center;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
    if(x==0&&y==0) continue;
    vec2 delta=vec2(float(x),float(y));
    vec2 samplePoint=point+delta*edgeStep*(.5+flattenSmoothing*.12);
    vec3 sampleColor=texture(sourceTex,clamp(samplePoint,vec2(0.),vec2(1.))).rgb;
    vec3 colorDelta=oklab(sampleColor)-centerLab;
    float weight=exp(-dot(delta,delta)/(2.*sigmaSpatial*sigmaSpatial)
      -dot(colorDelta,colorDelta)/(2.*sigmaColor*sigmaColor));
    colorTotal+=sampleColor*weight;
    total+=weight;
  }
  return colorTotal/total;
}
vec3 flattenColor(vec3 color,vec2 point,vec2 edgeStep){
  vec3 smoothed=bilateralColor(color,point,edgeStep);
  vec3 lab=oklab(smoothed);
  vec3 nearest=texture(paletteTex,vec2(.5/64.,.5)).rgb;
  float minDistance=1.e6;
  for(int i=0;i<64;i++){
    if(float(i)>=paletteCount) break;
    vec3 candidate=texture(paletteTex,vec2((float(i)+.5)/64.,.5)).rgb;
    vec3 delta=lab-oklab(candidate);
    float distance=dot(delta,delta);
    if(distance<minDistance){
      minDistance=distance;
      nearest=candidate;
    }
  }
  return nearest;
}
float blurredLum(vec2 point){
  if(edgeSmoothing<.5) return lum(texture(sourceTex,clamp(point,vec2(0.),vec2(1.))).rgb);
  float spread=edgeSmoothing*.5;
  float sum=0.;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
    float weight=(x==0?2.:1.)*(y==0?2.:1.);
    vec2 offset=vec2(float(x),float(y))*spread/sourceSize;
    sum+=lum(texture(sourceTex,clamp(point+offset,vec2(0.),vec2(1.))).rgb)*weight;
  }
  return sum/16.;
}
float edgeMagnitude(vec2 point,vec2 edgeStep){
  float samples[9];
  int index=0;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
    samples[index]=blurredLum(point+vec2(float(x),float(y))*edgeStep);
    index++;
  }
  float gx=-samples[0]+samples[2]-2.*samples[3]+2.*samples[5]-samples[6]+samples[8];
  float gy=-samples[0]-2.*samples[1]-samples[2]+samples[6]+2.*samples[7]+samples[8];
  return min(1.,length(vec2(gx,gy))/5.65685425);
}
void main(){
  vec2 cell=floor(uv*gridSize);
  vec2 inCell=fract(uv*gridSize);
  vec2 sourceAspect=vec2(sourceSize.x/sourceSize.y,1.);
  vec2 frameAspect=vec2(gridSize.x*tileSize.x/(gridSize.y*tileSize.y),1.);
  vec2 scale=min(frameAspect/sourceAspect,vec2(1.));
  vec2 sampleUv=(cell+.5)/gridSize;
  sampleUv=(sampleUv-.5)/scale+.5;
  bool inside=all(greaterThanEqual(sampleUv,vec2(0.)))&&all(lessThanEqual(sampleUv,vec2(1.)));
  vec3 avg=background;
  if(inside){
    avg=vec3(0.);
    for(int y=0;y<3;y++) for(int x=0;x<3;x++){
      vec2 offset=(vec2(float(x),float(y))-1.)/gridSize/3.;
      avg+=texture(sourceTex,clamp(sampleUv+offset,vec2(0.),vec2(1.))).rgb/9.;
    }
  }
  vec2 sampleStep=1./gridSize/scale;
  if(inside&&flattenEnabled>.5&&paletteCount>0.) avg=flattenColor(avg,sampleUv,sampleStep);
  float luminance=lum(avg);
  if(inside&&edgeEnabled>.5){
    float edge=edgeMagnitude(sampleUv,1./gridSize/scale);
    edge=edge>=edgeThreshold ? edge : 0.;
    luminance=edgeMode<.5 ? 1.-edge : luminance*(1.-edge*edgeIntensity);
  }
  float value=clamp((luminance-.5)*contrast+.5+brightness,0.,1.);
  value=pow(value,1./max(gammaValue,.05));
  value=mix(value,1.-value,invertValue);

  float glyphIndex=bwMode>.5 ? (value<.5 ? glyphCount-1. : 0.) : floor((1.-value)*(glyphCount-1.)+.5);
  vec2 tilePixels=tileSize*atlasScale;
  vec2 atlasUv=vec2(
    (glyphIndex*tilePixels.x+.5+inCell.x*(tilePixels.x-1.))/(glyphCount*tilePixels.x),
    (.5+inCell.y*(tilePixels.y-1.))/tilePixels.y
  );
  float mask=texture(atlasTex,atlasUv).r;
  if(bwMode>.5) mask=step(.5,mask);
  vec3 ink=rgbMode>.5 ? avg : foreground;
  color=vec4(mix(background,ink,mask),1.);
}`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(shader) || 'Shader compilation failed');
  return shader;
}

export function createAsciiRenderer({ canvas, scene, onError = () => {}, onStats = () => {} }) {
  let gl = null;
  let webglError = null;
  try {
    gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) gl = canvas.getContext('webgl2');
  } catch (error) {
    webglError = error;
  }
  const fallbackContext = gl ? null : canvas.getContext('2d', { alpha: false });
  if (!gl && !fallbackContext) {
    throw new Error(
      `WebGL2 non disponibile e Canvas 2D non supportato.${webglError ? ` ${webglError.message}` : ''}`,
    );
  }
  let program = null;
  let vao = null;
  let buffer = null;
  let sourceTex = null;
  let atlasTex = null;
  let paletteTex = null;
  let locations = {};
  if (gl) {
    program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertex));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(program) || 'Program linking failed');
    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    sourceTex = gl.createTexture();
    atlasTex = gl.createTexture();
    paletteTex = gl.createTexture();
    locations = Object.fromEntries(
      [
        'sourceTex',
        'atlasTex',
        'sourceSize',
        'gridSize',
        'tileSize',
        'atlasScale',
        'glyphCount',
        'brightness',
        'contrast',
        'gammaValue',
        'invertValue',
        'rgbMode',
        'bwMode',
        'edgeEnabled',
        'edgeThreshold',
        'edgeSmoothing',
        'edgeMode',
        'edgeIntensity',
        'flattenEnabled',
        'flattenSmoothing',
        'paletteCount',
        'foreground',
        'background',
        'paletteTex',
      ].map((name) => [name, gl.getUniformLocation(program, name)]),
    );
  }
  let source = null;
  const cloneScene = (value) => JSON.parse(JSON.stringify(value));
  let currentScene = cloneScene(scene);
  currentScene.typography.fontFamily = fontFamilyFor(currentScene.typography.fontFamily);
  currentScene.edgeDetection ??= cloneScene(DEFAULT_SCENE.edgeDetection);
  currentScene.flattenColors ??= cloneScene(DEFAULT_SCENE.flattenColors);
  currentScene.rendering ??= cloneScene(DEFAULT_SCENE.rendering);
  currentScene.typography.lineHeight ??= 1.3;
  currentScene.appearance.fit = 'contain';
  currentScene.typography.lineHeight ??= 1.3;
  currentScene.appearance.fit = 'contain';
  let atlas = null;
  let disposed = false;
  let lastStats = '';
  let textCanvas = null;
  let paletteSamples = [];
  let palette = [];
  let palettePromise = null;
  let sourceGeneration = 0;
  const tile = { width: 1, height: 1 };
  let layout = null;
  let atlasScale = 1;
  const targetAtlasScale = Math.min((window.devicePixelRatio || 1) * 4, 8);
  const maxTextureSize = gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : 8192;
  const backend = gl ? 'WebGL2' : 'Canvas2D fallback';
  const color = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const setUniforms = (name, ...values) =>
    gl[values.length === 1 ? 'uniform1f' : values.length === 2 ? 'uniform2f' : 'uniform3f'](
      locations[name],
      ...values,
    );

  function rebuildPalette() {
    palette = buildColorPalette(
      paletteSamples,
      currentScene.flattenColors.colorCount,
      currentScene.flattenColors.smoothing,
    );
    if (!palette.length || !gl) return;
    const pixels = new Uint8Array(64 * 4);
    for (let index = 0; index < 64; index += 1) {
      const color = palette[Math.min(index, palette.length - 1)];
      pixels.set([...color, 255], index * 4);
    }
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, paletteTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 64, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  }

  function setPaletteSamples(samples) {
    paletteSamples = samples;
    rebuildPalette();
    renderFrame();
  }

  function updateLayout() {
    const width = source?.videoWidth || source?.naturalWidth || source?.width;
    const height = source?.videoHeight || source?.naturalHeight || source?.height;
    if (!width || !height) {
      layout = null;
      return;
    }
    layout = calculateContentLayout(
      width,
      height,
      tile.width,
      tile.height,
      currentScene.grid.maxCells ?? 40000,
    );
  }

  function makeAtlas() {
    const fontSize = currentScene.typography.fontSize;
    const fontFamily = fontFamilyFor(currentScene.typography.fontFamily);
    const chars = coverageOrder(
      currentScene.typography.charset,
      `"${fontFamily}"`,
      fontSize,
      currentScene.typography.fontWeight,
    );
    const font = `${currentScene.typography.fontWeight} ${fontSize}px "${fontFamily}"`;
    const measurementCanvas = document.createElement('canvas');
    const measurementContext = measurementCanvas.getContext('2d');
    measurementContext.font = font;
    const metrics = chars.map((char) => measurementContext.measureText(char));
    const advance = measurementContext.measureText('M').width;
    const ascent = Math.max(
      ...metrics.map((metric) => metric.actualBoundingBoxAscent || fontSize * 0.8),
    );
    const descent = Math.max(
      ...metrics.map((metric) => metric.actualBoundingBoxDescent || fontSize * 0.2),
    );
    tile.ascent = ascent;
    tile.descent = descent;
    tile.width = Math.max(1, Math.ceil(advance));
    tile.height = Math.max(
      Math.ceil(ascent + descent),
      Math.round(fontSize * currentScene.typography.lineHeight),
    );
    updateLayout();
    if (currentScene.rendering?.mode === 'vector' || !gl) {
      if (atlasTex && gl) gl.deleteTexture(atlasTex);
      atlasTex = null;
      atlas = { count: chars.length, chars };
      return;
    }
    if (!atlasTex) atlasTex = gl.createTexture();
    atlasScale = Math.max(
      1,
      Math.floor(
        Math.min(
          targetAtlasScale,
          maxTextureSize / (tile.width * chars.length),
          maxTextureSize / tile.height,
        ),
      ),
    );
    const image = document.createElement('canvas');
    image.width = tile.width * chars.length * atlasScale;
    image.height = tile.height * atlasScale;
    const ctx = image.getContext('2d', { willReadFrequently: true });
    ctx.scale(atlasScale, atlasScale);
    ctx.clearRect(0, 0, tile.width * chars.length, tile.height);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = font;
    const baseline = (tile.height + ascent - descent) / 2;
    chars.forEach((char, i) => ctx.fillText(char, i * tile.width + tile.width / 2, baseline));
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, atlasTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    atlas = { count: chars.length, chars };
  }

  function renderFrame() {
    if (currentScene.rendering?.mode === 'vector') {
      if (layout) {
        canvas.dataset.columns = String(layout.columns);
        canvas.dataset.rows = String(layout.rows);
        canvas.dataset.outputWidth = String(layout.outputWidth);
        canvas.dataset.outputHeight = String(layout.outputHeight);
      }
      return;
    }
    if (disposed || !source || (!source.videoWidth && !source.naturalWidth && !source.width))
      return;
    if (!layout) updateLayout();
    if (!layout) return;
    if (!gl) {
      const capture = captureText();
      renderAsciiPage(fallbackContext, capture, {
        columns: capture.columns,
        rows: capture.rows,
        cellWidth: capture.cellWidth,
        cellHeight: capture.cellHeight,
        width: capture.outputWidth,
        height: capture.outputHeight,
        font: {
          family: fontFamilyFor(currentScene.typography.fontFamily),
          size: capture.fontSize,
          weight: currentScene.typography.fontWeight,
          ascent: capture.ascent,
          descent: capture.descent,
          baseline: capture.baseline,
        },
        colors: {
          mode: currentScene.appearance.mode,
          ...getAppearanceColors(currentScene.appearance),
        },
        mode: 'bitmap',
      });
      canvas.dataset.columns = String(capture.columns);
      canvas.dataset.rows = String(capture.rows);
      canvas.dataset.outputWidth = String(capture.outputWidth);
      canvas.dataset.outputHeight = String(capture.outputHeight);
      canvas.dataset.cellWidth = String(capture.cellWidth);
      canvas.dataset.cellHeight = String(capture.cellHeight);
      canvas.dataset.sourceWidth = String(capture.sourceWidth);
      canvas.dataset.sourceHeight = String(capture.sourceHeight);
      canvas.dataset.renderWidth = String(capture.outputWidth);
      canvas.dataset.renderHeight = String(capture.outputHeight);
      if (lastStats !== `${capture.outputWidth}x${capture.outputHeight}`) {
        lastStats = `${capture.outputWidth}x${capture.outputHeight}`;
        onStats({
          columns: capture.columns,
          rows: capture.rows,
          outputWidth: capture.outputWidth,
          outputHeight: capture.outputHeight,
          renderWidth: capture.outputWidth,
          renderHeight: capture.outputHeight,
          renderScale: 1,
          cellWidth: capture.cellWidth,
          cellHeight: capture.cellHeight,
          backend,
        });
      }
      return;
    }
    const width = source.videoWidth || source.naturalWidth || source.width;
    const height = source.videoHeight || source.naturalHeight || source.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const renderScale = Math.max(1, Math.floor(dpr));
    canvas.width = Math.max(1, Math.round(layout.outputWidth * renderScale));
    canvas.height = Math.max(1, Math.round(layout.outputHeight * renderScale));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
    } catch (error) {
      onError(new Error(`Impossibile caricare il frame media in WebGL: ${error.message}`));
      return;
    }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, atlasTex);
    gl.uniform1i(locations.sourceTex, 0);
    gl.uniform1i(locations.atlasTex, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, paletteTex);
    gl.uniform1i(locations.paletteTex, 2);
    setUniforms('sourceSize', width, height);
    setUniforms('gridSize', layout.columns, layout.rows);
    setUniforms('tileSize', tile.width, tile.height);
    setUniforms('atlasScale', atlasScale);
    setUniforms('glyphCount', atlas.count);
    setUniforms('brightness', currentScene.appearance.brightness);
    setUniforms('contrast', currentScene.appearance.contrast);
    setUniforms('gammaValue', currentScene.appearance.gamma);
    setUniforms('invertValue', currentScene.appearance.invert ? 1 : 0);
    setUniforms('rgbMode', currentScene.appearance.mode === 'rgb' ? 1 : 0);
    setUniforms('bwMode', currentScene.appearance.mode === 'bw' ? 1 : 0);
    currentScene.edgeDetection ??= cloneScene(DEFAULT_SCENE.edgeDetection);
    currentScene.flattenColors ??= cloneScene(DEFAULT_SCENE.flattenColors);
    setUniforms('edgeEnabled', currentScene.edgeDetection.enabled ? 1 : 0);
    setUniforms('edgeThreshold', currentScene.edgeDetection.threshold / 255);
    setUniforms('edgeSmoothing', currentScene.edgeDetection.smoothing);
    setUniforms('edgeMode', currentScene.edgeDetection.mode === 'edges' ? 0 : 1);
    setUniforms('edgeIntensity', currentScene.edgeDetection.intensity);
    setUniforms('flattenEnabled', currentScene.flattenColors.enabled ? 1 : 0);
    setUniforms('flattenSmoothing', currentScene.flattenColors.smoothing);
    setUniforms('paletteCount', palette.length);

    const appearanceColors = getAppearanceColors(currentScene.appearance);
    setUniforms('foreground', ...color(currentScene.appearance.foreground));
    setUniforms('background', ...color(currentScene.appearance.background));
    setUniforms(
      'fitMode',
      currentScene.appearance.fit === 'cover'
        ? 1
        : currentScene.appearance.fit === 'stretch'
          ? 2
          : 0,
    );

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    canvas.dataset.columns = String(layout.columns);
    canvas.dataset.rows = String(layout.rows);
    canvas.dataset.outputWidth = String(layout.outputWidth);
    canvas.dataset.outputHeight = String(layout.outputHeight);
    canvas.dataset.cellWidth = String(layout.cellWidth);
    canvas.dataset.cellHeight = String(layout.cellHeight);
    canvas.dataset.sourceWidth = String(layout.sourceWidth);
    canvas.dataset.sourceHeight = String(layout.sourceHeight);
    canvas.dataset.renderWidth = String(canvas.width);
    canvas.dataset.renderHeight = String(canvas.height);
    canvas.dataset.renderScale = String(renderScale);
    canvas.dataset.atlasScale = String(atlasScale);
    canvas.dataset.paletteSize = String(palette.length);
    const statsKey = `${layout.columns}x${layout.rows}:${layout.outputWidth}x${layout.outputHeight}`;
    if (statsKey !== lastStats) {
      lastStats = statsKey;
      onStats({
        columns: layout.columns,
        rows: layout.rows,
        outputWidth: layout.outputWidth,
        outputHeight: layout.outputHeight,
        renderWidth: canvas.width,
        renderHeight: canvas.height,
        renderScale,
        cellWidth: tile.width,
        cellHeight: tile.height,
        backend,
      });
    }
  }

  function captureText() {
    if (disposed || !source || (!source.videoWidth && !source.naturalWidth && !source.width)) {
      throw new Error('Carica un’immagine o un video prima di generare il testo ASCII.');
    }
    if (!layout) updateLayout();
    if (!layout) throw new Error('Dimensioni della griglia non disponibili.');
    const grid = layout;
    const fontSize = currentScene.typography.fontSize;
    const width = grid.sourceWidth;
    const height = grid.sourceHeight;
    if (!textCanvas) textCanvas = document.createElement('canvas');
    const sampleScale =
      currentScene.edgeDetection?.enabled || currentScene.flattenColors?.enabled ? 2 : 1;
    const sampleWidth = grid.columns * sampleScale;
    const sampleHeight = grid.rows * sampleScale;
    textCanvas.width = sampleWidth;
    textCanvas.height = sampleHeight;
    const context = textCanvas.getContext('2d', { willReadFrequently: true });
    const scale = Math.min(sampleWidth / width, sampleHeight / height);
    const drawWidth = width * scale;
    const drawHeight = height * scale;
    context.drawImage(
      source,
      (sampleWidth - drawWidth) / 2,
      (sampleHeight - drawHeight) / 2,
      drawWidth,
      drawHeight,
    );
    const rawPixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
    const pixels = currentScene.flattenColors?.enabled
      ? flattenPixelData(
          { data: rawPixels, width: sampleWidth, height: sampleHeight },
          currentScene.flattenColors,
          palette,
        ).data
      : rawPixels;
    const edges = currentScene.edgeDetection?.enabled
      ? createEdgeMap(rawPixels, sampleWidth, sampleHeight, currentScene.edgeDetection, pixels)
      : null;
    const glyphs = atlas.chars;
    let text = '';
    const cellColors = currentScene.appearance.mode === 'rgb' ? [] : null;
    for (let y = 0; y < grid.rows; y += 1) {
      for (let x = 0; x < grid.columns; x += 1) {
        const sampleX = x * sampleScale + Math.floor(sampleScale / 2);
        const sampleY = y * sampleScale + Math.floor(sampleScale / 2);
        const offset = (sampleY * sampleWidth + sampleX) * 4;
        const alpha = pixels[offset + 3] / 255;
        if (cellColors) cellColors.push(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
        let luminance;
        if (edges) {
          luminance = 1;
          for (let dy = 0; dy < sampleScale; dy += 1) {
            for (let dx = 0; dx < sampleScale; dx += 1) {
              luminance = Math.min(
                luminance,
                edges[(y * sampleScale + dy) * sampleWidth + x * sampleScale + dx],
              );
            }
          }
        } else {
          luminance =
            (pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722) /
            255;
        }
        luminance = Math.max(
          0,
          Math.min(
            1,
            (luminance - 0.5) * currentScene.appearance.contrast +
              0.5 +
              currentScene.appearance.brightness,
          ),
        );
        luminance = Math.pow(luminance, 1 / Math.max(currentScene.appearance.gamma, 0.05));
        if (currentScene.appearance.invert) luminance = 1 - luminance;
        if (currentScene.appearance.mode === 'bw') luminance = luminance < 0.5 ? 0 : 1;
        const density = 1 - luminance;
        const glyphIndex = Math.round(density * (glyphs.length - 1));
        text += alpha < 0.05 ? ' ' : glyphs[glyphIndex];
      }
      if (y < grid.rows - 1) text += '\n';
    }
    const capture = {
      text,
      columns: grid.columns,
      rows: grid.rows,
      cellWidth: tile.width,
      cellHeight: tile.height,
      outputWidth: grid.outputWidth,
      outputHeight: grid.outputHeight,
      sourceWidth: grid.sourceWidth,
      sourceHeight: grid.sourceHeight,
      targetWidth: grid.targetWidth,
      targetHeight: grid.targetHeight,
      atlasScale,
      fontSize,
      ascent: tile.ascent,
      descent: tile.descent,
      baseline: (tile.height + tile.ascent - tile.descent) / 2,
      cellColors,
      palette: currentScene.flattenColors?.enabled ? paletteAsHex(palette) : [],
    };
    if (currentScene.rendering?.mode === 'vector') {
      const vector = vectorGlyphs(
        currentScene.typography.fontFamily,
        text,
        currentScene.typography.fontWeight,
      );
      capture.vectorGlyphs = vector.glyphs;
      capture.vectorFamily = vector.family;
      capture.unitsPerEm = vector.unitsPerEm;
      capture.vectorFontLicense = vector.fontLicense;
    }
    return capture;
  }

  makeAtlas();
  return {
    setSource(value) {
      source = value;
      sourceGeneration += 1;
      palettePromise = null;
      paletteSamples = [];
      palette = [];
      updateLayout();
      if (value?.naturalWidth) {
        try {
          setPaletteSamples([sampleSourceColors(value)]);
        } catch (error) {
          onError(error);
        }
      }
      renderFrame();
    },
    async prepareVideoPalette(video) {
      if (paletteSamples.length) return paletteAsHex(palette);
      if (palettePromise) return palettePromise;
      const generation = sourceGeneration;
      const pending = collectVideoColorSamples(video).then((samples) => {
        if (generation === sourceGeneration) setPaletteSamples(samples);
        return generation === sourceGeneration ? paletteAsHex(palette) : [];
      });
      palettePromise = pending;
      try {
        return await pending;
      } finally {
        if (palettePromise === pending) palettePromise = null;
      }
    },
    setScene(value) {
      validateScene(value);
      const before = JSON.stringify(currentScene.typography);
      const beforeFlatten = JSON.stringify(currentScene.flattenColors);
      const beforeRendering = currentScene.rendering?.mode;
      currentScene = cloneScene(value);
      currentScene.typography.fontFamily = fontFamilyFor(currentScene.typography.fontFamily);
      currentScene.edgeDetection ??= cloneScene(DEFAULT_SCENE.edgeDetection);
      currentScene.flattenColors ??= cloneScene(DEFAULT_SCENE.flattenColors);
      currentScene.rendering ??= cloneScene(DEFAULT_SCENE.rendering);
      if (
        before !== JSON.stringify(currentScene.typography) ||
        beforeRendering !== currentScene.rendering.mode
      )
        makeAtlas();
      if (beforeFlatten !== JSON.stringify(currentScene.flattenColors) && paletteSamples.length)
        rebuildPalette();
      renderFrame();
    },
    getPalette: () => paletteAsHex(palette),
    resize: renderFrame,
    renderFrame,
    captureText,
    getStats: () => ({
      columns: Number(canvas.dataset.columns) || 0,
      rows: Number(canvas.dataset.rows) || 0,
      backend,
    }),
    capturePng: () => {
      try {
        const capture = captureText();
        const output = document.createElement('canvas');
        renderAsciiPage(output.getContext('2d'), capture, {
          columns: capture.columns,
          rows: capture.rows,
          cellWidth: capture.cellWidth,
          cellHeight: capture.cellHeight,
          width: capture.outputWidth,
          height: capture.outputHeight,
          font: {
            family: capture.vectorFamily ?? fontFamilyFor(currentScene.typography.fontFamily),
            size: capture.fontSize,
            weight: currentScene.typography.fontWeight,
            ascent: capture.ascent,
            descent: capture.descent,
            baseline: capture.baseline,
          },
          colors: {
            mode: currentScene.appearance.mode,
            foreground: currentScene.appearance.foreground,
            background: currentScene.appearance.background,
          },
          mode: currentScene.rendering.mode,
          unitsPerEm: capture.unitsPerEm,
          glyphs: capture.vectorGlyphs,
        });
        return new Promise((resolve, reject) =>
          output.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error('Esportazione PNG non riuscita.'))),
            'image/png',
          ),
        );
      } catch (error) {
        return Promise.reject(error);
      }
    },
    dispose() {
      disposed = true;
      if (gl) {
        gl.deleteTexture(sourceTex);
        if (atlasTex) gl.deleteTexture(atlasTex);
        gl.deleteTexture(paletteTex);
        gl.deleteBuffer(buffer);
        gl.deleteVertexArray(vao);
        gl.deleteProgram(program);
      }
    },
  };
}
