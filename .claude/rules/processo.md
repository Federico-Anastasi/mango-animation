# The process

Every video goes through these steps, in this order. A step is skipped only if the creator says so. Each step has its skill, which says
how it is done; the content and editing rules apply in all of them (`contenuto.md`, `montaggio.md`).

| step | what comes out | skill |
|---|---|---|
| 1. The idea | the video's folder, its card `stato: "proposta"` and its preview (`materiali/anteprima.png`) | `proponi` |
| 2. The script | text in lines, frame, scenes described in words, in `proposta` | `proponi` |
| 3. The rehearsal | `uscite/prova.mp4`: the scenes with estimated timing and the whole sentence to read | `prova` |
| 4. The recorded text | `materiali/testo-registrato.md`: for each line the chosen take | `testo` |
| 5. Text and animations | in the same table, the scene of each line; then one still frame per scene | `scena` |
| 6. The edit | `uscite/con-copertina.mp4`, checked | `monta`, `controlla`, `copertina` |
| 7. The corrections | previews of the touched pieces, then one full edit | `monta` |
| 8. The release | caption, hashtags, card `pubblicato` | `pubblicazione` |

1. **The idea.** Start from a recording already made or from an idea the creator writes (an article, something done). Discuss the
   angle, the hook and the frame (`montaggio.md`, «When the creator says…»). From a recording already made, skip to step 4.
2. **The script.** Exact text: the hook is the first sentence, the center one sentence per line, the close. Next to it the frame and,
   for each scene, what it shows and from which sentence it starts (`proposta.scene`). Discuss until the creator says it is good.
3. **The rehearsal**, when the creator asks for it (almost always): the job `prova` (skill `prova`). The creator records while watching it.
4. **The recorded text.** As soon as the takes arrive: `prepara` transcribes them, and the creator is given the video's text sentence
   by sentence, with the take and the seconds of each and what stays out. Discuss until the creator fixes it.
5. **Text and animations.** In words, line by line: what the scene shows and on which word each thing enters. The creator says what
   works and what does not. Then one still frame per scene; the render only after their yes.
6. **The edit.** Plan, silhouette, edit (with the cleaned voice if `voce.pulizia.attiva` in the style), check (`controlla`) and cover;
   then to the creator.
   Watch four things: the words said right and correct, no pauses or hesitations, tight rhythm, animations always moving; the cover never empty.
7. **The corrections.** Collect all the notes of a round and apply them in a single change of the plan. The creator first watches the
   preview of the touched pieces (`lavoro` `anteprima` with the `scena`, a minute or two); the full edit is launched once only, when
   the previews are right.
8. **The release.** The creator publishes; it is recorded.

## Showing the creator

- What is shown lives in the video's folder (`materiali/`, `uscite/`), never in a temporary folder, and is opened in the browser with the
  tool `apri`: `percorso` for a file (`video/<slug>/uscite/con-copertina.mp4`), `video` (with `scheda` for a tab) for the video's page.
  It is the only way: the studio's addresses ask for the key, which is never read or written by you, and `apri` brings it in. The Windows
  viewer does not: it stays behind the windows.
- A version is always the full file: `uscite/con-copertina.mp4`. The light copy only if the creator asks for it. When the creator is on
  the phone, the button «Dal telefono» in the studio's Video list and in the video's page shows the `/guarda` code to scan; if the button is
  missing, the phone connection is off: the creator presses «Collega un telefono» in Girato.
- A preview declares itself a preview: it is not a version, it does not go through `controlla`.
- «Open» means only open: open it and wait for the creator.

## Long jobs

- Before a job that lasts more than a few minutes (the full edit of a new video, cutout, rendering all the scenes, transcribing a live
  recording) tell the creator what it does, on how many seconds and how long it takes, and wait for the go.
- One at a time on the video card, always on the card the profile names (`macchina.scheda_video`, the `nvidia-smi` index) unless the
  creator names another; for the animations `ANIMAZIONI_SCHEDA`, never a silent fallback to another card.
- Before changing the plan check whether an edit of the same video is running (`video_leggi`, field `lavoro`): an edit that ends on a
  superseded plan is time thrown away.
