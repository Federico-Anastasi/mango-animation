---
name: monta
description: Edits or re-edits a video of the archive — writes or corrects the plan, resolves, edits, checks and sends the version to the creator; for a correction it first makes the preview of the touched piece. Use for every «monta», «rimonta», «correggi il video», «togli quella pausa», «cambia il taglio».
---

# Monta

Goal: a clean `uscite/con-copertina.mp4` that respects the editing rules, sent to the creator. Before writing or correcting the plan
read `.claude/metodo/montaggio.md` (rules and frames), `.claude/metodo/taglio-e-voce.md` and `.claude/metodo/quadro-e-sagoma.md` (the defects
already met are not made again). If the video is for TikTok or Instagram also `.claude/metodo/tiktok.md`; for YouTube
`.claude/metodo/youtube.md`.

The plan (`docs/PIANO.md`) is written whole with `piano_scrivi` and corrected with `piano_ritocca` (only the fields touched, by path);
both queue `risolvi` by themselves and keep the previous version (`piano_annulla`).

## The first edit

1. `video_leggi`: card and plan. Read `materiali/testo-registrato.md`, the fixed text (skill `testo`: the takes are already
   transcribed). The frame: «When the creator says…» of `montaggio.md`.
2. Write the plan from the fixed text, line by line, with `piano_scrivi`. Scenes and sources get a name in words (`hook`, `demo`), not
   `c1` or the name of the file: the studio shows them as written.
   - short takes, one per sentence: timed pieces; edges from the times of `parole`;
   - continuous speech (a live recording): pieces by words (`minuto`, `dice`);
   - animated scenes: `ancore` or `parole` (skill `scena`);
   - the cover: `copertina` in the plan (skill `copertina`), before the edit: `monta` puts it as the first frame.
3. `valida`: it also looks at what `piano_scrivi` does not look at (the animations, the words of `dice`) and gives the warnings.
4. `video_leggi`: if `lavoro` is the `risolvi`, `lavoro_aspetta` with its id and read again. With `risolto_aggiornato` true, read
   `risolto.avvisi`: every cut in speech is listened to again or moved; two stretches of the same source that overlap are corrected.
5. Tell the creator the edit starts and on how many seconds (`risolto.durata`), and wait for the go. Then `lavoro` with
   `comando: "monta"`, `lavoro_aspetta` until it ends.
6. Skill `controlla`. What the check finds is corrected in the plan and re-edited: a video with a known defect is not sent to the
   creator without saying so.
7. To the creator the full video, with two lines: what changed, what remains doubtful.

## A correction

1. Collect **all** the creator's notes of this round before touching the plan.
2. `video_leggi`: if `lavoro` is a `monta` of this video, the previews would wait for its end. Tell the creator: they stop it from the
   studio's jobs panel («Ferma»).
3. Apply the notes in a single `piano_ritocca` (and in the scenes). A correction touches its piece, it does not rewrite the plan.
4. For every touched piece: `lavoro` with `comando: "anteprima"` and `scena: "<name>"` (or `da` and `a`, seconds of the video),
   `lavoro_aspetta`, then `foto` with `video: "anteprima"` at the seconds of the piece. The preview renders only the scenes and
   stretches of the piece, the same files the edit then uses. Show it to the creator saying it is a preview
   (`uscite/anteprima.mp4`). It is repeated until the creator has nothing else to say.
5. Only then `lavoro` `monta` (redoes only what changed, the cover included) and skill `controlla`.

A video already published is re-edited only as a test: before the edit read the last step of the skill `controlla`.

## Do not

- Do not add sounds, writings or effects not asked for: if you think they are needed, propose them separately.
