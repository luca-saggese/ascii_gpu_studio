import { coverageOrder, DEFAULT_SCENE, gridForSource, validateScene } from './core.js';
import { createEdgeMap } from './edge-detection.js';

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
uniform float atlasScale;
uniform float glyphCount;
uniform float brightness;
uniform float contrast;
uniform float gammaValue;
uniform float invertValue;
uniform float rgbMode;
uniform float edgeEnabled;
uniform float edgeThreshold;
uniform float edgeSmoothing;
uniform float edgeMode;
uniform float edgeIntensity;
uniform vec3 foreground;
uniform vec3 background;
uniform float fitMode;
float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
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
  vec2 scale=fitMode<.5 ? min(frameAspect/sourceAspect,vec2(1.)) : max(frameAspect/sourceAspect,vec2(1.));
  vec2 sampleUv=(cell+.5)/gridSize;
  sampleUv=fitMode>1.5 ? sampleUv : (sampleUv-.5)/scale+.5;
  vec3 avg=vec3(0.);
  for(int y=0;y<3;y++) for(int x=0;x<3;x++){
    vec2 offset=(vec2(float(x),float(y))-1.)/gridSize/3.;
    avg+=texture(sourceTex,clamp(sampleUv+offset,vec2(0.),vec2(1.))).rgb/9.;
  }
  float luminance=lum(avg);
  if(edgeEnabled>.5){
    float edge=edgeMagnitude(sampleUv,1./gridSize/scale);
    edge=edge>=edgeThreshold ? edge : 0.;
    luminance=edgeMode<.5 ? 1.-edge : luminance*(1.-edge*edgeIntensity);
  }
  float value=clamp((luminance-.5)*contrast+.5+brightness,0.,1.);
  value=pow(value,1./max(gammaValue,.05));
  value=mix(value,1.-value,invertValue);
  float glyphIndex=floor((1.-value)*(glyphCount-1.)+.5);
  vec2 tilePixels=tileSize*atlasScale;
  vec2 atlasUv=vec2(
    (glyphIndex*tilePixels.x+.5+inCell.x*(tilePixels.x-1.))/(glyphCount*tilePixels.x),
    (.5+inCell.y*(tilePixels.y-1.))/tilePixels.y
  );
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
      'atlasScale',
      'glyphCount',
      'brightness',
      'contrast',
      'gammaValue',
      'invertValue',
      'rgbMode',
      'edgeEnabled',
      'edgeThreshold',
      'edgeSmoothing',
      'edgeMode',
      'edgeIntensity',
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
  let textCanvas = null;
  const tile = { width: 1, height: 1 };
  let atlasScale = 1;
  const fontSize = 20;
  const targetAtlasScale = Math.min((window.devicePixelRatio || 1) * 4, 8);
  const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
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
      fontSize,
      currentScene.typography.fontWeight,
    );
    const font = `${currentScene.typography.fontWeight} ${fontSize}px ${currentScene.typography.fontFamily}`;
    const measurementCanvas = document.createElement('canvas');
    const measurementContext = measurementCanvas.getContext('2d');
    measurementContext.font = font;
    const metrics = chars.map((char) => measurementContext.measureText(char));
    const maxAdvance = Math.max(...metrics.map((metric) => metric.width));
    const ascent = Math.max(
      ...metrics.map((metric) => metric.actualBoundingBoxAscent || fontSize * 0.8),
    );
    const descent = Math.max(
      ...metrics.map((metric) => metric.actualBoundingBoxDescent || fontSize * 0.2),
    );
    tile.ascent = ascent;
    tile.descent = descent;
    tile.width = Math.max(2, Math.ceil(maxAdvance) + 2);
    tile.height = Math.max(2, Math.ceil(ascent + descent) + 2);
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
    if (disposed || !source || (!source.videoWidth && !source.naturalWidth && !source.width))
      return;
    const width = source.videoWidth || source.naturalWidth || source.width;
    const height = source.videoHeight || source.naturalHeight || source.height;
    const grid = gridForSource(width, height, currentScene.grid.columns, tile.width / tile.height);
    grid.rows = Math.min(grid.rows, Math.floor(currentScene.grid.maxCells / grid.columns));
    const outWidth = Math.max(1, grid.columns * tile.width * atlasScale);
    const outHeight = Math.max(1, grid.rows * tile.height * atlasScale);
    const bounds = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const renderScale = Math.min(
      1,
      (Math.max(1, bounds.width) * dpr) / outWidth,
      (Math.max(1, bounds.height) * dpr) / outHeight,
    );
    canvas.width = Math.max(1, Math.round(outWidth * renderScale));
    canvas.height = Math.max(1, Math.round(outHeight * renderScale));
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
    setUniforms('atlasScale', atlasScale);
    setUniforms('glyphCount', atlas.count);
    setUniforms('brightness', currentScene.appearance.brightness);
    setUniforms('contrast', currentScene.appearance.contrast);
    setUniforms('gammaValue', currentScene.appearance.gamma);
    setUniforms('invertValue', currentScene.appearance.invert ? 1 : 0);
    setUniforms('rgbMode', currentScene.appearance.mode === 'rgb' ? 1 : 0);
    currentScene.edgeDetection ??= cloneScene(DEFAULT_SCENE.edgeDetection);
    setUniforms('edgeEnabled', currentScene.edgeDetection.enabled ? 1 : 0);
    setUniforms('edgeThreshold', currentScene.edgeDetection.threshold / 255);
    setUniforms('edgeSmoothing', currentScene.edgeDetection.smoothing);
    setUniforms('edgeMode', currentScene.edgeDetection.mode === 'edges' ? 0 : 1);
    setUniforms('edgeIntensity', currentScene.edgeDetection.intensity);
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
    canvas.dataset.outputWidth = String(outWidth);
    canvas.dataset.outputHeight = String(outHeight);
    canvas.dataset.renderWidth = String(canvas.width);
    canvas.dataset.renderHeight = String(canvas.height);
    canvas.dataset.renderScale = String(renderScale);
    canvas.dataset.atlasScale = String(atlasScale);
    const statsKey = `${grid.columns}x${grid.rows}:${outWidth}x${outHeight}`;
    if (statsKey !== lastStats) {
      lastStats = statsKey;
      onStats({
        columns: grid.columns,
        rows: grid.rows,
        outputWidth: outWidth,
        outputHeight: outHeight,
        renderWidth: canvas.width,
        renderHeight: canvas.height,
        renderScale,
        cellWidth: tile.width,
        cellHeight: tile.height,
        backend: 'WebGL2',
      });
    }
  }

  function captureText() {
    if (disposed || !source || (!source.videoWidth && !source.naturalWidth && !source.width)) {
      throw new Error('Carica un’immagine o un video prima di generare il testo ASCII.');
    }
    const width = source.videoWidth || source.naturalWidth || source.width;
    const height = source.videoHeight || source.naturalHeight || source.height;
    const grid = gridForSource(width, height, currentScene.grid.columns, tile.width / tile.height);
    grid.rows = Math.max(
      1,
      Math.min(grid.rows, Math.floor(currentScene.grid.maxCells / grid.columns)),
    );
    if (!textCanvas) textCanvas = document.createElement('canvas');
    const sampleScale = currentScene.edgeDetection?.enabled ? 2 : 1;
    const sampleWidth = grid.columns * sampleScale;
    const sampleHeight = grid.rows * sampleScale;
    textCanvas.width = sampleWidth;
    textCanvas.height = sampleHeight;
    const context = textCanvas.getContext('2d', { willReadFrequently: true });
    const fit = currentScene.appearance.fit;
    if (fit === 'stretch') {
      context.drawImage(source, 0, 0, sampleWidth, sampleHeight);
    } else {
      const scale =
        fit === 'cover'
          ? Math.max(sampleWidth / width, sampleHeight / height)
          : Math.min(sampleWidth / width, sampleHeight / height);
      const drawWidth = width * scale;
      const drawHeight = height * scale;
      context.drawImage(
        source,
        (sampleWidth - drawWidth) / 2,
        (sampleHeight - drawHeight) / 2,
        drawWidth,
        drawHeight,
      );
    }
    const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
    const edges =
      sampleScale > 1
        ? createEdgeMap(pixels, sampleWidth, sampleHeight, currentScene.edgeDetection)
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
        let luminance = edges
          ? Math.min(
              ...Array.from({ length: sampleScale * sampleScale }, (_, index) => {
                const px = x * sampleScale + (index % sampleScale);
                const py = y * sampleScale + Math.floor(index / sampleScale);
                return edges[py * sampleWidth + px];
              }),
            )
          : (pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722) /
            255;
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
        const density = 1 - luminance;
        const glyphIndex = Math.round(density * (glyphs.length - 1));
        text += alpha < 0.05 ? ' ' : glyphs[glyphIndex];
      }
      if (y < grid.rows - 1) text += '\n';
    }
    return {
      text,
      columns: grid.columns,
      rows: grid.rows,
      cellWidth: tile.width,
      cellHeight: tile.height,
      atlasScale,
      fontSize,
      ascent: tile.ascent,
      descent: tile.descent,
      cellColors,
    };
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
      currentScene.edgeDetection ??= cloneScene(DEFAULT_SCENE.edgeDetection);
      if (before !== JSON.stringify(currentScene.typography)) makeAtlas();
      renderFrame();
    },
    resize: renderFrame,
    renderFrame,
    captureText,
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
