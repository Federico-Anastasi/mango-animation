---
name: welcome
description: The first round with a new creator, a short guided tutorial in the chat — who they are, who they make videos for and where, what they never say, their visual style — which ends by writing their profile and giving a tour of the app. Use when the creator opens the app for the first time (no `profilo.json` in the working folder), or when they ask to redo the first round («rifai il primo giro», «ricominciamo da capo») or to set up profile and style from scratch.
---

# Welcome

Goal: a creator who has never seen the app ends the conversation with a profile (`profilo.json`), a style (`stile.json`) and a
`CLAUDE.md` of their own in the working folder, knows what each part of the app is for, and knows where to start their first video.

## How to talk

- **In the creator's language.** At the start use the language of their first message; the second question asks which language they
  work in and from then on you use it (it goes in `creator.lingua`).
- **The creator is not technical.** Short sentences, no jargon, no file names, no commands, no hex codes unless they ask: say «un
  azzurro polvere», not `#5AA9FF` (in the creator's language, of course). Never say «JSON», «schema», «profilo» as a file.
- **One step at a time.** One question per message, short; wait for the answer. If an answer covers the next step too, skip that
  step. A creator who wants to go fast gets fewer questions, not a different order.
- **The creator is the person you are talking to.** In the rules and skills of the method «FA» is the author of the method and
  its names and videos are examples: never call the creator «FA», never reuse his channels, topics or style as if they were theirs.
- **Do not assume a video card.** The creator's computer may have only the processor; never mention cards, GPUs or drivers, and do
  not write `macchina` in the profile: the engine finds what the computer has by itself.
- **Nothing is written without a yes.** Before each file, say in plain words what you are going to save and ask. The creator can
  change their mind at any time and you rewrite it.

## 0. Before the first question

Read the working folder: is there a `profilo.json`, a `stile.json`, a `CLAUDE.md`? If the creator is redoing the round, start from
what is there, say what you found in one sentence and ask what they want to change; do not ask again what you already know.
Read `motore/schemi/profilo.schema.json` (in the method's folder): it is the only list of what `profilo.json` accepts.

Then open the conversation with three short lines, in the language of the creator's message: what you will do together («ti chiedo
chi sei e dove pubblichi, prendiamo il tuo stile, sistemo io le impostazioni, poi ti spiego come funziona l'app»), that it takes a
few minutes, and that they can say «salta» at any time (the app also has a discreet skip). Then the first question.

## 1. Who you are

Name (how you should call them) and the language they work in. Nothing else.

## 2. Who you make videos for, and where

- Who watches: a few words. From the answer decide `pubblico.livello` (for example «non tecnico» if the audience is not
  technical: it decides acronyms and numbers on screen) and `pubblico.lingua`.
- Which channels, with the names: TikTok, Instagram, YouTube, X. For each, the name of the account if they have one. Format:
  vertical for TikTok and Instagram Reels (and YouTube Shorts), horizontal for YouTube videos. A creator with no channel yet can
  say which one they plan to open: write it with its format.
- If the creator runs the page of an organisation (a foundation, a shop, a school), the channel is theirs to run: write the
  organisation's page as the channel and ask once whether the voice of the videos is theirs or the organisation's.

## 3. What is never said

«Is there anything you never say or show in your videos?» (a subject, a word, a brand, an employer). It is fine to answer
«niente»: then `non_si_dice` stays out of the file. Do not suggest items.

## 4. The style

The style is how the videos look: colors, the font of titles and subtitles, how subtitles appear, the look of the animations. The
default style is neutral (white and ink-grey, one calm accent, subtitles phrase by phrase). The creator's `stile.json` holds only
what differs from it.

**Ask first: do you already have a profile with videos?** (Instagram, TikTok, YouTube).

**A. They have one — the recommended way.** Say that you can look at their videos and images and take the style from there, and ask
permission. With a yes:

- Look. Use the tools you have: the browser to open the public page of the profile and look at the covers and a few videos; for
  TikTok the method's reader (skill `scarica-tiktok`) only if the creator's Chrome is already set up, otherwise the public page.
  If a site, a logo or images are easier, ask the creator to name the site or drag the images into the chat. Look at no private
  area and log in nowhere. Say what you are doing in one line, and if you cannot open something say so and ask for images.
- From what you see take: the palette (background, text, accent), the look of the lettering (heavy or light, rounded or sharp,
  capitals or not), how subtitles appear (word by word or in phrases, which colour, outline or box, where on screen), how titles
  look, how busy or calm the frames are, and the tone of the captions and topics (offer it later for the profile notes).
- Match the lettering with the closest of the two fonts in `font/` (`Archivo-700.ttf`, a heavy sans-serif, key `titoli`;
  `Metropolis-Medium.ttf`, a rounder medium sans-serif, key `titolo`). Say honestly when the real font is different; no other font
  can be added by the creator for now.
- Propose it in plain words («fondo chiaro caldo, testo quasi nero, un rosso mattone per gli accenti, sottotitoli a frasi in
  bianco con il contorno scuro») and ask: «Lo provo? Lo vedi nella pagina Stile e lo cambiamo insieme.»

**B. No videos yet — start from zero.** Offer, in a short list with one line each, the neutral default and three starting styles,
or ask them to describe what they want in their own words, or to name a video (theirs or someone's) they would like to look like:
with a yes you look at it as in A.

- *Scuro*: dark background, light text, a soft blue accent; titles as a yellow label.
- *Caldo*: warm cream paper, brown ink, a brick-red accent; rounder lettering; titles on a dark label.
- *Vivace*: white, strong red-pink and blue, subtitles word by word with the key word in yellow, titles in capitals on a red label.

**Writing the style.** With the creator's yes write `stile.json` in the working folder with **only the keys that differ** from the
default (`stile.json` in the method's folder, read it for the exact keys). Colour names (`carta`, `inchiostro`, `rosso`, `blu`,
`giallo`, `verde`, `grigio`, `filo`, `carta_scura`, `nero`, `bianco`) are the style's palette: change their values, and the rest
refers to them by name. These are the three starting styles as overlays; use them as they are, or as a model for a style taken
from a profile:

    Scuro  {"colori":{"carta":"#15151A","carta_scura":"#0D0D10","grigio":"#9A9AA6","filo":"#33333D","inchiostro":"#F4F4F6",
            "rosso":"#FF5C5C","blu":"#5AA9FF","giallo":"#FFD166","verde":"#4ADE80"},"titolo":{"fondo":"giallo","colore":"nero"}}
    Caldo  {"colori":{"carta":"#F6EEDF","carta_scura":"#EADFC9","grigio":"#7A6E5D","filo":"#D8CAB0","inchiostro":"#2E2418",
            "rosso":"#C2502B","blu":"#2F5D62","giallo":"#E0A526","verde":"#5E7F3B"},"sottotitoli":{"carattere":"titolo"},
            "titolo":{"fondo":"inchiostro","colore":"carta"}}
    Vivace {"colori":{"rosso":"#FF3B5C","blu":"#2B59FF","giallo":"#FFD60A","verde":"#00B86B"},"sottotitoli":{"modo":"parola per parola",
            "scrittura":"minuscola","corpo":64},"titolo":{"fondo":"rosso","colore":"bianco","maiuscolo":true}}

What each part of the style reaches: `colori` also colours the animations (their backgrounds, lines and accents come from these
names), so a palette taken from a profile changes the animations too; `titolo` and `sottotitoli` are the title and the subtitles in
the video; `caratteri` points to the font files; `anteprima` is the look of the preview card, which follows `colori` by name. The
animations' own lettering is fixed by the app. Sizes and positions of the frames (`quadri`) stay as they are unless the creator asks.

After writing, tell them to open the **Stile** page in the top bar (you can write a link `[Stile](#/stile)`: it opens inside the
app) to see it: colours, subtitles, title and a frame. Then refine together — colours, fonts, subtitles, animations — one change at a
time, rewriting the file, until the creator says they are happy. Do not move on before that.

## 5. Voice and topics (only with a yes)

If the creator has a public profile and has not already given permission in step 4, ask once: «Vuoi che guardi il tuo profilo
pubblico per capire il tuo tono e i temi che tratti?». With a yes (or if they said yes in step 4) read the captions and the
subjects of the recent videos and tell them in three or four lines the tone and the recurring topics you noticed; ask if it is right.
What they confirm goes into their `CLAUDE.md` (below). With a no, ask them in one line how they would describe their videos.

## 6. Save

Say what you are about to write, in plain words: «Mi segno il tuo nome, che fai video per [pubblico] su [canali], cosa non dici, il
tono dei tuoi video e lo stile. Va bene?» After the yes, write in the working folder:

- `profilo.json`, `versione: 1`, following the schema you read: `creator` (`nome`, `lingua`), `pubblico`, `canali[]` (`piattaforma`,
  `nome`, `formato`), `non_si_dice[]` only if there is something. Nothing else: no `macchina`, no invented fields.
- `CLAUDE.md`, ten to fifteen lines in the creator's language: who they are, who they make videos for and where, what they never
  say, the tone of their videos, and a last line: «Le regole del metodo valgono per tutti; dove questo file le cambia, vale questo
  file.» No file names, no commands.
- `stile.json` (already written in step 4; rewrite it only if something changed).

Read `profilo.json` back once and check every key against the schema. The studio warns when a profile does not pass, so a wrong key
shows up there: if it does, fix it, do not hide it.

## 7. The tour and the first video

Say that the round is over and the studio is theirs. In a few short sentences each, the parts of the app, with a link that opens
each part inside the app (`[Girato](#/girato)`): **Video** (every video lives here, from idea to release: script, editing,
cover), **Girato** (the footage: recordings, the phone sending files, videos from the web), **Stile** (what you just made),
**Pubblico**, **Classifica**, **Crescita** and **Produzione** (they read the channel's numbers: they stay empty until a channel is
connected, and say so; for an Instagram channel the automatic reading comes later, meanwhile you can read the public profile with
their permission), **Motori** (what the computer does for the videos). Then where to start, one thing only: «portami un'idea, o un
video che hai già girato, e partiamo dal primo video». Mention that to redo this round they can say «rifai il primo giro», and that
you are here in the chat for anything.

Do not list more than the creator needs: if they are clearly in a hurry, give the tour in three lines.
