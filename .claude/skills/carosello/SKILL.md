---
name: carosello
description: Makes a carousel for TikTok — scrolling images instead of a video — from the idea to the checked slides. Use when the creator says «facciamo un carosello», «un post a immagini», «le slide», or asks to change a slide.
---

# Carosello

Goal: `uscite/slide-1.png`, `slide-2.png`, … (1080×1920), rendered from `materiali/carosello.html`, looked at and sent to the creator.
A carousel has no plan and no edited video. An example to start from: any published carousel in `archivio/video/` (`formato: "carosello"`);
the creator's profile may name its preferred one.

The content rules apply (`.claude/rules/contenuto.md`): hook, structure, numbers with next to them where they come from, no jargon for a
non-technical viewer (`pubblico.livello`). The creator's own rules for carousels, if any, are in their profile.

## How

1. **The card.** The creator asks for the carousel in words: if it does not exist yet (`video_elenco`), create it with `video_nuovo`
   (`formato: "carosello"`, and `riga`: the line that says what the carousel is about, which goes on its preview card) and give them
   the link to its page; once the first slide exists, the list shows it instead of the card. In the `proposta` (with `scheda_cambia`, never writing `scheda.json` by
   hand): the hook (the first slide), the center (one line per slide), the close (a question that asks for the viewer's experience).
   The proposal is also written in the chat, in full: the creator does not see what is only in the card, and a question of choice names
   the things it talks about. As soon as the creator gives the direction, a first draft of the slides: it is discussed by looking at it,
   not on lists.
2. **The numbers.** Every number on screen comes from a measurement of the creator's or from a source read: the path goes in the card's
   `note`; what does not add up in `da_verificare`.
3. **The slides.** `python -m motore carosello <slug> --nuovo` writes `materiali/carosello.html` (only if it is not there) with the
   system of the example and three slides to replace: the opening (with the creator's sticker, if there is one in `archivio/sticker/`),
   a drawing, the close. One `<section class="slide">` per slide, 1080×1920, the same world in all of them, a number «n/N» at the top,
   title in capitals, a drawing that shows the thing (a bar, a comparison) instead of a list. Colors and measures are the variables at
   the head of the page: do not write them by hand elsewhere. The bottom part stays free for the caption, the right side for the TikTok
   buttons. The page is changed with Edit, one piece at a time: no scripts that rewrite it.
   - *New sticker*: `python -m strumenti.sticker --provini [day]` makes the numbered sheets of expressions from the takes already cut
     out; they are looked at, then `python -m strumenti.sticker <day/file> <instant> <name>` with the chosen number (`provini.json`
     says file and instant).
   - *The creator's photos from the phone*: the server converts them on arrival into `archivio/preparati/<day>/<file>/foto.jpg` (whole
     and upright, also the iPhone HEICs, which the browser does not show): in the page that one is used, never the file in `grezzo/`.
   - *Real objects cut out*: `python -m strumenti.oggetti cerca <slug> <name> "<words>"` (free photos from Wikimedia Commons, a sheet
     of proofs to look at), then `prendi <slug> <name> <number>` (`--intero` if the crop comes out badly); the licenses in
     `materiali/oggetti/fonti.json`, and the credit they ask for goes in `da_verificare` until release. Recognizable, generic objects
     are chosen (an iPhone seen from the front, any video card), never screenshots or foreign writing.
4. **The render.** `lavoro` with `comando: "carosello"`, then `lavoro_aspetta` (never in the same round as the edit to the page). The
   lines say how many slides and the warnings; they go to zero, or are told to the creator one by one:
   - *lato, didascalia*: the text goes back into the safe zone;
   - *immagine, carattere*: the path is wrong;
   - *piccolo*: the text is enlarged, or removed (the minimum is `carosello.testo_minimo` of `stile.json`);
   - *tagliato*: the box is widened, the text shortened or wrapped;
   - *accavallato*: they are moved, or one of the two is removed;
   - *vuota*: the slide has little to say, or the drawing is missing: what shows the thing is added, or it is merged with another.
5. **Look at them.** `slide` (all, or `numeri`; if the render is still running it waits for it to finish): each slide reads on its own
   in small, the numbers are those of the card, nothing overlaps. Then to the creator: `apri` with `video` and `scheda: "slide"`.
6. **The creator's corrections** are all collected and applied in one round in the source; then 4 and 5 again.
7. **The release** goes through `pubblicazione` (caption, hashtags; the creator publishes).
