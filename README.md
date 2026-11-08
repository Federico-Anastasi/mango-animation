# Mango Animation

A Windows app for creators of short vertical videos. You keep your footage in an archive, write the script, record yourself against a rehearsal, and the app edits the video with your cut-out silhouette, animated scenes, subtitles and cover. The work is done by Claude in a chat inside the app, following a step-by-step method (idea, script, rehearsal, recorded text, animations, edit, corrections, release); a studio in the app shows everything and lets you adjust it by hand.

Your footage and the editing stay on your computer; only the chat with Claude goes online. Mango Animation does not ship Claude Code: it uses the one you have already installed, signed in with your own Claude account.

> Mango Animation is an independent project. It is not a product of Anthropic and is not approved or endorsed by Anthropic. "Claude" and "Claude Code" are trademarks of Anthropic and are used here only to name the program the app works with.

## What you need

- **Windows** (tested on Windows 11).
- **Claude Code**, installed and signed in with your Claude account. The chat's work counts against your subscription's limits, which are meant for ordinary, individual use: long jobs queued one after another use them up. If Claude Code is missing, the app guides you through installing it at first start.
- **An NVIDIA video card is recommended, not required.** Transcription, silhouette cut-out and rendering are much faster with one; without it everything still works, only more slowly.
- **Disk space and internet** for the first-start download of programs and models: about 12 GB with an NVIDIA card, about 8 GB without. The app shows the exact figures, and the license of each piece, before downloading.

## Install

1. Download `Mango.Animation_<version>_x64-setup.exe` from the [latest release](https://github.com/Federico-Anastasi/mango-animation/releases/latest). No administrator rights are needed.
2. Windows may show "Windows protected your PC": the installer has no paid code-signing certificate. Click "More info", then "Run anyway". The app's updates carry their own signature, which the app checks.
3. Open Mango Animation and follow the first start. Your data (footage, videos, profile) lives in a folder called `Mango Animation` inside Documents.

The full guide, from installing to releasing a first video: [`docs/guida/english.md`](docs/guida/english.md) (Italian: [`docs/guida/italiano.md`](docs/guida/italiano.md)).

## Good to know

- **Word alignment uses a model licensed for non-commercial use only** (MMS, CC-BY-NC-4.0). If you earn money from your videos, turn it off in the studio's "Engines" page ("Precise cuts on words"); cuts then follow the transcription timing, less precisely. See [`AVVISI-DI-TERZI.md`](AVVISI-DI-TERZI.md).
- Reading TikTok and downloading videos from the web are meant for your own accounts and for content you have the right to use.

## For developers

The code is in Italian (names, comments, documents); the studio and the guide are in Italian and English.

- How it is built: [`docs/ARCHITETTURA.md`](docs/ARCHITETTURA.md). Set-up, launching and tests on a new computer: [`docs/NUOVO-COMPUTER.md`](docs/NUOVO-COMPUTER.md).
- Parts: `motore/` and `strumenti/` (Python: editing engine, cut-out, subtitles, checks), `server/` (Bun), `studio/` (React), `animazioni/` (React and three.js scenes), `app/` (Tauri desktop shell), and the method as rules and skills for Claude Code in `.claude/` (also a Claude Code plugin: see `docs/ARCHITETTURA.md`).

## Security and contributing

To report a vulnerability and to see what the app protects: [`SECURITY.md`](SECURITY.md). To build, test and send a change: [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

AGPL-3.0-or-later (see [`LICENSE`](LICENSE)); what this means, and the third-party files, in [`NOTICE.md`](NOTICE.md). The name and logo
follow [`TRADEMARKS.md`](TRADEMARKS.md). The licenses of everything the product downloads are in [`AVVISI-DI-TERZI.md`](AVVISI-DI-TERZI.md).
