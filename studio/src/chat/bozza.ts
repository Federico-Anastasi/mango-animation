// Ciò che il creator ha scritto nella chat e non ha mandato: resta se chiude la chat e la riapre, e nella stessa scheda del browser
// anche se ricarica.
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

export function ricordaBozza(testo: string): void {
  inMemoria = testo
  try {
    sessionStorage.setItem(CHIAVE_BOZZA, testo)
  } catch {
    // Senza memoria nel browser la bozza vale finché la pagina resta aperta.
  }
}
