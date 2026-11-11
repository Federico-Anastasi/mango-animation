// Le parole e l'onda della voce dei file usati dal montaggio: si leggono una volta per file, quando il file è
// stato preparato, e servono ad agganciare i bordi alle parole e a disegnare l'onda nei tratti.
import { useEffect, useRef, useState } from "react"
import { api, leggiOnda } from "../api"
import type { ParolaGrezzo } from "../tipi"
import type { InfoSorgente } from "./sorgenti"

const parole = new Map<string, ParolaGrezzo[]>()
const onde = new Map<string, Uint8Array>()

export interface SorgentiPreparate {
  parole: (file: string) => ParolaGrezzo[] | null
  onda: (file: string) => Uint8Array | null
  /** I file di cui le parole non si sono scaricate. */
  fallite: string[]
  riprova: () => void
}

export function useSorgentiPreparate(sorgenti: InfoSorgente[]): SorgentiPreparate {
  const [, giro] = useState(0)
  const [tentativo, setTentativo] = useState(0)
  const [fallite, setFallite] = useState<string[]>([])
  const chiave = sorgenti.map((s) => `${s.file}|${s.parole}|${s.onda}`).join(",")
  // L'elenco cambia a ogni disegno, anche quando i file sono gli stessi: la lettura riparte solo quando cambia la chiave, e legge l'elenco di quel momento.
  const attuali = useRef(sorgenti)
  useEffect(() => {
    attuali.current = sorgenti
  })

  useEffect(() => {
    let vivo = true
    const finito = () => vivo && giro((n) => n + 1)
    setFallite([])
    for (const s of attuali.current) {
      // Un file preparato di nuovo (parole tolte e rifatte) non deve restare con le parole e l'onda di prima.
      if (!s.parole) parole.delete(s.file)
      if (s.onda === null) onde.delete(s.file)
      if (s.parole && !parole.has(s.file)) {
        api.paroleGrezzo(s.file).then(
          (p) => {
            parole.set(s.file, p)
            finito()
          },
          () => vivo && setFallite((prima) => [...prima, s.file]),
        )
      }
      if (s.onda !== null && !onde.has(s.file)) {
        void leggiOnda(s.onda).then((o) => {
          if (o) onde.set(s.file, o)
          finito()
        })
      }
    }
    return () => {
      vivo = false
    }
  }, [chiave, tentativo])

  return {
    parole: (file) => parole.get(file) ?? null,
    onda: (file) => onde.get(file) ?? null,
    fallite,
    riprova: () => setTentativo((n) => n + 1),
  }
}
