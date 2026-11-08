// Il microfono e la webcam con cui si registra: la scelta si ricorda nel browser, e vale finché il dispositivo c'è.
export type TipoDispositivo = "microfono" | "camera"

const CHIAVI: Record<TipoDispositivo, string> = { microfono: "mango-animation.registra.microfono", camera: "mango-animation.registra.camera" }

// Una camera virtuale (quella di OBS) non è il viso di nessuno, se non è lei che si sceglie.
const eVirtuale = (nome: string): boolean => /virtual/i.test(nome)

export function ricordato(tipo: TipoDispositivo): string | null {
  try {
    return localStorage.getItem(CHIAVI[tipo])
  } catch {
    return null
  }
}

export function ricorda(tipo: TipoDispositivo, nome: string): void {
  try {
    localStorage.setItem(CHIAVI[tipo], nome)
  } catch {
    // Senza memoria nel browser la scelta vale per questa apertura e basta.
  }
}

/** Il dispositivo da usare: quello scelto adesso, o quello ricordato, se fra i trovati; altrimenti il primo (per la webcam, il primo non virtuale). `null` se non c'è. */
export function dispositivoDaUsare(tipo: TipoDispositivo, trovati: readonly string[], sceltoOra: string | null): string | null {
  for (const nome of [sceltoOra, ricordato(tipo)]) if (nome !== null && trovati.includes(nome)) return nome
  return (tipo === "camera" ? trovati.find((n) => !eVirtuale(n)) : trovati[0]) ?? null
}
