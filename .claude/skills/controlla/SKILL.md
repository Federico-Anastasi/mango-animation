---
name: controlla
description: Checks an edited video before sending it to the creator or calling it ready — listens to the file again, looks at the frames next to the words, and rereads what is said and shown looking for errors. Use after every edit and when the creator says «controlla il video».
---

# Controlla

Goal: to know, with proof, whether the edited video is clean and says right things. Before the check read `.claude/metodo/montaggio.md` (the rules; what is looked at
in the frames is in «Voice and screen») and `.claude/metodo/problemi-gia-visti.md` (the defects already met, with cause and remedy): what it lists
is looked for in this video too.

## How

1. **The check.** `lavoro` with `comando: "controlla"`, then `lavoro_aspetta` with its id (if the time runs out, call it again). If it
   stops because the edited video is not of the current plan, re-edit (`lavoro` `monta`, skill `monta`) and check again.
2. **The form, on the file.** Read `lavoro/controllo.json` (the fields: `docs/MOTORE.md`, «Il controllo»). For each:
   - `silenzi` (beyond the style's pause) and `esitazioni` (gaps between two words: «um», held vowels, breaths): zero. They are cut in
     the plan; those that remain are listened to again and told to the creator one by one. A gap with `numero` sits next to a number
     or an acronym («67», «10,5 GB», «7%»): often it is the word said in full; the sound level in that stretch is measured before
     cutting, and if there is full voice it is not a hesitation.
   - `senza_parole` (footage before the first word or after the last: the creator settling in, looking down): zero. The first or last
     piece is tightened, or the plan's `coda` is removed.
   - `colpi` (key knocks after the last word of a stretch): zero. On the spectrogram of the tail (`ascolta`) the end of the vowel is found and it is
     trimmed up to there, leaving the word whole. One after a word that closes on a consonant («bit») may be the consonant: it is
     listened to again.
   - `bordi` (a stretch that begins or ends with a silence, a noise, or inside the voice): zero. The right edge is found on the sound
     (`parole` and the voice level) and re-edited; an old `rifila` that now cuts the voice is removed.
   - `parole_fuori_posto`, `differenze`, `tagli_nel_parlato`: the points are listened to again. A word eaten by a cut is found back on
     the sound and trimmed.
   - `doppioni` (a word or a pair repeated in a row that the text does not have, «poi poi»): zero. They are overlapping stretches or a
     false start left behind: the cut is corrected.
   - `parole_lunghe` (a word lasting seconds, with what is heard in its window alone): zero. Usually a false start fused with the
     sentence said again, so the sentence is heard twice: the piece is cut to keep only the good version.
   - `sottotitoli` (the captions against `materiali/testo-registrato.md`: a different word, a lost «?»): zero; `null` means the fixed
     text is not there. Before correcting, see whether the sentence was cut or changed after the text was fixed: then it is the fixed
     text that is left behind, and the creator is told. Otherwise the subtitles are corrected in the plan (`sottotitoli.correzioni` or
     `ritocchi`).
   - `lampi` (isolated frames: a stretch that starts without the screen or the face): zero. It is an engine defect: the cause is found
     and it is re-edited.
   - `zona_alta` (the band above the silhouette still or almost empty for more than a second, also between two scenes or on a still
     recorded screen): zero. The frame at that second is looked at (`foto`) and the scene is given movement, or something above the
     still screen.
   - `copertina`: `manca` if `con-copertina.mp4` does not exist (declare `copertina` in the plan and re-edit), `vecchia` if `con-copertina.mp4` is older than the edit (skill `copertina`: declare it
     and re-edit); `vuota` if the first frame has little or nothing above the head: it is redone with another drawing.

   What is corrected is corrected in the plan, all in one round: skill `monta`, «A correction».
3. **The eyes.** `foto` (eight seconds at a time at most) on: the first frame (are face, background and subtitles already there?), the
   first after every cut between short stretches (are screen and face there?), every entrance of an element (does it enter on its
   word?), every scene change, one second yes and one no in long stretches (does the background move?), the last. What is looked at is
   in «Voice and screen» of `montaggio.md`: title, phone sides, screen that fills, subtitles. Every subtitle correction that changes the
   number of words, and every name, is looked at on the frame of the last word of the line.
4. **The content.** Reread the edited video's speech and what appears on screen, looking for what is wrong or contradicts itself: a
   name, a number said different from the one shown or from our data, an untrue sentence, a model not named. Where needed, look in the
   creator's sources (`fonti_delle_idee` in the profile) from which the work told comes. What you find goes in the card
   (`scheda_cambia`), `da_verificare` (`cosa`, `perche`, `stato: "aperto"`), with the proposed remedy.
5. **Report** in a few lines: what is right with its measure (longest silence, words found back), what is not, what you corrected, what
   the creator decides.
6. **A published video re-edited only as a test** is not a version to keep. Before the edit note which files of `uscite/` are links;
   when the test is done remove the stretches (`lavoro/tratti/`), the edited video and that day's check
   file, relink the published edit as it was, and write what you removed in `archivio/eliminati.jsonl`.

## Do not

- Do not say «all good» without having read the check and looked at the frames.
- Do not ask for a source for every number the creator says: flag what seems wrong, not what could not be verified.
- Do not correct the content on your own initiative: form defects are corrected, content ones are brought to the creator.
