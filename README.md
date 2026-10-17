<div align="center">

# ASCII GPU Studio

**Trasforma immagini e video in arte ASCII, direttamente nel browser.**

Uno studio locale-first con rendering WebGL2, anteprima testuale e audio video originale.

[Avvio rapido](#avvio-rapido) · [Funzionalità](#funzionalità) · [Verifiche](#verifiche) · [Stato del progetto](#stato-del-progetto)

</div>

<p align="center">
  <img src="docs/screenshots/studio-showcase.png" alt="ASCII GPU Studio con un'immagine convertita in arte ASCII e i controlli di tipografia e resa" width="100%">
</p>

## In breve

ASCII GPU Studio è un'applicazione web per esplorare e rifinire conversioni ASCII di immagini e video. I media vengono elaborati localmente: non sono caricati su un server. La preview GPU disegna glifi reali tramite WebGL2; in alternativa, una modalità testuale produce una griglia monospace che puoi selezionare e copiare.

## Funzionalità

- **Immagini e video locali** — apri un file o trascinalo nello Studio. I video vengono riprodotti con l'audio originale del browser, sincronizzato con i fotogrammi.
- **Rendering bitmap e vettoriale** — WebGL2 usa un atlante ad alta risoluzione (4×–8×); il toggle **Rendering vettoriale** usa contorni OpenType reali con cavità preservate. La geometria è condivisa tra preview, PNG e HTML offline.
- **Font riproducibili e offline** — IBM Plex Mono, Cousine e Lora sono inclusi nell'app con licenze SIL OFL 1.1; l'HTML vettoriale incorpora solo i tracciati dei glifi effettivamente usati.
- **Controlli di resa** — regola charset, griglia da 32 a 320 colonne, famiglia del font, modalità colore, contrasto, luminosità, inversione e adattamento dell'immagine. La dimensione dei caratteri è gestita automaticamente.
- **Edge Detection e Flatten Colors** — evidenzia contorni con Sobel e uniforma i colori tramite palette OKLab e smoothing bilaterale; nei video la palette è campionata globalmente per evitare variazioni tra i frame.
- **Parametri predefiniti** — salva localmente le impostazioni correnti e ripristinale nelle sessioni successive.
- **Anteprima ASCII testuale** — passa dalla preview GPU al testo monospace normale, pronto da selezionare e copiare.
- **Esportazione** — un menu unico offre `.ascii` gzip portabile, PNG per le immagini e HTML playable offline. Per i video propone MP4 e mostra un errore esplicito se il browser non supporta encoding deterministico.
- **Player Vue riutilizzabile** — nel repository trovi il componente e un esempio funzionante.

## Avvio rapido

Requisiti: **Node.js 22–24** e **pnpm 11.24.0**.

```sh
pnpm install
pnpm dev
```

Apri l'indirizzo locale mostrato da Vite, quindi importa un'immagine o un video. Regola la resa dal pannello laterale e scegli il formato dal menu **Export**.

## Verifiche

```sh
pnpm lint
pnpm test
pnpm build
pnpm format:check
```

I test end-to-end usano Playwright e Chromium:

```sh
pnpm exec playwright install chromium
pnpm test:e2e
```

La suite copre rendering WebGL2, densità dei glifi, contorni vettoriali e cavità, caratteri accentati/punteggiatura, anteprima testuale, `.ascii` gzip, PNG, HTML offline, player Vue e controlli video. Verifica anche pagine video a timestamp fissi e audio WebM incorporato. L'audio riprodotto dal browser resta soggetto alle sue policy e a quelle del dispositivo.

## Formato `.ascii`

Il nuovo `.ascii` è JSON UTF-8 compresso con gzip: contiene le pagine ASCII, le dimensioni e lo stile necessari a riprodurle, ma non il media originale. In modalità vettoriale include i tracciati condivisi dei soli caratteri usati, non immagini raster. Per i video conserva pagine con timestamp e, se disponibile, l'audio estratto. I vecchi progetti ZIP restano importabili. Vedi [specifica formato](docs/FILE_FORMAT.md).

## Stack

JavaScript ES Modules · Vue 3 · Vite · WebGL2 · Canvas 2D · Playwright

## Stato del progetto

Lo Studio è funzionante, ma non tutte le funzionalità previste sono state implementate. L'export MP4 deterministico è attualmente non disponibile: il Chromium verificato non espone WebCodecs e l'app non ripiega su una registrazione in tempo reale che può perdere frame. Restano inoltre da implementare cronologia undo/redo, selezione edge-aware, ripristino del contesto WebGL e una matrice E2E Firefox/WebKit. In modalità vettoriale il player HTML non dipende dai font installati; la modalità bitmap mantiene il comportamento precedente basato sui font disponibili localmente.

- [Stato e prossimi interventi](docs/STATUS.md)
- [Backlog](docs/TODO.md)
- [Delivery report: funzionalità verificate e limiti](docs/DELIVERY_REPORT.md)
- [Architettura](docs/ARCHITECTURE.md)
- [API del componente Vue](docs/API.md)

## Licenza

Distribuito con licenza [MIT](LICENSE).
