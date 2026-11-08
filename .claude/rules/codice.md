---
paths:
  - "motore/**"
  - "animazioni/**"
  - "server/**"
  - "studio/**"
  - "app/**"
  - "strumenti/**"
  - "docs/**"
---

# Code

For anyone who changes `motore/`, `animazioni/`, `server/`, `studio/`, `app/`, `strumenti/`, `docs/`. Structure and boundaries: `docs/ARCHITETTURA.md`.

## Developing

- Start the server with `bun run --cwd server avvia`, with `MANGO_ANIMATION_LAVORO` pointing to the working folder
  (`docs/ARCHITETTURA.md`). To restart or stop the desktop app: `bun run --cwd server riavvia-app [--ferma]` from a terminal outside
  the app. The desktop app is in `app/`: `docs/APP.md`. Developing on another computer: `docs/NUOVO-COMPUTER.md`.
- **Keep the documentation clean**: what the product does today, where it is. No history, no plans.

## Principles

- **Verify before declaring**: the command output, the frame looked at, the audio listened to again.
- **First the test that fails, then the code.** A test is never weakened to make it pass.
- **Cause before patch**: after two failed attempts, stop and investigate.
- **No deferred work**: no placeholders, no unwired functions, no dead files.
- **The contract lives in the documents** (`docs/PIANO.md`, `docs/API.md`, `docs/MOTORE.md`, the schemas): whoever changes a shape
  changes the document and the schema at the same moment.

## Comments

Default: none. At most one or two lines on a non-obvious why. Never the what, never the history.

## Boundaries

- No measure, color or threshold in the code of the engine and the animations: they live in `stile.json`.
- The engine writes only to `lavoro/`, `uscite/` and `archivio/preparati/`; `pagina` also to `materiali/` (web captures are not redone identical).
- The server does no synchronous I/O and launches no processes on a read route; state derived from disk has a single owner in
  memory, updated by the watcher.
- No polling, neither in the server nor in the interface.
- The interface talks only to the server; the gestures that change the plan go through `studio/src/montaggio/ritocchi.ts`.
- Tests do not use the video card, the real archive, nor the arrivals port.

## By language

- **TypeScript**: no `any`, no aliased imports or star imports; `const`, early return, functional methods; Bun APIs in the
  server. Typecheck from the package folder.
- **Python**: the `motore` package, launched from the root, no `sys.path`.
- **Interface**: texts in Italian and in English, plain, without jargon; the sentences the server and the engine send to it too (`frase(it, en)`, `Errore(it, en)`, `docs/API.md`, «La lingua delle frasi»); three widths (1400, 1000, 430) with no horizontal scrolling;
  colors only from the tokens; numbers and dates from `src/testo.ts`. Whoever touches a view looks at the screenshots of all of
  them (`studio/verifica/fotografa.mjs`).

## Machine

- Never stop a process by name: only by PID, of what you started.
- To restart or stop the desktop app: `bun run --cwd server riavvia-app [--ferma]` from a terminal outside the app (`docs/APP.md`), not a hand-written PowerShell.
- Video card drivers are not touched.
- One job at a time on the video card.
- A heavy job (cutout, transcription, render) works only on what the edit uses, never on the whole footage when a piece is enough.
- Large videos are linked, not copied; if the profile says the disk is nearly full (`macchina.disco_quasi_pieno`), that is a hard limit.
