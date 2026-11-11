// Dal piano che il gesto ha calcolato ai ritocchi da mandare con `PATCH` (`docs/API.md`): solo ciò che il gesto ha cambiato, ognuno preceduto da un `test` del
// valore di prima; chi aggiunge un campo a un oggetto prova l'oggetto intero, e chi tocca una scena ne prova il nome (gli indici di un altro che aggiunge o toglie scene
// non portano il ritocco su un'altra). Il server li applica al piano che c'è nel file in quel momento: le modifiche di un altro in altri punti restano, e se qualcuno
// ha cambiato proprio quel punto un `test` non torna e il server risponde 409, invece di scrivere sopra.
import { uguali } from "./uguali"

export type Ritocco = { op: "test" | "replace" | "add"; path: string; value: unknown } | { op: "remove"; path: string }

const punto = (percorso: string, chiave: string | number): string => `${percorso}/${String(chiave).replaceAll("~", "~0").replaceAll("/", "~1")}`

const eContenitore = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null

/** Quanti elementi in testa (poi in coda, senza toccare quelli già contati) hanno le due liste uguali. */
function estremi(prima: unknown[], dopo: unknown[]): { testa: number; coda: number } {
  const minimo = Math.min(prima.length, dopo.length)
  let testa = 0
  while (testa < minimo && uguali(prima[testa], dopo[testa])) testa++
  let coda = 0
  while (coda < minimo - testa && uguali(prima[prima.length - 1 - coda], dopo[dopo.length - 1 - coda])) coda++
  return { testa, coda }
}

function listaCambiata(prima: unknown[], dopo: unknown[], percorso: string): Ritocco[] {
  if (prima.length === dopo.length) return prima.flatMap((v, i) => tra(v, dopo[i], punto(percorso, i)))
  const { testa, coda } = estremi(prima, dopo)
  const tolti = prima.slice(testa, prima.length - coda)
  const messi = dopo.slice(testa, dopo.length - coda)
  const ritocchi: Ritocco[] = tolti.flatMap((v): Ritocco[] => [
    { op: "test", path: punto(percorso, testa), value: v },
    { op: "remove", path: punto(percorso, testa) },
  ])
  // Solo inserimenti: l'indice da solo non dice dove, se un altro ha cambiato la lista; il vicino lo dice.
  if (tolti.length === 0 && prima.length > 0) {
    const vicino = testa < prima.length ? testa : testa - 1
    ritocchi.push({ op: "test", path: punto(percorso, vicino), value: prima[vicino] })
  }
  return [...ritocchi, ...messi.map((v, i): Ritocco => ({ op: "add", path: punto(percorso, testa + i), value: v }))]
}

function tra(prima: unknown, dopo: unknown, percorso: string): Ritocco[] {
  if (uguali(prima, dopo)) return []
  if (Array.isArray(prima) && Array.isArray(dopo)) return listaCambiata(prima, dopo, percorso)
  if (eContenitore(prima) && eContenitore(dopo) && !Array.isArray(prima) && !Array.isArray(dopo)) {
    const chiavi = [...new Set([...Object.keys(prima), ...Object.keys(dopo)])]
    const ritocchi = chiavi.flatMap((k): Ritocco[] => {
      if (!(k in dopo)) return [{ op: "test", path: punto(percorso, k), value: prima[k] }, { op: "remove", path: punto(percorso, k) }]
      if (!(k in prima)) return [{ op: "add", path: punto(percorso, k), value: dopo[k] }]
      return tra(prima[k], dopo[k], punto(percorso, k))
    })
    // Un campo nuovo non ha un valore di prima da provare: si prova l'oggetto che lo riceve (non la radice, dove i campi non cambiano di posto).
    const campoNuovo = chiavi.some((k) => !(k in prima))
    return campoNuovo && percorso !== "" ? [{ op: "test", path: percorso, value: prima }, ...ritocchi] : ritocchi
  }
  return [{ op: "test", path: percorso, value: prima }, { op: "replace", path: percorso, value: dopo }]
}

/** I ritocchi che portano il piano `prima` al piano `dopo`; nessuno se sono uguali. */
export function ritocchiTra(prima: unknown, dopo: unknown): Ritocco[] {
  const scene = eContenitore(prima) && Array.isArray(prima["scene"]) ? (prima["scene"] as unknown[]) : []
  const provate = new Set<string>()
  return tra(prima, dopo, "").flatMap((ritocco): Ritocco[] => {
    const dentro = /^\/scene\/(\d+)\//.exec(ritocco.path)
    const scena = dentro?.[1]
    if (scena === undefined || provate.has(scena)) return [ritocco]
    provate.add(scena)
    const nome = (scene[Number(scena)] as { nome?: unknown } | undefined)?.nome
    return typeof nome === "string" ? [{ op: "test", path: `/scene/${scena}/nome`, value: nome }, ritocco] : [ritocco]
  })
}
