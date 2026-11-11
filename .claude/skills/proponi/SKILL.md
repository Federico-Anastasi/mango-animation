---
name: proponi
description: Proposes the next videos — from footage the creator brings, from projects already done in their sources, from what the audience asks and what went well, or from an idea of the creator's to discuss — and puts them in the archive as proposals. Use when the creator asks «cosa facciamo adesso», «cosa tiriamo fuori da qui», brings footage, points to a project or throws out an idea.
---

# Proponi

Goal: a few proposals in text, each with the reason why it should work, for the creator to choose. Where to start is told by the
creator's request; the four ways cross, but only one leads. The creator's profile says how they want proposals, what their line is and
where their sources are (`fonti_delle_idee`): read it first, then `.claude/metodo/contenuto.md` (and `.claude/metodo/montaggio.md`,
«When the creator says…», for the frame; `.claude/metodo/youtube.md` for a video for YouTube, if it is among the creator's `canali`).

**First look at what is out there.** Before proposing a video, and before measuring anything, search the web for what others have
already done on the same topic (their work, tools and measurements) and try the best ones. The creator's own work (a modified engine,
a test of their own) is fine, but it is placed beside the complete picture, not in its place.

## From footage («ti ho dato i video», a live recording, some takes)

1. The speech is in `archivio/preparati/<day>/<file>/` (`trascrizione.txt` for long files, otherwise `parole.json`; if missing,
   `girato_prepara` on the file; a video, or a stretch of one, that lives on the web comes into the Girato with `girato_scarica`).
2. Look for the moments: sentences that hook, passages that explain a single thing, lines that close.
3. Several videos from the same source have the same `serie`.

## From the projects («facciamo un video su…», «cosa abbiamo di già fatto?»)

1. Look in the creator's sources (`fonti_delle_idee` of the profile) for the work already done: experiments with a measured result,
   things built that can be shown. Read where the result is (experiment logs, READMEs, measurement logs, git history), not from
   memory.
2. An experiment is a video when it can be said in one sentence: what I tried, on what, what came out. The profile has examples.
3. For each proposal: the numbers that would go on screen, with the file and the date they come from, and whether they must be
   remeasured (the model is no longer on the disk, the measure is old or was made in other conditions).
4. These proposals ask for shooting: say how many takes and which animated scenes are needed.

## From the audience («cosa facciamo adesso?»)

1. The reading is the skill `numeri`'s (what went well, what people ask, the promises still open; it brings the data up to date with
   `scarica-tiktok` when they are old). Here it is used, not redone.
2. For each strong request look for what to answer with: first in the projects (above), then in the unused footage and in the
   proposals standing in the archive. If there is nothing, say what would need to be done.
3. A request outside the creator's line (profile) is flagged, it does not become a proposal.

## From the creator's idea («ho pensato a…», «e se facessimo…»)

0. When the idea is a video they saved on TikTok («l'ultimo che ho salvato»): the skill `scarica-tiktok` («Preferiti») gives it. The
   first one is the latest saved; watch its source before building on the caption.
1. It is a conversation, not a delivery: first say the idea back in one sentence to be sure you understood it, then bring two or three
   different ways to make a video of it (angle, hook, frame), not just one.
2. Support every way with what exists: a project that proves it, footage that contains it, an audience request that confirms it. If the
   idea has no support, say so and say what it would need.
3. Say your own view: which one you would make and why, and what in the idea does not hold. Then it is discussed: the proposals are
   written in the archive only when the creator keeps one.

## Every proposal

Proposals come first in text, then the edits. Each has:

- **where it comes from**: the moment of the footage, the project and its result, or the comment and the video that went well, with the
  number that says it;
- title, **hook**, **center**, **close** (with sentence and minute if the footage already exists), duration, frame;
- what is needed to make it: footage that exists, to be shot, measures to redo, scenes to draw.

Reread what the proposal states looking for errors (`contenuto.md`, «What is stated»); what does not add up is said next to it. Look at
what is already in `archivio/video/`: a proposal does not repeat a video already out. Order from the strongest to the weakest, saying
why, and bring the proposals to the creator in the chat.

Those they keep become videos with state `proposta` (`video_nuovo`, then with `scheda_cambia` the filled `proposta`; in `note` where it
comes from; in `canali` where it goes out, if the creator said). A video that starts from files of the footage gets them in `girato`
(`giorno/nome`): it is born with its plan. Even a draft to show (a slide, a drawing) is born there, in the video's `materiali/`: never
in a temporary folder.

**Every proposal has its preview**, so the creator who opens the Video list does not have to read titles: `video_nuovo` makes the card
with the title and the line `riga` (`materiali/anteprima.png`). If there is something better, put it over the card: a photo or a
drawing saved as `materiali/anteprima.png` (or `.jpg`: the most recent file wins), then look at it. A proposal already in the archive
without one (the list marks it «senza anteprima») gets it with `python -m motore anteprima-proposta <slug> --riga "<line>"`: without a
preview the video stays at «1 · idea» in the row of steps at the top of its page.

When the creator keeps a proposal to record, the next step is the script: skill `copione`.

## Do not

- Do not propose to fill.
- Do not edit before the creator has chosen.
- Do not draw a rule from a single video: say on how many videos what you state rests.
- Do not cite a result of a project without having opened the file that contains it.
