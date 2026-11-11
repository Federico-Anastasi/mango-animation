---
name: carosello
description: Makes a carousel for TikTok — scrolling images instead of a video — from the idea to the checked slides. Use when the creator says «facciamo un carosello», «un post a immagini», «le slide», or asks to change a slide.
---

# Carosello

Goal: `uscite/slide-1.png`, `slide-2.png`, … (1080×1920), rendered from `materiali/carosello.html`, looked at and sent to the creator.
A carousel has no plan and no edited video. An example to start from: any published carousel in `archivio/video/` (`formato: "carosello"`);
the creator's profile may name its preferred one.

The content rules apply (`.claude/metodo/contenuto.md`): hook, structure, numbers with next to them where they come from, no jargon for a
non-technical viewer (`pubblico.livello`). The creator's own rules for carousels, if any, are in their profile.

## How

1. **The card.** If the carousel does not exist yet (`video_elenco`), create it with `video_nuovo` (`formato: "carosello"`) and give the
   creator the link to its page. In the `proposta` (with `scheda_cambia`): the hook (the first slide), the center (one line per slide),
   the close (a question that asks for the viewer's experience). The proposal is also written in the chat, in full: the creator does not
   see what is only in the card, and a question of choice names the things it talks about. As soon as the creator gives the direction,
   a first draft of the slides: it is discussed by looking at it, not on lists.
2. **The numbers.** Every number on screen comes from a measurement of the creator's or from a source read: the path goes in the card's
   `note`; what does not add up in `da_verificare`.
3. **The slides.** `python -m motore carosello <slug> --nuovo` writes `materiali/carosello.html` (only if it is not there) with the
   system of the example and three slides to replace (`docs/MOTORE.md`, «Il carosello»). One `<section class="slide">` per slide, the
   same world in all of them, title in capitals, a drawing that shows the thing (a bar, a comparison) instead of a list. Colors and
   measures are the variables at the head of the page: do not write them by hand elsewhere. The bottom part stays free for the
   caption, the right side for the TikTok buttons. The page is changed with Edit, one piece at a time.
   - *The creator's sticker*: made from a take already cut out (`strumenti/LEGGIMI.md`, «sticker»); the opening slide uses the one in
     `archivio/sticker/`.
   - *The creator's photos from the phone*: the page uses `archivio/preparati/<day>/<file>/foto.jpg` (whole and upright, also for the
     iPhone HEICs), never the file in `grezzo/`.
   - *Real objects cut out*: `strumenti/LEGGIMI.md`, «oggetti». Recognizable, generic objects are chosen (an iPhone seen from the
     front, any video card), never screenshots or foreign writing. The credit that a license asks for goes in `da_verificare` until
     release.
4. **The render.** `lavoro` with `comando: "carosello"`, never in the same round as the edit to the page. The warnings go to zero, or
   are told to the creator one by one: each says which text and where (the phone's sides, the caption zone, outside its box or the
   slide, too small for the phone, overlapping another). Fix it in the page. Two need the cause: an image or a font that does not
   load is a wrong path; a slide *vuota* has little to say or the drawing is missing, so what shows the thing is added, or it is
   merged with another.
5. **Look at them.** `slide` (all, or `numeri`): each slide reads on its own in small, the numbers are those of the card, nothing
   overlaps. Then to the creator: `apri` with `video` and `scheda: "slide"`.
6. **The creator's corrections** are all collected and applied in one round in the source; then 4 and 5 again.
7. **The release** goes through `pubblicazione` (caption, hashtags; the creator publishes).
