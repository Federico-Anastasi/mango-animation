# Mango Animation

Il banco di montaggio dei video verticali: un motore che monta (Python), un server locale (Bun), lo studio nel
browser (React), le animazioni (React e three.js), l'app desktop (Tauri) e il metodo per fare i video, scritto
come regole e skill per Claude Code. Gira su Windows e usa il Claude Code che hai già installato, con il tuo account. Licenza AGPL-3.0-or-later. English: [`README.md`](README.md).

**Per chi usa l'app** (installare, primo avvio, primo video): [`docs/guida/italiano.md`](docs/guida/italiano.md). English: [`docs/guida/english.md`](docs/guida/english.md).

## Cosa contiene

- `motore/`, `strumenti/`: montaggio, scontorno, sottotitoli, controlli; schemi in `motore/schemi/`.
- `server/`, `studio/`, `animazioni/`: server, interfaccia, scene animate.
- `app/`: la finestra desktop.
- `stile.json`, `font/`: lo stile di serie e i caratteri. Il creator ha il suo `stile.json` nella cartella di lavoro, che si sovrappone chiave per chiave.
- `.claude/rules/`, `.claude/skills/`: il metodo (processo, montaggio, controlli). `.claude-plugin/` e `plugin/` lo rendono un plugin di Claude Code (`docs/ARCHITETTURA.md`, «Come il metodo arriva a Claude»). Le regole e le skill del creator stanno nella sua cartella di lavoro.
- `docs/PROFILO.md`: cosa è del creator (`profilo.json`, `stile.json`, le sue regole) e come si somma al metodo.
- `SECURITY.md` (come segnalare un problema di sicurezza e cosa l'app protegge) e `CONTRIBUTING.md` (come contribuire: costruire, provare, aprire issue e pull request).
- `LICENSE` (AGPL-3.0-or-later), `NOTICE.md` (cosa vuol dire, il permesso aggiuntivo per Claude Code, i file di terzi nel repo), `TRADEMARKS.md`
  (nome e logo) e `AVVISI-DI-TERZI.md` (le licenze di tutto ciò che il prodotto scarica; si rifà con `python -m strumenti.avvisi_terzi`).
- `docs/`: come è fatto (`ARCHITETTURA.md`), il contratto di piano (`PIANO.md`), motore (`MOTORE.md`, `MOTORI.md`) e API (`API.md`), l'archivio (`ARCHIVIO.md`),
  l'app (`APP.md`), la chat (`CHAT.md`), lo studio (`INTERFACCIA.md`), la guida per chi la usa (`guida/`) e `NUOVO-COMPUTER.md` per chi sviluppa.

## I dati stanno fuori

Qui non ci sono video, archivio né profili: `archivio/` è ignorato da git.
I dati vivono in una **cartella di lavoro** a parte, che si indica con la variabile `MANGO_ANIMATION_LAVORO` (l'app la crea da sola in `Documenti\Mango Animation` al primo avvio e la passa
a server e motore; la variabile la forza). Dentro c'è `archivio/`, e può esserci `profilo.json` (il creator e la sua macchina: schede video, profilo di Chrome) e `stile.json`. Lanciati a mano, senza la variabile il server, il motore e gli strumenti non partono e lo dicono. Com'è fatta e come ci arriva
il metodo: `docs/ARCHITETTURA.md`, «La cartella di lavoro».

    $env:MANGO_ANIMATION_LAVORO = "C:\Users\Anna\mango"      # una cartella che esiste, con archivio/ dentro
    bun run --cwd server avvia                     # il server (dalla cartella del codice)
    python -m motore valida <slug>                 # il motore (dalla cartella del codice)

## Le prove

Dopo `bun install` in `server/`, `studio/` e `animazioni/`:

- `cd server && bun test`
- `cd studio && bunx vitest run`
- `cd animazioni && bun test`
- dalla radice: `python -m pytest motore/prove -q` e `python -m pytest strumenti/prove -q`
- `cd app && cargo test`

Le prove non usano la scheda video, l'archivio vero né le porte del server: i comandi di Python si lanciano con `CUDA_VISIBLE_DEVICES=` vuoto.

## Marchi

Mango Animation è un progetto indipendente: non è un prodotto di Anthropic né è approvato o sostenuto da Anthropic. «Claude» e «Claude Code» sono marchi di Anthropic e qui servono solo a nominare il programma che l'app usa. L'app non porta Claude Code con sé: usa quello che hai installato tu.
