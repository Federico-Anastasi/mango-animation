# Known problems

Defects that recur in edited videos, each with how to recognize it and what to do. Before sending a video to the creator, scan this
list. A new defect is added here once it has been understood and solved, as a general rule: defect, cause and remedy, without the name of
the video; the name and the story go in the creator's profile, in `storia.md` (optional, `docs/PROFILO.md`).

## Silhouette

- **Halo on the shoulder.** Where the shoulders leave the footage the silhouette's edge is straight, and a wide feather makes a fog
  there. The edge is softened by a few pixels (`sfuma` of the `sagoma` layer, `docs/PIANO.md`): it is not widened to «sweeten».
- **The head jumping between one cut and the next.** The head's position is measured once per take, not per stretch; the scale is a
  single one for the whole video.
- **The edge flickering.** The cutout keeps memory between frames: if it restarts from scratch, the edge flickers for a few frames. The
  stretches are all cut out in a single pass, one after the other, and each starts a little earlier (`sagoma.margine`): never a separate
  job for each piece.
- **The whole shot cut out.** Cutting out the whole footage when the edit uses a fraction of it costs far more processor time and memory
  than the edit needs. Only what the edit uses is cut out. `monta` does it, once the stretches are known.
- **A light vertical line from the bust down**, beside the person for the whole video: a feathered edge painted in the background color
  is a line under an animation. The edge fades into transparency, over whatever is underneath.
- **A light contour or halo around the person.** Look at a frame on a dark background and one on a light background.
- **Pieces of the room attached to the person** (a lamp on the hair, a piece of furniture or light spots near the shoulder): a cutout
  made at low resolution does not separate them. The cutout is SAM2 plus ViTMatte (`docs/MOTORE.md`, «La sagoma»); a stretch already
  cut out is kept and never redone (`sagoma/` in the source's prepared files), so a re-edit after a change of method keeps the old
  pieces until `sagoma/` is removed.
- **The head off-center** (the creator a little to one side of the shot): a frame that centers the shot does not center the person.
  `sagoma-al-centro` brings the head to the center (`x: "testa"`) and enlarges the silhouette enough to still cover the width: the face
  gets bigger, and the creator is told.

## Cuts and voice

- **The gap at the head of a take.** The transcription puts the first word too early, and the click that starts the recording counts as
  voice. The edges are measured on the voice level, not on the transcription's times.
- **The last word truncated.** The same, at the tail: the end of every take is listened to again.
- **Words the transcription invents** in silence (a «thanks» at the end of a take) **or over music** (a call to action over a few seconds of
  music): those in silence are removed by `prepara`; those over music are removed from the plan and the subtitles (an edit with an empty
  `detto`).
- **Words heard wrong** (a word for its opposite, model names): corrected in the subtitles, and the creator is asked whether it can be
  understood aloud.
- **A word that disappears from the subtitles** (a two-word expression showing only its first word, a model name without its suffix): a
  word heard as one and corrected into two shows only one. The subtitle file can be right while the frame is wrong, so the subtitles are
  reread on the frames, not only in the text.
- **A sentence repeated in a loop by the transcription**, in place of the different sentences that were said: `prepara` transcribes by
  voice segments, one by one; a transcription made another way is redone by removing `parole.json` from the prepared files.
- **False starts fused by the transcription** (several tries written as a single sentence, with one word lasting seconds): a piece looked
  up by words there aligns on the wrong try. `prepara` transcribes by voice segments, so the tries stay separate.
- **Hesitations left in the edit** («um», held vowels, keyboard noise between two words): they are not silence and the transcription
  does not write them, so the silence check does not see them. They are looked for as gaps between one word and the next, and cut.
- **Numbers and words the alignment cannot measure** (decimals, codes, units, percentages): the tail stays up to a second after the voice
  (silence, noise, the creator moving), or the word comes out clipped (a percentage without its unit). Where the first or last word of a
  piece is uncertain (`voto_bordo`, or text that is not written in letters) the edge is measured on the sound, and `controlla` counts the
  mute, noisy or in-the-voice edges (`bordi`, zero). A `rifila` written to compensate for a wrong alignment cuts the voice: `risolvi` says
  so in its warnings and the `rifila` is removed.
- **A key knocking at the tail of a number**: where the last word is a number the edge is measured on the level, and the knocks of the key
  pressed to go forward count as voice. The check does not see them. The spectrogram of the tail is looked at (`ascolta`): the knocks are
  narrow vertical lines after the end of the vowel; it is trimmed up to there, leaving the word whole (the silence of a double consonant
  is not a pause).
- **The false start**: a sentence restarted is cut keeping the second one.
- **The last syllable eaten by the alignment** (a word cut after its first syllable): the alignment closed the word before its final
  syllable. Where the next word is removed, the end is looked at on the spectrogram and trimmed down to the true drop.
- **A `rifila` that no longer goes back**: the start of a piece by words cannot go below the end of the previous word in the take. Where
  it must start earlier, the piece is written in time (`da`, `a`).
- **A word eaten while sewing a correction** (two words attached, the first kept over the second): the alignment put the first word over
  the second. The boundary is looked for with the alignment on the single piece, then `rifila`; and it is listened to again.
- **Wide margins at every cut** (a tenth of a second or more between the word and the cut): the cut follows as soon as the word is
  finished. The margin is `voce.margine` of the style, tight, for all videos.
- **Waits at the head and tail of timed pieces**: with `da` and `a` written by hand the silence at the head always stays, and the one at
  the tail when shorter than the pause. At the edges all the silence goes, down to `voce.margine`; `da` and `a` only say where to look.
- **A mute tail past the end of the take**: an `a` written beyond the end of the file lengthens the piece with silence. `a` stops at the
  end of the take.
- **The audio starting after the video** in recorded files: the offset is measured and declared in the source (`sfasamento`), otherwise
  the cuts all fall shifted.
- **Cuts in continuous speech**: without silence between two words the cut falls where the sound is lowest, right next to the word kept.
  These are the cuts to listen to again.
- **A mute fragment one frame long at the tail of a timed piece**: with `a` in the silence, the margin can leave a stretch of a few
  hundredths of a second. The engine drops it; the check counts mute stretches.
- **A held vowel («eeeh») at the head of a piece**: the attack falls inside the previous word, or on the held vowel. Neither the level nor
  the transcription tells it from voice. It is recognized because the sound stays flat, without consonants; the real word begins where the
  sound changes (for example the rustle of a consonant). Every timed attack is looked at this way, and the same gap is removed wherever
  the sentence returns in the video.
- **A word or a vowel heard twice at the cut**: two stretches of the same source overlap, or touch. It happens when a piece widened at the
  head with `rifila` starts before the end of the previous stretch, and also with no `rifila` at all, when the edge of a piece that
  begins with a number, measured on the level, starts inside the held vowel of the previous piece. After every `rifila` check in the
  resolved plan that stretches of the same source neither overlap nor touch; the boundary is looked for on the sound (the end of the
  word, the rustle of the consonant after), both stretches are trimmed, and it is listened to again.

## Screen

- **Black JPEG photos in the edit** (photos under the voice): a JPEG has a single frame, which ffmpeg can lose when asked to start from
  second zero. The engine takes care of it; a photo under the voice is looked at on the frame all the same.
- **Graphics that anticipate the voice**: a question or an alternative written before it is said removes tension. Every element has its
  anchor on the word.
- **Still background**: a scene that waits frozen for the next word. Scenes are written with the timing of the speech.
- **Text that repeats the subtitles** in questions.
- **Subtitles under the platform's interface** (channel icons, buttons): they stay inside the style's safe zone.
- **Title cut by the platform** (TikTok channels): placed in the top quarter of the frame it ends up outside, in every vertical frame,
  also in videos from a live recording. It sits lower, and a test verifies it.
- **A title on two rows that rises into the top quarter**: a banner centered on its place grows upward when it wraps. The frame's place
  is the center of the first row and the others go down.
- **Title in the wrong case**: its case is the style's (`titolo.maiuscolo`), however the title is written in the plan. It is looked at
  on the first frame and on the cover.
- **A number said different from the one on screen** (in a live recording): that point is not framed, or the sentence is cut.
- **A physically wrong diagram** (an object drawn where it cannot be, such as the disk outside the computer): a diagram shows things where
  they really are.
- **The person leaving the center** in a talk filmed by others: a fixed crop loses a speaker who moves. A view with `segui` keeps the
  head at the center; the frames of the whole video are looked at, not only the first.
- **Upper half empty**: in the first seconds, above the silhouette, a name tag on a flat color and nothing else. Above the silhouette
  there is always something that shows what is being talked about, from the first frame to the last.
- **Subtitles on the face**: with the creator in the center of the shot, subtitles beside the face fall on the cheek. The silhouette frame
  is `sagoma-al-centro`: animation, subtitles, silhouette at full width.
- **3D that flickers**: no stroke recomputed at every frame and no faces on the same plane; the difference between consecutive frames is
  measured, it is not judged by eye.
- **Flashes on the cuts**: a stretch's first frame can come out without screen and without face, only the background, because the live
  recording has frames out of phase with the cut. The engine avoids it; the check counts them (`lampi`) and they must be zero.
- **Articles in a language that is not the audience's**: the outlets of the audience are used (`pubblico.testate`).
- **An empty rectangle around a writing over the footage**: an animation covers its whole box. A `trasparente` scene covers only what it
  draws.
- **A little window scrolling in a corner** with no tie to the voice: it distracts and explains nothing. Removed.
- **Fake code and commands on screen** in a video for a non-technical viewer: jargon. The idea is drawn.
- **Small drawings, high up**, with half a frame of empty floor: the drawing is big and centered in the animation band.
- **A highlighted sentence behind the creator's head**: the page photo was too short and the camera could not bring it up. The page is
  photographed long enough.
- **The sides cut by the phone** (TikTok channels; the first and last of a row of items, a writing out of the screen): the video is 9:16
  but on the longer phones TikTok enlarges it and cuts about 50 px per side. The animation of `sagoma-al-centro` must not go edge to
  edge. The vertical frames keep what is read inside `telefono.margine_lati`, and the frame's background has the same color as the
  animations, with no line where they touch.
- **A step above the head**: if the band of the scenes is narrower than the frame, or goes down past the start of the footage, a margin
  of another color remains around the page. Above the footage there is a single zone, white like the pages, at full width, with a
  straight edge on the footage; inside it, the pages stay within the sides the phone cuts.
- **Pages that change continuously** (several articles in a few seconds, the same note coming back at every sentence): nothing can be
  understood. One page per topic, still, and the camera scrolling over it circling the sentences; the official source is better than
  several articles.
- **A clip taken from a commercial production**: not everything on a free media site is free. Of every photo or clip the license is read
  on the file's page, and written next to it.

## Structure

- **The question repeated at the tail** (TikTok channels): in the channel's loop it is heard twice in a row. The question sits at the
  head; the video closes on the last scene.
- **Several identical videos from the same source**: same hook or same center.

## Sounds and cover

- **Sounds over the voice**: the levels are the style's, measured on the file.
- **Empty cover** (first frame almost white): a video that opens on an animated scene has an almost white first frame. Every video comes
  out with a full cover in front (skill `copertina`), with the silhouette and the title.
- **Closed eyes on the cover** (the first frame fell on a blink): the silhouette is taken from another instant, `istante` in the plan's
  `copertina`.

## Working

- **Preview and file are not the same thing**: a defect is looked for first in the edited file. A preview that draws the plan as written
  can differ from the render (for instance in the title's case, `titolo.maiuscolo`); the studio follows the style, and the file is
  what counts.
- **The new cover that does not show in the interface**: a video's page that opens the plan's preview shows «Montato» without the cover.
  It opens on the full video, with the cover, and the redone files reload. After a cover, the video's page is looked at, not only the
  file.
- **A hand-written card that stays old in the interface**: a card that does not pass the schema (`motore/schemi/scheda.schema.json`) is
  not taken: the server keeps the previous valid one. For example `da_verificare[].stato: "chiuso"`, where only «aperto» or «a posto» are
  allowed. The video's page says why, in a notice above the tabs (`problemi` in `GET /api/video/:slug`). If the notice is there, the
  card is what is wrong; if there is no notice and the page is still old, the server is what is out of date.
- **A new field in a schema, refused by the server that was already running**: a server that compiles the schemas once at start judges
  a card with the new field invalid, keeps the old one, and the interface shows the old text until the app is restarted. The schemas are
  watched like any other file: a change in `motore/schemi/` recompiles them and judges again cards, plans, footage cards and profile,
  and the interface is told with the usual events. Anything a program reads once at start from a file that can change while it runs is
  this same defect: it is watched and announced, or the reason it need not be is written down (`docs/ARCHITETTURA.md`, «Niente
  polling»).
- **The transcription that does not start**: `prepara` works on the sources of the plan, not only on those the scenes use: when the takes
  arrive the plan has no scenes yet.
- **A good capture overwritten by the anti-bot check**: `strumenti/pagina.mjs` must not save the «Checking your browser» page: if the
  check does not dissolve, the previous files stay untouched.
- **Phone videos rotated**: width and height are those on screen, not those written in the file; otherwise part of a face comes out in
  full-frame footage. The engine frames on the measures on screen; the first frame of every scene is looked at all the same.
- **An edit that fails at the very end with «Accesso negato»**: on Windows an open file cannot be replaced, so the server keeps
  `uscite/finale.mp4` open only while it reads a piece, never while it sends it to the player.
- **Disk full halfway through an edit**: a video's intermediate files are removed as soon as it is edited.
