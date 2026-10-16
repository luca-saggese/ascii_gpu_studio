# ASCII GPU Studio

Studio locale-first per trasformare immagini e video in arte ASCII. Elaborazione media nel browser, anteprima accelerata da WebGL2.

## Avvio

Richiede Node.js 22–24 e pnpm 11.24.0.

```sh
pnpm install
pnpm dev
```

Importa un'immagine o un video dal pulsante **Apri** o trascinandolo nell'area di anteprima. Scegli charset, griglia, colore e regolazioni; esporta un progetto `.ascii` o un PNG.

Nella toolbar dell'anteprima puoi passare da **GPU** a **ASCII text** per confrontare la resa WebGL con una griglia di testo monospace normale. La modalità WebGL usa l'atlante del font rasterizzato fino a 2× la densità pixel del display; la barra di stato distingue celle ASCII e pixel effettivi del framebuffer.

## Stato

Le funzionalità attive e le limitazioni verificate sono descritte in [docs/STATUS.md](docs/STATUS.md). Le immagini sono convertite direttamente in WebGL2; il video usa l'elemento media del browser, mantenendo il suo audio nativo durante la riproduzione. Supporto codec e autoplay dipendono dal browser.

Consulta il [Delivery Report](docs/DELIVERY_REPORT.md) per funzionalità verificate e limiti noti.

## Verifiche

```sh
pnpm lint
pnpm test
pnpm build
```

`pnpm test:e2e` usa Playwright; installa Chromium una volta con `pnpm exec playwright install chromium`. I file locali non vengono caricati su un server. Il formato `.ascii` è un archivio ZIP con manifest versionato, media originale e miniatura.

## Licenza

MIT, vedere [LICENSE](LICENSE). Nessun codice o asset di terze parti è incorporato nel rendering.
