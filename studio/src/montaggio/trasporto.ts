// Il trasporto del montaggio: dov'è la testina, se sta suonando. Lo leggono in tanti (la testina
// della timeline, l'orologio, i testi sopra l'anteprima) e cambia sessanta volte al secondo:
// sta in un negozio fuori da React, e solo chi lo legge si ridisegna.
import { useEffect, useRef, useSyncExternalStore } from "react"

export interface Trasporto {
  /** Dov'è la testina, in secondi del video. */
  t(): number
  inRiproduzione(): boolean
  durata(): number
  /** Porta la testina a `t`: l'anteprima salta lì. */
  vai(t: number): void
  suona(): void
  ferma(): void
  alterna(): void
  /** Fotogrammi al secondo del video: quelli dello stile. */
  fps(): number
  /** Avanti o indietro di `fotogrammi`, da fermo. */
  passo(fotogrammi: number): void
  /** Solo per l'anteprima, mentre suona: dove è arrivata, senza chiedere un salto. */
  avanza(t: number): void
  /** Quante volte si è chiesto un salto: l'anteprima si riposiziona quando cambia. */
  salti(): number
  iscriviti(ascolta: () => void): () => void
  imposta(durata: number, fps: number): void
}

export function creaTrasporto(durataIniziale: number, fpsIniziali: number): Trasporto {
  let t = 0
  let suona = false
  let durata = durataIniziale
  let fps = fpsIniziali
  let salti = 0
  const ascoltatori = new Set<() => void>()
  const avvisa = () => ascoltatori.forEach((a) => a())
  const dentro = (valore: number) => Math.min(Math.max(valore, 0), durata)
  const trasporto: Trasporto = {
    t: () => t,
    inRiproduzione: () => suona,
    durata: () => durata,
    vai(valore) {
      t = dentro(valore)
      salti++
      avvisa()
    },
    suona() {
      if (durata <= 0) return
      if (t >= durata - 0.01) {
        t = 0
        salti++
      }
      suona = true
      avvisa()
    },
    ferma() {
      if (!suona) return
      suona = false
      avvisa()
    },
    alterna() {
      if (suona) trasporto.ferma()
      else trasporto.suona()
    },
    fps: () => fps,
    passo(fotogrammi) {
      suona = false
      trasporto.vai(Math.round((t + fotogrammi / fps) * fps) / fps)
    },
    avanza(valore) {
      t = dentro(valore)
      if (t >= durata) suona = false
      avvisa()
    },
    salti: () => salti,
    iscriviti(ascolta) {
      ascoltatori.add(ascolta)
      return () => ascoltatori.delete(ascolta)
    },
    imposta(nuovaDurata, nuoviFps) {
      fps = nuoviFps
      if (nuovaDurata === durata) return
      durata = nuovaDurata
      if (t > durata) {
        t = durata
        salti++
      }
      avvisa()
    },
  }
  return trasporto
}

/** Un trasporto per la vita del componente; la durata e i fotogrammi al secondo seguono il video. */
export function useTrasporto(durata: number, fps: number): Trasporto {
  const rif = useRef<Trasporto | null>(null)
  if (rif.current === null) rif.current = creaTrasporto(durata, fps)
  const trasporto = rif.current
  useEffect(() => trasporto.imposta(durata, fps), [trasporto, durata, fps])
  return trasporto
}

/** Dov'è la testina, ridisegnando chi lo chiede a ogni movimento. */
export function useTempo(trasporto: Trasporto): number {
  return useSyncExternalStore(trasporto.iscriviti, trasporto.t)
}

/** Se sta suonando. */
export function useInRiproduzione(trasporto: Trasporto): boolean {
  return useSyncExternalStore(trasporto.iscriviti, trasporto.inRiproduzione)
}

/** Un valore ricavato dal tempo, che cambia di rado (il tratto sotto la testina, la parola detta):
 * chi lo legge si ridisegna solo quando cambia, non a ogni fotogramma. */
export function useDiscreto(trasporto: Trasporto, selettore: (t: number) => number): number {
  return useSyncExternalStore(trasporto.iscriviti, () => selettore(trasporto.t()))
}
