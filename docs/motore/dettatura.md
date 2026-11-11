# Il motore: la dettatura

| comando | cosa fa | scrive |
|---|---|---|
| `python -m motore detta` | la dettatura dell'app: un processo che resta acceso col modello caricato e parla a righe JSON su stdin e stdout (sotto «La dettatura»); non ha slug e non vuole la cartella di lavoro | niente |

## La dettatura

`python -m motore detta` è il motore della dettatura dell'app (`docs/APP.md`): non è un lavoro che finisce, ma un processo che l'app accende alla
prima dettatura e tiene acceso. Carica il modello (faster-whisper) e poi aspetta la voce a righe JSON. Non legge la cartella di lavoro. Su
stdout scrive solo il protocollo (ciò che le librerie stampano va su stderr, che l'app tiene in un log).

**Dove gira.** Sulla scheda NVIDIA se c'è (quella di `macchina.scheda_video`, se il profilo la indica), altrimenti sul processore (`dispositivo_voce`; `scheda_video: null` lo forza); il modello e il
calcolo sono di `dettatura.dispositivi.cuda` o `.cpu` in `stile.json`, e per il calcolo vale il primo della lista che il dispositivo sa fare
(una scheda senza `float16`, come le Pascal (GTX 10xx), passa a `float32`). La scelta si legge nell'evento `pronto`; non c'è un ripiego silenzioso:
una scheda senza memoria libera, o a cui manca una libreria di CUDA (`docs/MOTORI.md`), è un errore, che dice di liberarla o di mettere `null` in `macchina.scheda_video`. Sulla scheda `carica` trascrive mezzo secondo di silenzio prima di dire `pronto`, così l'errore compare al caricamento e non alla prima frase. Il processo riceve la cartella dei dati (`MANGO_ANIMATION_LAVORO`) dall'app, da cui legge lo stile e il profilo.

**Il protocollo.** Una riga JSON per messaggio.

| da | messaggio | significato |
|---|---|---|
| app | `{"tipo":"nuova","id":N}` | comincia una dettatura (l'`id` lo sceglie l'app); ciò che restava della precedente si scarta |
| app | `{"tipo":"audio","id":N,"pcm":"…"}` | un pezzo d'audio: PCM a 16 bit little-endian, 16 kHz, mono, in base64 |
| app | `{"tipo":"fine","id":N}` | la dettatura è finita: la frase in corso si chiude subito |
| motore | `{"tipo":"pronto","dispositivo":"cuda","modello":"…","calcolo":"…"}` | una volta, a modello caricato; l'app non manda niente prima |
| motore | `{"tipo":"ascolto","id":N}` | risposta a `nuova` |
| motore | `{"tipo":"parziale","id":N,"testo":"…"}` | la frase in corso, tutta, dall'inizio; cresce e si corregge |
| motore | `{"tipo":"definitiva","id":N,"testo":"…"}` | la frase finita |
| motore | `{"tipo":"chiusa","id":N}` | risposta a `fine`, sempre dopo l'ultima `definitiva` |
| motore | `{"tipo":"errore","messaggio":"…","fatale":true}` | `fatale`: il motore esce subito dopo (modello che non si carica, pacchetto o memoria che mancano) |

**Le frasi** (`Frasi` in `detta.py`). Prima della voce si tiene solo `prima` secondi d'audio, per non perdere l'attacco; la voce la
riconosce il VAD (Silero, quello di `prepara`) con le soglie di `dettatura.vad`. Da lì la frase in corso si ritrascrive ogni `ogni_parziale`
secondi di audio nuovo (`parziale`, `fasci_parziale` fasci, sul tratto fino all'ultima voce più `vad.margine`). Il silenzio si guarda solo
sulla coda dell'audio, lunga `silenzio_fine` + `vad.guardia`: dopo `silenzio_fine` secondi senza voce la frase si trascrive una volta con
`fasci_definitiva` fasci (`definitiva`) e si riparte. Una frase che arriva a `massimo_frase` secondi si chiude nell'ultima pausa lunga almeno
`vad.pausa_interna` (o dove è arrivata, se non ne ha), e ciò che segue è l'inizio della prossima. Alla `fine` la frase in corso si chiude
subito, senza aspettare il silenzio. L'audio che arriva mentre si trascrive aspetta (un thread lo legge): al giro dopo si prende tutto.
