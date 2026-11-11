import { describe, expect, it } from "vitest"
import { applicaRitocchi, PianoCambiato } from "../../server/src/ritocchi"
import * as r from "../src/montaggio/ritocchi"
import { ritocchiTra } from "../src/montaggio/differenze"
import type { Piano } from "../src/tipi"
import { contestoDiProva } from "./fixture"

const applica = (piano: unknown, ritocchi: unknown) => applicaRitocchi(piano, ritocchi)

describe("i ritocchi fra due piani", () => {
  it("non ce ne sono se i piani sono uguali", () => {
    expect(ritocchiTra({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toEqual([])
  })

  it("un campo cambiato, uno aggiunto e uno tolto: il valore di prima è controllato davanti a ogni cambio, e chi aggiunge un campo prova l'oggetto che lo riceve", () => {
    expect(ritocchiTra({ a: 1, b: { x: 1 }, c: 3 }, { a: 2, b: { x: 1, y: 5 } })).toEqual([
      { op: "test", path: "/a", value: 1 },
      { op: "replace", path: "/a", value: 2 },
      { op: "test", path: "/b", value: { x: 1 } },
      { op: "add", path: "/b/y", value: 5 },
      { op: "test", path: "/c", value: 3 },
      { op: "remove", path: "/c" },
    ])
  })

  it("una lista che cambia in un solo punto dà il ritocco di quel punto", () => {
    expect(ritocchiTra({ l: [1, 2, 3] }, { l: [1, 9, 3] })).toEqual([
      { op: "test", path: "/l/1", value: 2 },
      { op: "replace", path: "/l/1", value: 9 },
    ])
  })

  it("un elemento in più o in meno dà un solo add o remove, con la prova del vicino o dell'elemento tolto", () => {
    expect(ritocchiTra({ l: ["a", "c"] }, { l: ["a", "b", "c"] })).toEqual([
      { op: "test", path: "/l/1", value: "c" },
      { op: "add", path: "/l/1", value: "b" },
    ])
    expect(ritocchiTra({ l: ["a", "b"] }, { l: ["a", "b", "c"] })).toEqual([
      { op: "test", path: "/l/1", value: "b" },
      { op: "add", path: "/l/2", value: "c" },
    ])
    expect(ritocchiTra({ l: ["a", "b", "c"] }, { l: ["a", "c"] })).toEqual([
      { op: "test", path: "/l/1", value: "b" },
      { op: "remove", path: "/l/1" },
    ])
    expect(ritocchiTra({ l: [] }, { l: ["a"] })).toEqual([{ op: "add", path: "/l/0", value: "a" }])
  })

  it("i nomi con «/» e «~» si scrivono come nei JSON Pointer", () => {
    expect(ritocchiTra({ "a/b": { "c~d": 1 } }, { "a/b": { "c~d": 2 } })[1]).toEqual({ op: "replace", path: "/a~1b/c~0d", value: 2 })
  })

  describe("ogni gesto del montaggio, applicato dal server al piano di partenza, dà il piano del gesto", () => {
    const gesti: [string, (ctx: r.Contesto) => r.Esito][] = [
      ["dividi", (ctx) => r.dividi(ctx, 1.5)],
      ["bordo d'inizio", (ctx) => r.bordo(ctx, 0, "inizio", 0.8, { minimo: 0.1 })],
      ["bordo che apre un vuoto", (ctx) => r.bordo(ctx, 0, "fine", 3.2, { minimo: 0.1 })],
      ["bordo che richiude il vuoto", (ctx) => r.bordo(ctx, 1, "inizio", 3, { minimo: 0.1 })],
      ["togli un tratto", (ctx) => r.togliTratto(ctx, 0)],
      ["sposta la scena", (ctx) => r.spostaScena(ctx, 0, 1)],
      ["zoom", (ctx) => r.zoomPezzo(ctx, 0, 0, { scala: 1.5 })],
      ["coda del video", (ctx) => r.codaDelVideo(ctx, 1.3)],
      ["titolo", (ctx) => r.testoTitolo(ctx, "Un titolo")],
      ["sottotitoli", (ctx) => r.modoSottotitoli(ctx, "nessuno")],
    ]
    for (const [nome, gesto] of gesti) {
      it(nome, () => {
        const ctx = contestoDiProva()
        const esito = gesto(ctx)
        if (!esito.ok) throw new Error(`gesto rifiutato: ${esito.motivo}`)
        const ritocchi = ritocchiTra(ctx.proprio, esito.piano)
        expect(ritocchi.length).toBeGreaterThan(0)
        expect(applica(ctx.proprio, ritocchi)).toEqual(esito.piano)
      })
    }
  })

  describe("con un altro che scrive nello stesso momento", () => {
    const partenza = (): Piano => structuredClone(contestoDiProva().proprio)
    const gestoDellaPersona = (ctx: r.Contesto) => {
      const esito = r.zoomPezzo(ctx, 0, 0, { scala: 2 })
      if (!esito.ok) throw new Error(esito.motivo)
      return ritocchiTra(ctx.proprio, esito.piano)
    }

    it("un cambio in un altro punto del piano resta: il ritocco della persona si somma", () => {
      const ctx = contestoDiProva()
      const ritocchi = gestoDellaPersona(ctx)
      const delClaude = { ...partenza(), coda: 0.9 }
      const risultato = applica(delClaude, ritocchi) as Piano & { coda: number }
      expect(risultato.coda).toBe(0.9)
      expect(risultato.scene![0]!.pezzi[0]!.zoom).toEqual({ scala: 2 })
    })

    it("un cambio nello stesso campo non si sovrascrive in silenzio: il server dice che il piano è cambiato", () => {
      const ctx = contestoDiProva()
      const ritocchi = gestoDellaPersona(ctx)
      const delClaude = partenza()
      delClaude.scene![0]!.pezzi[0]!.zoom = { scala: 3 }
      expect(() => applica(delClaude, ritocchi)).toThrow(PianoCambiato)
    })

    it("una scena inserita da un altro davanti sposta gli indici: il ritocco non finisce sulla scena sbagliata", () => {
      const ctx = contestoDiProva()
      const ritocchi = gestoDellaPersona(ctx)
      const delClaude = partenza()
      delClaude.scene!.unshift({ nome: "nuova", pezzi: [{ sorgente: Object.keys(delClaude.sorgenti ?? {})[0]!, da: 0, a: 1 }] })
      expect(() => applica(delClaude, ritocchi)).toThrow(PianoCambiato)
    })
  })
})
