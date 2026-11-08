import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Cornice } from "../src/cornice/Cornice"
import { ControlloVideo } from "../src/video/ControlloVideo"
import { ElencoVideo } from "../src/video/ElencoVideo"
import { FileVideo, percorsoDellUscita } from "../src/video/FileVideo"
import { CopertinaVideo } from "../src/video/CopertinaVideo"
import { PaginaVideo } from "../src/video/PaginaVideo"
import { SchedaDelVideo } from "../src/video/SchedaDelVideo"
import { Girato } from "../src/girato/Girato"
import { PaginaStile } from "../src/stile/PaginaStile"
import type { FileGrezzo, Lavoro, Scheda, StatoLavori, VoceElenco } from "../src/tipi"
import { conUscite, dettaglioDiProva, stileDiProva } from "./fixture"
import { errore, installaEventi, installaRete, type Chiamata } from "./rete"

let chiamate: Chiamata[]
let eventi: ReturnType<typeof installaEventi>

const scheda = (extra: Partial<Scheda> = {}): Scheda => ({ titolo: "Un video", stato: "in lavorazione", creato: "2026-10-06", ...extra })
const voce = (slug: string, extra: Partial<Scheda> = {}, resto: Partial<VoceElenco> = {}): VoceElenco => ({
  slug,
  scheda: scheda({ titolo: `Video ${slug}`, ...extra }),
  durata: 12.5,
  miniatura: null,
  anteprima: null,
  ha_piano: true,
  ha_finale: true,
  ultimo_cambio: "2026-10-09T10:00:00",
  ...resto,
})

const nessunConsumo = { pronto: true, video: {}, senza_video: { tempo: 0, giri: 0, token: { scritti: 0, riletti: 0, nuovi: 0 } } }

const registrazioneFerma = { disponibile: true, motivo: null, dispositivi: { microfoni: ["Microfono di prova"], camere: ["Camera di prova"] }, in_corso: null, ultima: null }

function rete(rotte: Record<string, unknown>) {
  chiamate = installaRete({ "GET /api/consumi": nessunConsumo, "GET /api/registrazione": registrazioneFerma, "GET /api/lavori": { in_corso: null, in_coda: [], finiti: [] }, "GET /api/arrivi": { in_ascolto: false, indirizzo: null, qr: null, errore: null, ultimi: [], firewall: "bloccato", pronto: false, motivo: "Windows blocca il programma: sbloccalo in Sicurezza di Windows." }, "POST /api/arrivi/controlla": {}, "GET /api/accesso-studio": { acceso: false, in_ascolto: true, casa: null, fuori: null, pronto: true, motivo: null }, ...rotte }).chiamate
}

beforeEach(() => {
  eventi = installaEventi()
  window.location.hash = ""
})
afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.removeItem("mango-animation.registra.microfono")
  localStorage.removeItem("mango-animation.registra.camera")
})

describe("l'elenco dei video", () => {
  const elenco = [
    voce("uno", { stato: "in lavorazione", serie: "ricette" }),
    voce("due", { stato: "proposta" }, { durata: null, ha_finale: false, ha_piano: false }),
    voce("tre", { stato: "pubblicato", pubblicazioni: [{ canale: "tiktok", data: "2026-10-07T13:15" }], numeri: [{ data: "2026-10-08", canale: "tiktok", visualizzazioni: 1240 }, { data: "2026-10-09", canale: "tiktok", visualizzazioni: 1810 }, { data: "2026-10-09", canale: "shorts", visualizzazioni: 530 }] }),
    voce("quattro", { stato: "scartato" }),
  ]

  it("raggruppa per stato, con l'ultimo dato dei numeri per canale e gli scartati chiusi", async () => {
    rete({ "GET /api/video": elenco })
    render(<ElencoVideo />)
    expect(await screen.findByRole("heading", { name: "In lavorazione" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Proposte" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Pubblicati" })).toBeInTheDocument()
    expect(screen.getByText("non ancora montato")).toBeInTheDocument()
    expect(screen.getByText("1.810 visualizzazioni su tiktok")).toBeInTheDocument()
    expect(screen.getByText("530 visualizzazioni su shorts")).toBeInTheDocument()
    expect(screen.getByText(/uscito il 7 ott 2026/)).toBeInTheDocument()
    const scartati = screen.getByRole("heading", { name: "Scartati" }).closest("details")!
    expect(scartati).not.toHaveAttribute("open")
    expect(screen.getByRole("link", { name: /Video uno/ })).toHaveAttribute("href", "#/video/uno")
  })

  it("una proposta senza anteprima lo dice con un segno discreto; con l'anteprima non lo dice, e gli altri stati nemmeno", async () => {
    const file = "video/vestita/materiali/anteprima.png"
    rete({
      "GET /api/video": [
        voce("nuda", { stato: "proposta" }, { anteprima: null }),
        voce("vestita", { stato: "proposta" }, { anteprima: file, miniatura: file }),
        voce("girata", { stato: "proposta" }, { anteprima: null, miniatura: "preparati/2026-10-06/a.mp4/miniatura.jpg" }),
        voce("lavoro", { stato: "in lavorazione" }, { anteprima: null }),
      ],
    })
    render(<ElencoVideo />)
    const carta = async (titolo: RegExp) => within(await screen.findByRole("link", { name: titolo }))
    expect((await carta(/Video nuda/)).getByText("senza anteprima")).toBeInTheDocument()
    expect((await carta(/Video girata/)).getByText("senza anteprima")).toBeInTheDocument()
    expect((await carta(/Video vestita/)).queryByText("senza anteprima")).toBeNull()
    expect((await carta(/Video lavoro/)).queryByText("senza anteprima")).toBeNull()
  })

  it("la miniatura porta nell'indirizzo la data dell'ultimo cambio, così una anteprima rifatta si ricarica", async () => {
    const file = "video/v/materiali/anteprima.png"
    let dati = [voce("v", { stato: "proposta" }, { anteprima: file, miniatura: file, ultimo_cambio: "2026-11-03T10:00:00" })]
    rete({ "GET /api/video": () => dati })
    const { container } = render(<ElencoVideo />)
    await screen.findByRole("link", { name: /Video v/ })
    expect(container.querySelector("img")).toHaveAttribute("src", `/media/${file}?v=2026-11-03T10%3A00%3A00`)
    dati = [{ ...dati[0]!, ultimo_cambio: "2026-11-03T11:30:00" }]
    act(() => eventi.istanze[0]!.manda({ tipo: "video", slug: "v", cosa: "materiali" }))
    await waitFor(() => expect(container.querySelector("img")).toHaveAttribute("src", `/media/${file}?v=2026-11-03T11%3A30%3A00`))
  })

  it("cerca per titolo e filtra per serie", async () => {
    rete({ "GET /api/video": elenco })
    render(<ElencoVideo />)
    await screen.findByRole("heading", { name: "In lavorazione" })
    fireEvent.change(screen.getByPlaceholderText("Cerca per titolo"), { target: { value: "tre" } })
    expect(screen.queryByRole("link", { name: /Video uno/ })).toBeNull()
    expect(screen.getByRole("link", { name: /Video tre/ })).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText("Cerca per titolo"), { target: { value: "" } })
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "ricette" } })
    expect(screen.queryByRole("link", { name: /Video tre/ })).toBeNull()
    expect(screen.getByRole("link", { name: /Video uno/ })).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText("Cerca per titolo"), { target: { value: "zzz" } })
    expect(screen.getByText(/Nessun video corrisponde alla ricerca/)).toBeInTheDocument()
  })

  it("in ogni gruppo mette prima le priorità, dalla più alta, poi gli altri dal più recente", async () => {
    rete({
      "GET /api/video": [
        voce("recente", { stato: "proposta" }, { ultimo_cambio: "2026-10-20T10:00:00" }),
        voce("seconda", { stato: "proposta", priorita: 2 }, { ultimo_cambio: "2026-10-01T10:00:00" }),
        voce("vecchio", { stato: "proposta" }, { ultimo_cambio: "2026-10-02T10:00:00" }),
        voce("prima", { stato: "proposta", priorita: 1 }, { ultimo_cambio: "2026-09-01T10:00:00" }),
      ],
    })
    render(<ElencoVideo />)
    const proposte = (await screen.findByRole("heading", { name: "Proposte" })).closest("section")!
    expect(within(proposte).getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual(["#/video/prima", "#/video/seconda", "#/video/recente", "#/video/vecchio"])
  })

  it("un video nuovo si chiede nella chat: l'elenco lo dice, senza bottoni che scrivono nella chat", async () => {
    rete({ "GET /api/video": elenco })
    render(<ElencoVideo />)
    await screen.findByRole("heading", { name: "In lavorazione" })
    expect(screen.getByText("Per un video nuovo, chiedilo nella chat.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Nuovo video|chat|Claude/ })).toBeNull()
  })

  it("un messaggio del server rilegge l'elenco, e se è vuoto dice cosa fare", async () => {
    let dati: VoceElenco[] = []
    rete({ "GET /api/video": () => dati })
    render(<ElencoVideo />)
    expect(await screen.findByText(/Non c'è ancora nessun video/)).toBeInTheDocument()
    dati = [voce("uno")]
    act(() => eventi.istanze[0]!.manda({ tipo: "video", slug: "uno", cosa: "nuovo" }))
    expect(await screen.findByRole("link", { name: /Video uno/ })).toBeInTheDocument()
  })

  it("se il server non risponde lo dice con il suo errore", async () => {
    rete({ "GET /api/video": errore(500, "Il server è occupato.") })
    render(<ElencoVideo />)
    expect(await screen.findByRole("alert")).toHaveTextContent("Il server è occupato.")
  })
})

describe("la pagina di un video", () => {
  it("mostra titolo, stato, il bottone della cartella senza il percorso, e le cinque schede con il loro indirizzo", async () => {
    rete({ "GET /api/video/prova": dettaglioDiProva(), "GET /api/stile": stileDiProva(), "GET /api/grezzo": [], "GET /api/animazioni": {} })
    render(<PaginaVideo slug="prova" scheda="scheda" parametri={new URLSearchParams()} />)
    expect(await screen.findByLabelText("Titolo del video")).toHaveValue("Un video di prova")
    expect(screen.getByRole("combobox", { name: /Stato/ })).toHaveValue("in lavorazione")
    expect(screen.getByRole("button", { name: /Apri la cartella/ })).toBeInTheDocument()
    expect(screen.queryByText("C:\\archivio\\video\\prova")).not.toBeInTheDocument()
    const nomi = within(screen.getByRole("navigation", { name: "Schede del video" })).getAllByRole("link")
    expect(nomi.map((a) => a.textContent)).toEqual(["Montaggio", "Scheda", "Controllo", "Copertina", "File"])
    expect(nomi[1]).toHaveAttribute("aria-current", "page")
    expect(nomi[2]).toHaveAttribute("href", "#/video/prova/controllo")
  })

  it("il titolo si cambia sul posto e lo stato da un menu: la scheda intera va al server", async () => {
    rete({ "GET /api/video/prova": dettaglioDiProva(), "PUT /api/video/prova/scheda": {} })
    render(<PaginaVideo slug="prova" scheda="file" parametri={new URLSearchParams()} />)
    const titolo = await screen.findByLabelText("Titolo del video")
    fireEvent.change(titolo, { target: { value: "Un altro titolo" } })
    fireEvent.blur(titolo)
    await waitFor(() => expect(chiamate.filter((c) => c.metodo === "PUT")).toHaveLength(1))
    expect(chiamate.find((c) => c.metodo === "PUT")?.corpo).toMatchObject({ titolo: "Un altro titolo", stato: "in lavorazione", creato: "2026-10-06" })
    fireEvent.change(screen.getByRole("combobox", { name: /Stato/ }), { target: { value: "pronto" } })
    await waitFor(() => expect(chiamate.filter((c) => c.metodo === "PUT")).toHaveLength(2))
    expect(chiamate.filter((c) => c.metodo === "PUT")[1]!.corpo).toMatchObject({ stato: "pronto" })
  })

  it("se il server rifiuta lo stato, la sua frase compare", async () => {
    rete({ "GET /api/video/prova": dettaglioDiProva(), "PUT /api/video/prova/scheda": errore(400, "Un video pubblicato ha almeno una pubblicazione.") })
    render(<PaginaVideo slug="prova" scheda="file" parametri={new URLSearchParams()} />)
    fireEvent.change(await screen.findByRole("combobox", { name: /Stato/ }), { target: { value: "pubblicato" } })
    expect(await screen.findByRole("alert")).toHaveTextContent("Un video pubblicato ha almeno una pubblicazione.")
  })

  it("un titolo vuoto non parte", async () => {
    rete({ "GET /api/video/prova": dettaglioDiProva() })
    render(<PaginaVideo slug="prova" scheda="file" parametri={new URLSearchParams()} />)
    const titolo = await screen.findByLabelText("Titolo del video")
    fireEvent.change(titolo, { target: { value: "  " } })
    fireEvent.blur(titolo)
    expect(await screen.findByRole("alert")).toHaveTextContent("Il titolo non può restare vuoto.")
    expect(chiamate.some((c) => c.metodo === "PUT")).toBe(false)
  })

  it("un video che non c'è dice perché", async () => {
    rete({ "GET /api/video/fantasma": errore(404, "Questo video non c'è. Torna all'elenco.") })
    render(<PaginaVideo slug="fantasma" scheda="scheda" parametri={new URLSearchParams()} />)
    expect(await screen.findByRole("alert")).toHaveTextContent("Questo video non c'è.")
  })

  it("una proposta senza montato si toglie solo dopo la conferma", async () => {
    rete({ "GET /api/video/prova": { ...dettaglioDiProva(), scheda: scheda({ stato: "proposta" }) }, "DELETE /api/video/prova": {} })
    render(<PaginaVideo slug="prova" scheda="scheda" parametri={new URLSearchParams()} />)
    fireEvent.click(await screen.findByRole("button", { name: /Togli la proposta/ }))
    expect(screen.getByRole("alertdialog", { name: "Conferma" })).toHaveTextContent("La proposta si toglie per sempre dall'archivio. Vuoi toglierla?")
    fireEvent.click(screen.getByRole("button", { name: "No, tienila" }))
    expect(chiamate.some((c) => c.metodo === "DELETE")).toBe(false)
    fireEvent.click(screen.getByRole("button", { name: /Togli la proposta/ }))
    fireEvent.click(screen.getByRole("button", { name: "Sì, toglila" }))
    await waitFor(() => expect(chiamate.some((c) => c.metodo === "DELETE" && c.percorso === "/api/video/prova")).toBe(true))
    await waitFor(() => expect(window.location.hash).toBe("#/video"))
  })

  it("la conferma dice cosa c'è nella cartella, anche l'anteprima", async () => {
    const materiali = ["anteprima.png", "appunti.md", "pagina.png"].map((f) => ({ file: `video/prova/materiali/${f}`, byte: 10 }))
    const uscite = conUscite([{ file: "video/prova/uscite/prova.mp4", byte: 10, cambiato: "2026-10-09T09:00:00" }])
    rete({ "GET /api/video/prova": { ...dettaglioDiProva(), scheda: scheda({ stato: "proposta" }), materiali, ...uscite } })
    render(<PaginaVideo slug="prova" scheda="scheda" parametri={new URLSearchParams()} />)
    fireEvent.click(await screen.findByRole("button", { name: /Togli la proposta/ }))
    expect(screen.getByRole("alertdialog", { name: "Conferma" })).toHaveTextContent(
      "La proposta si toglie per sempre dall'archivio, e con lei 3 file nei materiali (anche l'anteprima) e 1 file nelle uscite. Vuoi toglierla?",
    )
  })

  it("un video già in lavorazione non offre di togliersi", async () => {
    rete({ "GET /api/video/prova": dettaglioDiProva() })
    render(<PaginaVideo slug="prova" scheda="scheda" parametri={new URLSearchParams()} />)
    await screen.findByLabelText("Titolo del video")
    expect(screen.queryByRole("button", { name: /Togli la proposta/ })).toBeNull()
  })

  it("«Apri la cartella» chiede al server di mostrarla", async () => {
    rete({ "GET /api/video/prova": dettaglioDiProva(), "POST /api/apri": {} })
    render(<PaginaVideo slug="prova" scheda="file" parametri={new URLSearchParams()} />)
    fireEvent.click(await screen.findByRole("button", { name: /Apri la cartella/ }))
    await waitFor(() => expect(chiamate.find((c) => c.percorso === "/api/apri")?.corpo).toEqual({ percorso: "video/prova" }))
  })
})

describe("la prova di un video", () => {
  const FILE = "video/prova/uscite/prova.mp4"
  const conProva = (extra: Partial<ReturnType<typeof dettaglioDiProva>> = {}) => ({ ...dettaglioDiProva(), ...conUscite([{ file: FILE, byte: 24_000_000, cambiato: "2026-10-27T14:37:00" }]), ...extra })
  const senzaPiano = { piano: null, piano_risolto_da_base: null, risolto: null }
  const schede = async () => within(await screen.findByRole("navigation", { name: "Schede del video" })).getAllByRole("link")

  it("senza prova non c'è la scheda Prova", async () => {
    rete({ "GET /api/video/prova": dettaglioDiProva(), "GET /api/stile": stileDiProva(), "GET /api/grezzo": [], "GET /api/animazioni": {} })
    render(<PaginaVideo slug="prova" scheda={null} parametri={new URLSearchParams()} />)
    expect((await schede()).map((a) => a.textContent)).toEqual(["Montaggio", "Scheda", "Controllo", "Copertina", "File"])
  })

  it("con la prova la scheda Prova viene prima di Montaggio; senza una scheda scelta un video col piano apre il Montaggio", async () => {
    rete({ "GET /api/video/prova": conProva(), "GET /api/stile": stileDiProva(), "GET /api/grezzo": [], "GET /api/animazioni": {} })
    render(<PaginaVideo slug="prova" scheda={null} parametri={new URLSearchParams()} />)
    const nomi = await schede()
    expect(nomi.map((a) => a.textContent)).toEqual(["Prova", "Montaggio", "Scheda", "Controllo", "Copertina", "File"])
    expect(nomi[0]).toHaveAttribute("href", "#/video/prova/prova")
    expect(nomi[1]).toHaveAttribute("aria-current", "page")
  })

  it("un video senza piano ma con la prova apre la Prova, col video e la riga che dice cos'è", async () => {
    rete({ "GET /api/video/prova": conProva(senzaPiano) })
    const { container } = render(<PaginaVideo slug="prova" scheda={null} parametri={new URLSearchParams()} />)
    const nomi = await schede()
    expect(nomi[0]).toHaveAttribute("aria-current", "page")
    expect(await screen.findByText("Le animazioni con la battuta da dire, per registrare")).toBeInTheDocument()
    const video = container.querySelector("video")!
    expect(video.getAttribute("src")).toContain(`/media/${FILE}`)
    expect(video.hasAttribute("controls")).toBe(true)
  })

  it("scegliendo il Montaggio a mano, anche senza piano, non si torna alla Prova", async () => {
    rete({ "GET /api/video/prova": conProva(senzaPiano) })
    render(<PaginaVideo slug="prova" scheda="montaggio" parametri={new URLSearchParams()} />)
    const nomi = await schede()
    expect(nomi.find((a) => a.getAttribute("aria-current") === "page")?.textContent).toBe("Montaggio")
    expect(screen.queryByText("Le animazioni con la battuta da dire, per registrare")).not.toBeInTheDocument()
  })

  it("chiedere la Prova a un video che non l'ha porta alla scheda di partenza", async () => {
    rete({ "GET /api/video/prova": dettaglioDiProva(), "GET /api/stile": stileDiProva(), "GET /api/grezzo": [], "GET /api/animazioni": {} })
    render(<PaginaVideo slug="prova" scheda="prova" parametri={new URLSearchParams()} />)
    expect((await schede()).find((a) => a.getAttribute("aria-current") === "page")?.textContent).toBe("Montaggio")
  })
})

describe("un carosello", () => {
  const slide = (n: number) => ({ file: `video/prova/uscite/slide-${n}.png`, byte: 1000, cambiato: "2026-10-25T17:00:00" })
  const carosello = (uscite = [slide(10), slide(2), slide(1)]) => ({
    ...dettaglioDiProva(),
    scheda: { titolo: "Un carosello", stato: "proposta" as const, creato: "2026-10-25", formato: "carosello" as const },
    piano: null,
    piano_risolto_da_base: null,
    risolto: null,
    ...conUscite([...uscite, { file: "video/prova/uscite/note.txt", byte: 10, cambiato: "2026-10-25T17:00:00" }]),
  })

  it("ha le schede Slide, Scheda, File, e senza scheda scelta apre le slide", async () => {
    rete({ "GET /api/video/prova": carosello() })
    render(<PaginaVideo slug="prova" scheda={null} parametri={new URLSearchParams()} />)
    const nomi = within(await screen.findByRole("navigation", { name: "Schede del video" })).getAllByRole("link")
    expect(nomi.map((a) => a.textContent)).toEqual(["Slide", "Scheda", "File"])
    expect(nomi[0]).toHaveAttribute("aria-current", "page")
    expect(nomi[0]).toHaveAttribute("href", "#/video/prova/slide")
  })

  it("mostra le slide in ordine, una grande alla volta, e si scorrono coi bottoni, le frecce e le miniature", async () => {
    rete({ "GET /api/video/prova": carosello() })
    render(<PaginaVideo slug="prova" scheda="slide" parametri={new URLSearchParams()} />)
    const grande = await screen.findByRole("img", { name: "Slide 1 di 3" })
    expect(grande.getAttribute("src")).toContain("/media/video/prova/uscite/slide-1.png?v=")
    const miniature = within(screen.getByRole("list", { name: "Tutte le slide" })).getAllByRole("button")
    expect(miniature.map((b) => b.getAttribute("aria-label"))).toEqual(["Slide 1", "Slide 2", "Slide 10"])
    expect(screen.getByRole("button", { name: "Slide precedente" })).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "Slide successiva" }))
    expect(screen.getByRole("img", { name: "Slide 2 di 3" })).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole("region", { name: "Le slide" }), { key: "ArrowRight" })
    expect(screen.getByRole("img", { name: "Slide 3 di 3" }).getAttribute("src")).toContain("slide-10.png")
    expect(screen.getByRole("button", { name: "Slide successiva" })).toBeDisabled()
    fireEvent.click(miniature[0]!)
    expect(screen.getByRole("img", { name: "Slide 1 di 3" })).toBeInTheDocument()
    expect(miniature[0]).toHaveAttribute("aria-current", "true")
  })

  it("senza slide dice di chiederle nella chat, senza bottoni che scrivono nella chat", async () => {
    rete({ "GET /api/video/prova": carosello([]) })
    render(<PaginaVideo slug="prova" scheda="slide" parametri={new URLSearchParams()} />)
    expect(await screen.findByText("Le slide non ci sono ancora. Per scriverle e renderle, chiedilo nella chat: compaiono qui.")).toBeInTheDocument()
    expect(screen.queryByText(/Claude/)).toBeNull()
    expect(screen.queryByRole("button", { name: /Rendi|Scrivi|chat|Claude/ })).toBeNull()
  })

  describe("rendere le slide", () => {
    const lavoro = (extra: Partial<Lavoro>): Lavoro => ({ id: "a1", slug: "prova", comando: "carosello", ...extra })
    const finito = (extra: Partial<Lavoro>) => lavoro({ iniziato: "2026-11-02T10:00:00", finito: "2026-11-02T10:00:20", esito: "riuscito", ...extra })

    it("rendere di nuovo le slide si chiede nella chat: la scheda lo dice, senza bottoni né lavori", async () => {
      rete({ "GET /api/video/prova": carosello() })
      render(<PaginaVideo slug="prova" scheda="slide" parametri={new URLSearchParams()} />)
      await screen.findByRole("img", { name: "Slide 1 di 3" })
      expect(screen.getByText("Per rendere di nuovo le slide, chiedilo nella chat.")).toBeInTheDocument()
      expect(screen.queryByRole("button", { name: /Rendi|chat|Claude/ })).toBeNull()
      expect(chiamate.find((c) => c.metodo === "POST")).toBeUndefined()
    })

    it("mentre il lavoro è in coda o in corso lo dice al posto della scritta; un lavoro di un altro video non conta", async () => {
      const scritta = "Per rendere di nuovo le slide, chiedilo nella chat."
      let stato: StatoLavori = { in_corso: null, in_coda: [lavoro({ slug: "altro" })], finiti: [] }
      rete({ "GET /api/video/prova": carosello(), "GET /api/lavori": () => stato })
      render(<PaginaVideo slug="prova" scheda="slide" parametri={new URLSearchParams()} />)
      expect(await screen.findByText(scritta)).toBeInTheDocument()
      stato = { in_corso: null, in_coda: [lavoro({})], finiti: [] }
      act(() => eventi.istanze[0]!.manda({ tipo: "lavori" }))
      expect(await screen.findByText("Le slide sono in attesa di essere rese.")).toBeInTheDocument()
      expect(screen.queryByText(scritta)).toBeNull()
      stato = { in_corso: lavoro({ iniziato: "2026-11-02T10:00:00" }), in_coda: [], finiti: [] }
      act(() => eventi.istanze[0]!.manda({ tipo: "lavori" }))
      expect(await screen.findByText("Sto rendendo le slide…")).toBeInTheDocument()
      stato = { in_corso: null, in_coda: [], finiti: [finito({ righe: ["3 slide in uscite/, avvisi: 0"] })] }
      act(() => eventi.istanze[0]!.manda({ tipo: "lavori" }))
      await waitFor(() => expect(screen.queryByText("Sto rendendo le slide…")).toBeNull())
      expect(screen.getByText(scritta)).toBeInTheDocument()
    })

    it("alla fine mostra gli avvisi dell'ultimo lavoro di questo video; ognuno porta alla sua slide", async () => {
      const stato: StatoLavori = {
        in_corso: null,
        in_coda: [],
        finiti: [
          finito({ id: "z", slug: "altro", righe: ["attenzione: slide 1: «di un altro video» non si carica"] }),
          finito({ id: "b", righe: ["attenzione: slide 2: «Il basilico» nel lato sinistro, che il telefono taglia", "attenzione: pagina: «x» non si carica", "3 slide in uscite/, avvisi: 2"] }),
          finito({ id: "a", righe: ["attenzione: slide 1: «vecchio avviso» nella zona della didascalia", "3 slide in uscite/, avvisi: 1"] }),
        ],
      }
      rete({ "GET /api/video/prova": carosello(), "GET /api/lavori": stato })
      render(<PaginaVideo slug="prova" scheda="slide" parametri={new URLSearchParams()} />)
      const avvisi = await screen.findByRole("list", { name: "Avvisi delle slide" })
      expect(within(avvisi).getAllByRole("listitem").map((l) => l.textContent)).toEqual(["Slide 2: «Il basilico» nel lato sinistro, che il telefono taglia", "Pagina: «x» non si carica"])
      fireEvent.click(within(avvisi).getByRole("button", { name: /Slide 2/ }))
      expect(screen.getByRole("img", { name: "Slide 2 di 3" })).toBeInTheDocument()
      expect(within(avvisi).queryByRole("button", { name: /Pagina/ })).toBeNull()
    })

    it("se non ce ne sono dice «Nessun avviso»; se il lavoro è fallito, dice perché", async () => {
      const stato: StatoLavori = { in_corso: null, in_coda: [], finiti: [finito({ righe: ["3 slide in uscite/, avvisi: 0"] })] }
      rete({ "GET /api/video/prova": carosello(), "GET /api/lavori": () => stato })
      render(<PaginaVideo slug="prova" scheda="slide" parametri={new URLSearchParams()} />)
      expect(await screen.findByText("Nessun avviso")).toBeInTheDocument()
      stato.finiti = [finito({ esito: "fallito", errore: "manca il file delle slide", righe: [] })]
      act(() => eventi.istanze[0]!.manda({ tipo: "lavori" }))
      expect(await screen.findByText(/Le slide non sono state rese: manca il file delle slide/)).toBeInTheDocument()
      expect(screen.queryByText("Nessun avviso")).toBeNull()
    })

    it("prima di ogni resa non dice niente sugli avvisi", async () => {
      rete({ "GET /api/video/prova": carosello() })
      render(<PaginaVideo slug="prova" scheda="slide" parametri={new URLSearchParams()} />)
      await screen.findByRole("img", { name: "Slide 1 di 3" })
      expect(screen.queryByText("Nessun avviso")).toBeNull()
      expect(screen.queryByRole("list", { name: "Avvisi delle slide" })).toBeNull()
    })
  })

  it("le slide rifatte si vedono subito: un messaggio del video rilegge e l'indirizzo cambia con la data del file", async () => {
    let dettaglio = carosello()
    rete({ "GET /api/video/prova": () => dettaglio })
    render(<PaginaVideo slug="prova" scheda="slide" parametri={new URLSearchParams()} />)
    const prima = (await screen.findByRole("img", { name: "Slide 1 di 3" })).getAttribute("src")
    dettaglio = carosello([slide(10), slide(2), { ...slide(1), cambiato: "2026-11-02T10:00:20" }])
    act(() => eventi.istanze[0]!.manda({ tipo: "video", slug: "prova", cosa: "uscite" }))
    await waitFor(() => expect(screen.getByRole("img", { name: "Slide 1 di 3" }).getAttribute("src")).not.toBe(prima))
    expect(screen.getByRole("img", { name: "Slide 1 di 3" }).getAttribute("src")).toContain("v=2026-11-02T10%3A00%3A20")
    dettaglio = carosello([slide(1)])
    act(() => eventi.istanze[0]!.manda({ tipo: "video", slug: "prova", cosa: "uscite" }))
    expect(await screen.findByRole("img", { name: "Slide 1 di 1" })).toBeInTheDocument()
  })

  it("le frecce della tastiera scorrono le slide anche senza aver cliccato dentro, ma non mentre si scrive", async () => {
    rete({ "GET /api/video/prova": carosello() })
    render(<PaginaVideo slug="prova" scheda="slide" parametri={new URLSearchParams()} />)
    await screen.findByRole("img", { name: "Slide 1 di 3" })
    fireEvent.keyDown(window, { key: "ArrowRight" })
    expect(screen.getByRole("img", { name: "Slide 2 di 3" })).toBeInTheDocument()
    fireEvent.keyDown(screen.getByLabelText("Titolo del video"), { key: "ArrowRight" })
    expect(screen.getByRole("img", { name: "Slide 2 di 3" })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: "ArrowLeft" })
    expect(screen.getByRole("img", { name: "Slide 1 di 3" })).toBeInTheDocument()
  })

  it("nell'elenco si presenta come carosello, non come video da montare", async () => {
    rete({ "GET /api/video": [voce("car", { stato: "proposta", formato: "carosello" }, { durata: null, ha_finale: false, ha_piano: false })] })
    render(<ElencoVideo />)
    expect(await screen.findByText("carosello")).toBeInTheDocument()
    expect(screen.queryByText("non ancora montato")).not.toBeInTheDocument()
  })
})

describe("la scheda del video", () => {
  it("si scrive uscendo dal campo e rimanda la scheda intera", async () => {
    rete({})
    const salva = vi.fn().mockResolvedValue(undefined)
    const video = dettaglioDiProva()
    video.scheda = scheda({ proposta: { aggancio: "Prima" }, hashtag: ["AI", "LLM"], numeri: [{ data: "2026-10-07", canale: "tiktok", visualizzazioni: 100, mi_piace: 5 }, { data: "2026-10-08", canale: "tiktok", visualizzazioni: 300 }], pubblicazioni: [{ canale: "tiktok", data: "2026-10-07T13:15", url: "https://esempio.it/1" }] })
    render(<SchedaDelVideo video={video} salvaScheda={salva} />)
    const aggancio = screen.getByLabelText("Aggancio")
    fireEvent.change(aggancio, { target: { value: "Dopo" } })
    fireEvent.blur(aggancio)
    await waitFor(() => expect(salva).toHaveBeenCalledTimes(1))
    expect(salva.mock.calls[0]![0]).toMatchObject({ titolo: "Un video", proposta: { aggancio: "Dopo" } })
    expect(screen.getByText("#AI")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Apri l'indirizzo" })).toHaveAttribute("href", "https://esempio.it/1")
    expect(screen.getByRole("columnheader", { name: "Visualizzazioni" })).toBeInTheDocument()
    expect(screen.getByRole("img", { name: /Andamento/ })).toBeInTheDocument()
    expect(screen.getAllByText("–").length).toBeGreaterThan(0)
  })

  it("senza pubblicazioni e numeri dice cosa manca", async () => {
    rete({})
    render(<SchedaDelVideo video={dettaglioDiProva()} salvaScheda={vi.fn()} />)
    expect(screen.getByText(/Non è ancora stato pubblicato/)).toBeInTheDocument()
    expect(screen.getByText(/Nessun numero registrato/)).toBeInTheDocument()
    expect(screen.getByText(/Nessun hashtag/)).toBeInTheDocument()
    await screen.findByText("Nessuna conversazione di Claude ha lavorato su questo video.")
  })

  describe("gli elenchi della scheda si scrivono", () => {
    // Come la pagina vera: ciò che si salva è la scheda che si vede al giro dopo.
    const apri = (extra: Partial<Scheda> = {}) => {
      rete({})
      const video = dettaglioDiProva()
      video.scheda = scheda(extra)
      const salva = vi.fn(async (nuova: Scheda) => {
        resa.rerender(<SchedaDelVideo video={{ ...video, scheda: nuova }} salvaScheda={salva} />)
      })
      const resa = render(<SchedaDelVideo video={video} salvaScheda={salva} />)
      return salva
    }
    const ultima = (salva: ReturnType<typeof vi.fn>): Scheda => salva.mock.calls.at(-1)![0] as Scheda

    it("gli hashtag si aggiungono (anche più d'uno, senza il cancelletto e senza doppioni) e si tolgono", async () => {
      const salva = apri({ hashtag: ["AI", "LLM"] })
      fireEvent.change(screen.getByLabelText("Nuovo hashtag"), { target: { value: "#Rust ai  Ricette" } })
      fireEvent.click(screen.getByRole("button", { name: "Aggiungi hashtag" }))
      await waitFor(() => expect(salva).toHaveBeenCalledTimes(1))
      expect(ultima(salva).hashtag).toEqual(["AI", "LLM", "Rust", "Ricette"])
      await waitFor(() => expect(screen.getByLabelText("Nuovo hashtag")).toHaveValue(""))
      fireEvent.click(screen.getByRole("button", { name: "Togli #AI" }))
      await waitFor(() => expect(salva).toHaveBeenCalledTimes(2))
      expect(ultima(salva).hashtag).toEqual(["LLM", "Rust", "Ricette"])
    })

    it("Invio aggiunge l'hashtag; togliere l'ultimo toglie la lista dalla scheda", async () => {
      const salva = apri({ hashtag: ["AI"] })
      const campo = screen.getByLabelText("Nuovo hashtag")
      fireEvent.change(campo, { target: { value: "Nuovo" } })
      fireEvent.keyDown(campo, { key: "Enter" })
      await waitFor(() => expect(salva).toHaveBeenCalledTimes(1))
      expect(ultima(salva).hashtag).toEqual(["AI", "Nuovo"])
    })

    it("togliere l'ultimo hashtag toglie la lista dalla scheda", async () => {
      const salva = apri({ hashtag: ["AI"] })
      fireEvent.click(screen.getByRole("button", { name: "Togli #AI" }))
      await waitFor(() => expect(salva).toHaveBeenCalledTimes(1))
      expect("hashtag" in ultima(salva)).toBe(false)
    })

    it("un hashtag che il server rifiuta lascia ciò che è scritto e dice perché", async () => {
      rete({})
      const salva = vi.fn().mockRejectedValue(new Error("Il server non risponde."))
      render(<SchedaDelVideo video={dettaglioDiProva()} salvaScheda={salva} />)
      const campo = screen.getByLabelText("Nuovo hashtag")
      fireEvent.change(campo, { target: { value: "Prova" } })
      fireEvent.click(screen.getByRole("button", { name: "Aggiungi hashtag" }))
      expect(await screen.findByRole("alert")).toHaveTextContent("Il server non risponde.")
      expect(campo).toHaveValue("Prova")
    })

    it("i canali dove deve uscire si spuntano, nell'ordine fisso dell'elenco", async () => {
      const salva = apri({ canali: ["tiktok"] })
      const gruppo = screen.getByRole("group", { name: "Dove deve uscire" })
      expect(within(gruppo).getByRole("checkbox", { name: "TikTok" })).toBeChecked()
      expect(within(gruppo).getByRole("checkbox", { name: "YouTube" })).not.toBeChecked()
      fireEvent.click(within(gruppo).getByRole("checkbox", { name: "YouTube" }))
      await waitFor(() => expect(salva).toHaveBeenCalledTimes(1))
      expect(ultima(salva).canali).toEqual(["tiktok", "youtube"])
    })

    it("l'ultimo canale tolto toglie `canali` dalla scheda (lo schema vuole almeno uno)", async () => {
      const salva = apri({ canali: ["x"] })
      fireEvent.click(screen.getByRole("checkbox", { name: "X" }))
      await waitFor(() => expect(salva).toHaveBeenCalledTimes(1))
      expect("canali" in ultima(salva)).toBe(false)
    })

    it("una pubblicazione si aggiunge con canale, giorno e ora, indirizzo", async () => {
      const salva = apri({ canali: ["youtube"] })
      const nuova = screen.getByRole("group", { name: "Aggiungi una pubblicazione" })
      expect(within(nuova).getByLabelText("Canale")).toHaveValue("youtube")
      fireEvent.click(within(nuova).getByRole("button", { name: "Aggiungi la pubblicazione" }))
      expect(await within(nuova).findByRole("alert")).toHaveTextContent("Scrivi giorno e ora in cui è uscito.")
      expect(salva).not.toHaveBeenCalled()
      fireEvent.change(within(nuova).getByLabelText("Giorno e ora"), { target: { value: "2026-10-08T09:30" } })
      fireEvent.change(within(nuova).getByLabelText("Indirizzo"), { target: { value: "https://esempio.it/v" } })
      fireEvent.click(within(nuova).getByRole("button", { name: "Aggiungi la pubblicazione" }))
      await waitFor(() => expect(salva).toHaveBeenCalledTimes(1))
      expect(ultima(salva).pubblicazioni).toEqual([{ canale: "youtube", data: "2026-10-08T09:30", url: "https://esempio.it/v" }])
    })

    it("senza indirizzo la pubblicazione non ha la chiave `url`", async () => {
      const salva = apri()
      const nuova = screen.getByRole("group", { name: "Aggiungi una pubblicazione" })
      fireEvent.change(within(nuova).getByLabelText("Giorno e ora"), { target: { value: "2026-10-08T09:30" } })
      fireEvent.click(within(nuova).getByRole("button", { name: "Aggiungi la pubblicazione" }))
      await waitFor(() => expect(salva).toHaveBeenCalledTimes(1))
      expect(ultima(salva).pubblicazioni).toEqual([{ canale: "tiktok", data: "2026-10-08T09:30" }])
    })

    it("una pubblicazione scritta si cambia: canale, giorno e ora, indirizzo; e si toglie", async () => {
      const salva = apri({
        pubblicazioni: [
          { canale: "tiktok", data: "2026-10-07T13:15", url: "https://esempio.it/1" },
          { canale: "youtube", data: "2026-10-09T08:00", url: "https://esempio.it/y" },
        ],
      })
      const prima = screen.getByRole("group", { name: "Pubblicazione 1" })
      fireEvent.change(within(prima).getByLabelText("Indirizzo"), { target: { value: "https://esempio.it/2" } })
      fireEvent.blur(within(prima).getByLabelText("Indirizzo"))
      await waitFor(() => expect(salva).toHaveBeenCalledTimes(1))
      expect(ultima(salva).pubblicazioni?.[0]).toEqual({ canale: "tiktok", data: "2026-10-07T13:15", url: "https://esempio.it/2" })

      fireEvent.change(within(prima).getByLabelText("Giorno e ora"), { target: { value: "2026-10-07T14:00" } })
      fireEvent.blur(within(prima).getByLabelText("Giorno e ora"))
      await waitFor(() => expect(salva).toHaveBeenCalledTimes(2))
      expect(ultima(salva).pubblicazioni?.[0]).toMatchObject({ data: "2026-10-07T14:00" })

      fireEvent.change(within(prima).getByLabelText("Canale"), { target: { value: "x" } })
      await waitFor(() => expect(salva).toHaveBeenCalledTimes(3))
      expect(ultima(salva).pubblicazioni?.[0]).toMatchObject({ canale: "x" })

      const seconda = screen.getByRole("group", { name: "Pubblicazione 2" })
      fireEvent.change(within(seconda).getByLabelText("Indirizzo"), { target: { value: "" } })
      fireEvent.blur(within(seconda).getByLabelText("Indirizzo"))
      await waitFor(() => expect(salva).toHaveBeenCalledTimes(4))
      expect(ultima(salva).pubblicazioni?.[1]).toEqual({ canale: "youtube", data: "2026-10-09T08:00" })

      fireEvent.click(within(prima).getByRole("button", { name: "Togli la pubblicazione 1" }))
      await waitFor(() => expect(salva).toHaveBeenCalledTimes(5))
      expect(ultima(salva).pubblicazioni).toEqual([{ canale: "youtube", data: "2026-10-09T08:00" }])
    })

    it("un canale scritto fuori dall'elenco si vede e non si perde", () => {
      apri({ pubblicazioni: [{ canale: "instagram", data: "2026-10-07T13:15" }] })
      const riga = screen.getByRole("group", { name: "Pubblicazione 1" })
      expect(within(riga).getByLabelText("Canale")).toHaveValue("instagram")
    })

    it("senza scaletta la sezione c'è, vuota, con il modo di scriverla", async () => {
      apri()
      expect(screen.getByRole("heading", { name: "La scaletta" })).toBeInTheDocument()
      expect(screen.queryByRole("list", { name: "La scaletta" })).toBeNull()
      expect(screen.getByLabelText("Nuovo passo")).toBeInTheDocument()
      await screen.findByText("Nessuna conversazione di Claude ha lavorato su questo video.")
    })

    it("la scaletta elenca i passi in ordine, ognuno con cosa aprire, cosa fare, cosa spiegare", async () => {
      apri({ scaletta: [{ apri: "Il sito", fai: "Scegli la scheda", spiega: "Rosso non entra" }, { apri: "Il programma" }] })
      const passi = within(screen.getByRole("list", { name: "La scaletta" })).getAllByRole("listitem")
      expect(passi).toHaveLength(2)
      expect(within(passi[0]!).getByLabelText("Cosa aprire")).toHaveValue("Il sito")
      expect(within(passi[0]!).getByLabelText("Cosa fare")).toHaveValue("Scegli la scheda")
      expect(within(passi[0]!).getByLabelText("Cosa spiegare")).toHaveValue("Rosso non entra")
      expect(within(passi[1]!).getByLabelText("Cosa aprire")).toHaveValue("Il programma")
      expect(within(passi[1]!).getByLabelText("Cosa fare")).toHaveValue("")
      await screen.findByText("Nessuna conversazione di Claude ha lavorato su questo video.")
    })

    it("un passo si aggiunge in fondo, si scrive, si sposta e si toglie; un campo svuotato sparisce dal passo", async () => {
      const salva = apri({ scaletta: [{ apri: "Il sito", fai: "Scegli la scheda" }, { apri: "Il programma" }] })
      fireEvent.change(screen.getByLabelText("Nuovo passo"), { target: { value: "Il terminale" } })
      fireEvent.click(screen.getByRole("button", { name: "Aggiungi il passo" }))
      await waitFor(() => expect(salva).toHaveBeenCalledTimes(1))
      expect(ultima(salva).scaletta).toEqual([{ apri: "Il sito", fai: "Scegli la scheda" }, { apri: "Il programma" }, { apri: "Il terminale" }])

      const passi = () => within(screen.getByRole("list", { name: "La scaletta" })).getAllByRole("listitem")
      const spiega = within(passi()[1]!).getByLabelText("Cosa spiegare")
      fireEvent.change(spiega, { target: { value: "Perché serve" } })
      fireEvent.blur(spiega)
      await waitFor(() => expect(salva).toHaveBeenCalledTimes(2))
      expect(ultima(salva).scaletta?.[1]).toEqual({ apri: "Il programma", spiega: "Perché serve" })

      const fai = within(passi()[0]!).getByLabelText("Cosa fare")
      fireEvent.change(fai, { target: { value: "" } })
      fireEvent.blur(fai)
      await waitFor(() => expect(salva).toHaveBeenCalledTimes(3))
      expect(ultima(salva).scaletta?.[0]).toEqual({ apri: "Il sito" })

      fireEvent.click(within(passi()[0]!).getByRole("button", { name: "Sposta il passo 1 giù" }))
      await waitFor(() => expect(salva).toHaveBeenCalledTimes(4))
      expect(ultima(salva).scaletta?.map((p) => p.apri)).toEqual(["Il programma", "Il sito", "Il terminale"])

      fireEvent.click(within(passi()[1]!).getByRole("button", { name: "Togli il passo 2" }))
      await waitFor(() => expect(salva).toHaveBeenCalledTimes(5))
      expect(ultima(salva).scaletta?.map((p) => p.apri)).toEqual(["Il programma", "Il terminale"])
    })

    it("il primo passo non va su e l'ultimo non va giù; un passo senza «cosa aprire» non si salva", async () => {
      const salva = apri({ scaletta: [{ apri: "Il sito" }, { apri: "Il programma" }] })
      expect(screen.getByRole("button", { name: "Sposta il passo 1 su" })).toBeDisabled()
      expect(screen.getByRole("button", { name: "Sposta il passo 2 giù" })).toBeDisabled()
      const apriPrimo = within(within(screen.getByRole("list", { name: "La scaletta" })).getAllByRole("listitem")[0]!).getByLabelText("Cosa aprire")
      fireEvent.change(apriPrimo, { target: { value: "  " } })
      fireEvent.blur(apriPrimo)
      expect(await screen.findByRole("alert")).toHaveTextContent("Scrivi cosa aprire in questo passo.")
      expect(salva).not.toHaveBeenCalled()
    })

    it("ogni modifica della scaletta tiene gli altri campi della scheda", async () => {
      const salva = apri({ didascalia: "Una didascalia", proposta: { aggancio: "Prima" }, scaletta: [{ apri: "Il sito" }] })
      fireEvent.click(screen.getByRole("button", { name: "Togli il passo 1" }))
      await waitFor(() => expect(salva).toHaveBeenCalledTimes(1))
      expect(ultima(salva)).toMatchObject({ titolo: "Un video", didascalia: "Una didascalia", proposta: { aggancio: "Prima" } })
      expect("scaletta" in ultima(salva)).toBe(false)
    })
  })

  describe("il lavoro di Claude", () => {
    const conto = { tempo: 6420, giri: 17, token: { scritti: 234_000, riletti: 130_253_512, nuovi: 1_223_662 }, dal: "2026-10-30T09:00:00", al: "2026-11-03T11:40:00" }
    const consumiDi = (video: Record<string, unknown>, pronto = true) => ({ pronto, video, senza_video: nessunConsumo.senza_video })

    it("dice quanto ha lavorato Claude su questo video e quanto ha scritto, letto e riletto", async () => {
      rete({ "GET /api/consumi": consumiDi({ prova: conto, altro: { ...conto, tempo: 60 } }) })
      render(<SchedaDelVideo video={dettaglioDiProva()} salvaScheda={vi.fn()} />)
      const blocco = await screen.findByRole("region", { name: "Il lavoro di Claude" })
      await waitFor(() => expect(blocco).toHaveTextContent("1 h 47 min"))
      expect(blocco).toHaveTextContent("17 richieste, dal 30 ott 2026 al 3 nov 2026")
      expect(blocco).toHaveTextContent("234 milascritti da Claude")
      expect(blocco).toHaveTextContent("1,2 milioniletti per la prima volta")
      expect(blocco).toHaveTextContent("130 milioniriletti dalla conversazione")
      expect(blocco).toHaveTextContent("Un «token» è un pezzo di testo")
      expect(blocco).toHaveTextContent("Il lavoro fatto con Mango Code non è contato.")
    })

    it("dice quando nessuna conversazione ha lavorato sul video, e quando sta ancora leggendo", async () => {
      rete({ "GET /api/consumi": consumiDi({}) })
      const { unmount } = render(<SchedaDelVideo video={dettaglioDiProva()} salvaScheda={vi.fn()} />)
      expect(await screen.findByText("Nessuna conversazione di Claude ha lavorato su questo video.")).toBeInTheDocument()
      unmount()
      rete({ "GET /api/consumi": consumiDi({}, false) })
      render(<SchedaDelVideo video={dettaglioDiProva()} salvaScheda={vi.fn()} />)
      expect(await screen.findByText(/Sto ancora leggendo le conversazioni di Claude/)).toBeInTheDocument()
    })

    it("i conti si aggiornano quando il server dice che sono cambiati, senza ricaricare la pagina", async () => {
      rete({ "GET /api/consumi": consumiDi({ prova: conto }) })
      render(<SchedaDelVideo video={dettaglioDiProva()} salvaScheda={vi.fn()} />)
      const blocco = await screen.findByRole("region", { name: "Il lavoro di Claude" })
      await waitFor(() => expect(blocco).toHaveTextContent("1 h 47 min"))
      rete({ "GET /api/consumi": consumiDi({ prova: { ...conto, tempo: 8400 } }) })
      act(() => eventi.istanze[0]!.manda({ tipo: "consumi" }))
      await waitFor(() => expect(blocco).toHaveTextContent("2 h 20 min"))
    })
  })

  it("se non si riesce a salvare lascia il testo scritto e dice perché", async () => {
    rete({})
    const salva = vi.fn().mockRejectedValue(new Error("Il server non risponde."))
    render(<SchedaDelVideo video={dettaglioDiProva()} salvaScheda={salva} />)
    const campo = screen.getByLabelText("Didascalia")
    fireEvent.change(campo, { target: { value: "Nuova" } })
    fireEvent.blur(campo)
    expect(await screen.findByRole("alert")).toHaveTextContent("Il server non risponde.")
    expect(campo).toHaveValue("Nuova")
  })
})

describe("il controllo", () => {
  const controllo = { quando: "2026-10-09T10:00:00", del_finale: "2026-10-09T09:00:00", durata: 24.6, silenzi: [{ a: 12.3, dura: 0.41 }], parole_fuori_posto: [{ parola: "batte", attesa: [6.1, 6.4] as [number, number], trovata: [6.9, 7.2] as [number, number], voto: 0.4 }], sentito: "ciao", differenze: [{ a: 9.2, voluto: "niente magia", sentito: "niente maggia" }], tagli_nel_parlato: [{ a: 8.1, db: -31 }] }

  it("elenca ogni riga con il rimando al secondo, e dice se il montato è più nuovo", () => {
    rete({})
    const video = { ...dettaglioDiProva(), controllo, ...conUscite([{ file: "video/prova/uscite/finale.mp4", byte: 5, cambiato: "2026-10-09T12:00:00" }]) }
    render(<ControlloVideo video={video} salvaScheda={vi.fn()} />)
    expect(screen.getByText(/montato è più nuovo di questo controllo/)).toBeInTheDocument()
    const link = screen.getAllByRole("link").map((a) => a.getAttribute("href"))
    expect(link).toEqual(["#/video/prova/montaggio?t=12.3", "#/video/prova/montaggio?t=6.1", "#/video/prova/montaggio?t=8.1", "#/video/prova/montaggio?t=9.2"])
    expect(screen.getByText("Silenzio di 0,41 s")).toBeInTheDocument()
    expect(screen.getByText(/sicurezza 40%/)).toBeInTheDocument()
  })

  it("se il controllo è aggiornato non dice niente; controllare di nuovo si chiede nella chat, senza bottoni", async () => {
    rete({})
    const video = { ...dettaglioDiProva(), controllo, ...conUscite([{ file: "video/prova/uscite/finale.mp4", byte: 5, cambiato: "2026-10-09T09:00:00" }]) }
    render(<ControlloVideo video={video} salvaScheda={vi.fn()} />)
    expect(screen.queryByText(/più nuovo di questo controllo/)).toBeNull()
    expect(screen.getByText("Per controllare di nuovo il montato, chiedilo nella chat.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Controlla|chat|Claude/ })).toBeNull()
    expect(chiamate.find((c) => c.metodo === "POST")).toBeUndefined()
  })

  it("senza montato non si può controllare e lo dice; le cose da verificare si spuntano", async () => {
    rete({})
    const salva = vi.fn().mockResolvedValue(undefined)
    const video = dettaglioDiProva()
    video.scheda = scheda({ da_verificare: [{ cosa: "Il numero detto a voce", perche: "A schermo ce n'è un altro.", stato: "aperto" }] })
    render(<ControlloVideo video={video} salvaScheda={salva} />)
    expect(screen.queryByText(/chiedilo nella chat/)).toBeNull()
    expect(screen.getByText("Non c'è ancora un video montato da controllare: appena è montato, si controlla.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("checkbox"))
    await waitFor(() => expect(salva).toHaveBeenCalled())
    expect(salva.mock.calls[0]![0].da_verificare[0].stato).toBe("a posto")
  })
})

describe("i file di un video", () => {
  it("il percorso intero di un'uscita usa i separatori della cartella", () => {
    expect(percorsoDellUscita("C:\\archivio\\video\\a", "video/a/uscite/finale.mp4")).toBe("C:\\archivio\\video\\a\\uscite\\finale.mp4")
    expect(percorsoDellUscita("/archivio/video/a/", "video/a/uscite/finale.mp4")).toBe("/archivio/video/a/uscite/finale.mp4")
  })

  it("mostra uscite con peso e data, e il girato usato con il rimando a Girato", async () => {
    rete({ "POST /api/apri": {} })
    const video = { ...dettaglioDiProva(), ...conUscite([{ file: "video/prova/uscite/finale.mp4", byte: 2_500_000, cambiato: "2026-10-09T10:15:00" }]) }
    render(<FileVideo video={video} salvaScheda={vi.fn()} />)
    expect(screen.getByText("finale.mp4")).toBeInTheDocument()
    expect(screen.getByText(/2,4 MB · 9 ott 2026/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Mostra nella cartella/ }))
    await waitFor(() => expect(chiamate.find((c) => c.percorso === "/api/apri")?.corpo).toEqual({ percorso: "video/prova/uscite/finale.mp4" }))
    expect(screen.getAllByRole("link", { name: "Vedilo in Girato" })[0]).toHaveAttribute("href", "#/girato?file=2026-10-06%2Fa.mp4")
  })
})

describe("la copertina dentro il montato", () => {
  const finale = { file: "video/prova/uscite/finale.mp4", byte: 5_000_000, cambiato: "2026-10-09T10:00:00Z", stesso_file: "video/prova/uscite/con-copertina.mp4" }
  const conCopertina = { file: "video/prova/uscite/con-copertina.mp4", byte: 5_000_000, cambiato: "2026-10-09T10:00:00Z" }
  const png = (cambiato: string) => ({ file: "video/prova/uscite/copertina.png", byte: 100, cambiato })

  it("i due nomi dello stesso file sono una riga sola, che dice anche l'altro nome", () => {
    const video = { ...dettaglioDiProva(), ...conUscite([finale, conCopertina]) }
    render(<FileVideo video={video} salvaScheda={vi.fn()} />)
    expect(screen.getAllByRole("button", { name: /Mostra nella cartella/ })).toHaveLength(1)
    expect(screen.getByText("con-copertina.mp4")).toBeInTheDocument()
    expect(screen.queryByText("finale.mp4")).toBeNull()
    expect(screen.getByText(/è anche finale\.mp4/)).toBeInTheDocument()
  })

  it("la scheda Copertina mostra il video con la copertina quando è del montaggio di adesso", () => {
    const video = { ...dettaglioDiProva(), ...conUscite([finale, conCopertina, png("2026-10-09T09:59:00Z")]) }
    const { container } = render(<CopertinaVideo video={video} salvaScheda={vi.fn()} />)
    expect(container.querySelector("video")).toHaveAttribute("src", expect.stringContaining("con-copertina.mp4"))
    expect(screen.queryByText(/La copertina è cambiata dopo questo montaggio/)).toBeNull()
  })

  it("una copertina rifatta dopo il montaggio lo dice: il video non ce l'ha ancora", () => {
    const video = { ...dettaglioDiProva(), ...conUscite([finale, conCopertina, png("2026-10-09T11:00:00Z")]) }
    render(<CopertinaVideo video={video} salvaScheda={vi.fn()} />)
    expect(screen.getByText(/La copertina è cambiata dopo questo montaggio/)).toBeInTheDocument()
  })

  it("un video con la copertina di un montaggio vecchio non si mostra, e dice di rimontare", () => {
    const vecchio = { ...conCopertina, cambiato: "2026-10-01T10:00:00Z" }
    const nuovo = { file: "video/prova/uscite/finale.mp4", byte: 5, cambiato: "2026-10-09T10:00:00Z" }
    const video = { ...dettaglioDiProva(), ...conUscite([vecchio, nuovo]) }
    const { container } = render(<CopertinaVideo video={video} salvaScheda={vi.fn()} />)
    expect(container.querySelector("video")).toBeNull()
    expect(screen.getByText(/di un montaggio vecchio/)).toBeInTheDocument()
  })

  it("senza il video con la copertina dice di chiederla e rimontare", () => {
    const video = { ...dettaglioDiProva(), ...conUscite([{ file: "video/prova/uscite/finale.mp4", byte: 5, cambiato: "2026-10-09T10:00:00Z" }]) }
    render(<CopertinaVideo video={video} salvaScheda={vi.fn()} />)
    expect(screen.getByText(/Il montaggio non ha ancora la copertina in testa/)).toBeInTheDocument()
  })
})

describe("il girato", () => {
  const file = (nome: string, extra: Partial<FileGrezzo> = {}): FileGrezzo => ({
    file: `2026-10-06/${nome}`,
    nome,
    byte: 3_000_000,
    scheda: { tipo: "ripresa", origine: "telefono", durata: 12, largo: 540, alto: 960, note: "" },
    scheda_problemi: [],
    preparato: { parole: "preparati/x/parole.json", sagoma: null, leggero: "preparati/x/leggero.mp4", miniatura: "preparati/x/miniatura.jpg", onda: "preparati/x/onda.bin", trascrizione: null },
    usato_in: [],
    ...extra,
  })
  const giorni = [{ giorno: "2026-10-06", file: [file("a.mp4", { usato_in: ["uno"] }), file("b.mp4", { preparato: { parole: null, sagoma: null, leggero: null, miniatura: null, onda: null, trascrizione: null }, scheda: { tipo: "diretta", origine: "registrazione", note: "n" } })] }]

  it("elenca per giorno, dice dove è usato o «mai usato», e filtra", async () => {
    rete({ "GET /api/grezzo": giorni, "GET /api/video": [voce("uno")] })
    render(<Girato file={undefined} />)
    expect(await screen.findByRole("heading", { name: "6 ott 2026" })).toBeInTheDocument()
    expect(screen.getByText("usato in 1 video: Video uno")).toBeInTheDocument()
    expect(screen.getByText("mai usato")).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText("Solo quelli mai usati"))
    expect(screen.queryByText(/usato in 1 video/)).toBeNull()
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "ripresa" } })
    expect(screen.getByText(/Nessun file corrisponde ai filtri/)).toBeInTheDocument()
  })

  it("aprendo un file mostra le parole coi tempi, le note, e dice che un video nuovo da questo file si chiede nella chat", async () => {
    rete({
      "GET /api/grezzo": giorni,
      "GET /api/video": [voce("uno")],
      "GET /api/grezzo/parole?file=2026-10-06%2Fa.mp4": [{ p: "ciao", da: 0.2, a: 0.5 }, { p: "mondo", da: 0.7, a: 1 }],
    })
    render(<Girato file="2026-10-06/a.mp4" />)
    expect(await screen.findByRole("heading", { name: "a.mp4" })).toBeInTheDocument()
    expect(await screen.findByRole("button", { name: "ciao" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "0:00,2" })).toBeInTheDocument()
    expect(screen.getByText("Per farne un video nuovo, chiedilo nella chat.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Nuovo video|chat|Claude/ })).toBeNull()
  })

  it("un file da preparare dice di chiederlo nella chat, senza scontorno: la sagoma la fa il montaggio, dei soli tratti montati", async () => {
    rete({ "GET /api/grezzo": giorni, "GET /api/video": [] })
    render(<Girato file="2026-10-06/b.mp4" />)
    await screen.findByRole("heading", { name: "b.mp4" })
    expect(screen.queryByLabelText(/sfondo/)).toBeNull()
    expect(screen.getByText("Per preparare questo file o farne un video nuovo, chiedilo nella chat.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Prepara|Nuovo video|chat|Claude/ })).toBeNull()
    expect(chiamate.find((c) => c.metodo === "POST")).toBeUndefined()
  })

  it("un file non preparato si guarda dall'originale; se non si apre, lo dice e dice di chiedere nella chat di prepararlo", async () => {
    rete({ "GET /api/grezzo": giorni, "GET /api/video": [] })
    const { container } = render(<Girato file="2026-10-06/b.mp4" />)
    await screen.findByRole("heading", { name: "b.mp4" })
    const lettore = container.querySelector("video")!
    expect(lettore.getAttribute("src")).toBe("/media/grezzo/2026-10-06/b.mp4")
        fireEvent.error(lettore)
    expect(await screen.findByText("Questo file non si apre qui così com'è: preparato, ne viene una copia che si guarda qui.")).toBeInTheDocument()
    expect(container.querySelector("video")).toBeNull()
    expect(screen.getByText("Per preparare questo file o farne un video nuovo, chiedilo nella chat.")).toBeInTheDocument()
  })

  it("le note si salvano nella scheda del file", async () => {
    rete({ "GET /api/grezzo": giorni, "GET /api/video": [], "GET /api/grezzo/parole?file=2026-10-06%2Fa.mp4": [], "PUT /api/grezzo/scheda?file=2026-10-06%2Fa.mp4": {} })
    render(<Girato file="2026-10-06/a.mp4" />)
    const note = await screen.findByLabelText("Note su questo file")
    fireEvent.change(note, { target: { value: "Una nota" } })
    fireEvent.blur(note)
    await waitFor(() => expect(chiamate.find((c) => c.metodo === "PUT")?.corpo).toMatchObject({ tipo: "ripresa", origine: "telefono", note: "Una nota" }))
  })

  it("il riquadro degli arrivi dice se il telefono può mandare e gli ultimi arrivati", async () => {
    rete({ "GET /api/grezzo": giorni, "GET /api/video": [], "GET /api/arrivi": { in_ascolto: true, indirizzo: "192.168.1.20:47420", qr: "<svg xmlns='http://www.w3.org/2000/svg'/>", errore: null, ultimi: [{ file: "2026-10-06/20261006-prova.mp4", quando: "2026-10-06T22:28:01", byte: 412_000 }], firewall: "consentito", pronto: true, motivo: null, carica: "http://192.168.1.20:47420/carica?chiave=k", qr_carica: "<svg xmlns='http://www.w3.org/2000/svg'/>" } })
    render(<Girato file={undefined} />)
    expect(await screen.findByText("192.168.1.20:47420")).toBeInTheDocument()
    expect(screen.getByAltText(/installare la Scorciatoia/)).toBeInTheDocument()
    expect(screen.getByAltText(/pagina che manda i video/)).toBeInTheDocument()
    expect(screen.getByText("20261006-prova.mp4")).toBeInTheDocument()
  })

  it("se il telefono non può arrivare dice perché, e «Controlla di nuovo» rifà il controllo", async () => {
    rete({ "GET /api/grezzo": giorni, "GET /api/video": [] })
    render(<Girato file={undefined} />)
    expect(await screen.findByText(/Windows blocca il programma/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Controlla di nuovo" }))
    await waitFor(() => expect(chiamate.some((c) => c.metodo === "POST" && c.percorso === "/api/arrivi/controlla")).toBe(true))
  })

  it("un file con la scheda rifiutata lo dice nell'elenco, non «in arrivo»", async () => {
    const rifiutata: FileGrezzo = { file: "2026-10-09/nuovo.mp4", nome: "nuovo.mp4", byte: 1000, scheda: null, scheda_problemi: ["soggetto: non è una chiave ammessa"], preparato: { parole: null, sagoma: null, leggero: null, onda: null, miniatura: null, trascrizione: null }, usato_in: [] }
    rete({ "GET /api/grezzo": [{ giorno: "2026-10-09", file: [rifiutata] }], "GET /api/video": [] })
    render(<Girato file={undefined} />)
    expect(await screen.findByText(/Scheda da correggere/)).toBeInTheDocument()
    expect(screen.queryByText(/Scheda in arrivo/)).toBeNull()
  })

  it("un file senza scheda si mostra e si può classificare", async () => {
    const senza: FileGrezzo = { file: "2026-10-09/nuovo.mp4", nome: "nuovo.mp4", byte: 1000, scheda: null, scheda_problemi: [], preparato: { parole: null, sagoma: null, leggero: null, onda: null, miniatura: null, trascrizione: null }, usato_in: [] }
    rete({ "GET /api/grezzo": [{ giorno: "2026-10-09", file: [senza] }], "GET /api/video": [], "PUT /api/grezzo/scheda?file=2026-10-09%2Fnuovo.mp4": {} })
    render(<Girato file="2026-10-09/nuovo.mp4" />)
    expect(await screen.findByRole("heading", { name: "nuovo.mp4" })).toBeInTheDocument()
    expect(screen.getAllByText(/Scheda in arrivo|sto ancora leggendo il file/).length).toBeGreaterThan(0)
    fireEvent.change(screen.getAllByLabelText("Tipo")[1]!, { target: { value: "diretta" } })
    await waitFor(() => expect(chiamate.find((c) => c.metodo === "PUT")?.corpo).toEqual({ tipo: "diretta", origine: "altro" }))
  })

  it("senza girato dice come arrivano i file", async () => {
    rete({ "GET /api/grezzo": [], "GET /api/video": [] })
    render(<Girato file={undefined} />)
    expect(await screen.findByText(/Nel girato non c'è ancora niente/)).toBeInTheDocument()
  })
})

describe("lo stile", () => {
  it("cambia un valore, salva lo stile intero; senza modifiche Salva è spento", async () => {
    rete({ "GET /api/stile": stileDiProva(), "PUT /api/stile": {} })
    render(<PaginaStile />)
    const salva = await screen.findByRole("button", { name: "Salva" })
    expect(salva).toBeDisabled()
    const corpo = screen.getAllByRole("textbox", { name: /^Corpo$/ })[0]!
    fireEvent.change(corpo, { target: { value: "62" } })
    fireEvent.blur(corpo)
    expect(salva).toBeEnabled()
    fireEvent.click(salva)
    await waitFor(() => expect(chiamate.find((c) => c.metodo === "PUT")).toBeDefined())
    const inviato = chiamate.find((c) => c.metodo === "PUT")!.corpo as ReturnType<typeof stileDiProva>
    expect(inviato.sottotitoli.corpo).toBe(62)
    expect(inviato.quadri["girato-pieno"]).toBeDefined()
    expect(await screen.findByText("Salvato")).toBeInTheDocument()
  })

  it("un valore non valido dice perché e non si può salvare", async () => {
    rete({ "GET /api/stile": stileDiProva() })
    render(<PaginaStile />)
    const campo = (await screen.findAllByRole("textbox", { name: /Volume della voce/ }))[0]!
    fireEvent.change(campo, { target: { value: "5" } })
    fireEvent.blur(campo)
    expect(await screen.findByRole("alert")).toHaveTextContent(/volume della voce è un livello in decibel/)
    expect(screen.getByRole("button", { name: "Salva" })).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "Annulla le modifiche" }))
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("se il server rifiuta lo stile, la sua frase compare", async () => {
    rete({ "GET /api/stile": stileDiProva(), "PUT /api/stile": errore(400, "Il quadro «x» è usato dal video «y»: non si può togliere.") })
    render(<PaginaStile />)
    const campo = (await screen.findAllByRole("textbox", { name: /Pausa che resta/ }))[0]!
    fireEvent.change(campo, { target: { value: "0,4" } })
    fireEvent.blur(campo)
    fireEvent.click(screen.getByRole("button", { name: "Salva" }))
    expect(await screen.findByText(/non si può togliere/)).toBeInTheDocument()
  })

  it("disegna ogni quadro con le misure scritte", async () => {
    rete({ "GET /api/stile": stileDiProva() })
    render(<PaginaStile />)
    await screen.findByRole("heading", { name: "I quadri" })
    expect(screen.getByRole("img", { name: "Il quadro Sagoma su animazione disegnato in scala" })).toBeInTheDocument()
    expect(screen.getByRole("img", { name: "Il quadro Schermo e viso disegnato in scala" })).toBeInTheDocument()
  })
})

describe("lo stile con i sottotitoli senza riquadro", () => {
  const senzaRiquadro = () => {
    const stile = stileDiProva()
    stile.sottotitoli.fondo = null
    stile.sottotitoli.contorno = 6
    stile.sottotitoli.colore_contorno = "nero"
    return stile
  }

  it("si apre, dice che non c'è fondo e si può rimettere un colore o toglierlo", async () => {
    rete({ "GET /api/stile": senzaRiquadro(), "PUT /api/stile": {} })
    render(<PaginaStile />)
    await screen.findByRole("heading", { name: "I quadri" })
    const fondo = screen.getAllByRole("combobox", { name: "Fondo" })[0]!
    expect(fondo).toHaveValue("")
    fireEvent.change(fondo, { target: { value: "carta" } })
    fireEvent.click(screen.getByRole("button", { name: /Salva/ }))
    await waitFor(() => expect(chiamate.some((c) => c.metodo === "PUT")).toBe(true))
    expect((chiamate.find((c) => c.metodo === "PUT")!.corpo as { sottotitoli: { fondo: string } }).sottotitoli.fondo).toBe("carta")
  })

  it("il contorno si cambia come ogni misura e si salva con lo stile", async () => {
    rete({ "GET /api/stile": senzaRiquadro(), "PUT /api/stile": {} })
    render(<PaginaStile />)
    await screen.findByRole("heading", { name: "I quadri" })
    const contorno = screen.getByLabelText(/Contorno/)
    fireEvent.change(contorno, { target: { value: "8" } })
    fireEvent.blur(contorno)
    fireEvent.click(screen.getByRole("button", { name: /Salva/ }))
    await waitFor(() => expect(chiamate.some((c) => c.metodo === "PUT")).toBe(true))
    expect((chiamate.find((c) => c.metodo === "PUT")!.corpo as { sottotitoli: { contorno: number } }).sottotitoli.contorno).toBe(8)
  })
})

describe("lo stile con la testa al centro", () => {
  const conTesta = () => {
    const stile = stileDiProva()
    const sagoma = stile.quadri["sagoma-su-animazione"]!.strati.find((s) => s.tipo === "sagoma")!
    sagoma.x = "testa"
    return stile
  }

  it("disegna la sagoma al centro del quadro, senza scrivere «testa» in una misura", async () => {
    rete({ "GET /api/stile": conTesta() })
    render(<PaginaStile />)
    const quadro = await screen.findByRole("img", { name: "Il quadro Sagoma su animazione disegnato in scala" })
    const misure = [...quadro.querySelectorAll("[x], [y], [width], [height]")].flatMap((el) => ["x", "y", "width", "height"].map((a) => el.getAttribute(a)))
    expect(misure.filter((m) => m !== null && !Number.isFinite(Number(m)))).toEqual([])
    const persona = quadro.querySelector("g[class*=sagoma] rect")!
    expect(Number(persona.getAttribute("x")) + Number(persona.getAttribute("width")) / 2).toBeCloseTo(540)
  })

  it("lo spostamento dice «la testa al centro» e si può passare a un valore a mano, e ritorno", async () => {
    rete({ "GET /api/stile": conTesta(), "PUT /api/stile": {} })
    render(<PaginaStile />)
    await screen.findByRole("heading", { name: "I quadri" })
    const posizione = screen.getByRole("combobox", { name: "Posizione della persona" })
    expect(posizione).toHaveValue("testa")
    expect(screen.queryByLabelText(/Spostamento/)).toBeNull()
    fireEvent.change(posizione, { target: { value: "a mano" } })
    expect(screen.getByLabelText(/Spostamento/)).toHaveValue("0")
    fireEvent.change(screen.getByRole("combobox", { name: "Posizione della persona" }), { target: { value: "testa" } })
    expect(screen.queryByLabelText(/Spostamento/)).toBeNull()
  })
})

describe("la cornice", () => {
  it("dice cosa sta girando e lo si può fermare; il telefono è pronto o spento", async () => {
    rete({
      "GET /api/lavori": { in_corso: { id: "l1", slug: "uno", comando: "monta", iniziato: "2026-10-09T10:00:00", righe: ["Rendo le scene"] }, in_coda: [{ id: "l2", slug: "uno", comando: "controlla" }], finiti: [{ id: "l0", slug: "uno", comando: "risolvi", esito: "fallito", errore: "Il piano non ha scene." }] },
      "GET /api/video": [voce("uno")],
      "DELETE /api/lavori/l1": {},
    })
    render(<Cornice vista="video" />)
    expect(await screen.findByText("Lavoro in corso")).toBeInTheDocument()
    expect(await screen.findByText("Telefono non pronto")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Lavoro in corso/ }))
    const pannello = await screen.findByRole("dialog", { name: "Lavori" })
    expect(within(pannello).getByText(/Montaggio · Video uno/)).toBeInTheDocument()
    expect(within(pannello).getByText("Rendo le scene")).toBeInTheDocument()
    expect(within(pannello).getByText("Il piano non ha scene.")).toBeInTheDocument()
    fireEvent.click(within(pannello).getByRole("button", { name: "Ferma" }))
    await waitFor(() => expect(chiamate.some((c) => c.metodo === "DELETE" && c.percorso === "/api/lavori/l1")).toBe(true))
  })

  it("dice quanto dura il lavoro in corso e verso che ora finisce; senza storia dice che non si sa", async () => {
    const lavoroCon = (stima: number | null) => ({ in_corso: { id: "l1", slug: "uno", comando: "monta", iniziato: "2026-10-09T10:00:00", righe: [], stima, fine_prevista: stima === null ? null : "2026-10-09T10:04:00" }, in_coda: [], finiti: [] })
    rete({ "GET /api/lavori": lavoroCon(240), "GET /api/video": [voce("uno")] })
    const { unmount } = render(<Cornice vista="video" />)
    fireEvent.click(await screen.findByRole("button", { name: /Lavoro in corso/ }))
    expect(await within(await screen.findByRole("dialog", { name: "Lavori" })).findByText("circa 4 min, finisce verso le 10:04")).toBeInTheDocument()
    unmount()

    rete({ "GET /api/lavori": lavoroCon(null), "GET /api/video": [voce("uno")] })
    render(<Cornice vista="video" />)
    fireEvent.click(await screen.findByRole("button", { name: /Lavoro in corso/ }))
    expect(await within(await screen.findByRole("dialog", { name: "Lavori" })).findByText(/Quanto dura non si sa ancora/)).toBeInTheDocument()
  })

  describe("un montaggio con il piano cambiato", () => {
    const montaggioDi = (superato: boolean, idDelDettaglio = "l1") => ({
      "GET /api/lavori": { in_corso: { id: "l1", slug: "uno", comando: "monta", iniziato: "2026-10-09T10:00:00", righe: [] }, in_coda: [], finiti: [] },
      "GET /api/video": [voce("uno")],
      "GET /api/video/uno": { ...dettaglioDiProva(), slug: "uno", lavoro: { id: idDelDettaglio, comando: "monta", stato: "in corso" }, montaggio_superato: superato },
    })

    it("lo dice nella barra e nel pannello, con cosa chiedere nella chat; nessun bottone che scrive nella chat", async () => {
      rete(montaggioDi(true))
      render(<Cornice vista="video" />)
      fireEvent.click(await screen.findByRole("button", { name: /Piano cambiato/ }))
      const pannello = await screen.findByRole("dialog", { name: "Lavori" })
      expect(await within(pannello).findByText("Il piano è cambiato dopo l'inizio di questo montaggio: ripartirà da solo alla fine del passaggio in corso. Per non aspettare, fermalo con «Ferma» qui sopra e chiedi nella chat di rimontarlo.")).toBeInTheDocument()
      expect(within(pannello).queryByRole("button", { name: /Rimonta|chat|Claude/ })).not.toBeInTheDocument()
      expect(chiamate.filter((c) => c.metodo !== "GET")).toEqual([])
    })

    it("con il piano com'era all'inizio non avvisa", async () => {
      rete(montaggioDi(false))
      render(<Cornice vista="video" />)
      fireEvent.click(await screen.findByRole("button", { name: /Lavoro in corso/ }))
      const pannello = await screen.findByRole("dialog", { name: "Lavori" })
      await waitFor(() => expect(chiamate.some((c) => c.percorso === "/api/video/uno")).toBe(true))
      expect(within(pannello).queryByText(/Il piano è cambiato/)).not.toBeInTheDocument()
      expect(screen.queryByText(/Piano cambiato/)).not.toBeInTheDocument()
    })

    it("non si fida di un dettaglio che parla di un altro montaggio dello stesso video", async () => {
      rete(montaggioDi(true, "l0"))
      render(<Cornice vista="video" />)
      fireEvent.click(await screen.findByRole("button", { name: /Lavoro in corso/ }))
      const pannello = await screen.findByRole("dialog", { name: "Lavori" })
      await waitFor(() => expect(chiamate.some((c) => c.percorso === "/api/video/uno")).toBe(true))
      expect(within(pannello).queryByText(/Il piano è cambiato/)).not.toBeInTheDocument()
    })
  })

  it("senza lavori dice che la scheda video è libera", async () => {
    rete({ "GET /api/video": [] })
    render(<Cornice vista="girato" />)
    fireEvent.click(await screen.findByRole("button", { name: /Nessun lavoro/ }))
    expect(await screen.findByText(/la scheda video è libera/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Girato" })).toHaveAttribute("aria-current", "page")
  })

  it("«Registra» apre il pannello: si sceglie cosa registrare e parte", async () => {
    rete({ "GET /api/video": [], "POST /api/registrazione": registrazioneFerma })
    render(<Cornice vista="video" />)
    fireEvent.click(await screen.findByRole("button", { name: /Registra/ }))
    const pannello = await screen.findByRole("dialog", { name: "Registrazione" })
    expect(within(pannello).getByRole("radio", { name: "Schermo e voce" })).toBeChecked()
    expect(within(pannello).getByText(/Microfono di prova/)).toBeInTheDocument()
    fireEvent.click(within(pannello).getByRole("radio", { name: "Solo lo schermo" }))
    fireEvent.click(within(pannello).getByRole("button", { name: "Avvia la registrazione" }))
    await waitFor(() => expect(chiamate.find((c) => c.metodo === "POST" && c.percorso === "/api/registrazione")?.corpo).toEqual({ modo: "schermo" }))
  })

  it("si sceglie il microfono e la webcam fra quelli trovati, e la scelta si ricorda per la volta dopo", async () => {
    const dispositivi = { ...registrazioneFerma, dispositivi: { microfoni: ["Microfono uno", "Microfono due"], camere: ["OBS Virtual Camera", "Camera uno", "Camera due"] } }
    rete({ "GET /api/video": [], "GET /api/registrazione": dispositivi, "POST /api/registrazione": registrazioneFerma })
    const prima = render(<Cornice vista="video" />)
    fireEvent.click(await screen.findByRole("button", { name: /Registra/ }))
    let pannello = await screen.findByRole("dialog", { name: "Registrazione" })
    expect(within(pannello).queryByLabelText("Webcam")).toBeNull()
    expect(within(pannello).getByLabelText("Microfono")).toHaveValue("Microfono uno")
    fireEvent.click(within(pannello).getByRole("radio", { name: "Schermo, voce e viso" }))
    expect(within(pannello).getByLabelText("Webcam")).toHaveValue("Camera uno")
    fireEvent.change(within(pannello).getByLabelText("Microfono"), { target: { value: "Microfono due" } })
    fireEvent.change(within(pannello).getByLabelText("Webcam"), { target: { value: "OBS Virtual Camera" } })
    fireEvent.click(within(pannello).getByRole("button", { name: "Avvia la registrazione" }))
    await waitFor(() => expect(chiamate.find((c) => c.metodo === "POST" && c.percorso === "/api/registrazione")?.corpo).toEqual({ modo: "viso", microfono: "Microfono due", camera: "OBS Virtual Camera" }))
    prima.unmount()

    render(<Cornice vista="video" />)
    fireEvent.click(await screen.findByRole("button", { name: /Registra/ }))
    pannello = await screen.findByRole("dialog", { name: "Registrazione" })
    expect(within(pannello).getByLabelText("Microfono")).toHaveValue("Microfono due")
    fireEvent.click(within(pannello).getByRole("radio", { name: "Schermo, voce e viso" }))
    expect(within(pannello).getByLabelText("Webcam")).toHaveValue("OBS Virtual Camera")
  })

  it("un dispositivo ricordato che non c'è più lascia il posto al primo trovato; solo lo schermo non chiede niente", async () => {
    localStorage.setItem("mango-animation.registra.microfono", "Microfono sparito")
    rete({ "GET /api/video": [], "POST /api/registrazione": registrazioneFerma })
    render(<Cornice vista="video" />)
    fireEvent.click(await screen.findByRole("button", { name: /Registra/ }))
    const pannello = await screen.findByRole("dialog", { name: "Registrazione" })
    expect(within(pannello).getByLabelText("Microfono")).toHaveValue("Microfono di prova")
    fireEvent.click(within(pannello).getByRole("radio", { name: "Solo lo schermo" }))
    expect(within(pannello).queryByLabelText("Microfono")).toBeNull()
  })

  it("senza dispositivi trovati lo dice invece del menu", async () => {
    rete({ "GET /api/video": [], "GET /api/registrazione": { ...registrazioneFerma, dispositivi: { microfoni: [], camere: [] } } })
    render(<Cornice vista="video" />)
    fireEvent.click(await screen.findByRole("button", { name: /Registra/ }))
    const pannello = await screen.findByRole("dialog", { name: "Registrazione" })
    expect(within(pannello).getByText(/Microfono: nessuno trovato/)).toBeInTheDocument()
  })

  it("mentre registra lo dice nella barra, e dal pannello si ferma", async () => {
    const inCorso = { ...registrazioneFerma, in_corso: { modo: "voce", iniziata: "2026-10-11T13:00:00", file: ["2026-10-11/20261011-130000-schermo.mp4"] } }
    rete({ "GET /api/video": [], "GET /api/registrazione": inCorso, "DELETE /api/registrazione": registrazioneFerma })
    render(<Cornice vista="video" />)
    fireEvent.click(await screen.findByRole("button", { name: /Sto registrando/ }))
    const pannello = await screen.findByRole("dialog", { name: "Registrazione" })
    expect(within(pannello).getByText("20261011-130000-schermo.mp4")).toBeInTheDocument()
    fireEvent.click(within(pannello).getByRole("button", { name: "Ferma la registrazione" }))
    await waitFor(() => expect(chiamate.some((c) => c.metodo === "DELETE" && c.percorso === "/api/registrazione")).toBe(true))
  })

  it("se la registrazione non può partire, il pannello dice la frase del server", async () => {
    rete({ "GET /api/video": [], "POST /api/registrazione": errore(409, "Non trovo un microfono: collegalo, poi «Cerca di nuovo i dispositivi».") })
    render(<Cornice vista="video" />)
    fireEvent.click(await screen.findByRole("button", { name: /Registra/ }))
    fireEvent.click(await screen.findByRole("button", { name: "Avvia la registrazione" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Non trovo un microfono")
  })
})
