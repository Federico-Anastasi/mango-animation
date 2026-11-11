# Il Claude Code del creator

Parte di `docs/APP.md`.

L'app non porta Claude Code: usa quello che il creator ha già, e la chat parte con quel programma e non con la copia che l'SDK porta con sé
(`docs/CHAT.md`). L'app non legge né usa il suo accesso: gli chiede, come da terminale, `claude --version` e `claude auth status` (un JSON, anche se non si è collegati),
e per l'accesso lascia fare a lui (`claude auth login`).

- **Dove lo cerca** (`app/src/claude.rs`): `MANGO_ANIMATION_CLAUDE` (il percorso del programma: vince su tutto, ed è un errore se indica qualcosa che non c'è); poi `claude.exe`
  nelle cartelle del PATH, e un `claude.cmd` di npm con il suo programma accanto (`node_modules\@anthropic-ai\claude-code\bin\claude.exe`); poi dove si installa senza che il PATH
  dell'app lo sappia ancora: `%USERPROFILE%\.local\bin\claude.exe` (l'installatore di Anthropic) e `%APPDATA%\npm\node_modules\@anthropic-ai\claude-code\bin\claude.exe`.
- **Cosa fa all'avvio**, solo se il server lo accende lei (con un server già acceso non c'è passo): se Claude Code c'è, parte e risulta collegato, passa avanti senza dire niente. Altrimenti la pagina
  d'attesa lo dice e aspetta il creator (`app/src/preparazione.rs`, `app/ui/`): senza Claude Code collegato l'app non serve a niente, e non c'è modo di andare avanti. La pagina dice prima che serve **un account Claude con un
  abbonamento** (Pro, Max, Ultra, Team o Enterprise; il piano gratuito non include Claude Code: `code.claude.com/docs/en/setup`, «Authenticate»), col link ai piani (`claude.com/pricing`).
  - **manca o non parte**: «Installa Claude Code» apre una finestra di PowerShell con il comando di Anthropic (`irm https://claude.ai/install.ps1 | iex`) e, quando la finestra si chiude, l'app ricontrolla da sola. Se
    Claude Code ancora non c'è la pagina dice che l'installazione non è andata a buon fine e offre «Riprova»; se la finestra ha trovato un errore resta aperta, perché il creator lo legga. In piccolo restano il comando da copiare
    («Copia il comando»: per chi preferisce incollarlo da sé) e il link alla guida di Anthropic; poi «Ricontrolla»;
  - **non è collegato**: «Accedi a Claude Code» apre una finestra di terminale con `claude auth login` (apre il browser dell'account; se serve un passo in più il creator lo legge lì), e quando si chiude
    l'app ricontrolla da sola; «Ricontrolla» per chi ha fatto l'accesso altrove;
  La pagina riceve dal controllo versione e se è collegato; l'indirizzo email e l'abbonamento che `claude auth status` dice non entrano nello stato e non vanno da nessuna parte.
- **Al server** il percorso arriva in `MANGO_ANIMATION_CLAUDE`; senza (si sviluppa a mano, o si va avanti senza) il server usa la copia dell'SDK se c'è.
- La prova col `claude` installato nel computer: `cargo test il_claude_vero -- --ignored --nocapture`.
