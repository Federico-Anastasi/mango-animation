// Una conversazione letta dal suo file: gli stessi messaggi che la chat mostra in diretta, rifatti dalla trascrizione di Claude Code.
import { daTestoDelCreator } from "./allegati"
import { eAvvio } from "./primoGiro"
import { conEsito, contestoDaUsage, partiDeiBlocchi, risultatiDegliStrumenti, uscitaLocale } from "./traduzione"
import type { MessaggioChat, MessaggioSessione, Parte } from "./tipi"
import { eOggetto } from "../disco"
import type { Lingua } from "../lingua"
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

export function messaggiDaSessione(righe: MessaggioSessione[], archivio: string, lingua: Lingua): MessaggioChat[] {
  const messaggi: MessaggioChat[] = []
  const strumenti = new Map<string, { messaggio: MessaggioChat; indice: number }>()
  let claude: MessaggioChat | null = null

  // Come il terminale: di una conversazione riassunta si vede solo ciò che segue l'ultimo riassunto.
  const riassunto = righe.findLastIndex((r) => r.type === "system" && r.subtype === "compact_boundary")
  for (const riga of righe.slice(riassunto + 1)) {
    // La risposta di un comando locale è una riga di sistema senza `message`; quella di /compact una riga dell'utente.
    const testoUtente = riga.type === "user" && eOggetto(riga.message) ? testoDi(riga.message["content"]) : ""
    const uscita = riga.type === "system" && riga.subtype === "local_command" && typeof riga.content === "string" ? uscitaLocale(riga.content) : testoUtente.trimStart().startsWith("<local-command-std") ? uscitaLocale(testoUtente) : null
    if (uscita) {
      if (!claude) {
        claude = { id: riga.uuid, ruolo: "claude", quando: riga.timestamp ?? new Date(0).toISOString(), parti: [] }
        messaggi.push(claude)
      }
      claude.parti.push({ tipo: "testo", testo: uscita })
      continue
    }
    if (!eOggetto(riga.message)) continue
    const contenuto = riga.message["content"]
    const quando = riga.timestamp ?? new Date(0).toISOString()

    if (riga.type === "assistant") {
      const parti = partiDeiBlocchi(contenuto, riga.timestamp)
      if (parti.length === 0) continue
      if (!claude) {
        claude = { id: riga.uuid, ruolo: "claude", quando, parti: [] }
        messaggi.push(claude)
      }
      const messaggio = claude
      parti.forEach((parte) => {
        const indice = messaggio.parti.push(parte) - 1
        if (parte.tipo === "strumento") strumenti.set(parte.id, { messaggio, indice })
      })
      continue
    }

    if (riga.type !== "user") continue
    const risultati = risultatiDegliStrumenti(contenuto)
    if (risultati.length > 0) {
      for (const risultato of risultati) {
        const dove = strumenti.get(String(risultato["tool_use_id"]))
        const parte = dove?.messaggio.parti[dove.indice]
        if (dove && parte?.tipo === "strumento") dove.messaggio.parti[dove.indice] = conEsito(parte, risultato, lingua, riga.timestamp)
      }
      continue
    }

    const testo = testoDi(contenuto)
    const comando = testoDelComando(testo)
    const diFa = !riga.isCompactSummary && (riga.origin?.kind === undefined || riga.origin.kind === "human") && !MARCATORI_INTERNI.test(testo.trimStart()) && !eAvvio(testo)
    const parti: Parte[] = comando !== null ? [{ tipo: "testo", testo: comando }] : diFa ? daTestoDelCreator(testo, archivio) : []
    if (parti.length === 0) continue
    claude = null
    messaggi.push({ id: riga.uuid, ruolo: "utente", quando, parti })
  }
  return messaggi
}
