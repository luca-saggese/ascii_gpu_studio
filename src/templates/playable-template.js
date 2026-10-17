import { serializeAsciiDocument } from '../ascii-document.js';
import { renderAsciiPage } from '../ascii-render.js';

function encodeBase64(bytes) {
  let value = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    value += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(value);
}

export async function createPlayableHtml(asciiDocument) {
  const payload = encodeBase64(await serializeAsciiDocument(asciiDocument));
  const drawPageSource = renderAsciiPage.toString();
  const markup = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ASCII GPU Studio — playable</title>
<style>
:root{color-scheme:dark;font-family:system-ui,-apple-system,sans-serif;background:#0c0f10;color:#e9eeec}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px}
main{width:min(100%,1440px);display:grid;gap:14px}.frame{min-height:40vh;max-height:82vh;display:grid;place-items:center;overflow:auto;border:1px solid #252d2d;border-radius:10px;background:#101715;padding:18px}
canvas{display:block;max-width:100%;max-height:78vh;object-fit:contain}.controls{display:flex;align-items:center;gap:12px;min-height:44px}
button,input{font:inherit;color:inherit}button{border:1px solid #303938;border-radius:6px;background:#181d1e;padding:8px 12px;cursor:pointer}button:hover{background:#232a29}
input[type=range]{accent-color:#9de5c4}.seek{flex:1;min-width:50px}.time{font:12px ui-monospace,monospace;white-space:nowrap}
label{display:flex;align-items:center;gap:6px;font-size:12px}.status{min-height:1.4em;color:#f0a49b;font-size:13px}
@media(max-width:600px){body{padding:12px}.controls{gap:7px;flex-wrap:wrap}.seek{order:2;flex-basis:100%}.frame{padding:8px}}
</style>
</head>
<body>
<main aria-label="ASCII video player">
  <div class="frame"><canvas aria-label="ASCII frame"></canvas></div>
  <div class="controls" hidden>
    <button id="play" type="button" aria-label="Play">Play</button>
    <span id="current" class="time">0:00</span>
    <input id="seek" class="seek" type="range" min="0" max="1" step="1" value="0" aria-label="Seek">
    <span id="duration" class="time">0:00</span>
    <label>Volume <input id="volume" type="range" min="0" max="1" step="0.05" value="1" aria-label="Volume"></label>
    <button id="mute" type="button" aria-label="Mute">Mute</button>
    <button id="fullscreen" type="button">Fullscreen</button>
  </div>
  <audio id="audio" preload="auto"></audio>
  <div class="status" role="status" aria-live="polite"></div>
</main>
<script id="payload" type="application/octet-stream">${payload}</script>
<script>
(async()=>{
const drawPage=${drawPageSource};
const canvas=document.querySelector('canvas');
const ctx=canvas.getContext('2d');
const controls=document.querySelector('.controls');
const audio=document.querySelector('#audio');
const seek=document.querySelector('#seek');
const status=document.querySelector('.status');
const clock=document.querySelector('#current');
const durationLabel=document.querySelector('#duration');
const playButton=document.querySelector('#play');
let model;
let elapsedMs=0;
let startedAt=0;
let running=false;
let raf=0;
let audioUrl='';
const formatTime=ms=>{const s=Math.floor(ms/1000);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')};
const pageAt=ms=>{
  let low=0,high=model.frames.length-1;
  while(low<high){const mid=Math.ceil((low+high)/2);if(model.frames[mid].timestampMs<=ms)low=mid;else high=mid-1}
  return model.frames[low];
};
const durationMs=model=>Math.max(...model.frames.map(f=>f.timestampMs+f.durationMs));
const total=()=>durationMs(model);
function draw(ms){const frame=pageAt(Math.min(ms,Math.max(0,total()-1)));drawPage(ctx,frame,model.render);clock.textContent=formatTime(ms);seek.value=String(Math.min(ms,total()))}
function timeNow(){return model.audio&&!audio.ended?Math.max(0,audio.currentTime*1000-model.audio.offsetMs):elapsedMs+performance.now()-startedAt}
function tick(){if(!running)return;elapsedMs=Math.min(total(),timeNow());draw(elapsedMs);if(elapsedMs>=total()){pause();return}raf=requestAnimationFrame(tick)}
function pause(){if(!running)return;elapsedMs=Math.min(total(),timeNow());running=false;cancelAnimationFrame(raf);audio.pause();playButton.textContent='Play';playButton.setAttribute('aria-label','Play');draw(elapsedMs)}
async function play(){if(running)return;if(elapsedMs>=total())elapsedMs=0;startedAt=performance.now();running=true;playButton.textContent='Pause';playButton.setAttribute('aria-label','Pause');if(model.audio){audio.currentTime=Math.max(0,(elapsedMs+model.audio.offsetMs)/1000);try{await audio.play()}catch(error){running=false;playButton.textContent='Play';playButton.setAttribute('aria-label','Play');status.textContent='Audio playback was blocked. Interact with the player and try again.';return}}raf=requestAnimationFrame(tick)}
playButton.addEventListener('click',()=>running?pause():play());
seek.addEventListener('input',()=>{elapsedMs=Number(seek.value);if(model.audio)audio.currentTime=Math.max(0,(elapsedMs+model.audio.offsetMs)/1000);else startedAt=performance.now();draw(elapsedMs)});
document.querySelector('#volume').addEventListener('input',event=>audio.volume=Number(event.target.value));
document.querySelector('#mute').addEventListener('click',event=>{audio.muted=!audio.muted;event.currentTarget.textContent=audio.muted?'Unmute':'Mute'});
document.querySelector('#fullscreen').addEventListener('click',()=>document.querySelector('main').requestFullscreen?.());
audio.addEventListener('ended',()=>{if(running){elapsedMs=Math.max(elapsedMs,audio.currentTime*1000-(model.audio?.offsetMs||0));startedAt=performance.now();if(elapsedMs>=total())pause()}});
try{
 const encoded=document.querySelector('#payload').textContent.trim();
 const compressed=Uint8Array.from(atob(encoded),character=>character.charCodeAt(0));
 const stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
 model=JSON.parse(new TextDecoder().decode(await new Response(stream).arrayBuffer()));
 if(model.format!=='ascii-gpu-studio'||model.version!==1||!Array.isArray(model.frames)||!model.frames.length)throw new Error('Unsupported ASCII document.');
 const totalMs=total();seek.max=String(totalMs);durationLabel.textContent=formatTime(totalMs);
 if(model.contentType==='video'){controls.hidden=false;if(model.audio){const raw=Uint8Array.from(atob(model.audio.dataBase64),c=>c.charCodeAt(0));audioUrl=URL.createObjectURL(new Blob([raw],{type:model.audio.mimeType}));audio.src=audioUrl}}
 draw(0);
 addEventListener('beforeunload',()=>{if(audioUrl)URL.revokeObjectURL(audioUrl)});
}catch(error){status.textContent='Unable to open this ASCII document: '+error.message}
})();
</script>
</body>
</html>`;
  return new Blob([markup], { type: 'text/html;charset=utf-8' });
}
