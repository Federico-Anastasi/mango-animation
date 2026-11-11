---
name: pubblicazione
description: Prepares an approved video for release and records that it is out — caption, hashtags, ready file, and then date and address in the card. Use when the creator approves a video, asks for the caption (la didascalia), or says they published one.
---

# Pubblicazione

The creator publishes by themselves: here what they need is prepared and the archive is kept true. The card is changed with
`scheda_cambia` (only the touched fields; a list like `pubblicazioni` is given whole, with the entries that were there).

## When the creator approves a video

1. Card: `stato: "pronto"`.
2. Caption (`.claude/metodo/contenuto.md`, «Around the video»): short, makes people want to watch, does not summarize; relevant hashtags. Length, closing, number of hashtags and tone are
   the creator's (profile, rules on channels; for YouTube `.claude/metodo/youtube.md`, «Around»). Two variants to the creator, written in full in the question; the chosen one goes in
   `didascalia` and `hashtag`.
3. Tell the creator which file to upload (`uscite/finale.mp4`, or `con-copertina.mp4` if it has the cover; for a carousel the slides
   `uscite/slide-*.png`, in order). If they ask, the post is prepared on TikTok Studio in their Chrome (photo or video, title,
   description with the hashtags) and it stops there: «Publish» is pressed by the creator.

## When the creator says it is out

1. Card: `stato: "pubblicato"`, an entry in `pubblicazioni` with `canale`, `data` and `url` (if they give it).
2. If the file that went out is not the one in `uscite/`, link it as `uscite/pubblicato.mp4`.

## Do not

- Do not publish, do not reply to comments, do not write on the channels.
- Do not mark «pubblicato» a video the creator has not said they published.
