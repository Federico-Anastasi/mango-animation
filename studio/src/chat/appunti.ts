// Il ponte che l'app Mango Animation mette nella pagina (`window.__MANGO_ANIMATION__.appunti`, `app/src/appunti.rs`).
import { t } from "../lingua"

// Nel browser non c'è: vale ciò che il browser dà nell'incolla.

export interface PonteAppunti {
  /** I percorsi dei file copiati in Esplora risorse; vuoto se negli appunti non ci sono file. */
  percorsi: () => Promise<string[]>
}

export const ponteAppunti = (): PonteAppunti | null => window.__MANGO_ANIMATION__?.appunti ?? null

/** La frase di un rifiuto del ponte: l'app rifiuta con un testo, un errore o `{ message }`. */
export function fraseDelRifiuto(e: unknown): string {
  const m = typeof e === "object" && e !== null ? (e as { message?: unknown }).message : e
  return typeof m === "string" && m !== "" ? m : t("Non riesco a leggere gli appunti.", "I cannot read the clipboard.")
}
