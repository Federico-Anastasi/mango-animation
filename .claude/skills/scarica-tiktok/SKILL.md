---
name: scarica-tiktok
description: Makes a round on TikTok in the creator's browser and brings into the archive the whole state of the channel with day and time — numbers of every video, all comments, all private messages, the profile — and the videos the creator saved (their Preferiti). Use when the creator says «aggiorna i dati», «scarica da TikTok», «come stanno andando i video», and before `proponi` if the last reading is old.
---

# Scarica da TikTok

Goal: a complete and dated reading in `archivio/canali/tiktok/letture/<YYYY-MM-DD-HHMM>/`, in the form of `docs/ARCHIVIO.md` («Una
lettura del canale»), and the video cards updated. For a creator with TikTok among their `canali`.

## How

1. **The round is the tool, never by hand in the browser**: `python -m strumenti.leggi_tiktok` (it takes a while: at a person's pace, a
   pause between one page and the next; say roughly how long, about half a minute per video). Before it starts, tell the creator that
   Chrome will ask to allow the connection and they press «Consenti»; it opens its own tab and does not touch theirs. It writes the
   reading in `archivio/canali/tiktok/letture/<YYYY-MM-DD-HHMM>/` (`docs/ARCHIVIO.md`, «Una lettura del canale»): profile, every video
   with the exact numbers of its public page and, for the recent ones, the analysis of TikTok Studio; all comments with their replies
   (`commenti/<id>.json`, written as they are read); the conversations (only those changed since the last reading are opened, because
   opening one marks it as read; the others are carried over); the Preferiti; `esito.json` with what is missing, and `ultima.json`.
   If it stops (Chrome did not allow it, TikTok shows a check, a page changed), say what it printed and stop: do not finish by hand. If it says
   that `playwright` is missing, run the install command it gives and start again.
2. **The cards.** Link every video of the reading to the one in the archive whose `pubblicazioni[].url` matches; if a video of the
   channel has no address in any card but is recognized without doubt (caption, date, duration), write the address in the right card.
   For every linked video the card says what is on TikTok, not what we had thought: `titolo` is the writing read on the video's cover
   in the profile (with «- PARTE n» if there is the part banner), `didascalia` and `hashtag` those published. Where they differ the
   card is corrected. Add in `numeri` the entry of this reading (`data` with day and time, `canale: "tiktok"`, the numbers read).
3. **Report** in a few lines: when, how many videos, comments and conversations read, what changed since the last reading (the three
   videos that moved most, new comments and messages), what `esito.json` says is missing.

## The creator's Preferiti

The videos the creator saved on TikTok («l'ultimo video che ho salvato», an idea they want to start from) are read with the tool, never by
hand in the browser: `python -m strumenti.leggi_tiktok --solo-preferiti` (`--preferiti N` for how many, 10 by default; Chrome asks to allow
the connection, as above). It opens its own tab in the creator's Chrome (`strumenti/LEGGIMI.md`) and writes `archivio/canali/tiktok/preferiti.json` (`docs/ARCHIVIO.md`,
«I Preferiti di TikTok»): the first is the last one saved, with author, caption, duration and the day it was published. A full round
(`leggi_tiktok` without arguments) reads them too. If the tool reports it found none, say so: the Preferiti may be private or the page
changed, and the file keeps what it had.

## Do not

- **Read only**: the tool does not like, reply, follow or change settings, and opens only the conversations that changed.
- Do not estimate and do not fill: a number that is not read is not written.
- Do not rewrite an old reading: every round is a new folder.
- If TikTok shows a check (login, verification), stop and tell the creator.
- Private messages stay in the archive: they are not quoted outside it with the name of who writes.
