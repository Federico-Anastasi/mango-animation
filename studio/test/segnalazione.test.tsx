// «Segnala un problema» nello studio, con un ponte finto al posto di quello dell'app (`app/src/segnalazione/`): nel browser senza l'app non c'è.
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Errore } from "../src/comuni/Stati"
import { Cornice } from "../src/cornice/Cornice"
import { scegliLingua } from "../src/lingua"
import type { EsitoSegnalazione } from "../src/segnalazione/ponte"
import { installaEventi, installaRete } from "./rete"

type Invio = { errore?: string; nota?: string; schermata: boolean; immagine?: string }

function ponteFinto(esito: () => Promise<EsitoSegnalazione> = async () => ({ inviata: true }), invioAttivo = true) {
  const viste: { invio: Invio; riquadroVisibile: boolean }[] = []
  const invia = vi.fn(async (invio: Invio) => {
    const riquadro = document.querySelector<HTMLElement>("[role=dialog]")
    viste.push({ invio, riquadroVisibile: riquadro === null || getComputedStyle(riquadro).visibility !== "hidden" })
    return esito()
  })
  window.__MANGO_ANIMATION__ = { segnalazione: { invioAttivo: async () => invioAttivo, invia } }
  return { invia, viste }
}

beforeEach(() => {
  installaEventi()
  window.location.hash = ""
  installaRete({
    "GET /api/registrazione": { disponibile: true, motivo: null, dispositivi: { microfoni: [], camere: [] }, in_corso: null, ultima: null },
    "GET /api/lavori": { in_corso: null, in_coda: [], finiti: [] },
    "GET /api/arrivi": { in_ascolto: false, indirizzo: null, qr: null, errore: null, ultimi: [], firewall: "bloccato", pronto: false, motivo: null },
  })
})
afterEach(() => {
  delete window.__MANGO_ANIMATION__
  vi.unstubAllGlobals()
})

const apri = async (conInterruttore = true) => {
  render(<Cornice vista="video" />)
  fireEvent.click(await screen.findByRole("button", { name: "Segnala un problema" }))
  const dialogo = await screen.findByRole("dialog", { name: "Segnala un problema" })
  if (conInterruttore) await screen.findByRole("switch", { name: /Includi una schermata della finestra/ })
  return dialogo
}
const nota = () => screen.getByRole("textbox", { name: "Cosa è successo?" })
const schermata = () => screen.findByRole("switch", { name: /Includi una schermata della finestra/ })

describe("il bottone nella barra", () => {
  it("nel browser, senza l'app, non c'è", () => {
    render(<Cornice vista="video" />)
    expect(screen.queryByRole("button", { name: "Segnala un problema" })).toBeNull()
  })

  it("nell'app c'è in ogni vista e apre il dialogo con il campo facoltativo e l'interruttore della schermata spento", async () => {
    ponteFinto()
    const dialogo = await apri()
    expect(nota()).toHaveValue("")
    expect(await schermata()).not.toBeChecked()
    expect(dialogo).toHaveTextContent("può mostrare contenuti tuoi")
  })

  it("dice che i registri possono contenere i nomi dei video e dei file, e che trascrizioni, chat e cartella di lavoro non partono", async () => {
    ponteFinto()
    const dialogo = await apri()
    expect(dialogo).toHaveTextContent("possono contenere i nomi dei tuoi video e dei tuoi file")
    expect(dialogo).toHaveTextContent("Le trascrizioni, la chat e i file della cartella di lavoro non partono mai")
  })

  it("si chiude con Esc", async () => {
    ponteFinto()
    await apri()
    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.queryByRole("dialog", { name: "Segnala un problema" })).toBeNull()
  })
})

describe("l'interruttore della schermata", () => {
  it("senza l'invio a Sentry nella costruzione non si vede, e non si chiede la schermata", async () => {
    const { viste } = ponteFinto(async () => ({ inviata: false, file: "segnalazione.txt" }), false)
    const dialogo = await apri(false)
    expect(dialogo).toHaveTextContent("Cosa è successo?")
    expect(screen.queryByRole("switch", { name: /Includi una schermata della finestra/ })).toBeNull()
    expect(dialogo).not.toHaveTextContent("può mostrare contenuti tuoi")
    fireEvent.click(screen.getByRole("button", { name: "Invia" }))
    await screen.findByText(/Salvato in segnalazione\.txt/)
    expect(viste).toEqual([{ invio: { errore: undefined, nota: "", schermata: false }, riquadroVisibile: true }])
  })
})

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const immagine = (nome = "errore.png", byte: number[] = PNG, tipo = "image/png") => new File([new Uint8Array(byte)], nome, { type: tipo })
const campoImmagine = () => screen.getByLabelText("Scegli un'immagine da allegare") as HTMLInputElement
const scegli = (file: File) => fireEvent.change(campoImmagine(), { target: { files: [file] } })

describe("l'immagine caricata", () => {
  it("il dialogo consiglia di aggiungerla e il campo accetta PNG, JPEG e WebP, uno solo", async () => {
    ponteFinto()
    const dialogo = await apri()
    expect(dialogo).toHaveTextContent("Aggiungi un'immagine dell'errore")
    expect(dialogo).toHaveTextContent("Te lo consigliamo: con l'immagine ci è più semplice capire il problema e risolverlo.")
    expect(screen.getByRole("button", { name: "Scegli un'immagine" })).toBeEnabled()
    expect(campoImmagine()).toHaveAttribute("accept", "image/png,image/jpeg,image/webp")
    expect(campoImmagine().multiple).toBe(false)
  })

  it("senza l'invio a Sentry il campo non c'è, come l'interruttore: l'immagine non parte", async () => {
    ponteFinto(undefined, false)
    const dialogo = await apri(false)
    expect(screen.queryByRole("button", { name: "Scegli un'immagine" })).toBeNull()
    expect(dialogo).not.toHaveTextContent("Aggiungi un'immagine")
  })

  it("scelta, ne mostra il nome e si toglie; parte solo l'immagine che c'è al momento dell'invio", async () => {
    const { viste } = ponteFinto()
    await apri()
    scegli(immagine("schermata.png"))
    expect(await screen.findByText("schermata.png")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Scegli un'immagine" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Togli" }))
    expect(screen.queryByText("schermata.png")).toBeNull()
    expect(screen.getByRole("button", { name: "Scegli un'immagine" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Invia" }))
    await screen.findByText("Inviato, grazie")
    expect(viste[0]?.invio).toEqual({ errore: undefined, nota: "", schermata: false })
    expect(viste[0]?.invio).not.toHaveProperty("immagine")
  })

  it("«Invia» la manda all'app in base64, accanto alla nota, senza la schermata se l'interruttore è spento, e poi il campo si svuota", async () => {
    const { viste } = ponteFinto()
    await apri()
    fireEvent.change(nota(), { target: { value: "si blocca" } })
    scegli(immagine())
    await screen.findByText("errore.png")
    fireEvent.click(screen.getByRole("button", { name: "Invia" }))
    expect(await screen.findByText("Inviato, grazie")).toBeInTheDocument()
    expect(viste).toEqual([{ invio: { errore: undefined, nota: "si blocca", schermata: false, immagine: btoa(String.fromCharCode(...PNG)) }, riquadroVisibile: true }])
    expect(screen.queryByText("errore.png")).toBeNull()
  })

  it("con la schermata accesa partono tutte e due", async () => {
    const { viste } = ponteFinto()
    await apri()
    fireEvent.click(await schermata())
    scegli(immagine())
    await screen.findByText("errore.png")
    fireEvent.click(screen.getByRole("button", { name: "Invia" }))
    await screen.findByText("Inviato, grazie")
    expect(viste[0]?.invio).toMatchObject({ schermata: true, immagine: expect.any(String) })
  })

  it("un'immagine sopra i 10 MB non si tiene e se ne dice il motivo", async () => {
    const { invia } = ponteFinto()
    await apri()
    scegli(new File([new Uint8Array(10 * 1024 * 1024 + 1)], "enorme.png", { type: "image/png" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("L'immagine pesa più di 10 MB: scegline una più piccola.")
    expect(screen.queryByText("enorme.png")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Invia" }))
    await screen.findByText("Inviato, grazie")
    expect(invia.mock.calls[0]?.[0]).not.toHaveProperty("immagine")
  })

  it("se l'app rifiuta l'immagine ne dice il motivo e l'immagine resta per cambiarla", async () => {
    ponteFinto(async () => Promise.reject("Il file scelto non è un'immagine PNG, JPEG o WebP."))
    await apri()
    scegli(immagine("note.txt", [104, 105], "image/png"))
    await screen.findByText("note.txt")
    fireEvent.click(screen.getByRole("button", { name: "Invia" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Il file scelto non è un'immagine PNG, JPEG o WebP.")
    expect(screen.getByText("note.txt")).toBeInTheDocument()
  })
})

describe("l'invio", () => {
  it("non parte niente finché non si preme «Invia»", async () => {
    const { invia } = ponteFinto()
    await apri()
    fireEvent.change(nota(), { target: { value: "non parte" } })
    expect(invia).not.toHaveBeenCalled()
  })

  it("manda ciò che si è scritto e la schermata, tiene nascosto il dialogo mentre la finestra si riprende, e dice «Inviato, grazie»", async () => {
    const { viste } = ponteFinto()
    const dialogo = await apri()
    fireEvent.click(await schermata())
    fireEvent.change(nota(), { target: { value: "si blocca nel montaggio" } })
    fireEvent.click(screen.getByRole("button", { name: "Invia" }))
    expect(await screen.findByText("Inviato, grazie")).toBeInTheDocument()
    expect(viste).toEqual([{ invio: { errore: undefined, nota: "si blocca nel montaggio", schermata: true }, riquadroVisibile: false }])
    expect(getComputedStyle(dialogo).visibility).not.toBe("hidden")
    expect(nota()).toHaveValue("")
  })

  it("con l'interruttore spento, com'è di base, non chiede la schermata e il dialogo resta com'è", async () => {
    const { viste } = ponteFinto()
    await apri()
    fireEvent.click(screen.getByRole("button", { name: "Invia" }))
    await screen.findByText("Inviato, grazie")
    expect(viste).toEqual([{ invio: { errore: undefined, nota: "", schermata: false }, riquadroVisibile: true }])
  })

  it("se l'app rifiuta dice la sua frase e si può riprovare", async () => {
    ponteFinto(async () => Promise.reject({ code: "unavailable", message: "L'invio della segnalazione non è riuscito: rete assente" }))
    await apri()
    fireEvent.click(screen.getByRole("button", { name: "Invia" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("L'invio della segnalazione non è riuscito: rete assente")
    expect(screen.getByRole("button", { name: "Invia" })).toBeEnabled()
  })

  it("se l'app rifiuta senza una frase ne dice una sua", async () => {
    ponteFinto(async () => Promise.reject(undefined))
    await apri()
    fireEvent.click(screen.getByRole("button", { name: "Invia" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("La segnalazione non è partita.")
  })

  it("senza l'indirizzo di Sentry nella costruzione dice dove è finito il testo e che la pagina di GitHub è aperta", async () => {
    ponteFinto(async () => ({ inviata: false, file: "C:\\logs\\segnalazione-2026-11-08-113005.txt" }))
    await apri()
    fireEvent.click(screen.getByRole("button", { name: "Invia" }))
    expect(await screen.findByText(/Salvato in C:\\logs\\segnalazione-2026-11-08-113005\.txt\. Si è aperta la pagina di GitHub/)).toBeInTheDocument()
  })

  it("mentre invia il bottone è spento", async () => {
    let finisci: (e: EsitoSegnalazione) => void = () => {}
    ponteFinto(() => new Promise((risolvi) => (finisci = risolvi)))
    await apri()
    fireEvent.click(screen.getByRole("button", { name: "Invia" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Invio…" })).toBeDisabled())
    finisci({ inviata: true })
    expect(await screen.findByText("Inviato, grazie")).toBeInTheDocument()
  })
})

describe("in inglese", () => {
  it("dialogo e conferma sono in inglese", async () => {
    scegliLingua("en")
    ponteFinto()
    render(<Cornice vista="video" />)
    fireEvent.click(await screen.findByRole("button", { name: "Report a problem" }))
    const dialogo = await screen.findByRole("dialog", { name: "Report a problem" })
    expect(screen.getByRole("textbox", { name: "What happened?" })).toBeInTheDocument()
    expect(screen.getByRole("switch", { name: /Include a screenshot of the window/ })).not.toBeChecked()
    expect(dialogo).toHaveTextContent("Add an image of the error")
    expect(dialogo).toHaveTextContent("We recommend it: with an image it is easier for us to understand the problem and fix it.")
    expect(screen.getByRole("button", { name: "Choose an image" })).toBeInTheDocument()
    expect(dialogo).toHaveTextContent("names of your videos and files")
    fireEvent.click(screen.getByRole("button", { name: "Send" }))
    expect(await screen.findByText("Sent, thank you")).toBeInTheDocument()
  })
})

describe("la vista d'errore comune", () => {
  it("nel browser, senza l'app, non offre la segnalazione", () => {
    render(<Errore messaggio="Non riesco a leggere i video." onRiprova={() => {}} />)
    expect(screen.queryByRole("button", { name: "Segnala il problema" })).toBeNull()
  })

  it("nell'app la segnalazione porta con sé il messaggio e il dettaglio dell'errore", async () => {
    const { invia } = ponteFinto()
    render(<Errore messaggio={"Non riesco a leggere i video.\nGET /api/video: 500"} dettaglio={["server.log: riga 12"]} />)
    fireEvent.click(screen.getByRole("button", { name: "Segnala il problema" }))
    fireEvent.click(await schermata())
    fireEvent.change(nota(), { target: { value: "dopo l'aggiornamento" } })
    fireEvent.click(screen.getByRole("button", { name: "Invia" }))
    await screen.findByText("Inviato, grazie")
    expect(invia).toHaveBeenCalledWith({ errore: "Non riesco a leggere i video.\nGET /api/video: 500\nserver.log: riga 12", nota: "dopo l'aggiornamento", schermata: true })
    expect(screen.getByRole("alert")).toHaveTextContent("Non riesco a leggere i video.")
  })
})
