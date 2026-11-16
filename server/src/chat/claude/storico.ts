// Le conversazioni di Claude Code lette dai suoi file, nelle righe che la chat ricompone in messaggi.
import { eOggetto } from "../../disco"
import type { Lingua } from "../../lingua"
import { eAvvio } from "../primoGiro"
import { messaggiDalleRighe, partiDelTestoDelCreator, type RigaLetta } from "../storico"
import type { MessaggioChat, Parte } from "../tipi"
import { contestoDaUsage, esitoDelRisultato, partiDeiBlocchi, risultatiDegliStrumenti, uscitaLocale } from "./blocchi"
import type { MessaggioSessione } from "./query"

/** Ciò che Claude Code scrive come messaggio «utente» ma non è un messaggio del creator. */
const MARCATORI_INTERNI = /^(<(local-command|system-reminder|task-notification)|\[Request interrupted)/

const COMANDO = /^\s*<command-name>\s*(\S+?)\s*<\/command-name>(?:[\s\S]*?<command-args>([\s\S]*?)<\/command-args>)?/

/** Un comando con la barra com'è scritto nel file («/model sonnet»); `null` se il testo non è un comando. */
function testoDelComando(testo: string): string | null {
  const trovato = COMANDO.exec(testo)
  if (!trovato?.[1]) return null
  const nome = trovato[1].startsWith("/") ? trovato[1] : `/${trovato[1]}`
  const argomenti = (trovato[2] ?? "").trim()
  return argomenti === "" ? nome : `${nome} ${argomenti}`
}

function testoDi(contenuto: unknown): string {
  if (typeof contenuto === "string") return contenuto
  if (!Array.isArray(contenuto)) return ""
  return contenuto
    .flatMap((b) => (eOggetto(b) && b["type"] === "text" && typeof b["text"] === "string" ? [b["text"]] : []))
    .join("\n")
}

const eRigaDiAvvio = (riga: MessaggioSessione): boolean => riga.type === "user" && eOggetto(riga.message) && eAvvio(testoDi(riga.message["content"]))

/** La conversazione è cominciata con l'avvio del primo giro (`primoGiro.ts`). */
export const eDelPrimoGiro = (righe: MessaggioSessione[]): boolean => righe.some(eRigaDiAvvio)

/** I token che la conversazione occupava all'ultima risposta scritta nel file; `null` se nessuna lo dice o se dopo l'ultima il contesto è stato riassunto. */
export function contestoDaSessione(righe: MessaggioSessione[]): number | null {
  for (const riga of [...righe].reverse()) {
    if (riga.type === "system" && riga.subtype === "compact_boundary") return null
    if (riga.type !== "assistant" || !eOggetto(riga.message)) continue
    const usati = contestoDaUsage(riga.message["usage"])
    if (usati !== null) return usati
  }
  return null
}

/** Il modello della risposta più recente scritta nel file (`claude-opus-5-5`); `null` se nessuna lo dice. Le risposte che Claude Code scrive da sé hanno un modello fra parentesi angolari. */
export function modelloDaSessione(righe: MessaggioSessione[]): string | null {
  for (const riga of [...righe].reverse()) {
    if (riga.type !== "assistant" || !eOggetto(riga.message)) continue
    const modello = riga.message["model"]
    if (typeof modello === "string" && modello !== "" && !modello.startsWith("<")) return modello
  }
  return null
}

function rigaLetta(riga: MessaggioSessione, archivio: string): RigaLetta[] {
  if (riga.type === "system" && riga.subtype === "compact_boundary") return [{ tipo: "riassunto" }]
  const tempo = riga.timestamp === undefined ? {} : { quando: riga.timestamp }
  // La risposta di un comando locale è una riga di sistema senza `message`; quella di /compact una riga dell'utente.
  const testoUtente = riga.type === "user" && eOggetto(riga.message) ? testoDi(riga.message["content"]) : ""
  const uscita = riga.type === "system" && riga.subtype === "local_command" && typeof riga.content === "string" ? uscitaLocale(riga.content) : testoUtente.trimStart().startsWith("<local-command-std") ? uscitaLocale(testoUtente) : null
  if (uscita) return [{ tipo: "uscita", id: riga.uuid, ...tempo, testo: uscita }]
  if (!eOggetto(riga.message)) return []
  const contenuto = riga.message["content"]
  if (riga.type === "assistant") return [{ tipo: "motore", id: riga.uuid, ...tempo, parti: partiDeiBlocchi(contenuto, riga.timestamp) }]
  if (riga.type !== "user") return []
  const risultati = risultatiDegliStrumenti(contenuto)
  if (risultati.length > 0) return [{ tipo: "esiti", ...tempo, esiti: risultati.map((r) => ({ id: String(r["tool_use_id"]), esito: esitoDelRisultato(r) })) }]
  const testo = testoDi(contenuto)
  const comando = testoDelComando(testo)
  const diFa = !riga.isCompactSummary && (riga.origin?.kind === undefined || riga.origin.kind === "human") && !MARCATORI_INTERNI.test(testo.trimStart())
  const parti: Parte[] = comando !== null ? [{ tipo: "testo", testo: comando }] : diFa ? partiDelTestoDelCreator(testo, archivio) : []
  return [{ tipo: "creator", id: riga.uuid, ...tempo, parti }]
}

export const messaggiDaSessione = (righe: MessaggioSessione[], archivio: string, lingua: Lingua): MessaggioChat[] =>
  messaggiDalleRighe(
    righe.flatMap((riga) => rigaLetta(riga, archivio)),
    lingua,
  )
