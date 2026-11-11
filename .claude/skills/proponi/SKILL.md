---
name: proponi
description: Proposes the next videos — from footage the creator brings, from projects already done in their sources, from what the audience asks and what went well, or from an idea of the creator's to discuss — and puts them in the archive as proposals. Use when the creator asks «cosa facciamo adesso», «cosa tiriamo fuori da qui», brings footage, points to a project or throws out an idea.
---

# Proponi

Goal: a few proposals in text, each with the reason why it should work, for the creator to choose. Where to start is told by the
creator's request; the four ways cross, but only one leads. The creator's profile says how they want proposals, what their line is and
where their sources are (`fonti_delle_idee`): read it first, then `.claude/metodo/contenuto.md` (and `.claude/metodo/montaggio.md`, «When the creator says…», for the frame).

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

1. **What went well**: the `numeri` of the cards of the published ones, at equal days from release; what those above the average have
   in common (topic, hook, frame, duration, close).
2. **What people say**: the latest reading in `archivio/canali/tiktok/letture/` (if it is more than a day old, first the skill
   `scarica-tiktok`): comments and private messages, the questions that come back, the creator's promises still open. Group by request
   and count how many people make it.
3. For each strong request look for what to answer with: first in the projects (above), then in the unused footage and in the proposals
   standing in the archive. If there is nothing, say what would need to be done.
4. A request outside the creator's line (profile) is flagged, it does not become a proposal.

## From the creator's idea («ho pensato a…», «e se facessimo…»)

0. When the idea is a video they saved on TikTok («l'ultimo che ho salvato»): read `archivio/canali/tiktok/preferiti.json` (if it is not
   from today, or the creator saved something new, first `python -m strumenti.leggi_tiktok --solo-preferiti`, skill `scarica-tiktok`).
   The first one is the latest saved; watch its source before building on the caption.
1. It is a conversation, not a delivery: first say the idea back in one sentence to be sure you understood it, then bring two or three
   different ways to make a video of it (angle, hook, frame), not just one.
2. Support every way with what exists: a project that proves it, footage that contains it, an audience request that confirms it. If the
   idea has no support, say so and say what it would need.
3. Say your own view: which one you would make and why, and what in the idea does not hold. Then it is discussed: the proposals are
   written in the archive only when the creator keeps one.

## Every proposal

- **where it comes from**: the moment of the footage, the project and its result, or the comment and the video that went well, with the
  number that says it;
- title, **hook**, **center**, **close** (with sentence and minute if the footage already exists), duration, frame;
- what is needed to make it: footage that exists, to be shot, measures to redo, scenes to draw.

For a video for YouTube (when it is among the creator's `canali`), also `.claude/metodo/youtube.md`. Reread what the proposal states looking for errors; what does not add up
is said next to it. Look at what is already in `archivio/video/`: a proposal does not repeat a video already out. Order from the
strongest to the weakest, saying why, and bring the proposals to the creator in the chat. Those they keep become videos with state
`proposta` (`video_nuovo`, then with `scheda_cambia` the filled `proposta`; in `note` where it comes from; in `canali` where it goes
out, if the creator said). A video that starts from files of the footage gets them in `girato` (`giorno/nome`): it is born with its plan. Even a draft to show (a slide, a drawing) is born there, in the video's `materiali/`: never in a temporary
folder.

**Every proposal has its preview**, so the creator who opens the Video list does not have to read titles:
`video_nuovo` requires `riga` (one line saying what the video is about) and makes the card with the title and that line
(`materiali/anteprima.png`). If there is something better, put it over the card: a photo or a drawing saved as
`materiali/anteprima.png` (or `.jpg`: the most recent file wins), then look at it. A proposal already in the archive without one
(the list marks it «senza anteprima») gets it with `python -m motore anteprima-proposta <slug> --riga "<line>"`: without a preview the video stays at
«1 · idea» in the row of steps at the top of its page.

## The script (step 2 of `processo.md`)

When the creator keeps a proposal to record, the proposal becomes the exact text to say:

- `aggancio` is **only the first sentence**; `centro` one sentence per line, with an empty line between one and the next, so the
  creator records single lines; `chiusa` the final question or stand.
- `quadro`: the video's frame (`montaggio.md`, «When the creator says…»).
- `scene`: for each animated scene, in order, `{ "animazione": "<sigla>", "dalla": "<first words of the sentence>" }`; in the chat,
  next to it, what each shows in one line. A scene without animation (the creator at full frame) has `null`; with a `girato`, someone
  else's footage runs muted under its sentences (skill `prova`).
- The text starts from the creator's words: their messages, their recordings, how they say things. Never sentences anyone could say; no
  director's notes in the text to say («here I show…»): what is seen goes in `scene`. The hook is short, and respects what the creator
  does not say (`non_si_dice`); the close is not banal.
- The numbers seen on screen do not have to be put in the speech.

It is discussed until the creator says it is good; then skill `prova`. When you bring the script, link the card, `[Scheda](#/video/<slug>/scheda)`,
and say that they can correct it there too and you will reread it.

## Do not

- Do not propose to fill.
- Do not edit before the creator has chosen.
- Do not draw a rule from a single video: say on how many videos what you state rests.
- Do not cite a result of a project without having opened the file that contains it.
