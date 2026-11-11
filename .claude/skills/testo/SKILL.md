---
name: testo
description: From the recordings to the video's text — transcribes the takes at once, finds every sentence of the script and the spoken variants, proposes to the creator the text to edit with take and seconds, and fixes it. Use as soon as the creator sends the recordings («ti ho mandato i video», «ho registrato»), or when they ask «cosa teniamo», «quale ripresa».
---

# Testo

Goal: `materiali/testo-registrato.md`, the text the video will say, line by line, each with its take. It is approved by the creator
before an animation or a cut is touched.

## How

1. **The takes come in.** They arrive from the phone in `archivio/grezzo/<day>/`. `video_leggi`, then `piano_scrivi` with the takes among
   the `sorgenti` (a name per take, for example for `IMG_0001` `"0001": { "file": "<day>/<file name in grezzo>" }`) and the video's
   proper names in `sottotitoli.nomi`: the transcription uses them to write them right. If the plan does not exist yet, it starts with
   `"quadro": "girato-pieno"` and a single scene with one piece per take: `{ "nome": "girato", "pezzi": [{ "sorgente": "0001" }, …] }`.
   The real plan is written by the skill `monta`.
2. **Transcribe at once**: `lavoro` with `comando: "prepara"`; tell the creator the `stima` (`null`: it is not known how long it takes),
   then `lavoro_aspetta` until it ends. Every take is transcribed in voice segments (no sentences repeated in a loop, false starts stay
   separate) and the words invented in silence are already removed. The words with their times are in
   `archivio/preparati/<day>/<file>/parole.json`.
3. **Find the sentences.** For every sentence of the script (`proposta`): every time it was said, in which takes and at which seconds;
   which is the best (whole, without stumbles, with the right rhythm, the last syllable not eaten). A sentence said twice in a take, the
   second time at its end, is the creator redoing it after a stumble: the redone one is the version to keep, the first is the false start
   (the words show it twice). Also mark what the creator said in
   addition off the cuff that is worth keeping, and the sentences of the script they did not say.
4. **Propose to the creator** the edited text, in a few lines per sentence: the sentence as it is said, the take and the seconds, what
   changes with respect to the script; then what stays out and why. Reread what it states looking for errors (`.claude/metodo/contenuto.md`, «What is
   stated»).
5. **Discuss until the creator fixes it.** Then write `materiali/testo-registrato.md` (below) and bring into `proposta` the hook,
   center and close of the fixed text.
6. Move to the skill `scena` for the animations column, then to `monta`.

## `materiali/testo-registrato.md`

Two lines at the top: who approved it and when, and from which takes it comes. Then a table:

    | # | battuta | ripresa | animazione |
    |---|---|---|---|
    | 1 | The hook, with the WORDS on which things enter in capitals… | 0001 1.8–13.3 | what the scene shows… |

- `ripresa`: the name of the source and the seconds in the take; `|` separates two tries sewn together.
- In CAPITALS the words on which what the scene shows enters (the `animazione` column is filled by the skill `scena`).

## Do not

- Do not write transcription scripts in the video's folder: the transcription is that of `prepara`. If a take must be redone, its
  `parole.json` is removed from the prepared files and `lavoro` `prepara` is relaunched.
- Do not choose between two takes without having listened to them where they differ: the transcription is wrong by up to half a second.
- Do not edit before the creator has fixed the text.
