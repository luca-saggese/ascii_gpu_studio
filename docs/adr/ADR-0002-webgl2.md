# ADR-0002: WebGL2 single-pass renderer

Accepted. WebGL2 is the primary renderer. One fragment pass combines neighborhood sampling, luminance adjustment, glyph selection, and composition. It avoids CPU readback and the overhead of a separate preprocess pass. A missing WebGL2 context is reported explicitly; Canvas fallback is deferred.
