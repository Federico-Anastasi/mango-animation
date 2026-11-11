# Known problems

Defects that recur in edited videos, each with how to recognize it and what to do; what `montaggio.md` already states as a rule is not
repeated here. Before sending a video to the creator, scan this list. A new defect is added here once it has been understood and solved,
as a general rule: defect, cause and remedy, without the name of the video; the name and the story go in the creator's profile, in
`storia.md` (optional, `docs/PROFILO.md`).

## Silhouette

- **Halo on the shoulder.** Where the shoulders leave the footage the silhouette's edge is straight, and a wide feather makes a fog there.
  The edge is softened by a few pixels (`sfuma` of the `sagoma` layer, `docs/PIANO.md`): it is not widened to «sweeten».
- **A light vertical line from the bust down**, or a light contour around the person: a feathered edge painted in the background color is a
  line under an animation. The edge fades into transparency, over whatever is underneath. Look at a frame on a dark background and one on a
  light one.
- **Pieces of the room attached to the person** (a lamp on the hair, light spots near the shoulder): a cutout made at low resolution does
  not separate them. A stretch already cut out is kept and never redone (`sagoma/` in the source's prepared files): after a change of
  method the old pieces stay until `sagoma/` is removed (`docs/MOTORE.md`, «La sagoma»).
- **Something behind the head cut out with the person, for one stretch only** (a lamp that in the shot sits on the head like a hat): the
  detector put it in the person's box in the first frame of that stretch. The box no longer rises above the hair
  (`sagoma.scontorno.sopra_il_viso`); a stretch cut out before is redone by removing its file and its entry in `sagoma.json`.
- **A giant face with the chin cut off**: a take shot close to the phone under a frame whose `scala_minima` was set for a distant one. The
  scale is chosen so that head, shoulders and part of the bust are in the frame, above the platform's description.
- **The head jumping between one cut and the next, or the edge flickering**: the head's position is measured once per take and the scale is
  one for the whole video; the stretches are cut out in a single pass, never a separate job for each piece.
- **The head off-center** (the creator a little to one side of the shot): a frame that centers the shot does not center the person.
  `sagoma-al-centro` brings the head to the center (`x: "testa"`) and enlarges the silhouette enough to still cover the width: the face
  gets bigger, and the creator is told.

## Cuts and voice

- **The gap at the head of a take, the last word truncated.** The transcription puts the first word too early, and the click that starts
  the recording counts as voice. The edges are measured on the voice level, not on the transcription's times, and the end of every take is
  listened to again.
- **Words the transcription invents over music** (a call to action over a few seconds of music): removed from the plan and the subtitles (an
  edit with an empty `detto`); those in silence are removed by `prepara`.
- **Words heard wrong** (a word for its opposite, model names): corrected in the subtitles, and the creator is asked whether it can be
  understood aloud.
- **A word that disappears from the subtitles** (a two-word expression showing only its first word, a model name without its suffix): a word
  heard as one and corrected into two shows only one. The subtitle file can be right while the frame is wrong, so the subtitles are reread
  on the frames, not only in the text.
- **A sentence repeated in a loop, or false starts fused into one sentence** (one word lasting seconds): a piece looked up by words there
  aligns on the wrong try. `prepara` transcribes by voice segments, so the tries stay separate; a transcription made another way is redone
  by removing `parole.json` from the prepared files.
- **Numbers and words the alignment cannot measure** (decimals, codes, units, percentages): the tail stays up to a second after the voice, or
  the word comes out clipped (a percentage without its unit). Where the first or last word of a piece is uncertain (`voto_bordo`, or text
  that is not written in letters) the edge is measured on the sound, and `controlla` counts the mute, noisy or in-the-voice edges (`bordi`,
  zero). A `rifila` written to compensate for a wrong alignment cuts the voice: `risolvi` says so in its warnings and the `rifila` is removed.
- **A key knocking at the tail of a number**: the knocks of the key pressed to go forward count as voice and the check does not see them. The
  spectrogram of the tail is looked at (`ascolta`): the knocks are narrow vertical lines after the end of the vowel; trim up to there,
  leaving the word whole (the silence of a double consonant is not a pause).
- **The last syllable eaten by the alignment** (a word cut after its first syllable): where the next word is removed, the end is looked at on
  the spectrogram and trimmed down to the true drop.
- **A `rifila` that no longer goes back**: the start of a piece by words cannot go below the end of the previous word in the take. Where it
  must start earlier, the piece is written in time (`da`, `a`).
- **A word eaten while sewing a correction** (two words attached, the first kept over the second): the boundary is looked for with the
  alignment on the single piece, then `rifila`; and it is listened to again.
- **Waits at the head and tail of timed pieces**: with `da` and `a` written by hand the silence at the head always stays, and the one at the
  tail when shorter than the pause. At the edges all the silence goes, down to `voce.margine`; `da` and `a` only say where to look.
- **A mute tail past the end of the take**: an `a` written beyond the end of the file lengthens the piece with silence. `a` stops at the end
  of the take.
- **The audio starting after the video** in recorded files: the offset is measured and declared in the source (`sfasamento`), otherwise the
  cuts all fall shifted.
- **A held vowel («eeeh») at the head of a piece**: the attack falls inside the previous word, or on the held vowel. Neither the level nor
  the transcription tells it from voice: it is recognized because the sound stays flat, without consonants; the real word begins where the
  sound changes. Every timed attack is looked at this way, and the same gap is removed wherever the sentence returns in the video.
- **A word or a vowel heard twice at the cut**: two stretches of the same source overlap or touch (a piece widened at the head with `rifila`,
  or one that begins with a number, measured on the level, starting inside the held vowel of the previous piece). After every `rifila` check
  in the resolved plan that stretches of the same source neither overlap nor touch; the boundary is looked for on the sound, both stretches
  are trimmed, and it is listened to again.

## Screen

- **Upper half empty, or a small drawing high up**: above the silhouette there is always something that shows what is being talked about,
  from the first frame to the last, big and centered in the animation band (not half a frame of empty floor).
- **An empty rectangle around a writing over the footage**: an animation covers its whole box. A `trasparente` scene covers only what it draws.
- **A step above the head**: if the band of the scenes is narrower than the frame, or goes down past the start of the footage, a margin of
  another color remains around the page. Above the footage there is a single zone, white like the pages, at full width, with a straight edge
  on the footage; inside it, the pages stay within the sides the phone cuts, and the frame's background has the same color as the animations.
- **A title on two rows that rises into the top quarter**: a banner centered on its place grows upward when it wraps. The frame's place is
  the center of the first row and the others go down.
- **A number said different from the one on screen** (in a live recording): that point is not framed, or the sentence is cut.
- **The person leaving the center** in a talk filmed by others: a fixed crop loses a speaker who moves. A view with `segui` keeps the head at
  the center; the frames of the whole video are looked at, not only the first.
- **3D that flickers**: no stroke recomputed at every frame and no faces on the same plane; the difference between consecutive frames is
  measured, it is not judged by eye.
- **A clip taken from a commercial production**: not everything on a free media site is free. Of every photo or clip the license is read on
  the file's page, and written next to it.

## Structure

- **The question repeated at the tail** (TikTok channels): in the channel's loop it is heard twice in a row. The question sits at the head;
  the video closes on the last scene.

## Sounds and cover

- **Empty cover** (first frame almost white): a video that opens on an animated scene has an almost white first frame. Every video comes out
  with a full cover in front (skill `copertina`), with the silhouette and the title.
- **Closed eyes on the cover** (the first frame fell on a blink): the silhouette is taken from another instant, `istante` in the plan's `copertina`.

## Working

- **Preview and file are not the same thing**: a defect is looked for first in the edited file. A preview that draws the plan as written can
  differ from the render (for instance in the title's case); the studio follows the style, and the file is what counts.
- **The new cover that does not show in the interface**: a video's page that opens the plan's preview shows «Montato» without the cover. It
  opens on the full video, with the cover, and the redone files reload. After a cover, the video's page is looked at, not only the file.
- **A hand-written card that stays old in the interface**: a card that does not pass the schema (`motore/schemi/scheda.schema.json`) is not
  taken: the server keeps the previous valid one. The video's page says why, in a notice above the tabs (`problemi` in `GET /api/video/:slug`).
  If the notice is there, the card is what is wrong; if there is none and the page is still old, the server is what is out of date.
