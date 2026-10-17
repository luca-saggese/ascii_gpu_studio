export function assertDeterministicMp4Support() {
  if (typeof VideoEncoder === 'undefined' || typeof AudioEncoder === 'undefined') {
    throw new Error(
      'Export MP4 non supportato: questo browser non espone WebCodecs per codificare tutti i frame sulla timeline. MediaRecorder registrerebbe in tempo reale e potrebbe perdere frame, quindi non viene generato un MP4 incompleto.',
    );
  }
  throw new Error(
    'Export MP4 non supportato: manca un muxer MP4 verificato per combinare i frame deterministici e l’audio.',
  );
}
