# La chat

Nell'app (e nello studio, nel browser) il creator parla in una chat vera, accanto alle viste dei video, con un **motore**: Claude Code, Codex o Mango Code (il server ne conosce una lista, `GET /api/chat/motori`). Ognuno è il programma che il creator ha già, con il suo accesso, e riceve lo stesso metodo: `CLAUDE.md`, le regole di
`.claude/rules/`, le skill di `.claude/skills/`, gli strumenti MCP «video», la shell, la lettura e scrittura dei file. Ciò che un motore sa fare in più o in meno (i sottoagenti, i livelli di effort,
i lavori in background, le immagini negli esiti degli strumenti) sono le sue capacità, e lo studio offre solo quelle che ha. Cambia solo il
davanti rispetto al terminale: una conversazione con immagini, bottoni e lavori che si vedono.

Il documento è diviso per argomento in `docs/chat/`; ogni sezione qui sotto dice dove sta.

## Com'è fatta

I motori e il contratto fra la chat e un motore, l'Agent SDK di Claude Code (un `query` per conversazione), i file di `server/src/chat/`, il nome e il segno della chat. → `docs/chat/sessione.md`

## API

Le rotte `/api/chat` (anche `motori` e `domande`), gli errori e i campi di una conversazione (`motore`, `testo`, `allegati`, `contesto`, `stato`, `lavoro`, `contesto_usato`, `titolo`). Le forme dei messaggi, delle richieste e degli eventi (Messaggio, Parte, Task, Richiesta, Eventi) stanno in `docs/chat/messaggi.md`. → `docs/chat/api.md`

## I comandi con la barra

La tendina, l'elenco di ogni motore che li ha, i comandi dello studio, la conversazione riletta dal file. → `docs/chat/comandi.md`

## Modello ed effort

Come si scelgono il modello e l'effort, alla creazione e a conversazione aperta; i livelli di effort di ogni modello. → `docs/chat/sessione.md`

## I permessi

La chat salta i permessi di Claude Code e di Codex; le domande e i permessi di Mango Code; le domande di un motore senza uno strumento suo. → `docs/chat/sessione.md`

## I lavori in background

Cosa si segue (`task_*`), mandare in background, fermare un lavoro. → `docs/chat/messaggi.md`

## Codex

Una conversazione con Codex: quando c'è, cosa riceve, comandi, domande e permessi, conversazioni (anche quelle aperte dal terminale), errori. → `docs/chat/codex.md`

## Mango Code

Una conversazione con Mango Code: quando c'è, cosa riceve, contesto, conversazioni, errori. → `docs/chat/mango-code.md`

## Controllo da claude.ai

Il collegamento di ogni conversazione di Claude Code all'app di Claude. → `docs/chat/sessione.md`

## Gli strumenti del progetto

Lo strumento «video», la lingua delle istruzioni e delle frasi, il metodo come cartella in più, Claude in Chrome. → `docs/chat/metodo.md`

## Il primo giro

L'avvio della skill `welcome`, la conversazione che comincia dal motore. → `docs/chat/metodo.md`

## Cosa ha in più del terminale, per i video

Le immagini degli strumenti, i lavori in coda come schede vive, i collegamenti ai video e ai file, il contesto, incolla e trascina: è ciò che la chat mostra, e sta in `docs/studio/chat.md` (il campo `contesto` e gli allegati, per le rotte, in `docs/chat/api.md`).
