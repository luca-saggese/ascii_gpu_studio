# `.ascii` format v1

An `.ascii` file is a ZIP archive containing `manifest.json`, exactly one media entry under `media/`, and a generated preview at `preview/thumbnail.png`. It stores the source media rather than lossy rendered frames; reopening reconstructs the scene and rerenders locally.

The manifest uses `format: "ascii-gpu-asset"`, `formatVersion: 1`, a `media` object (`kind`, relative `path`, `mime`, `preserveAudio`), and the serializable Studio `scene`. Paths must be relative, slash-separated, and contain no `..` segment. Unknown format versions are rejected. Media suffixes accepted on export are PNG/JPEG/WebP/AVIF/MP4/WebM.

Import limits: 32 entries, 110 MiB compressed, 200 MiB expanded. The importer streams entries and aborts once the expanded-size or entry limit is reached. It rejects traversal and malformed manifests.
