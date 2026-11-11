import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Motori } from "../src/motori/Motori"
import { scegliLingua } from "../src/lingua"
import type { Motori as MotoriDelProfilo } from "../src/tipi"
import type { ComputerLetto } from "../src/motori/computer"
import { errore, installaEventi, installaRete, type Chiamata } from "./rete"

let chiamate: Chiamata[]
let salvati: MotoriDelProfilo

function rete(iniziali: MotoriDelProfilo, put: unknown = (c: Chiamata) => (salvati = c.corpo as MotoriDelProfilo), macchina: object = {}) {
  salvati = iniziali
  chiamate = installaRete({ "GET /api/motori": () => salvati, "PUT /api/motori": put, "GET /api/macchina": macchina }).chiamate
}

const scheda = (extra: Partial<ComputerLetto["schede"][number]> = {}) => ({ indice: 0, nome: "RTX 3060 Ti", memoria_mb: 8192, libera_mb: 7000, capacita: "8.6", ...extra })
const computerDiProva = (extra: Partial<ComputerLetto> = {}): ComputerLetto => ({ schede: [scheda()], processore: "Ryzen 7", thread: 16, ram_mb: 32768, disco_libero_mb: 204800, ...extra })

/** Il ponte dell'app: nel browser non c'è, e le prove lo mettono come lo mette la finestra. */
function conApp(leggi: () => Promise<ComputerLetto>) {
  window.__MANGO_ANIMATION__ = { computer: { leggi } }
}

const puts = () => chiamate.filter((c) => c.metodo === "PUT").map((c) => c.corpo)

beforeEach(() => {
  installaEventi()
})
afterEach(() => {
  vi.unstubAllGlobals()
  delete window.__MANGO_ANIMATION__
})

describe("la pagina dei motori", () => {
  it("elenca le funzioni con l'interruttore e il dove; una funzione senza indicazioni è voluta e decisa dal computer", async () => {
    rete({ sagoma: { attiva: false }, trascrizione: { dove: "scheda", modello: "small" } })
    render(<Motori />)
    expect(await screen.findByRole("heading", { name: "Capire cosa dico" })).toBeInTheDocument()
    expect(screen.getAllByRole("switch")).toHaveLength(6)
    expect(screen.getByRole("switch", { name: "Capire cosa dico" })).toBeChecked()
    expect(screen.getByRole("switch", { name: "La mia sagoma sopra le animazioni" })).not.toBeChecked()
    expect(screen.getByLabelText("Dove gira: Capire cosa dico")).toHaveValue("scheda")
    expect(screen.getByLabelText("Dove gira: Tagli precisi sulle parole")).toHaveValue("automatico")
    expect(screen.getByLabelText("Dove gira: La mia sagoma sopra le animazioni")).toBeDisabled()
    expect(screen.queryByLabelText("Dove gira: Voce pulita")).toBeNull()
  })

  it("spegnere una funzione scrive la sezione intera, senza perdere ciò che lo studio non mostra", async () => {
    rete({ trascrizione: { dove: "scheda", modello: "small", calcolo: "int8" } })
    render(<Motori />)
    fireEvent.click(await screen.findByRole("switch", { name: "Capire cosa dico" }))
    await waitFor(() => expect(puts()).toHaveLength(1))
    expect(puts()[0]).toEqual({ trascrizione: { attiva: false, dove: "scheda", modello: "small", calcolo: "int8" } })
    await waitFor(() => expect(screen.getByRole("switch", { name: "Capire cosa dico" })).not.toBeChecked())
  })

  it("scegliere dove gira scrive `dove`; «come decide il computer» lo toglie", async () => {
    rete({ trascrizione: { attiva: true } })
    render(<Motori />)
    const menu = await screen.findByLabelText("Dove gira: Capire cosa dico")
    fireEvent.change(menu, { target: { value: "processore" } })
    await waitFor(() => expect(puts()).toHaveLength(1))
    expect(puts()[0]).toEqual({ trascrizione: { attiva: true, dove: "processore" } })
    await waitFor(() => expect(screen.getByLabelText("Dove gira: Capire cosa dico")).toHaveValue("processore"))
    fireEvent.change(screen.getByLabelText("Dove gira: Capire cosa dico"), { target: { value: "automatico" } })
    await waitFor(() => expect(puts()).toHaveLength(2))
    expect(puts()[1]).toEqual({ trascrizione: { attiva: true } })
  })

  it("se il server rifiuta, la sua frase si legge e la scelta resta com'era", async () => {
    rete({}, () => errore(400, "I motori non sono validi: sagoma.dove: deve essere uno fra: scheda, processore"))
    render(<Motori />)
    fireEvent.click(await screen.findByRole("switch", { name: "Voce pulita" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("I motori non sono validi")
    expect(screen.getByRole("switch", { name: "Voce pulita" })).toBeChecked()
  })

  describe("cosa ha il computer", () => {
    it("nel browser senza l'app dice che il controllo del computer c'è solo nell'app, e le scelte restano possibili", async () => {
      rete({})
      render(<Motori />)
      expect(await screen.findByText(/Il controllo del computer c'è solo nell'app/)).toBeInTheDocument()
      expect(screen.getAllByRole("option", { name: "Scheda video" })[0]).toBeEnabled()
    })

    it("mostra la scheda con la sua memoria, il processore, la memoria e il disco", async () => {
      conApp(async () => computerDiProva())
      rete({})
      render(<Motori />)
      const sezione = await screen.findByRole("region", { name: "Questo computer" })
      expect(await within(sezione).findByText(/RTX 3060 Ti: 6,84 GB liberi su 8,00 GB, capacità di calcolo 8\.6/)).toBeInTheDocument()
      expect(within(sezione).getByText("Ryzen 7, 16 thread")).toBeInTheDocument()
      expect(within(sezione).getByText("32,00 GB")).toBeInTheDocument()
      expect(within(sezione).getByText("200,0 GB dove l'app scarica")).toBeInTheDocument()
    })

    it("dice per ogni funzione dove gira: la scelta del computer, la scheda scelta, il processore scelto", async () => {
      conApp(async () => computerDiProva())
      rete({ trascrizione: { dove: "scheda" }, sagoma: { dove: "processore" } })
      render(<Motori />)
      expect(await screen.findByText("Gira sulla scheda RTX 3060 Ti, con 6,84 GB liberi.")).toBeInTheDocument()
      expect(screen.getByText("Gira sul processore (16 thread).")).toBeInTheDocument()
      expect(screen.getAllByText(/Decide il computer\. Gira sulla scheda RTX 3060 Ti/).length).toBeGreaterThan(0)
    })

    it("senza scheda NVIDIA la scheda non si può scegliere, e una già scelta si dice subito, prima di un lavoro", async () => {
      conApp(async () => computerDiProva({ schede: [] }))
      rete({ trascrizione: { dove: "scheda" } })
      render(<Motori />)
      expect(await screen.findByText("nessuna scheda NVIDIA")).toBeInTheDocument()
      expect(screen.getByRole("alert")).toHaveTextContent("In questo computer non c'è una scheda NVIDIA.")
      expect(within(screen.getByLabelText("Dove gira: Tagli precisi sulle parole")).getByRole("option", { name: "Scheda video (non possibile qui)" })).toBeDisabled()
      expect(screen.getAllByText(/Decide il computer\. Gira sul processore/).length).toBeGreaterThan(0)
    })

    it("la scheda che il profilo indica ma non c'è, e il profilo che la esclude", async () => {
      conApp(async () => computerDiProva())
      rete({ sagoma: { dove: "scheda" } }, undefined, { scheda_video: 3 })
      const prima = render(<Motori />)
      expect(await screen.findByText(/La scheda 3 che il profilo indica non c'è: le schede trovate sono 0 \(RTX 3060 Ti\)/)).toBeInTheDocument()
      prima.unmount()
      rete({ sagoma: { dove: "scheda" } }, undefined, { scheda_video: null })
      render(<Motori />)
      expect(await screen.findByText(/Il profilo di questo computer esclude la scheda video/)).toBeInTheDocument()
    })

    it("avvisa di poca memoria sulla scheda e di pochi thread per la sagoma sul processore", async () => {
      conApp(async () => computerDiProva({ schede: [scheda({ libera_mb: 900 })], thread: 4 }))
      rete({ trascrizione: { dove: "scheda" }, sagoma: { dove: "processore" } })
      render(<Motori />)
      expect((await screen.findAllByText(/Sulla scheda RTX 3060 Ti ci sono liberi 900,0 MB e di solito ne servono 2,00 GB/)).length).toBeGreaterThan(0)
      expect(screen.getByText(/Sul processore la sagoma è lenta: questo ha 4 thread e ne servono 8/)).toBeInTheDocument()
    })

    it("una scheda troppo vecchia non si può scegliere", async () => {
      conApp(async () => computerDiProva({ schede: [scheda({ nome: "GTX 750", capacita: "3.5" })] }))
      rete({ allineamento: { dove: "scheda" } })
      render(<Motori />)
      expect(await screen.findByText(/La scheda GTX 750 è troppo vecchia per i modelli \(capacità di calcolo 3\.5: ne serve 5\.0 o più\)/)).toBeInTheDocument()
    })

    it("la scelta della scheda non possibile non parte: l'opzione è spenta; il processore sì", async () => {
      conApp(async () => computerDiProva({ schede: [] }))
      rete({})
      render(<Motori />)
      const menu = await screen.findByLabelText("Dove gira: Capire cosa dico")
      await waitFor(() => expect(within(menu).getByRole("option", { name: "Scheda video (non possibile qui)" })).toBeDisabled())
      fireEvent.change(menu, { target: { value: "processore" } })
      await waitFor(() => expect(puts()).toHaveLength(1))
      expect(puts()[0]).toEqual({ trascrizione: { dove: "processore" } })
    })

    it("«Controlla di nuovo» rilegge il computer, e se l'app non risponde lo dice", async () => {
      let n = 0
      conApp(async () => {
        n += 1
        if (n === 1) return computerDiProva()
        throw new Error("nvidia-smi non risponde")
      })
      rete({})
      render(<Motori />)
      fireEvent.click(await screen.findByRole("button", { name: "Controlla di nuovo" }))
      expect(await screen.findByText(/Non riesco a guardare il computer: nvidia-smi non risponde/)).toBeInTheDocument()
    })

    it("in inglese i testi del computer sono inglesi", async () => {
      scegliLingua("en")
      conApp(async () => computerDiProva())
      rete({ trascrizione: { dove: "scheda" } })
      render(<Motori />)
      const sezione = await screen.findByRole("region", { name: "This computer" })
      expect(await within(sezione).findByText(/RTX 3060 Ti: 6\.84 GB free of 8\.00 GB, compute capability 8\.6/)).toBeInTheDocument()
      expect(screen.getByText("It runs on the card RTX 3060 Ti, with 6.84 GB free.")).toBeInTheDocument()
    })
  })

  it("in inglese i testi sono inglesi", async () => {
    scegliLingua("en")
    rete({})
    render(<Motori />)
    expect(await screen.findByRole("heading", { name: "Understanding what I say" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Computer" })).toBeInTheDocument()
    expect(screen.getAllByText("I want it")).toHaveLength(6)
    expect(screen.getByLabelText("Where it runs: Understanding what I say")).toBeInTheDocument()
    expect(screen.queryByText("La voglio")).toBeNull()
  })
})
