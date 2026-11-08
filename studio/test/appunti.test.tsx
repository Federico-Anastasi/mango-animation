// Gli allegati dagli appunti: un file copiato in Esplora risorse, quando la pagina non lo riceve dal browser, lo legge l'app.
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Compositore } from "../src/chat/Compositore"
import { useAllegati } from "../src/chat/useAllegati"
import { errore, installaRete, type Chiamata } from "./rete"

const CHAT = { stato: "pronta" } as Parameters<typeof Compositore>[0]["chat"]

function Prova() {
  const allegati = useAllegati()
  return <Compositore chat={CHAT} allegati={allegati} onLista={() => {}} />
}

const campo = () => screen.getByRole("textbox", { name: "Messaggio" })
const appunti = (percorsi: string[] | Error) => {
  const leggi = vi.fn(async () => {
    if (percorsi instanceof Error) throw percorsi
    return percorsi
  })
  window.__MANGO_ANIMATION__ = { appunti: { percorsi: leggi } }
  return leggi
}
/** Un Ctrl+V: `files` e `testo` sono ciò che il browser mette in `clipboardData`. Torna `false` se la pagina ha preso il gesto. */
const incolla = (files: File[] = [], testo = "") =>
  fireEvent.paste(campo(), { clipboardData: { files, types: [...(files.length > 0 ? ["Files"] : []), ...(testo === "" ? [] : ["text/plain"])], getData: () => testo } })

let chiamate: Chiamata[]

beforeEach(() => {
  sessionStorage.clear()
  window.location.hash = ""
})
afterEach(() => {
  delete window.__MANGO_ANIMATION__
  vi.unstubAllGlobals()
})

describe("Ctrl+V senza file dal browser", () => {
  it("nell'app un file copiato in Esplora risorse diventa un allegato: la pagina chiede all'app i percorsi e il server li copia", async () => {
    ;({ chiamate } = installaRete({ "POST /api/chat/allegati/locale": (c: Chiamata) => ({ percorso: `.chat/allegati/${String((c.corpo as { percorso: string }).percorso).split("\\").pop()}` }) }))
    const leggi = appunti(["C:\\Users\\utente\\Desktop\\nota di prova.txt", "D:\\video\\giro.mov"])
    render(<Prova />)
    expect(incolla()).toBe(false)
    expect(await screen.findByText("nota di prova.txt")).toBeInTheDocument()
    expect(await screen.findByText("giro.mov")).toBeInTheDocument()
    expect(leggi).toHaveBeenCalledTimes(1)
    expect(chiamate.filter((c) => c.metodo === "POST").map((c) => c.corpo)).toEqual([{ percorso: "C:\\Users\\utente\\Desktop\\nota di prova.txt" }, { percorso: "D:\\video\\giro.mov" }])
    await waitFor(() => expect(screen.getByRole("button", { name: "Manda" })).toBeEnabled())
  })

  it("un'immagine copiata come file si vede in anteprima quando è salita", async () => {
    installaRete({ "POST /api/chat/allegati/locale": { percorso: ".chat/allegati/schermata.png" } })
    appunti(["C:\\Users\\utente\\Immagini\\schermata.png"])
    render(<Prova />)
    incolla()
    const anteprima = await screen.findByRole("img", { name: "schermata.png" })
    expect(anteprima).toHaveAttribute("src", "/media/.chat/allegati/schermata.png")
  })

  it("se il server non può copiare il file lo dice sull'allegato", async () => {
    installaRete({ "POST /api/chat/allegati/locale": () => errore(413, "Il file è troppo grande.") })
    appunti(["C:\\Users\\utente\\Video\\enorme.mov"])
    render(<Prova />)
    incolla()
    expect(await screen.findByText(/Non caricato: Il file è troppo grande\./)).toBeInTheDocument()
  })

  it("niente nell'appunti: non succede niente, e non sparisce nessun gesto utile", async () => {
    ;({ chiamate } = installaRete({}))
    const leggi = appunti([])
    render(<Prova />)
    incolla()
    await waitFor(() => expect(leggi).toHaveBeenCalled())
    expect(screen.queryByRole("list", { name: "Allegati" })).toBeNull()
    expect(chiamate.filter((c) => c.metodo === "POST")).toHaveLength(0)
  })

  it("se l'app non riesce a leggere gli appunti lo dice", async () => {
    installaRete({})
    appunti(new Error("Gli appunti sono usati da un altro programma."))
    render(<Prova />)
    incolla()
    expect(await screen.findByRole("alert")).toHaveTextContent("Gli appunti sono usati da un altro programma.")
    expect(screen.queryByRole("list", { name: "Allegati" })).toBeNull()
  })
})

describe("le altre incollate restano com'erano", () => {
  it("il testo copiato resta testo: la pagina non chiede niente all'app e non ferma l'incolla", () => {
    installaRete({})
    const leggi = appunti(["C:\\Users\\utente\\Desktop\\nota.txt"])
    render(<Prova />)
    expect(incolla([], "una frase copiata")).toBe(true)
    expect(leggi).not.toHaveBeenCalled()
  })

  it("se il browser dà già i file, si allegano quelli e l'app non è interpellata", async () => {
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:x" }))
    installaRete({ "POST /api/chat/allegati": { percorso: ".chat/allegati/foto.png" } })
    const leggi = appunti(["C:\\Users\\utente\\Desktop\\nota.txt"])
    render(<Prova />)
    expect(incolla([new File(["x"], "foto.png", { type: "image/png" })])).toBe(false)
    expect(await screen.findByRole("img", { name: "foto.png" })).toBeInTheDocument()
    expect(leggi).not.toHaveBeenCalled()
  })

  it("nel browser, senza l'app, Ctrl+V senza file né testo non fa niente", () => {
    installaRete({})
    render(<Prova />)
    expect(incolla()).toBe(true)
  })
})
