import { beforeAll, describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// La pagina d'attesa senza finestra: un finto documento con gli elementi di index.html, e lo script vero.
type Elemento = { hidden: boolean; disabled: boolean; checked: boolean; className: string; placeholder: string; textContent: string; value: number | string; max: number; focus: () => void; replaceChildren: () => void; title: string; click: () => void; addEventListener: (tipo: string, f: () => void) => void; setAttribute: () => void; removeAttribute: () => void; classList: { toggle: () => void } }

const elementi = new Map<string, Elemento>()
const chiamate: { comando: string; argomenti: unknown }[] = []
let nuovoStato: (payload: unknown) => void = () => {}

const elemento = (): Elemento => {
  const ascoltatori: (() => void)[] = []
  return { hidden: false, disabled: false, checked: true, className: "", placeholder: "", textContent: "", value: 0, max: 0, focus: () => {}, replaceChildren: () => {}, title: "", click: () => ascoltatori.forEach((f) => f()), addEventListener: (_, f) => void ascoltatori.push(f), setAttribute: () => {}, removeAttribute: () => {}, classList: { toggle: () => {} } }
}

beforeAll(async () => {
  const html = readFileSync(join(import.meta.dir, "..", "ui", "index.html"), "utf8")
  for (const [, id] of html.matchAll(/id="([^"]+)"/g)) elementi.set(id, elemento())
  Object.assign(globalThis, {
    window: globalThis,
    document: { getElementById: (id: string) => elementi.get(id), documentElement: {}, querySelector: () => elemento() },
    requestAnimationFrame: (f: () => void) => void queueMicrotask(f),
    navigator: { clipboard: { writeText: () => Promise.resolve() } },
    __TAURI__: {
      core: { invoke: (comando: string, argomenti: unknown) => (chiamate.push({ comando, argomenti }), Promise.resolve(undefined)) },
      event: { listen: (_: string, f: (e: { payload: unknown }) => void) => void (nuovoStato = (payload) => f({ payload })) },
    },
  })
  await import("../ui/app.js")
})

const el = (id: string) => elementi.get(id) as Elemento
const aggiornamento = (fase: string, lingua = "it", messaggio?: string) => ({ fase: "aggiornamento", lingua, aggiornamento: { fase, corrente: "0.1.0", nuova: "0.1.1", note: null, fatti: 0, totale: 0, messaggio } })

describe("la pagina dell'aggiornamento", () => {
  test("la proposta chiede «Aggiorna ora» o «Più tardi»", () => {
    nuovoStato(aggiornamento("proposta"))
    expect([el("aggiorna").hidden, el("aggiorna").textContent, el("dopo").hidden, el("dopo").textContent]).toEqual([false, "Aggiorna ora", false, "Più tardi"])
  })

  test("dopo un errore dice il motivo e offre di riprovare o di continuare con la versione installata, nelle due lingue", () => {
    nuovoStato(aggiornamento("errore", "it", "Non è arrivata intera."))
    expect(el("titolo").textContent).toBe("L'aggiornamento non è andato")
    expect(el("dettaglio").textContent).toBe("Non è arrivata intera.")
    expect([el("aggiorna").hidden, el("aggiorna").textContent, el("dopo").hidden, el("dopo").textContent]).toEqual([false, "Riprova", false, "Continua con la versione che hai"])
    expect([el("avanzamento").hidden, el("giro").hidden]).toEqual([true, true])

    nuovoStato(aggiornamento("errore", "en", "It did not arrive in full."))
    expect(el("titolo").textContent).toBe("The update failed")
    expect([el("aggiorna").textContent, el("dopo").textContent]).toEqual(["Try again", "Continue with the version you have"])
  })

  test("«Riprova» e «Continua» rispondono all'app, e la pagina lo dice subito", () => {
    nuovoStato(aggiornamento("errore", "it", "x"))
    chiamate.length = 0
    el("aggiorna").click()
    expect(chiamate).toEqual([{ comando: "azione", argomenti: { azione: "aggiorna" } }])
    expect(el("titolo").textContent).toBe("Sto preparando tutto")
    expect(el("dettaglio").textContent).toBe("Riprovo…")

    nuovoStato(aggiornamento("errore", "it", "x"))
    chiamate.length = 0
    el("dopo").click()
    expect(chiamate).toEqual([{ comando: "azione", argomenti: { azione: "continua" } }])
    expect(el("dettaglio").textContent).toBe("Vado avanti…")
  })

  test("durante lo scarico non ci sono bottoni e dopo la proposta il «sì» resta «Comincio»", () => {
    nuovoStato(aggiornamento("scarico"))
    expect([el("aggiorna").hidden, el("dopo").hidden, el("avanzamento").hidden]).toEqual([true, true, false])
    nuovoStato(aggiornamento("proposta"))
    chiamate.length = 0
    el("aggiorna").click()
    expect(el("dettaglio").textContent).toBe("Comincio…")
  })
})

type Invio = { errore: string | null; nota: string; schermata: boolean }
const inviate: { invio: Invio; riquadroVisibile: boolean }[] = []
let esitoDellApp: () => Promise<unknown> = () => Promise.resolve({ inviata: true })
let invioAttivo = true

const conIlPonte = () => {
  Object.assign(globalThis, {
    __MANGO_ANIMATION__: {
      segnalazione: {
        invioAttivo: () => Promise.resolve(invioAttivo),
        invia: (invio: Invio) => {
          inviate.push({ invio, riquadroVisibile: !el("segnalazione").hidden })
          return esitoDellApp()
        },
      },
    },
  })
  inviate.length = 0
  esitoDellApp = () => Promise.resolve({ inviata: true })
  invioAttivo = true
  el("segnalazione").hidden = true
  el("segnala-schermata-riga").hidden = true
  el("segnala-schermata").checked = true
}

const scrivi = (nota: string) => {
  el("segnala-nota").value = nota
}
const aspetta = () => new Promise((fatto) => setTimeout(fatto, 0))
const premiInvia = async () => {
  el("segnala-invia").click()
  await new Promise((fatto) => setTimeout(fatto, 0))
}

describe("«Segnala un problema»", () => {
  test("c'è in ogni pagina, chiusa di base, e si apre e si chiude con un clic, nelle due lingue", () => {
    conIlPonte()
    nuovoStato({ fase: "attesa", lingua: "it", secondi: 3, messaggio: "Accendo il server" })
    expect([el("segnala").textContent, el("segnalazione").hidden]).toEqual(["Segnala un problema", true])
    el("segnala").click()
    expect(el("segnalazione").hidden).toBe(false)
    expect([el("segnala-nota-etichetta").textContent, el("segnala-schermata-nome").textContent, el("segnala-invia").textContent]).toEqual(["Cosa è successo?", "Includi una schermata della finestra", "Invia"])
    expect(el("segnala-schermata").checked).toBe(true)
    el("segnala-chiudi").click()
    expect(el("segnalazione").hidden).toBe(true)

    nuovoStato({ fase: "attesa", lingua: "en", secondi: 3, messaggio: "Starting the server" })
    expect([el("segnala").textContent, el("segnala-nota-etichetta").textContent, el("segnala-schermata-nome").textContent]).toEqual(["Report a problem", "What happened?", "Include a screenshot of the window"])
  })

  test("avvisa che la schermata e i registri possono contenere i nomi dei video e dei file, e che trascrizioni, chat e cartella di lavoro non partono", () => {
    nuovoStato({ fase: "attesa", lingua: "it", secondi: 0, messaggio: "x" })
    expect(el("segnala-schermata-cosa").textContent).toContain("contenuti tuoi")
    expect(el("segnala-registri").textContent).toContain("nomi dei tuoi video e dei tuoi file")
    expect(el("segnala-registri").textContent).toContain("Le trascrizioni, la chat e i file della cartella di lavoro non partono mai")
    nuovoStato({ fase: "attesa", lingua: "en", secondi: 0, messaggio: "x" })
    expect(el("segnala-registri").textContent).toContain("names of your videos and files")
    expect(el("segnala-registri").textContent).toContain("Transcripts, the chat and the files of your work folder are never sent")
  })

  test("l'interruttore della schermata si vede solo se questa costruzione manda le segnalazioni a Sentry", async () => {
    conIlPonte()
    nuovoStato({ fase: "attesa", lingua: "it", secondi: 0, messaggio: "x" })
    el("segnala").click()
    await aspetta()
    expect(el("segnala-schermata-riga").hidden).toBe(false)

    conIlPonte()
    invioAttivo = false
    el("segnala").click()
    await aspetta()
    expect(el("segnala-schermata-riga").hidden).toBe(true)
  })

  test("senza l'invio a Sentry la schermata non si chiede all'app, anche se l'interruttore era rimasto acceso", async () => {
    conIlPonte()
    invioAttivo = false
    nuovoStato({ fase: "attesa", lingua: "it", secondi: 0, messaggio: "x" })
    el("segnala").click()
    scrivi("")
    await premiInvia()
    expect(inviate).toEqual([{ invio: { errore: null, nota: "", schermata: false }, riquadroVisibile: true }])
  })

  test("non parte niente finché non si preme «Invia»", () => {
    conIlPonte()
    nuovoStato({ fase: "attesa", lingua: "it", secondi: 0, messaggio: "x" })
    el("segnala").click()
    scrivi("non parte")
    expect(inviate).toEqual([])
  })

  test("«Invia» manda la nota e la schermata, toglie il riquadro mentre la finestra si riprende e poi dice «Inviato, grazie»", async () => {
    conIlPonte()
    nuovoStato({ fase: "attesa", lingua: "it", secondi: 0, messaggio: "x" })
    el("segnala").click()
    scrivi("si blocca all'avvio")
    await premiInvia()
    expect(inviate).toEqual([{ invio: { errore: null, nota: "si blocca all'avvio", schermata: true }, riquadroVisibile: false }])
    expect([el("segnala-esito").textContent, el("segnala-nota").value, el("segnalazione").hidden, el("segnala-invia").disabled]).toEqual(["Inviato, grazie", "", false, false])
  })

  test("senza schermata il riquadro resta dov'è, e in inglese dice «Sent, thank you»", async () => {
    conIlPonte()
    nuovoStato({ fase: "attesa", lingua: "en", secondi: 0, messaggio: "x" })
    el("segnala").click()
    el("segnala-schermata").checked = false
    await premiInvia()
    expect(inviate).toEqual([{ invio: { errore: null, nota: "", schermata: false }, riquadroVisibile: true }])
    expect(el("segnala-esito").textContent).toBe("Sent, thank you")
  })

  test("nella pagina d'errore la segnalazione porta il titolo e il messaggio dell'errore", async () => {
    conIlPonte()
    nuovoStato({ fase: "errore", lingua: "it", messaggio: "Il server non si accende.", log: "server.log" })
    await premiInvia()
    expect(inviate[0]?.invio.errore).toBe("Il server non parte\nIl server non si accende.")
  })

  test("l'errore dell'aggiornamento e quello del computer pronto viaggiano allo stesso modo", async () => {
    conIlPonte()
    nuovoStato(aggiornamento("errore", "it", "Non è arrivata intera."))
    await premiInvia()
    expect(inviate[0]?.invio.errore).toBe("L'aggiornamento non è andato\nNon è arrivata intera.")
    nuovoStato({ fase: "computer", lingua: "it", computer: { fase: "errore", messaggio: "Manca spazio sul disco.", voci: [], funzioni: [], avvisi: [], schede: [], libero_mb: 0, servono_mb: 0, spazio_ok: true, computer: { schede: [], ram_mb: 0 } } })
    await premiInvia()
    expect(inviate[1]?.invio.errore).toBe("Qualcosa non è andato\nManca spazio sul disco.")
  })

  test("se l'app rifiuta, la pagina dice la frase del rifiuto e si può riprovare", async () => {
    conIlPonte()
    esitoDellApp = () => Promise.reject({ code: "unavailable", message: "L'invio della segnalazione non è riuscito: rete assente" })
    nuovoStato({ fase: "attesa", lingua: "it", secondi: 0, messaggio: "x" })
    await premiInvia()
    expect([el("segnala-esito").textContent, el("segnala-esito").className, el("segnala-invia").disabled, el("segnalazione").hidden]).toEqual(["L'invio della segnalazione non è riuscito: rete assente", "poco", false, false])
    esitoDellApp = () => Promise.reject(undefined)
    await premiInvia()
    expect(el("segnala-esito").textContent).toBe("La segnalazione non è partita.")
  })

  test("senza l'indirizzo di Sentry il testo resta in un file e la pagina lo dice", async () => {
    conIlPonte()
    esitoDellApp = () => Promise.resolve({ inviata: false, file: "segnalazione-2026-11-08-113005.txt" })
    nuovoStato({ fase: "attesa", lingua: "en", secondi: 0, messaggio: "x" })
    await premiInvia()
    expect(el("segnala-esito").textContent).toBe("Saved to segnalazione-2026-11-08-113005.txt. The GitHub page is open so you can send it.")
  })
})
