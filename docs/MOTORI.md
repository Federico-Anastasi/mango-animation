# I motori

Le funzioni pesanti del prodotto (trascrizione, allineamento, sagoma, ...) usano modelli grandi che girano sulla scheda video o sul processore. Ognuna ha un interruttore e un «dove» nella sezione `motori` del profilo
(`profilo.json`, `docs/PROFILO.md`); la sezione Computer delle impostazioni dello studio li cambia (`docs/INTERFACCIA.md`, `docs/API.md`), e l'app scarica solo ciò che le funzioni accese richiedono (`docs/APP.md`, «Il computer pronto»).

## 1. Le funzioni

| funzione (`motori.<funzione>`) | cosa fa | modello | peso del modello | chi la usa | spenta |
|---|---|---|---|---|---|
| `trascrizione` | le parole coi tempi | faster-whisper (CTranslate2): `large-v3` (di serie), `large-v3-turbo` o `small` | 3,1 GB, 1,6 GB, 0,5 GB | `prepara` (ogni sorgente con audio → `parole.json`), `controlla` (riascolta il montato) | `prepara` non scrive `parole.json`; un video che ha bisogno delle parole (tagli a parole, sottotitoli) si ferma e dice di accenderla; `controlla` salta il riascolto e lo segna in `spente` |
| `allineamento` | i confini veri delle parole nell'audio | MMS_FA (torchaudio), CC-BY-NC-4.0: **non commerciale** | 1,3 GB | `risolvi` e `monta` (pezzi scelti a parole, `allineate.json`), `controlla` (parole ritrovate) | i bordi dei pezzi si cercano sul livello della voce, con i tempi della trascrizione come punto di partenza; `controlla` non misura le parole fuori posto (`spente`) |
| `sagoma` | lo scontorno della persona | SAM 2.1 (base+) + ViTMatte-small + RT-DETR (primo riquadro), tutti Apache-2.0 | 324 + 103 + 81 MB, più PyTorch | `monta` e `anteprima` (i tratti in sagoma), `copertina`, sticker e oggetti scontornati (`strumenti/`) | i pezzi di sagoma già fatti si usano; uno scontorno nuovo non parte e la frase dice di accenderla o di scegliere un quadro senza sagoma |
| `segui` | dove sta la persona nelle viste che la seguono (`persona.json`) | YuNet (MIT) su OpenCV | 0,2 MB | `prepara`, per le viste `segui` | la misura di una vista che segue non parte e la frase lo dice |
| `pulizia_voce` | toglie il rumore dalla voce montata | DeepFilterNet3 (MIT o Apache-2.0), un eseguibile sul processore | 27 MB | `monta`, `anteprima` | resta il rumore di fondo; prende il posto di `voce.pulizia.attiva` dello stile |
| `dettatura` | il microfono nella chat | faster-whisper: `large-v3-turbo` sulla scheda, `small` sul processore (`stile.json`, `dettatura.dispositivi`) | 1,6 GB, 0,5 GB | l'app (`python -m motore detta`, `docs/APP.md`) | si scrive a mano |

PyTorch (e con lui `transformers` e OpenCV) serve a `allineamento` e `sagoma`: finché una delle due è accesa si scarica; la scheda NVIDIA lo vuole in versione CUDA (circa 4,7 GB), il processore in versione leggera (circa 0,9 GB).
`trascrizione`, `segui` e `pulizia_voce` non ne hanno bisogno.

Sulla scheda NVIDIA la trascrizione (e la dettatura) hanno bisogno della cublas di CUDA 12, che Windows non ha se CUDA non è installato a parte. La porta PyTorch per CUDA; dove PyTorch non c'è (`allineamento` e `sagoma` spente) l'app installa il pacchetto `nvidia-cublas-cu12` (circa 380 MB). Il motore la carica per percorso prima di `faster-whisper` (`librerie_cuda` in `motore/dispositivo.py`) e, sulla scheda, prova il modello con mezzo secondo di silenzio prima di dire «pronto»: una libreria che manca è un errore chiaro al caricamento, non una frase persa alla prima parola.

Le animazioni non sono una funzione del profilo: si rendono con Playwright e il suo Chromium (circa 0,7 GB), che l'app scarica se Playwright non ne ha uno. La copertina non ha un motore suo: segue la sagoma.

I modelli non si distribuiscono con l'app: si scaricano dalla loro fonte, ognuno con la sua licenza (`app/src/computer/manifesto.json`).

## 2. Dove gira una funzione

`dove` è `scheda` o `processore`. Le funzioni che usano un modello su scheda sono `trascrizione`, `allineamento`, `sagoma` e `dettatura`; `segui` e `pulizia_voce` girano sempre sul processore.

- **`dove: "processore"`** non guarda la scheda.
- **`dove: "scheda"`** usa la scheda NVIDIA indicata da `macchina.scheda_video` del profilo (senza indicazione, la prima che c'è). Senza una scheda che il motore possa usare, o con `macchina.scheda_video: null`, è un errore che dice cosa correggere: mai un ripiego silenzioso sul processore.
- **Senza `dove`**: la scheda di `macchina.scheda_video`; se non c'è la scheda NVIDIA che c'è; se non c'è nessuna scheda, o il profilo la esclude con `null`, il processore, e lo dice su stderr.

La scheda deve essere NVIDIA con capacità di calcolo 5.0 o più (i pacchetti di PyTorch non coprono le più vecchie). Un `calcolo` che la scheda non sa fare, o un modello che non si scarica, è un errore che nomina la funzione e la chiave del profilo da cambiare.
Il motore legge `motori` una volta per processo (`motore/profilo.py`), e una funzione spenta non importa i suoi pacchetti.

La sezione Computer dice, per ogni scelta, se questo computer la regge (`studio/src/motori/computer.ts`). Sulla scheda:

| controllo | esito |
|---|---|
| nessuna scheda NVIDIA, scheda esclusa da `macchina.scheda_video: null`, indice del profilo che non c'è, capacità di calcolo sotto 5.0 | non si può scegliere |
| memoria libera sotto 2 GB (`trascrizione`, `allineamento`, `dettatura`) o 6 GB (`sagoma`) | avviso: se un altro programma occupa la scheda il lavoro si ferma |
| `sagoma` su capacità di calcolo sotto 7.0 | avviso: non provata |

E sul processore: `sagoma` con meno di 8 thread è lenta (avviso), e con meno di 4 GB di RAM i modelli grandi di `trascrizione`, `allineamento` e `dettatura` non ci stanno (avviso: resta quello piccolo, meno preciso).

## 3. Come l'app sceglie e scarica

All'avvio, se il server lo accende l'app, legge il computer, calcola il piano di ciò che le funzioni accese richiedono, lo mostra con lo spazio che serve e lo scarica (`docs/APP.md`, «Il computer pronto»). Cambiare una funzione nella pagina «Motori» riscrive `motori.<funzione>.attiva` nel profilo, lasciando il resto com'è, e ciò che si accende lo scarica l'app al prossimo avvio. Lo studio vede il computer attraverso il ponte `window.__MANGO_ANIMATION__.computer.leggi()` (`app/src/computer/ponte.rs`); nel browser senza l'app il ponte non c'è e la pagina non può dire se una scelta è possibile.

## 4. La sezione `motori` del profilo

Sta in `profilo.json`, nella cartella di lavoro, accanto a `macchina` (che dice gli indici delle schede e il disco). Lo schema (`motore/schemi/profilo.schema.json`) non ammette chiavi sconosciute.

    "motori": {
      "trascrizione": { "attiva": true, "dove": "scheda", "modello": "large-v3-turbo", "calcolo": "int8" },
      "allineamento": { "attiva": true, "dove": "processore" },
      "sagoma":       { "attiva": true, "dove": "processore" },
      "segui":        { "attiva": false },
      "pulizia_voce": { "attiva": true },
      "dettatura":    { "attiva": false }
    }

| funzione | chiavi |
|---|---|
| `trascrizione` | `attiva`, `dove`, `modello` (`large-v3`, `large-v3-turbo`, `small`), `calcolo` (`float16`, `int8_float16`, `int8`, `float32`): prendono il posto di `preparati.modello_trascrizione` e `preparati.calcolo_trascrizione` dello stile |
| `allineamento`, `sagoma`, `dettatura` | `attiva`, `dove` |
| `segui` | `attiva` (`dove` si può scrivere, ma il motore non lo legge: gira sempre sul processore) |
| `pulizia_voce` | `attiva` |

`attiva` senza indicazione è vero; `dove` senza indicazione segue la regola di §2. La sezione Computer scrive `attiva` e `dove`; `modello` e `calcolo` si scrivono a mano nel profilo. Il calcolo `float16` non lo sanno fare le schede NVIDIA più vecchie (famiglia Pascal, GTX 10xx): per quelle `calcolo` va messo a `int8`.

Il profilo dice **quale motore** e dove; **come lavora** (soglie, parametri dei modelli) resta in `stile.json` (`preparati`, `dettatura`, `sagoma.scontorno`).
Il server legge e scrive la sezione per intero (`GET` e `PUT /api/motori`, `server/src/motori.ts`) dopo averla fatta passare dallo schema; il motore e gli strumenti rileggono il file a ogni comando.

## 5. Cambiare motore a lavori già fatti

I file che un motore ha scritto restano com'erano: `parole.json` con le parole di allora, `sagoma/` con i pezzi già scontornati. `allineate.json` ha l'impronta delle parole (se le parole cambiano si rifà da sé) e la voce pulita ha quella dei tratti e della pulizia.
Per rifare una trascrizione con un modello nuovo si toglie `parole.json` dai preparati della sorgente; per rifare una sagoma si toglie la cartella `sagoma` e `sagoma.json` (`docs/MOTORE.md`).
