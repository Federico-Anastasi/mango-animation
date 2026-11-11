# Mango Animation

The archive and editing bench for a creator's videos. You work in the working folder; the studio (the interface) shows the same files.
How it is built: `docs/ARCHITETTURA.md`. The data: `docs/ARCHIVIO.md`. Editing: `docs/PIANO.md`, `docs/MOTORE.md`.
Every video follows the checklist in `.claude/rules/processo.md` (idea, script, rehearsal, recorded text, animations, editing,
corrections, release); each step has its own skill in `.claude/skills/`. What only some steps need is in `.claude/metodo/`, and the
skills of those steps read it: the editing rules and the frames (`montaggio.md`), the content rules (`contenuto.md`), the defects
already seen, YouTube. Read `montaggio.md` before choosing a frame, cutting, composing a scene or checking an edit, and `contenuto.md`
before proposing a video or writing a script or a caption.

## The creator's profile

This method is the same for everyone. What belongs to the creator (voice, audience, channels, kind of video, how they want proposals,
their sources, their machine) is not here: it is their **profile** (`docs/PROFILO.md`), in the data folder, which is your working folder:

- `CLAUDE.md`: who the creator is and where their rules are;
- `.claude/rules/`: their rules (voice, ideas, channels, machine, and so on);
- `profilo.json`: the data that skills and code read: `creator` (`nome`, `lingua`), `pubblico` (`livello`, `lingua`, `testate`),
  `canali[]` (`piattaforma`, `nome`, `formato`), `non_si_dice[]`, `fonti_delle_idee[]`,
  `macchina` (`scheda_video`, `scheda_registrazione`, `profilo_chrome`, `disco_quasi_pieno`);
- `stile.json`: their style; what it writes overlays, key by key, the default style of the product.

The creator is whoever uses the app and talks to you; their name is in `profilo.json`. A working folder with no `profilo.json` belongs
to a creator who has not done the first round yet: follow the skill `welcome` (a short chat that asks who they are, where they publish
and what style they want, and writes their profile). If they ask for something else first, do that and offer the round in one line.

Read the profile before you propose, write, cut or publish anything. **Where the profile changes a default of this method, the profile
wins.** In every rule and skill, «the creator» is the person whose profile it is. Rules tied to a platform (TikTok, Instagram, YouTube)
are active when that platform is among the creator's `canali`.

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
- **The tool first, the shell for what no tool does**: `video_*`, `piano_*`, `scheda_cambia`, `lavoro`, `girato_*` (a take is prepared and a web
  video downloaded only through them) and `apri` (the only way to show the creator a page or a file). For anything of your own
  outside the normal work, the shell is fine.
- **The card is always up to date**: the creator reads and corrects the script from the card in the studio, not from the chat. Every
  change of script, proposal or notes goes into the card (`scheda_cambia`), and `video_leggi` must then give the new text.
- **Run commands from the folder you are already in**: no `cd` to the full path in front.
- **Say how long it will take** before work that lasts more than a few tens of seconds (a queued job, a long command, a wait): the queue's
  estimate when the job has one (`lavoro`, `lavoro_stato`), your own guess otherwise; `stima: null` means the queue does not know, so never an
  invented figure. If it runs over, say so again with the new estimate.
- **Speak the creator's language** (`creator.lingua` in `profilo.json`), also in the short sentences between one step and the next.
