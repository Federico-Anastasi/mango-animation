// I comandi con la barra della chat (`docs/CHAT.md`, «I comandi con la barra»): quelli dello studio, che fanno nello studio ciò che nel
// terminale ha la sua finestra, e quelli di Claude Code, che arrivano dal server.
import { t } from "../lingua"
import type { ComandoChat } from "./tipi"

export type NomeComandoStudio = "clear" | "exit" | "resume" | "model" | "effort"

/** Una riga della tendina. */
export interface VoceComando extends ComandoChat {
  studio: boolean
}

const ALIAS_STUDIO: Record<NomeComandoStudio, string[]> = {
  clear: ["reset", "new"],
  exit: ["quit"],
  resume: ["continue"],
  model: [],
  effort: [],
}

/** I comandi dello studio, con le descrizioni nella lingua in uso. */
function comandiDelloStudio(): VoceComando[] {
  const voce = (nome: NomeComandoStudio, descrizione: string, argomenti = ""): VoceComando => ({ nome, descrizione, argomenti, alias: ALIAS_STUDIO[nome], studio: true })
  return [
    voce("clear", t("Chiude questa conversazione e ne apre una nuova", "Close this conversation and start a new one")),
    voce("exit", t("Chiude la conversazione", "Close the conversation")),
    voce("resume", t("Apre l'elenco delle conversazioni", "Open the list of conversations")),
    voce("model", t("Sceglie il modello", "Choose the model"), t("[modello]", "[model]")),
    voce("effort", t("Sceglie quanto ragiona prima di rispondere", "Choose how much it thinks before answering"), t("[livello]", "[level]")),
  ]
}

const minuscolo = (nome: string) => nome.toLowerCase()
const nomiDi = (v: ComandoChat): string[] => [v.nome, ...v.alias].map(minuscolo)

/** I comandi dello studio, poi quelli del server se la conversazione è di Claude Code. Un comando del server che ha il nome (o un alias) di uno dello studio non si ripete. */
export function elencoComandi(delServer: ComandoChat[] | null, conServer: boolean): VoceComando[] {
  const studio = comandiDelloStudio()
  if (!conServer || !delServer) return studio
  const presi = new Set(studio.flatMap(nomiDi))
  return [...studio, ...delServer.filter((c) => !presi.has(minuscolo(c.nome))).map((c): VoceComando => ({ ...c, studio: false }))]
}

/** Quello che sta dopo la barra se il messaggio è `/` più il nome che si sta scrivendo (senza spazi); altrimenti `null`. */
export const nomeInScrittura = (testo: string): string | null => /^\/(\S*)$/.exec(testo)?.[1] ?? null

/** Prima i comandi il cui nome comincia con ciò che è scritto, poi quelli con un alias che comincia così, poi quelli che lo contengono. */
export function filtra(voci: VoceComando[], scritto: string): VoceComando[] {
  const cercato = minuscolo(scritto)
  const nome = voci.filter((v) => minuscolo(v.nome).startsWith(cercato))
  const alias = voci.filter((v) => !nome.includes(v) && nomiDi(v).some((n) => n.startsWith(cercato)))
  const contengono = voci.filter((v) => !nome.includes(v) && !alias.includes(v) && nomiDi(v).some((n) => n.includes(cercato)))
  return [...nome, ...alias, ...contengono]
}

export interface ComandoDelloStudio {
  nome: NomeComandoStudio
  argomento: string
}

/** Il messaggio, se è un comando dello studio (la prima parola, alias compresi): quale e il resto della riga. */
export function comandoDelloStudio(testo: string): ComandoDelloStudio | null {
  const lettura = /^\/(\S+)\s*([\s\S]*)$/.exec(testo.trim())
  if (!lettura) return null
  const parola = minuscolo(lettura[1]!)
  const nome = (Object.keys(ALIAS_STUDIO) as NomeComandoStudio[]).find((n) => n === parola || ALIAS_STUDIO[n].includes(parola))
  return nome ? { nome, argomento: lettura[2]!.trim() } : null
}
