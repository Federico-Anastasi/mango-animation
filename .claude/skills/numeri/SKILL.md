---
name: numeri
description: Reads what the archive knows about the channel — video numbers, comments, messages — and says what can be drawn from it. Use when the creator asks «come sta andando», «cosa dicono i commenti», or before proposing new videos.
---

# Numeri

Goal: a reading that helps to decide, based on the data in the archive. `scarica-tiktok` brings the data in; this skill reads and
counts them; `proponi` uses the reading. The automatic channel read is TikTok's (the account is in the profile, `canali[]`). For an
Instagram channel there is no automatic read yet: with the creator's permission, open the public profile in the browser and read the
numbers from the page, or take the numbers the creator brings; say that the automatic read will come later.

## How

1. Look at `archivio/canali/tiktok/ultima.json`: if the last reading is more than a day old, or the creator asks for fresh data, first
   the skill `scarica-tiktok`. If the creator brings numbers by hand (text, screenshots), they go in the cards as a reading with
   today's date.
2. Read the latest readings (`letture/`) and the `numeri` of the cards.
3. Draw out, always saying on how many videos it rests and at how many days from release the comparison is made:
   - what does better and worse, and what the videos above the average have in common (topic, hook, frame, duration, close);
   - the requests that come back in comments and messages, grouped by request, with how many people make them;
   - the creator's promises still open («I'll make a video») and the questions left unanswered.
4. Write the reading in `archivio/canali/tiktok/note/<YYYY-MM-DD>.md` and report it in a few lines.

## Do not

- Do not draw rules from a single video.
- What a comment links or suggests says what interests the audience: it is recorded, it does not become a method of work.
- Replies to comments: two or three variants are proposed to the creator, in their voice (profile); nothing is written on the channels.
