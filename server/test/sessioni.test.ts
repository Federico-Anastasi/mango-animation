import { expect, test } from "bun:test"
import type { SDKSessionInfo } from "@anthropic-ai/claude-agent-sdk"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { messaggiDaSessione } from "../src/chat/storico"
import { cartellaDelleSessioni, sessioniDiClaudeCode, vociDaSessioni } from "../src/chat/sessioni"

const RADICE = "C:/progetto"
const sessione = (id: string, campi: Partial<SDKSessionInfo>): SDKSessionInfo => ({ sessionId: id, summary: "", lastModified: 1, ...campi })

test("il titolo è quello che Claude Code mostra in /resume: il titolo dato alla conversazione, non il primo messaggio", () => {
  const voci = vociDaSessioni(
    [
      sessione("a", { firstPrompt: "/model", summary: "Pulizia del disco", customTitle: "Pulizia del disco" }),
      sessione("b", { firstPrompt: "[Context: the creator is looking at the video «Orto» (orto).]\n\nControlla l'orto", summary: "[Context: the creator is looking at the video «Orto» (orto).]\n\nControlla l'orto" }),
    ],
    RADICE,
  )
  expect(voci.map((v) => v.titolo)).toEqual(["Pulizia del disco", "[Context: the creator is looking at the video «Orto» (orto).]\n\nControlla l'orto"])
})

test("una conversazione fatta solo di comandi non entra nell'elenco", () => {
  const voci = vociDaSessioni([sessione("a", { firstPrompt: "/clear", summary: "/clear" }), sessione("b", { summary: "Ciao" })], RADICE)
  expect(voci.map((v) => v.id)).toEqual(["b"])
})

test("le conversazioni di un'altra cartella (i worktree del repo) restano fuori", () => {
  const voci = vociDaSessioni([sessione("a", { summary: "Qui", cwd: "c:/progetto" }), sessione("b", { summary: "Altrove", cwd: "C:/progetto/.claude/worktrees/x" })], RADICE)
  expect(voci.map((v) => v.id)).toEqual(["a"])
})

test("da un file vero di Claude Code: la risposta di un comando, che l'SDK non dà nelle sue righe, si rilegge dal file", async () => {
  const configurazione = await mkdtemp(join(tmpdir(), "claude-finto-"))
  const radice = join(configurazione, "lavoro")
  const id = "11111111-1111-4111-8111-111111111111"
  const prima = process.env["CLAUDE_CONFIG_DIR"]
  process.env["CLAUDE_CONFIG_DIR"] = configurazione
  try {
    const cartella = cartellaDelleSessioni(radice, configurazione)
    await mkdir(cartella, { recursive: true })
    const riga = (campi: object): string => JSON.stringify({ isSidechain: false, userType: "external", cwd: radice, sessionId: id, version: "2.1.318", ...campi })
    const file = [
      riga({ parentUuid: null, type: "user", message: { role: "user", content: "<local-command-caveat>x</local-command-caveat>" }, isMeta: true, uuid: "b1", timestamp: "2026-11-06T19:26:17.691Z" }),
      riga({ parentUuid: "b1", type: "user", message: { role: "user", content: "<command-name>/model</command-name>\n<command-message>model</command-message>\n<command-args>sonnet</command-args>" }, uuid: "c1", timestamp: "2026-11-06T19:26:17.669Z" }),
      riga({ parentUuid: "c1", type: "system", subtype: "local_command", content: "<local-command-stdout>Set model to Sonnet</local-command-stdout>", level: "info", uuid: "s1", timestamp: "2026-11-06T19:26:17.688Z" }),
      riga({ parentUuid: "s1", type: "system", subtype: "turn_duration", durationMs: 5, uuid: "s2", timestamp: "2026-11-06T19:26:20.000Z" }),
      riga({ parentUuid: "s2", type: "user", message: { role: "user", content: "ciao" }, uuid: "u2", timestamp: "2026-11-06T19:27:00.000Z" }),
      '{"type":"system","subtype":"local_command","content":"scritta a metà',
    ].join("\n")
    await writeFile(join(cartella, `${id}.jsonl`), file)

    const righe = await sessioniDiClaudeCode(radice, 10, configurazione).leggi(id)
    expect(righe?.map((r) => [r.type, r.uuid, r.subtype, r.content])).toEqual([
      ["user", "c1", undefined, undefined],
      ["system", "s1", "local_command", "<local-command-stdout>Set model to Sonnet</local-command-stdout>"],
      ["user", "u2", undefined, undefined],
    ])
    expect(messaggiDaSessione(righe ?? [], radice, "it").map((m) => [m.ruolo, m.parti])).toEqual([
      ["utente", [{ tipo: "testo", testo: "/model sonnet" }]],
      ["claude", [{ tipo: "testo", testo: "Set model to Sonnet" }]],
      ["utente", [{ tipo: "testo", testo: "ciao" }]],
    ])
  } finally {
    if (prima === undefined) delete process.env["CLAUDE_CONFIG_DIR"]
    else process.env["CLAUDE_CONFIG_DIR"] = prima
    await rm(configurazione, { recursive: true, force: true })
  }
})
