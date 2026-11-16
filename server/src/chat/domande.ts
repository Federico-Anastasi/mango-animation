// Le domande che uno strumento del server fa al creator (`POST /api/chat/:id/domande`), lette dal corpo della richiesta.
import { eOggetto } from "../disco"
import { frase } from "../lingua"
import type { Oggetto } from "./traduzione"
import { ErroreChat, type DomandaChat } from "./tipi"

const MASSIMO_DOMANDE = 4

const eTesto = (valore: unknown): valore is string => typeof valore === "string" && valore.trim() !== ""

function opzioneDa(valore: unknown): { etichetta: string; descrizione: string } | null {
  if (!eOggetto(valore) || !eTesto(valore["etichetta"])) return null
  const descrizione = valore["descrizione"]
  return descrizione === undefined || typeof descrizione === "string" ? { etichetta: valore["etichetta"], descrizione: descrizione ?? "" } : null
}

function domandaDa(valore: unknown): DomandaChat | null {
  if (!eOggetto(valore) || !eTesto(valore["domanda"]) || !Array.isArray(valore["opzioni"])) return null
  const { intestazione, multipla } = valore
  if ((intestazione !== undefined && typeof intestazione !== "string") || (multipla !== undefined && typeof multipla !== "boolean")) return null
  const opzioni = valore["opzioni"].map(opzioneDa)
  if (!opzioni.every((o) => o !== null)) return null
  return { domanda: valore["domanda"], intestazione: intestazione ?? "", opzioni, multipla: multipla ?? false }
}

/** Da una a quattro domande, ciascuna con il suo testo, le sue opzioni (anche nessuna: si risponde a parole) e un testo diverso dalle altre. */
export function leggiLeDomande(corpo: Oggetto): DomandaChat[] {
  const estraneo = Object.keys(corpo).find((campo) => campo !== "domande")
  if (estraneo !== undefined) throw new ErroreChat(400, frase(`«${estraneo}» non è un campo della richiesta: c'è solo «domande».`, `«${estraneo}» is not a field of the request: the only field is «domande».`))
  const domande = corpo["domande"]
  if (!Array.isArray(domande) || domande.length === 0 || domande.length > MASSIMO_DOMANDE) {
    throw new ErroreChat(400, frase(`Le «domande» sono da 1 a ${MASSIMO_DOMANDE}, in una lista.`, `The «domande» are 1 to ${MASSIMO_DOMANDE}, in a list.`))
  }
  const lette = domande.map(domandaDa)
  const storta = lette.indexOf(null)
  if (storta >= 0) {
    throw new ErroreChat(
      400,
      frase(
        `La domanda ${storta + 1} non è scritta bene: servono «domanda» (un testo) e «opzioni» (una lista di { etichetta, descrizione }); «intestazione» è un testo e «multipla» vero o falso.`,
        `Question ${storta + 1} is not well formed: it needs «domanda» (text) and «opzioni» (a list of { etichetta, descrizione }); «intestazione» is text and «multipla» true or false.`,
      ),
    )
  }
  const ammesse = lette.filter((d) => d !== null)
  if (new Set(ammesse.map((d) => d.domanda)).size !== ammesse.length) {
    throw new ErroreChat(400, frase("Due domande hanno lo stesso testo: ogni «domanda» dev'essere diversa, perché la risposta si cerca per testo.", "Two questions have the same text: each «domanda» must be different, because the answer is found by text."))
  }
  return ammesse
}
