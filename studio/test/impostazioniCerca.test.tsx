// La colonna delle impostazioni: «Cerca», le sezioni in ordine, la versione in fondo, la schermata stretta, e nessuna casella né pallino in nessuna sezione.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { caratteriDiProva, partenzeDiProva, stileDiProva } from "./fixture"
import { installaEventi, installaRete } from "./rete"

const PROFILO = { creator: { nome: "Anna", lingua: "it" }, pubblico: { livello: "non tecnico", lingua: "it", testate: ["Il Corriere"] }, canali: [{ piattaforma: "tiktok", nome: "annavideo", formato: "verticale" }], non_si_dice: ["parolacce"] }

async function studio(hash: string) {
  installaEventi()
  installaRete({
    "GET /api/profilo": { valido: true, presente: true, canali: [{ piattaforma: "tiktok", nome: "annavideo" }], profilo: PROFILO, problemi: [] },
    "GET /api/video": [],
    "GET /api/lavori": { in_corso: null, in_coda: [], finiti: [] },
    "GET /api/registrazione": { disponibile: true, motivo: null, dispositivi: { microfoni: [], camere: [] }, in_corso: null, ultima: null },
    "GET /api/arrivi": { acceso: true, in_ascolto: true, indirizzo: "192.168.1.20:47420", qr: "<svg xmlns='http://www.w3.org/2000/svg'/>", errore: null, ultimi: [], firewall: "consentito", pronto: true, motivo: null, carica: "http://192.168.1.20:47420/carica", qr_carica: "<svg xmlns='http://www.w3.org/2000/svg'/>" },
    "GET /api/accesso-studio": { acceso: true, in_ascolto: true, casa: { indirizzo: "192.168.1.20:47420", link: "http://192.168.1.20:47420/studio", qr: "<svg xmlns='http://www.w3.org/2000/svg'/>" }, fuori: null, pronto: true, motivo: null },
    "GET /api/canale/tiktok": { ultima: null, letture: [], profilo: null, video: [] },
    "GET /api/chat": [],
    "GET /api/chat/motori": [],
    "GET /api/chat/modelli": [],
    "GET /api/chat/comandi": [],
    "GET /api/stile": stileDiProva(),
    "GET /api/stile/partenza": partenzeDiProva(),
    "GET /api/caratteri": caratteriDiProva(),
    "GET /api/motori": {},
    "GET /api/macchina": {},
    "GET /api/grezzo": [],
  })
  vi.resetModules()
  window.localStorage.setItem("mango-animation.primo-giro", "saltato")
  window.location.hash = hash
  ;(await import("../src/lingua")).scegliLingua("it")
  const { App } = await import("../src/App")
  render(<App />)
}

const colonna = () => screen.findByRole("navigation", { name: "Impostazioni" })

beforeEach(() => {
  document.documentElement.removeAttribute("data-mango-theme")
})
afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
  delete window.__MANGO_ANIMATION__
})

describe("la colonna", () => {
  it("ha «Cerca», le quattro sezioni del mestiere, poi Generale e Aiuto", async () => {
    await studio("#/impostazioni/stile")
    const nav = await colonna()
    expect(within(nav).getByRole("searchbox", { name: "Cerca" })).toBeInTheDocument()
    const elenchi = within(nav).getAllByRole("list")
    expect(elenchi.map((e) => within(e).getAllByRole("link").map((l) => l.textContent))).toEqual([["Profilo", "Stile", "Computer", "Telefono"], ["Generale", "Aiuto"]])
    expect(within(nav).getByRole("link", { name: "Stile" })).toHaveAttribute("aria-current", "page")
    expect(within(nav).getByRole("link", { name: "Aiuto" })).toHaveAttribute("href", "#/impostazioni/aiuto")
  })

  it("in fondo c'è la versione dell'app, che nel browser non c'è", async () => {
    await studio("#/impostazioni/profilo")
    await colonna()
    expect(screen.queryByText(/Mango Animation \d/)).toBeNull()
    cleanup()
    window.__MANGO_ANIMATION__ = { aiuto: { leggi: async () => ({ versione: "0.1.6", aggiornaDaSolo: true }), controlla: async () => ({ nuova: null }), aggiornaDaSolo: async () => undefined, riavviaEAggiorna: async () => undefined, apriRegistri: async () => undefined } }
    await studio("#/impostazioni/profilo")
    expect(await within(await colonna()).findByText("Mango Animation 0.1.6")).toBeInTheDocument()
  })
})

describe("Cerca", () => {
  it("trova una riga dalle parole che uno scriverebbe, anche in maiuscolo e senza accenti, e porta alla sua sezione", async () => {
    await studio("#/impostazioni/profilo")
    const nav = await colonna()
    fireEvent.change(within(nav).getByRole("searchbox", { name: "Cerca" }), { target: { value: "SCURO" } })
    const risultati = within(nav).getByRole("list", { name: "Risultati" })
    const tema = within(risultati).getByRole("link", { name: /^Tema/ })
    expect(tema).toHaveAttribute("href", "#/impostazioni/generale")
    expect(tema).toHaveTextContent("Generale")
    expect(within(nav).queryByRole("link", { name: "Profilo" })).toBeNull()
    fireEvent.change(within(nav).getByRole("searchbox", { name: "Cerca" }), { target: { value: "qualita video" } })
    expect(within(within(nav).getByRole("list", { name: "Risultati" })).getByRole("link", { name: /Il video che esce/ })).toHaveAttribute("href", "#/impostazioni/stile")
    fireEvent.click(within(within(nav).getByRole("list", { name: "Risultati" })).getByRole("link", { name: /Il video che esce/ }))
    expect(within(nav).getByRole("searchbox", { name: "Cerca" })).toHaveValue("")
    expect(within(nav).getByRole("link", { name: "Profilo" })).toBeInTheDocument()
  })

  it("ogni sezione ha le sue righe fra i risultati", async () => {
    await studio("#/impostazioni/profilo")
    const nav = await colonna()
    const campo = within(nav).getByRole("searchbox", { name: "Cerca" })
    const dove = (domanda: string) => {
      fireEvent.change(campo, { target: { value: domanda } })
      return within(within(nav).getByRole("list", { name: "Risultati" })).getAllByRole("link").map((l) => l.getAttribute("href"))
    }
    expect(dove("tiktok")).toEqual(expect.arrayContaining(["#/impostazioni/profilo"]))
    expect(dove("decibel")).toContain("#/impostazioni/stile")
    expect(dove("scheda video")).toContain("#/impostazioni/computer")
    expect(dove("qr")).toContain("#/impostazioni/telefono")
    expect(dove("dettatura")).toEqual(expect.arrayContaining(["#/impostazioni/generale", "#/impostazioni/computer"]))
    expect(dove("guida")).toContain("#/impostazioni/aiuto")
  })

  it("trova anche con le parole dell'altra lingua", async () => {
    await studio("#/impostazioni/profilo")
    const nav = await colonna()
    fireEvent.change(within(nav).getByRole("searchbox", { name: "Cerca" }), { target: { value: "theme" } })
    expect(within(within(nav).getByRole("list", { name: "Risultati" })).getByRole("link", { name: /^Tema/ })).toBeInTheDocument()
  })

  it("se non trova niente lo dice", async () => {
    await studio("#/impostazioni/profilo")
    const nav = await colonna()
    fireEvent.change(within(nav).getByRole("searchbox", { name: "Cerca" }), { target: { value: "pomodoro" } })
    expect(within(nav).getByRole("status")).toHaveTextContent("Non trovo niente con queste parole.")
    expect(within(nav).queryByRole("list", { name: "Risultati" })).toBeNull()
  })

  it("Invio apre la sezione del primo risultato", async () => {
    await studio("#/impostazioni/profilo")
    const campo = within(await colonna()).getByRole("searchbox", { name: "Cerca" })
    fireEvent.change(campo, { target: { value: "registri" } })
    expect(window.location.hash).toBe("#/impostazioni/profilo")
    window.__MANGO_ANIMATION__ = { aiuto: { leggi: async () => ({ versione: "0.1.6", aggiornaDaSolo: true }), controlla: async () => ({ nuova: null }), aggiornaDaSolo: async () => undefined, riavviaEAggiorna: async () => undefined, apriRegistri: async () => undefined } }
    fireEvent.change(campo, { target: { value: "guida" } })
    fireEvent.keyDown(campo, { key: "Enter" })
    await waitFor(() => expect(window.location.hash).toBe("#/impostazioni/aiuto"))
    expect(campo).toHaveValue("")
  })
})

describe("lo schermo stretto", () => {
  it("senza una sezione nell'indirizzo la pagina è «chiusa» sull'elenco; con una sezione è aperta, e «Indietro» torna all'elenco", async () => {
    await studio("#/impostazioni")
    const pagina = (await colonna()).parentElement!
    expect(pagina).toHaveAttribute("data-aperta", "false")
    expect(await screen.findByRole("heading", { level: 1, name: "Profilo" })).toBeInTheDocument()
    cleanup()
    await studio("#/impostazioni/telefono")
    const aperta = (await colonna()).parentElement!
    expect(aperta).toHaveAttribute("data-aperta", "true")
    expect(within(aperta).getByRole("link", { name: "Indietro" })).toHaveAttribute("href", "#/impostazioni")
  })
})

describe("controlli di tutte le sezioni", () => {
  for (const sezione of ["profilo", "stile", "computer", "telefono", "generale", "aiuto"]) {
    it(`${sezione}: nessuna casella e nessun gruppo di pallini fuori dai segmenti, al più un bottone principale`, async () => {
      window.__MANGO_ANIMATION__ = {
        segnalazione: { invioAttivo: async () => true, invia: async () => ({ inviata: true }) },
        aiuto: { leggi: async () => ({ versione: "0.1.6", aggiornaDaSolo: true }), controlla: async () => ({ nuova: null }), aggiornaDaSolo: async () => undefined, riavviaEAggiorna: async () => undefined, apriRegistri: async () => undefined },
        grandezza: { leggi: async () => 1, imposta: async () => undefined },
      }
      await studio(`#/impostazioni/${sezione}`)
      await screen.findByRole("heading", { level: 1 })
      await waitFor(() => expect(document.querySelectorAll("[data-caricamento]")).toHaveLength(0))
      expect(document.querySelectorAll('input[type="checkbox"]')).toHaveLength(0)
      for (const pallino of document.querySelectorAll('input[type="radio"]')) expect(pallino.closest('[role="radiogroup"]')).not.toBeNull()
      expect(document.querySelectorAll('[data-variante="principale"]').length).toBeLessThanOrEqual(1)
    })
  }
})
