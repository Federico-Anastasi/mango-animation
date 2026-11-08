---
name: traduci
description: Makes the version of an archive video in another language — all texts translated, the audio as it is — and edits it. Use when the creator asks «la versione inglese», «traduci questo video», «mettilo in inglese per X».
---

# Traduci

Goal: a `<slug>-<language>` that is the same video, with **every text written in another language** — subtitles, title, cover,
writings inside the animations — and **the original voice** (the audio is not touched: it is the identity of the channel). Mechanism in
the plan: `docs/PIANO.md`, entries `lingua` and `sottotitoli.traduzione`.

## How

1. The starting video must be resolved: the true lines (in Italian) are in `lavoro/risolto.json` (`battute[].testo`).
   **Do not copy them by hand**: they are generated from there, so they match to the character.
2. Create the folder `archivio/video/<slug>-<language>/` with its `scheda.json` (translated `titolo`, `stato: "in lavorazione"`,
   `creato`: today, `YYYY-MM-DD`), then `piano_scrivi` with the plan (the example translates from Italian to English):

       { "base": "<slug>", "lingua": "en",
         "sottotitoli": { "modo": "a battute",
                          "traduzione": [ { "it": "<Italian line>", "en": "<English line>" }, … ] },
         "titolo": { "testo": "<translated title>", "da": 0, "a": … } }

   One row per line, **in order**, with `it` identical to `battute[].testo`: if the original plan
   changes, `risolvi` notices and stops instead of silently going out of phase.
   `modo` is declared «a battute» if the original is «parola per parola» (otherwise `risolvi` stops).
   `titolo` is put **only if the video has a title**, with the translated text and `da`/`a` copied from the original.
3. **Translate by line**, not by sentence: every row stays in its line (about 20 characters, one or two seconds). A long translated row
   is shortened. They are fragments: they are read one after the other.
4. **The writings of the scenes** are the scene's own: its component receives `lingua` (the plan's language, `"it"` if the plan has
   none) and writes its texts in that language. They live in `testi.ts` next to the scene, in the creator's folder
   `<lavoro>/animazioni/scene/<slug>/` (`animazioni/LEGGIMI.md`, «Le scene del creator»): an object per language with the same keys.
   Add the new language there; a scene whose texts are written inside the component first gets a `testi.ts` that the component reads by
   `lingua`. Numbers written with `decimali` of `impianto.ts` already follow the language.
5. `valida` on the variant; `piano_scrivi` has queued `risolvi` (skill `monta`, steps 4-6: resolved, edit with the creator's go,
   check).
6. Look with `foto` at the seconds where there are subtitles and scene writings, on the variant and on the original, and compare them.
7. Card of the variant: `stato: "pronto"`. The cover, if the video has one with text inside, must be redone translated by hand (the
   drawing is the creator's).

## Do not

- Do not translate `voce` and `parole` of a scene: they are the map for recording, they do not end up in the frame.
- Do not use `"parola per parola"` with translated subtitles: the translated words are not the ones said. They stay `"a battute"` (the
  original timing, the translated text).
- Do not touch the plan of the starting video: the variant is a video on its own, which starts from that one with `base`.
- Do not dub: the audio stays the recorded one.
