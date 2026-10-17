import { renderAsciiPage } from './ascii-render.js';

const VIDEO_BITRATE = 4_000_000;
const AUDIO_BITRATE = 128_000;
const FRAME_RATE = 10;
const AUDIO_SAMPLE_RATE = 48_000;

function abortError() {
  return new DOMException('Esportazione annullata.', 'AbortError');
}

function checkAborted(signal) {
  if (signal?.aborted) throw abortError();
}

export async function assertDeterministicMp4Support(width, height) {
  if (typeof VideoEncoder === 'undefined') {
    throw new Error(
      'Export MP4 non supportato: il browser non espone WebCodecs VideoEncoder per codificare i frame deterministici.',
    );
  }
  const { canEncodeVideo } = await import('mediabunny');
  if (
    !(await canEncodeVideo('avc', { width, height, frameRate: FRAME_RATE, bitrate: VIDEO_BITRATE }))
  ) {
    throw new Error(
      'Export MP4 non disponibile: questo browser o dispositivo non può codificare H.264 alla risoluzione selezionata.',
    );
  }
  return import('mediabunny');
}

async function addAudioTrack(model, output, api, sourceFile) {
  if (!sourceFile && !model.audio) return null;
  const inputSource = sourceFile
    ? new api.BlobSource(sourceFile)
    : new api.BlobSource(
        new Blob(
          [Uint8Array.from(atob(model.audio.dataBase64), (character) => character.charCodeAt(0))],
          { type: model.audio.mimeType },
        ),
      );
  const input = new api.Input({
    formats: api.ALL_FORMATS,
    source: inputSource,
  });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) {
      input.dispose();
      if (sourceFile) return null;
      throw new Error('La traccia audio inclusa nel documento non è presente o non è valida.');
    }
    if (!track || !(await track.canDecode()))
      throw new Error('La traccia audio acquisita non può essere decodificata per l’export MP4.');
    if (
      typeof AudioEncoder === 'undefined' ||
      !(await api.canEncodeAudio('aac', {
        numberOfChannels: 2,
        sampleRate: AUDIO_SAMPLE_RATE,
        bitrate: AUDIO_BITRATE,
      }))
    ) {
      throw new Error(
        'Export MP4 non disponibile: questo browser o dispositivo non può codificare l’audio AAC richiesto da MP4.',
      );
    }
    const source = new api.AudioSampleSource({
      codec: 'aac',
      bitrate: AUDIO_BITRATE,
    });
    output.addAudioTrack(source);
    return { input, source, track, offsetMs: model.audio?.offsetMs ?? 0 };
  } catch (error) {
    input.dispose();
    throw error;
  }
}

export async function encodeAsciiMp4(
  model,
  { signal, onProgress = () => {}, sourceFile = null } = {},
) {
  if (model.contentType !== 'video' || !model.frames.length)
    throw new Error('L’esportazione MP4 richiede un documento ASCII video.');
  checkAborted(signal);
  const width = model.render.width + (model.render.width % 2);
  const height = model.render.height + (model.render.height % 2);
  const api = await assertDeterministicMp4Support(width, height);
  checkAborted(signal);

  const output = new api.Output({
    format: new api.Mp4OutputFormat(),
    target: new api.BufferTarget(),
  });
  const target = output.target;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D non disponibile per generare i frame MP4.');
  const render = { ...model.render, width, height };
  const videoSource = new api.CanvasSource(canvas, {
    codec: 'avc',
    bitrate: VIDEO_BITRATE,
    latencyMode: 'quality',
  });
  output.addVideoTrack(videoSource, { frameRate: FRAME_RATE });
  let audioTrack = null;
  try {
    audioTrack = await addAudioTrack(model, output, api, sourceFile);
    checkAborted(signal);
    await output.start();

    const frames = model.frames;
    for (let index = 0; index < frames.length; index += 1) {
      checkAborted(signal);
      const frame = frames[index];
      renderAsciiPage(context, frame, render);
      await videoSource.add(frame.timestampMs / 1000, frame.durationMs / 1000);
      onProgress(((index + 1) / frames.length) * (audioTrack ? 0.75 : 0.92));
    }

    if (audioTrack) {
      const sink = new api.AudioSampleSink(audioTrack.track);
      const endTime = (frames.at(-1).timestampMs + frames.at(-1).durationMs) / 1000;
      let audioSampleCount = 0;
      for await (const sample of sink.samples(0, endTime)) {
        checkAborted(signal);
        const startFrame = Math.max(0, Math.ceil(-sample.timestamp * sample.sampleRate));
        const endFrame = Math.min(
          sample.numberOfFrames,
          Math.floor((endTime - sample.timestamp) * sample.sampleRate),
        );
        const sampleProgress = (sample.timestamp + sample.duration) / endTime;
        try {
          if (endFrame <= startFrame) continue;
          const clipped = sample.trim(startFrame, endFrame);
          clipped.setTimestamp(
            Math.max(0, sample.timestamp + startFrame / sample.sampleRate) +
              audioTrack.offsetMs / 1000,
          );
          try {
            await audioTrack.source.add(clipped);
          } finally {
            clipped.close();
          }
        } finally {
          sample.close();
        }
        audioSampleCount += 1;
        if (audioSampleCount % 8 === 0) onProgress(0.75 + Math.min(0.2, sampleProgress * 0.2));
      }
      if (audioSampleCount === 0)
        throw new Error('Non è stato possibile decodificare campioni dalla traccia audio.');
    }
    checkAborted(signal);
    await output.finalize();
    onProgress(1);
    if (!target.buffer) throw new Error('Il muxer non ha prodotto il file MP4.');
    return new Blob([target.buffer], { type: 'video/mp4' });
  } catch (error) {
    if (output.state === 'started' || output.state === 'finalizing') await output.cancel();
    throw error;
  } finally {
    audioTrack?.input.dispose();
    if (output.state === 'pending' || output.state === 'started') await output.cancel();
  }
}
