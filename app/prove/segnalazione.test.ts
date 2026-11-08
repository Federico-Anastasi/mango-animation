import { beforeEach, describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// Lo script che l'app mette in ogni pagina (`src/segnalazione/ponte.js`), eseguito su una finestra finta: le chiamate all'app si registrano, il tempo lo decide la prova.
type Chiamata = { comando: string; argomenti: Record<string, unknown> }
type Ponte = Record<string, Record<string, (...a: unknown[]) => unknown>>

const sorgente = readFileSync(join(import.meta.dir, "..", "src", "segnalazione", "ponte.js"), "utf8")

let chiamate: Chiamata[]
let ascoltatori: Record<string, (e: unknown) => void>
let consoleChiamata: unknown[][]
let adesso: number
let timer: { dopo: number; f: () => void; annullato: boolean }[]
let invokeRifiuta: boolean
let finestra: { top?: unknown; __TAURI_INTERNALS__: { invoke: (comando: string, argomenti: Record<string, unknown>) => Promise<unknown> }; __MANGO_ANIMATION__?: Ponte }

const ponte = () => finestra.__MANGO_ANIMATION__ as Ponte

function esegui(bridgeEsistenti: Ponte = {}) {
  chiamate = []
  ascoltatori = {}
  consoleChiamata = []
  adesso = 0
  timer = []
  finestra = {
    __TAURI_INTERNALS__: {
      invoke: (comando, argomenti) => {
        chiamate.push({ comando, argomenti })
        return invokeRifiuta ? Promise.reject(new Error("nessuna app")) : Promise.resolve({ inviata: true })
      },
    },
    __MANGO_ANIMATION__: bridgeEsistenti,
  }
  finestra.top = finestra
  const console = { error: (...a: unknown[]) => void consoleChiamata.push(a) }
  const setTimeoutFinto = (f: () => void, dopo: number) => {
    const t = { dopo, f, annullato: false }
    timer.push(t)
    return t
  }
  new Function("window", "addEventListener", "console", "performance", "setTimeout", "clearTimeout", "location", sorgente)(
    finestra,
    (tipo: string, f: (e: unknown) => void) => void (ascoltatori[tipo] = f),
    console,
    { now: () => adesso },
    setTimeoutFinto,
    (t: { annullato: boolean }) => void (t.annullato = true),
    { pathname: "/", hash: "#/motori" },
  )
  return console
}

const righe = () => chiamate.filter((c) => c.comando === "plugin:mango-animation-segnalazione|scrivi_ui_log").map((c) => c.argomenti)

beforeEach(() => {
  invokeRifiuta = false
})

describe("il registro delle pagine (ui.log)", () => {
  test("un errore non gestito va nel registro con la pagina in cui è successo", () => {
    esegui()
    ascoltatori.error?.({ error: new Error("rotto"), message: "rotto" })
    const [riga] = righe()
    expect(riga?.livello).toBe("error")
    expect(String(riga?.testo)).toContain("rotto")
    expect(riga?.pagina).toBe("/#/motori")
  })

  test("una promessa rifiutata e senza chi la gestisce va nel registro", () => {
    esegui()
    ascoltatori.unhandledrejection?.({ reason: "non risponde" })
    expect(righe()).toMatchObject([{ livello: "error", testo: "unhandled rejection: non risponde" }])
  })

  test("console.error scrive nel registro e continua a scrivere nella console", () => {
    const console = esegui()
    console.error("uno", { due: 2 })
    expect(consoleChiamata).toEqual([["uno", { due: 2 }]])
    expect(righe()).toMatchObject([{ livello: "console", testo: 'uno {"due":2}' }])
  })

  test("l'avviso innocuo del ResizeObserver non riempie il registro", () => {
    esegui()
    ascoltatori.error?.({ message: "ResizeObserver loop completed with undelivered notifications." })
    expect(righe()).toEqual([])
  })

  test("se l'app non risponde al registro la pagina non se ne accorge", () => {
    invokeRifiuta = true
    const console = esegui()
    expect(() => console.error("x")).not.toThrow()
  })
})

describe("le chiamate all'app", () => {
  const chiamaLenta = (ms: number) => () => {
    adesso += ms
    return Promise.resolve({ schede: [] })
  }

  test("una chiamata più lenta di un secondo si scrive con il suo tempo, una veloce no", async () => {
    esegui({ computer: { leggi: chiamaLenta(2400) }, appunti: { percorsi: chiamaLenta(300) } })
    expect(await ponte().computer!.leggi!()).toEqual({ schede: [] })
    await ponte().appunti!.percorsi!()
    expect(righe()).toMatchObject([{ livello: "slow", testo: "computer.leggi: 2400 ms" }])
  })

  test("una chiamata che dopo cinque secondi non ha risposto si scrive subito", () => {
    esegui({ voce: { stato: () => new Promise(() => {}) } })
    void ponte().voce!.stato!()
    const cinque = timer.find((t) => t.dopo === 5000)
    cinque?.f()
    expect(righe()).toMatchObject([{ livello: "slow", testo: "voce.stato: no answer after 5 s" }])
  })

  test("una chiamata che ha risposto non si scrive come senza risposta", async () => {
    esegui({ voce: { stato: () => Promise.resolve({}) } })
    await ponte().voce!.stato!()
    expect(timer.every((t) => t.annullato)).toBe(true)
  })

  test("la scelta di una cartella aspetta il creator: il suo tempo non conta", async () => {
    esegui({ cartellaDati: { sposta: chiamaLenta(60000) } })
    await ponte().cartellaDati!.sposta!()
    expect(righe()).toEqual([])
  })

  test("chi non è una promessa passa com'è, e il rifiuto arriva a chi chiama", async () => {
    const smetti = () => {}
    esegui({ trascinamento: { su: () => smetti }, voce: { avvia: () => Promise.reject(new Error("microfono_negato")) } })
    expect(ponte().trascinamento!.su!()).toBe(smetti)
    await expect(ponte().voce!.avvia!() as Promise<unknown>).rejects.toThrow("microfono_negato")
  })
})

describe("«Segnala un problema»", () => {
  test("manda all'app ciò che il creator ha scritto, l'errore, la scelta sulla schermata e la pagina", async () => {
    esegui()
    const inviata = await (ponte().segnalazione!.invia!({ nota: "non parte", errore: "Il server non parte", schermata: true }) as Promise<unknown>)
    expect(inviata).toEqual({ inviata: true })
    expect(chiamate.at(-1)).toEqual({
      comando: "plugin:mango-animation-segnalazione|segnala_problema",
      argomenti: { errore: "Il server non parte", nota: "non parte", schermata: true, pagina: "/#/motori" },
    })
  })

  test("senza niente da dire parte comunque, senza schermata", async () => {
    esegui()
    await ponte().segnalazione!.invia!()
    expect(chiamate.at(-1)?.argomenti).toEqual({ errore: null, nota: null, schermata: false, pagina: "/#/motori" })
  })

  test("chiede all'app se l'invio è attivo, per mostrare l'interruttore della schermata solo allora", async () => {
    esegui()
    await ponte().segnalazione!.invioAttivo!()
    expect(chiamate.at(-1)).toEqual({ comando: "plugin:mango-animation-segnalazione|segnalazione_invio_attivo", argomenti: undefined })
  })

  test("gli altri ponti restano dove erano", () => {
    esegui({ appunti: { percorsi: () => Promise.resolve([]) } })
    expect(Object.keys(ponte()).sort()).toEqual(["appunti", "segnalazione"])
  })
})
