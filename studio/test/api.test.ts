import { afterEach, describe, expect, it, vi } from "vitest"
import { api, ErroreApi, urlMedia } from "../src/api"
import { caricaAllegato } from "../src/chat/api"
import { scegliLingua } from "../src/lingua"
import { errore, installaRete } from "./rete"

afterEach(() => vi.unstubAllGlobals())

describe("le rotte di docs/API.md", () => {
  it("ogni funzione chiama la sua rotta col suo metodo e il suo corpo", async () => {
    const { chiamate } = installaRete({
      "GET /api/video": [],
      "GET /api/video/a%20b": {},
      "PUT /api/video/a%20b/scheda": {},
      "PATCH /api/video/a%20b/piano": {},
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
    await api.ritoccaPiano("a b", [{ op: "add", path: "/coda", value: 1 }])
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
    installaRete({ "PATCH /api/video/x/piano": new Response(JSON.stringify({ errore: "Il piano non è valido.", problemi: ["Manca il quadro.", "Manca la sorgente."] }), { status: 400 }) })
    await expect(api.ritoccaPiano("x", [{ op: "add", path: "/coda", value: 1 }])).rejects.toThrow("Il piano non è valido.\nManca il quadro.\nManca la sorgente.")
  })

  it("una risposta che non è JSON (una pagina, un proxy) dice che è inattesa, non un errore di lettura", async () => {
    installaRete({ "GET /api/stile": () => new Response("<h1>Non è ancora costruita</h1>", { status: 503 }), "GET /api/video": () => new Response("<html>", { status: 200 }) })
    await expect(api.stile()).rejects.toMatchObject({ message: "Il server ha risposto in modo inatteso (503).", codice: 503 })
    await expect(api.elencoVideo()).rejects.toMatchObject({ message: "Il server ha risposto in modo inatteso (200)." })
    scegliLingua("en")
    await expect(api.stile()).rejects.toThrow("The server answered in an unexpected way (503).")
  })

  it("lo stesso vale per il caricamento di un allegato", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Bad gateway", { status: 502 })))
    await expect(caricaAllegato(new File(["x"], "a.png"))).rejects.toThrow("Il server ha risposto in modo inatteso (502).")
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
