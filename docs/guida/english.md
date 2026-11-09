# Mango Animation: the guide

Mango Animation is a Windows app that helps you make short videos: you keep your footage in an archive, write the script, record yourself against a rehearsal, and the app edits the video with your silhouette, the animations and the cover. Claude does the work, in a chat inside the app; the **studio** (the app's pages) shows you what is there and lets you adjust it.

Versione italiana: [italiano.md](italiano.md).

1. [What you need and how to install](#1-what-you-need-and-how-to-install)
2. [The first start](#2-the-first-start)
3. [Your profile](#3-your-profile)
4. [One video, from idea to release](#4-one-video-from-idea-to-release)
5. [The phone, recording, languages](#5-the-phone-recording-languages)
6. [When something goes wrong](#6-when-something-goes-wrong)

---

## 1. What you need and how to install

### What you need

- **Windows 10 or 11, 64-bit.** The app is Windows only (tested on Windows 11).
- **Claude Code**, with your own Claude account. The app does not ship it and does not use your credentials: it talks to the program you already have on your computer, and the chat's work counts against the limits of your Claude subscription, which are meant for ordinary, individual use: long jobs queued one after another (for example many re-edits in a row) use them up quickly. If you do not have it, the app guides you through installing it at first start (below).
- **Disk space.** At first start the app downloads the programs and models it needs: about 12 GB with an NVIDIA video card, about 8 GB without. Keep at least 20 GB free (12 without a card), plus room for your footage. The app shows you the exact figures before downloading and will not go ahead if the space is not enough.
- **An NVIDIA video card is recommended, not required.** With one, the heavy jobs (transcription, silhouette, rendering the animations) are much faster. Without one, everything still works, only more slowly. The **Engines** page of the studio tells you what your computer has and where each function runs. Two thresholds worth knowing: the silhouette on the processor is slow under 8 threads, and with less than 4 GB of memory the large model that understands your voice does not fit, so the small, less accurate one is used.
- **An internet connection**, for the first-start download and for Claude.
- **Optional:** a microphone and a webcam (to record from the studio and dictate to the chat), a phone (to send footage to the computer and watch your videos).

### How to install

1. Download `Mango.Animation_<version>_x64-setup.exe` from the latest release: <https://github.com/Federico-Anastasi/mango-animation/releases/latest>.
2. Open it. No administrator rights are needed: the app installs for your user only.
3. **Windows shows "Windows protected your PC".** This happens because the installer has no code-signing certificate (it costs money every year, and this app does not have one). Click **"More info"** and then **"Run anyway"**. The app's code is public and its updates carry their own signature, which the app checks.
4. Open Mango Animation.
5. When a new version comes out, the app says so at start and shows what is new: **"Update now"** downloads and installs it (the app closes and reopens by itself), **"Later"** lets you carry on working.

---

## 2. The first start

At start the app goes through a few checks, one after the other. Each one appears only if there is something to do. These screens follow the language of the studio (or of Windows, the first time).

### The data folder

The first time, the app asks **"Where should I keep your videos?"**. It suggests a folder called **Mango Animation** inside **Documents**, with the free space of that disk; if another disk has more room you will find it under "Other folders". Click **"Use this folder"**, or **"Choose another folder"**. Your footage, your videos and your profile live there, and they are big: if the folder is inside **OneDrive** the page warns you, because OneDrive would copy them online. To move it later, inside the studio click the folder button in the top bar ("Data folder") and then **"Move the data folder…"**, choosing an empty folder: the next time you open the app it copies everything, checks that everything arrived and only then removes the old files. If anything goes wrong, your files stay where they were.

If the folder disappears (disk unplugged, folder moved), the app says so and offers **"Recreate in Documents"** or **"Choose another folder"**.

### The link to Claude Code

To use the app you need **a Claude account with a subscription** (Pro, Max, Ultra, Team or Enterprise: the free plan does not include Claude Code). The page has a link to the plans.

- **"To get started you need Claude Code"** or **"Claude Code won't start"**: click **"Install Claude Code"**. A window opens (this is normal), installs it and closes by itself; then the app checks again. If it does not work it says so, and you can click **"Try again"**. If you prefer, below you will find Anthropic's command to paste into **PowerShell**, and a link to their guide. If you installed it elsewhere, click **"Check again"**.
- **"Connect Claude Code to your account"**: click **"Sign in to Claude Code"**. A black window opens (this is normal) and then the browser, where you sign in with your Claude account. When the window closes, the app checks again by itself. If you signed in elsewhere, click **"Check again"**.

Without Claude Code installed and signed in the app does not go on. If Mango Code is also running, the page says so: you will find it among the chat's engines.

If Claude Code is already installed and signed in, this step does not appear.

### The computer, made ready

The app looks at what your computer has (video card, processor, memory, free space) and proposes what to download. Under **"Features"** there are six checkboxes; by default all are on:

| function | what it is for |
|---|---|
| Understanding what I say | transcribes your voice: needed for word-by-word subtitles and for clips chosen by words |
| Precise cuts on words | finds where each word starts and ends |
| My silhouette over the animations | cuts you out from the background |
| Following the person in wide shots | keeps you centred if you film from far away |
| Clean voice | removes background noise from your voice |
| Dictating to the chat | the microphone in the chat |

Turn off what you do not need: the list below and the space required are recalculated. Each entry says what it is, how big it is, its **licence** (with a link to the source) and where it stands. The models are **not inside the app**: they are downloaded from their source and every file is checked before use. One entry, the model that finds where each word falls, has a non-commercial licence: its line says so.

**If you earn money from your videos.** "Precise cuts on words" uses the MMS model (Meta), licensed **CC-BY-NC-4.0: non-commercial use only**. If your videos earn you money (monetisation, sponsors, work for clients), the licence may not allow you to use it: when in doubt, **turn off "Precise cuts on words"**, here at first start (the model is not downloaded) or later on the **Engines** page. Without it, the pieces chosen by words stay, but their edges are found from the voice level and are less precise. By default the function is on: the choice is yours.

- **"Download and start"** starts the download (it stays off if the space is not enough: free some space or turn off a function). How long it takes depends on your connection: it is several gigabytes, and each entry has its own bar.
- **Do not close the app** while it downloads. If it is interrupted, at the next start it resumes from where it got to. **"Stop"** goes back to the plan.
- If something fails, the page says which entry and why; **"Try again"** does not download again what has already arrived.
- **"Not now"** opens the studio as it is. The functions that are missing will stop and say what they lack.

Later, to turn a function on or off, use the **Engines** page of the studio: what you turn on, the app downloads at the next start.

### The studio

As soon as the computer is ready, the app shows the studio. At the top, the bar with the pages:

| page | what you find |
|---|---|
| **Videos** | your videos, by status |
| **Footage** | all your recordings |
| **Audience**, **Ranking**, **Growth** | for TikTok users: numbers and comments of released videos, comparison with other profiles, growth plan. They are empty until the data exists; each empty page says what to ask in the chat |
| **Production** | how many videos you made and how much of Claude's work they cost |
| **Style** | your standards: framings, colours, subtitles, title; values are changed and saved with **"Save"** |
| **Engines** | what the computer has and which heavy functions are on |

On the right of the bar: **Phone** (whether the phone can send files), **Chat**, **Record**, **Jobs** (what is running), the data folder, **IT**/**EN** (language) and the light/dark theme.

---

## 3. Your profile

The method the app uses to make videos is the same for everyone. What is yours (how you speak, who you speak to, where you publish, what you never say, your computer) lives in your **profile**, in the data folder. Claude reads it before proposing, writing or editing anything for you, and **where the profile changes a default rule, the profile wins**.

### What it contains

| entry | what it says |
|---|---|
| Who you are | your name and the language you speak and write in: the language of your videos and of Claude's replies |
| The audience | their level (for example "non-technical": no acronyms or technical numbers on screen), their language, the newspapers they know (newspaper pages in your videos are theirs) |
| The channels | where you publish (TikTok, YouTube, X), under what name and in what format (vertical or horizontal). A platform's rules apply if it is among your channels |
| What you never say | phrases, topics, tones that are not in your videos: proposals, scripts, captions and replies respect them |
| The sources of ideas | the folders of your work that proposals come from |
| Your computer | which video card to use if you have more than one, and whether the disk is nearly full (then a large video is linked instead of copied) |
| Your rules | free text: how you build a video, how you close, how you write captions and hashtags, what you call the framings |

Your **style** (colours, title, subtitles, rhythm) is in the **Style** page: what you change overlays the default style, and the rest stays as it is.

### How you write it

Tell Claude in the chat. For example:

> Let's make my profile: ask me the questions you need and write it.

Claude asks who you are, who you speak to, where you publish, what you never say, and writes it into the data folder. You can correct it whenever you like, always in words: "add YouTube to my channels", "my audience is not technical", "I never say…". **Do not edit the files by hand**: a writing mistake makes it unusable: the app still starts, but works with the last profile that was fine (or with no profile, if there was none) until you fix it. Ask Claude.

Without a profile the app works with its default rules, but Claude knows nothing about you or your audience: it is best to start here.

You can also set the computer (which functions are on, where they run) from the **Engines** page, without going through the chat.

---

## 4. One video, from idea to release

You talk to Claude in the **chat** and look at the result in the studio. Every video follows the same eight steps, in the same order; you skip a step only if you say so. Before a long job Claude tells you what it does and how long it will take (for example "about 4 min, ends around 3:42 pm") and waits for your go.

### The chat

- The **Chat** button in the bar (or **Ctrl+J**) opens and closes it; a red dot says Claude is working or waiting for your reply. At the top of the chat you find the title, the status ("Ready", "Working", "Waiting for your reply"), **Model** and **Effort** (how much Claude thinks before answering), and two icon buttons: **"Conversations"** (pick up an old one, even one opened from a terminal) and **"New conversation"**.
- Claude knows which video and which page you are looking at: you can say "this video" or "this card".
- **Write** and press Enter (Shift+Enter adds a line). While Claude works you can still write: the message goes in a queue. **"Stop"** interrupts the work; **"Send to background"** (or Ctrl+B) moves it aside and lets you keep talking.
- **Attach** images and files with the paperclip, by pasting them or dragging them onto the chat. A large video is not copied, it is linked.
- In the app there is also the **microphone**: one click (or **Ctrl+Space**) and you dictate, another click and you finish. Your computer transcribes the text; the audio does not leave it. You reread and send.
- Claude works on its own: it runs commands and writes files without asking for permission.
- When Claude has a choice to put to you, it shows buttons; **"Other"** opens a field where you write your own answer.
- The images Claude shows you (photos of the videos, frames of the scenes) stay in the conversation and open full screen with a click.
- **If you prefer Claude Code in a terminal**, with the app open, go into the data folder and start it like this (in PowerShell): `claude --plugin-dir "$env:LOCALAPPDATA\Mango Animation\codice"`. Claude has the same method and the same tools as in the chat.

### Where your videos are

The **Videos** page splits them by status: in progress, proposals, ready, published, discarded. Each video is a card with its image. For a new video there is the line "For a new video, ask in the chat." Opening a video you find these tabs: **Rehearsal** (when there is one), **Edit**, **Card**, **Check**, **Cover**, **Files**. The **Status** menu at the top changes the status (Proposal, In progress, Ready, Published, Discarded).

The **Jobs** panel in the bar says what is running and what is waiting, with the estimate of how long it takes and **"Stop"** to interrupt it. The computer does one heavy job at a time.

### The steps

| | step | what you say in the chat | where you look |
|---|---|---|---|
| 1 | **The idea** | "what do we do now?" or "I was thinking of…", or you bring footage ("I gave you the videos") | **Videos**, **Proposals** group: the new video's card with its preview |
| 2 | **The script** | you discuss the text with Claude until you are happy | the video's **Card** tab, **The proposal** section: **Hook**, **Center**, **Close** (you can also write them yourself: they save when you leave the field) |
| 3 | **The rehearsal** | "make me the rehearsal" | the **Rehearsal** tab (the animations with the line to say, to record against) |
| 4 | **The recorded text** | "I recorded" | in the chat, sentence by sentence, with the chosen take; in **Footage**, opening the file, **The speech** with timings |
| 5 | **Text and animations** | you say what works and what does not | in the chat first in words, then one frame per scene |
| 6 | **The edit** | "edit it" | the **Edit**, **Check**, **Cover** tabs |
| 7 | **The corrections** | the round's notes, all together | previews of the touched pieces, then the full edit once |
| 8 | **The release** | "it is approved, give me the caption", then "I published it" | the **Card** tab: **Caption and hashtags**, **Where it came out** |

**1 and 2. Idea and script.** You can start from footage you already have, from work already done in your sources, from what the audience asks, or from an idea of your own. Claude first proposes in words (hook, center, close, length), then puts them in the archive. It also tells you what framing it sees; you can ask for them in your own words:

| if you say… | the framing is |
|---|---|
| "with my silhouette and the animations" | you as a silhouette over animations; above, the animations, then the subtitles, below your head |
| "extract from the live" | 16:9 recording: screen on top, your face below, pieces chosen by words |
| "just me talking", "normal video" | the footage full screen, subtitles under your head, no animation |
| "without my face, all animations" | your voice underneath, the animation full screen |
| "let's frame the screen", "a document" | the screen or the document, no face |

(These phrases are the method's defaults, in Italian. You can add your own for the same framings, in your profile.)

**3. The rehearsal.** It is a video without your voice: the animations and, below, every whole sentence to read (the word to say now in red, the ones already said in black, the ones still to say in grey). You record yourself while watching it. It is not the finished video. The **Jobs** panel shows it as "Rehearsal for recording"; from the phone you find it in the "Le prove" (rehearsals) page (section 5).

**4. The recorded text.** The footage arrives from the phone, from **Record** or from the chat (section 5). As soon as it is there, Claude transcribes it and proposes the video's text sentence by sentence, with the chosen take, the seconds, and what stays out. You discuss until you fix it.

**5. Text and animations.** For each sentence Claude describes in words what the scene shows and on which word each thing enters; you say what works and what does not. Then one **still frame** per scene. The real render starts only after your yes. Animations are always moving, never an animated bullet list.

**6. The edit.** Claude writes the editing plan, tells you how long it lasts and waits for your go. Then it edits (cuts always fall on whole words), **checks** (listens to the file again, looks at the frames next to the words, rereads what you say and show looking for mistakes) and makes the cover. In the **Edit** tab:

- the preview has two modes: **Plan** (shows the plan at once, for correcting) and **Edited** (the full video, with the cover at the start);
- below, the **timeline**: scenes, pieces, words, subtitles, title and sounds; you can drag the edges of the pieces and split with the **S** key;
- **Undo** and **Redo** are at the top.

If you adjust by hand while Claude is already editing, the bar says "Plan changed": the edit will restart by itself, or you stop it with **"Stop"** in the Jobs panel and ask Claude to edit again.

The **Check** tab shows the outcome: silences, hesitations, misplaced words, cuts inside speech, differences between what you wanted and what you hear. The things to verify in the content, Claude marks for you. The **Cover** tab shows the cover and the video with the cover at the start: it goes into the video with the edit.

**7. The corrections.** Watch the video and collect all your notes in one message. Claude applies them in one go, makes **previews** of the touched pieces (a minute or two) and only when they are right does it redo the full edit.

**8. The release.** Claude proposes two versions of the caption with the hashtags, and tells you which file to upload. **You always publish**: Claude does not write on your channels. When you have published, say so (with the address if you have it): Claude marks the video as published and records the date. In the **Card** tab you find the caption (with **"Copy the caption"**), the hashtags, where it came out and, when the channel is read after release, the numbers.

To open a file or a video, ask Claude to show it to you: it opens it in the browser. In the **Files** tab you find the files that come out (**"Show in folder"**, **"Copy the path"**) and the footage used.

### Carousels

Besides videos you can make **carousels** (scrolling images, for TikTok): say "let's make a carousel". They have three tabs: **Slides**, **Card**, **Files**. The slides are rendered and redone by asking in the chat.

### Reading TikTok and downloading from the web

If you ask, Claude can read the numbers, comments and messages of your TikTok channel from your browser, and download a video from the web (or a stretch of one) into your footage. Do this **only on your own accounts and with content you have the right to use**: the terms of TikTok, YouTube and other sites are yours to respect; the app does not check them.

---

## 5. The phone, recording, languages

### Sending footage from the phone to the computer

In the **Footage** page, at the top, there is the **"Files from your phone"** box. By default it is off: the computer does not listen on the network. Click **"Connect a phone"**: two codes appear to scan with the phone, on the same Wi-Fi.

- **The Shortcut**: installs on the iPhone a quick command that sends videos to the computer.
- **Upload from the page**: opens on the phone a page with an "Carica video" (Upload video) button, to pick from the library. Nothing to install.

The footage goes into that day's footage, with its card. In the bar, **Phone ready** (green dot) says the phone can send. The first time, Windows may ask permission to let the program in from the network: click **"Allow"**. If the phone is not ready, the box says why and what to do, with **"Check again"**. **"Disconnect the phones"** closes the door again.

### Watching videos on the phone

When a phone is connected, **"From your phone"** appears in the **Videos** page and in each video's page: it shows a code to scan, always on your home Wi-Fi. A page opens with your edited videos (the full version, with the cover) and the rehearsals to watch before recording. Save it to the Home screen and you will find it there. The phone pages are written in Italian.

### The whole studio from the phone

In **Footage**, under the arrivals, **"The studio on your phone"** (off by default). **"Turn on"** shows two ways, each with its own code: **At home (same Wi-Fi)** and **Away from home (Tailscale)**, which needs Tailscale on, on the computer and on the phone. With the phone you use the whole studio: videos, edit and chat. **Anyone with the link controls your computer** through the chat: give it to nobody. **"Turn off"** signs everyone out and changes the link; **"Make a new key"** gives a new link, and phones already signed in must sign in again. The box is only visible from the computer, not from the phone.

### Recording from the studio

The **Record** button in the bar opens a panel. Choose what to record:

- **Screen only** (no audio);
- **Screen and voice** (the screen with your voice from the microphone, in one file);
- **Screen, voice and face** (plus the webcam, in a second file).

For the options with the microphone and for the face you also choose which microphone and which webcam (if you do not see them, **"Look for devices again"**). **"Start recording"**: the bar shows the elapsed time. **"Stop recording"** from the panel: the files appear in today's footage. The whole screen is recorded. For a vertical video it is best to record with the program's window narrow and tall, so the screen fills the frame.

### Languages

- **The interface** is in Italian and English. The button with the code (**IT** or **EN**) in the bar cycles through the system's language, Italian and English. The app's own screens and its error messages follow the same language.
- **The language of your videos** is in the profile: Claude writes to you in that language and prepares your videos' texts in it.
- **A version in another language** of a finished video: ask for "the English version" (or another language). Subtitles, title, cover and writings in the animations change; your voice stays the original. The translated video is a new video next to the original. If the cover has drawn text in it, it has to be redone, translated.

---

## 6. When something goes wrong

### How to restart

Close the app's window and reopen it from the Start menu. Closing it also stops everything the app had started. If after closing it a new start opens nothing, open Task Manager (Ctrl+Shift+Esc), end "Mango Animation" and reopen it.

### Where to look

| what you see | what it means and what to do |
|---|---|
| **"Getting everything ready"** for more than a minute | the app is starting the studio (it waits up to 90 seconds) |
| **"The server won't start"** | the app shows the last lines of what went wrong and where the log is: **"Try again"**; if it does not pass, close and reopen, and if still no, send those lines to whoever is helping you |
| **"The data folder has a problem"** / **"The data folder is gone"** | see "The data folder" in section 2 |
| **"To get started you need Claude Code"**, **"won't start"**, **"Connect Claude Code to your account"** | see "The link to Claude Code" in section 2 |
| **"Something went wrong"** during the download | the page says which entry and why: **"Try again"** resumes without downloading again what has arrived |
| the chat says why a conversation will not open | **"Try again"**; if it is the Claude Code sign-in, redo it from the start page |
| a red warning on a video's card or plan | a file does not pass the checks: ask in the chat to fix it; the exact reason opens on request |
| a **failed** job in the **Jobs** panel | ask Claude what happened and to redo it |
| **"longer than expected"** on a job | it is taking longer than the estimate; you can wait or stop it with **"Stop"** |
| **Phone not ready** | hover over the button or open **Footage**: the box says why (usually Windows blocks the program: unblock it in "Windows Security" or set the Wi-Fi to "Private network") and **"Check again"** |
| **Record** says it is not available | the panel writes the reason |
| the **Engines** page says a choice does not work | for example a card that is not there or is busy: the job stops and says what to fix, it does not switch to the processor on its own |
| space is not enough | free some space, or turn off a function in the first-start download page (or in **Engines**) |

A video's plan, the cards and the files the app writes are in the data folder. If something breaks after a hand edit, ask Claude to fix it: the folder keeps the previous version of the plan.

---

*Mango Animation is an independent project. It is not a product of Anthropic and is not approved or endorsed by Anthropic. "Claude" and "Claude Code" are trademarks of Anthropic and are used here only to name the program the app works with.*
