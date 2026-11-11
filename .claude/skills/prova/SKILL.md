---
name: prova
description: Makes the rehearsal video to record against — the animated scenes with estimated timing and, below, every whole sentence to read — before the footage exists. Use when the creator, with the script approved, asks «fammi la prova», «il video per registrare», «le animazioni prima di registrare».
---

# Prova

Goal: `uscite/prova.mp4`, which the creator records against, and `uscite/copione.html`, the same sentences as a plain page to read on
the phone while recording (`/guarda`, «Da registrare»). It is not the finished video: the sentence stays whole on screen for the
whole time it lasts, the word to say now in red, the ones said dark, the others in grey. No audio, except the voice of the clips.

## How

1. `video_leggi`: the card's `proposta` (the script approved by the creator, skill `copione`) must have `aggancio` (or an opening clip in
   `spezzoni`), `centro`, `chiusa` and the `scene`. The fields are in `docs/ARCHIVIO.md` («La scheda di un video»); two things are decided here:
   - a scene that enters things on words has `parole` (the words of the script that make each thing enter): the rehearsal gives it
     the estimated second of each. A scene that waits for the spoken words and has none runs at its own pace;
   - when the creator comments on someone else's footage (a talk, a keynote), `spezzoni` (the file must be prepared); the frame is the
     one with the footage on top (`girato-e-sagoma`). The rehearsal does not mix animated scenes and clips in the same proposal.
2. The scenes that do not exist yet are written with the skill `scena` (a still frame to the creator before the render).
3. `lavoro` with `comando: "prova"`, never from the shell. It renders the scenes in `lavoro/prova/` (it does not touch those of the
   edit) with the script's estimated timing (`prova.caratteri_al_secondo`, `prova.pausa` of the style). With many scenes to render it is
   a long job: first tell the creator and wait for the go.
4. Look at three frames of `uscite/prova.mp4` (the opening with the title, a scene, a sentence of the creator's) and show the
   rehearsal to the creator. If a scene shows a screen to record, look at a rehearsal frame already composed before they record: the
   window must be tall and narrow to fill the frame (`scena`, «The screen fills the frame»).
5. If the creator changes a sentence or a scene, the proposal is changed and relaunched: scenes already rendered with the same
   duration are not redone.

## Do not

- Do not put the word-by-word subtitles: those are made on the recorded voice.
