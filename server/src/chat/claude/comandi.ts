// I comandi con la barra di Claude Code (`docs/chat/comandi.md`): l'elenco dell'SDK come lo mostra la chat, e i messaggi che lo studio non lascia passare.
import type { SlashCommand } from "@anthropic-ai/claude-agent-sdk"
import { frase } from "../../lingua"
import type { ComandoChat } from "../comandi"
import { ErroreChat } from "../tipi"

export const traduciComandi = (info: SlashCommand[]): ComandoChat[] => info.map((c) => ({ nome: c.name, descrizione: c.description, argomenti: c.argumentHint ?? "", alias: c.aliases ?? [] }))

/** I comandi che nello studio hanno il loro posto e che, mandati a Claude Code, gli farebbero cambiare cosa la chat non sa. */
const DELLO_STUDIO = /^\/(clear|reset|new|model|effort)(?=\s|$)/

export function rifiutaIlComandoDelloStudio(testo: string): void {
  const nome = DELLO_STUDIO.exec(testo)?.[1]
  if (nome === undefined) return
  if (nome === "model") throw new ErroreChat(400, frase("Il modello non si cambia con «/model»: sceglilo dal menu del modello, così la chat lo sa.", "The model is not changed with «/model»: choose it from the model menu, so the chat knows."))
  if (nome === "effort") throw new ErroreChat(400, frase("L'effort non si cambia con «/effort»: sceglilo dal menu dell'effort, così la chat lo sa.", "The effort is not changed with «/effort»: choose it from the effort menu, so the chat knows."))
  throw new ErroreChat(400, frase(`«/${nome}» cambierebbe la conversazione sotto la chat: chiudi questa conversazione e aprine una nuova.`, `«/${nome}» would change the conversation under the chat: close this conversation and start a new one.`))
}
