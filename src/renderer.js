import { coverageOrder, gridForSource, validateScene } from './core.js';

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
uniform vec2 outputSize;
uniform vec2 gridSize;
uniform vec2 tileSize;
uniform float glyphCount;
uniform float brightness;
uniform float contrast;
uniform float gammaValue;
uniform float invertValue;
uniform float rgbMode;
uniform vec3 foreground;
uniform vec3 background;
uniform float fitMode;
float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
void main(){
  vec2 cell=floor(uv*gridSize);
  vec2 inCell=fract(uv*gridSize);
  vec2 sourceAspect=vec2(sourceSize.x/sourceSize.y,1.);
  vec2 frameAspect=vec2(gridSize.x*tileSize.x/(gridSize.y*tileSize.y),1.);
  vec2 scale=fitMode<.5 ? min(frameAspect/sourceAspect,vec2(1.)) : max(frameAspect/sourceAspect,vec2(1.));
  vec2 sampleUv=(cell+.5)/gridSize;
  sampleUv=fitMode>1.5 ? sampleUv : (sampleUv-.5)/scale+.5;
  vec3 avg=vec3(0.);
  for(int y=0;y<3;y++) for(int x=0;x<3;x++){
    vec2 offset=(vec2(float(x),float(y))-1.)/gridSize/3.;
    avg+=texture(sourceTex,clamp(sampleUv+offset,vec2(0.),vec2(1.))).rgb/9.;
  }
  float value=clamp((lum(avg)-.5)*contrast+.5+brightness,0.,1.);
  value=pow(value,1./max(gammaValue,.05));
  value=mix(value,1.-value,invertValue);
  float glyphIndex=floor(value*(glyphCount-1.)+.5);
  vec2 atlasUv=vec2((glyphIndex+inCell.x)/glyphCount, 1.-inCell.y);
  float mask=texture(atlasTex,atlasUv).r;
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
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    preserveDrawingBuffer: true,
  });
  if (!gl) throw new Error('WebGL2 non disponibile in questo browser.');
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertex));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(program) || 'Program linking failed');
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );
  const position = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const sourceTex = gl.createTexture();
  const atlasTex = gl.createTexture();
  const locations = Object.fromEntries(
    [
      'sourceTex',
      'atlasTex',
      'sourceSize',
      'outputSize',
      'gridSize',
      'tileSize',
      'glyphCount',
      'brightness',
      'contrast',
      'gammaValue',
      'invertValue',
      'rgbMode',
      'foreground',
      'background',
      'fitMode',
    ].map((name) => [name, gl.getUniformLocation(program, name)]),
  );
  let source = null;
  const cloneScene = (value) => JSON.parse(JSON.stringify(value));
  let currentScene = cloneScene(scene);
  let atlas = null;
  let disposed = false;
  let lastStats = '';
  const tile = { width: 1, height: 1 };
  const color = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const setUniforms = (name, ...values) =>
    gl[values.length === 1 ? 'uniform1f' : values.length === 2 ? 'uniform2f' : 'uniform3f'](
      locations[name],
      ...values,
    );

  function makeAtlas() {
    const chars = coverageOrder(
      currentScene.typography.charset,
      currentScene.typography.fontFamily,
      currentScene.typography.fontSize,
      currentScene.typography.fontWeight,
    );
    const font = `${currentScene.typography.fontWeight} ${currentScene.typography.fontSize}px ${currentScene.typography.fontFamily}`;
    const measurementCanvas = document.createElement('canvas');
    const measurementContext = measurementCanvas.getContext('2d');
    measurementContext.font = font;
    const metrics = chars.map((char) => measurementContext.measureText(char));
    const maxAdvance = Math.max(...metrics.map((metric) => metric.width));
    const ascent = Math.max(
      ...metrics.map(
        (metric) => metric.actualBoundingBoxAscent || currentScene.typography.fontSize * 0.8,
      ),
    );
    const descent = Math.max(
      ...metrics.map(
        (metric) => metric.actualBoundingBoxDescent || currentScene.typography.fontSize * 0.2,
      ),
    );
    tile.width = Math.max(2, Math.ceil(maxAdvance) + 2);
    tile.height = Math.max(2, Math.ceil(ascent + descent) + 2);
    const image = document.createElement('canvas');
    image.width = tile.width * chars.length;
    image.height = tile.height;
    const ctx = image.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, image.width, image.height);
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
    if (disposed || !source || (!source.videoWidth && !source.naturalWidth && !source.width))
      return;
    const width = source.videoWidth || source.naturalWidth || source.width;
    const height = source.videoHeight || source.naturalHeight || source.height;
    const grid = gridForSource(width, height, currentScene.grid.columns, tile.width / tile.height);
    grid.rows = Math.min(grid.rows, Math.floor(currentScene.grid.maxCells / grid.columns));
    const outWidth = Math.max(1, grid.columns * tile.width);
    const outHeight = Math.max(1, grid.rows * tile.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const bounds = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.min(outWidth, Math.floor(bounds.width * dpr)));
    canvas.height = Math.max(1, Math.min(outHeight, Math.floor(bounds.height * dpr)));
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
    setUniforms('sourceSize', width, height);
    setUniforms('outputSize', canvas.width, canvas.height);
    setUniforms('gridSize', grid.columns, grid.rows);
    setUniforms('tileSize', tile.width, tile.height);
    setUniforms('glyphCount', atlas.count);
    setUniforms('brightness', currentScene.appearance.brightness);
    setUniforms('contrast', currentScene.appearance.contrast);
    setUniforms('gammaValue', currentScene.appearance.gamma);
    setUniforms('invertValue', currentScene.appearance.invert ? 1 : 0);
    setUniforms('rgbMode', currentScene.appearance.mode === 'rgb' ? 1 : 0);
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
    canvas.dataset.columns = String(grid.columns);
    canvas.dataset.rows = String(grid.rows);
    const statsKey = `${grid.columns}x${grid.rows}`;
    if (statsKey !== lastStats) {
      lastStats = statsKey;
      onStats({ columns: grid.columns, rows: grid.rows, backend: 'WebGL2' });
    }
  }

  makeAtlas();
  return {
    setSource(value) {
      source = value;
      renderFrame();
    },
    setScene(value) {
      validateScene(value);
      const before = JSON.stringify(currentScene.typography);
      currentScene = cloneScene(value);
      if (before !== JSON.stringify(currentScene.typography)) makeAtlas();
      renderFrame();
    },
    resize: renderFrame,
    renderFrame,
    getStats: () => ({
      columns: Number(canvas.dataset.columns) || 0,
      rows: Number(canvas.dataset.rows) || 0,
      backend: 'WebGL2',
    }),
    capturePng: () =>
      new Promise((resolve, reject) =>
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('Esportazione PNG non riuscita.'))),
          'image/png',
        ),
      ),
    dispose() {
      disposed = true;
      gl.deleteTexture(sourceTex);
      gl.deleteTexture(atlasTex);
      gl.deleteBuffer(buffer);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
    },
  };
}
