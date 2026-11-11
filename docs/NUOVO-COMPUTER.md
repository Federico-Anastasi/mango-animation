# Sviluppare su un computer nuovo

Per chi lavora al codice. Chi usa solo l'app installa l'installatore e basta: al primo avvio l'app vede cosa c'è e scarica ciò che manca, con licenza e peso (`docs/guida/italiano.md`, `docs/app/computer-pronto.md`). Qui sta cosa mettere a mano per sviluppare e provare.

## Cosa installare

- **Git**, **Bun**, **Python 3.12** e **ffmpeg** (7.1, nel PATH).
- **Rust** (`rustup`, con gli strumenti C++ di Visual Studio) e `cargo install tauri-cli --version "^2"`, per l'app.
- **Claude Code**, installato e con l'accesso del proprio account (comandi e dove l'app lo cerca: `docs/app/claude-code.md`). Serve alla chat; il server lo riceve in `MANGO_ANIMATION_CLAUDE`.
- **yt-dlp** nel PATH (`pip install yt-dlp`), facoltativo e solo senza l'app, che lo installa da sola con i suoi pacchetti Python: scarica nel girato un video del web o un suo tratto (`docs/api/girato.md`, `POST /api/grezzo/scarica`). Senza, quella rotta e lo strumento `girato_scarica` rispondono che manca; il resto funziona. Il server lo cerca all'avvio: dopo averlo installato si riavvia.
- **Pacchetti Python**: gli stessi che l'app installa da sola, con le versioni provate, sono elencati per funzione accesa in `app/src/computer/piano.rs`. `strumenti/leggi_tiktok.py` pilota il Chrome del creator con `playwright`, che non scarica un browser. Solo `yt-dlp` resta all'ultima versione, di proposito: i siti cambiano e una versione fissata smette di scaricare. L'app non installa `pytest` (le prove): si aggiunge a mano.
- **Pacchetti dei tre progetti**: `bun install` in `animazioni/`, `server/` e `studio/`, poi `bunx playwright install chromium` in `animazioni/`.
- **Modelli**: trascrizione, allineamento, scontorno (SAM2, ViTMatte), persona (RT-DETR, YuNet) e dettatura si scaricano da soli al primo uso nella cache di Hugging Face. La voce pulita usa DeepFilterNet3, un eseguibile solo che sta in `~/.cache/mango-animation/modelli/` (nome e fonte in `app/src/computer/manifesto.json`); senza, `monta` si ferma e lo dice (per montare senza, `voce.pulizia.attiva` a `false` nello stile).

## La cartella di lavoro

I dati stanno fuori dal codice, in una cartella a parte (`docs/ARCHITETTURA.md`, «La cartella di lavoro»). Per sviluppare se ne crea una vuota con `archivio/` dentro e la si indica con `MANGO_ANIMATION_LAVORO`. Per portare i propri dati su un computer nuovo si copia lì `archivio/` (video compresi), più `profilo.json`, `stile.json`, `CLAUDE.md` e `.claude/` se ci sono (`docs/PROFILO.md`). I video grandi si collegano, non si copiano.

La macchina (quale scheda per i lavori pesanti) la dice il profilo: `docs/PROFILO.md`.

## Lanciare

Da PowerShell, dalla cartella del codice, si indica la cartella di lavoro e si lancia ciò che serve:

    $env:MANGO_ANIMATION_LAVORO = "C:\Users\Anna\mango"       # una cartella che esiste, con archivio/ dentro

I comandi (server, studio, motore, animazioni) sono in `docs/ARCHITETTURA.md`, «Comandi»; le variabili in `docs/VARIABILI.md`; l'app desktop, riavviarla e provarla in `docs/app/costruire.md`. L'installatore e gli aggiornamenti (`docs/app/installer.md`) non si provano sul computer di lavoro, perché l'installatore chiude ogni `mango-animation.exe`.

## Le prove

I comandi sono in `CONTRIBUTING.md`; non usano la scheda video, l'archivio vero né le porte del server.

`python -m strumenti.avvisi_terzi` rifà `AVVISI-DI-TERZI.md` dalle dipendenze di oggi (`strumenti/LEGGIMI.md`).
