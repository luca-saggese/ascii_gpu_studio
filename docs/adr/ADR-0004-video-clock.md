# ADR-0004: Native video clock

Accepted. The HTML video element is the source clock and audio output. Frame updates use `requestVideoFrameCallback` when available, with a requestAnimationFrame fallback. Seeking triggers an immediate render; no audio analysis is used.
