# Il profilo del creator

Il metodo è uguale per tutti; ciò che è del creator (voce, pubblico, canali, cosa non si dice, il suo computer, il suo stile) sta nella **cartella di lavoro** (`docs/ARCHITETTURA.md`, «La cartella di lavoro»), in cinque posti. Dove il profilo cambia un default del metodo, vince il profilo.

| cosa | dove | chi lo legge |
|---|---|---|
| chi è il creator e dove stanno le sue regole | `CLAUDE.md` | Claude Code, che parte dalla cartella di lavoro |
| le sue regole (voce, struttura dei video, canali, vocabolario) e le sue skill | `.claude/rules/`, `.claude/skills/` | Claude Code, in aggiunta a quelle del prodotto |
| i difetti già visti nei suoi video, con i nomi dei video (facoltativo) | `storia.md` | Claude Code, accanto a `.claude/metodo/problemi-gia-visti.md` |
| i dati che leggono codice e skill | `profilo.json` | motore, server, app, skill |
| lo stile | `stile.json` | motore, animazioni, server, studio |

Le regole e le skill del creator sono prosa: il prodotto non le conosce e non le valida. Il resto di questa pagina riguarda i due file JSON. Lo studio mostra il profilo in Impostazioni › Profilo (`docs/INTERFACCIA.md`): dopo il primo giro il creator vi corregge a mano `creator`, `pubblico`, `canali` e `non_si_dice` (prima, la sezione propone solo il giro), e la chat scrive lo stesso file, quindi ognuno vede ciò che ha scritto l'altro. Il primo giro, con cui Claude li scrive insieme al `CLAUDE.md`, è in `docs/CHAT.md`.

## `profilo.json`

Lo schema è `motore/schemi/profilo.schema.json`. Il file è facoltativo e ogni sezione pure: senza, vale ciò che il computer ha (la scheda NVIDIA che c'è, e senza scheda il processore; il motore lo dice). `versione` è `1`.

    {
      "versione": 1,
      "creator":  { "nome": "Anna", "lingua": "it" },
      "pubblico": { "livello": "non tecnico", "lingua": "it", "testate": ["Il Corriere", "La Repubblica"] },
      "canali": [ { "piattaforma": "tiktok", "nome": "annavideo", "formato": "verticale" } ],
      "non_si_dice": ["parolacce", "il nome del mio datore di lavoro"],
      "fonti_delle_idee": [ { "percorso": "D:\\progetti", "principali": ["esperimento-1"], "esclusi": ["vecchi"] } ],
      "macchina": { "scheda_video": 1, "scheda_registrazione": 0, "profilo_chrome": "C:\\Users\\Anna\\AppData\\Local\\Google\\Chrome\\User Data\\Default", "disco_quasi_pieno": false },
      "motori": { "allineamento": { "attiva": false } }
    }

| sezione | campi | chi la usa |
|---|---|---|
| `creator` | `nome` (obbligatorio), `lingua` (due lettere: la lingua in cui il creator parla e scrive) | skill e regole; Claude risponde in quella lingua |
| `pubblico` | `livello` (per esempio «non tecnico»: decide sigle e numeri a schermo), `lingua`, `testate` (le testate i cui articoli compaiono a schermo; testo o lista) | skill e regole |
| `canali[]` | `piattaforma` (`tiktok`, `instagram`, `youtube`, `x`; obbligatoria), `nome`, `formato` (`verticale` o `orizzontale`) | le regole di una piattaforma valgono solo se è fra i canali; skill e strumenti di lettura del canale |
| `non_si_dice[]` | ciò che il creator non dice nei video: proposte, copioni, didascalie e risposte lo rispettano | skill e regole |
| `fonti_delle_idee[]` | cartelle da cui nascono le proposte: `percorso` (obbligatorio), `principali`, `esclusi` | skill e regole |
| `macchina` | `scheda_video` (l'indice di `nvidia-smi` della scheda per i lavori pesanti; `null` per il processore), `scheda_registrazione` (la scheda che codifica lo schermo registrato; `null` per il processore), `profilo_chrome` (la cartella del profilo di Chrome da cui leggere TikTok), `disco_quasi_pieno` (se è vero, un video grande si collega e non si copia mai: lo legge Claude, non il codice). Non ammette chiavi sconosciute | motore, server, app |
| `motori` | per funzione (`trascrizione`, `allineamento`, `sagoma`, `segui`, `dettatura`, `pulizia_voce`) `attiva` e, dove ha senso, `dove` (`scheda` o `processore`); per la trascrizione anche `modello` e `calcolo`. Non ammette chiavi sconosciute | motore, app; si cambia da Impostazioni › Computer (`docs/MOTORI.md`, `docs/API.md`) |

Una scheda indicata che non c'è, o `dove: "scheda"` senza una scheda utilizzabile, è un errore che dice cosa correggere: il motore non ripiega in silenzio sul processore.

**Un profilo che lo schema non ammette** non ferma il server: il motore lo dice a ogni comando che lo legge, il server lo scrive nel suo terminale e `GET /api/profilo` dice cosa correggere (`docs/API.md`); mentre non passa, lo studio non offre i campi da cambiare e `PUT /api/profilo` risponde `409`. A server acceso il profilo si rilegge quando cambia e, se non passa lo schema, resta l'ultimo valido; all'avvio, senza un profilo valido, il server parte «senza profilo».

## `stile.json`

Il prodotto ha il suo `stile.json` di serie, **neutro** (formato, colori sobri, i due caratteri di `font/` (quelli che il creator aggiunge stanno in `font/` della sua cartella di lavoro e si nominano in `caratteri` con il percorso `font/<file>`; il motore, le animazioni e lo studio cercano il file prima lì e poi nel prodotto), sottotitoli a frasi, quadri per il verticale 9:16, titolo, copertina, voce, suoni, soglie del controllo, misure dei motori). Il creator può averne uno nella cartella di lavoro **con solo ciò che cambia**; lo stile che vale è la somma dei due:

- gli oggetti si fondono chiave per chiave, in profondità;
- ogni altro valore del creator (numero, testo, `true`/`false`, `null`, lista) sostituisce quello di serie, senza fondersi;
- le chiavi che il creator non nomina restano quelle di serie, e una chiave di serie non si toglie.

Esempio: un creator che vuole il titolo più lungo scrive `{ "titolo": { "durata": 4 } }` e tutto il resto del titolo resta com'è. Una soglia nuova del prodotto arriva a tutti senza toccare lo stile di nessuno.

La regola è scritta una volta per linguaggio (`unisci_stile` in `motore/archivio.py`, `unisciStile` in `strumenti/stile.mjs`); la usano motore, strumenti, animazioni e server, che serve lo stile unito su `GET /api/stile` e salva su `PUT /api/stile` solo la differenza. Dallo studio si ritocca in Impostazioni › Stile (`docs/INTERFACCIA.md`). Nel primo giro (`docs/CHAT.md`, «Il primo giro») lo stile del creator lo scrive Claude, partendo dai suoi video o da uno dei tre stili di `stili-di-partenza.json` (che lo studio mostra come cartoline in Impostazioni › Stile). Un video che si discosta dagli standard lo dichiara nel suo piano (`docs/PIANO.md`), non nel codice.
