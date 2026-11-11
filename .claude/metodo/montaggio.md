# Editing

Rules that apply to every video; an exception is decided by the creator and written in the plan.
Values that are matters of taste (colors, sizes, durations, positions) belong to the style (`stile.json`): where a rule says «the
style's», the value is there, the default style's with the creator's style laid over it.

## When the creator says…

The creator's words are in Italian here as examples; the creator's profile can add its own phrases for the same frames.

| the creator says | frame | what it means |
|---|---|---|
| «con la mia sagoma e le animazioni» (with my silhouette and the animations) | `sagoma-al-centro` | phone shots in vertical, cut out; from the top: one animated scene per point of the outline in the upper band, the subtitles, the silhouette at full width |
| «estrai dalla diretta» (extract from the live) | `schermo-e-viso` | the 16:9 recording: the screen on top, the webcam face below, subtitles in between; pieces chosen by words |
| «solo io che parlo», «video normale» (just me talking, a normal video) | `girato-pieno` | the footage at full frame, subtitles under the head, no animation |
| «senza la mia faccia, tutte animazioni» (without my face, all animations) | `solo-animazione` | the voice underneath, the animation at full frame |
| «inquadriamo lo schermo», «un documento» (let's frame the screen, a document) | `schermo-pieno` | the screen or the document, no face |

Frames are mixed scene by scene. If a composition that does not exist is needed, a frame with the same layers is added to `stile.json`:
an existing frame is not bent with measures written in the plan.

## Cuts

Six principles. Cause and remedy of each, and the defects already met: `.claude/metodo/taglio-e-voce.md`.

1. **Cut by words, never half a word.** Pieces taken from continuous speech are chosen by words (`minuto`, `dice`); the boundaries
   come from the alignment, not from the transcription.
2. **Tight rhythm.** No waits at the head and tail, no silence beyond the style's pause, never the phone's click that starts or
   stops the recording. The margin around the voice is the style's (`voce.margine`) and is not widened to be safe. A piece shorter
   than the style's `taglio.a_tempo.tratto_minimo` is a stumble: the pause stays. The same in someone else's footage.
3. **No hesitations.** «Um», held vowels, breaths and keyboard noise between two words are cut like silences: zero, or reported to
   the creator one by one.
4. **True speed.** Speech is not accelerated unless the creator asks, and then it is a separate copy.
5. **The transcription lies.** It writes words that were not said (a «grazie» in silence, noise or music) and hears others wrong.
   What is doubtful is verified on the sound; a word the creator never says (profile) is certainly invented.
6. **A cut inside speech is listened to again**, and so is a line redone halfway, sewn with the new piece.

## Voice and screen

- **Nothing on screen before the voice says it**: every element enters on the word that names it, never before; above all for
  questions and alternatives.
- **Subtitles follow the style** (`sottotitoli`): always on, from the first frame, the same in every frame (a frame does not change
  them). As central as possible: between the animation and the head in half-page videos, below the head in full-page ones; never
  at the sides.
- **The head sits in the center, not the shot**: if in the footage the creator is a little to the side, the `sagoma` layer brings the
  head back (`x: "testa"`) and enlarges the silhouette enough to still cover the width. The face gets bigger: the creator is told.
- **The title follows the style** (`titolo`): case (capitals are `titolo.maiuscolo`, however the title is written in the plan, a
  hand-made writing included), colors and duration, for the part banner too, on screen and on the cover. Its rows are always
  centered, even when it wraps. It stays at the opening, with the part banner if any, for `titolo.durata`: in the plan no `da` and
  `a`, unless the video departs from it. Then the screen stays free.
- **The background is always moving, never still and never empty**, but calm; what the voice names enters on top of it, on its
  word. How a scene is built: skill `scena`.
- **Sounds stay under the voice**, at the style's levels (`suoni`).

## Before saying «done»

An edited video is checked with the skill `controlla` before it goes to the creator: a clean video comes before any refinement. The
cover is part of the video like any other frame, together with the title: the finished video is the one with the cover (`processo.md`,
«Showing the creator»).
