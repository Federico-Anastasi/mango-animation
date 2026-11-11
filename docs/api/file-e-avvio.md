# I file serviti e l'avvio del server

Parte di `docs/API.md` (le regole comuni: la chiave, gli errori, la lingua).

## File

`GET /media/<percorso relativo all'archivio>` serve un file con `Range` (206, `Content-Range`,
`Accept-Ranges`; 416 oltre la fine; un intervallo oltre 4 MB si accorcia a 4 MB, e il `Content-Range` lo dice), il tipo dal nome
del file, solo dentro l'archivio. Il file resta aperto solo mentre si legge un pezzo, mai mentre si spedisce: su Windows un file
aperto non si sostituisce, e un montaggio deve poter riscrivere il video che lo studio sta mostrando. Percorsi assoluti,
`..`, `\` e `:` sono 400. Non si servono (404, maiuscole o no) `arrivi/` (chiavi, sessioni, registro) e le cartelle nascoste
(`.chat/` con lo stato della chat, `.git/`), tranne gli allegati della chat in `.chat/allegati/`: passano anche dallo studio sulla rete. `GET /font/…` i caratteri, con le stesse regole: prima quelli di `font/` della cartella di lavoro, poi quelli del prodotto. Ogni altra rotta serve
`studio/dist` (con `index.html` per le rotte dell'interfaccia); se `studio/dist` non c'è, una pagina in
italiano dice di costruirlo con `bun run --cwd studio build`.

| rotta | cosa fa |
|---|---|
| `POST /api/apri` | `{ percorso }` relativo all'archivio (un file o una cartella) → lo mostra in Esplora file; 400 fuori dall'archivio. Con `dove: "browser"` mostra invece una pagina o un file allo studio: se il server l'ha acceso l'app (`MANGO_ANIMATION_APP_PID`) e uno studio è collegato, manda l'evento `vai` e la finestra dell'app cambia pagina (evento `vai`, `docs/api/eventi.md`; i file di `grezzo/` e `video/` ce l'hanno; gli altri e il caso senza studio aprono il browser); altrimenti apre il browser di sistema, già dentro (passando da `/entra`, la chiave non esce dal server): `{ dove: "browser", video: "<slug>", scheda? }` la pagina di un video, `{ dove: "browser", percorso }` un file (non una cartella) servito da `/media/` → `{ ok, aperto }`; 404 se il video o il file non c'è |

## Avvio e chiusura

`bun run avvia` (nella cartella `server/`; in un terminale scrive il link che apre lo studio con la chiave, e `--apri` lo apre nel browser). Si chiude con Ctrl+C, con
Ctrl+Interr o chiudendo la console: ferma il lavoro del motore in corso per PID insieme ai suoi figli, chiude
le porte e i flussi degli eventi. Se il processo viene ucciso a forza (Gestione attività, `taskkill /F`) Windows spegne con lui il lavoro in corso
e tutto ciò che questo ha lanciato: all'avvio il server entra in un Job Object che si chiude con lui (`server/src/figli.ts`).
Se Windows lo rifiuta il server parte lo stesso e lo dice nel terminale.
