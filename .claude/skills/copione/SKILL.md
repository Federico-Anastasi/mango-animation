---
name: copione
description: Writes the exact text of a video to record — hook, center, close, frame and scenes in words — from a proposal the creator has kept, and fixes it with them. Use when the creator says «scriviamo il copione», «scrivimi il testo», «il testo del video», or keeps a proposal to record.
---

# Copione

Goal: the proposal becomes the exact text to say, in the card, approved by the creator. Read the profile (their voice, what they never
say: `non_si_dice`), `.claude/metodo/contenuto.md`, and `.claude/metodo/montaggio.md` («When the creator says…») for the frame. If the video
is for TikTok or Instagram also `.claude/metodo/tiktok.md` (the close), for YouTube `.claude/metodo/youtube.md`.

## How

The fields of the `proposta` are in `docs/ARCHIVIO.md` («La scheda di un video»); they are changed with `scheda_cambia`.

- `aggancio` is **only the first sentence**; `centro` one sentence per line, with an empty line between one and the next, so the
  creator records single lines; `chiusa` the final question or stand.
- `quadro`: the video's frame.
- `scene`: for each animated scene, in order, `{ "animazione": "<sigla>", "dalla": "<first words of the sentence>" }`; in the chat,
  next to it, what each shows in one line. A scene without animation (the creator at full frame) has `null`; with a `girato`, someone
  else's footage runs muted under its sentences (skill `prova`).
- The text starts from the creator's words: their messages, their recordings, how they say things. Never sentences anyone could say;
  no director's notes in the text («here I show…»): what is seen goes in `scene`. The hook is short, and respects what the creator
  does not say; the close is not banal.
- The numbers seen on screen do not have to be put in the speech.

It is discussed until the creator says it is good. When you bring the script, link the card, `[Scheda](#/video/<slug>/scheda)`, and say
that they can correct it there too and you will reread it. Then the rehearsal: skill `prova`.
