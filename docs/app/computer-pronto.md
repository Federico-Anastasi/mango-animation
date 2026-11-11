# Il computer pronto

Parte di `docs/APP.md`.

Al primo avvio (e a ogni avvio in cui manca qualcosa) l'app vede cosa c'è nel computer e scarica, con avanzamento e verifica, ciò che le funzioni accese richiedono
(`docs/MOTORI.md`). Lo fa solo quando il server lo accende lei, dopo il passo di Claude Code; se non manca niente non mostra niente. Il codice sta in `app/src/computer/`.

- **Cosa legge** (`hw.rs`, in Rust, senza accendere Python): le schede NVIDIA con memoria, memoria libera e capacità di calcolo (`nvidia-smi`), il processore e i suoi thread, la RAM, lo spazio
  libero sul disco dove scarica (`%LOCALAPPDATA%\dev.mango.animation\computer\`). Le funzioni accese sono `motori.<funzione>.attiva` del profilo (`docs/MOTORI.md`, §4; una funzione che il profilo
  non nomina è accesa): trascrizione, allineamento, sagoma, segui, pulizia_voce, dettatura. I modelli di Whisper li dice il profilo (`motori.trascrizione.modello`), poi lo stile del creator, poi quello di serie
  (`preparati.modello_trascrizione`, `dettatura.dispositivi.cuda|cpu.modello`).
- **Cosa può scaricare** (`manifesto.json`, con la fonte, la licenza, la dimensione e l'impronta SHA-256 di ogni file; i modelli sono a una revisione precisa):

  | cosa | quando | peso | dove va |
  |---|---|---|---|
  | Bun | sempre, se non c'è nel PATH | 40 MB | `computer\bin\` |
  | ffmpeg (build intera, 7.1.1) | sempre, se `ffmpeg` e `ffprobe` non sono nel PATH | 72 MB | `computer\ffmpeg\` |
  | `uv`, poi Python 3.12 e i pacchetti | se nessun Python (la variabile, quello dell'app, quello nel PATH) importa i moduli delle funzioni accese | uv 15 MB; Python e pacchetti da 0,3 a 5 GB (stima) | `computer\ambiente\` (il venv), `computer\python\` |
  | `bun install` in `server/` e `animazioni/` | se non hanno `node_modules`, o se il loro `bun.lock` o `package.json` non sono più quelli con cui sono stati installati | 120 e 150 MB (stima; con la cache di Bun un aggiornamento costa molto meno) | nel codice |
  | Chromium (`bun x playwright install chromium`) | se Playwright non ne ha uno; dopo `bun install` in `animazioni/`, se ce n'è già uno, si rilancia per prendere la revisione che il lockfile vuole | 710 MB (stima) | dove lo tiene Playwright |
  | Whisper (large-v3, large-v3-turbo o small) | trascrizione e dettatura: il modello che chiedono | 3,1 GB (large-v3), 1,6 GB (large-v3-turbo) o 0,5 GB (small) | cache di Hugging Face, `models--<org>--<nome>/snapshots/<revisione>/` e `refs/main` |
  | MMS (allineamento delle parole, CC-BY-NC) | allineamento | 1,3 GB | `~/.cache/torch/hub/checkpoints/` |
  | SAM 2.1, ViTMatte, RT-DETR | sagoma | 324, 103 e 81 MB | cache di Hugging Face |
  | YuNet | segui | 0,2 MB | cache di Hugging Face |
  | DeepFilterNet3 | pulizia_voce | 27 MB | `~/.cache/mango-animation/modelli/` |

  I modelli **non si distribuiscono con l'app**: si scaricano dalla loro fonte, con la licenza di ciascuno accanto nella pagina (le funzioni che li usano: `docs/MOTORI.md`). Un modello già nella cache di Hugging Face, di qualunque revisione, non si riscarica.
  I pacchetti Python sono quelli di `piano.rs` (versioni fissate, non impronte: l'integrità dei pacchetti dipende da PyPI e dal TLS, a differenza degli altri file, che si verificano per SHA-256); PyTorch viene dall'indice CUDA 12.4 se c'è una scheda NVIDIA con capacità di calcolo da 5.0, dall'indice del
  processore altrimenti. Con quella scheda e senza PyTorch (allineamento e sagoma spente) si aggiunge `nvidia-cublas-cu12` (circa 380 MB), che porta la cublas di CUDA 12 per trascrizione e dettatura. Python lo prepara `uv` (`uv python install --no-bin`, `uv venv`, `uv pip install`): non tocca il Python del computer né `~/.local/bin`.
  Mentre scarica `uv` scrive righe solo a inizio e fine: la barra di «Python e i suoi pacchetti» è quanto sono cresciute, dall'inizio, `computer\uv-cache\` e `computer\python\` rispetto al peso stimato (si guarda ogni
  secondo, `installa.rs`). Non torna indietro e non arriva in fondo prima che `uv` finisca; con la cache già piena (un'installazione ripresa) resta bassa e si completa alla fine.
- **Pacchetti e versioni dopo un aggiornamento.** I moduli presenti non dicono la versione, e `node_modules` non dice da quale lockfile viene: a installazione finita l'app scrive cosa ha messo, e a ogni avvio confronta.
  Per i pacchetti JS è l'impronta (SHA-256) di `package.json`, `bun.lock` e `bun.lockb` com'erano a `bun install` finito, in `node_modules/.mango-impronta` (tolto `node_modules`, sparisce anche lei); cambia il lockfile, o manca
  l'impronta, e `bun install` si rifà; uguale, non si fa niente. Per Python è l'elenco dei pacchetti con il loro indice (`ambiente\.mango-pacchetti`): l'ambiente dell'app vale solo se contiene tutto ciò che le funzioni
  accese chiedono adesso (spegnere una funzione non rifà niente; una versione fissata diversa, una funzione accesa in più, o PyTorch che passa da CPU a CUDA, sì). Un Python indicato dalla variabile o quello del computer
  che ha già tutto non passano da qui. Scritte solo a installazione riuscita: una a metà si rifà al prossimo avvio.
  Di un ambiente che c'è già `uv` non rimette i pacchetti che hanno la versione chiesta: il peso e lo spazio che la pagina dice contano solo i gruppi di pacchetti (quelli di base, quelli delle funzioni, PyTorch)
  con un pacchetto che l'elenco non ha; senza ambiente o senza elenco, tutti.
- **Quale Python usano il motore e la dettatura**, in quest'ordine: `MANGO_ANIMATION_PYTHON` (chi sviluppa: non si controlla niente); quello dell'ambiente dell'app, se importa tutto; quello nel PATH, se importa tutto
  (un computer che ha già tutto non scarica niente); altrimenti l'app prepara il suo. Il controllo a ogni avvio cerca i moduli senza importarli; dopo aver installato li importa davvero.
- **Senza chiedere** si preparano i pacchetti del codice (`bun install`): quando mancano solo loro (il primo avvio dopo un aggiornamento che cambia un lockfile) non c'è niente da scegliere, e la pagina mostra
  solo l'avanzamento («Preparo l'app»). Se non riesce, si apre la pagina con l'errore.
- **La pagina** (`app/ui/`), «Scegli cosa vuoi fare»: una riga sul computer (quante schede NVIDIA e quanta memoria; i nomi nel suggerimento); le funzioni come schede con un interruttore, il nome e la frase di
  «Motori» (`FUNZIONI` e `COSA_FA` in `manifesto.rs`) e quanto scaricano, oppure «Pronta» o «Spenta» (cambiandole si ricalcola cosa serve); i componenti comuni (le voci senza funzione: prima a cosa servono,
  poi il nome del programma), con «Serve sempre» su quelle senza cui il server non parte (`necessaria`: Bun e i pacchetti del codice); licenze e fonti dentro «Cosa scarico e da dove», chiuso. In fondo,
  fissi, quanto si scarica, lo spazio libero e i bottoni: se lo spazio non basta (i pacchetti Python contano due volte, per la cache di `uv`, più un gigabyte) «Scarica e comincia» resta spento. «Scarica e
  comincia» scrive nel profilo le funzioni che il creator ha cambiato (`motori.<funzione>.attiva`, il resto del profilo com'è) e comincia; «Ferma» torna al piano; un errore dice quale voce e perché e si può
  riprovare; «Non ora» lascia tutto com'è, e non c'è quando manca una voce necessaria. Un file arriva al suo posto solo con dimensione e impronta giuste; uno scarico interrotto riprende da dove era (`Range`): si arrende dopo quattro giri di fila senza un byte in più, e un disco che non scrive ferma subito, con la frase che dice di liberare spazio.
  Un programma estratto da uno zip conta come presente solo a estrazione finita (lo zip si toglie dopo): con lo zip ancora lì si rifà. Lo spazio che serve non conta ciò che è già nei `.parte`, e si rilegge ogni volta che la pagina lo mostra.
- **Al server** arrivano il PATH con davanti le cartelle di ciò che ha scaricato l'app e, se è quello da usare, `MANGO_ANIMATION_PYTHON`; la dettatura prende lo stesso Python (`Voce::usa_python`).
- **Per lo studio** (Impostazioni › Computer), il ponte `window.__MANGO_ANIMATION__.computer`: `leggi()` → `{ schede: [{ indice, nome, memoria_mb, libera_mb, capacita }], processore, thread, ram_mb, disco_libero_mb }`
  (un comando del ponte, come la dettatura: `app/src/computer/ponte.rs`). Le schede sono quelle NVIDIA nell'ordine di `nvidia-smi` (`macchina.scheda_video` del profilo è questo indice); senza scheda l'elenco è vuoto.
  Ciò che si accende nei Motori lo scarica l'app al prossimo avvio.
- **Prove**: `cargo test` (con un server di prova locale: scarico, ripresa, impronta sbagliata, annullo, archivi; installatori finti); dalla rete vera, in una cartella temporanea, `cargo test il_computer_vero -- --ignored --nocapture`
  (uv, Bun, ffmpeg, DeepFilterNet, YuNet, Python con un pacchetto).
