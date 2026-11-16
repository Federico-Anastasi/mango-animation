# Come il metodo arriva a Claude Code e a Codex

Claude Code e Codex partono con la cartella di lavoro come cartella corrente, quindi leggono lì il `CLAUDE.md` del creator (Claude Code anche le sue regole e le sue skill). Il
metodo del prodotto gli arriva dal codice. Non è una copia: il metodo resta una versione sola, quella del codice, e un aggiornamento arriva senza far niente.

- **La chat dell'app** passa il codice a Claude Code come cartella in più (`additionalDirectories` con `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1`, `server/src/chat/metodo.ts`):
  Claude Code legge da sé `CLAUDE.md`, regole (anche quelle con `paths:`) e skill del codice. A Mango Code la dà come cartella in più (`docs/chat/mango-code.md`), a Codex come istruzioni e cartella di skill (`docs/chat/codex.md`). `PYTHONPATH` e `MANGO_ANIMATION_LAVORO` stanno nell'ambiente dei processi
  dei motori, così `python -m motore` funziona dalla cartella di lavoro; lo strumento «video» è la configurazione esplicita del server (`docs/CHAT.md`).
- **Da terminale** il codice è un **plugin di Claude Code** (`mango-animation`: manifesto `.claude-plugin/plugin.json`, i file del plugin in `plugin/`):

| cosa | come arriva col plugin | da dove |
|---|---|---|
| le skill | il manifesto indica `.claude/skills/`, la stessa cartella che Mango Code legge come cartella in più: una copia sola. Claude Code le chiama `mango-animation:<skill>` | `.claude/skills/` |
| lo strumento «video» | `plugin/mcp.ts` trova la cartella di lavoro (`plugin/lavoro.ts`: `MANGO_ANIMATION_LAVORO`; senza, la cartella in cui Claude è aperto se ha `archivio/`; altrimenti non parte e dice cosa fare) e accende lo stesso server MCP di `bun run --cwd server mcp`. Parla col server di Mango Animation, che deve essere acceso | `plugin/mcp.ts` |
| `CLAUDE.md` e regole | un plugin non porta né `CLAUDE.md` né regole: li dà un hook di avvio (`plugin/hooks.json`, `plugin/sessione.ts`), solo in una cartella di lavoro. Sono il `CLAUDE.md` del codice e le regole di `.claude/rules/` senza `paths:` (quelle con `paths:` sono di chi sviluppa il codice, che le ha già), con in testa dove sta il codice: i percorsi che le regole e le skill nominano (`.claude/metodo/…`, `docs/…`, `animazioni/…`, `stile.json`) sono relativi a quella cartella. Un hook non dà più di 10.000 caratteri: se le regole non ci stanno l'hook fallisce con una frase che lo dice (e la prova `server/test/plugin.test.ts` con lui), non le taglia. Ciò che serve a pochi passi sta in `.claude/metodo/` (regole di montaggio e di contenuto, difetti già visti, YouTube) e lo leggono le skill di quei passi | `plugin/metodo.ts` |
| `MANGO_ANIMATION_LAVORO` e `PYTHONPATH` per la shell | l'hook `ambiente` li scrive in `CLAUDE_ENV_FILE`, così `python -m motore` funziona dalla cartella di lavoro anche da terminale; dove ci sono già (la chat) non cambia niente | `plugin/sessione.ts` |

- **Per usare Claude Code da terminale**, nella cartella di lavoro: `CLAUDE_CODE_PLUGIN_DIRS=<codice>` nell'ambiente (o `claude --plugin-dir <codice>` per una sessione) e il server acceso. Il plugin si carica dove sta,
  senza copie. Non si installa da un catalogo (`claude plugin install`): copierebbe tutta la cartella del codice nella cache di Claude Code. L'app non scrive
  `CLAUDE_CODE_PLUGIN_DIRS` nell'ambiente dell'utente: varrebbe in ogni progetto, e lo strumento «video» fallirebbe fuori da una cartella di lavoro. La guida dà il
  comando con `--plugin-dir` (`docs/guida/`, «La chat»).
- **Codex da terminale** non ha plugin che si carichino da una cartella senza copiarla (un plugin di Codex si installa nella sua cache) né un'impostazione per le skill di un'altra
  cartella. Lo avvia allora il prodotto: `plugin/avvia-codex.ts` lo lancia nella cartella di lavoro con gli argomenti che compone `plugin/codex.ts`, dalle stesse funzioni che servono a Claude Code
  e alla chat. Le quattro cose arrivano così:

| cosa | come arriva a Codex | da dove |
|---|---|---|
| le skill | Codex cerca in `.agents/skills/` della cartella in cui lavora e segue i collegamenti: a ogni avvio il lanciatore vi controlla due collegamenti (giunzioni su Windows) a `.claude/skills/`: `mango-animation` verso il codice e, se il creator ne ha di sue, `creator`. Una copia sola, e un aggiornamento del codice le cambia senza far niente. Codex chiama quelle del prodotto `mango-animation:<skill>`. Una cartella vera con quel nome non si tocca: il lanciatore si ferma e lo dice | `plugin/codex.ts` |
| lo strumento «video» | `-c mcp_servers.video=…`: lo stesso comando di `bun run --cwd server mcp` (`serverVideo`, `server/src/chat/metodo.ts`), con la cartella di lavoro e le variabili `MANGO_ANIMATION_*` di chi lancia (Codex non passa agli strumenti altro dell'ambiente: la porta del server, Python), 30 secondi per accendersi e 600 per uno strumento, perché uno strumento aspetta un lavoro fino a 300 e Codex di serie ne concede 10 e 60. Parla col server di Mango Animation, che deve essere acceso | `plugin/codex.ts` |
| `CLAUDE.md` e regole | `-c developer_instructions=…` porta lo stesso testo che l'hook dà a Claude Code (`testoDelMetodo`) e le regole sempre attive del creator (`regoleDelCreator`: Codex non legge `.claude/rules/`). Il `CLAUDE.md` del creator lo legge Codex da sé dalla cartella di lavoro, con `-c project_doc_fallback_filenames=["CLAUDE.md"]`. Le istruzioni passano dalla riga di comando, che Windows limita a 32.767 caratteri: sopra i 30.000 il lanciatore si ferma con una frase invece di tagliarle | `plugin/codex.ts`, `plugin/metodo.ts` |
| `MANGO_ANIMATION_LAVORO` e `PYTHONPATH` per i comandi | `-c shell_environment_policy.set={…}`, con gli stessi valori della chat (`ambienteDelMetodo`) | `plugin/codex.ts` |

- **Per usare Codex da terminale**, nella cartella di lavoro e con il server acceso: `bun run <codice>/plugin/avvia-codex.ts`. Ciò che si scrive dopo va a Codex (`… avvia-codex.ts resume`). Il programma `codex` lo cerca nell'ordine
  di `docs/app/motori.md` (la variabile `MANGO_ANIMATION_CODEX`, il PATH, il pacchetto dello Store di Windows, che non lo mette nel PATH). Il lanciatore crea `.agents/skills/` nella cartella di lavoro e non tocca la configurazione di Codex del creator.
- **Mango Code** non legge i plugin di Claude Code: legge `CLAUDE.md`, `.claude/rules/` e `.claude/skills/` della cartella in più (`docs/CHAT.md`, «Mango Code»), e lo strumento «video» lo riceve da `POST /mcp`. Le stesse skill, nessuna copia.
- Le prove (`server/test/plugin.test.ts`) controllano manifesto e `claude plugin validate`, le skill, gli hook (le regole entrano in un hook o l'hook fallisce, niente fuori da una cartella di lavoro, la shell) e che il server MCP parta ed elenchi gli strumenti senza scheda video.
- Le prove di Codex (`server/test/plugin-codex.test.ts`) controllano i collegamenti delle skill e gli argomenti e, se `codex` c'è sul computer, con una `CODEX_HOME` solo sua e senza mai un giro col modello: `codex mcp list` mostra lo strumento «video» configurato, `codex debug prompt-input` mostra le istruzioni, il `CLAUDE.md` del creator e tutte le skill.
