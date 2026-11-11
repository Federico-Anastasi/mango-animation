# TikTok

Active when TikTok or Instagram (Reels) is among the creator's `canali` in the profile: these rules come from how the platforms crop
vertical videos and from TikTok's looping.

## Where things sit

- **The title is never in the top quarter of the frame** in vertical videos: TikTok and Reels cut it there. This holds for the whole
  banner, even on several rows: a title that wraps grows downward, from its place in the frame (in `stile.json`). Look at a frame
  before sending the video.
- **Nothing to be read at the sides**: on the longer phones the app cuts about 50 px on the right and on the left. Animations,
  screens, title and subtitles stay inside `telefono.margine_lati` of the style; the frames do it.

## The close

An exception of the platform to «The close» of `contenuto.md`. The channel loops: a question asked at the head and again at the
tail is heard twice in a row. It is said once, at the head, and the video ends on its last scene.
