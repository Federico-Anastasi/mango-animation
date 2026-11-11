# La chat

Nell'app (e nello studio, nel browser) il creator parla con Claude Code in una chat vera, accanto alle viste dei video. È lo stesso
Claude Code del terminale, con la stessa potenza: lo stesso abbonamento, `CLAUDE.md`, le regole di `.claude/rules/`, le skill di
`.claude/skills/`, gli strumenti MCP «video», la shell, la lettura e scrittura dei file, i sottoagenti. Cambia solo il
davanti: niente terminale, una conversazione con immagini, bottoni e lavori che si vedono.

Il documento è diviso per argomento in `docs/chat/`; ogni sezione qui sotto dice dove sta adesso.

## Com'è fatta

L'Agent SDK, un `query` per conversazione, i file di `server/src/chat/`, il nome e il segno della chat. → `docs/chat/sessione.md`

## API

Le rotte `/api/chat`, gli errori e i campi di una conversazione (`testo`, `allegati`, `contesto`, `stato`, `lavoro`, `contesto_usato`, `titolo`). Le forme dei messaggi, delle richieste e degli eventi (Messaggio, Parte, Task, Richiesta, Eventi) stanno in `docs/chat/messaggi.md`. → `docs/chat/api.md`

## I comandi con la barra

La tendina, l'elenco di Claude Code, i comandi dello studio, la conversazione riletta dal file. → `docs/chat/comandi.md`

## Modello ed effort

Come si scelgono il modello e l'effort, alla creazione e a conversazione aperta. → `docs/chat/sessione.md`

## I permessi

La chat salta i permessi di Claude Code; le domande e i permessi di Mango Code. → `docs/chat/sessione.md`

## I lavori in background

Cosa si segue (`task_*`), mandare in background, fermare un lavoro. → `docs/chat/messaggi.md`

## Mango Code

Mango Code al posto di Claude Code: quando c'è, cosa riceve, contesto, conversazioni, errori. → `docs/chat/mango-code.md`

## Controllo da claude.ai

Il collegamento di ogni conversazione all'app di Claude. → `docs/chat/sessione.md`

## Gli strumenti del progetto

Lo strumento «video», la lingua delle istruzioni e delle frasi, il metodo come cartella in più, Claude in Chrome. → `docs/chat/metodo.md`

## Il primo giro

L'avvio della skill `welcome`, la conversazione che comincia da Claude. → `docs/chat/metodo.md`

## Cosa ha in più del terminale, per i video

Le immagini degli strumenti, i lavori in coda come schede vive, i collegamenti ai video e ai file, il contesto, incolla e trascina: è ciò che la chat mostra, e sta in `docs/studio/chat.md` (il campo `contesto` e gli allegati, per le rotte, in `docs/chat/api.md`).
