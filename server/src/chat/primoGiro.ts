// L'avvio del primo giro (`docs/CHAT.md`, «Il primo giro»): un'istruzione che arriva a Claude e non compare nella chat,
// così il creator vede la conversazione cominciare con il saluto di Claude.
import { frase, type Lingua } from "../lingua"
import { ErroreChat } from "./tipi"

export type Avvio = "primo-giro" | "rifare-primo-giro"

const MARCATORE = "[Start: first round]"

export const TITOLO_PRIMO_GIRO = frase("Il primo giro", "The first round")

/** Il testo è l'istruzione di avvio, non un messaggio del creator. */
export const eAvvio = (testo: string): boolean => testo.trimStart().startsWith(MARCATORE)

/** Controlla l'`avvio` di una richiesta: `undefined` se manca, e non va insieme a un messaggio. */
export function leggiAvvio(corpo: Record<string, unknown>): Avvio | undefined {
  const valore = corpo["avvio"]
  if (valore === undefined) return undefined
  if (valore !== "primo-giro" && valore !== "rifare-primo-giro") {
    throw new ErroreChat(400, frase("L'«avvio» è «primo-giro» o «rifare-primo-giro».", "The «avvio» is «primo-giro» or «rifare-primo-giro»."))
  }
  if (corpo["testo"] !== undefined || corpo["allegati"] !== undefined || corpo["contesto"] !== undefined) {
    throw new ErroreChat(400, frase("Un «avvio» non ha «testo», «allegati» né «contesto»: la conversazione comincia da Claude.", "A start («avvio») has no «testo», «allegati» or «contesto»: the conversation starts with Claude."))
  }
  return valore
}

/** Ciò che Claude legge al posto del primo messaggio: nella lingua dello studio, perché il profilo che dice la lingua del creator ancora non c'è. */
export function ingressoDiAvvio(avvio: Avvio, lingua: Lingua): string {
  const cosa =
    avvio === "primo-giro"
      ? "The creator has just opened the app for the first time and has no profile yet."
      : "The creator asks to redo the first round: start from what is already in the working folder."
  const parlata = lingua === "en" ? "English" : "Italian"
  return `${MARCATORE} ${cosa} Begin the first round now (skill \`welcome\`). The creator did not write this message and does not see it: what they see is your greeting, so open the conversation with it. The app is in ${parlata}: write in ${parlata} until the creator tells you the language they work in.`
}
