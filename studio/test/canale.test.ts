import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { leggiEvento, riguarda } from "../src/canale"
import { copiaVideo, creaCopia } from "../src/dati"
import { dettaglioDiProva } from "./fixture"
import { errore, installaEventi, installaRete } from "./rete"

describe("gli eventi", () => {
  it("un messaggio si legge solo se ha un tipo", () => {
    expect(leggiEvento('{"tipo":"stile"}')).toEqual({ tipo: "stile" })
    expect(leggiEvento("{}")).toBeNull()
    expect(leggiEvento("non è json")).toBeNull()
    expect(leggiEvento("3")).toBeNull()
  })

  it("riguarda dice se il messaggio è di un tipo e, per un video, del suo slug", () => {
    const e = { tipo: "video", slug: "a", cosa: "piano" } as const
    expect(riguarda(e, ["video"])).toBe(true)
    expect(riguarda(e, ["video"], "a")).toBe(true)
    expect(riguarda(e, ["video"], "b")).toBe(false)
    expect(riguarda(e, ["stile"])).toBe(false)
    expect(riguarda({ tipo: "lavori" }, ["lavori"], "a")).toBe(true)
  })
})

describe("la copia condivisa di un dato", () => {
  let eventi: ReturnType<typeof installaEventi>
  beforeEach(() => {
    eventi = installaEventi()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("legge una volta all'inizio e poi solo quando un messaggio dice che è cambiato", async () => {
    const { chiamate } = installaRete({ "GET /api/video/a": { ...dettaglioDiProva(), slug: "a" }, "GET /api/video/b": { ...dettaglioDiProva(), slug: "b" } })
    const a = copiaVideo("a")
    const b = copiaVideo("b")
    const smettiA = a.iscriviti(() => undefined)
    const smettiB = b.iscriviti(() => undefined)
    await vi.waitFor(() => expect(chiamate).toHaveLength(2))
    expect(eventi.istanze).toHaveLength(1)

    eventi.istanze[0]!.manda({ tipo: "video", slug: "a", cosa: "piano" })
    await vi.waitFor(() => expect(chiamate.filter((c) => c.percorso === "/api/video/a")).toHaveLength(2))
    expect(chiamate.filter((c) => c.percorso === "/api/video/b")).toHaveLength(1)

    eventi.istanze[0]!.manda({ tipo: "lavori" })
    eventi.istanze[0]!.manda({ tipo: "arrivi" })
    await Promise.resolve()
    expect(chiamate).toHaveLength(3)
    smettiA()
    smettiB()
  })

  it("a riposo non fa nessuna richiesta, qualunque cosa passi il tempo", async () => {
    vi.useFakeTimers()
    const { chiamate } = installaRete({ "GET /api/video/a": { ...dettaglioDiProva(), slug: "a" } })
    const smetti = creaCopia(
      () => fetch("/api/video/a").then((r) => r.json()),
      (e) => e.tipo === "stile",
    ).iscriviti(() => undefined)
    await vi.advanceTimersByTimeAsync(0)
    const dopoLaPrima = chiamate.length
    await vi.advanceTimersByTimeAsync(60_000)
    expect(chiamate).toHaveLength(dopoLaPrima)
    smetti()
  })

  it("quando il canale cade e si riapre rilegge, e non prima", async () => {
    const { chiamate } = installaRete({ "GET /api/video/c": { ...dettaglioDiProva(), slug: "c" } })
    const smetti = copiaVideo("c").iscriviti(() => undefined)
    await vi.waitFor(() => expect(chiamate).toHaveLength(1))
    eventi.istanze[0]!.apri()
    await Promise.resolve()
    expect(chiamate).toHaveLength(1)
    eventi.istanze[0]!.cadi()
    eventi.istanze[0]!.apri()
    await vi.waitFor(() => expect(chiamate).toHaveLength(2))
    smetti()
  })

  it("senza nessuno che guarda chiude il canale", async () => {
    installaRete({ "GET /api/video/d": { ...dettaglioDiProva(), slug: "d" } })
    const copia = copiaVideo("d")
    const smetti = copia.iscriviti(() => undefined)
    await vi.waitFor(() => expect(copia.stato().caricato).toBe(true))
    smetti()
    expect(eventi.istanze[0]!.chiuso).toBe(true)
  })

  it("un errore di lettura resta nella copia con la sua frase, e il dato di prima si tiene", async () => {
    let riuscita = true
    installaRete({ "GET /api/video/e": () => (riuscita ? { ...dettaglioDiProva(), slug: "e" } : errore(500, "Il server è occupato.")) })
    const copia = copiaVideo("e")
    const smetti = copia.iscriviti(() => undefined)
    await vi.waitFor(() => expect(copia.stato().dato).not.toBeNull())
    riuscita = false
    await copia.rileggi()
    expect(copia.stato().errore).toBe("Il server è occupato.")
    expect(copia.stato().dato).not.toBeNull()
    smetti()
  })
})
