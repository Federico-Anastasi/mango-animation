// Le parole e l'onda della voce dei file usati dal montaggio: si leggono una volta per file, quando il file è
// stato preparato, e servono ad agganciare i bordi alle parole e a disegnare l'onda nei tratti.
import { useEffect, useState } from "react"
import { api, leggiOnda } from "../api"
import type { ParolaGrezzo } from "../tipi"
import type { InfoSorgente } from "./sorgenti"

const parole = new Map<string, ParolaGrezzo[]>()
const onde = new Map<string, Uint8Array>()

export interface SorgentiPreparate {
  parole: (file: string) => ParolaGrezzo[] | null
  onda: (file: string) => Uint8Array | null
}

export function useSorgentiPreparate(sorgenti: InfoSorgente[]): SorgentiPreparate {
  const [, giro] = useState(0)
  const chiave = sorgenti.map((s) => `${s.file}|${s.parole}|${s.onda}`).join(",")

  useEffect(() => {
    let vivo = true
    const finito = () => vivo && giro((n) => n + 1)
    for (const s of sorgenti) {
      // Un file preparato di nuovo (parole tolte e rifatte) non deve restare con le parole e l'onda di prima.
      if (!s.parole) parole.delete(s.file)
      if (s.onda === null) onde.delete(s.file)
      if (s.parole && !parole.has(s.file)) {
        api.paroleGrezzo(s.file).then(
          (p) => {
            parole.set(s.file, p)
            finito()
          },
          () => undefined,
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
  }, [chiave])

  return {
    parole: (file) => parole.get(file) ?? null,
    onda: (file) => onde.get(file) ?? null,
  }
}
