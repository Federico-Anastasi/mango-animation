# Editing

Rules that apply to every video; an exception is decided by the creator and written in the plan.
Values that are matters of taste (colors, sizes, durations, positions) belong to the style (`stile.json`): where this file gives a
value, it is the default style's, and the creator's style overlays it.

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

- **Never half a word.** Pieces taken from continuous speech are chosen by words (`minuto`, `dice`): the boundaries are found by the
  alignment, not by the transcription, which is wrong by up to half a second.
- **Tight rhythm**: no waits at the head and tail, no silence beyond the style's pause, never the phone's click that starts or stops
  the recording. When the word ends, cut: the margin around the voice is the style's (`voce.margine`), tight, and it is not widened to
  be safe. In pieces of someone else's footage (a talk, a keynote) the pauses are removed the same way as in the creator's speech.
- **A line redone halfway** is sewn with the new piece; where the word to keep is attached to the one to remove («of RAM… VRAM»), the
  boundary is found with the alignment on the sound, it is not cut earlier to be safe.
- **True speed**: speech is not accelerated, unless the creator asks, and then it is a separate copy.
- **A cut that falls inside speech** (the resolved plan flags it in its warnings) is always listened to again.
- A piece shorter than three tenths is a stumble: leave the pause.
- **A «grazie» (thanks) in the transcription is often invented**: the transcription writes words that were not said, in silence, noise
  or music. Every «grazie» — in the transcription of the footage or in what the check hears in the edit — is verified on the sound
  before believing it; usually it is a silence, a noise, or the attack of the next word left at the tail. If the creator never says it
  in their videos (profile), it is certainly invented.
- **No hesitations**: «um», held vowels, breaths and keyboard noise between two words are cut like silences. The transcription does
  not write them and they are not silence: they are looked for as gaps between one word and the next (`esitazioni` in the check) and
  must be zero, or reported to the creator one by one.

## Voice and screen

- **Nothing on screen before the voice says it**: every element enters on the word that names it, never before; above all for
  questions and alternatives.
- **Subtitles follow the style** (`sottotitoli`): by default word by word, always on, from the first frame; white with a black
  outline, no box, in every frame: a frame does not change them.
- **In the silhouette it is the creator's head that sits in the center, not the shot**: if in the footage it is a little to the side,
  the frame brings it back to the center (`x: "testa"` of the `sagoma` layer).
- **Subtitles as central as possible**: in half-page videos (animations above, silhouette below) they sit between the animation and
  the head; in full-page videos below the head. Never at the sides.
- **The title follows the style** (`titolo`): its case, colors and duration are the style's, for the part banner too, on screen and on
  the cover. Capitals are the style's (`titolo.maiuscolo`) however the title is written in the plan, and a hand-made writing (a drawn
  cover, a scene) respects them all the same. Its rows are always centered, even when it wraps. It stays on screen at the opening, with
  the part banner if any, for the style's `titolo.durata`: in the plan no `da` and `a`, unless the video departs from it. Then the
  screen stays free.
- **The background is always moving, never still and never empty**, but calm: a simple drawing and a single slow movement per scene
  (a bar that grows, a piece that travels, a number that counts), which shows the thing being talked about; what the voice names
  enters on top of it, on its word. Holding the previous scene's drawing longer is not enough. The same motif does not return in every
  scene: flashing grids and blocks filling everywhere tire; they are used where they explain, once or twice in the video. No half
  states: a thing is either full or not there.
- **A still recorded screen is a still background**: while the voice speaks and nothing happens on the screen, something else goes on
  top (the comments being talked about passing quickly, an animated scene), or the framing moves toward what the voice names.
- **Newspaper pages on screen are from the outlets of the audience** (`pubblico.testate`, in the audience's language): the original
  pages (a product's site, GitHub) serve as proof, for a name or a number, not for sentences to read.
- **In news videos, real pages and photos**: the document, the press release, the person being talked about. Only what a photo does not
  show is drawn (the creator's opinion, a concept). One page per topic, still: the camera scrolls over it and circles the sentences,
  without making it reappear at every sentence; between three articles and the official source, the official source.
- **A highlighted sentence sits in the upper half**: the page must be long enough for the camera to bring it there; below sits the
  creator's head.
- **The screen fills the frame**: only the part of the page being talked about is framed, narrow enough to fill the width and as much
  height as possible; never a wide window shrunk into a strip with emptiness above and below. For a vertical video the screen is
  recorded in a tall, narrow window: before recording, look at a rehearsal frame already composed.
- **In questions, little scenes, not text**: writing the sentence while it is said duplicates the subtitles.
- **Writings complement the speech, they do not repeat it**: a figure the voice does not say can be on screen, if it explains what the
  voice says.
- **A named product has its logo on screen**: when the voice says Claude, ChatGPT, an app, its logo enters, on the word, and where
  the name returns the logo returns too. The logo makes clear at once what is being talked about, the written name alone does not. The
  logos live in `animazioni/src/standard/loghi/`, each with beside it where it comes from and its license; one that is missing is
  added there.
- **Sounds stay under the voice**, at the style's levels (`suoni`).

## TikTok

Active when TikTok or Instagram (Reels) is among the creator's `canali` in the profile: these rules come from how the platforms crop
vertical videos (and, in `.claude/metodo/problemi-gia-visti.md`, from TikTok's looping).

- **The title is never in the top quarter of the frame** in vertical videos: TikTok and Reels cut it there. This holds for the whole banner,
  even on several rows: a title that wraps grows downward. Its place is in the frame, in `stile.json`; look at a frame before sending
  the video.
- **Nothing to be read at the sides**: on the longer phones the app cuts about 50 px on the right and on the left. Animations, screens,
  title and subtitles stay inside `telefono.margine_lati` of the style; the frames do it.

## Animations

- First a still frame to show the creator, then the render.
- Never an animated bullet list: a drawing that shows the thing. Every concept has its moment.
- Simple, and physically right: a diagram shows things where they really are.
- Everything inside the animation band; below sit the head and the subtitles.
- No glows, gradients, soft shadows, decorative movement.
- One video, one world: the same drawing style in all scenes, and whoever is the protagonist is always the same character, in the same
  color. Real pages and drawings alternate, but each stays coherent.
- A long concept is told with a single scene that grows while the voice names its pieces, not with detached scenes: the viewer stays
  to see what will be built.
- No elements on screen with no tie to the voice: a window scrolling by itself in a corner distracts.
- No money figures on screen unless the discourse needs them; no code, commands or developer terms in a video for a non-technical
  viewer (`pubblico.livello`).

## Before saying «done»

An edited video is checked with the skill `controlla` before it goes to the creator: a clean video comes before any refinement. The cover is
part of the video like any other frame, together with the title: the finished video is the one with the cover (`processo.md`, «Showing the creator»).
