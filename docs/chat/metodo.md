# La chat: il metodo e il primo giro

## Gli strumenti del progetto

Il server passa a ogni conversazione lo strumento «video» come configurazione esplicita (`server/src/chat/metodo.ts`): il suo codice sta nel prodotto
(`bun run --cwd <codice>/server mcp`, percorsi assoluti), i dati che legge nella cartella di lavoro (`MANGO_ANIMATION_LAVORO`). C'è anche dove le impostazioni
locali di un computer lo spengono per il terminale (`disabledMcpjsonServers`).

**La lingua.** Ciò che istruisce Claude è metodo e sta in inglese: le istruzioni che il server aggiunge al prompt di sistema (`NELL_APP` in
`server/src/chat/conversazione.ts`, che gli dicono anche di rispondere nella lingua del creator, l'italiano di base), le descrizioni degli strumenti e dei loro
parametri, la riga di contesto. I nomi degli strumenti non cambiano. Sono in italiano gli errori che gli strumenti riportano (sono quelli del server, che anche
l'interfaccia mostra, senza `X-Lingua`) e la riga `[Allegato: …]`.

Le frasi che la chat dice al creator sono nelle due lingue come tutte quelle del server (`docs/API.md`, «La lingua delle frasi»): ogni `ErroreChat` nasce con una `Frase` (il tipo non ammette un testo solo) e `server/test/lingua-frasi.test.ts` fallisce se una frase resta in una lingua sola. Quelle che nascono fuori da una richiesta (un giro finito male, la richiesta di un permesso, il rifiuto che torna a Claude, la nota su un risultato troncato) escono nella lingua che lo studio ha dichiarato per ultima (`coda.linguaDelloStudio`).

Il metodo del prodotto arriva a Claude Code, e a Mango Code, come cartella in più (`additionalDirectories` col codice): i dettagli, e il plugin che lo porta da terminale, sono in `docs/ARCHITETTURA.md`, «Come il metodo arriva a Claude». `PYTHONPATH` e `MANGO_ANIMATION_LAVORO` stanno nell'ambiente dei processi di Claude perché `python -m motore` funzioni dalla cartella di lavoro. Le conversazioni sono quelle di `~/.claude/projects/<cartella di lavoro>`: una aperta da terminale nella cartella di lavoro si ritrova qui.

Ogni conversazione parte anche con Claude in Chrome (`extraArgs: { chrome: null }`, come `claude --chrome`): gli strumenti
`mcp__claude-in-chrome__*` sono fra quelli che Claude ha, e lavorano nel Chrome dell'utente con l'estensione installata.

## Il primo giro

Un creator senza `profilo.json` (con il nome del creator) fa il primo giro nella chat: la skill `welcome` (`.claude/skills/welcome/SKILL.md`), che dice a Claude le tappe, una per messaggio, nel tono di chi non è tecnico, e cosa scrivere: `profilo.json`, `stile.json` (solo le differenze dallo stile di serie, `docs/PROFILO.md`; dai video del creator, col suo permesso, o da uno dei tre stili di `stili-di-partenza.json`, che il creator sceglie vedendoli come cartoline in Impostazioni › Stile: la chat gli scrive il link) e il suo `CLAUDE.md`, ciascuno mostrato in parole e confermato prima. Lo studio la innesca da solo (`studio/src/chat/primoGiro.ts`): se `GET /api/profilo` dice `presente: false` e il creator non ha già cominciato o saltato, apre la chat e chiede una conversazione di avvio (`POST /api/chat` con `avvio`); il `CLAUDE.md` del metodo dice la stessa cosa a Claude da terminale.

**La conversazione comincia da Claude.** L'avvio non è un messaggio del creator: il server manda a Claude un'istruzione (`server/src/chat/primoGiro.ts`, in inglese, nella lingua dello studio perché il profilo che dice quella del creator ancora non c'è) che comincia con `[Start: first round]` e gli dice di avviare la skill `welcome` e di aprire con il saluto. La chat non ne fa un messaggio (nessuna Parte `utente`, né in diretta né riletta dal file, dove la riga col marcatore si salta), il titolo è «Il primo giro» e `GET /api/chat/:id` dice `primo_giro: true`, anche riletta dal file. Lo studio, finché l'avvio parte, mostra «Sto cominciando…» e, se non parte, l'errore con «Riprova»; poi la conversazione si apre sul saluto di Claude. In una conversazione con `primo_giro` lo studio raccoglie tutti i passi di Claude in una riga (`docs/studio/chat.md`). La conversazione parte con l'Opus più recente dell'elenco dei modelli (`modello` alla creazione, solo per quella conversazione), o con `default` se l'elenco non ha un Opus o non si legge; il menu del modello la cambia, la scelta ricordata per le altre conversazioni non si tocca e, se il creator ha scelto Mango Code, resta Mango Code. «Salta» e «Rifai il primo giro» sono nella chat, e «Fai il primo giro» è tutto ciò che la pagina Profilo propone finché il giro non è fatto (`docs/studio/stile-e-motori.md`). Le pagine dei canali senza dati mandano la chat sulla richiesta giusta con un pulsante (`docs/studio/canale.md`).
