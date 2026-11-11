import { afterEach, describe, expect, test } from "bun:test"
import { readdir } from "node:fs/promises"
import { join } from "node:path"
import { applicaRitocchi, PianoCambiato } from "../src/ritocchi"
import { avviaAmbiente, chiama, fermaTutti, piano, scriviGrezzo, scriviVideo } from "./aiuti"

afterEach(fermaTutti)

const base = () => ({ quadro: "q", scene: [{ nome: "a", pezzi: [{ sorgente: "s", dice: "uno" }, { sorgente: "s", dice: "due" }] }], sottotitoli: { nomi: ["X"] } })

describe("i ritocchi di un piano", () => {
  test("sostituiscono, aggiungono e tolgono per percorso, in ordine, senza toccare l'originale", () => {
    const prima = base()
    const dopo = applicaRitocchi(prima, [
      { op: "replace", path: "/scene/0/pezzi/1/dice", value: "tre" },
      { op: "add", path: "/scene/0/pezzi/1", value: { sorgente: "s", dice: "in mezzo" } },
      { op: "add", path: "/sottotitoli/nomi/-", value: "Y" },
      { op: "add", path: "/coda", value: 1 },
      { op: "remove", path: "/scene/0/pezzi/0" },
    ])
    expect(dopo).toEqual({
      quadro: "q",
      scene: [{ nome: "a", pezzi: [{ sorgente: "s", dice: "in mezzo" }, { sorgente: "s", dice: "tre" }] }],
      sottotitoli: { nomi: ["X", "Y"] },
      coda: 1,
    })
    expect(prima).toEqual(base())
  })

  test("un percorso che non c'è, un indice fuori, un'operazione sconosciuta: errore che dice quale ritocco", () => {
    const casi: [unknown, string][] = [
      [[{ op: "replace", path: "/scene/3/nome", value: "x" }], "ritocco 1"],
      [[{ op: "replace", path: "/inventata", value: 1 }], "«inventata»"],
      [[{ op: "remove", path: "/scene/0/pezzi/7" }], "7"],
      [[{ op: "add", path: "/scene/0/pezzi/9", value: {} }], "9"],
      [[{ op: "move", path: "/quadro" }], "replace, add, remove"],
      [[{ op: "replace", path: "scene/0", value: 1 }], "/"],
      [[{ op: "replace", path: "/quadro" }], "value"],
      [[{ op: "replace", path: "", value: {} }], "piano_scrivi"],
      [{ op: "replace" }, "lista"],
      [[], "lista"],
    ]
    for (const [ritocchi, frase] of casi) expect(() => applicaRitocchi(base(), ritocchi), JSON.stringify(ritocchi)).toThrow(frase)
  })

  test("un campo che manca a metà percorso: l'errore dice come crearlo, con un add sul campo e il valore intero", () => {
    expect(() => applicaRitocchi(base(), [{ op: "add", path: "/scene/0/pezzi/1/via/0", value: [1, 2] }])).toThrow(
      "ritocco 1: «/scene/0/pezzi/1/via/0» non c'è nel piano: manca «via». Per crearlo: { op: \"add\", path: \"/scene/0/pezzi/1/via\", value: <il valore intero> }.",
    )
    expect(applicaRitocchi(base(), [{ op: "add", path: "/scene/0/pezzi/1/via", value: [[1, 2]] }])).toMatchObject({ scene: [{ pezzi: [{}, { via: [[1, 2]] }] }] })
  })

  test("«test» non cambia niente: passa se il valore è quello, se no è un piano cambiato (anche se il percorso non c'è più)", () => {
    expect(applicaRitocchi(base(), [{ op: "test", path: "/scene/0/pezzi/1", value: { sorgente: "s", dice: "due" } }, { op: "test", path: "/quadro", value: "q" }])).toEqual(base())
    const cambiato = (ritocchi: unknown[]) => {
      try {
        applicaRitocchi(base(), ritocchi)
      } catch (errore) {
        return errore instanceof PianoCambiato ? errore.message : `altro errore: ${String(errore)}`
      }
      return "nessun errore"
    }
    expect(cambiato([{ op: "test", path: "/scene/0/pezzi/1/dice", value: "uno" }])).toContain("ritocco 1")
    expect(cambiato([{ op: "add", path: "/coda", value: 1 }, { op: "test", path: "/scene/4/nome", value: "a" }])).toContain("ritocco 2")
    expect(cambiato([{ op: "test", path: "/quadro" }])).toContain("value")
  })

  test("~1 e ~0 nel percorso sono «/» e «~», come nei JSON Pointer", () => {
    expect(applicaRitocchi({ "a/b": 1, "c~d": 2 }, [{ op: "replace", path: "/a~1b", value: 3 }, { op: "remove", path: "/c~0d" }])).toEqual({ "a/b": 3 })
  })
})

describe("PATCH /api/video/:slug/piano", () => {
  const conPiano = () =>
    avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/a.mp4")
      await scriviVideo(c, "v", undefined, piano())
    })

  test("applica i ritocchi al piano scritto, lo valida e ne tiene la versione di prima", async () => {
    const a = await conPiano()
    const r = await chiama<{ ok: boolean; piano: Record<string, unknown> }>(a, "PATCH", "/api/video/v/piano", [{ op: "add", path: "/coda", value: 1 }])
    expect(r.stato).toBe(200)
    expect(r.corpo.piano).toEqual({ ...piano(), coda: 1 })
    expect((await chiama<{ piano: unknown }>(a, "GET", "/api/video/v")).corpo.piano).toEqual({ ...piano(), coda: 1 })
    expect(await readdir(join(a.archivio, "video", "v", "storia"))).toEqual(["1.json"])
  })

  test("un ritocco che rende il piano non valido è rifiutato, e il file resta com'era", async () => {
    const a = await conPiano()
    const r = await chiama<{ errore: string }>(a, "PATCH", "/api/video/v/piano", [{ op: "add", path: "/inventata", value: 1 }])
    expect(r.stato).toBe(400)
    expect(r.corpo.errore).toContain("inventata")
    const percorso = await chiama<{ errore: string }>(a, "PATCH", "/api/video/v/piano", [{ op: "replace", path: "/scene/9/nome", value: "x" }])
    expect([percorso.stato, percorso.corpo.errore]).toEqual([400, expect.stringContaining("ritocco 1")])
    expect((await chiama<{ piano: unknown }>(a, "GET", "/api/video/v")).corpo.piano).toEqual(piano())
  })

  test("due ritocchi insieme si mettono in fila: nessuno dei due si perde", async () => {
    const a = await conPiano()
    const ritocchi = [
      [{ op: "add", path: "/coda", value: 1 }],
      [{ op: "replace", path: "/scene/0/nome", value: "nuova" }],
      [{ op: "replace", path: "/scene/0/pezzi/0/a", value: 1.5 }],
    ]
    const risposte = await Promise.all(ritocchi.map((r) => chiama(a, "PATCH", "/api/video/v/piano", r)))
    expect(risposte.map((r) => r.stato)).toEqual([200, 200, 200])
    const letto = (await chiama<{ piano: { coda: number; scene: { nome: string; pezzi: { a: number }[] }[] } }>(a, "GET", "/api/video/v")).corpo.piano
    expect([letto.coda, letto.scene[0]!.nome, letto.scene[0]!.pezzi[0]!.a]).toEqual([1, "nuova", 1.5])
  })

  test("un ritocco che si aspetta un valore che non c'è più è un 409, e il file resta com'era", async () => {
    const a = await conPiano()
    const r = await chiama<{ errore: string }>(a, "PATCH", "/api/video/v/piano", [
      { op: "test", path: "/scene/0/nome", value: "un'altra" },
      { op: "replace", path: "/scene/0/nome", value: "mia" },
    ])
    expect([r.stato, r.corpo.errore]).toEqual([409, expect.stringContaining("cambiato nel frattempo")])
    expect((await chiama<{ errore: string }>(a, "PATCH", "/api/video/v/piano", [{ op: "test", path: "/scene/0/nome", value: "un'altra" }], "en")).corpo.errore).toContain("changed in the meantime")
    expect((await chiama<{ piano: unknown }>(a, "GET", "/api/video/v")).corpo.piano).toEqual(piano())
  })

  test("due che cambiano lo stesso campo insieme: uno passa, l'altro lo sa; due campi diversi: passano tutti e due", async () => {
    const a = await conPiano()
    const uno = [{ op: "test", path: "/scene/0/nome", value: "s" }, { op: "replace", path: "/scene/0/nome", value: "di uno" }]
    const due = [{ op: "test", path: "/scene/0/nome", value: "s" }, { op: "replace", path: "/scene/0/nome", value: "di due" }]
    const altroCampo = [{ op: "add", path: "/coda", value: 2 }]
    const risposte = await Promise.all([uno, due, altroCampo].map((r) => chiama(a, "PATCH", "/api/video/v/piano", r)))
    expect(risposte.map((r) => r.stato).sort()).toEqual([200, 200, 409])
    const letto = (await chiama<{ piano: { coda: number; scene: { nome: string }[] } }>(a, "GET", "/api/video/v")).corpo.piano
    expect(letto.coda).toBe(2)
    expect(["di uno", "di due"]).toContain(letto.scene[0]!.nome)
  })

  test("un video senza piano non si ritocca: si scrive", async () => {
    const a = await avviaAmbiente({}, async (c) => scriviVideo(c, "w"))
    const r = await chiama<{ errore: string }>(a, "PATCH", "/api/video/w/piano", [{ op: "add", path: "/coda", value: 1 }])
    expect([r.stato, r.corpo.errore]).toEqual([409, expect.stringContaining("piano")])
  })
})
