import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { negozio } from "../src/chat/negozio"
import { errore, installaEventi, installaRete } from "./rete"

beforeEach(() => {
  installaEventi()
  localStorage.clear()
  negozio.apri(null)
})
afterEach(() => vi.unstubAllGlobals())

describe("una conversazione che il server non ha più", () => {
  it("ricomincia da una nuova ma non butta i messaggi non ancora tornati: dicono perché non sono partiti", async () => {
    installaRete({
      "GET /api/chat/c1": () => errore(404, "Questa conversazione non c'è."),
      "POST /api/chat/c1/messaggi": {},
    })
    negozio.apri("c1")
    await negozio.invia({ testo: "Fai la copertina" })
    expect(negozio.leggi().inviati).toHaveLength(1)
    await negozio.carica()
    const stato = negozio.leggi()
    expect(stato.id).toBeNull()
    expect(stato.inviati).toHaveLength(1)
    expect(stato.inviati[0]).toMatchObject({ messaggio: { testo: "Fai la copertina" }, errore: expect.stringContaining("non c'è più") })
  })

  it("senza messaggi in coda torna a una conversazione vuota", async () => {
    installaRete({ "GET /api/chat/c1": () => errore(404, "Questa conversazione non c'è.") })
    negozio.apri("c1")
    await negozio.carica()
    expect(negozio.leggi()).toMatchObject({ id: null, inviati: [] })
  })
})
