// I passi dell'agente raccolti in una riga: gli strumenti di fila, già finiti e andati a buon fine, si chiudono in un gruppo «Ha lavorato · N passi».
// Restano sempre in vista uno strumento in corso, uno fallito e quelli che mostrano qualcosa al creator (un lavoro, un'immagine, una domanda).
import { istante } from "../testo"
import type { Parte, ParteStrumento } from "./tipi"

type Pensiero = Extract<Parte, { tipo: "pensiero" }>

export type Voce = { tipo: "parte"; parte: Parte } | { tipo: "gruppo"; id: string; dentro: Array<ParteStrumento | Pensiero>; passi: ParteStrumento[] }

/** Strumenti che il creator deve vedere: una domanda a scelta, il piano proposto, la scheda del lavoro in coda. */
const SEMPRE_IN_VISTA = new Set(["AskUserQuestion", "ExitPlanMode", "mcp__video__lavoro"])

const raggruppabile = (p: Parte): p is ParteStrumento => p.tipo === "strumento" && p.esito !== undefined && !p.errore && !p.immagini?.length && !SEMPRE_IN_VISTA.has(p.nome)

/** Da quando è partito il primo passo a quando è finito l'ultimo, in secondi; `null` se i passi non hanno gli orari. */
export function durataDelGruppo(passi: ParteStrumento[]): number | null {
  const inizio = passi[0]?.iniziato
  const fine = passi.at(-1)?.finito
  const da = inizio === undefined ? null : istante(inizio)
  const a = fine === undefined ? null : istante(fine)
  return da === null || a === null ? null : Math.max(0, (a - da) / 1000)
}

/** Le parti di una risposta, con gli strumenti di fila (almeno due) raccolti in gruppi; un pensiero fra due strumenti va dentro al gruppo. */
export function raggruppaPassi(parti: Parte[]): Voce[] {
  const voci: Voce[] = []
  let corsa: Array<ParteStrumento | Pensiero> = []
  let pensieri: Pensiero[] = []

  const chiudi = () => {
    const passi = corsa.filter((p): p is ParteStrumento => p.tipo === "strumento")
    if (passi.length >= 2) voci.push({ tipo: "gruppo", id: passi[0]!.id, dentro: corsa, passi })
    else corsa.forEach((p) => voci.push({ tipo: "parte", parte: p }))
    pensieri.forEach((p) => voci.push({ tipo: "parte", parte: p }))
    corsa = []
    pensieri = []
  }

  for (const parte of parti) {
    if (raggruppabile(parte)) {
      corsa.push(...pensieri, parte)
      pensieri = []
    } else if (parte.tipo === "pensiero" && corsa.length > 0) {
      pensieri.push(parte)
    } else {
      chiudi()
      voci.push({ tipo: "parte", parte })
    }
  }
  chiudi()
  return voci
}
