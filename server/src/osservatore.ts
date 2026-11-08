import { watch } from "node:fs"

export interface OpzioniOsservatore {
  ricorsivo: boolean
  rimbalzoMs: number
  /** Percorsi che vengono scritti a lungo (un video che si monta): si consegnano una volta sola, quando per `quietoMs` non cambiano più. */
  lenti?: { quietoMs: number; riconosci: (relativo: string) => boolean }
  /** Percorsi relativi alla cartella osservata, con `/`. */
  ignora: (relativo: string) => boolean
  alCambio: (relativi: string[]) => Promise<void>
}

/**
 * Raccoglie i cambi per una finestra di `rimbalzoMs` dal primo e li consegna insieme: scrivere un file
 * produce più notifiche, e un lavoro che scrive di continuo non deve rimandare la consegna all'infinito.
 * I percorsi «lenti» fanno l'opposto, apposta: il timer riparte a ogni notifica e la consegna arriva
 * quando il file ha smesso di crescere, non una volta ogni finestra. Sono i timer ammessi nel server,
 * oltre al battito.
 */
export function osserva(cartella: string, opzioni: OpzioniOsservatore): { chiudi: () => void } {
  const raccolti = new Set<string>()
  const lentiRaccolti = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | null = null
  let timerLento: ReturnType<typeof setTimeout> | null = null
  let corrente: Promise<void> = Promise.resolve()

  const consegna = (insieme: Set<string>): void => {
    const lotto = [...insieme]
    insieme.clear()
    corrente = corrente.then(() => opzioni.alCambio(lotto)).catch((errore) => console.error(`osservatore di ${cartella}: ${errore instanceof Error ? (errore.stack ?? errore.message) : String(errore)}`))
  }

  const osservatore = watch(cartella, { recursive: opzioni.ricorsivo }, (_tipo, nome) => {
    if (!nome) return
    const relativo = nome.replaceAll("\\", "/")
    if (opzioni.ignora(relativo)) return
    if (opzioni.lenti?.riconosci(relativo)) {
      lentiRaccolti.add(relativo)
      if (timerLento) clearTimeout(timerLento)
      timerLento = setTimeout(() => {
        timerLento = null
        consegna(lentiRaccolti)
      }, opzioni.lenti.quietoMs)
      return
    }
    raccolti.add(relativo)
    timer ??= setTimeout(() => {
      timer = null
      consegna(raccolti)
    }, opzioni.rimbalzoMs)
  })
  osservatore.on("error", (errore) => console.error(`osservatore di ${cartella}: ${errore.message}`))

  return {
    chiudi: () => {
      if (timer) clearTimeout(timer)
      if (timerLento) clearTimeout(timerLento)
      osservatore.close()
    },
  }
}

const TEMPORANEO = /\.tmp-[^/]*$|\.tmp$|\.parziale$|~$/

/**
 * Ciò che dentro `archivio/` non è un dato: i pezzi in scrittura, i registri che il server tiene da sé e,
 * dentro `lavoro/`, tutto tranne `risolto.json` e `controllo.json` (tratti, scene e foto sono file che il
 * motore scrive a raffica e che nessuna rotta mostra: annunciarli sarebbe solo rumore).
 */
export function ignoraNellArchivio(relativo: string): boolean {
  if (TEMPORANEO.test(relativo) || /(^|\/)\.in-corso(\/|$)/.test(relativo) || relativo === "lavori.jsonl" || relativo === "arrivi" || relativo.startsWith("arrivi/")) return true
  const nelLavoro = /^video\/[^/]+\/lavoro\/(.+)$/.exec(relativo)?.[1]
  return nelLavoro !== undefined && nelLavoro !== "risolto.json" && nelLavoro !== "controllo.json"
}

export const eUscita = (relativo: string): boolean => /^video\/[^/]+\/uscite(\/|$)/.test(relativo)
