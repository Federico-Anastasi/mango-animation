// Come lo strumento «video» del prodotto arriva a un motore, che lavora nella cartella di lavoro.
import { delimiter, join, resolve } from "node:path"
import type { CapacitaDelMotore } from "./motore"

export const stessaCartella = (a: string, b: string): boolean => resolve(a).toLowerCase() === resolve(b).toLowerCase()

export const NOME_STRUMENTO_VIDEO = "video"

/** Un server MCP che il motore lancia come processo, con la forma che gli adattatori traducono nella propria configurazione. */
export interface ServerMcp {
  type: "stdio"
  command: string
  args: string[]
  env: Record<string, string>
}

/** A quale conversazione appartiene lo strumento «video» che si sta configurando, e cosa sa fare il suo motore. */
export interface ConversazioneDelloStrumento {
  id: string
  capacita: Pick<CapacitaDelMotore, "strumentoDelleDomande">
}

/**
 * Lo strumento «video»: il suo codice sta nel prodotto, i dati che legge nella cartella di lavoro. Con la conversazione riceve anche il
 * suo id: l'attesa di un lavoro si chiude quando il creator scrive lì, e se il motore non ha uno strumento suo per le domande le fa lui.
 */
export const serverVideo = (codice: string, lavoro: string, conversazione?: ConversazioneDelloStrumento): Record<string, ServerMcp> => ({
  [NOME_STRUMENTO_VIDEO]: {
    type: "stdio",
    command: process.execPath,
    args: ["run", "--cwd", join(codice, "server"), "mcp"],
    env: {
      MANGO_ANIMATION_LAVORO: lavoro,
      ...(conversazione ? { MANGO_ANIMATION_CONVERSAZIONE: conversazione.id } : {}),
      ...(conversazione && !conversazione.capacita.strumentoDelleDomande ? { MANGO_ANIMATION_DOMANDE: "1" } : {}),
    },
  },
})

/** L'ambiente dei processi di un motore: dove sono i dati del creator e come `python -m motore` trova il codice, da qualunque cartella. */
export const ambienteDelMetodo = (codice: string, lavoro: string, ambiente: Record<string, string | undefined>): Record<string, string | undefined> => ({
  ...ambiente,
  MANGO_ANIMATION_LAVORO: lavoro,
  PYTHONPATH: [codice, ambiente["PYTHONPATH"]].filter((p): p is string => !!p).join(delimiter),
})

/**
 * Ciò che Claude Code sa dall'ambiente e gli altri motori no: dove sono i dati e cosa è il metodo. Il metodo stesso (CLAUDE.md, regole,
 * skill) arriva a ciascuno per la sua strada.
 */
export function istruzioniDelMetodo(lavoro: string, codice: string, aggiunte: string): string {
  return [
    `You work in ${lavoro}: the creator's data folder, where every relative path of the method starts (archivio/grezzo/<day>/ the footage, archivio/video/<slug>/ the videos, profilo.json and .claude/ the creator's profile and rules). Look for files there and with the tools, not elsewhere on the computer.`,
    `The product's method (its CLAUDE.md, rules and skills, which you already have) lives in ${codice}: read it, never write there.`,
    `The engine runs as \`python -m motore\` with PYTHONPATH=${codice}.`,
    aggiunte,
  ]
    .filter((r) => r !== "")
    .join("\n")
}
