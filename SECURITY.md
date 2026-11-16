# Security

## Reporting a vulnerability

Report it privately with GitHub's "Report a vulnerability" button, in this repository's Security tab. Please don't open a
public issue for a vulnerability.

Only the latest release is supported: fixes ship in a new release, and the app offers it at the next start.

## What Mango Animation protects, and what it doesn't

Mango Animation runs on your computer. The chat inside it is run by the engine you use (Claude Code, Codex or Mango Code).
Claude Code and Codex are started with permission prompts turned off, so they work on their own with access to your
shell, your files and the web; Mango Code follows its own permission rules. The app has **no sandbox**: if you need isolation,
run it in a virtual machine.

- The studio's server listens on `127.0.0.1` only and answers only to `127.0.0.1` and `localhost`. Every request needs a
  random key, stored in the working folder (`archivio/arrivi/chiave-api.json`); a browser receives it once, in a cookie.
  Changing requests that come from a web page of another origin are refused.
- Receiving videos from your phone is off until you turn on "Files from your phone" in Settings › Phone. Then a separate
  port listens on your network; every request needs another random key (the one in the QR code), and only video, audio
  and photo files are accepted. Turning the switch off turns the phone routes off, and the port is closed unless the
  studio on the network (below) needs it.
- The studio from the network (phone or another computer) is off by default. When on, it needs a link with its own key
  and keeps a session cookie; it opens only at the computer's numeric address, never at a name. Turning it off ends the
  sessions and changes the key. Both phone features use plain HTTP, without encryption: turn them on only on a network
  you trust. A session in the studio can drive the chat, so it is worth as much as the computer.
- "Report a problem" sends nothing until you press the button. The text is cleaned before it leaves the app: your
  account name in paths, the computer's name, emails, network addresses, keys and tokens are replaced with placeholders.
  Log files, which are attached, may still contain the names of your videos and files. The window screenshot and an
  image you choose to attach are pictures and are not cleaned: the screenshot is off until you turn it on in the
  dialog, and an image is sent only if you pick one. Transcripts, chats and the files of your working folder are never
  attached. A build without a reporting address saves the text to a file and
  opens a pre-filled GitHub issue page instead.
- Every connection the app makes to the internet is checked against the certificates Windows trusts, and goes through
  the proxy Windows is set to use (or `HTTPS_PROXY` / `NO_PROXY`), never for the computer's own addresses. The app never
  installs a certificate and has no option to skip the check: behind a company filter whose certificate Windows does
  not know, downloads stop with a message instead of continuing unchecked.
- Updates are checked at start (unless "Update by itself" is off in Settings › Help) and when you press "Check now".
  Nothing is installed without your click, and the downloaded installer is accepted
  only if its signature matches the public key built into the app. The installer itself has no paid Windows code-signing
  certificate, which is why Windows shows "Windows protected your PC" on the first install.
