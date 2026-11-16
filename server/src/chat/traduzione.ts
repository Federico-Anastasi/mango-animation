// Le regole comuni a ogni motore per le Parti della chat: le stesse per la conversazione in diretta e per quella riletta.
import type { Lingua } from "../lingua"
import type { EsitoDelloStrumento } from "./motore"
import type { Parte } from "./tipi"

export type Oggetto = Record<string, unknown>

const LIMITE_ESITO = 20_000

/** L'esito di uno strumento può essere enorme (l'uscita di un comando): la chat ne tiene l'inizio e dice quanto manca. */
function limita(testo: string, lingua: Lingua): string {
  if (testo.length <= LIMITE_ESITO) return testo
  const manca = testo.length - LIMITE_ESITO
  return `${testo.slice(0, LIMITE_ESITO)}\n… ${lingua === "en" ? `(${manca} more characters not shown)` : `(altri ${manca} caratteri non mostrati)`}`
}

/** Mette l'esito sulla Parte dello strumento a cui risponde; `quando` è l'istante in cui è tornato. */
export function conEsito(parte: Extract<Parte, { tipo: "strumento" }>, esito: EsitoDelloStrumento, lingua: Lingua, quando?: string): Parte {
  const testo = limita(esito.testo, lingua)
  return {
    tipo: "strumento",
    id: parte.id,
    nome: parte.nome,
    ingresso: parte.ingresso,
    ...(esito.errore ? { errore: testo || (lingua === "en" ? "The tool gave an error without saying more." : "Lo strumento ha dato un errore senza dire altro.") } : { esito: testo }),
    ...(esito.immagini.length > 0 ? { immagini: esito.immagini } : {}),
    ...(parte.iniziato === undefined ? {} : { iniziato: parte.iniziato }),
    ...(quando === undefined ? {} : { finito: quando }),
  }
}

/** Ciò che un errore dice di sé, per il registro e per il dettaglio di una frase. */
export const fraseDi = (errore: unknown): string => (errore instanceof Error ? errore.message : String(errore))

/** Una riga sola, accorciata: il titolo di una conversazione. */
export function abbrevia(testo: string, lunghezza = 60): string {
  const pulito = testo.replace(/\s+/g, " ").trim()
  return pulito.length <= lunghezza ? pulito : `${pulito.slice(0, lunghezza - 1).trimEnd()}…`
}
