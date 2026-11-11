# Animazioni: i comandi

## Comandi

Da `animazioni/` (o con `bun run --cwd animazioni …` dalla radice del repo).

| comando | cosa fa |
|---|---|
| `bun install` | le dipendenze |
| `bun run dev` | sfoglia le scene nel browser, per video: `?animazione=<sigla>`, spazio avvia e ferma, ← → di mezzo secondo, Inizio e Fine |
| `bun run build` | typecheck e pagina costruita in `dist/` |
| `bun run registra -- --tempi <tempi.json> --uscita <cartella>` | una `<sigla>.mp4` per ogni scena del file di tempi, nella cartella |
| `bun run registra -- [--uscita <cartella>] [sigla …]` | le scene date (senza sigle: tutte) coi loro tempi propri; senza `--uscita`, in `video/` |
| `bun run foto -- [sigla …]` | i fotogrammi chiave in `foto/<sigla>-<t>s.png`, più `<sigla>-riquadri.png` con dove entrano testa e sottotitoli |
| `bun run mappa -- <slug> […]` | `mappe/mappa-<slug>.png`: la mappa da tenere davanti mentre si registra |
| `bun run elenco` | su stdout, `{ "<slug>": [{ "sigla", "titolo", "durata" }] }`: lo legge il server per `/api/animazioni` |
| `bun test` | le prove: ancore, registro delle scene, impronta, scene del creator |

`registra` stampa una riga per scena ed esce con 1 e una frase nella lingua del lavoro (`MANGO_ANIMATION_LINGUA`, italiano senza) se una scena non esiste, un file di
tempi è sbagliato, il montaggio chiede una scena in un formato diverso da quello del suo video, o la pagina dà errore. Costruisce da sé la pagina se un sorgente è più nuovo di `dist/`, una volta sola anche con più processi insieme (blocco `dist.lock`, costruzione in `dist.nuova/` e scambio). Rende più scene insieme, una ogni `parallelismo.processori_per_lavoro` processori dello stile (4 di serie), ognuna nella sua pagina e col suo ffmpeg. Il browser disegna sulla scheda video (Direct3D), dieci volte più in fretta che sul processore: quella di `macchina.scheda_video` del profilo del creator (l'indice di `nvidia-smi`; `docs/ARCHITETTURA.md`, «Il profilo»), senza profilo la prima scheda NVIDIA che c'è, e la riga `animazioni: disegno su …` (`animations: drawing on …` in inglese) dice quale. Con `scheda_video: null`, o senza schede NVIDIA, disegna sul processore e lo dice. `ANIMAZIONI_SCHEDA=<un pezzo del nome>` nell'ambiente (`registra`, `foto`; ad esempio `1660`) ne sceglie un'altra per quella volta, oppure `ANIMAZIONI_SCHEDA=processore` (o `ANIMAZIONI_PROCESSORE=1`). Se la scheda voluta non si trova, la resa si ferma: non ripiega su un'altra. Se sta già lavorando, lo avvisa e va avanti.

**Non rifà una scena già resa**: accanto a `<sigla>.mp4` scrive `<sigla>.mp4.impronta`, un hash dei tempi che il
montaggio le ha dato e dei sorgenti da cui viene: il file della scena (`<sigla>.tsx` nella cartella del suo video, se
c'è; altrimenti `scene.tsx`) con tutto ciò che importa a catena, la pagina comune (`src/` fuori da `scene/`; per una scena del creator anche i file del prodotto che importa con `@animazioni/…`),
lo stile unito (solo le parti che la pagina legge, `PARTI_DELLO_STILE` in `script/impronta.ts`: formati, colori, caratteri, titolo, telefono e i quadri che un sorgente nomina, senza i loro sottotitoli; cambiare la voce, l'uscita, la sagoma, i sottotitoli o un quadro che nessuna scena nomina, nel file del prodotto come in quello del creator, non rifà nessuna scena) e gli script di resa. Stessi tempi e stessi sorgenti, il file resta; cambia una cosa, si rifà: un file di
un'altra scena, anche dello stesso video, non conta. Se un file della scena usa `import()` o `import.meta.glob`, o
importa qualcosa che non si trova, l'impronta copre l'intera cartella del video e `registra` lo scrive. Se tutte le
scene sono già rese, `registra` non costruisce la pagina né apre il browser; l'ultima riga è
`animazioni: rese N, già rese M` (`animations: rendered N, already rendered M` in inglese). Una scena che vive in `scene.tsx` insieme ad altre si rifà quando cambia una di
loro: per rifarsi da sola ha il suo file `<sigla>.tsx`.

**`foto` esce con 1** se, in un fotogramma chiave, un testo è sotto i 40 px, un testo o un disegno esce dalla
fascia della scena, un testo esce dal suo riquadro html (su un testo svg la misura non vale), o **lo sfondo resta fermo**: due fotogrammi a un secondo di
distanza identici, prima dell'ultimo secondo (la segnalazione dice sigla e istanti; non per una scena trasparente). In un video orizzontale la fascia
è tutto il fotogramma e la foto coi riquadri non si fa.
