---
name: scena
description: Writes or corrects a video's animated scenes (the background behind the silhouette, or an animations-only video) — first in words on the fixed text, then a still frame, then the render tied to the words. Use when a video needs graphics, when the creator asks to change an animation (un'animazione), or to tie an animation to the words of the speech.
---

# Scena

Goal: animations that explain, at the pace of the voice, in the style of the videos released. Rules: «Voice and screen» and
«Animations» of `.claude/rules/montaggio.md`; no measure, color or threshold written in the scene's code: they come from the style
(`stile.json`). Before the still frames read «Screen» of `.claude/metodo/problemi-gia-visti.md`.

## How

1. **In words, first.** On the fixed text (`materiali/testo-registrato.md`, or the script if it has not been recorded yet) fill the
   `animazione` column: for each line what the scene shows and, in CAPITALS in the line, the words on which each thing enters. Propose
   it to the creator; they say what works and what does not. No drawing before their yes.
2. Read `animazioni/LEGGIMI.md` and look at the scenes of a released video close to this one. The scenes of a video live in
   `animazioni/scene/<slug>/` of the working folder (`scene.tsx`, one scene per point of the outline; the numbers in `dati.ts` next to it,
   each with where it comes from); `animazioni/src/scene/` of the product holds only the examples and the intro. Use the elements of `animazioni/src/standard/` before drawing new ones.
3. **A still frame** per scene: `scene_foto` with the sigla. The checks must give `superati` (texts above 40 px, nothing outside the
   band, background never still): every flag says what to correct. Copy the chosen frame from `animazioni/foto/` into `materiali/` and
   send it to the creator by opening it in the browser. Only after their yes, the render.
4. Tie the scene to the speech in the video's plan, with `piano_scrivi` (skill `monta`):
   - `ancore` when few things enter on precise words;
   - `parole` when the scene runs at the pace of the video: the scene reads the second of every word and never stays still waiting.
   The instants are taken from `parole`. Then `scene_foto` again: `superati`.
5. To see it under the voice without editing everything: `lavoro` with `comando: "anteprima"` and `scena: "<name>"`, `lavoro_aspetta`,
   then `foto` with `video: "anteprima"`. Then skill `monta`.
