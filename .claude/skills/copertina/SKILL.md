---
name: copertina
description: Makes a video's cover — a full-frame image with the creator's silhouette and the title on it — and the video with the cover as its first frame. Use when the creator asks for the cover (la copertina) or before calling a video ready.
---

# Copertina

Goal: `uscite/copertina.png`, and `uscite/con-copertina.mp4` (the edited video with the cover as its first frame, which is also
`finale.mp4`). For a vertical video on TikTok or Instagram the title keeps to `.claude/metodo/tiktok.md`.

The cover is the first frame of the video, never a separate image: either the true first frame of the edited video, or a drawing put
in front as the first frame (`con-copertina.mp4`). There is no such thing as a video «without a cover»: the first frame is looked at.
The only rule: the cover is never white or empty (a video that opens on an animated scene has an almost white first frame). The
background is chosen video by video; for example:

- a frame of the video at its fullest moment (the diagram built, the result): the scene rendered in `lavoro/scene/<sigla>.mp4`, without
  silhouette or subtitles, or the frame of the edited video for a screen-only video;
- a drawing made on purpose, inspired by the video (for example in 3D, kept in the video's `materiali/`).

For several parts from the same source, a different background for each.

## How

1. Choose the background (1080×1920) and save it in the video's `materiali/`.
2. Declare it in the plan with `piano_ritocca`: `copertina: { "disegno": "materiali/<background>.png" }`, and `istante` (the second of
   the video from which to take the silhouette) if in the first frame the creator has closed eyes.
3. `lavoro` with `comando: "copertina"` (the drawing and the instant are the plan's): it puts the silhouette of the first frame where
   it is in the video, and the style's title. It does not edit anything. Look at `uscite/copertina.png`: full, face with open eyes
   and not covered, the title as the style writes it and below the top quarter. Show it to the creator.
4. `monta` puts that image as the first frame of the edited video, in the same encoding: no second compression, and
   `con-copertina.mp4` is the same file as `finale.mp4`. After every `monta` the cover is redone with the same drawing; to change it,
   change the plan and re-edit.

A long horizontal video (YouTube) shows no silhouette of its own: declare in `copertina`
`sagoma: { "sorgente": "<a vertical take of the plan>", "istante": <second of that take> }` (the silhouette goes on the left with a
white border; if that frame has no silhouette yet, only that frame is cut out) and, if you want chosen line breaks,
`righe: ["…", "…"]` (the title goes on the right, one box per line).
