---
name: scena
description: Writes or corrects a video's animated scenes (the background behind the silhouette, or an animations-only video) — first in words on the fixed text, then a still frame, then the render tied to the words. Use when a video needs graphics, when the creator asks to change an animation (un'animazione), or to tie an animation to the words of the speech.
---

# Scena

Goal: animations that explain, at the pace of the voice, in the style of the videos released. Read «Voice and screen» of
`.claude/metodo/montaggio.md` and `.claude/metodo/animazioni.md`; for a vertical video on TikTok or Instagram also `.claude/metodo/tiktok.md`.
No measure, color or threshold is written in the scene's code: they come from the style (`stile.json`).

## The rules of the scenes

What is drawn:
- A drawing that shows the thing, never an animated bullet list; every concept has its moment. Simple, and physically right: a
  diagram shows things where they really are. No glows, gradients, soft shadows, decorative movement.
- Everything inside the animation band; below sit the head and the subtitles.
- One video, one world: the same drawing style in all scenes, and whoever is the protagonist is always the same character, in the
  same color. Real pages and drawings alternate, but each stays coherent.
- A long concept is told with a single scene that grows while the voice names its pieces, not with detached scenes: the viewer stays
  to see what will be built.
- No element on screen with no tie to the voice: a window scrolling by itself in a corner distracts.

How it moves:
- The background is a simple drawing and a single slow movement per scene (a bar that grows, a piece that travels, a number that
  counts), which shows the thing being talked about; what the voice names enters on top of it, on its word. Holding the previous
  scene's drawing longer is not enough. The same motif does not return in every scene: flashing grids and blocks filling everywhere
  tire; they are used where they explain, once or twice in the video. No half states: a thing is either full or not there.
- A still recorded screen is a still background: while the voice speaks and nothing happens on it, something else goes on top (the
  comments being talked about passing quickly, an animated scene), or the framing moves toward what the voice names.

What is shown:
- **Writings complement the speech, they do not repeat it**: a figure the voice does not say can be on screen if it explains what the
  voice says. In questions, little scenes, not the sentence written while it is said (it duplicates the subtitles).
- **A named product has its logo on screen**, entering on the word, and where the name returns the logo returns too. The logos live in
  `animazioni/src/standard/loghi/`, each with its origin and license beside it; one that is missing is added there.
- **Newspaper pages are from the outlets of the audience** (`pubblico.testate`, in the audience's language). The original pages (a
  product's site, GitHub) serve as proof, for a name or a number, not for sentences to read.
- **In news videos, real pages and photos**: the document, the press release, the person being talked about. Only what a photo does
  not show is drawn (the creator's opinion, a concept). One page per topic, still: the camera scrolls over it and circles the
  sentences, without making it reappear at every sentence. Between three articles and the official source, the official source.
- **A highlighted sentence sits in the upper half**: the page must be long enough for the camera to bring it there; below sits the
  creator's head.
- **The screen fills the frame**: only the part of the page being talked about is framed, narrow enough to fill the width and as much
  height as possible; never a wide window shrunk into a strip. For a vertical video the screen is recorded in a tall, narrow window.

## How

1. **In words, first.** On the fixed text (`materiali/testo-registrato.md`, or the script if it has not been recorded yet) fill the
   `animazione` column (format: `docs/ARCHIVIO.md`, «La scheda di un video»): for each line what the scene shows and, in CAPITALS in the
   line, the words on which each thing enters. Propose it to the creator; they say what works and what does not. No drawing before
   their yes.
2. Read `animazioni/scene.md` (how a scene is written) and `animazioni/standard.md` (the standard elements), and look at the scenes of a released video close to this one. The scenes of a video live in
   `animazioni/scene/<slug>/` of the working folder (`scene.tsx`, one scene per point of the outline; the numbers in `dati.ts` next
   to it, each with where it comes from); `animazioni/src/scene/` of the product holds only the examples and the intro. Use the
   elements of `animazioni/src/standard/` before drawing new ones. A real page (an article, a press release) or a photo from the
   computer goes on screen from `materiali/pagine.json` (`url`: the address, or `file:///…` for a photo), taken with
   `python -m motore pagina <slug>` (`docs/MOTORE.md`, «Le pagine vere»).
3. **A still frame** per scene: `scene_foto` with the sigla. The checks must give `superati` (texts above 40 px, nothing outside the
   band, background never still): every flag says what to correct. Copy the chosen frame from `animazioni/foto/` into `materiali/`
   and show it to the creator. Only after their yes, the render.
4. Tie the scene to the speech in the video's plan, with `piano_ritocca` on the scene (the whole plan is written by `monta`):
   - `ancore` when few things enter on precise words;
   - `parole` when the scene runs at the pace of the video: the scene reads the second of every word and never stays still waiting.
   The instants are taken from `parole`. Then `scene_foto` again: `superati`.
5. To see it under the voice without editing everything: the preview of the scene (skill `monta`, «A correction», step 4).
