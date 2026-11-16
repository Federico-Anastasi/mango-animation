# I consumi del lavoro in chat

Parte di `docs/API.md` (le regole comuni: la chiave, gli errori, la lingua).

## Consumi

Quanto lavoro in chat è andato in ogni video, per motore: `GET /api/consumi` dà `{ pronto, contati, video, senza_video }`.

    { "pronto": true,
      "contati": ["claude-code", "codex"],
      "video": { "<slug>": { "tempo": 7860, "giri": 17,
                             "token": { "scritti": 340000, "riletti": 133000000, "nuovi": 1500000 },
                             "dal": "2026-11-03T08:12:00.000Z", "al": "2026-11-03T11:40:00.000Z",
                             "motori": { "claude-code": { "tempo": 6960, "giri": 14, "giri_con_token": 14, "token": { "scritti": 300000, "riletti": 130000000, "nuovi": 1200000 } },
                                         "codex":       { "tempo": 900,  "giri": 3,  "giri_con_token": 3, "token": { "scritti": 40000, "riletti": 3000000, "nuovi": 300000 } } } } },
      "senza_video": { "tempo": 80400, "giri": 700, "token": { … }, "motori": { … } } }

- **`contati`**: i motori di cui il server legge il lavoro: Claude Code (`claude-code`) sempre, Codex (`codex`) se è fra i motori della chat (`docs/chat/codex.md`). Il lavoro fatto con Mango Code non è contato: i suoi modelli girano sul computer e non costano token a nessuno.
- **`motori`**, in ogni voce di `video` e in `senza_video`: la parte di ogni motore, solo dei motori che hanno lavorato a quella voce. `tempo` e `giri` della voce sono la somma dei motori; `token` somma solo i motori che li dicono. Nella parte di un motore `token` è `null` se di nessuno dei giri di quella voce si sa quanti token ha usato (per Codex, i giri fatti dal terminale o a server spento), e il totale non lo include.
- **`giri_con_token`**, nella parte di un motore: quanti dei suoi `giri` hanno i token saputi; per Claude Code sono tutti, per Codex solo quelli fatti con l'app accesa. Minore di `giri`, il `token` della parte conta solo quei giri.

I conti di Claude Code si ricavano dai file delle sue conversazioni nella cartella di lavoro (`~/.claude/projects/<cartella>/<id>.jsonl` e le sottocartelle dei sottoagenti), da terminale o dalla chat, senza distinguerle. Il server li legge tutti una volta e poi di ogni file solo ciò che si aggiunge, a file fermo da un paio di secondi. Claude Code toglie da sé le conversazioni vecchie (di base dopo 30 giorni, `cleanupPeriodDays`): «da sempre» vuol dire «dalle conversazioni che ci sono ancora».

I conti di Codex si ricavano dai thread che Codex tiene per la cartella di lavoro (`thread/list`, e `thread/read` coi giri), anche quelli aperti dal terminale; un thread aperto da un altro thread non si conta. Il server li legge all'avvio, senza aspettare che Codex risponda per sempre, e poi, quando un giro di Codex finisce nella chat, rilegge il thread di quel giro e quelli il cui `updatedAt` è cambiato. Un Codex spento, non collegato o troppo vecchio lascia i suoi conti com'erano e scrive una riga nel registro del server (`consumi di Codex: …`); i conti di Claude Code non ne risentono.

I token di Codex sono quelli dei giri fatti con l'app accesa: Codex non li dà quando si rilegge un thread, li annuncia solo mentre un giro gira (`thread/tokenUsage/updated`, con `total` del thread e `last` dell'ultima richiesta). Il server segue i giri che ha visto partire (`turn/started`) e di ognuno tiene ciò che il thread aveva usato prima del giro (il `total` della prima notifica meno il suo `last`) e il `total` dell'ultima notifica: i token del giro sono la differenza, così una notifica ripetuta non conta due volte e ciò che è successo prima che il server guardasse non entra. I giri fatti dal terminale, o a server spento, non hanno token. Stanno in `archivio/.chat/codex-consumi.json`, accanto al registro delle conversazioni di Codex, e al riavvio si ritrovano lì; un file che non si legge vale «nessun token saputo» e una riga nel registro del server, e i token di un thread che Codex non ha più si tolgono.

`pronto` è falso finché non sono stati letti i file di Claude Code e i thread di Codex la prima volta (per Codex, finché non risponde o finché l'attesa di venti secondi non scade): i conti di allora sono parziali. Come ogni lettura, la rotta risponde dalla memoria, e quando i conti cambiano arriva l'evento `consumi`.

La regola è la stessa per ogni motore:

- **Giro**: un messaggio del creator (o di un lavoro in sfondo che sveglia il motore) con tutto ciò che il motore fa fino al messaggio dopo. Gli esiti degli strumenti e le note del sistema non aprono un giro; un messaggio senza risposta del motore (un comando, un'interruzione) non conta, e nemmeno un giro di Codex ancora in corso.
- **`tempo`** (secondi): per Claude Code, dal messaggio del creator all'ultima risposta del giro, con l'attesa degli strumenti e di una domanda senza risposta, senza il tempo fra un giro e l'altro (le pause del creator, un lavoro lasciato in sfondo); i sottoagenti non aggiungono tempo. Per Codex, la durata del giro che Codex stesso dà.
- **`token`** di Claude Code, per ogni richiesta una volta sola: `scritti` ciò che Claude ha scritto, `riletti` il contesto già visto che a ogni richiesta viene riletto (da qui il numero grosso), `nuovi` il contesto messo per la prima volta (`input_tokens` più `cache_creation_input_tokens`). Quelli dei sottoagenti si sommano al giro che li ha lanciati. Per Codex, dalle notifiche dell'uso del thread: `scritti` è `outputTokens` (che comprende il ragionamento), `riletti` è `cachedInputTokens` (il contesto riletto dalla cache), `nuovi` è `inputTokens` meno `cachedInputTokens` (il contesto messo per la prima volta; `cacheWriteInputTokens` è già dentro `inputTokens` e non si somma). Il `token` di una voce somma i giri di cui si sanno.
- **A quale video va un giro**, a uno solo (non si divide): il video che le chiamate di strumento del giro hanno toccato più volte; a parità, quello della riga di contesto; se nessuno strumento ne ha toccato uno, quello della riga di contesto che la chat manda col messaggio (`docs/CHAT.md`, `contesto`); altrimenti il giro sta in `senza_video`. Un video si tocca per il percorso `archivio/video/<slug>/…`, per `/api/video/<slug>`, per lo `slug` degli strumenti «video», o come argomento di `python -m motore <comando> <slug>`. Per Claude Code gli strumenti sono le sue chiamate; per Codex il comando di ogni comando di shell, i percorsi di ogni modifica di file e gli argomenti di ogni strumento MCP. Da terminale, per Claude Code, non c'è la riga di contesto.
- **`dal` e `al`**: il primo messaggio e l'ultima risposta dei giri del video, di tutti i motori.
