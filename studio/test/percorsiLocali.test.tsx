import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Markdown } from "../src/chat/Markdown"
import { percorsoDelComputer } from "../src/chat/percorsiLocali"
import { errore, installaRete } from "./rete"

afterEach(() => vi.unstubAllGlobals())

const DA_NON_LINKARE = ["/C:/Users/Alice/Documents", "/archivio/video/orto/uscite/finale.mp4", "//server/share", "file:///C:/Users/Alice/Documents", "C:\\Users\\Alice\\Documents", "C:/Users/Alice", "\\\\server\\share", "video/orto/uscite/finale.mp4"]

describe("i percorsi del computer nei messaggi", () => {
  it.each(DA_NON_LINKARE)("%s non diventa mai un collegamento che porta la finestra altrove", (percorso) => {
    const { container } = render(<Markdown testo={`Guarda [qui](${percorso}) e basta`} />)
    expect(container.querySelectorAll("a")).toHaveLength(0)
    expect(container.querySelector("[target]")).toBeNull()
  })

  it("i collegamenti web, di posta e interni restano collegamenti", () => {
    const { container } = render(<Markdown testo={"[a](https://esempio.it) [b](mailto:a@b.it) [c](#/video/orto)"} />)
    expect([...container.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(["https://esempio.it", "mailto:a@b.it", "#/video/orto"])
  })

  it("un indirizzo di un altro tipo, come javascript:, non è né un collegamento né un percorso", () => {
    const { container } = render(<Markdown testo={"[cattivo](javascript:alert(1)) [dati](data:text/html,x)"} />)
    expect(container.querySelectorAll("a, button")).toHaveLength(0)
  })

  it("un percorso dentro l'archivio apre la cartella con la rotta del server, in tutte le forme", async () => {
    const { chiamate } = installaRete({ "POST /api/apri": { ok: true } })
    render(<Markdown testo={"[uno](/archivio/video/orto/uscite/finale.mp4) [due](file:///C:/Users/Alice/archivio/video/orto) [tre](C:\\Users\\Alice\\archivio\\video\\pane)"} />)
    for (const nome of ["uno", "due", "tre"]) fireEvent.click(screen.getByRole("button", { name: nome }))
    await waitFor(() => expect(chiamate).toHaveLength(3))
    expect(chiamate.map((c) => c.corpo)).toEqual([{ percorso: "video/orto/uscite/finale.mp4" }, { percorso: "video/orto" }, { percorso: "video/pane" }])
  })

  it("se il server non apre il percorso, la frase del server resta sotto gli occhi", async () => {
    installaRete({ "POST /api/apri": () => errore(404, "Questo file o cartella non c'è nell'archivio.") })
    render(<Markdown testo={"[qui](/archivio/video/orto)"} />)
    fireEvent.click(screen.getByRole("button", { name: "qui" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Questo file o cartella non c'è nell'archivio.")
  })

  it("un percorso fuori dall'archivio si mostra come testo, con «Copia»", async () => {
    const scrivi = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { value: { writeText: scrivi }, configurable: true })
    render(<Markdown testo={"[Documenti](C:\\Users\\Alice\\Documenti)"} />)
    expect(screen.getByText("C:\\Users\\Alice\\Documenti")).toBeInTheDocument()
    expect(screen.getByText("Documenti")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Copia/ }))
    await waitFor(() => expect(scrivi).toHaveBeenCalledWith("C:\\Users\\Alice\\Documenti"))
  })

  it("se il testo del collegamento è già il percorso, il percorso compare una volta sola", () => {
    render(<Markdown testo={"[C:/Users/Alice/Documenti](C:/Users/Alice/Documenti)"} />)
    expect(screen.getAllByText("C:/Users/Alice/Documenti")).toHaveLength(1)
  })
})

describe("come si riconosce un percorso", () => {
  it.each([
    ["/archivio/video/orto", "video/orto"],
    ["file:///C:/Users/x/archivio/video/orto/", "video/orto"],
    ["file:///C:/Users/Federico%20Rossi/archivio/video/orto", "video/orto"],
    ["C:\\Users\\x\\ARCHIVIO\\video\\orto", "video/orto"],
    ["\\\\server\\share\\archivio\\video\\orto", "video/orto"],
    ["/C:/Users/x", null],
    ["archivio", null],
  ])("%s", (href, archivio) => {
    expect(percorsoDelComputer(href)?.archivio ?? null).toBe(archivio)
  })

  it("javascript:, data: e simili non sono percorsi", () => {
    expect(percorsoDelComputer("javascript:alert(1)")).toBeNull()
    expect(percorsoDelComputer("data:text/html,x")).toBeNull()
    expect(percorsoDelComputer("https://esempio.it")).toBeNull()
  })
})
