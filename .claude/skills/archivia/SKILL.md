---
name: archivia
description: Puts the archive in order — brings in videos found around the computer, fixes the cards, says what is missing. Use when the creator says «ho dei video in questa cartella», «riordina», «cos'è questo file», or when a video or a take does not show up in the interface.
---

# Archivia

Goal: every video and every take in one place only, with a true card. Forms and places: `docs/ARCHIVIO.md`.

## How

1. **A take** goes in `archivio/grezzo/<day it was shot>/`, **linked** (hard link) if it is on the same disk, never copied if it is
   large. Next to it, its card (`tipo`, `origine`, duration and measures from `ffprobe`). The original stays where it is.
2. **A finished video** found outside the archive goes in the video it belongs to (`uscite/`), or in a new video with its card. If it
   cannot be re-edited the same, it is `uscite/pubblicato.mp4`.
3. **The state** is written only if known: «pubblicato» means there is proof (the creator said so, it is in the numbers, it is on the
   profile). When in doubt «pronto» or «in lavorazione», and the creator is asked in one line.
4. **Duplicates** (same content, different names) are recognized by duration and fingerprint: only one comes in, the others are listed
   to the creator.
5. At the end: how many files came in, how many videos, what could not be classified and why.

## Do not

- Do not delete and do not move anything outside the archive: link it.
- Do not invent dates, titles or numbers to fill a card.
