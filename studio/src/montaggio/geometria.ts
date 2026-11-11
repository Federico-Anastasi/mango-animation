// La geometria della timeline: scala, righello, aggancio dei bordi alle parole del motore, destinazione di un pezzo
// trascinato. Funzioni pure.
import type { ParolaGrezzo, Risolto } from "../tipi"

export const MIN_PX_AL_SECONDO = 4
export const MAX_PX_AL_SECONDO = 600
/** Un bordo trascinato si aggancia a una parola se ci arriva più vicino di così. */
const AGGANCIO_S = 0.15
/** Una parola del risolto e la sua grezza sono la stessa se cominciano a meno di così (l'allineamento sposta i confini di qualche decimo). */
const DISTANZA_MASSIMA_S = 1
const PASSI_RIGHELLO = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300]

/** Il passo delle tacche del righello: la più rada che resta a una distanza leggibile. */
export function passoRighello(pxAlSecondo: number): number {
  return PASSI_RIGHELLO.find((p) => p * pxAlSecondo >= 70) ?? 600
}

/** Quanti pixel per secondo fanno stare tutto il video nella larghezza visibile. */
export function pxPerAdattare(durata: number, larghezzaVista: number): number {
  if (durata <= 0 || larghezzaVista <= 0) return 20
  return Math.max(MIN_PX_AL_SECONDO, (larghezzaVista - 8) / durata)
}

/** Il bordo agganciato alla parola più vicina: l'inizio di una parola per un bordo d'ingresso, la fine per
 * uno d'uscita. Senza parole nel raggio, il secondo com'è. */
export function aggancia(secondo: number, parole: readonly ParolaGrezzo[] | null, lato: "inizio" | "fine"): number {
  if (!parole) return secondo
  let migliore = secondo
  let distanza = AGGANCIO_S
  for (const p of parole) {
    const bordo = lato === "inizio" ? p.da : p.a
    const d = Math.abs(bordo - secondo)
    if (d < distanza) {
      distanza = d
      migliore = bordo
    }
  }
  return migliore
}

/** Le parole di una sorgente come le conta il motore, in secondi della sorgente: quelle grezze di `parole.json` più lo sfasamento del piano, e dove il risolto ha la stessa
 * parola (per un pezzo a parole, con i confini allineati sull'audio) i suoi tempi. Il bordo di un pezzo a tempo si aggancia a queste, non ai tempi grezzi della trascrizione,
 * che possono stare mezzo secondo fuori. */
export function paroleDelMotore(grezze: readonly ParolaGrezzo[] | null, sfasamento: number, risolto: Risolto, sorgente: string): ParolaGrezzo[] | null {
  if (!grezze) return null
  const parole = grezze.map((w) => ({ p: w.p, da: w.da + sfasamento, a: w.a + sfasamento }))
  const perTesto = new Map<string, ParolaGrezzo[]>()
  for (const w of parole) perTesto.set(w.p, [...(perTesto.get(w.p) ?? []), w])
  for (const w of risolto.parole) {
    if (risolto.tratti[w.tratto]?.sorgente !== sorgente) continue
    const vicina = (perTesto.get(w.p) ?? []).reduce<ParolaGrezzo | undefined>((meglio, c) => (!meglio || Math.abs(c.da - w.nella_sorgente) < Math.abs(meglio.da - w.nella_sorgente) ? c : meglio), undefined)
    if (vicina && Math.abs(vicina.da - w.nella_sorgente) < DISTANZA_MASSIMA_S) Object.assign(vicina, { da: w.nella_sorgente, a: w.nella_sorgente + (w.a - w.da) })
  }
  return parole
}

export interface GruppoPezzo {
  scena: number
  pezzo: number
  tratti: number[]
  da: number
  a: number
}

/** I pezzi come blocchi sulla timeline: i loro tratti e dove cominciano e finiscono nel video. */
export function gruppiDiPezzi(risolto: Risolto): GruppoPezzo[] {
  const gruppi = new Map<string, GruppoPezzo>()
  risolto.tratti.forEach((t, i) => {
    const chiave = `${t.scena}/${t.pezzo}`
    const g = gruppi.get(chiave) ?? { scena: t.scena, pezzo: t.pezzo, tratti: [], da: t.esce, a: t.esce + t.durata }
    g.tratti.push(i)
    g.da = Math.min(g.da, t.esce)
    g.a = Math.max(g.a, t.esce + t.durata)
    gruppi.set(chiave, g)
  })
  return [...gruppi.values()]
}

/** La scena sotto il secondo `centro`: prima dell'inizio la prima, dopo la fine l'ultima. */
export function scenaA(scene: Risolto["scene"], centro: number): number {
  const trovata = scene.findIndex((s) => centro >= s.inizio && centro < s.inizio + s.durata)
  return trovata >= 0 ? trovata : centro < 0 ? 0 : Math.max(scene.length - 1, 0)
}

/** Dove va un pezzo lasciato in un'altra scena con il centro a `centro` secondi: dopo i pezzi di quella scena che hanno il centro prima. */
export function posizioneInAltraScena(gruppi: readonly GruppoPezzo[], scena: number, centro: number): number {
  return gruppi.filter((g) => g.scena === scena && (g.da + g.a) / 2 < centro).length
}

/** Dove va un pezzo trascinato con il centro a `centro` secondi: la posizione fra i pezzi della sua scena. */
export function posizioneDopoTrascinamento(gruppi: readonly GruppoPezzo[], scena: number, pezzo: number, centro: number): number {
  const altri = gruppi.filter((g) => g.scena === scena && g.pezzo !== pezzo)
  return altri.filter((g) => (g.da + g.a) / 2 < centro).length
}
