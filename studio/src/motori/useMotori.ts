// Le funzioni pesanti del profilo (`motori`) e il gesto che ne cambia una: lo usano «Computer» e la dettatura in «Generale», che accende e spegne la stessa cosa.
import { useState } from "react"
import { useCopia } from "../dati"
import type { FunzioneMotore, NomeMotore, Motori as MotoriDelProfilo } from "../tipi"
import { motori, scriviMotori } from "./copia"

export function useMotori() {
  const { dato, errore } = useCopia(motori)
  const [occupato, setOccupato] = useState(false)
  const [rifiuto, setRifiuto] = useState<string | null>(null)

  const cambia = (nome: NomeMotore, nuova: FunzioneMotore) => {
    if (!dato) return
    const nuovi: MotoriDelProfilo = { ...dato, [nome]: nuova }
    setOccupato(true)
    setRifiuto(null)
    scriviMotori(nuovi)
      .then(() => motori.rileggi())
      .catch((e: Error) => setRifiuto(e.message))
      .finally(() => setOccupato(false))
  }

  return { dato, errore, occupato, rifiuto, cambia }
}
