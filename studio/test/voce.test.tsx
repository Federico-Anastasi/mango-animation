// La dettatura nella chat, con un ponte finto al posto di quello dell'app (`app/src/voce/ponte.js`).
import { act, fireEvent, render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Compositore } from "../src/chat/Compositore"
import { Dettato, inserisciFrase, type EventoVoce, type PonteVoce } from "../src/chat/dettatura"
import { negozio } from "../src/chat/negozio"
import { scegliLingua, type Lingua } from "../src/lingua"

type Props = Parameters<typeof Compositore>[0]
const CHAT = { stato: "pronta" } as Props["chat"]
const ALLEGATI = { allegati: [], staSalendo: false, aggiungi: () => undefined, togli: () => undefined, svuota: () => undefined } as unknown as Props["allegati"]

/** Un evento come lo scrive la prova: l'`id` è quello della dettatura in corso, se non è detto. */
type Ev = EventoVoce extends infer T ? (T extends unknown ? Omit<T, "id"> & { id?: number } : never) : never

function ponteFinto(stato = { disponibile: true, in_ascolto: false }) {
  const ascoltatori = new Set<(e: EventoVoce) => void>()
  let ultimoId = 0
  let inCorso = 0
  const ponte = {
    stato: vi.fn(async (_lingua: Lingua) => stato),
    avvia: vi.fn(async (_lingua: Lingua) => (inCorso = ++ultimoId)),
    ferma: vi.fn(async (_lingua: Lingua) => undefined),
    su: vi.fn((f: (e: EventoVoce) => void) => {
      ascoltatori.add(f)
      return () => void ascoltatori.delete(f)
    }),
  } satisfies PonteVoce
  const manda = (...eventi: Ev[]) => act(() => eventi.forEach((e) => ascoltatori.forEach((f) => f({ ...e, id: e.id ?? inCorso } as EventoVoce))))
  window.__MANGO_ANIMATION__ = { voce: ponte }
  return { ponte, manda, ascoltatori }
}

const campo = () => screen.getByRole("textbox", { name: "Messaggio" }) as HTMLTextAreaElement
const microfono = () => screen.getByRole("button", { name: /Detta a voce|Finisci di dettare|Dictate by voice|Stop dictating/ })
const scrivi = (testo: string) => fireEvent.change(campo(), { target: { value: testo } })
const clic = async (el: HTMLElement) => void (await act(async () => fireEvent.click(el)))
const parziale = (testo: string, id?: number): Ev => ({ tipo: "parziale", testo, id })
const definitiva = (testo: string, id?: number): Ev => ({ tipo: "definitiva", testo, id })

beforeEach(() => {
  sessionStorage.clear()
  window.location.hash = ""
})
afterEach(() => {
  delete window.__MANGO_ANIMATION__
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe("dove compare il microfono", () => {
  it("nel browser, senza il ponte dell'app, non c'è", () => {
    render(<Compositore chat={CHAT} allegati={ALLEGATI} onLista={() => {}} />)
    expect(screen.queryByRole("button", { name: /Detta a voce/ })).toBeNull()
    expect(screen.getByRole("button", { name: "Allega un file" })).toBeInTheDocument()
  })

  it("nell'app c'è, accanto all'allegato, e dice la scorciatoia", () => {
    ponteFinto()
    render(<Compositore chat={CHAT} allegati={ALLEGATI} onLista={() => {}} />)
    expect(microfono()).toHaveAttribute("title", "Detta a voce (Ctrl+Spazio)")
    expect(microfono()).toHaveAttribute("aria-pressed", "false")
  })
})

describe("la lingua delle frasi dell'app", () => {
  afterEach(() => scegliLingua("it"))

  it.each(["it", "en"] as const)("l'app riceve la lingua dello studio (%s) a ogni comando", async (lingua) => {
    scegliLingua(lingua)
    const { ponte } = ponteFinto()
    render(<Compositore chat={CHAT} allegati={ALLEGATI} onLista={() => {}} />)
    await clic(microfono())
    await clic(microfono())
    expect(ponte.stato).toHaveBeenCalledWith(lingua)
    expect(ponte.avvia).toHaveBeenCalledWith(lingua)
    expect(ponte.ferma).toHaveBeenCalledWith(lingua)
  })
})

describe("mentre il creator parla", () => {
  it("un clic comincia: si vede che ascolta, col tempo e il livello", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] })
    const { ponte, manda } = ponteFinto()
    render(<Compositore chat={CHAT} allegati={ALLEGATI} onLista={() => {}} />)
    await clic(microfono())
    expect(ponte.avvia).toHaveBeenCalledTimes(1)
    expect(screen.getByText("Ti ascolto")).toBeInTheDocument()
    expect(microfono()).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByText("0:00")).toBeInTheDocument()
    act(() => void vi.advanceTimersByTime(65_000))
    expect(screen.getByText("1:05")).toBeInTheDocument()
    await manda({ tipo: "livello", valore: 0.5 })
    expect(document.querySelector("[aria-hidden='true'] > span[style*='width: 50%']")).not.toBeNull()
  })

  it("mentre il motore carica il modello lo dice, il livello si muove, e appena è pronto torna «Ti ascolto»", async () => {
    const { manda } = ponteFinto()
    render(<Compositore chat={CHAT} allegati={ALLEGATI} onLista={() => {}} />)
    await clic(microfono())
    await manda({ tipo: "preparo" }, { tipo: "livello", valore: 0.5 })
    expect(screen.getByText("Preparo la dettatura…")).toBeInTheDocument()
    expect(screen.queryByText("Ti ascolto")).toBeNull()
    expect(screen.getByText(/Puoi già parlare/)).toBeInTheDocument()
    expect(microfono()).toHaveAttribute("aria-pressed", "true")
    expect(document.querySelector("[aria-hidden='true'] > span[style*='width: 50%']")).not.toBeNull()
    await manda({ tipo: "ascolto" })
    expect(screen.getByText("Ti ascolto")).toBeInTheDocument()
    expect(screen.queryByText("Preparo la dettatura…")).toBeNull()
  })

  it("«Preparo» che arriva prima che l'avvio risponda si vede lo stesso, e una dettatura nuova non lo eredita", async () => {
    const { ponte, manda } = ponteFinto()
    ponte.avvia.mockImplementation(async () => {
      await manda({ tipo: "preparo", id: 1 })
      return 1
    })
    render(<Compositore chat={CHAT} allegati={ALLEGATI} onLista={() => {}} />)
    await clic(microfono())
    expect(screen.getByText("Preparo la dettatura…")).toBeInTheDocument()
    await clic(microfono())
    ponte.avvia.mockImplementation(async () => 2)
    await clic(microfono())
    expect(screen.getByText("Ti ascolto")).toBeInTheDocument()
  })

  it("le parole entrano nel campo mentre arrivano, e la striscia non le ripete", async () => {
    const { manda } = ponteFinto()
    render(<Compositore chat={CHAT} allegati={ALLEGATI} onLista={() => {}} />)
    await clic(microfono())
    await manda(parziale("Allora"))
    expect(campo()).toHaveValue("Allora")
    await manda(parziale("Allora dobbiamo"))
    expect(campo()).toHaveValue("Allora dobbiamo")
    await manda(parziale("Allora dobbiamo fare un nuovo video"))
    expect(campo()).toHaveValue("Allora dobbiamo fare un nuovo video")
    expect(screen.getByRole("status")).not.toHaveTextContent("dobbiamo")
    // la frase finita si chiude (anche con un testo un po' diverso), e la successiva comincia dopo
    await manda(definitiva("Allora, dobbiamo fare un nuovo video."))
    expect(campo()).toHaveValue("Allora, dobbiamo fare un nuovo video.")
    await manda(parziale("Ci sei"))
    expect(campo()).toHaveValue("Allora, dobbiamo fare un nuovo video. Ci sei")
    await manda(definitiva("Ci sei?"))
    expect(campo()).toHaveValue("Allora, dobbiamo fare un nuovo video. Ci sei?")
    expect(document.activeElement).toBe(campo())
  })

  it("niente parte da solo: il creator rilegge e manda con Invio", async () => {
    const invia = vi.spyOn(negozio, "invia").mockResolvedValue(undefined)
    const { manda } = ponteFinto()
    render(<Compositore chat={CHAT} allegati={ALLEGATI} onLista={() => {}} />)
    await clic(microfono())
    await manda(parziale("Apri il video"), definitiva("Apri il video del carosello."))
    expect(invia).not.toHaveBeenCalled()
    fireEvent.keyDown(campo(), { key: "Enter" })
    expect(invia).toHaveBeenCalledWith(expect.objectContaining({ testo: "Apri il video del carosello." }))
  })

  it("entra dove sta il cursore, al posto di ciò che è selezionato", async () => {
    const { manda } = ponteFinto()
    render(<Compositore chat={CHAT} allegati={ALLEGATI} onLista={() => {}} />)
    fireEvent.change(campo(), { target: { value: "Controlla XXX e basta" } })
    campo().setSelectionRange(10, 13)
    await clic(microfono())
    await manda(parziale("il"), parziale("il montaggio"))
    expect(campo()).toHaveValue("Controlla il montaggio e basta")
    await manda(definitiva("il montaggio"))
    expect(campo()).toHaveValue("Controlla il montaggio e basta")
    expect(campo().selectionStart).toBe("Controlla il montaggio".length)
  })

  it("due frasi di fila, prima che il campo si aggiorni, non si calpestano", async () => {
    const { manda } = ponteFinto()
    render(<Compositore chat={CHAT} allegati={ALLEGATI} onLista={() => {}} />)
    await clic(microfono())
    await manda(definitiva("Apri il video."), definitiva("Poi scrivi la didascalia."))
    expect(campo()).toHaveValue("Apri il video. Poi scrivi la didascalia.")
  })

  it("se il creator scrive a mano durante la dettatura, la frase in corso riparte dal cursore nuovo, senza ripetere", async () => {
    const { manda } = ponteFinto()
    render(<Compositore chat={CHAT} allegati={ALLEGATI} onLista={() => {}} />)
    await clic(microfono())
    await manda(parziale("Allora dobbiamo"))
    fireEvent.change(campo(), { target: { value: "Allora dobbiamo ehm" } })
    campo().setSelectionRange(19, 19)
    await manda(parziale("Allora dobbiamo fare"))
    expect(campo()).toHaveValue("Allora dobbiamo ehm fare")
    await manda(definitiva("Allora dobbiamo fare un video."))
    expect(campo()).toHaveValue("Allora dobbiamo ehm fare un video.")
    // la frase dopo non porta niente di quella di prima
    await manda(definitiva("Ci sei?"))
    expect(campo()).toHaveValue("Allora dobbiamo ehm fare un video. Ci sei?")
  })

  it("mandare il messaggio con Invio spegne il microfono, e ciò che il servizio consegna dopo non torna nel campo", async () => {
    const invia = vi.spyOn(negozio, "invia").mockResolvedValue(undefined)
    const { ponte, manda } = ponteFinto()
    render(<Compositore chat={CHAT} allegati={ALLEGATI} onLista={() => {}} />)
    await clic(microfono())
    await manda(parziale("Apri il video"))
    await act(async () => void fireEvent.keyDown(campo(), { key: "Enter" }))
    expect(invia).toHaveBeenCalledWith(expect.objectContaining({ testo: "Apri il video" }))
    expect(ponte.ferma).toHaveBeenCalledTimes(1)
    expect(microfono()).toHaveAttribute("aria-pressed", "false")
    expect(screen.queryByText("Ti ascolto")).toBeNull()
    await manda(parziale("Apri il video del carosello"), definitiva("Apri il video del carosello."), { tipo: "fine" })
    expect(campo()).toHaveValue("")
  })

  it("anche col bottone «Manda» il microfono si spegne", async () => {
    vi.spyOn(negozio, "invia").mockResolvedValue(undefined)
    const { ponte, manda } = ponteFinto()
    render(<Compositore chat={CHAT} allegati={ALLEGATI} onLista={() => {}} />)
    await clic(microfono())
    await manda(definitiva("Fammi vedere le slide."))
    await clic(screen.getByRole("button", { name: "Manda" }))
    expect(ponte.ferma).toHaveBeenCalledTimes(1)
    expect(microfono()).toHaveAttribute("aria-pressed", "false")
  })

  it("mandato mentre il microfono si sta aprendo, appena aperto si richiude", async () => {
    vi.spyOn(negozio, "invia").mockResolvedValue(undefined)
    const { ponte } = ponteFinto()
    let apri = (_id: number) => undefined as void
    ponte.avvia.mockReturnValue(new Promise<number>((r) => (apri = r)))
    render(<Compositore chat={CHAT} allegati={ALLEGATI} onLista={() => {}} />)
    scrivi("Ciao")
    await clic(microfono())
    expect(screen.getByText("Apro il microfono…")).toBeInTheDocument()
    await act(async () => void fireEvent.keyDown(campo(), { key: "Enter" }))
    await act(async () => apri(1))
    expect(ponte.ferma).toHaveBeenCalledTimes(1)
    expect(microfono()).toHaveAttribute("aria-pressed", "false")
    expect(screen.queryByText("Ti ascolto")).toBeNull()
  })

  it("con il microfono spento, mandare non lo tocca", async () => {
    vi.spyOn(negozio, "invia").mockResolvedValue(undefined)
    const { ponte } = ponteFinto()
    render(<Compositore chat={CHAT} allegati={ALLEGATI} onLista={() => {}} />)
    scrivi("Ciao")
    await act(async () => void fireEvent.keyDown(campo(), { key: "Enter" }))
    expect(ponte.ferma).not.toHaveBeenCalled()
  })

  it("Ctrl+Spazio fa lo stesso del clic, anche con il cursore nel campo", async () => {
    const { ponte } = ponteFinto()
    render(<Compositore chat={CHAT} allegati={ALLEGATI} onLista={() => {}} />)
    campo().focus()
    await act(async () => void fireEvent.keyDown(campo(), { key: " ", code: "Space", ctrlKey: true }))
    expect(ponte.avvia).toHaveBeenCalledTimes(1)
    await act(async () => void fireEvent.keyDown(campo(), { key: " ", code: "Space", ctrlKey: true }))
    expect(ponte.ferma).toHaveBeenCalledTimes(1)
    // Spazio da solo è uno spazio
    await act(async () => void fireEvent.keyDown(campo(), { key: " ", code: "Space" }))
    expect(ponte.avvia).toHaveBeenCalledTimes(1)
  })

  it("se il servizio si chiude da solo, torna a riposo", async () => {
    const { manda } = ponteFinto()
    render(<Compositore chat={CHAT} allegati={ALLEGATI} onLista={() => {}} />)
    await clic(microfono())
    await manda(definitiva("Basta così."), { tipo: "fine" })
    expect(campo()).toHaveValue("Basta così.")
    expect(microfono()).toHaveAttribute("aria-pressed", "false")
    expect(screen.queryByText("Ti ascolto")).toBeNull()
  })

  it("una pagina ricaricata a dettatura accesa riprende da lì", async () => {
    const { ponte, manda } = ponteFinto({ disponibile: true, in_ascolto: true })
    render(<Compositore chat={CHAT} allegati={ALLEGATI} onLista={() => {}} />)
    expect(await screen.findByText("Ti ascolto")).toBeInTheDocument()
    await manda({ ...parziale("Apri il video"), id: 7 })
    expect(campo()).toHaveValue("Apri il video")
    await clic(microfono())
    expect(ponte.ferma).toHaveBeenCalled()
  })

  it("chiusa la chat il microfono non resta acceso", async () => {
    const { ponte, ascoltatori } = ponteFinto()
    const { unmount } = render(<Compositore chat={CHAT} allegati={ALLEGATI} onLista={() => {}} />)
    await clic(microfono())
    unmount()
    expect(ponte.ferma).toHaveBeenCalledTimes(1)
    expect(ascoltatori.size).toBe(0)
  })
})

describe("finire", () => {
  it("il clic per finire rimette subito a riposo, anche se l'app non risponde e `fine` non arriva", async () => {
    const { ponte, manda } = ponteFinto()
    ponte.ferma.mockReturnValue(new Promise(() => undefined))
    render(<Compositore chat={CHAT} allegati={ALLEGATI} onLista={() => {}} />)
    await clic(microfono())
    await manda(parziale("Apri il video"))
    await clic(microfono())
    expect(ponte.ferma).toHaveBeenCalledTimes(1)
    expect(microfono()).toBeEnabled()
    expect(microfono()).toHaveAttribute("aria-pressed", "false")
    expect(screen.queryByText("Ti ascolto")).toBeNull()
    expect(screen.queryByText(/Un attimo|Trascrivo/)).toBeNull()
    expect(campo()).toHaveValue("Apri il video")
    // si può già ricominciare
    await clic(microfono())
    expect(ponte.avvia).toHaveBeenCalledTimes(2)
  })

  it("le ultime parole, che il servizio consegna dopo lo stop, entrano ancora nel campo", async () => {
    const { manda } = ponteFinto()
    render(<Compositore chat={CHAT} allegati={ALLEGATI} onLista={() => {}} />)
    await clic(microfono())
    await manda(parziale("Apri il video del"))
    await clic(microfono())
    await manda(parziale("Apri il video del carosello"))
    expect(campo()).toHaveValue("Apri il video del carosello")
    await manda(definitiva("Apri il video del carosello."), { tipo: "fine" })
    expect(campo()).toHaveValue("Apri il video del carosello.")
    expect(microfono()).toBeEnabled()
  })

  it("gli eventi di una dettatura vecchia si ignorano appena ne comincia un'altra", async () => {
    const { manda } = ponteFinto()
    render(<Compositore chat={CHAT} allegati={ALLEGATI} onLista={() => {}} />)
    await clic(microfono())
    await manda(parziale("Prima"))
    await clic(microfono())
    await clic(microfono())
    await manda(definitiva("parole in ritardo della prima", 1), { tipo: "errore", messaggio: "errore della prima", id: 1 })
    expect(campo()).toHaveValue("Prima")
    expect(screen.queryByRole("alert")).toBeNull()
    await manda(parziale("Seconda"))
    expect(campo()).toHaveValue("Prima Seconda")
  })

  it("gli eventi della nuova dettatura arrivati prima della risposta di `avvia` non si perdono", async () => {
    const { ponte, manda } = ponteFinto()
    let risolvi: (id: number) => void = () => undefined
    ponte.avvia.mockReturnValue(new Promise<number>((ok) => (risolvi = ok)))
    render(<Compositore chat={CHAT} allegati={ALLEGATI} onLista={() => {}} />)
    await clic(microfono())
    expect(microfono()).toBeDisabled()
    await manda({ ...parziale("Apri il video"), id: 5 }, { ...parziale("di una vecchia"), id: 4 })
    expect(campo()).toHaveValue("")
    await act(async () => risolvi(5))
    expect(campo()).toHaveValue("Apri il video")
    expect(screen.getByText("Ti ascolto")).toBeInTheDocument()
  })
})

describe("quando non va", () => {
  it("senza microfono lo dice con le parole dell'app e resta a riposo", async () => {
    const { ponte } = ponteFinto()
    ponte.avvia.mockRejectedValue({ code: "microfono_assente", message: "Non trovo nessun microfono: collegane uno." })
    render(<Compositore chat={CHAT} allegati={ALLEGATI} onLista={() => {}} />)
    await clic(microfono())
    expect(screen.getByRole("alert")).toHaveTextContent("Non trovo nessun microfono: collegane uno.")
    expect(screen.queryByText("Ti ascolto")).toBeNull()
    expect(microfono()).toBeEnabled()
    // un altro tentativo toglie l'errore vecchio
    ponte.avvia.mockResolvedValue(3)
    await clic(microfono())
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.getByText("Ti ascolto")).toBeInTheDocument()
  })

  it("con Python mancante dice cosa fare", async () => {
    const { ponte } = ponteFinto()
    ponte.avvia.mockRejectedValue({ code: "python_mancante", message: "Non trovo Python, che serve alla dettatura: si installa da python.org (con «Add to PATH»), poi si riapre l'app." })
    render(<Compositore chat={CHAT} allegati={ALLEGATI} onLista={() => {}} />)
    await clic(microfono())
    expect(screen.getByRole("alert")).toHaveTextContent("Non trovo Python")
  })

  it("un rifiuto senza parole è comunque una frase chiara", async () => {
    const { ponte } = ponteFinto()
    ponte.avvia.mockRejectedValue(undefined)
    render(<Compositore chat={CHAT} allegati={ALLEGATI} onLista={() => {}} />)
    await clic(microfono())
    expect(screen.getByRole("alert")).toHaveTextContent("La dettatura non risponde.")
  })

  it("un errore a metà dettatura si vede e il testo già scritto resta", async () => {
    const { manda } = ponteFinto()
    render(<Compositore chat={CHAT} allegati={ALLEGATI} onLista={() => {}} />)
    await clic(microfono())
    await manda(parziale("Apri il video"), { tipo: "errore", messaggio: "trascrizione fallita" }, { tipo: "fine" })
    expect(screen.getByRole("alert")).toHaveTextContent("trascrizione fallita")
    expect(campo()).toHaveValue("Apri il video")
    expect(microfono()).toHaveAttribute("aria-pressed", "false")
  })
})

describe("il testo nel campo", () => {
  it("si attacca con uno spazio solo dove serve", () => {
    expect(inserisciFrase("", 0, 0, "ciao")).toMatchObject({ testo: "ciao", cursore: 4 })
    expect(inserisciFrase("Apri", 4, 4, "il video")).toMatchObject({ testo: "Apri il video", cursore: 13 })
    expect(inserisciFrase("Apri ", 5, 5, "il video")).toMatchObject({ testo: "Apri il video", cursore: 13 })
    expect(inserisciFrase("Apri\n", 5, 5, "il video")).toMatchObject({ testo: "Apri\nil video", cursore: 13 })
    expect(inserisciFrase("a  c", 2, 2, " b ")).toMatchObject({ testo: "a b c", cursore: 3 })
    expect(inserisciFrase("a c", 1, 1, "b")).toMatchObject({ testo: "a b c", cursore: 3, frase: { da: 2, a: 3 } })
  })

  it("la frase in corso si sostituisce, quella finita si chiude", () => {
    const d = new Dettato()
    const punto = { da: 0, a: 0 }
    expect(d.parziale("", punto, "")).toBeNull()
    expect(d.parziale("", punto, "Apri")).toEqual({ testo: "Apri", cursore: 4 })
    expect(d.parziale("Apri", punto, "Apri il video")).toEqual({ testo: "Apri il video", cursore: 13 })
    expect(d.definitiva("Apri il video", punto, "Apri il video.")).toEqual({ testo: "Apri il video.", cursore: 14 })
    expect(d.parziale("Apri il video.", { da: 14, a: 14 }, "Poi")).toEqual({ testo: "Apri il video. Poi", cursore: 18 })
  })
})

describe("il ponte dell'app", () => {
  it("chiama i comandi della voce, dà l'id di `avvia` e passa gli eventi", async () => {
    const invoke = vi.fn(async (comando: string, _argomenti: { lingua: Lingua }) => (comando.endsWith("voce_avvia") ? 7 : comando.endsWith("voce_stato") ? { disponibile: true, in_ascolto: false } : undefined))
    const finestra = window as unknown as { __TAURI_INTERNALS__?: unknown }
    finestra.__TAURI_INTERNALS__ = { invoke }
    // lo script gira come nella finestra dell'app: in cima alla pagina, con `window`
    new Function(readFileSync("../app/src/voce/ponte.js", "utf8"))()
    const voce = window.__MANGO_ANIMATION__?.voce
    expect(voce).toBeDefined()
    expect(await voce!.avvia("en")).toBe(7)
    await voce!.ferma("en")
    await voce!.stato("en")
    expect(invoke.mock.calls.map((c) => c[0])).toEqual(["plugin:mango-animation-voce|voce_avvia", "plugin:mango-animation-voce|voce_ferma", "plugin:mango-animation-voce|voce_stato"])
    expect(invoke.mock.calls.map((c) => c[1])).toEqual([{ lingua: "en" }, { lingua: "en" }, { lingua: "en" }])
    const visti: EventoVoce[] = []
    const smetti = voce!.su((e) => visti.push(e))
    window.dispatchEvent(new CustomEvent("mango-voce", { detail: { id: 7, tipo: "ascolto" } }))
    smetti()
    window.dispatchEvent(new CustomEvent("mango-voce", { detail: { id: 7, tipo: "fine" } }))
    expect(visti).toEqual([{ id: 7, tipo: "ascolto" }])
    delete finestra.__TAURI_INTERNALS__
  })
})
