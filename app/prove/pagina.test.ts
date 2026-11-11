import { beforeAll, describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// La pagina d'attesa senza finestra: un finto documento con gli elementi di index.html, e lo script vero.
type Elemento = { hidden: boolean; disabled: boolean; checked: boolean; className: string; placeholder: string; textContent: string; value: number | string; max: number; focus: () => void; replaceChildren: (...figli: Elemento[]) => void; append: (...figli: unknown[]) => void; figli: Elemento[]; type: string; title: string; click: () => void; addEventListener: (tipo: string, f: () => void) => void; setAttribute: () => void; removeAttribute: () => void; classList: { toggle: () => void } }

const elementi = new Map<string, Elemento>()
const chiamate: { comando: string; argomenti: unknown }[] = []
let nuovoStato: (payload: unknown) => void = () => {}

const elemento = (): Elemento => {
  const ascoltatori: (() => void)[] = []
  const nuovo: Elemento = { hidden: false, disabled: false, checked: true, className: "", placeholder: "", textContent: "", value: 0, max: 0, focus: () => {}, replaceChildren: (...figli) => void (nuovo.figli = figli), append: () => {}, figli: [], type: "", title: "", click: () => ascoltatori.forEach((f) => f()), addEventListener: (_, f) => void ascoltatori.push(f), setAttribute: () => {}, removeAttribute: () => {}, classList: { toggle: () => {} } }
  return nuovo
}

beforeAll(async () => {
  const html = readFileSync(join(import.meta.dir, "..", "ui", "index.html"), "utf8")
  for (const [, id] of html.matchAll(/id="([^"]+)"/g)) elementi.set(id, elemento())
  Object.assign(globalThis, {
    window: globalThis,
    document: { getElementById: (id: string) => elementi.get(id), createElement: () => elemento(), documentElement: {}, querySelector: () => elemento() },
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

const COMANDO = "irm https://claude.ai/install.ps1 | iex"
const claude = (c: Record<string, unknown>, lingua = "it") => ({ fase: "claude", lingua, claude: { trovato: false, percorso: null, versione: null, collegato: false, messaggio: null, comando: COMANDO, ...c } })
const html = readFileSync(join(import.meta.dir, "..", "ui", "index.html"), "utf8")

describe("la pagina di Claude Code", () => {
  test("senza Claude Code dice che serve un abbonamento e offre di installarlo con un clic, e non c'è modo di andare avanti senza", () => {
    nuovoStato(claude({}))
    expect(el("titolo").textContent).toBe("Per cominciare serve Claude Code")
    expect([el("installa").hidden, el("installa").textContent, el("accedi").hidden, el("ricontrolla").hidden]).toEqual([false, "Installa Claude Code", true, false])
    expect(el("abbonamento").hidden).toBe(false)
    expect(el("abbonamento-testo").textContent).toBe("Claude Code richiede un account Claude con un abbonamento: Pro, Max, Ultra, Team o Enterprise. Il piano gratuito non lo include.")
    expect(el("piani-link").textContent).toBe("Guarda i piani")
    expect(html).toContain('id="piani-link" href="https://claude.com/pricing"')
    expect(html).not.toContain('id="senza"')
    expect(el("giro").hidden).toBe(true)
  })

  test("il comando di Anthropic resta come alternativa, con la guida ufficiale, e si copia", async () => {
    nuovoStato(claude({}))
    expect([el("alternativa").hidden, el("comando").textContent, el("guida").hidden, el("copia").textContent]).toEqual([false, COMANDO, false, "Copia il comando"])
    expect(html).toContain('id="guida-link" href="https://code.claude.com/docs/en/setup"')
    const copiati: string[] = []
    ;(globalThis as unknown as { navigator: { clipboard: { writeText: (t: string) => Promise<void> } } }).navigator.clipboard.writeText = (t) => (copiati.push(t), Promise.resolve())
    el("copia").click()
    await aspetta()
    expect(copiati).toEqual([COMANDO])
    expect(el("copia").textContent).toBe("Copiato")
  })

  test("«Installa Claude Code» lo chiede all'app e la pagina aspetta la finestra", () => {
    nuovoStato(claude({}))
    chiamate.length = 0
    el("installa").click()
    expect(chiamate).toEqual([{ comando: "azione", argomenti: { azione: "installa" } }])
    expect(el("dettaglio").textContent).toBe("Installo Claude Code nella finestra che si è aperta…")
    expect([el("installa").hidden, el("abbonamento").hidden, el("alternativa").hidden]).toEqual([true, true, true])
  })

  test("se l'installazione non va lo dice e offre «Riprova» e la guida", () => {
    nuovoStato(claude({ messaggio: "L'installazione di Claude Code non è andata a buon fine." }))
    expect(el("dettaglio").textContent).toBe("L'installazione di Claude Code non è andata a buon fine. Puoi riprovare, o seguire la guida di Anthropic.")
    expect([el("installa").hidden, el("installa").textContent, el("guida").hidden]).toEqual([false, "Riprova", false])
  })

  test("trovato ma non collegato chiede l'accesso, con lo stesso avviso sull'abbonamento e senza il comando", () => {
    nuovoStato(claude({ trovato: true, percorso: "C:\\claude.exe", versione: "2.1.318", comando: null }))
    expect(el("titolo").textContent).toBe("Collega Claude Code al tuo account")
    expect(el("dettaglio").textContent).toBe("Ho trovato Claude Code 2.1.318. Serve l'accesso con il tuo account Claude: si apre una finestra, e poi il browser per entrare.")
    expect([el("accedi").hidden, el("accedi").textContent, el("installa").hidden, el("alternativa").hidden, el("guida").hidden, el("abbonamento").hidden]).toEqual([false, "Accedi a Claude Code", true, true, true, false])
    chiamate.length = 0
    el("accedi").click()
    expect(chiamate).toEqual([{ comando: "azione", argomenti: { azione: "accedi" } }])
  })

  test("in inglese le stesse frasi, con il piano gratuito escluso", () => {
    nuovoStato(claude({}, "en"))
    expect(el("titolo").textContent).toBe("To get started you need Claude Code")
    expect([el("installa").textContent, el("piani-link").textContent, el("alternativa-testo").textContent]).toEqual(["Install Claude Code", "See the plans", "If you prefer, paste this command into PowerShell:"])
    expect(el("abbonamento-testo").textContent).toBe("Claude Code needs a Claude account with a subscription: Pro, Max, Ultra, Team or Enterprise. The free plan does not include it.")
  })

  test("la pagina non parla di Mango Code: fra i motori della chat lo offre il server", () => {
    expect(html).not.toContain("mango-code")
    expect(readFileSync(join(import.meta.dir, "..", "ui", "app.js"), "utf8")).not.toContain("Mango Code")
  })

  test("le altre pagine non mostrano niente di Claude Code", () => {
    nuovoStato(claude({}))
    nuovoStato({ fase: "attesa", lingua: "it", secondi: 0, messaggio: "Accendo il server" })
    expect([el("installa").hidden, el("accedi").hidden, el("ricontrolla").hidden, el("abbonamento").hidden, el("alternativa").hidden, el("guida").hidden]).toEqual([true, true, true, true, true, true])
  })
})

const cartella = (c: Record<string, unknown>, lingua = "it") => ({ fase: "cartella", lingua, cartella: { percorso: "C:\\Users\\Alice\\Documents\\Mango Animation", libero_mb: 412 * 1024, onedrive: false, alternative: [], messaggio: null, ...c } })

describe("la pagina «Dove tengo i tuoi video?»", () => {
  test("mostra la cartella proposta con lo spazio libero del suo disco, e i due modi di andare avanti", () => {
    nuovoStato(cartella({}))
    expect(el("titolo").textContent).toBe("Dove tengo i tuoi video?")
    expect(el("dettaglio").textContent).toBe("Qui vanno i tuoi video, il girato e tutto il lavoro. Pesano molto: scegli un disco con spazio.")
    expect([el("cartella").hidden, el("cartella-percorso").textContent, el("cartella-spazio").textContent]).toEqual([false, "C:\\Users\\Alice\\Documents\\Mango Animation", "Spazio libero sul disco: 412,0 GB"])
    expect([el("usa-cartella").hidden, el("usa-cartella").textContent, el("usa-cartella").disabled, el("scegli-altra").hidden, el("scegli-altra").textContent]).toEqual([false, "Usa questa cartella", false, false, "Scegli un'altra cartella"])
    expect([el("cartella-onedrive").hidden, el("cartella-altre-gruppo").hidden, el("cartella-errore").hidden, el("giro").hidden, el("ricontrolla").hidden, el("installa").hidden]).toEqual([true, true, true, true, true, true])
  })

  test("una cartella dentro OneDrive porta l'avviso, e fuori da OneDrive non c'è", () => {
    nuovoStato(cartella({ onedrive: true }))
    expect(el("cartella-onedrive").hidden).toBe(false)
    expect(el("cartella-onedrive").textContent).toBe("Questa cartella è dentro OneDrive: i video verrebbero copiati online, e pesano molto. Meglio una cartella fuori da OneDrive.")
    nuovoStato(cartella({ onedrive: false }))
    expect(el("cartella-onedrive").hidden).toBe(true)
  })

  test("«Usa questa cartella» e «Scegli un'altra cartella» rispondono all'app; scegliere non cambia la pagina", () => {
    nuovoStato(cartella({}))
    chiamate.length = 0
    el("scegli-altra").click()
    expect(chiamate).toEqual([{ comando: "azione", argomenti: { azione: "scegli_cartella" } }])
    expect(el("titolo").textContent).toBe("Dove tengo i tuoi video?")
    chiamate.length = 0
    el("usa-cartella").click()
    expect(chiamate).toEqual([{ comando: "azione", argomenti: { azione: "usa_cartella" } }])
    expect(el("dettaglio").textContent).toBe("Preparo la cartella…")
  })

  test("gli altri dischi sono scelte rapide con il loro spazio libero, e un clic le propone all'app", () => {
    nuovoStato(cartella({ alternative: [{ percorso: "D:\\Mango Animation", libero_mb: 930 * 1024 }, { percorso: "E:\\Mango Animation", libero_mb: 1500 * 1024 }] }))
    expect(el("cartella-altre-gruppo").hidden).toBe(false)
    expect(el("cartella-altre-titolo").textContent).toBe("Altre cartelle")
    const scelte = el("cartella-altre").figli
    expect(scelte.length).toBe(2)
    chiamate.length = 0
    scelte[0]?.click()
    expect(chiamate).toEqual([{ comando: "azione", argomenti: { azione: { cartella: "D:\\Mango Animation" } } }])
  })

  test("senza una cartella da proporre non si può usare niente finché non se ne sceglie una", () => {
    nuovoStato(cartella({ percorso: null, libero_mb: 0 }))
    expect([el("cartella-percorso").hidden, el("cartella-spazio").hidden, el("usa-cartella").disabled]).toEqual([true, true, true])
    expect(el("dettaglio").textContent).toContain("Scegli dove tenerli.")
  })

  test("se la cartella non si prepara la pagina lo dice", () => {
    nuovoStato(cartella({ messaggio: "non riesco a preparare l'archivio in Q:\\video" }))
    expect([el("cartella-errore").hidden, el("cartella-errore").textContent]).toEqual([false, "non riesco a preparare l'archivio in Q:\\video"])
  })

  test("in inglese le stesse frasi, e lo spazio in terabyte quando è tanto", () => {
    nuovoStato(cartella({ onedrive: true, libero_mb: 2 * 1024 * 1024 }, "en"))
    expect([el("titolo").textContent, el("usa-cartella").textContent, el("scegli-altra").textContent, el("cartella-spazio").textContent]).toEqual(["Where should I keep your videos?", "Use this folder", "Choose another folder", "Free space on the disk: 2.0 TB"])
    expect(el("cartella-onedrive").textContent).toBe("This folder is inside OneDrive: your videos would be copied online, and they are big. A folder outside OneDrive is better.")
  })
})

const spostamento = (m: Record<string, unknown>, lingua = "it") => ({ fase: "spostamento", lingua, spostamento: { fase: "copia", da: "C:\\Vecchia", a: "D:\\Nuova", fatti_mb: 12 * 1024, totale_mb: 80 * 1024, file_fatti: 120, file_totali: 540, messaggio: null, rimasti: 0, primi_rimasti: [], ...m } })

describe("la pagina dello spostamento della cartella dei dati", () => {
  test("durante la copia dice da dove a dove, a che punto è e si può annullare", () => {
    nuovoStato(spostamento({}))
    expect(el("titolo").textContent).toBe("Sposto i tuoi video")
    expect(el("dettaglio").textContent).toContain("Non chiudere l'app")
    expect([el("spostamento-da").textContent, el("spostamento-a").textContent, el("spostamento-conti").textContent]).toEqual(["Da: C:\\Vecchia", "A: D:\\Nuova", "12,0 GB / 80,0 GB · 120 / 540 file"])
    expect([el("spostamento-barra").max, el("spostamento-barra").value, el("spostamento-barra").hidden]).toEqual([80 * 1024, 12 * 1024, false])
    expect([el("annulla").hidden, el("annulla").textContent, el("sposta-riprova").hidden, el("sposta-continua").hidden, el("giro").hidden]).toEqual([false, "Annulla lo spostamento", true, true, true])
    chiamate.length = 0
    el("annulla").click()
    expect(chiamate).toEqual([{ comando: "azione", argomenti: { azione: "annulla" } }])
  })

  test("verifica e rimozione dicono cosa fanno; togliendo gli originali non si annulla più", () => {
    nuovoStato(spostamento({ fase: "verifica", fatti_mb: 80 * 1024 }))
    expect([el("dettaglio").textContent, el("annulla").hidden]).toEqual(["Controllo che sia arrivato tutto.", false])
    nuovoStato(spostamento({ fase: "rimozione", fatti_mb: 80 * 1024 }))
    expect([el("titolo").textContent, el("dettaglio").textContent, el("annulla").hidden]).toEqual(["Finisco di spostare", "Tolgo i file dalla cartella di prima.", true])
  })

  test("se non riesce lo dice, dice che i file sono dove erano e offre di riprovare o continuare con la cartella di prima", () => {
    nuovoStato(spostamento({ fase: "errore", messaggio: "Non riesco a copiare ripresa.mp4: il disco è pieno." }))
    expect(el("titolo").textContent).toBe("Lo spostamento non è riuscito")
    expect(el("dettaglio").textContent).toBe("Non riesco a copiare ripresa.mp4: il disco è pieno. I tuoi file sono dove erano.")
    expect([el("sposta-riprova").hidden, el("sposta-riprova").textContent, el("sposta-continua").hidden, el("sposta-continua").textContent, el("annulla").hidden, el("spostamento-barra").hidden]).toEqual([false, "Riprova", false, "Continua con la cartella di prima", true, true])
    chiamate.length = 0
    el("sposta-riprova").click()
    expect(chiamate).toEqual([{ comando: "azione", argomenti: { azione: "ricontrolla" } }])
    nuovoStato(spostamento({ fase: "annullato" }))
    chiamate.length = 0
    el("sposta-continua").click()
    expect(chiamate).toEqual([{ comando: "azione", argomenti: { azione: "continua" } }])
    nuovoStato(spostamento({ fase: "annullato" }))
    expect([el("titolo").textContent, el("dettaglio").textContent]).toEqual(["Spostamento annullato", "I tuoi file sono dove erano."])
  })

  test("finito ma con degli originali rimasti li elenca e basta «Continua»", () => {
    nuovoStato(spostamento({ fase: "avanzi", rimasti: 7, primi_rimasti: ["C:\\Vecchia\\a.mp4", "C:\\Vecchia\\b.mp4"] }))
    expect(el("titolo").textContent).toBe("Spostamento finito")
    expect(el("dettaglio").textContent).toContain("7 file della cartella di prima non si sono potuti togliere")
    expect(el("dettaglio").textContent).toContain("C:\\Vecchia\\a.mp4\nC:\\Vecchia\\b.mp4\ne altri 5")
    expect([el("sposta-continua").textContent, el("sposta-riprova").hidden, el("annulla").hidden]).toEqual(["Continua", true, true])
  })

  test("in inglese le stesse frasi, e le altre pagine non mostrano i bottoni dello spostamento", () => {
    nuovoStato(spostamento({ fase: "errore", messaggio: "x" }, "en"))
    expect([el("titolo").textContent, el("dettaglio").textContent, el("sposta-continua").textContent]).toEqual(["The move did not work", "x Your files are where they were.", "Continue with the previous folder"])
    nuovoStato(claude({}))
    expect([el("spostamento").hidden, el("sposta-riprova").hidden, el("sposta-continua").hidden]).toEqual([true, true, true])
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
  el("segnala-schermata").checked = false
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
    // La finestra può mostrare i video e la chat: la schermata parte solo se il creator la accende.
    expect(el("segnala-schermata").checked).toBe(false)
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
    el("segnala-schermata").checked = true
    await premiInvia()
    expect(inviate).toEqual([{ invio: { errore: null, nota: "si blocca all'avvio", schermata: true }, riquadroVisibile: false }])
    expect([el("segnala-esito").textContent, el("segnala-nota").value, el("segnalazione").hidden, el("segnala-invia").disabled]).toEqual(["Inviato, grazie", "", false, false])
  })

  test("senza schermata il riquadro resta dov'è, e in inglese dice «Sent, thank you»", async () => {
    conIlPonte()
    nuovoStato({ fase: "attesa", lingua: "en", secondi: 0, messaggio: "x" })
    el("segnala").click()
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

  test("un errore prima del server non dice che il server non parte e non manda a cercare un registro che non c'è", async () => {
    conIlPonte()
    nuovoStato({ fase: "errore", lingua: "it", messaggio: "Il profilo non si legge.", log: null })
    expect(el("titolo").textContent).toBe("Non riesco a preparare l'app")
    expect(el("dettaglio").textContent).toBe("")
    expect(el("log").textContent).toBe("Il profilo non si legge.")
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
