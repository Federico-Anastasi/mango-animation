import { describe, expect, test } from "bun:test"
import { delimiter, join } from "node:path"
import type { Options } from "@anthropic-ai/claude-agent-sdk"
import { aperturaDelMetodo, conIlClaudeDelCreator, serverVideo } from "../src/chat/metodo"
import type { FunzioneQuery, QueryChat } from "../src/chat/tipi"

describe("come il metodo del prodotto arriva a Claude, che lavora nella cartella di lavoro", () => {
  test("il codice si aggiunge come cartella in più, con le sue regole, e Python lo trova", () => {
    const { additionalDirectories, env } = aperturaDelMetodo("C:/codice", "C:/lavoro", { PYTHONPATH: "C:/altro", PATH: "x" })
    expect(additionalDirectories).toEqual(["C:/codice"])
    expect(env["CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD"]).toBe("1")
    expect(env["MANGO_ANIMATION_LAVORO"]).toBe("C:/lavoro")
    expect(env["PYTHONPATH"]).toBe(["C:/codice", "C:/altro"].join(delimiter))
    expect(env["PATH"]).toBe("x")
  })

  test("senza un PYTHONPATH di partenza resta solo il codice", () => {
    expect(aperturaDelMetodo("C:/codice", "C:/lavoro", {}).env["PYTHONPATH"]).toBe("C:/codice")
  })

  test("se codice e cartella di lavoro sono lo stesso posto non c'è niente da aggiungere", () => {
    expect(aperturaDelMetodo("C:/stessa", "c:/STESSA/", {}).additionalDirectories).toEqual([])
  })

  test("lo strumento «video» si lancia dal codice e legge la cartella di lavoro", () => {
    const { video } = serverVideo("C:/codice", "C:/lavoro")
    expect(video).toEqual({ type: "stdio", command: process.execPath, args: ["run", "--cwd", join("C:/codice", "server"), "mcp"], env: { MANGO_ANIMATION_LAVORO: "C:/lavoro" } })
  })
})

describe("il Claude Code del creator", () => {
  const registra = () => {
    const viste: Options[] = []
    const query: FunzioneQuery = ({ options }) => {
      viste.push(options)
      return {} as QueryChat
    }
    return { viste, query }
  }
  const vuoto = (async function* () {})()

  test("ogni conversazione parte col programma indicato e non con la copia dell'SDK, lasciando il resto delle opzioni com'è", () => {
    const { viste, query } = registra()
    conIlClaudeDelCreator(query, "C:/Users/utente/.local/bin/claude.exe")({ prompt: vuoto, options: { cwd: "C:/lavoro", model: "opus" } })
    expect(viste).toEqual([{ cwd: "C:/lavoro", model: "opus", pathToClaudeCodeExecutable: "C:/Users/utente/.local/bin/claude.exe" }])
  })

  test("senza un programma indicato (si sviluppa a mano) valgono le opzioni com'erano", () => {
    const { viste, query } = registra()
    expect(conIlClaudeDelCreator(query, undefined)).toBe(query)
    expect(conIlClaudeDelCreator(query, "")).toBe(query)
    expect(viste).toEqual([])
  })
})
