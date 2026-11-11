# Cuts and voice

Cause and remedy of the six principles of «Cuts» in `montaggio.md`, and the defects no check sees. What the engine already prevents or
the check counts (`controlla`) is not repeated here. A new defect is added once it has been understood and solved, as a general
rule (defect, cause, remedy) without the name of the video; the name and the story go in the creator's `storia.md` (`docs/PROFILO.md`).

## 1. Cut by words

- **Cause**: the transcription is wrong by up to half a second; only the alignment says where a word is.
- Where the word to keep is attached to the one to remove («of RAM… VRAM»), the boundary is found with the alignment on the single
  piece on the sound; it is not cut earlier to be safe.
- **A `rifila` that no longer goes back**: the start of a piece by words cannot go below the end of the previous word in the take.
  Where it must start earlier, the piece is written in time (`da`, `a`).
- **The audio starting after the video** in recorded files: the offset is measured and declared in the source (`sfasamento`),
  otherwise the cuts all fall shifted.

## 2. Tight rhythm

- **Cause**: the transcription puts the first word too early, and the click that starts the recording counts as voice. The engine
  measures the edges on the voice level, so `da` and `a` of a timed piece only say where to look; what is left is counted by
  `controlla` (`silenzi`, `senza_parole`, `bordi`, `colpi`).

## 3. Hesitations

- **Cause**: the transcription does not write them and they are not silence; they show as gaps between one word and the next
  (`esitazioni`).
- **A held vowel («eeeh») at the head of a piece**: the attack falls inside the previous word, or on the held vowel. Neither the
  level nor the transcription tells it from voice: it is recognized because the sound stays flat, without consonants; the real word
  begins where the sound changes. Every timed attack is looked at this way, and the same gap is removed wherever the sentence
  returns in the video.

## 4. True speed

- **Cause**: an accelerated voice is no longer the creator's. A tight rhythm comes from the cuts (principle 2), not from the speed;
  if the creator asks for it, it is a separate copy.

## 5. The transcription lies

- **Words invented over music** (a call to action over a few seconds of music): removed from the plan and the subtitles (an edit
  with an empty `detto`). Those invented in silence `prepara` already removes. A «grazie» is usually a silence, a noise, or the
  attack of the next word left at the tail.
- **Words heard wrong** (a word for its opposite, model names): corrected in the subtitles, and the creator is asked whether it
  can be understood aloud.

## 6. Listening again

- **A word or a vowel heard twice at the cut**: two stretches of the same source overlap or touch (a piece widened at the head with
  `rifila`, or one that begins with a number, measured on the level, starting inside the held vowel of the previous piece). After
  every `rifila` the resolved plan is read: the boundary is looked for on the sound, both stretches are trimmed, and it is
  listened to again.
