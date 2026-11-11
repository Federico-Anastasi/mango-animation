# Come il metodo arriva a Claude

Claude parte con la cartella di lavoro come cartella corrente, quindi legge lì il `CLAUDE.md`, le regole e le skill del creator. Il
metodo del prodotto gli arriva dal codice. Non è una copia: il metodo resta una versione sola, quella del codice, e un aggiornamento arriva senza far niente.

- **La chat dell'app** passa il codice come cartella in più (`additionalDirectories` con `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1`, `server/src/chat/metodo.ts`):
  Claude Code legge da sé `CLAUDE.md`, regole (anche quelle con `paths:`) e skill del codice. `PYTHONPATH` e `MANGO_ANIMATION_LAVORO` stanno nell'ambiente dei processi
  di Claude, così `python -m motore` funziona dalla cartella di lavoro; lo strumento «video» è la configurazione esplicita del server (`docs/CHAT.md`).
- **Da terminale** il codice è un **plugin di Claude Code** (`mango-animation`: manifesto `.claude-plugin/plugin.json`, i file del plugin in `plugin/`):

| cosa | come arriva col plugin | da dove |
|---|---|---|
| le skill | il manifesto indica `.claude/skills/`, la stessa cartella che Mango Code legge come cartella in più: una copia sola. Claude Code le chiama `mango-animation:<skill>` | `.claude/skills/` |
| lo strumento «video» | `plugin/mcp.ts` trova la cartella di lavoro (`plugin/lavoro.ts`: `MANGO_ANIMATION_LAVORO`; senza, la cartella in cui Claude è aperto se ha `archivio/`; altrimenti non parte e dice cosa fare) e accende lo stesso server MCP di `bun run --cwd server mcp`. Parla col server di Mango Animation, che deve essere acceso | `plugin/mcp.ts` |
| `CLAUDE.md` e regole | un plugin non porta né `CLAUDE.md` né regole: li dà un hook di avvio (`plugin/hooks.json`, `plugin/sessione.ts`), solo in una cartella di lavoro. Sono il `CLAUDE.md` del codice e le regole di `.claude/rules/` senza `paths:` (quelle con `paths:` sono di chi sviluppa il codice, che le ha già), con in testa dove sta il codice: i percorsi che le regole e le skill nominano (`.claude/metodo/…`, `docs/…`, `animazioni/…`, `stile.json`) sono relativi a quella cartella. Un hook non dà più di 10.000 caratteri: se le regole non ci stanno l'hook fallisce con una frase che lo dice (e la prova `server/test/plugin.test.ts` con lui), non le taglia. Ciò che serve a pochi passi sta in `.claude/metodo/` (regole di montaggio e di contenuto, difetti già visti, YouTube) e lo leggono le skill di quei passi | `plugin/metodo.ts` |
| `MANGO_ANIMATION_LAVORO` e `PYTHONPATH` per la shell | l'hook `ambiente` li scrive in `CLAUDE_ENV_FILE`, così `python -m motore` funziona dalla cartella di lavoro anche da terminale; dove ci sono già (la chat) non cambia niente | `plugin/sessione.ts` |

- **Per usarlo**, nella cartella di lavoro: `CLAUDE_CODE_PLUGIN_DIRS=<codice>` nell'ambiente (o `claude --plugin-dir <codice>` per una sessione) e il server acceso. Il plugin si carica dove sta,
  senza copie. Non si installa da un catalogo (`claude plugin install`): copierebbe tutta la cartella del codice nella cache di Claude Code. L'app non scrive
  `CLAUDE_CODE_PLUGIN_DIRS` nell'ambiente dell'utente: varrebbe in ogni progetto, e lo strumento «video» fallirebbe fuori da una cartella di lavoro. La guida dà il
  comando con `--plugin-dir` (`docs/guida/`, «La chat»).
- **Mango Code** non legge i plugin di Claude Code: legge `CLAUDE.md`, `.claude/rules/` e `.claude/skills/` della cartella in più (`docs/CHAT.md`, «Mango Code»), e lo strumento «video» lo riceve da `POST /mcp`. Le stesse skill, nessuna copia.
- Le prove (`server/test/plugin.test.ts`) controllano manifesto e `claude plugin validate`, le skill, gli hook (le regole entrano in un hook o l'hook fallisce, niente fuori da una cartella di lavoro, la shell) e che il server MCP parta ed elenchi gli strumenti senza scheda video.
