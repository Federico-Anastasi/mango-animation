# La chat: Mango Code

## Mango Code

Al posto di Claude Code una conversazione può parlare con **Mango Code**, che lavora coi modelli sul computer (Mango Code è un progetto a parte;
il contratto è in [`docs/INTEGRATION.md`](https://github.com/Federico-Anastasi/mango-code/blob/master/docs/INTEGRATION.md)). Il server lo usa attraverso `server/src/chat/mangocode.ts`, che dà alla
conversazione la stessa `query` di Claude Code: gli eventi di Mango Code diventano i messaggi dell'SDK, così messaggi, Parti, eventi e
richieste sono gli stessi di Claude Code (`docs/chat/api.md`, `docs/chat/messaggi.md`).

- **Quando c'è.** Se Mango Code è pronto (`service.json` nella sua cartella dei dati, `MANGO_DATA`, di base `%LOCALAPPDATA%\MangoCode`, col
  processo `pid` vivo e `agent` che risponde),
  `GET /api/chat/modelli` aggiunge i suoi modelli dopo quelli di Claude Code: `id` `mango-code/<chiave>` (la chiave è quella che Mango Code dà al modello, per esempio `mango-code/toq`),
  `nome` «Mango Code · <nome>», nessun effort. L'elenco si rilegge a ogni richiesta, perché Mango Code si accende e si spegne per conto suo: il
  server osserva il suo `service.json` e, quando compare, cambia o sparisce, annuncia l'evento `modelli`, a cui lo studio rilegge il menu.
  Se Claude Code non risponde, bastano quelli di Mango Code. Il server non accende Mango Code: lo si apre dalla sua icona. Acceso ma non
  pronto (il file c'è con `reason` al posto di `agent` e `engine`: si sta preparando, o aspetta una scelta nella sua finestra) non offre
  modelli, e una sua conversazione dice «Mango Code si sta preparando o non è pronto: guarda la sua finestra e riscrivi il messaggio.»
  (alla lettura: «… che non è ancora pronto: guarda la sua finestra e riprova.»); il testo di `reason` non si legge né si ripete.
- **Una conversazione è dell'uno o dell'altro.** Nasce di Mango Code con un suo modello (`POST /api/chat` con `modello: "mango-code/…"`);
  poi cambia modello solo fra quelli di Mango Code (400 per uno di Claude, e viceversa). La testata dello studio dice «Mango Code».
- **Cosa riceve.** Lo strumento «video» (aggiunto alla cartella di lavoro con `POST /mcp` se non è già collegato, finché Mango Code
  resta acceso); il metodo del prodotto come cartella in più (`PUT /mango/extra-folders` `{ folders }`, la cartella del codice, a ogni
  avvio della conversazione): Mango Code ne legge `CLAUDE.md`, regole e skill come quelli della cartella di lavoro, che legge da sé (il `CLAUDE.md` e
  le regole del creator); le istruzioni dell'app, con ciò che Claude Code sa dall'ambiente (dove sono i dati, che il codice si legge
  e basta, come si lancia il motore). Ogni chiamata si presenta come «Mango Animation» (`User-Agent`), come la scrive il registro del
  suo gestore. Un Mango Code senza le cartelle in più non apre la conversazione: «Questa versione di Mango Code è troppo vecchia: aggiornala.»
- **Cosa entra nel prompt.** Le app non possono spegnere voci dalla rotta (`PUT /mango/settings` dà 403 senza `Origin`), ma Mango Code
  legge `.mango/settings.json` nella cartella di lavoro. All'avvio di ogni conversazione, accanto alle cartelle in più, il server
  (`server/src/chat/vociSpente.ts`) vi spegne i server MCP `chrome-devtools` e `documenti`, che pesano nel prompt e il metodo non usa
  (`web-search` resta acceso): aggiunge solo le voci mancanti a `false` e lascia le altre, anche le altre voci di `prompt.mcp`. Una voce
  si spegne una volta sola per cartella di lavoro, e ciò che è già fatto sta in `archivio/.chat/mango-code-voci-spente.json`: la pagina
  di Mango Code, quando il creator riaccende una voce «solo per questa cartella», la toglie dal file, e senza il ricordo la voce assente
  si rispegnerebbe al messaggio dopo. Una voce già scritta nel file, vera o falsa, è del creator. Un file che non si legge non si
  riscrive: la conversazione dice di correggerlo o toglierlo.
- **Contesto usato.** Ogni passo del giro (una richiesta al modello) è un messaggio suo; il contesto dopo il passo è il suo `tokens.total`
  (ingresso, cache letta e scritta, uscita e ragionamento), preso dall'ultimo passo finito (`finish`) che non è il riassunto
  (`summary`): un passo a zero è in corso o fermato, non un contesto vuoto, e il riassunto porta i token della richiesta che lo scrive.
  Dopo `session.compacted` il contesto non si sa fino alla fine del passo che riprende (`docs/chat/api.md`, `contesto_usato`). Gli eventi ripetuti
  identici (`message.updated` due volte, `session.idle` più volte per giro) non cambiano niente.
- **Domande, permessi, «Ferma».** Le domande di Mango Code diventano la Richiesta `domanda`, e la risposta torna a lui (per ogni
  domanda le etichette scelte, o il testo scritto); i permessi, se le sue regole li chiedono, la Richiesta `permesso`; «Ferma» ferma
  il giro (`abort`). Un errore del giro è la Parte `fine` con `errore`.
- **Le conversazioni.** Quale sessione di Mango Code è di quale conversazione, col suo modello, titolo e data, sta in
  `archivio/.chat/mango-code.json`: la conversazione resta nell'elenco anche a Mango Code spento, e si rilegge dai suoi messaggi
  quando è acceso (502 se è spento). Un messaggio nuovo continua la stessa sessione. Un `mango-code.json` che non si legge si mette da parte come `mango-code.json.illeggibile` alla prima scrittura, e il registro del server lo dice.
- **Cosa non c'è** (scritto nel contratto di Mango Code): effort, sottoagenti, Claude in Chrome, fermare o mandare in background un lavoro da solo, le immagini nei risultati degli strumenti.
- **Errori.** Ogni errore di Mango Code arriva al creator come una frase completa (sono in `server/src/chat/mangocode.ts`), mai incapsulata in un'altra; il dettaglio tecnico (lo stato e il corpo della risposta) va nel registro del server (`chat di Mango Code: …`). Gli errori di un solo motore portano il suo nome, quelli che valgono per entrambi no; le frasi che dicono cosa il motore vuole fare non riportano mai l'ingresso grezzo dello strumento: quello sta in `ingresso`.
