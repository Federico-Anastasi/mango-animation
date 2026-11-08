import { describe, expect, it } from "vitest"

import { ordina, perMille, rapporti, totali, valoreDi } from "../src/pubblico/rapporti"
import type { VideoDelCanale } from "../src/tipi"

const video = (dati: Partial<VideoDelCanale>): VideoDelCanale => ({ id: "1", slug: "prova", commenti_letti: 0, variazione: null, ...dati })

describe("i rapporti per 1000 visualizzazioni", () => {
  it("divide ogni numero per le visualizzazioni", () => {
    const r = rapporti(video({ visualizzazioni: 4000, mi_piace: 100, commenti: 8, condivisioni: 4, salvati: 60, nuovi_follower: 20 }))
    expect(r).toEqual({ mi_piace: 25, commenti: 2, condivisioni: 1, salvati: 15, nuovi_follower: 5 })
  })

  it("senza visualizzazioni non divide, e non inventa zeri", () => {
    expect(perMille(10, undefined)).toBeNull()
    expect(perMille(10, 0)).toBeNull()
    expect(rapporti(video({ mi_piace: 3 })).mi_piace).toBeNull()
    expect(rapporti(video({ visualizzazioni: 500, mi_piace: 5, salvati: undefined })).salvati).toBeNull()
  })
})

describe("i totali", () => {
  it("somma e divide le somme, e pesa il tempo sulle visualizzazioni", () => {
    const t = totali([
      video({ id: "1", visualizzazioni: 1000, mi_piace: 10, commenti: 3, tempo_riproduzione_s: 30000 }),
      video({ id: "2", visualizzazioni: 9000, mi_piace: 90, commenti: 7, tempo_riproduzione_s: 90000 }),
    ])
    expect(t.video).toBe(2)
    expect(t.visualizzazioni).toBe(10000)
    expect(t.mi_piace).toBe(100)
    expect(t.commenti).toBe(10)
    expect(t.rapporti.mi_piace).toBe(10)
    expect(t.rapporti.commenti).toBe(1)
    expect(t.ore).toBeCloseTo(33.33, 2)
    expect(t.secondi_per_visualizzazione).toBeCloseTo(12, 5)
  })

  it("lascia fuori i video senza visualizzazioni", () => {
    const t = totali([video({ id: "1", visualizzazioni: 1000, mi_piace: 10 }), video({ id: "2", slug: null, mi_piace: 5 })])
    expect(t.video).toBe(1)
    expect(t.mi_piace).toBe(10)
  })

  it("senza tempi non dichiara un tempo medio", () => {
    const t = totali([video({ visualizzazioni: 1000, mi_piace: 10 })])
    expect(t.ore).toBe(0)
    expect(t.secondi_per_visualizzazione).toBeNull()
  })
})

describe("l'ordinamento della tabella", () => {
  const tre = [
    video({ id: "poco", visualizzazioni: 1000, salvati: 10 }),
    video({ id: "molto", visualizzazioni: 1000, salvati: 200 }),
    video({ id: "mezzo", visualizzazioni: 5000, salvati: 500 }),
  ]

  it("ordina dal più alto, e rovescia se glielo si chiede", () => {
    expect(ordina(tre, "salvati", false).map((v) => v.id)).toEqual(["molto", "mezzo", "poco"])
    expect(ordina(tre, "salvati", true).map((v) => v.id)).toEqual(["poco", "mezzo", "molto"])
  })

  it("ordina anche per visualizzazioni", () => {
    expect(ordina(tre, "visualizzazioni", false).map((v) => v.id)).toEqual(["mezzo", "poco", "molto"])
  })

  it("chi non ha il numero va in fondo, in tutti e due i versi", () => {
    const senza = [...tre, video({ id: "muto", salvati: undefined })]
    expect(ordina(senza, "salvati", false).map((v) => v.id)).toEqual(["molto", "mezzo", "poco", "muto"])
    expect(ordina(senza, "salvati", true).map((v) => v.id)).toEqual(["poco", "mezzo", "molto", "muto"])
  })

  it("il valore di un video senza visualizzazioni non si inventa", () => {
    expect(valoreDi(video({ salvati: 10 }), "salvati")).toBeNull()
    expect(valoreDi(video({ visualizzazioni: 500, salvati: 10 }), "salvati")).toBe(20)
    expect(valoreDi(video({ visualizzazioni: 500, salvati: 10 }), "visualizzazioni")).toBe(500)
  })
})