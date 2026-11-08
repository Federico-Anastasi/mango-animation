// «Segnala un problema» nello studio, con un ponte finto al posto di quello dell'app (`app/src/segnalazione/`): nel browser senza l'app non c'è.
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Errore } from "../src/comuni/Stati"
import { Cornice } from "../src/cornice/Cornice"
import { scegliLingua } from "../src/lingua"
import type { EsitoSegnalazione } from "../src/segnalazione/ponte"
import { installaEventi, installaRete } from "./rete"

type Invio = { errore?: string; nota?: string; schermata: boolean }

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

  it("nell'app c'è in ogni vista e apre il dialogo con il campo facoltativo e l'interruttore della schermata acceso", async () => {
    ponteFinto()
    const dialogo = await apri()
    expect(nota()).toHaveValue("")
    expect(await schermata()).toBeChecked()
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
    fireEvent.change(nota(), { target: { value: "si blocca nel montaggio" } })
    fireEvent.click(screen.getByRole("button", { name: "Invia" }))
    expect(await screen.findByText("Inviato, grazie")).toBeInTheDocument()
    expect(viste).toEqual([{ invio: { errore: undefined, nota: "si blocca nel montaggio", schermata: true }, riquadroVisibile: false }])
    expect(getComputedStyle(dialogo).visibility).not.toBe("hidden")
    expect(nota()).toHaveValue("")
  })

  it("con l'interruttore spento non chiede la schermata e il dialogo resta com'è", async () => {
    const { viste } = ponteFinto()
    await apri()
    fireEvent.click(await schermata())
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
    fireEvent.click(await schermata())
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
    expect(screen.getByRole("switch", { name: /Include a screenshot of the window/ })).toBeChecked()
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
    await schermata()
    fireEvent.change(nota(), { target: { value: "dopo l'aggiornamento" } })
    fireEvent.click(screen.getByRole("button", { name: "Invia" }))
    await screen.findByText("Inviato, grazie")
    expect(invia).toHaveBeenCalledWith({ errore: "Non riesco a leggere i video.\nGET /api/video: 500\nserver.log: riga 12", nota: "dopo l'aggiornamento", schermata: true })
    expect(screen.getByRole("alert")).toHaveTextContent("Non riesco a leggere i video.")
  })
})
