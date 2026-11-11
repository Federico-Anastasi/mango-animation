// La pagina «Impostazioni»: le sezioni, i vecchi indirizzi di Stile e Motori, e il profilo che si corregge a mano.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProfiloDelCreator } from "../src/tipi"
import { caratteriDiProva, partenzeDiProva, stileDiProva } from "./fixture"
import { errore, installaEventi, installaRete, type Chiamata } from "./rete"

const SVG = "<svg xmlns='http://www.w3.org/2000/svg'/>"
const PROFILO: ProfiloDelCreator = {
  creator: { nome: "Anna", lingua: "it" },
  pubblico: { livello: "non tecnico", lingua: "it", testate: ["Il Corriere", "La Repubblica"] },
  canali: [{ piattaforma: "tiktok", nome: "annavideo", formato: "verticale" }],
  non_si_dice: ["parolacce", "il nome del mio datore di lavoro"],
}
const stato = (profilo: ProfiloDelCreator, extra: Record<string, unknown> = {}) => ({ valido: true, presente: true, canali: (profilo.canali ?? []).map((c) => ({ piattaforma: c.piattaforma, nome: c.nome })), profilo, problemi: [], ...extra })

let eventi: ReturnType<typeof installaEventi>
let chiamate: Chiamata[]
let imposta: (chiave: string, risposta: unknown) => void

function rete(profilo: unknown, extra: Record<string, unknown> = {}) {
  const finta = installaRete({
    "GET /api/profilo": profilo,
    "GET /api/video": [],
    "GET /api/lavori": { in_corso: null, in_coda: [], finiti: [] },
    "GET /api/registrazione": { disponibile: true, motivo: null, dispositivi: { microfoni: [], camere: [] }, in_corso: null, ultima: null },
    "GET /api/arrivi": { acceso: false, in_ascolto: false, indirizzo: null, qr: null, errore: null, ultimi: [], firewall: "non-controllato", pronto: false, motivo: null, guarda: null, qr_guarda: null, carica: null, qr_carica: null },
    "GET /api/accesso-studio": { acceso: false, in_ascolto: true, casa: null, fuori: null, pronto: true, motivo: null },
    "GET /api/canale/tiktok": { ultima: null, letture: [], profilo: null, video: [] },
    "GET /api/chat": [],
    "GET /api/chat/modelli": [],
    "GET /api/chat/comandi": [],
    "GET /api/stile": stileDiProva(),
    "GET /api/stile/partenza": partenzeDiProva(),
    "GET /api/caratteri": caratteriDiProva(),
    "GET /api/motori": {},
    "GET /api/macchina": {},
    "GET /api/grezzo": [],
    "POST /api/chat": { id: "c1" },
    ...extra,
  })
  chiamate = finta.chiamate
  imposta = finta.imposta
}

// Le copie dei dati vivono nel modulo: ogni prova parte da un modulo nuovo.
async function studio(hash: string, profilo: unknown = stato(PROFILO), extra: Record<string, unknown> = {}) {
  rete(profilo, extra)
  vi.resetModules()
  window.localStorage.setItem("mango-animation.primo-giro", "saltato")
  window.location.hash = hash
  ;(await import("../src/lingua")).scegliLingua("it")
  const { App } = await import("../src/App")
  render(<App />)
}

const schede = () => screen.findByRole("navigation", { name: "Impostazioni" })
const scritture = () => chiamate.filter((c) => c.metodo === "PUT" && c.percorso === "/api/profilo")
const messaggiAClaude = () => chiamate.filter((c) => c.metodo === "POST" && c.percorso === "/api/chat").map((c) => (c.corpo as { testo: string }).testo)

beforeEach(() => {
  eventi = installaEventi()
  delete document.documentElement.dataset.tema
})
afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
  delete window.__MANGO_ANIMATION__
})

describe("le sezioni", () => {
  it("la barra ha «Impostazioni» e non più Stile, Motori, lingua, tema e cartella dei dati", async () => {
    window.__MANGO_ANIMATION__ = { cartellaDati: { leggi: async () => ({ attuale: "C:\\Dati", prossima: null, forzata: false }), sposta: async () => null } }
    await studio("#/video")
    const menu = await screen.findByRole("navigation", { name: "Sezioni" })
    expect(within(menu).getByRole("link", { name: "Impostazioni" })).toHaveAttribute("href", "#/impostazioni")
    expect(screen.queryByRole("link", { name: "Stile" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Motori" })).toBeNull()
    expect(screen.queryByRole("button", { name: /Lingua/ })).toBeNull()
    expect(screen.queryByRole("button", { name: /Tema/ })).toBeNull()
    expect(screen.queryByRole("button", { name: "Cartella dei dati" })).toBeNull()
  })

  it("ha cinque sezioni, la prima è il Profilo, e la voce di barra è accesa", async () => {
    await studio("#/impostazioni")
    const nav = await schede()
    expect(within(nav).getAllByRole("link").map((l) => l.textContent)).toEqual(["Profilo", "Stile", "Computer", "Telefono", "Generali"])
    expect(within(nav).getByRole("link", { name: "Profilo" })).toHaveAttribute("aria-current", "page")
    expect(within(nav).getByRole("link", { name: "Stile" })).toHaveAttribute("href", "#/impostazioni/stile")
    expect(within(screen.getByRole("navigation", { name: "Sezioni" })).getByRole("link", { name: "Impostazioni" })).toHaveAttribute("aria-current", "page")
    expect(await screen.findByRole("heading", { level: 1, name: "Profilo" })).toBeInTheDocument()
  })

  it("#/stile porta alla sezione Stile e #/motori a Computer, con la voce Impostazioni accesa", async () => {
    await studio("#/stile")
    expect(await within(await schede()).findByRole("link", { name: "Stile" })).toHaveAttribute("aria-current", "page")
    expect(await screen.findByRole("heading", { level: 1, name: "Stile" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Impostazioni" })).toHaveAttribute("aria-current", "page")
    document.body.innerHTML = ""
    await studio("#/motori")
    expect(await within(await schede()).findByRole("link", { name: "Computer" })).toHaveAttribute("aria-current", "page")
    expect(await screen.findByRole("heading", { level: 1, name: "Computer" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Impostazioni" })).toHaveAttribute("aria-current", "page")
  })

  it("Telefono ha i codici per collegarlo e lo studio dal telefono; «Collega un telefono» accende la ricezione", async () => {
    await studio("#/impostazioni/telefono", stato(PROFILO), { "PUT /api/arrivi": {} })
    expect(await screen.findByRole("heading", { level: 1, name: "Telefono" })).toBeInTheDocument()
    expect(await screen.findByText(/Spento: il computer non ascolta la rete/)).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Lo studio dal telefono" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Collega un telefono" }))
    await waitFor(() => expect(chiamate.find((c) => c.metodo === "PUT" && c.percorso === "/api/arrivi")?.corpo).toEqual({ acceso: true }))
  })

  it("Telefono con il telefono pronto mostra l'indirizzo, i due codici e «Scollega i telefoni»", async () => {
    const pronto = { acceso: true, in_ascolto: true, indirizzo: "192.168.1.20:47420", qr: SVG, errore: null, ultimi: [{ file: "2026-10-06/20261006-prova.mp4", quando: "2026-10-06T22:28:01", byte: 412_000 }], firewall: "consentito", pronto: true, motivo: null, carica: "http://192.168.1.20:47420/carica?chiave=k", qr_carica: SVG }
    await studio("#/impostazioni/telefono", stato(PROFILO), { "GET /api/arrivi": pronto })
    expect(await screen.findByText("192.168.1.20:47420")).toBeInTheDocument()
    expect(screen.getByAltText(/installare la Scorciatoia/)).toBeInTheDocument()
    expect(screen.getByAltText(/pagina che manda i video/)).toBeInTheDocument()
    expect(screen.getByText("iPhone: la Scorciatoia")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Scollega i telefoni" })).toBeInTheDocument()
  })

  it("Generali: la lingua e il tema si scelgono qui, e la guida è nella lingua scelta", async () => {
    await studio("#/impostazioni/generali")
    expect(await screen.findByRole("heading", { level: 1, name: "Generali" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Apri la guida" })).toHaveAttribute("href", "https://github.com/Federico-Anastasi/mango-animation/blob/main/docs/guida/italiano.md")
    fireEvent.click(screen.getByRole("radio", { name: "Scuro" }))
    expect(document.documentElement.dataset.tema).toBe("scuro")
    expect(screen.getByRole("radio", { name: "Scuro" })).toBeChecked()
    fireEvent.click(screen.getByRole("radio", { name: "English" }))
    expect(await screen.findByRole("link", { name: "Open the guide" })).toHaveAttribute("href", "https://github.com/Federico-Anastasi/mango-animation/blob/main/docs/guida/english.md")
    expect(screen.getByRole("heading", { level: 1, name: "General" })).toBeInTheDocument()
    expect(within(screen.getByRole("navigation", { name: "Sections" })).getByRole("link", { name: "Settings" })).toBeInTheDocument()
    expect(window.localStorage.getItem("mango-animation.lingua")).toBe("en")
  })
})

describe("il profilo", () => {
  it("mostra i campi di profilo.json, con la frase che dice che si può anche dire in chat", async () => {
    await studio("#/impostazioni/profilo")
    expect(await screen.findByLabelText("Il tuo nome")).toHaveValue("Anna")
    expect(screen.getByRole("combobox", { name: "La lingua in cui parli e scrivi" })).toHaveValue("it")
    expect(screen.getByLabelText(/Che livello ha/)).toHaveValue("non tecnico")
    expect(screen.getByLabelText(/Le testate che citi/)).toHaveValue("Il Corriere, La Repubblica")
    expect(screen.getByRole("combobox", { name: "Piattaforma" })).toHaveValue("tiktok")
    expect(screen.getByLabelText("Nome del canale su TikTok")).toHaveValue("annavideo")
    expect(screen.getByRole("combobox", { name: "Formato dei video su TikTok" })).toHaveValue("verticale")
    expect(screen.getByLabelText(/Una cosa per riga/)).toHaveValue("parolacce\nil nome del mio datore di lavoro")
    expect(screen.getByText(/Puoi anche dirlo in chat/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Salva" })).toBeDisabled()
  })

  it("salva le sezioni cambiate: il server le riceve come vuole lo schema, e il form mostra ciò che il server ha", async () => {
    await studio("#/impostazioni/profilo", stato(PROFILO), { "PUT /api/profilo": () => stato({ ...PROFILO, creator: { nome: "Anna Rossi", lingua: "it" } }) })
    fireEvent.change(await screen.findByLabelText("Il tuo nome"), { target: { value: "Anna Rossi" } })
    fireEvent.change(screen.getByLabelText(/Le testate che citi/), { target: { value: "Il Corriere, , La Stampa" } })
    fireEvent.change(screen.getByLabelText(/Una cosa per riga/), { target: { value: "parolacce\n\n  politica  \n" } })
    imposta("GET /api/profilo", stato({ ...PROFILO, creator: { nome: "Anna Rossi", lingua: "it" } }))
    fireEvent.click(screen.getByRole("button", { name: "Salva" }))
    await waitFor(() => expect(scritture()).toHaveLength(1))
    expect(scritture()[0]!.corpo).toEqual({
      creator: { nome: "Anna Rossi", lingua: "it" },
      pubblico: { livello: "non tecnico", lingua: "it", testate: ["Il Corriere", "La Stampa"] },
      canali: [{ piattaforma: "tiktok", nome: "annavideo", formato: "verticale" }],
      non_si_dice: ["parolacce", "politica"],
    })
    expect(await screen.findByText("Salvato")).toBeInTheDocument()
    expect(screen.getByLabelText("Il tuo nome")).toHaveValue("Anna Rossi")
  })

  it("un campo svuotato toglie la sua sezione: il server riceve null", async () => {
    await studio("#/impostazioni/profilo", stato(PROFILO), { "PUT /api/profilo": () => stato({ creator: PROFILO.creator }) })
    fireEvent.change(await screen.findByLabelText(/Una cosa per riga/), { target: { value: "" } })
    fireEvent.click(screen.getByRole("button", { name: "Togli il canale TikTok" }))
    for (const campo of [/Che livello ha/, /Le testate che citi/]) fireEvent.change(screen.getByLabelText(campo), { target: { value: "" } })
    fireEvent.change(screen.getByRole("combobox", { name: "La lingua del pubblico" }), { target: { value: "" } })
    fireEvent.click(screen.getByRole("button", { name: "Salva" }))
    await waitFor(() => expect(scritture()).toHaveLength(1))
    expect(scritture()[0]!.corpo).toEqual({ creator: { nome: "Anna", lingua: "it" }, pubblico: null, canali: null, non_si_dice: null })
  })

  it("si aggiunge un canale e si sceglie la piattaforma", async () => {
    await studio("#/impostazioni/profilo", stato({ creator: { nome: "Anna" } }), { "PUT /api/profilo": () => stato({ creator: { nome: "Anna" } }) })
    fireEvent.click(await screen.findByRole("button", { name: "Aggiungi un canale" }))
    fireEvent.change(screen.getByRole("combobox", { name: "Piattaforma" }), { target: { value: "youtube" } })
    fireEvent.change(screen.getByLabelText("Nome del canale su YouTube"), { target: { value: "anna" } })
    fireEvent.click(screen.getByRole("button", { name: "Salva" }))
    await waitFor(() => expect(scritture()).toHaveLength(1))
    expect(scritture()[0]!.corpo).toMatchObject({ canali: [{ piattaforma: "youtube", nome: "anna" }] })
  })

  it("se il server rifiuta (schema) dice cosa non va, il form resta com'è scritto e non dice «Salvato»", async () => {
    await studio("#/impostazioni/profilo", stato(PROFILO), { "PUT /api/profilo": errore(400, "Il profilo non è valido: creator.nome: non può essere vuoto", { problemi: ["creator.nome: non può essere vuoto"] }) })
    fireEvent.change(await screen.findByLabelText("Il tuo nome"), { target: { value: "" } })
    fireEvent.click(screen.getByRole("button", { name: "Salva" }))
    const avviso = await screen.findByRole("alert")
    expect(avviso).toHaveTextContent("Il profilo non è valido: creator.nome: non può essere vuoto")
    expect(screen.getByLabelText("Il tuo nome")).toHaveValue("")
    expect(screen.queryByText("Salvato")).toBeNull()
    expect(screen.getByRole("button", { name: "Salva" })).toBeEnabled()
    // Si corregge e si riprova: la frase di prima non resta.
    imposta("PUT /api/profilo", stato(PROFILO))
    fireEvent.change(screen.getByLabelText("Il tuo nome"), { target: { value: "Anna B" } })
    fireEvent.click(screen.getByRole("button", { name: "Salva" }))
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull())
    expect(scritture()).toHaveLength(2)
  })

  it("«Annulla le modifiche» torna a ciò che c'è nel profilo", async () => {
    await studio("#/impostazioni/profilo")
    fireEvent.change(await screen.findByLabelText("Il tuo nome"), { target: { value: "Altro" } })
    fireEvent.click(screen.getByRole("button", { name: "Annulla le modifiche" }))
    expect(screen.getByLabelText("Il tuo nome")).toHaveValue("Anna")
    expect(scritture()).toHaveLength(0)
  })

  it("ciò che la chat scrive si vede qui: senza modifiche in corso il form segue il profilo", async () => {
    await studio("#/impostazioni/profilo")
    expect(await screen.findByLabelText("Il tuo nome")).toHaveValue("Anna")
    imposta("GET /api/profilo", stato({ ...PROFILO, creator: { nome: "Anna Maria", lingua: "it" } }))
    eventi.istanze.at(-1)!.manda({ tipo: "profilo" })
    await waitFor(() => expect(screen.getByLabelText("Il tuo nome")).toHaveValue("Anna Maria"))
  })

  it("se il profilo cambia mentre lo si modifica, lo dice e non lo perde in silenzio: si può ricaricare", async () => {
    await studio("#/impostazioni/profilo")
    fireEvent.change(await screen.findByLabelText("Il tuo nome"), { target: { value: "Mia modifica" } })
    imposta("GET /api/profilo", stato({ ...PROFILO, creator: { nome: "Della chat", lingua: "it" } }))
    eventi.istanze.at(-1)!.manda({ tipo: "profilo" })
    expect(await screen.findByText(/Il profilo è cambiato mentre lo modificavi/)).toBeInTheDocument()
    expect(screen.getByLabelText("Il tuo nome")).toHaveValue("Mia modifica")
    fireEvent.click(screen.getByRole("button", { name: "Ricarica dal profilo" }))
    expect(screen.getByLabelText("Il tuo nome")).toHaveValue("Della chat")
    expect(screen.queryByText(/Il profilo è cambiato mentre lo modificavi/)).toBeNull()
  })

  it("una lingua che lo studio non conosce resta com'è scritta nel profilo", async () => {
    await studio("#/impostazioni/profilo", stato({ creator: { nome: "Ana", lingua: "es" } }), { "PUT /api/profilo": () => stato({ creator: { nome: "Ana B", lingua: "es" } }) })
    expect(await screen.findByRole("combobox", { name: "La lingua in cui parli e scrivi" })).toHaveValue("es")
    fireEvent.change(screen.getByLabelText("Il tuo nome"), { target: { value: "Ana B" } })
    fireEvent.click(screen.getByRole("button", { name: "Salva" }))
    await waitFor(() => expect(scritture()[0]!.corpo).toMatchObject({ creator: { nome: "Ana B", lingua: "es" } }))
  })

  it("con TikTok fra i canali c'è «Leggi i dati di TikTok», che manda la richiesta alla chat; senza TikTok dice che per ora c'è solo quello", async () => {
    await studio("#/impostazioni/profilo")
    fireEvent.click(await screen.findByRole("button", { name: "Leggi i dati di TikTok" }))
    await waitFor(() => expect(messaggiAClaude()).toEqual(["Aggiorna i dati di TikTok."]))
    document.body.innerHTML = ""
    await studio("#/impostazioni/profilo", stato({ creator: { nome: "Anna" }, canali: [{ piattaforma: "instagram", nome: "anna" }] }))
    expect(await screen.findByText("Per ora i numeri del canale si leggono solo da TikTok.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Leggi i dati di TikTok" })).toBeNull()
  })

  it("senza profilo c'è solo il primo giro, non il modulo: compilarlo a mano farebbe risultare fatto un giro mai fatto", async () => {
    const modelli = [{ id: "opus", nome: "Opus 5.5", descrizione: "", effort: [], reale: "claude-opus-5-5" }]
    await studio("#/impostazioni/profilo", stato({}, { presente: false }), { "GET /api/chat/modelli": modelli })
    expect(await screen.findByRole("button", { name: "Fai il primo giro" })).toBeInTheDocument()
    expect(screen.queryByLabelText("Il tuo nome")).toBeNull()
    expect(screen.queryByRole("button", { name: "Salva" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Fai il primo giro" }))
    await waitFor(() => expect(messaggiAClaude()[0]).toMatch(/Facciamo il primo giro/))
    // Parte con Opus, come il giro che si apre da solo.
    expect(chiamate.find((c) => c.metodo === "POST" && c.percorso === "/api/chat")?.corpo).toMatchObject({ modello: "opus" })
  })

  it("un profilo che non passa lo schema non si modifica da qui: dice di correggerlo, e il motivo sta sotto la barra", async () => {
    await studio("#/impostazioni/profilo", { valido: false, presente: true, canali: [], profilo: {}, problemi: ["creator.lingua: deve essere un testo"] })
    expect(await screen.findByText(/Il profilo non passa il controllo/)).toBeInTheDocument()
    expect(screen.getByText("creator.lingua: deve essere un testo")).toBeInTheDocument()
    expect(screen.queryByLabelText("Il tuo nome")).toBeNull()
    expect(screen.queryByRole("button", { name: "Salva" })).toBeNull()
  })

  it("in inglese i testi sono inglesi", async () => {
    window.localStorage.setItem("mango-animation.lingua", "en")
    rete(stato(PROFILO))
    vi.resetModules()
    window.localStorage.setItem("mango-animation.primo-giro", "saltato")
    window.location.hash = "#/impostazioni/profilo"
    const { App } = await import("../src/App")
    render(<App />)
    expect(await screen.findByLabelText("Your name")).toHaveValue("Anna")
    expect(screen.getByText(/You can also say it in the chat/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled()
    expect(screen.getByRole("combobox", { name: "Video format on TikTok" })).toHaveValue("verticale")
    expect(within(screen.getByRole("navigation", { name: "Settings" })).getAllByRole("link").map((l) => l.textContent)).toEqual(["Profile", "Style", "Computer", "Phone", "General"])
    expect(screen.queryByText("Il tuo nome")).toBeNull()
  })
})
