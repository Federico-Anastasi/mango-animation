// Dove sta la testa nelle riprese messe in sagoma: il motore la misura una volta per ripresa e la scrive in `lavoro/teste.json`;
// da lì l'anteprima ricava la scala e il posto della sagoma, uguali a quelli del montato.
import { useEffect, useMemo, useState } from "react"
import { urlVersionato } from "../api"
import type { Sorgente } from "../tipi"
import type { MisuraTesta } from "./composizione"

const comeOggetto = (valore: unknown): Record<string, unknown> | null => (typeof valore === "object" && valore !== null ? (valore as Record<string, unknown>) : null)

function mediana(valori: number[]): number {
  const ordinati = [...valori].sort((a, b) => a - b)
  const meta = ordinati.length >> 1
  return ordinati.length % 2 === 1 ? ordinati[meta]! : (ordinati[meta - 1]! + ordinati[meta]!) / 2
}

/** Le misure della testa per nome di sorgente del piano; una ripresa senza misure non compare. */
export function misureDelleTeste(letto: unknown, sorgenti: Record<string, Sorgente>): Record<string, MisuraTesta> {
  const perFile = comeOggetto(letto)
  if (!perFile) return {}
  const misure: Record<string, MisuraTesta> = {}
  for (const [nome, sorgente] of Object.entries(sorgenti)) {
    const visto = comeOggetto(perFile[sorgente.file])
    const centri = visto?.centri
    if (typeof visto?.cima !== "number" || !Array.isArray(centri)) continue
    const numeri = centri.filter((c): c is number => typeof c === "number")
    if (numeri.length > 0) misure[nome] = { cima: visto.cima, centro: mediana(numeri) }
  }
  return misure
}

/** Le misure della testa di un video montato; si rileggono quando cambia `versione` (il montaggio le riscrive). Senza il file, nessuna misura. */
export function useTeste(slug: string, versione: string, sorgenti: Record<string, Sorgente>, serve: boolean): Record<string, MisuraTesta> {
  const [letto, setLetto] = useState<unknown>(null)
  useEffect(() => {
    if (!serve) return
    let vivo = true
    fetch(urlVersionato(`video/${slug}/lavoro/teste.json`, versione))
      .then((r) => (r.ok ? (r.json() as Promise<unknown>) : null))
      .catch(() => null)
      .then((dati) => vivo && setLetto(dati))
    return () => {
      vivo = false
    }
  }, [slug, versione, serve])
  return useMemo(() => misureDelleTeste(letto, sorgenti), [letto, sorgenti])
}
