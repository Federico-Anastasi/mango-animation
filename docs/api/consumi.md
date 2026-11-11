# I consumi di Claude

Parte di `docs/API.md` (le regole comuni: la chiave, gli errori, la lingua).

## Consumi

Quanto lavoro di Claude è andato in ogni video: `GET /api/consumi` dà `{ pronto, video, senza_video }`.

    { "pronto": true,
      "video": { "<slug>": { "tempo": 7860, "giri": 17,
                             "token": { "scritti": 300000, "riletti": 130000000, "nuovi": 1200000 },
                             "dal": "2026-11-03T08:12:00.000Z", "al": "2026-11-03T11:40:00.000Z" } },
      "senza_video": { "tempo": 80400, "giri": 700, "token": { … } } }

I conti si ricavano dai file delle conversazioni di Claude Code della cartella di lavoro (`~/.claude/projects/<cartella>/<id>.jsonl` e le sottocartelle dei sottoagenti), da terminale o dalla chat, senza distinguerle; quelle di Mango Code non si leggono (i suoi modelli girano sul computer e non costano token a Claude). Il server li legge tutti una volta (`pronto` è falso finché non ha finito: i conti di allora sono parziali) e poi di ogni file solo ciò che si aggiunge, a file fermo da un paio di secondi; come ogni lettura, la rotta risponde dalla memoria, e quando i conti cambiano arriva l'evento `consumi`. Claude Code toglie da sé le conversazioni vecchie (di base dopo 30 giorni, `cleanupPeriodDays`): «da sempre» vuol dire «dalle conversazioni che ci sono ancora».

- **Giro**: un messaggio del creator (o di un lavoro in sfondo che sveglia Claude) con tutto ciò che Claude fa fino al messaggio dopo. Gli esiti degli strumenti e le note del sistema non aprono un giro; un messaggio senza risposta di Claude (un comando, un'interruzione) non conta.
- **`tempo`** (secondi): dal messaggio del creator all'ultima risposta di Claude del giro, con l'attesa degli strumenti e di una domanda senza risposta, senza il tempo fra un giro e l'altro (le pause del creator, un lavoro lasciato in sfondo). I sottoagenti non aggiungono tempo.
- **`token`**, per ogni richiesta a Claude una volta sola: `scritti` ciò che Claude ha scritto, `riletti` il contesto già visto che a ogni richiesta viene riletto (da qui il numero grosso), `nuovi` il contesto messo per la prima volta (`input_tokens` più `cache_creation_input_tokens`). Quelli dei sottoagenti si sommano al giro che li ha lanciati.
- **A quale video va un giro**, a uno solo (non si divide): il video che le chiamate di strumento del giro hanno toccato più volte (per il percorso `archivio/video/<slug>/…`, `/api/video/<slug>`, `slug` degli strumenti «video», o argomento di `python -m motore <comando> <slug>`; a parità, quello della riga di contesto); se nessuno strumento ne ha toccato uno, quello della riga di contesto che la chat manda col messaggio (`docs/CHAT.md`, `contesto`); altrimenti il giro sta in `senza_video`. Da terminale c'è solo il primo criterio.
- **`dal` e `al`**: il primo messaggio e l'ultima risposta dei giri del video.
