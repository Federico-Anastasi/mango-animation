# La chat: i comandi con la barra

## I comandi con la barra

Nella chat si usano i comandi di Claude Code come nel terminale: scrivendo `/` all'inizio del messaggio si apre la tendina dei comandi.

- **La tendina.** Si apre finché il messaggio è `/` più il nome che si sta scrivendo (senza spazi) e lo filtra: prima i comandi il cui nome
  comincia con ciò che è scritto, poi quelli con un alias che comincia così, poi quelli che lo contengono. Ogni riga: `/nome`, gli argomenti (`argomenti`, se ce ne sono) e la
  descrizione su una riga. Frecce su e giù per scegliere, Tab per completare (`/nome `, per scrivere gli argomenti), Invio per mandare il
  comando scelto (come nel terminale), Esc per chiuderla; un clic completa. Ci sono i comandi dello studio (sotto) e, in una conversazione di
  Claude Code, quelli di `GET /api/chat/comandi`. In una di Mango Code solo quelli dello studio.
- **L'elenco di Claude Code** (`GET /api/chat/comandi`): ciò che Claude Code offre in questa cartella di lavoro (`supportedCommands()`: i suoi,
  le skill del prodotto e del creator, quelli dei plugin), con `descrizione` (in inglese, com'è in Claude Code), `argomenti` (il suggerimento,
  vuoto se non ne vuole) e `alias`. Si legge una volta per vita del server, con la stessa `query` senza messaggi dei modelli (una sola per tutti e due); quando una
  conversazione aperta riceve `commands_changed` l'elenco si sostituisce e il server annuncia `{ tipo: "comandi" }`.
- **Cosa arriva a Claude Code.** Un messaggio che comincia con `/` arriva com'è scritto, senza la riga di contesto davanti (che lo farebbe
  leggere come testo) e senza immagini: gli allegati diventano righe `[Allegato: …]` dopo il testo. Claude Code lo esegue come nel
  terminale: i comandi locali rispondono subito con il loro testo (`/context`, `/usage`, `/mcp`, `/rename`…), che la chat mostra come
  messaggio di Claude; `/compact` riassume la conversazione; le skill e i comandi che sono istruzioni lavorano come un messaggio. Uno che
  Claude Code non esegue qui risponde da sé che non è disponibile.
- **I comandi dello studio** fanno nello studio ciò che nel terminale ha la sua finestra, e non arrivano a Claude Code:

  | comando | cosa fa |
  |---|---|
  | `/clear` (`/reset`, `/new`) | chiude la conversazione e ne apre una nuova vuota |
  | `/exit` (`/quit`) | chiude la conversazione |
  | `/resume` (`/continue`) | apre l'elenco delle conversazioni |
  | `/model [modello]` | senza argomento apre il menu del modello; con un argomento (l'`id` o il nome di un modello dell'elenco) lo sceglie |
  | `/effort [livello]` | senza argomento apre il menu dell'effort; con un livello lo sceglie |

  Il server rifiuta (400) un messaggio `/clear`, `/reset`, `/new`, `/model …` o `/effort …` per una conversazione di Claude Code, con la
  frase che dice come si fa: `/clear` farebbe cambiare a Claude Code l'id della conversazione sotto la chat, e modello ed effort si cambiano
  con `POST /api/chat/:id/impostazioni`, che tiene il menu allineato.
- **Riletta dal file**, una conversazione mostra i comandi come messaggi del creator (`/rename prova`) e le loro risposte come messaggi di
  Claude, come mentre girava; una risposta vuota non mostra niente, e il riassunto che Claude Code scrive per sé dopo `/compact` non è un
  messaggio del creator. Di una conversazione riassunta (`/compact` o in automatico) si vede solo ciò che segue l'ultimo riassunto, come
  nel terminale. `getSessionMessages` (con `includeSystemMessages`) dà le righe `system` solo con `uuid` e orario, senza `subtype` né
  `content`: il testo della risposta (`local_command`) e il riassunto della conversazione (`compact_boundary`) il server li legge dal file della
  sessione, per `uuid`.
