// I blocchi dell'API di Claude, come li danno l'Agent SDK e i file delle conversazioni di Claude Code, letti nelle forme del prodotto.
import { eOggetto } from "../../disco"
import type { EsitoDelloStrumento } from "../motore"
import type { ImmagineDelloStrumento, Parte } from "../tipi"
import type { Oggetto } from "../traduzione"

export const blocchiDi = (contenuto: unknown): Oggetto[] => (Array.isArray(contenuto) ? contenuto.filter(eOggetto) : [])

/** Il testo di un risultato: una stringa, oppure i blocchi di testo uno dopo l'altro. */
function testoDelRisultato(contenuto: unknown): string {
  if (typeof contenuto === "string") return contenuto
  return blocchiDi(contenuto)
    .flatMap((b) => (b["type"] === "text" && typeof b["text"] === "string" ? [b["text"]] : []))
    .join("\n")
}

/** Le immagini di un risultato (le foto e le slide degli strumenti «video»). */
function immaginiDelRisultato(contenuto: unknown): ImmagineDelloStrumento[] {
  return blocchiDi(contenuto).flatMap((b) => {
    const sorgente = b["source"]
    if (b["type"] !== "image" || !eOggetto(sorgente) || sorgente["type"] !== "base64") return []
    const { media_type, data } = sorgente
    return typeof media_type === "string" && typeof data === "string" ? [{ media_type, data }] : []
  })
}

/** L'esito di un blocco `tool_result`. */
export const esitoDelRisultato = (risultato: Oggetto): EsitoDelloStrumento => ({
  testo: testoDelRisultato(risultato["content"]),
  errore: risultato["is_error"] === true,
  immagini: immaginiDelRisultato(risultato["content"]),
})

export const risultatiDegliStrumenti = (contenuto: unknown): Oggetto[] => blocchiDi(contenuto).filter((b) => b["type"] === "tool_result" && typeof b["tool_use_id"] === "string")

/** La Parte `strumento` di un blocco `tool_use`; `quando` è l'istante in cui lo strumento è partito. */
function parteStrumento(blocco: Oggetto, quando?: string): Parte | null {
  const { id, name, input } = blocco
  return typeof id === "string" && typeof name === "string" ? { tipo: "strumento", id, nome: name, ingresso: input ?? {}, ...(quando === undefined ? {} : { iniziato: quando }) } : null
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

const numero = (valore: unknown): number => (typeof valore === "number" && Number.isFinite(valore) ? valore : 0)

/**
 * Quanto contesto occupa la conversazione dopo una risposta, dal suo `usage`: ciò che il modello ha letto, anche dalla cache, più ciò
 * che ha scritto. `null` se il conto non dice cosa ha letto (il `message_delta` con i soli token scritti).
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
