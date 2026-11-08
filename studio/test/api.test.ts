import { afterEach, describe, expect, it, vi } from "vitest"
import { api, ErroreApi, urlMedia } from "../src/api"
import { scegliLingua } from "../src/lingua"
import { errore, installaRete } from "./rete"

afterEach(() => vi.unstubAllGlobals())

describe("le rotte di docs/API.md", () => {
  it("ogni funzione chiama la sua rotta col suo metodo e il suo corpo", async () => {
    const { chiamate } = installaRete({
      "GET /api/video": [],
      "GET /api/video/a%20b": {},
      "PUT /api/video/a%20b/scheda": {},
      "PUT /api/video/a%20b/piano": {},
      "POST /api/video/a%20b/annulla": {},
      "POST /api/video/a%20b/rifai": {},
      "DELETE /api/video/a%20b": {},
      "GET /api/grezzo": [],
      "GET /api/grezzo/parole?file=2026-10-06%2Fx.mp4": [],
      "PUT /api/grezzo/scheda?file=2026-10-06%2Fx.mp4": {},
      "GET /api/stile": {},
      "PUT /api/stile": {},
      "GET /api/animazioni": {},
      "GET /api/lavori": {},
      "DELETE /api/lavori/l1": {},
      "GET /api/arrivi": {},
      "POST /api/apri": {},
    })
    await api.elencoVideo()
    await api.video("a b")
    await api.scriviScheda("a b", { titolo: "T", stato: "proposta", creato: "2026-10-09" })
    await api.scriviPiano("a b", { quadro: "q" })
    await api.annulla("a b")
    await api.rifai("a b")
    await api.togliVideo("a b")
    await api.grezzo()
    await api.paroleGrezzo("2026-10-06/x.mp4")
    await api.scriviSchedaGrezzo("2026-10-06/x.mp4", { tipo: "ripresa", origine: "telefono" })
    await api.stile()
    await api.scriviStile({} as never)
    await api.animazioni()
    await api.lavori()
    await api.fermaLavoro("l1")
    await api.arrivi()
    await api.apri("video/a")
    expect(chiamate).toHaveLength(17)
    expect(chiamate[16]!.corpo).toEqual({ percorso: "video/a" })
  })

  it("un errore del server arriva con la sua frase in italiano e il suo codice", async () => {
    installaRete({ "GET /api/video/x": errore(404, "Questo video non c'è.") })
    const e = await api.video("x").catch((er: unknown) => er)
    expect(e).toBeInstanceOf(ErroreApi)
    expect((e as ErroreApi).message).toBe("Questo video non c'è.")
    expect((e as ErroreApi).codice).toBe(404)
  })

  it("ogni richiesta dice al server la lingua dello studio, perché risponda nella stessa", async () => {
    const { chiamate } = installaRete({ "GET /api/video": [], "PUT /api/stile": {} })
    scegliLingua("en")
    await api.elencoVideo()
    await api.scriviStile({} as never)
    scegliLingua("it")
    await api.elencoVideo()
    expect(chiamate.map((c) => c.intestazioni["X-Lingua"])).toEqual(["en", "en", "it"])
    expect(chiamate[1]!.intestazioni["Content-Type"]).toBe("application/json")
  })

  it("una risposta d'errore senza frase dice almeno il codice", async () => {
    installaRete({ "GET /api/stile": errore(500, "Il server è occupato.") })
    await expect(api.stile()).rejects.toThrow("Il server è occupato.")
  })

  it("un rifiuto con più motivi li dà uno per riga", async () => {
    installaRete({ "PUT /api/video/x/piano": new Response(JSON.stringify({ errore: "Il piano non è valido.", problemi: ["Manca il quadro.", "Manca la sorgente."] }), { status: 400 }) })
    await expect(api.scriviPiano("x", {})).rejects.toThrow("Il piano non è valido.\nManca il quadro.\nManca la sorgente.")
  })

  it("il controllo degli arrivi è un POST", async () => {
    const { chiamate } = installaRete({ "POST /api/arrivi/controlla": {} })
    await api.controllaArrivi()
    expect(chiamate[0]!.metodo).toBe("POST")
  })

  it("lo studio dal telefono: si legge, si accende o spegne con {acceso}, la chiave si rifà con un POST", async () => {
    const { chiamate } = installaRete({ "GET /api/accesso-studio": {}, "PUT /api/accesso-studio": {}, "POST /api/accesso-studio/chiave": {} })
    await api.accessoStudio()
    await api.accendiStudioDalTelefono(true)
    await api.rifaiChiaveDelloStudio()
    expect(chiamate.map((c) => c.metodo)).toEqual(["GET", "PUT", "POST"])
    expect(chiamate[1]!.corpo).toEqual({ acceso: true })
  })

  it("se il server non risponde lo dice e dice cosa fare", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("rete")))
    await expect(api.lavori()).rejects.toThrow("Mango Animation non risponde. Controlla che sia acceso sul computer e riprova.")
  })

  it("un file dell'archivio si serve da /media con i pezzi del percorso codificati", () => {
    expect(urlMedia("preparati/2026-10-06/a b.mp4/leggero.mp4")).toBe("/media/preparati/2026-10-06/a%20b.mp4/leggero.mp4")
  })
})
