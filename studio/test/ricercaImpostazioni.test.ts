// «Cerca» nelle impostazioni: l'indice delle righe, con le parole che uno scriverebbe.
import { afterEach, describe, expect, it } from "vitest"
import { cerca, testoDi } from "../src/impostazioni/righe"
import { scegliLingua } from "../src/lingua"

afterEach(() => {
  delete window.__MANGO_ANIMATION__
  scegliLingua("it")
})

const dove = (domanda: string) => cerca(domanda).map((r) => `${r.sezione}:${r.id}`)

describe("la ricerca nelle impostazioni", () => {
  it("trova una riga dalle parole che uno scriverebbe, senza badare a maiuscole e accenti", () => {
    expect(dove("SCURO")).toContain("generale:generale.tema")
    expect(dove("qualita")).toContain("stile:stile.uscita")
    expect(dove("qualità video")).toContain("stile:stile.uscita")
    expect(dove("microfono")).toEqual(expect.arrayContaining(["generale:generale.dettatura", "computer:computer.dettatura"]))
  })

  it("basta l'inizio di una parola, e servono tutte le parole scritte", () => {
    expect(dove("lingu")).toContain("generale:generale.lingua")
    expect(dove("tema notte")).toContain("generale:generale.tema")
    expect(dove("tema pomodoro")).toEqual([])
  })

  it("trova anche con le parole dell'altra lingua", () => {
    expect(dove("dark")).toContain("generale:generale.tema")
    scegliLingua("en")
    expect(dove("scuro")).toContain("generale:generale.tema")
    expect(testoDi("generale.tema").nome).toBe("Theme")
  })

  it("mette prima le righe che hanno le parole nel nome", () => {
    const trovate = cerca("lingua")
    expect(trovate[0]?.id).toBe("generale.lingua")
    expect(trovate.map((r) => r.id)).toContain("profilo.lingua")
  })

  it("una domanda vuota non trova niente", () => {
    expect(cerca("")).toEqual([])
    expect(cerca("   ")).toEqual([])
  })

  it("le righe che esistono solo con l'app non si trovano nel browser, e con l'app sì", () => {
    expect(dove("grandezza")).toEqual([])
    expect(dove("registri")).toEqual([])
    window.__MANGO_ANIMATION__ = {
      grandezza: { leggi: async () => 1, imposta: async () => undefined },
      aiuto: { leggi: async () => ({ versione: "0.1.6", aggiornaDaSolo: true }), controlla: async () => ({ nuova: null }), aggiornaDaSolo: async () => undefined, riavviaEAggiorna: async () => undefined, apriRegistri: async () => undefined },
    }
    expect(dove("zoom")).toEqual(["generale:generale.grandezza"])
    expect(dove("registri")).toEqual(["aiuto:aiuto.registri"])
  })

  it("ogni riga ha un nome e le sue due lingue", () => {
    scegliLingua("it")
    expect(testoDi("aiuto.guida")).toMatchObject({ nome: "Come si usa" })
    scegliLingua("en")
    expect(testoDi("aiuto.guida")).toMatchObject({ nome: "How to use it" })
  })
})
