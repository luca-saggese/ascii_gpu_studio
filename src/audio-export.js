function checkAborted(signal) {
  if (signal?.aborted) throw new DOMException('Esportazione annullata.', 'AbortError');
}

export async function extractSourceAudio(file, { signal, duration, onProgress = () => {} } = {}) {
  checkAborted(signal);
  if (!file) throw new Error('Il file video originale non è disponibile per estrarre l’audio.');
  const api = await import('mediabunny');
  checkAborted(signal);
  const input = new api.Input({ formats: api.ALL_FORMATS, source: new api.BlobSource(file) });
  let output;
  try {
    const track = await input.getPrimaryAudioTrack();
    checkAborted(signal);
    if (!track) return null;
    const codec = await track.getCodec();
    const format = [new api.WebMOutputFormat(), new api.Mp4OutputFormat()].find((candidate) =>
      candidate.getSupportedAudioCodecs().includes(codec),
    );
    if (!format)
      throw new Error(`Il codec audio ${codec ?? 'sconosciuto'} non può essere incorporato.`);
    const decoderConfig = await track.getDecoderConfig();
    if (!decoderConfig) throw new Error('La configurazione della traccia audio non è valida.');
    const source = new api.EncodedAudioPacketSource(codec);
    const target = new api.BufferTarget();
    output = new api.Output({ format, target });
    output.addAudioTrack(source);
    checkAborted(signal);
    await output.start();
    let packetCount = 0;
    for await (const packet of new api.EncodedPacketSink(track).packets()) {
      checkAborted(signal);
      await source.add(packet, packetCount === 0 ? { decoderConfig } : undefined);
      packetCount += 1;
      if (packetCount % 64 === 0) {
        if (duration > 0) onProgress(Math.min(1, (packet.timestamp + packet.duration) / duration));
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    checkAborted(signal);
    if (!packetCount) throw new Error('La traccia audio non contiene campioni da esportare.');
    source.close();
    await output.finalize();
    checkAborted(signal);
    if (!target.buffer?.byteLength) throw new Error('Estrazione della traccia audio non riuscita.');
    onProgress(1);
    return new Blob([target.buffer], { type: format.mimeType.replace(/^video\//, 'audio/') });
  } finally {
    input.dispose();
    if (output && output.state !== 'finalized' && output.state !== 'canceled')
      await output.cancel();
  }
}
