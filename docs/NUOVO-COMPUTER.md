# Sviluppare su un computer nuovo

Per chi lavora al codice. Chi usa solo l'app installa l'installatore e basta: al primo avvio l'app vede cosa c'è e scarica ciò che manca, con licenza e peso (`docs/guida/italiano.md`, `docs/APP.md` «Il computer pronto»). Qui sta cosa mettere a mano per sviluppare e provare.

## Cosa installare

- **Git**, **Bun**, **Python 3.12** e **ffmpeg** (7.1, nel PATH).
- **Rust** (`rustup`, con gli strumenti C++ di Visual Studio) e `cargo install tauri-cli --version "^2"`, per l'app.
- **Claude Code**, installato e con l'accesso del proprio account: `irm https://claude.ai/install.ps1 | iex`, poi `claude auth login`. Serve alla chat; il server lo riceve in `MANGO_ANIMATION_CLAUDE`.
- **yt-dlp** nel PATH (`pip install yt-dlp`), facoltativo: scarica nel girato un video del web o un suo tratto (`docs/API.md`, `POST /api/grezzo/scarica`). Senza, quella rotta e lo strumento `girato_scarica` rispondono che manca; il resto funziona. Il server lo cerca all'avvio: dopo averlo installato si riavvia.
- **Pacchetti Python** (le versioni provate): `torch` 2.6.0, `torchaudio` 2.6.0 e `torchvision` 0.21.0 per CUDA 12.4 (dall'indice `https://download.pytorch.org/whl/cu124`; senza scheda NVIDIA, quelli per il processore), `faster-whisper` 1.1.0, `huggingface_hub` 1.24.0 (sotto la 2.0, che `transformers` non accetta), `requests` 2.34.2, `numpy` 2.4.3, `Pillow` 12.1.1, `pillow-heif` 1.8.1, `jsonschema` 4.26.0, `transformers` 5.14.1, `opencv-python-headless` 5.0.0.93, `soundfile`, `pytest`, `playwright` 1.62.0. Le versioni fissate dall'app stanno in `app/src/computer/piano.rs`. Solo `yt-dlp` resta all'ultima, di proposito: i siti cambiano e una versione fissata smette di scaricare.
- **Pacchetti dei tre progetti**: `bun install` in `animazioni/`, `server/` e `studio/`, poi `bunx playwright install chromium` in `animazioni/`.
- **Modelli**: trascrizione, allineamento, scontorno (SAM2, ViTMatte), persona (RT-DETR, YuNet) e dettatura si scaricano da soli al primo uso nella cache di Hugging Face. La voce pulita usa DeepFilterNet3, un eseguibile solo, in `~/.cache/mango-animation/modelli/deep-filter-0.5.6-x86_64-pc-windows-msvc.exe`, da `https://github.com/Rikorose/DeepFilterNet/releases/tag/v0.5.6`; senza, `monta` si ferma e lo dice (per montare senza, `voce.pulizia.attiva` a `false` nello stile).

## La cartella di lavoro

I dati stanno fuori dal codice, in una cartella a parte (`docs/ARCHITETTURA.md`, «La cartella di lavoro»). Per sviluppare se ne crea una vuota con `archivio/` dentro e la si indica con `MANGO_ANIMATION_LAVORO`. Per portare i propri dati su un computer nuovo si copia lì `archivio/` (video compresi), più `profilo.json`, `stile.json`, `CLAUDE.md` e `.claude/` se ci sono (`docs/PROFILO.md`). I video grandi si collegano, non si copiano.

Il profilo (`docs/PROFILO.md`) dice la macchina: la scheda per i lavori pesanti (`macchina.scheda_video`, l'indice di `nvidia-smi`; `null` per il processore). Senza profilo vale la scheda NVIDIA che c'è, e senza scheda il processore.

## Lanciare

Da PowerShell, dalla cartella del codice:

    $env:MANGO_ANIMATION_LAVORO = "C:\Users\Anna\mango"       # una cartella che esiste, con archivio/ dentro
    bun run --cwd server avvia                      # server e studio costruito: http://127.0.0.1:47431
    bun run --cwd studio build                      # ricostruisce lo studio (studio/dist)
    bun run --cwd studio dev                        # lo studio in sviluppo, con le chiamate girate al server acceso
    python -m motore <comando> <slug>               # il motore (docs/MOTORE.md)
    bun run --cwd animazioni dev                    # le scene nel browser

L'app desktop: `cargo tauri build --no-bundle` dentro `app/`, poi `app/target/release/mango-animation.exe`. Per chiuderla e riaccenderla da un terminale fuori dall'app: `bun run --cwd server riavvia-app [--ferma]`. L'installatore e gli aggiornamenti: `docs/APP.md`; non si provano sul computer di lavoro, perché l'installatore chiude ogni `mango-animation.exe`.

## Le prove

Non usano la scheda video, l'archivio vero né le porte del server. I comandi di Python si lanciano con `CUDA_VISIBLE_DEVICES=` vuoto.

    bun test --cwd server
    bun run --cwd studio test
    bun test --cwd animazioni
    python -m pytest motore/prove -q
    python -m pytest strumenti/prove -q
    cargo test --manifest-path app/Cargo.toml

`python -m strumenti.avvisi_terzi` rifà `AVVISI-DI-TERZI.md` dalle dipendenze di oggi (`strumenti/LEGGIMI.md`).
