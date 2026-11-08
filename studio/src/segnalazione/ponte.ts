// Il ponte che l'app Mango Animation mette nella pagina (`window.__MANGO_ANIMATION__.segnalazione`, `app/src/segnalazione/`).
// Nel browser non c'è, e «Segnala un problema» non compare.
import { t } from "../lingua"

export interface EsitoSegnalazione {
  /** Partita verso chi sistema il problema. Altrimenti il testo è nel file `file` e la pagina di GitHub è aperta. */
  inviata: boolean
  file?: string
}

export interface PonteSegnalazione {
  /** Vero se questa costruzione manda le segnalazioni a chi le sistema: solo allora la schermata della finestra si prende. */
  invioAttivo: () => Promise<boolean>
  /** Manda la segnalazione, anonimizzata dall'app; rifiuta con la frase di cosa non è andato. */
  invia: (segnalazione: { errore?: string; nota?: string; schermata: boolean }) => Promise<EsitoSegnalazione>
}

export const ponteSegnalazione = (): PonteSegnalazione | null => window.__MANGO_ANIMATION__?.segnalazione ?? null

/** La frase di un rifiuto del ponte: l'app rifiuta con un testo, un errore o `{ message }`. */
export function fraseDelRifiuto(e: unknown): string {
  const m = typeof e === "object" && e !== null ? (e as { message?: unknown }).message : e
  return typeof m === "string" && m !== "" ? m : t("La segnalazione non è partita.", "The report could not be sent.")
}

/** Dopo che la pagina si è ridisegnata: la schermata della finestra si riprende da qui. */
export const dopoIlDisegno = (): Promise<void> => new Promise((fatto) => requestAnimationFrame(() => requestAnimationFrame(() => fatto())))
