# I motori della chat del creator

Parte di `docs/APP.md`.

L'app non porta nessun motore della chat: usa quelli che il creator ha già, e la chat parte con quei programmi (`docs/CHAT.md`). I motori che il prodotto conosce sono tre: Claude Code, Codex e Mango Code. **Ne basta uno pronto**, cioè trovato e
collegato (Mango Code: acceso e che risponde). L'app non legge né usa l'accesso di nessuno: ai programmi chiede, come da terminale, versione e stato dell'accesso, e per accedere lascia fare a loro.

## Come ne è fatto uno

Ogni motore ha una descrizione in `app/src/motori/mod.rs` (`MOTORI`): il nome, e per chi è un programma (Claude Code, Codex) il nome della variabile che ne indica il percorso, dove cercarlo, cosa chiedergli per versione e accesso, come si accede, come si installa.

| | Claude Code | Codex | Mango Code |
|---|---|---|---|
| variabile (vince su tutto) | `MANGO_ANIMATION_CLAUDE` | `MANGO_ANIMATION_CODEX` | nessuna |
| versione | `claude --version` | `codex --version` | |
| accesso | `claude auth status` (un JSON, anche se non si è collegati) | `codex login status` (una riga sul canale degli errori: «Logged in using …») | |
| per accedere | `claude auth login` | `codex login` | si accende da sé |
| per installare | il comando di Anthropic in PowerShell | la pagina del pacchetto nello Store di Windows | la pagina della sua ultima uscita su GitHub |

- **Dove cerca il programma**, nell'ordine: la variabile (il percorso del programma: vince su tutto, ed è un errore se indica qualcosa che non c'è); `claude.exe` o `codex.exe` nelle cartelle del PATH, e per Claude Code un
  `claude.cmd` di npm con il suo programma accanto (`node_modules\@anthropic-ai\claude-code\bin\claude.exe`); poi dove si installa senza che il PATH dell'app lo sappia ancora: per Claude Code
  `%USERPROFILE%\.local\bin\claude.exe` (l'installatore di Anthropic) e `%APPDATA%\npm\node_modules\@anthropic-ai\claude-code\bin\claude.exe`; per Codex il pacchetto dello Store `OpenAI.Codex`: Windows dice, dal nome di famiglia del
  pacchetto, in quale cartella è installato, e il programma sta in `app\resources\codex.exe` lì dentro. Un `codex.cmd` di npm non vale: è lo script, non il programma.
- **Codex è collegato** se `codex login status` esce senza errore e la sua riga comincia con «Logged in». Un'uscita con errore che parla di accesso è un Codex non collegato; qualunque altra uscita non si interpreta: la pagina mostra l'ultima riga e non dice che è collegato.
- **Mango Code non si cerca come programma.** È pronto se il `service.json` nella sua cartella dei dati (`MANGO_DATA`, di base `%LOCALAPPDATA%\MangoCode`) nomina un processo vivo con agente e motore, e l'agente risponde a `GET /global/health` entro 3 secondi:
  è la stessa regola del server (`server/src/chat/mangocode.ts`, `statoDiMangoCode`; `app/src/motori/mango_code.rs`). Un file con un motivo al posto di agente e motore è un Mango Code acceso ma non ancora pronto; ogni altro caso è spento.
  Da spento, **se è installato lo dice Windows**: il suo installatore lo scrive fra i programmi dell'utente (la chiave `Mango Code` sotto `Software\Microsoft\Windows\CurrentVersion\Uninstall`). Installato e spento non ha niente da premere: si apre
  dalla sua icona. Non installato ha «Installa». Non ha mai «Accedi».

## Cosa fa all'avvio

Solo se il server lo accende l'app (con un server già acceso non c'è passo). I motori si guardano nell'ordine Claude Code, Codex, Mango Code e ci si ferma al primo pronto: l'avvio prosegue senza dire niente. Se nessuno è pronto la pagina d'attesa
(`app/src/preparazione.rs`, `app/ui/`) li elenca tutti e aspetta il creator: senza un motore pronto l'app non serve a niente, e non c'è modo di andare avanti. Per ogni motore la pagina dice se è installato (con la versione), se è collegato, e
cosa è andato storto; il titolo è «Per cominciare serve un motore per la chat» se nessuno è installato, «Collega un motore della chat» se ce n'è uno ma non è collegato.

- **Claude Code manca o non parte**: «Installa» apre una finestra di PowerShell con il comando di Anthropic (`irm https://claude.ai/install.ps1 | iex`) e, quando la finestra si chiude, l'app ricontrolla da sola. Se Claude Code ancora non c'è la pagina dice che
  l'installazione non è andata a buon fine e offre «Riprova»; se la finestra ha trovato un errore resta aperta, perché il creator lo legga. Il comando di Anthropic sta chiuso sotto «Installa con un comando»: aperto, mostra il comando, «Copia il comando» e il link alla guida di Anthropic. Sotto Claude Code la pagina dice
  che serve **un account Claude con un abbonamento** (Pro, Max, Ultra, Team o Enterprise; il piano gratuito non include Claude Code: `code.claude.com/docs/en/setup`, «Authenticate»); sotto Codex che si accede con l'account ChatGPT; sotto Mango Code che si apre dalla sua icona, o, se non è installato, che si scarica da GitHub.
- **Codex manca**: «Installa» apre la pagina del pacchetto nello Store di Windows (`ms-windows-store://pdp/?PFN=<nome di famiglia>`), fuori dal Job Object dell'app, e la pagina dice di installarlo da lì e poi premere «Ricontrolla». L'installazione la fa il creator nello Store.
- **Un programma trovato ma non collegato**: «Accedi» apre una finestra di terminale con il comando di accesso del programma (apre il browser dell'account; se serve un passo in più il creator lo legge lì), e quando si chiude l'app ricontrolla da sola.
- **Mango Code manca**: la pagina dice «Non installato» e «Installa» apre nel browser la pagina della sua ultima uscita (`github.com/Federico-Anastasi/mango-code/releases/latest`), fuori dal Job Object dell'app; la pagina dice di scaricare
  l'installatore, installarlo, aprirlo e poi premere «Ricontrolla». L'installazione la fa il creator.
- **Mango Code spento o non pronto**: la pagina lo dice e rimanda alla sua icona; con «Ricontrolla» si guarda di nuovo.
- Lo stato di ogni motore è un'etichetta: rossa se il programma non parte, ambra se Mango Code è acceso ma non pronto, neutra per «Non installato», «Spento» e «da collegare». «Accedi» è il bottone principale solo se è l'unico motore da collegare.
- «Ricontrolla» c'è sempre, per chi ha sistemato qualcosa altrove. Una frase di errore di un'installazione o di un accesso sta sotto il suo motore, per un giro solo.

La pagina riceve per ogni motore: se è stato trovato, il percorso, la versione, se è collegato, cosa manca, e se ha «Installa» e «Accedi». L'indirizzo email e l'abbonamento che i programmi dicono di sé non entrano nello stato e non vanno da nessuna parte.

## Al server

Per ogni programma trovato (anche se non collegato) il percorso arriva al server nella sua variabile, `MANGO_ANIMATION_CLAUDE` e `MANGO_ANIMATION_CODEX`; un programma che non c'è non ha variabile. Senza `MANGO_ANIMATION_CLAUDE` (si sviluppa a mano, o si va avanti con un altro motore) il server usa
la copia dell'SDK di Claude se c'è. Mango Code non ha variabile: il server lo vede dal suo `service.json`.

## Provare

`cargo test i_programmi_veri -- --ignored --nocapture` esamina i programmi veri di questo computer (chiede solo versione e accesso); `cargo test il_pacchetto_vero_di_codex -- --ignored --nocapture` chiede a Windows la cartella del pacchetto di Codex.
