# Contributing to Mango Animation

Thanks for helping. Mango Animation is a small project: the fastest way to get a change in is to talk about it first.

## Issues

- **Bugs**: open an issue with what you did, what you expected and what happened. In the app, the flag button
  ("Report a problem") prepares a cleaned report with the logs; if you used it, say so in the issue.
- **Security problems**: never in a public issue, see [SECURITY.md](SECURITY.md).
- **Ideas and larger changes**: open an issue before writing code, so we can agree on the direction.
- You can write issues and pull requests in English or Italian.

## Pull requests

- One change per pull request, with a short description of what it does and how you tested it.
- Code, comments, identifiers and documents are in Italian, like the rest of the repository. The texts the app shows
  are in Italian and English, always both. The rules for code are in [`.claude/rules/codice.md`](.claude/rules/codice.md).
- Whoever changes a shape (the plan, the API, a schema) changes its document in the same pull request: see
  [`docs/PIANO.md`](docs/PIANO.md) and [`docs/API.md`](docs/API.md).

## Build and test

Set-up on a new computer: [`docs/NUOVO-COMPUTER.md`](docs/NUOVO-COMPUTER.md). The desktop app, its installer and the
updates: [`docs/APP.md`](docs/APP.md). After `bun install` in `server/`, `studio/` and `animazioni/`, before opening a
pull request run, from the root of the repository:

```powershell
bun run --cwd server test;     bun run --cwd server typecheck       # the server
bun run --cwd studio test;     bun run --cwd studio typecheck       # the interface
bun run --cwd animazioni test; bun run --cwd animazioni typecheck   # the animated scenes
python -m pytest motore/prove -q                                    # the editing engine
python -m pytest strumenti/prove -q                                 # the tools
cargo test --manifest-path app/Cargo.toml                           # the desktop app
```

The tests don't use the video card, a real archive or the server's ports. Run the Python ones with an empty
`CUDA_VISIBLE_DEVICES`.

Your videos and your profile live in a working folder outside the repository; never add them to a pull request.

## License and name

By contributing you agree that your contribution is licensed under the project's license, AGPL-3.0-or-later (see
[NOTICE.md](NOTICE.md)). There is no CLA. The name and logo are not covered by that license: a fork or a modified version
needs its own name and logo, see [TRADEMARKS.md](TRADEMARKS.md).
