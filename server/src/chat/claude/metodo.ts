// Come il metodo del prodotto (regole, skill, motore, strumento «video») arriva a Claude Code, che lavora nella cartella di lavoro.
import type { Options } from "@anthropic-ai/claude-agent-sdk"
import { ambienteDelMetodo, stessaCartella } from "../metodo"
import type { FunzioneQuery } from "./query"

/** Il codice è una cartella in più di Claude Code: ne carica regole e skill, e il suo Python si trova da qualunque cartella. */
export function aperturaDelMetodo(codice: string, lavoro: string, ambiente: Record<string, string | undefined> = process.env): Required<Pick<Options, "additionalDirectories" | "env">> {
  return {
    additionalDirectories: stessaCartella(codice, lavoro) ? [] : [codice],
    env: { ...ambienteDelMetodo(codice, lavoro, ambiente), CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: "1" },
  }
}

/** La chat usa il Claude Code che il creator ha sul computer (lo trova l'app, `docs/APP.md`), non la copia che l'SDK porta con sé. */
export const conIlClaudeDelCreator = (query: FunzioneQuery, percorso: string | undefined): FunzioneQuery =>
  percorso ? ({ prompt, options }) => query({ prompt, options: { ...options, pathToClaudeCodeExecutable: percorso } }) : query
