# Mango Animation

The archive and editing bench for a creator's videos. You work from the terminal in the working folder; the interface in the browser
(`http://127.0.0.1:47431`) shows the same files. How it is built: `docs/ARCHITETTURA.md`. The data: `docs/ARCHIVIO.md`. Editing:
`docs/PIANO.md`, `docs/MOTORE.md`.
Every video follows the checklist in `.claude/rules/processo.md` (idea, script, rehearsal, recorded text, animations, editing,
corrections, release); each step has its own skill in `.claude/skills/`. The other rules are in `.claude/rules/`; those needed only at
one step (the defects already seen, YouTube) are in `.claude/metodo/`, and the skills of that step read them.

## The creator's profile

This method is the same for everyone. What belongs to the creator (voice, audience, channels, kind of video, how they want proposals,
their sources, their machine) is not here: it is their **profile** (`docs/PROFILO.md`), in the data folder, which is your working folder:

- `CLAUDE.md`: who the creator is and where their rules are;
- `.claude/rules/`: their rules (voice, ideas, channels, machine, and so on);
- `profilo.json`: the data that skills and code read: `creator` (`nome`, `lingua`), `pubblico` (`livello`, `lingua`, `testate`),
  `canali[]` (`piattaforma`, `nome`, `formato`), `non_si_dice[]`, `fonti_delle_idee[]`,
  `macchina` (`scheda_video`, `scheda_registrazione`, `profilo_chrome`, `disco_quasi_pieno`);
- `stile.json`: their style; what it writes overlays, key by key, the default style of the product.

Read the profile before you propose, write, cut or publish anything. **Where the profile changes a default of this method, the profile
wins.** In every rule and skill, «the creator» is the person whose profile it is. Rules tied to a platform (TikTok, YouTube) are active
when that platform is among the creator's `canali`.

## Rules

- **The plan is the only truth of an edit**: change `piano.json`, never the files in `lavoro/`.
- **What repeats lives in the engine**: no scripts in a video's folder for work that will be needed again.
- **Standards live in `stile.json`**: a video that departs from them declares it in its plan, not in the code.
- **The footage is not touched**: `archivio/grezzo/` is read-only; nothing is deleted from the archive without the creator's yes.
- **One heavy job at a time** on the video card.
- **A large video is linked, not copied.** If the profile says the disk is nearly full (`macchina.disco_quasi_pieno`), treat it as a hard limit.
- **Before saying «done»** look at the result: frames next to the words, audio listened to again.

## How you work

- **Answer directly and concisely**: the result first, in a few lines; details only if the creator asks for them or if a choice depends on them.
- **Files are changed with Edit and Write**, which the creator can see and undo, not with scripts that rewrite them.
- **The tool first, the shell for what no tool does**: `video_*`, `scheda_cambia`, `piano_scrivi`, `piano_ritocca`, `lavoro`, `girato_prepara` (a take is
  prepared through the queue, never `python -m motore prepara-file` from the shell), `girato_scarica` (a video, or a stretch of one,
  from the web into the Girato, never yt-dlp by hand), `apri` (to show the creator a page or a file in the browser: the studio's addresses ask
  for a key that you never read or write). For anything of your own outside the normal work, the shell is fine.
- **The card is always up to date**: the creator reads and corrects the script from the card in the studio, not from the chat. Every
  change of script, proposal or notes goes into the card (`scheda_cambia`), and `video_leggi` must then give the new text.
- **Run commands from the folder you are already in**: no `cd` to the full path in front.
- **Say how long it will take.** Before work that lasts more than a few tens of seconds (a queued job, a long command, a wait), say roughly
  how long you expect it to take («about 3 minutes», «around 15:42»): the queue's estimate when the job has one (`lavoro` and `lavoro_stato`
  give it), your own guess otherwise, and never an invented figure when the queue says it has none. If it runs over, say so again with the new estimate. A few words.
- **Speak the creator's language** (`creator.lingua` in `profilo.json`), also in the short sentences between one step and the next.
