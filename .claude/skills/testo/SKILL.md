---
name: testo
description: From the recordings to the video's text — transcribes the takes at once, finds every sentence of the script and the spoken variants, proposes to the creator the text to edit with take and seconds, and fixes it. Use as soon as the creator sends the recordings («ti ho mandato i video», «ho registrato»), or when they ask «cosa teniamo», «quale ripresa».
---

# Testo

Goal: `materiali/testo-registrato.md`, the text the video will say, line by line, each with its take (format: `docs/ARCHIVIO.md`, «La
scheda di un video»). It is approved by the creator before an animation or a cut is touched. Read `.claude/metodo/contenuto.md` («What is
stated») and `.claude/metodo/taglio-e-voce.md`: choosing a take is the first cut.

## How

1. **The takes come in.** They arrive from the phone in `archivio/grezzo/<day>/`. `video_leggi`, then `piano_scrivi` with the takes among
   the `sorgenti` (a name per take, for example for `IMG_0001` `"0001": { "file": "<day>/<file name in grezzo>" }`) and the video's
   proper names in `sottotitoli.nomi`: the transcription uses them to write them right. If the plan does not exist yet, it starts with
   `"quadro": "girato-pieno"` and a single scene with one piece per take: `{ "nome": "girato", "pezzi": [{ "sorgente": "0001" }, …] }`.
   The real plan is written by the skill `monta`.
2. **Transcribe at once**: `lavoro` with `comando: "prepara"` (the words with their times end in
   `archivio/preparati/<day>/<file>/parole.json`).
3. **Find the sentences.** For every sentence of the script (`proposta`): every time it was said, in which takes and at which seconds;
   which is the best (whole, without stumbles, with the right rhythm, the last syllable not eaten). A sentence said twice in a take, the
   second time at its end, is the creator redoing it after a stumble: the redone one is the version to keep, the first is the false start
   (the words show it twice). Also mark what the creator said in addition off the cuff that is worth keeping, and the sentences of the
   script they did not say. Between two takes, listen to them where they differ: the transcription is wrong by up to half a second.
4. **Propose to the creator** the edited text, in a few lines per sentence: the sentence as it is said, the take and the seconds, what
   changes with respect to the script; then what stays out and why. Reread what it states looking for errors.
5. **Discuss until the creator fixes it.** Then write `materiali/testo-registrato.md` and bring into `proposta` the hook, center and
   close of the fixed text.
6. Move to the skill `scena` for the animations column, then to `monta`.

## Do not

- Do not edit before the creator has fixed the text.
- If a take must be transcribed again, its `parole.json` is removed from the prepared files and `prepara` is relaunched; no
  transcription scripts.
