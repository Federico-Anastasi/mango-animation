import { describe, expect, it } from "vitest"
import * as g from "../src/montaggio/geometria"
import { risoltoDiProva } from "./fixture"

describe("geometria della timeline", () => {
  it("il righello sceglie la tacca più rada ancora leggibile", () => {
    expect(g.passoRighello(100)).toBe(1)
    expect(g.passoRighello(20)).toBe(5)
    expect(g.passoRighello(4)).toBe(30)
    expect(g.passoRighello(400)).toBe(0.25)
  })

  it("adatta tutto il video alla larghezza, mai sotto il minimo", () => {
    expect(g.pxPerAdattare(60, 608)).toBe(10)
    expect(g.pxPerAdattare(6000, 600)).toBe(g.MIN_PX_AL_SECONDO)
    expect(g.pxPerAdattare(0, 600)).toBe(20)
  })

  const parole = [
    { p: "ciao", da: 1.0, a: 1.4 },
    { p: "mondo", da: 1.5, a: 2.0 },
  ]

  it("un bordo d'ingresso si aggancia all'inizio della parola vicina", () => {
    expect(g.aggancia(1.45, parole, "inizio")).toBe(1.5)
    expect(g.aggancia(1.04, parole, "inizio")).toBe(1.0)
  })

  it("un bordo d'uscita si aggancia alla fine della parola vicina", () => {
    expect(g.aggancia(1.35, parole, "fine")).toBe(1.4)
    expect(g.aggancia(2.1, parole, "fine")).toBe(2.0)
  })

  it("lontano da ogni parola, o senza parole, il secondo resta com'è", () => {
    expect(g.aggancia(3.3, parole, "inizio")).toBe(3.3)
    expect(g.aggancia(1.2, null, "inizio")).toBe(1.2)
  })

  describe("le parole come le conta il motore", () => {
    const grezze = [
      { p: "ciao", da: 1.0, a: 1.4 },
      { p: "mondo", da: 1.5, a: 2.0 },
    ]
    const conParole = (parole: { p: string; da: number; a: number; tratto: number; nella_sorgente: number }[]) => ({ ...risoltoDiProva(), tratti: [{ ...risoltoDiProva().tratti[0]!, sorgente: "a" }, { ...risoltoDiProva().tratti[0]!, sorgente: "b" }], parole: parole.map((w) => ({ ...w, voto: 0.9 })) })

    it("senza parole del risolto sono quelle grezze con lo sfasamento del piano", () => {
      expect(g.paroleDelMotore(grezze, 0.5, conParole([]), "a")).toEqual([
        { p: "ciao", da: 1.5, a: 1.9 },
        { p: "mondo", da: 2.0, a: 2.5 },
      ])
    })

    it("una parola che il risolto ha allineata prende i tempi del risolto, e le altre restano", () => {
      const risolto = conParole([{ p: "mondo", da: 3, a: 3.35, tratto: 0, nella_sorgente: 2.1 }])
      expect(g.paroleDelMotore(grezze, 0.5, risolto, "a")).toEqual([
        { p: "ciao", da: 1.5, a: 1.9 },
        { p: "mondo", da: 2.1, a: 2.45 },
      ])
    })

    it("le parole di un'altra sorgente non contano; senza parole grezze non c'è niente da agganciare", () => {
      const risolto = conParole([{ p: "mondo", da: 3, a: 3.35, tratto: 1, nella_sorgente: 2.1 }])
      expect(g.paroleDelMotore(grezze, 0, risolto, "a")).toEqual(grezze)
      expect(g.paroleDelMotore(null, 0, risolto, "a")).toBeNull()
    })
  })

  it("sceglie la parola più vicina quando ce n'è più d'una nel raggio", () => {
    const strette = [
      { p: "a", da: 1.0, a: 1.1 },
      { p: "b", da: 1.12, a: 1.2 },
    ]
    expect(g.aggancia(1.11, strette, "inizio")).toBe(1.12)
  })

  it("i pezzi sono blocchi con i loro tratti", () => {
    const gruppi = g.gruppiDiPezzi(risoltoDiProva())
    expect(gruppi).toEqual([
      { scena: 0, pezzo: 0, tratti: [0, 1], da: 0, a: 7.5 },
      { scena: 1, pezzo: 0, tratti: [2, 3], da: 7.5, a: 10.5 },
    ])
  })

  it("la posizione di un pezzo trascinato conta i vicini che restano a sinistra", () => {
    const gruppi = [
      { scena: 0, pezzo: 0, tratti: [0], da: 0, a: 4 },
      { scena: 0, pezzo: 1, tratti: [1], da: 4, a: 6 },
      { scena: 0, pezzo: 2, tratti: [2], da: 6, a: 12 },
      { scena: 1, pezzo: 0, tratti: [3], da: 12, a: 14 },
    ]
    expect(g.posizioneDopoTrascinamento(gruppi, 0, 0, 7)).toBe(1)
    expect(g.posizioneDopoTrascinamento(gruppi, 0, 0, 20)).toBe(2)
    expect(g.posizioneDopoTrascinamento(gruppi, 0, 2, 1)).toBe(0)
    expect(g.posizioneDopoTrascinamento(gruppi, 1, 0, 1)).toBe(0)
  })

  it("la scena sotto un secondo, e il posto in un'altra scena", () => {
    const scene = [
      { nome: "a", quadro: "q", inizio: 0, durata: 5, animazione: null, ancore: [], tempi: {} },
      { nome: "b", quadro: "q", inizio: 5, durata: 5, animazione: null, ancore: [], tempi: {} },
    ]
    expect([g.scenaA(scene, 2), g.scenaA(scene, 5), g.scenaA(scene, 99), g.scenaA(scene, -3)]).toEqual([0, 1, 1, 0])
    const gruppi = [
      { scena: 1, pezzo: 0, tratti: [0], da: 5, a: 7 },
      { scena: 1, pezzo: 1, tratti: [1], da: 7, a: 9 },
    ]
    expect([g.posizioneInAltraScena(gruppi, 1, 4), g.posizioneInAltraScena(gruppi, 1, 7.5), g.posizioneInAltraScena(gruppi, 1, 20)]).toEqual([0, 1, 2])
  })
})
