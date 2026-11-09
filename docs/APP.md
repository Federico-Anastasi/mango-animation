# Mango Animation (l'app)

Una finestra sola: lo studio del server a tutta pagina, come nel browser ma aperta col doppio clic
dell'icona sul Desktop. La posizione, la misura e la finestra si ricordano fra un avvio e l'altro. La chat con
Claude Code dentro lo studio (`docs/CHAT.md`, `studio/src/chat/`)
funziona qui dentro come ogni altra vista dello studio, senza bisogno di niente in più nell'app.

## Come funziona

- **La radice del repo** si trova risalendo da dove sta l'eseguibile fino alla cartella con `CLAUDE.md` e `server/` (l'eseguibile
  costruito sta in `app/target/release/`, dentro il repo), altrimenti è `codice/` accanto all'eseguibile (l'app installata). Così dal repo
  le copie per l'installatore (`app/target/codice/`, e `app/target/release/codice/` che lascia la costruzione) non contano. Fuori dal repo si indica con
  `MANGO_ANIMATION_RADICE`. Se non la trova, la finestra lo dice e basta.
- **La cartella di lavoro** (`docs/ARCHITETTURA.md`): i dati di chi usa l'app, in un'altra cartella dal codice. La indica `MANGO_ANIMATION_LAVORO`, e
  vince su tutto (prove, chi sviluppa); se manca vale quella ricordata in `%APPDATA%\dev.mango.animation\lavoro.json`. Al primo avvio l'app non
  chiede niente: crea `Mango Animation` dentro la cartella Documenti dell'utente (quella vera di Windows, anche se spostata o su OneDrive), con un
  `archivio/` vuoto, la ricorda e accende il server. Se la cartella ricordata non c'è più (disco staccato, cartella spostata) la pagina lo dice e offre
  «Ricrea in Documenti» o «Scegli un'altra cartella» (dialogo di sistema); una variabile che indica una cartella che non esiste è un errore, senza
  «Riprova». Per cambiarla quando tutto va: nello studio, il bottone con la cartella nella barra apre «Cartella dei dati» con «Sposta la cartella dei
  dati…»; la scelta vale dal riavvio e i file non si spostano da soli, vanno copiati. L'app avvia il server dalla cartella del codice e gli passa
  `MANGO_ANIMATION_LAVORO`.
- **L'ordine dell'avvio**, quando il server lo accende l'app: una versione nuova (solo l'app installata, «Installer e aggiornamenti»), Claude Code («Il Claude Code del creator»), il computer pronto («Il computer pronto»), il
  server. Ogni passo che ha qualcosa da dire al creator lo dice nella pagina d'attesa e aspetta; un server già acceso li salta tutti.
- **La lingua delle pagine dell'app** (attesa, errori, scelte dell'avvio, dialogo della cartella, e le frasi che il Rust ci manda): italiano o inglese, decisa da una funzione sola
  (`scegli` in `app/src/lingua.rs`). Vale la lingua che lo studio ha scelto, se l'app la conosce: lo studio la dice a ogni apertura e a ogni cambio, e l'app la ricorda in
  `%APPDATA%\dev.mango.animation\lingua.json`; al primo avvio, e se non la conosce, vale quella dell'interfaccia di Windows (italiano se è in italiano, inglese altrimenti). Ogni
  stato che l'app manda alla pagina porta `lingua` (`it` o `en`) già nelle sue frasi; le frasi fisse sono in `app/ui/app.js` (`t("italiano", "inglese")`, niente testo nell'HTML), quelle
  del Rust sono `t(it, en)` di `lingua.rs`. `app/tests/linguaggio.rs` fa fallire una frase che resta in una lingua sola.
- **Il Claude Code del creator**: vedi sotto. L'app lo cerca prima di accendere il server e gli passa il percorso in `MANGO_ANIMATION_CLAUDE`.
- **Il server**: all'avvio l'app chiede `GET /api/lavori` sulla porta di `MANGO_ANIMATION_PORTA` (47431 se manca), portando la chiave delle API
  della cartella di lavoro (`archivio/arrivi/chiave-api.json`, `docs/API.md`: la fa il server al primo avvio, e senza ogni risposta è 401). Se
  risponde 200, lo usa e non lo tocca; un 401 è un server di un'altra cartella, e non vale. Se no, lo accende (`bun run --cwd server avvia`, nascosto) e aspetta che
  risponda, fino a 90 s; nel frattempo una pagina d'attesa pulita, e se non parte mostra le ultime righe del log,
  col bottone «Riprova». Appena il server risponde la finestra **naviga** sullo studio entrando con la chiave
  (`http://127.0.0.1:<porta>/entra?chiave=…`, che mette il cookie e rimanda a `/`): è la pagina vera, non un riquadro dentro un'altra pagina.
- **Il server che muore a finestra aperta**: se l'ha acceso l'app, lo guarda finché è acceso (`sorveglia` in `app/src/server.rs`). Se il processo esce la finestra torna alla pagina d'attesa («Il server si è fermato: lo riaccendo»),
  l'app lo riaccende con lo stesso comando (il log continua, non riparte da capo) e, appena risponde, ricarica lo studio. Se il server riacceso si ferma di nuovo entro 60 s, o non riparte, la pagina è quella d'errore («Il server si è fermato», non «non parte»), con le ultime
  righe del log e «Riprova»; un server che ha girato più di 60 s si riaccende ancora. Un server già acceso prima dell'app non lo guarda: se cade, lo studio resta com'era (la riga di sopra vale solo per quello dell'app).
- **I link esterni** (un `<a target="_blank">` dello studio, o una navigazione che porterebbe la finestra fuori
  da `127.0.0.1`/`localhost`) si aprono nel browser di sistema, mai in una finestra dell'app.
- **«Apri la cartella»** e ogni altro gesto dello studio che tocca il disco passano dal server, come nel browser:
  non servono all'app. Le sole cose che lo studio chiede all'app sono la dettatura (sotto), gli appunti (`window.__MANGO_ANIMATION__.appunti`), la cartella dei dati (`window.__MANGO_ANIMATION__.cartellaDati`) il computer (`window.__MANGO_ANIMATION__.computer`), le segnalazioni (`window.__MANGO_ANIMATION__.segnalazione`) e, da lei, i file trascinati (`window.__MANGO_ANIMATION__.trascinamento`).
- **La barra del titolo di Windows** prende lo stesso colore della pagina (chiara o scura, dallo sfondo vero,
  non da un tema fisso), e si aggiorna da sola se la pagina cambia tema.
- **Chiusura**: l'app entra in un Job Object di Windows che chiude ogni processo avviato da lei (il server, se
  l'ha acceso lei) quando si chiude, anche se va in crash. Un server già acceso prima non si tocca. I link e la pagina di una
  segnalazione che l'app apre per il creator partono invece fuori dal Job (`supervisor::apri_fuori_dal_giobbe`, `CREATE_BREAKAWAY_FROM_JOB`):
  un browser che non era acceso resta aperto quando l'app si chiude.
- **Una sola istanza**: un secondo avvio porta in primo piano la finestra già aperta.
- **Il registro** (`app/src/istanza.rs`): all'avvio l'app scrive `app.json` (`{ "pid", "exe" }`: il suo pid e il percorso del suo eseguibile) in `%LOCALAPPDATA%\dev.mango.animation\`, accanto a `logs\` e
  `computer\`; lo scrive intero o per niente (file provvisorio e rinomina), e alla chiusura lo toglie solo se il pid scritto è il suo. Nell'ambiente del server che accende mette `MANGO_ANIMATION_APP_PID`
  (il proprio pid): lo ereditano i figli del server, la chat compresa.

## Il Claude Code del creator

L'app non porta Claude Code: usa quello che il creator ha già, e la chat parte con quel programma e non con la copia che l'SDK porta con sé
(`docs/CHAT.md`). L'app non legge né usa il suo accesso: gli chiede, come da terminale, `claude --version` e `claude auth status` (un JSON, anche se non si è collegati),
e per l'accesso lascia fare a lui (`claude auth login`).

- **Dove lo cerca** (`app/src/claude.rs`): `MANGO_ANIMATION_CLAUDE` (il percorso del programma: vince su tutto, ed è un errore se indica qualcosa che non c'è); poi `claude.exe`
  nelle cartelle del PATH, e un `claude.cmd` di npm con il suo programma accanto (`node_modules\@anthropic-ai\claude-code\bin\claude.exe`); poi dove si installa senza che il PATH
  dell'app lo sappia ancora: `%USERPROFILE%\.local\bin\claude.exe` (l'installatore di Anthropic) e `%APPDATA%\npm\node_modules\@anthropic-ai\claude-code\bin\claude.exe`.
- **Cosa fa all'avvio**, solo se il server lo accende lei (con un server già acceso non c'entra): se Claude Code c'è, parte e risulta collegato, passa avanti senza dire niente. Altrimenti la pagina
  d'attesa lo dice e aspetta il creator (`app/src/preparazione.rs`, `app/ui/`):
  - **manca o non parte**: il comando di Anthropic per installarlo da PowerShell (`irm https://claude.ai/install.ps1 | iex`, con «Copia il comando») e il link alla loro guida; poi «Ricontrolla»;
  - **non è collegato**: «Accedi a Claude Code» apre una finestra di terminale con `claude auth login` (apre il browser dell'account; se serve un passo in più il creator lo legge lì), e quando si chiude
    l'app ricontrolla da sola; «Ricontrolla» per chi ha fatto l'accesso altrove;
  - «Vai avanti senza Claude Code» lascia partire lo studio: la chat, se Claude Code non c'è o non è collegato, lo dirà con la frase di Claude Code.
  Versione e account (`email`, `subscriptionType`) la pagina li legge dal controllo; non si salvano da nessuna parte.
- **Al server** il percorso arriva in `MANGO_ANIMATION_CLAUDE`; senza (si sviluppa a mano, o si va avanti senza) il server usa la copia dell'SDK se c'è.
- La prova col `claude` installato nel computer: `cargo test il_claude_vero -- --ignored --nocapture`.

## Il computer pronto

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
  | Chromium (`bun x playwright install chromium`) | se Playwright non ne ha uno | 710 MB (stima) | dove lo tiene Playwright |
  | Whisper (large-v3, large-v3-turbo o small) | trascrizione e dettatura: il modello che chiedono | da 0,5 a 3,1 GB | cache di Hugging Face, `models--<org>--<nome>/snapshots/<revisione>/` e `refs/main` |
  | MMS (allineamento delle parole, CC-BY-NC) | allineamento | 1,3 GB | `~/.cache/torch/hub/checkpoints/` |
  | SAM 2.1, ViTMatte, RT-DETR | sagoma | 324, 103 e 81 MB | cache di Hugging Face |
  | YuNet | segui | 0,2 MB | cache di Hugging Face |
  | DeepFilterNet3 | pulizia_voce | 27 MB | `~/.cache/mango-animation/modelli/` |

  I modelli **non si distribuiscono con l'app**: si scaricano dalla loro fonte, con la licenza di ciascuno accanto nella pagina. Un modello già nella cache di Hugging Face, di qualunque revisione, non si riscarica.
  I pacchetti Python sono quelli di `piano.rs` (versioni fissate come in `docs/NUOVO-COMPUTER.md`); PyTorch viene dall'indice CUDA 12.4 se c'è una scheda NVIDIA con capacità di calcolo da 5.0, dall'indice del
  processore altrimenti. Python lo prepara `uv` (`uv python install --no-bin`, `uv venv`, `uv pip install`): non tocca il Python del computer né `~/.local/bin`.
  Mentre scarica `uv` scrive righe solo a inizio e fine: la barra di «Python e i suoi pacchetti» è quanto sono cresciute, dall'inizio, `computer\uv-cache\` e `computer\python\` rispetto al peso stimato (si guarda ogni
  secondo, `installa.rs`). Non torna indietro e non arriva in fondo prima che `uv` finisca; con la cache già piena (un'installazione ripresa) resta bassa e si completa alla fine.
- **Pacchetti e versioni dopo un aggiornamento.** I moduli presenti non dicono la versione, e `node_modules` non dice da quale lockfile viene: a installazione finita l'app scrive cosa ha messo, e a ogni avvio confronta.
  Per i pacchetti JS è l'impronta (SHA-256) di `package.json`, `bun.lock` e `bun.lockb` com'erano a `bun install` finito, in `node_modules/.mango-impronta` (tolto `node_modules`, sparisce anche lei); cambia il lockfile, o manca
  l'impronta, e `bun install` si rifà; uguale, non si fa niente. Per Python è l'elenco dei pacchetti con il loro indice (`ambiente\.mango-pacchetti`): l'ambiente dell'app vale solo se contiene tutto ciò che le funzioni
  accese chiedono adesso (spegnere una funzione non rifà niente; una versione fissata diversa, una funzione accesa in più, o PyTorch che passa da CPU a CUDA, sì). Un Python indicato dalla variabile o quello del computer
  che ha già tutto non passano da qui. Scritte solo a installazione riuscita: una a metà si rifà al prossimo avvio.
- **Quale Python usano il motore e la dettatura**, in quest'ordine: `MANGO_ANIMATION_PYTHON` (chi sviluppa: non si controlla niente); quello dell'ambiente dell'app, se importa tutto; quello nel PATH, se importa tutto
  (un computer che ha già tutto non scarica niente); altrimenti l'app prepara il suo. Il controllo a ogni avvio cerca i moduli senza importarli; dopo aver installato li importa davvero.
- **Senza chiedere** si preparano i pacchetti del codice (`bun install`): quando mancano solo loro (il primo avvio dopo un aggiornamento che cambia un lockfile) non c'è niente da scegliere, e la pagina mostra
  solo l'avanzamento («Preparo l'app»). Se non riesce, si apre la pagina con l'errore.
- **La pagina** (`app/ui/`), «Scegli cosa vuoi fare»: una riga sul computer (quante schede NVIDIA e quanta memoria; i nomi nel suggerimento); le funzioni come schede con un interruttore, il nome e la frase di
  «Motori» (`FUNZIONI` e `COSA_FA` in `manifesto.rs`) e quanto scaricano, oppure «Pronta» o «Spenta» (cambiandole si ricalcola cosa serve); i componenti comuni (le voci senza funzione: prima a cosa servono,
  poi il nome del programma), con «Serve sempre» su quelle senza cui il server non parte (`necessaria`: Bun e i pacchetti del codice); licenze e fonti dentro «Cosa scarico e da dove», chiuso. In fondo,
  fissi, quanto si scarica, lo spazio libero e i bottoni: se lo spazio non basta (i pacchetti Python contano due volte, per la cache di `uv`, più un gigabyte) «Scarica e comincia» resta spento. «Scarica e
  comincia» scrive nel profilo le funzioni che il creator ha cambiato (`motori.<funzione>.attiva`, il resto del profilo com'è) e comincia; «Ferma» torna al piano; un errore dice quale voce e perché e si può
  riprovare; «Non ora» lascia tutto com'è, e non c'è quando manca una voce necessaria. Un file arriva al suo posto solo con dimensione e impronta giuste; uno scarico interrotto riprende da dove era (`Range`, fino a quattro tentativi).
- **Al server** arrivano il PATH con davanti le cartelle di ciò che ha scaricato l'app e, se è quello da usare, `MANGO_ANIMATION_PYTHON`; la dettatura prende lo stesso Python (`Voce::usa_python`).
- **Per lo studio** (la pagina «Motori»), il ponte `window.__MANGO_ANIMATION__.computer`: `leggi()` → `{ schede: [{ indice, nome, memoria_mb, libera_mb, capacita }], processore, thread, ram_mb, disco_libero_mb }`
  (un plugin, come la dettatura: `app/src/computer/ponte.rs`). Le schede sono quelle NVIDIA nell'ordine di `nvidia-smi` (`macchina.scheda_video` del profilo è questo indice); senza scheda l'elenco è vuoto.
  Ciò che si accende nei Motori lo scarica l'app al prossimo avvio.
- **Prove**: `cargo test` (con un server di prova locale: scarico, ripresa, impronta sbagliata, annullo, archivi; installatori finti); dalla rete vera, in una cartella temporanea, `cargo test il_computer_vero -- --ignored --nocapture`
  (uv, Bun, ffmpeg, DeepFilterNet, YuNet, Python con un pacchetto).

## La dettatura

Nel campo della chat c'è un microfono (`docs/INTERFACCIA.md`) che nel browser non compare: lo mostra lo studio solo se l'app gli ha messo
nella pagina `window.__MANGO_ANIMATION__.voce`. Il microfono si registra in Rust (cpal, il predefinito di Windows, ricampionato a 16 kHz
mono) e il testo lo dà un motore locale, faster-whisper: l'audio non lascia il computer, e l'app non legge né usa il login di Claude Code
(`app/src/voce/`: `locale.rs` il motore, `audio.rs` microfono e ricampionamento).

- **Il motore** è un processo che parla a righe JSON (il protocollo è in `docs/MOTORE.md`, «La dettatura»). Di base `python -m motore detta`,
  lanciato dalla radice del codice (la cartella con `motore/`: `MANGO_ANIMATION_RADICE`, o la prima risalendo da dove sta l'eseguibile) col Python
  di `MANGO_ANIMATION_PYTHON` (di base `python` del PATH) e il modulo di `MANGO_ANIMATION_MODULO` (di base `motore`), come il server. Per usarne un
  altro che parli lo stesso protocollo si scrive la riga di comando in `MANGO_ANIMATION_DETTATURA` (le virgolette doppie tengono insieme
  una parola con gli spazi): `"C:\Programmi\Motore\motore.exe" detta`. Parte alla prima dettatura, resta acceso con il modello
  caricato fra una dettatura e l'altra, e si chiude con l'app (Job Object: i figli lo ereditano). Se cade, la dettatura dopo lo riaccende.
  L'app gli passa la cartella dei dati che ha all'avvio (`MANGO_ANIMATION_LAVORO`), da cui legge lo stile e il profilo, e la lingua dello studio che lo
  accende (`MANGO_ANIMATION_LINGUA=it|en`, come il server coi lavori): le frasi dei suoi errori escono in quella lingua. Il motore resta acceso fra una
  dettatura e l'altra, ma gli errori li dice quando si accende; se cade, la dettatura dopo lo riaccende nella lingua di allora.
  Il suo log (ciò che scrive su stderr) è `dettatura.log` in `%LOCALAPPDATA%\dev.mango.animation\logs\`.
- **Il modello** lo sceglie il motore in `stile.json` → `dettatura` (quello di serie con sopra quello del creator): la scheda NVIDIA se c'è (quella di
  `macchina.scheda_video` del profilo, se la indica), altrimenti il processore con un modello più piccolo (`docs/MOTORI.md`). La prima volta il modello si scarica (Hugging Face, serve la rete) e la dettatura è più
  lunga ad accendersi; poi si carica dal disco in pochi secondi, la prima dettatura dopo l'avvio dell'app.
- **Mentre si carica** il microfono ascolta già e il livello si muove: lo studio scrive «Preparo la dettatura…» (evento `preparo`), e ciò che
  il creator dice non va perso, perché arriva al motore appena è pronto.
- **Il ponte.** Tre comandi di un plugin dell'app (`voce_stato`, `voce_avvia`, `voce_ferma`: un plugin perché lo studio è una pagina remota e
  vuole permessi suoi, `build.rs` e `capabilities/default.json`), e uno script (`app/src/voce/ponte.js`) che li espone alla pagina:
  `voce.stato(lingua)` → `{ disponibile, messaggio?, in_ascolto }` (disponibile: il comando del motore si è trovato; Python e il modello si
  vedono solo accendendolo); `voce.avvia(lingua)` (restituisce l'`id` della dettatura), `voce.ferma(lingua)` (rifiutano con `{ code, message }`:
  `motore_mancante`, `python_mancante`, `motore_non_parte`, `motore_caduto`, `comando_non_valido`, `microfono_assente`, `microfono_negato`,
  `file_illeggibile`, `gia_in_ascolto`, `non_in_ascolto`; `message` è la frase nella `lingua`); `voce.su(f)` → riceve gli eventi `{ tipo }` e dà la
  funzione per smettere. `lingua` è `"it"` o `"en"`, quella dello studio (senza o con un'altra, italiano): le frasi di errore dell'app (`message`, il `messaggio` degli
  eventi `errore`) e del suo motore escono in quella lingua.
- **Gli eventi** portano tutti l'`id` della dettatura a cui appartengono, e lo studio ignora quelli di una dettatura vecchia: `preparo` (il
  motore sta caricando il modello), `ascolto` (il motore ascolta), `livello` (`valore` 0-1, dieci al secondo, calcolato dall'app), `parziale`
  (la frase in corso, `testo`: provvisoria), `definitiva` (la frase finita, `testo`), `errore` (`messaggio`: anche il motore che non carica il
  modello o cade, con le ultime righe del suo log), `fine` (sempre l'ultimo di quella dettatura, anche se il motore è caduto). Una frase è
  finita dopo `dettatura.silenzio_fine` secondi di silenzio.
- **Fermare**: `ferma()` libera subito il microfono e torna subito; un'altra dettatura può partire all'istante. Il thread della dettatura
  manda al motore l'audio che restava e `fine`, e aspetta che chiuda l'ultima frase (al più 30 s): le ultime parole arrivano quindi anche
  dopo `ferma()`, come eventi di quella dettatura. Una dettatura nuova prende il posto di una che aspettava ancora il modello.
- **Per provare senza parlare**: con `MANGO_ANIMATION_VOCE_FILE=<un .wav>` nell'ambiente dell'app, `voce.avvia()` suona quel WAV (PCM a 16 bit) in
  tempo reale al posto del microfono. Solo per le prove.

## Gli appunti

Un file copiato in Esplora risorse (`CF_HDROP`) non arriva sempre alla pagina come file nell'evento di incolla. Nel campo della chat, se
Ctrl+V non porta né file né testo, la pagina chiede all'app i percorsi (`window.__MANGO_ANIMATION__.appunti.percorsi()`, un plugin come la
dettatura: `app/src/appunti.rs`, `build.rs`, `capabilities/default.json`) e li manda al server (`POST /api/chat/allegati/locale`,
`docs/CHAT.md`), che li copia fra gli allegati. L'app dà solo i file che esistono (le cartelle no); senza file negli appunti dà un elenco vuoto
e la pagina non fa niente; se gli appunti sono usati da un altro programma rifiuta con la frase, che la chat mostra. Immagini (uno
screenshot) e testo restano al browser. Nel browser senza l'app il ponte non c'è e vale ciò che il browser sa fare.

## I file trascinati

Un file lasciato sulla finestra la pagina lo riceve col suo percorso, non col solo contenuto: così un video grande si collega invece di essere
copiato, come quando è incollato. Il trascinamento di Tauri è acceso (`app/src/trascinamento.rs`) e, con lui acceso, su Windows la pagina non riceve
più `dragenter` e `drop` dei file: li riceve come eventi `mango-trascinamento` sulla finestra, dal ponte `window.__MANGO_ANIMATION__.trascinamento`.

- `trascinamento.su(f)` → `f({ tipo, x, y, percorsi? })` e restituisce la funzione che smette di ascoltare. `tipo`: `entra` (con i `percorsi`), `sopra`
  (a ogni movimento), `lascia` (con i `percorsi`), `esce` (senza `x` e `y`; anche per un trascinamento annullato). `x` e `y` sono in pixel della pagina,
  come `clientX` e `clientY`: la pagina decide se il file è sopra la chat (`document.elementFromPoint`).
- I `percorsi` sono quelli che Windows dà: file e anche cartelle. Una cartella la rifiuta il server (`POST /api/chat/allegati/locale`) con la sua frase, e la chat la mostra
  sull'allegato.
- La chat (`studio/src/chat/PannelloChat.tsx`) manda i file lasciati sopra di lei a `POST /api/chat/allegati/locale`, uno per file: fino a 16 MB il server li copia, oltre li collega.
  Nel browser senza l'app il ponte non c'è e vale il `drop` della pagina (sotto i 16 MB; oltre, la chat dice di incollare il file da Esplora risorse).

## Le segnalazioni dei problemi

Chi usa l'app può mandare a chi la sistema ciò che sta andando storto, con un clic e senza dati personali. Il codice è `app/src/segnalazione/`
(`mod.rs` i comandi e la pagina «nuova issue», `rapporto.rs` l'evento e il testo, `registro.rs` `ui.log`, `anonimizza.rs`, `schermata.rs`, `ponte.js` lo script delle pagine).

- **Dove sta «Segnala un problema»**: nello studio, il bottone con la bandierina nella barra in alto (accanto a lingua e tema, raggiungibile da ogni vista) e, nella vista d'errore comune, «Segnala il problema»
  (porta con sé il messaggio e il dettaglio dell'errore); nelle pagine dell'app (`app/ui/`), un bottone in fondo a ogni pagina, d'attesa e d'errore comprese (nelle pagine d'errore porta il titolo e il messaggio). Nel browser,
  senza l'app, il ponte `window.__MANGO_ANIMATION__.segnalazione` non c'è e il bottone dello studio non compare.
- **Il dialogo**: «Cosa è successo?» (facoltativo); l'interruttore «Includi una schermata della finestra», acceso di base, con la spiegazione che può mostrare contenuti del creator; una frase che dice che i registri allegati
  possono contenere i nomi dei suoi video e dei suoi file, che nome utente, nome del computer, email, indirizzi di rete e chiavi vengono tolti, e che trascrizioni, chat e file della cartella di lavoro non partono mai; «Invia» →
  «Inviato, grazie». Non parte niente senza il clic. Con la schermata, il dialogo si nasconde il tempo di riprendere la finestra, che altrimenti mostrerebbe il dialogo e non la pagina di cui si parla.
- **Dove va**: la segnalazione parte come un'unica busta HTTP (`ureq`, senza SDK) verso il progetto Sentry `mango-animation` dell'organizzazione `mango-o6` (dati in UE), il cui DSN sta in `segnalazione/mod.rs`
  (`SENTRY_DSN_DEL_PROGETTO`: un DSN permette solo di inviare). Una costruzione lo sostituisce con la variabile `MANGO_ANIMATION_SENTRY_DSN`, e vuota o `off` lo spegne: chi fa un fork la mette a `off` o al DSN di un suo
  progetto. Il comando `segnalazione_invio_attivo` dice alle pagine se l'invio è acceso: senza, l'interruttore della schermata non si mostra. Senza indirizzo il testo resta in
  `segnalazione-<data>-<ora>.txt` nella cartella dei registri, si mostra in Esplora file e si apre la pagina «nuova issue» di `github.com/Federico-Anastasi/mango-animation`, con titolo e testo già scritti: la macchina e la
  richiesta di allegare il file, niente di personale; la schermata in quel caso non si prende.
- **Cosa contiene**: `level: "error"`; `message` (la nota del creator o la prima riga dell'errore); `release: mango-animation@<versione>`; `environment` (`production` l'app installata, `development` quella di chi sviluppa);
  `tags` `kind` (`user-report` o `error-page`), `gpu`, `vram_mib`, `ram_mib`, `lingua`, `app` (`installata` o `sviluppo`); `contexts` `os`, `device`, `gpu`; `extra` `note`, `error`, `page`, `gpus`; allegati `report.txt` (riepilogo, nota,
  errore, e la fine di 256 KB di ogni `*.log` della cartella dei registri dell'app) e `screenshot.png` (`PrintWindow`, solo se l'interruttore è acceso). L'hardware lo legge `computer/hw.rs`. Non entra mai altro: né trascrizioni, né
  chat, né file della cartella di lavoro.
- **Anonimizzazione** (`anonimizza.rs`, su ogni testo e allegato): il nome utente nei percorsi (anche con le barre doppie dei JSON) → `<user>`, il nome del PC → `<pc>`, email → `<email>`, IPv4 (tranne `127.x` e `0.0.0.0`) → `<ip>`,
  chiavi e token (`sk-…`, `hf_…`, `ghp_…`, `github_pat_…`, `Bearer …`, `?key=`, `chiave=`, `token=`, `password=`, l'intestazione `X-Chiave-Api`, i cookie `mango_api_<porta>` e `mango_studio`) → `<secret>`, e la chiave delle API
  di questa cartella di lavoro (`archivio/arrivi/chiave-api.json`, `docs/API.md`) ovunque compaia. I nomi dei video non si toccano: il dialogo lo dice.
- **`ui.log`** (`%LOCALAPPDATA%\dev.mango.animation\logs\`): gli errori non gestiti delle pagine (quelle dell'app e lo studio dentro l'app), i `console.error` e le chiamate dei ponti all'app più lente di 1 s o senza risposta dopo 5 s
  (`ponte.js` le avvolge; la scelta di una cartella aspetta il creator e non conta). Al più 100 righe al minuto (quelle tolte si contano in una riga), oltre 2 MB passa in `ui.1.log`.
  Le chiamate delle pagine dell'app a se stessa (`stato_app`, `azione`, …) non sono misurate: ogni loro errore sì.
- **Prove**: `cargo test` da `app/` (anonimizzazione con dati realistici, forma dell'evento, busta con le lunghezze esatte, invio contro un server locale, file e pagina di GitHub, tetto di `ui.log`; la schermata con una finestra vera:
  `cargo test una_finestra_vera -- --ignored`), `bun test prove installer` da `app/` (lo script delle pagine e il dialogo dell'app), `bun run test` da `studio/` (il bottone, il dialogo, la vista d'errore). Nei test niente va a Sentry.

## Costruire e avviare

Servono Rust (`rustup`) e `cargo install tauri-cli --version "^2"`; per il resto `docs/NUOVO-COMPUTER.md`. Si lavora dentro `app/`.

    cd app
    cargo tauri build --no-bundle    # app/target/release/mango-animation.exe
    cargo test                       # prove senza finestra né microfono
    cargo test -- --ignored          # col motore vero della dettatura: serve MANGO_ANIMATION_PROVA_WAV=<un WAV a 16 bit con la voce>
    cargo tauri dev                  # per lavorarci

Lo studio (`studio/dist`) lo costruisce `bun run --cwd studio build`: l'app mostra quello che il server serve. Con l'app aperta l'eseguibile
non si può sovrascrivere: va chiusa prima, con `--ferma` del comando qui sotto.

### Riavviare l'app

    bun run --cwd server riavvia-app              # chiude l'app registrata e la riaccende; senza app accesa la accende
    bun run --cwd server riavvia-app --ferma      # solo la chiude (serve per ricostruire l'eseguibile)
    bun run --cwd server riavvia-app --exe <percorso> --dati <cartella>   # un altro eseguibile, un'altra cartella del registro (prove)

Fa, in ordine: legge `app.json`; controlla che il pid sia vivo e che l'eseguibile di quel processo sia quello scritto (un pid che non c'è più o è diventato un altro programma vuol dire file vecchio: lo dice, lo toglie e non
ferma niente); chiude la finestra con garbo e aspetta fino a 15 s; se il processo non esce (o non ha una finestra) lo ferma con `taskkill /PID <pid> /T /F` e il Job Object ferma il server; aspetta fino a 10 s che la porta
del server (`MANGO_ANIMATION_PORTA`, 47431 se manca) si liberi; accende l'eseguibile registrato (senza app accesa: `--exe`, o `app/target/release/mango-animation.exe`) staccato dal comando; aspetta fino a 120 s che
`app.json` abbia un pid nuovo, di quell'eseguibile, e che il server risponda, e scrive il pid. Se non succede, l'errore indica `logs\server.log`.

- Ferma solo il pid del registro, mai per nome. Con `--exe` diverso dall'app accesa non la tocca. Un server che resta sulla porta senza che l'app lo abbia acceso non si ferma: l'avviso dice che la nuova app lo usa così
  com'è, con il codice del server non ricaricato.
- L'app nuova eredita l'ambiente di chi lancia il comando (`MANGO_ANIMATION_LAVORO`, `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` messi per una prova arrivano all'app), tranne `MANGO_ANIMATION_APP_PID`.
- **Limiti.** Un'app che non ha scritto il registro non si vede: va chiusa a mano (se il secondo avvio viene assorbito dall'istanza unica, il comando lo dice). Dall'interno dell'app, cioè dalla chat, non si può:
  il comando rifiuta quando `MANGO_ANIMATION_APP_PID` è il pid registrato, perché fermerebbe se stesso con l'app; si lancia da un terminale fuori dall'app.
- **Perché un comando del server.** Non è uno strumento MCP, perché l'MCP lanciato dalla chat gira nel Job Object dell'app e morirebbe con lei a metà riavvio; non è un argomento dell'app, perché un figlio dell'app muore con
  il suo Job Object quando l'app si chiude. Il codice è `server/src/riavvia-app.ts` (entrata) e `server/src/riavvio.ts` (logica, con il sistema iniettabile per le prove).

L'icona nasce da `app/icons/sorgente.svg`; per rifarla: `cargo tauri icon icons/sorgente.svg -o <cartella vuota>` da `app/` e si copiano `32x32.png`,
`128x128.png`, `icon.ico` (`icon.png` è la sorgente resa a 1024 px: il comando la dà a 512, va resa a parte); le altre misure che il
comando crea non servono. Cargo non vede il cambio d'icona: prima di `cargo tauri build` si tocca `app/build.rs`, altrimenti l'eseguibile
tiene quella vecchia.

## Installer e aggiornamenti

L'installatore è un NSIS per utente (`installMode: currentUser`: niente amministratore), in italiano e in inglese, che mette l'app in `%LOCALAPPDATA%\Mango Animation\` con il codice del prodotto in `codice\` accanto
all'eseguibile (l'app lo trova da lì: `app/src/radice.rs`). **Non è firmato con un certificato di firma del codice**: al primo avvio Windows mostra «Windows ha protetto il PC»
(SmartScreen); la guida per chi la usa dice di premere «Ulteriori informazioni» e poi «Esegui comunque» (`docs/guida/italiano.md`).

- **Costruirlo**, da `app/` (dopo `bun install` in `studio/` e in `animazioni/`): `bun run installer/costruisci.ts`. È lo stesso comando del workflow delle uscite. Prima lancia `installer/prepara.ts` (costruisce studio e animazioni e mette in
  `target/codice/` il codice da portare: senza `node_modules`, prove e dati; i pacchetti li fa `bun install` al primo avvio, «Il computer pronto»), poi `cargo tauri build --config tauri.installer.conf.json`; se un passo non riesce, si ferma
  con un codice d'uscita diverso da zero. La chiave di firma la cerca da sé, in quest'ordine: le variabili `TAURI_SIGNING_PRIVATE_KEY` (il testo della chiave, non il suo percorso) e `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`; i file
  `mango-animation.key` e `mango-animation.password` in `%USERPROFILE%\.tauri\` («La firma», sotto); nessuna delle due: l'installatore esce lo stesso, senza firma e senza i file degli aggiornamenti. Una chiave trovata senza la sua
  password, o una password che non si apre, ferma la costruzione. Esce `target\release\bundle\nsis\Mango Animation_<versione>_x64-setup.exe` (con la sua `.sig` se c'era la chiave). La versione è `version` di `tauri.conf.json`.
  Costruisce anche `target\release\mango-animation.exe`: se quell'eseguibile è aperto, la costruzione non riesce.
- **Pubblicarlo.** Le uscite ufficiali si fanno solo con le GitHub Actions (`.github/workflows/release.yml`): una costruzione fatta su un computer porta nei file i percorsi di quel computer. Un tag `vX.Y.Z` (o `vX.Y.Z-rc.N`) fa partire
  il workflow: controlla che il tag sia la versione, costruisce e firma con `costruisci.ts`, verifica la firma con la chiave pubblica di `tauri.conf.json` (`installer/verifica-firma-tauri.mjs`), scrive `latest.json`
  (`installer/pubblica.ts --versione <v> --indirizzo <dove sarà scaricabile l'installatore>`: versione, note, firma, indirizzo; nell'indirizzo il nome del file è quello che GitHub gli dà, coi punti al posto degli spazi) e crea l'uscita
  con installatore, `.sig` e `latest.json`. `https://github.com/Federico-Anastasi/mango-animation/releases/latest/download/latest.json` è l'indirizzo che l'app interroga: `plugins.updater.endpoints` in `tauri.conf.json`.
  Senza i segreti della firma il workflow si ferma al primo passo: un'uscita senza firma non si pubblica.
- **Chi fa un fork** ottiene un installatore con `bun run installer/costruisci.ts`, anche senza chiave (esce senza gli aggiornamenti). Per aggiornare chi lo installa serve una chiave propria:
  `cargo tauri signer generate --ci -p <password> -w %USERPROFILE%\.tauri\mango-animation.key` (scrive anche `mango-animation.key.pub`). Poi in `app/tauri.conf.json` si mettono la chiave pubblica (`plugins.updater.pubkey`: il contenuto
  del file `.pub`) e l'indirizzo degli aggiornamenti del proprio repo (`plugins.updater.endpoints`: `https://github.com/<utente>/<repo>/releases/latest/download/latest.json`). Per le uscite dalle Actions, nell'environment `release`
  del proprio repo vanno i segreti `TAURI_SIGNING_PRIVATE_KEY` (il contenuto di `mango-animation.key`) e `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Chi ha già installato l'app originale non riceve gli aggiornamenti del fork: la chiave pubblica è un'altra.
  Le segnalazioni di un fork non devono arrivare al progetto Sentry originale: si costruisce con `MANGO_ANIMATION_SENTRY_DSN=off` (o col DSN di un suo progetto), e in `segnalazione/mod.rs` `NUOVA_ISSUE` punta al proprio repo.
- **Gli aggiornamenti** sono automatici ma con il sì del creator: all'avvio, solo nell'app installata (il suo codice sta in `codice\`: l'eseguibile di chi sviluppa non si aggiorna mai), prima di accendere il server, l'app chiede
  l'indirizzo degli aggiornamenti. Se c'è una versione più nuova la pagina d'attesa dice quale e le sue note e chiede «Aggiorna ora» o «Più tardi»; col sì scarica e installa: l'app scrive l'installatore nella cartella temporanea e lo avvia
  (`/P /UPDATE /R`: passivo, come aggiornamento, riapre l'app) fuori dal suo Job Object (`CREATE_BREAKAWAY_FROM_JOB`, che il Job permette), poi esce. Non con
  `update.install()` del plugin: lancerebbe l'installatore dentro il Job, e `KILL_ON_JOB_CLOSE` lo ucciderebbe appena l'app si chiude. Se l'indirizzo non risponde (niente rete, nessuna uscita ancora) l'avvio prosegue in silenzio e il motivo si scrive in `aggiornamento.log` (`%LOCALAPPDATA%\dev.mango.animation\logs\`).
  **Dopo il sì**, invece, un errore (lo scarico non finisce o la firma non torna, l'installatore non parte, l'app resta aperta) si dice: la pagina «L'aggiornamento non è andato» scrive il motivo in parole semplici e offre
  «Riprova» (cerca di nuovo la versione e rifà il giro) e «Continua con la versione che hai» (lo studio parte con quella installata). Il motivo tecnico dell'updater sta in `aggiornamento.log`.
  Il giro è `aggiornamento::dopo_il_si`, con le parti iniettabili per le prove.
- **I file della versione.** L'installatore sovrascrive e non toglie: un file che la versione nuova non ha più resterebbe in `codice\`, e per le skill e le regole di `.claude\` vorrebbe dire che una skill tolta resta attiva. Per questo `prepara.ts`
  scrive in `codice\` l'elenco della versione (`.mango-elenco.json`: le cartelle e i file di primo livello del prodotto, tutti i file portati, e cosa non è del prodotto), e all'avvio dell'app installata, prima di cercare aggiornamenti
  (`app/src/codice.rs`), si toglie ciò che nelle cartelle del prodotto l'elenco non nomina, con le cartelle rimaste vuote. Non si tocca: `node_modules` e `__pycache__` a qualunque profondità, ciò che l'installatore non porta (le prove,
  `animazioni/foto`), la pagina delle animazioni che il server ricostruisce (`animazioni/dist` e i suoi blocchi), i collegamenti, e tutto ciò che sta fuori dalle cartelle dell'elenco (`.claude/settings.local.json`, la memoria di Claude Code).
  L'impronta dell'elenco applicato sta in `%LOCALAPPDATA%\dev.mango.animation\codice-in-ordine`: con lo stesso elenco non si guarda più; un file che non si riesce a togliere (aperto da un programma) si dice in `codice.log`, gli altri
  si tolgono lo stesso e si riprova al prossimo avvio. Non si usa un passo dell'installatore perché non si può provare senza installare, non sa dire se un file è rimasto, e perde i pacchetti se si interrompe a metà. Resta fuori solo un file
  o una cartella di primo livello tolti dalla lista `DA_PORTARE`, che l'elenco non nomina più.
- **La firma** è quella dell'updater di Tauri, non un certificato a pagamento: l'app controlla il pacchetto con la chiave pubblica scritta in `tauri.conf.json` (`plugins.updater.pubkey`) e rifiuta ciò che non è firmato
  con la chiave privata corrispondente. La chiave privata si tiene fuori dal repo (di base in `%USERPROFILE%\.tauri\mango-animation.key`), protetta da una password: chi la perde non può più aggiornare chi ha già installato, e chi la
  ruba firma aggiornamenti per tutti. La password può stare accanto, in `mango-animation.password`, cifrata da Windows per l'utente che l'ha scritta (DPAPI: con un altro utente o su un altro computer non si apre); `costruisci.ts` la apre da sé con PowerShell.
  Una copia della chiave e della password va tenuta anche fuori dal computer che costruisce (un gestore di password). Se la si rifà, si riscrive la `pubkey` prima di pubblicare.
- **Le prove degli aggiornamenti** (`tests/aggiornamento.rs`, `cargo test --test aggiornamento`) non installano niente: un server di aggiornamenti finto serve `latest.json` e il pacchetto, e l'app finta di Tauri
  (con il manifesto dei controlli di Windows in `prove/test.manifest`, che `build.rs` aggiunge ai soli programmi di prova di `tests/`) chiede, confronta e scarica con l'updater vero. Provano: versione più nuova (anche
  0.10.0 contro 0.9.0), uguale e più vecchia (non si propone), manifesto senza questo sistema e indirizzo che non risponde (errore), pacchetto con firma giusta (si scarica, con l'avanzamento), alterato, firmato con un'altra chiave
  o senza firma (rifiutato, non si installa). Il pacchetto di prova e la sua firma sono in `prove/aggiornamento/` (firmati con una chiave di prova; la chiave privata non è nel repo). Provano anche la configurazione:
  chiave pubblica valida, aggiornamenti solo da https, installatore per utente con il codice in `codice\`, e l'errore dopo il sì (un pacchetto rifiutato porta alla pagina d'errore e al registro). Il giro dell'errore (riprova,
  continua, controllo che non riesce più) è provato in `src/aggiornamento.rs`; la pagina in `prove/pagina.test.ts` (`bun test` da `app/prove/`, con un finto documento); i file vecchi in `src/codice.rs` (cartelle vere, anche un file
  aperto da un altro programma); l'elenco in `installer/prepara.test.ts`; la scelta della chiave di firma in `installer/costruisci.test.ts`; i pacchetti in `src/computer/piano.rs` e `installa.rs`.
- **Cosa si prova solo installando** (l'installatore chiude ogni istanza aperta di `mango-animation.exe`, quindi non si fa mentre l'app sta lavorando): che l'installatore parta e metta i file, che l'app installata proponga la versione nuova,
  che l'installatore avviato fuori dal Job sopravviva all'app che si chiude e la riapra (sotto `cargo test` non si prova: cargo tiene le prove in un suo Job che non lascia uscire). Passi: costruire due installatori (versioni 0.1.0 e 0.1.1) con identificatore e nome di prova, la chiave di prova e un `latest.json` servito da `http://127.0.0.1:<porta>/`
  (`installer/pubblica.ts` per il `latest.json`, e `dangerousInsecureTransportProtocol` solo nel config di prova), in una cartella di destinazione a parte (`CARGO_TARGET_DIR`); installare la 0.1.0, aprirla con
  `MANGO_ANIMATION_UPDATE_URL=http://127.0.0.1:<porta>/latest.json` (l'indirizzo che l'app interroga al posto di quello di `tauri.conf.json`; si accetta solo su `127.0.0.1` o `localhost`, un altro è un errore scritto in
  `aggiornamento.log` e il controllo non si fa; un indirizzo http funziona solo in una costruzione col config di prova), premere «Aggiorna ora». Il contenuto di un
  installatore si controlla senza lanciarlo: `target\release\nsis\x64\installer.nsi` elenca i file che mette.

## Come si prova

Le prove `cargo test` (radice, decisione sul server, supervisore e Job Object, porta, riaccensione del server ucciso con un finto server) non aprono finestre. Per
vedere la finestra vera non si simulano tastiera e mouse a livello di Windows: l'input finirebbe nella finestra che l'utente ha in primo piano in quel momento. Si usa il debug
remoto di WebView2, che arriva solo alla pagina dell'app anche a finestra in sottofondo:

    $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9333"  # una porta libera, solo per la prova
    Start-Process app\target\release\mango-animation.exe

poi, da `studio/` (per trovare `playwright-core` già installato lì):

    const { chromium } = require("playwright-core")
    const browser = await chromium.connectOverCDP("http://127.0.0.1:9333")
    const page = browser.contexts()[0].pages()[0]   // la pagina vera dentro l'app
    // page.click(…), page.keyboard.type(…), page.screenshot(…), …

La finestra intera (con la barra del titolo, non solo la pagina) si fotografa come fa la segnalazione (`app/src/segnalazione/schermata.rs`), dalla finestra del processo avviato.
La chiusura si prova chiedendola a quella finestra, mai fermando un processo per nome: solo per il PID di ciò che si è avviato.

## Dove sta cosa

| | |
|---|---|
| `app/src/lib.rs` | la finestra, l'avvio, la navigazione verso lo studio |
| `app/src/istanza.rs` | il registro dell'app in esecuzione (`app.json`) e la variabile col suo pid per il server |
| `app/src/radice.rs`, `server.rs` | dove sta il codice; il server già acceso o da accendere, e il comando che lo accende |
| `app/src/lavoro.rs` | la cartella di lavoro: la variabile, la scelta ricordata, la cartella predefinita in Documenti, il dialogo di sistema |
| `app/src/dati.rs` | la cartella dei dati vista dallo studio: leggerla e cambiarla (un plugin, come la dettatura) |
| `app/src/supervisor.rs` | i processi avviati, il Job Object, i log |
| `app/src/lingua.rs` | la lingua delle pagine dell'app: come si sceglie, la scelta ricordata, `t(it, en)`, il ponte con cui lo studio dice la sua (un plugin) |
| `app/src/titolo.rs` | il colore della barra del titolo (un plugin: lo studio è una pagina remota) |
| `app/src/claude.rs` | il Claude Code del creator: dove sta, versione e account, l'accesso |
| `app/src/codice.rs` | `codice\` dopo un aggiornamento: toglie i file che la versione nuova non ha più (l'elenco di `prepara.ts`) |
| `app/src/preparazione.rs` | i passi dell'avvio che aspettano il creator, e le sue risposte dalla pagina d'attesa |
| `app/src/computer/` | il computer pronto: cosa c'è (`hw.rs`), il manifesto di ciò che si scarica, il piano (`piano.rs`), lo scarico con verifica (`scarica.rs`), gli installatori (`installa.rs`), il profilo (`profilo.rs`), il ponte per lo studio (`ponte.rs`) |
| `app/src/segnalazione/` | «Segnala un problema» e `ui.log`: l'evento per Sentry, l'anonimizzazione, la schermata, il ponte per le pagine (un plugin) |
| `app/src/appunti.rs` | i file copiati in Esplora risorse, per la chat (un plugin, come la dettatura) |
| `app/src/trascinamento.rs` | i file lasciati sulla finestra, con il loro percorso (eventi, niente comandi) |
| `app/src/voce/` | la dettatura: il microfono, il motore locale (`locale.rs`), il ponte verso la pagina (`ponte.js`) e le sue prove (`prove.rs`) |
| `app/ui/`, `app/prove/pagina.test.ts` | la pagina d'attesa e d'errore, locale all'app, e le sue prove |
| `app/tests/linguaggio.rs` | le prove sui sorgenti: ogni frase della pagina e del Rust ha italiano e inglese |

I log (`server.log`, `aggiornamento.log`, `codice.log`) stanno in `%LOCALAPPDATA%\dev.mango.animation\logs\`.
