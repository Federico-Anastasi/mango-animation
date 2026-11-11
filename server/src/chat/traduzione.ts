// Dai blocchi dell'API di Claude alle Parti della chat: le stesse regole per la conversazione in diretta e per quella letta dal suo file.
import { eOggetto } from "../disco"
import type { Lingua } from "../lingua"
import type { ImmagineDelloStrumento, Parte } from "./tipi"

export type Oggetto = Record<string, unknown>

const LIMITE_ESITO = 20_000

/** L'esito di uno strumento può essere enorme (l'uscita di un comando): la chat ne tiene l'inizio e dice quanto manca. */
function limita(testo: string, lingua: Lingua): string {
  if (testo.length <= LIMITE_ESITO) return testo
  const manca = testo.length - LIMITE_ESITO
  return `${testo.slice(0, LIMITE_ESITO)}\n… ${lingua === "en" ? `(${manca} more characters not shown)` : `(altri ${manca} caratteri non mostrati)`}`
}

const blocchiDi = (contenuto: unknown): Oggetto[] => (Array.isArray(contenuto) ? contenuto.filter(eOggetto) : [])

/** Il testo di un risultato: una stringa, oppure i blocchi di testo uno dopo l'altro. */
export function testoDelRisultato(contenuto: unknown, lingua: Lingua): string {
  if (typeof contenuto === "string") return limita(contenuto, lingua)
  return limita(
    blocchiDi(contenuto)
      .flatMap((b) => (b["type"] === "text" && typeof b["text"] === "string" ? [b["text"]] : []))
      .join("\n"),
    lingua,
  )
}

/** Le immagini di un risultato (le foto e le slide degli strumenti «video»). */
export function immaginiDelRisultato(contenuto: unknown): ImmagineDelloStrumento[] {
  return blocchiDi(contenuto).flatMap((b) => {
    const sorgente = b["source"]
    if (b["type"] !== "image" || !eOggetto(sorgente) || sorgente["type"] !== "base64") return []
    const { media_type, data } = sorgente
    return typeof media_type === "string" && typeof data === "string" ? [{ media_type, data }] : []
  })
}

/** La Parte `strumento` di un blocco `tool_use`; `quando` è l'istante in cui lo strumento è partito. */
export function parteStrumento(blocco: Oggetto, quando?: string): Parte | null {
  const { id, name, input } = blocco
  return typeof id === "string" && typeof name === "string" ? { tipo: "strumento", id, nome: name, ingresso: input ?? {}, ...(quando === undefined ? {} : { iniziato: quando }) } : null
}

/** Mette l'esito di un blocco `tool_result` sulla Parte dello strumento a cui risponde; `quando` è l'istante in cui è tornato. */
export function conEsito(parte: Extract<Parte, { tipo: "strumento" }>, risultato: Oggetto, lingua: Lingua, quando?: string): Parte {
  const testo = testoDelRisultato(risultato["content"], lingua)
  const immagini = immaginiDelRisultato(risultato["content"])
  return {
    tipo: "strumento",
    id: parte.id,
    nome: parte.nome,
    ingresso: parte.ingresso,
    ...(risultato["is_error"] === true ? { errore: testo || (lingua === "en" ? "The tool gave an error without saying more." : "Lo strumento ha dato un errore senza dire altro.") } : { esito: testo }),
    ...(immagini.length > 0 ? { immagini } : {}),
    ...(parte.iniziato === undefined ? {} : { iniziato: parte.iniziato }),
    ...(quando === undefined ? {} : { finito: quando }),
  }
}

/** Le Parti dei blocchi di un messaggio di Claude già completo (testo, ragionamento, strumenti, che partono a `quando`). */
export function partiDeiBlocchi(contenuto: unknown, quando?: string): Parte[] {
  return blocchiDi(contenuto).flatMap((b): Parte[] => {
    if (b["type"] === "text" && typeof b["text"] === "string" && b["text"] !== "") return [{ tipo: "testo", testo: b["text"] }]
    if (b["type"] === "thinking" && typeof b["thinking"] === "string" && b["thinking"] !== "") return [{ tipo: "pensiero", testo: b["thinking"] }]
    if (b["type"] === "tool_use") {
      const parte = parteStrumento(b, quando)
      return parte ? [parte] : []
    }
    return []
  })
}

export const risultatiDegliStrumenti = (contenuto: unknown): Oggetto[] => blocchiDi(contenuto).filter((b) => b["type"] === "tool_result" && typeof b["tool_use_id"] === "string")

const numero = (valore: unknown): number => (typeof valore === "number" && Number.isFinite(valore) ? valore : 0)

/**
 * Quanto contesto occupa la conversazione dopo una risposta, dal suo `usage` (API di Claude): ciò che il modello ha letto, anche dalla
 * cache, più ciò che ha scritto. `null` se il conto non dice cosa ha letto (il `message_delta` con i soli token scritti).
 */
export function contestoDaUsage(usage: unknown): number | null {
  if (!eOggetto(usage)) return null
  const letti = numero(usage["input_tokens"]) + numero(usage["cache_read_input_tokens"]) + numero(usage["cache_creation_input_tokens"])
  return letti > 0 ? letti + numero(usage["output_tokens"]) : null
}

const USCITA_LOCALE = /^\s*<local-command-(stdout|stderr)>([\s\S]*?)<\/local-command-\1>\s*$/

/** Il testo che un comando locale (`/context`, `/compact`…) ha scritto, senza i tag; `null` se il testo non è l'uscita di un comando. */
export function uscitaLocale(testo: string): string | null {
  const trovata = USCITA_LOCALE.exec(testo)
  return trovata ? (trovata[2] ?? "").trim() : null
}

/** Una riga sola, accorciata: il titolo di una conversazione. */
export function abbrevia(testo: string, lunghezza = 60): string {
  const pulito = testo.replace(/\s+/g, " ").trim()
  return pulito.length <= lunghezza ? pulito : `${pulito.slice(0, lunghezza - 1).trimEnd()}…`
}
