---
name: prova
description: Makes the rehearsal video to record against — the animated scenes with estimated timing and, below, every whole sentence to read — before the footage exists. Use when the creator, with the script approved, asks «fammi la prova», «il video per registrare», «le animazioni prima di registrare».
---

# Prova

Goal: `uscite/prova.mp4`, which the creator records against, and `uscite/copione.html`, the same sentences as a plain page to read on the phone while recording (`/guarda`, «Da registrare»). It is not the finished video: the sentence stays whole on screen for the
whole time it lasts, the word to say now in red, the ones said dark, the others in grey (`montaggio.md`, «The rehearsal before
recording»). No audio, except the voice of the clips.

## How

1. `video_leggi`: in the card, `proposta`: `aggancio` (the first sentence), `centro` (one sentence per line), `chiusa`, approved by
   the creator. Next to it:
   - `quadro`: the video's frame (without it, that of `prova.quadro` of the style);
   - `scene`: in order, `{ "animazione": "<sigla>", "dalla": "<the first words of the sentence it starts from>" }`. A scene lasts until
     the next; `"animazione": null` means the creator at full frame. A scene that enters things on words adds `"parole": { "<name the scene
     waits for>": "<the words of the script that make it enter>" }`: the rehearsal gives it the estimated second of each. The sentences before the first scene are the creator's.
   - `spezzoni`, when the creator comments on someone else's footage (a talk, a keynote): in order, `{ "file": "<day>/<file in the
     grezzo>", "minuto", "dice" (the words it says, as for a piece of the plan: the file must be prepared), "testo": "<the whole
     translation>", "prima": "<the first words of the creator's sentence that comes next>" }`. Write `da` and `a` (seconds of the
     file) instead of `minuto` and `dice` only where there are no words to choose by. The frame is the one with the footage on top
     (`girato-e-sagoma`). If the script opens with a clip, the clip is the hook and `aggancio` is missing. The rehearsal does not mix animated scenes and clips in
     the same proposal.
2. The scenes that do not exist yet are written with the skill `scena` (a still frame to the creator before the render). A scene that
   waits for the spoken words and has no `parole` in the proposal uses its starting timing: in the rehearsal it runs at its own pace.
3. `lavoro` with `comando: "prova"`, then `lavoro_aspetta`: never from the shell. It renders the scenes in `lavoro/prova/` (it does not touch those
   of the edit) with the script's estimated timing (`prova.caratteri_al_secondo`, `prova.pausa`), and writes `uscite/prova.mp4` and `uscite/copione.html`. With
   many scenes to render it is a long job: first tell the creator and wait for the go.
4. Look at three frames of `uscite/prova.mp4` (the opening with the title, a scene, a sentence of the creator's) and send the
   rehearsal to the creator by opening it in the browser (`processo.md`, «Showing the creator»).
5. If the creator changes a sentence or a scene, the proposal is changed and relaunched: scenes already rendered with the same
   duration are not redone.

## Do not

- Do not put the word-by-word subtitles: those are made on the recorded voice.
- Do not write a script in the video's folder: if the rehearsal cannot do something, it is added to the engine.
