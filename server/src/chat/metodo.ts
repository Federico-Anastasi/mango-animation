// Come il metodo del prodotto (regole, skill, motore, strumento «video») arriva a Claude Code, che lavora nella cartella di lavoro.
import type { McpStdioServerConfig, Options } from "@anthropic-ai/claude-agent-sdk"
import { delimiter, join } from "node:path"
import { stessaCartella } from "./sessioni"
import type { FunzioneQuery } from "./tipi"

/** Il codice è una cartella in più di Claude Code: ne carica regole e skill, e il suo Python si trova da qualunque cartella. */
export function aperturaDelMetodo(codice: string, lavoro: string, ambiente: Record<string, string | undefined> = process.env): Required<Pick<Options, "additionalDirectories" | "env">> {
  return {
    additionalDirectories: stessaCartella(codice, lavoro) ? [] : [codice],
    env: {
      ...ambiente,
      CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: "1",
      MANGO_ANIMATION_LAVORO: lavoro,
      PYTHONPATH: [codice, ambiente["PYTHONPATH"]].filter((p): p is string => !!p).join(delimiter),
    },
  }
}

export const NOME_STRUMENTO_VIDEO = "video"

/** Lo strumento «video»: il suo codice sta nel prodotto, i dati che legge nella cartella di lavoro. */
export const serverVideo = (codice: string, lavoro: string): Record<string, McpStdioServerConfig> => ({
  [NOME_STRUMENTO_VIDEO]: { type: "stdio", command: process.execPath, args: ["run", "--cwd", join(codice, "server"), "mcp"], env: { MANGO_ANIMATION_LAVORO: lavoro } },
})

/** La chat usa il Claude Code che il creator ha sul computer (lo trova l'app, `docs/APP.md`), non la copia che l'SDK porta con sé. */
export const conIlClaudeDelCreator = (query: FunzioneQuery, percorso: string | undefined): FunzioneQuery =>
  percorso ? ({ prompt, options }) => query({ prompt, options: { ...options, pathToClaudeCodeExecutable: percorso } }) : query
