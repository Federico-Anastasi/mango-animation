// Ciò che il creator ha scritto nella chat e non ha mandato: resta se chiude la chat e la riapre, e nella stessa scheda del browser
// anche se ricarica.
import { apriChat } from "./pannello"

const CHIAVE_BOZZA = "mango-animation.chat.bozza"

// La memoria della pagina vale anche dove il browser non ne dà una sua.
let inMemoria: string | null = null

export function leggiBozza(): string {
  if (inMemoria !== null) return inMemoria
  try {
    return sessionStorage.getItem(CHIAVE_BOZZA) ?? ""
  } catch {
    return ""
  }
}

const proposte = new Set<(testo: string) => void>()

/** Il campo della chat, quando c'è, ascolta le frasi che una pagina gli mette dentro (`proponiNellaChat`). */
export function ascoltaProposte(ascolta: (testo: string) => void): () => void {
  proposte.add(ascolta)
  return () => proposte.delete(ascolta)
}

/** Apre la chat e mette `frase` nel campo, senza mandarla: il creator la rilegge, la cambia e la manda. Se nel campo c'è già qualcosa la frase va dopo, a capo. */
export function proponiNellaChat(frase: string): void {
  const prima = leggiBozza()
  const testo = prima.trim() === "" ? frase : prima.includes(frase) ? prima : [prima.trimEnd(), frase].join("\n")
  ricordaBozza(testo)
  apriChat()
  proposte.forEach((ascolta) => ascolta(testo))
}

export function ricordaBozza(testo: string): void {
  inMemoria = testo
  try {
    sessionStorage.setItem(CHIAVE_BOZZA, testo)
  } catch {
    // Senza memoria nel browser la bozza vale finché la pagina resta aperta.
  }
}
