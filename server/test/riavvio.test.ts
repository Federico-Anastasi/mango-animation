import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { argomentiDi, portaDelServer, riavvia, sistemaVero, type OpzioniRiavvio, type Sistema } from "../src/riavvio"

const EXE = String.raw`C:\codice\app\target\release\mango-animation.exe`
const ALTRO = String.raw`C:\Windows\notepad.exe`
const DATI = String.raw`C:\Dati\dev.mango.animation`
async function aspetta<T>(prova: () => T | Promise<T>, ms = 8000): Promise<NonNullable<T>> {
  const limite = Date.now() + ms
  for (;;) {
    const valore = await prova()
    if (valore) return valore as NonNullable<T>
    if (Date.now() > limite) throw new Error(`Non è successo entro ${ms} ms`)
    await Bun.sleep(25)
  }
}

const registro = (pid: number, exe = EXE): string => JSON.stringify({ pid, exe })

interface Scenario {
  /** Il contenuto di app.json prima di cominciare. */
  registro?: string | null
  /** I processi vivi: pid, percorso dell'immagine. */
  processi?: Record<number, string>
  /** La finestra si chiude con garbo e il processo esce. */
  esceConGarbo?: boolean
  /** L'app ha una finestra a cui chiedere la chiusura. */
  finestra?: boolean
  /** Dopo la chiusura qualcun altro tiene la porta. */
  portaTenuta?: boolean
  /** Cosa fa l'app lanciata: si registra e fa rispondere il server, si registra senza server, esce subito o resta viva senza registrarsi. */
  avvio?: "parte" | "senza-server" | "esce" | "muta"
  /** I file che esistono. */
  esistono?: string[]
}

/** Un sistema senza processi, file né rete veri: il tempo passa solo quando la logica aspetta. */
function sistemaFinto(s: Scenario = {}) {
  const stato = {
    registro: s.registro ?? null,
    processi: new Map<number, string>(Object.entries(s.processi ?? {}).map(([pid, immagine]) => [Number(pid), immagine])),
    porta: false,
    server: false,
    tempo: 0,
    prossimo: 900,
    chiamate: [] as string[],
    avviati: [] as { exe: string; ambiente: Record<string, string> }[],
  }
  const registrato = Number(/"pid":\s*(\d+)/.exec(stato.registro ?? "")?.[1])
  if (stato.processi.has(registrato)) {
    stato.porta = true
    stato.server = true
  }
  const finisce = (pid: number): void => {
    stato.processi.delete(pid)
    if (!s.portaTenuta) {
      stato.porta = false
      stato.server = false
    }
  }
  const sistema: Sistema = {
    leggiRegistro: async () => stato.registro,
    togliRegistro: async () => {
      stato.chiamate.push("togliRegistro")
      stato.registro = null
    },
    esiste: async (percorso) => (s.esistono ?? [EXE]).includes(percorso),
    vivo: (pid) => stato.processi.has(pid),
    immagineDi: async (pid) => stato.processi.get(pid) ?? null,
    chiudiConGarbo: async (pid) => {
      stato.chiamate.push(`garbo ${pid}`)
      if (s.finestra === false) return false
      if (s.esceConGarbo !== false) finisce(pid)
      return true
    },
    uccidi: async (pid) => {
      stato.chiamate.push(`uccidi ${pid}`)
      finisce(pid)
    },
    portaOccupata: async () => stato.porta,
    serverRisponde: async () => stato.server,
    avvia: (exe, ambiente) => {
      const pid = stato.prossimo++
      stato.chiamate.push(`avvia ${exe}`)
      stato.avviati.push({ exe, ambiente })
      if (s.avvio === "esce") return pid
      stato.processi.set(pid, exe)
      if (s.avvio === "muta") return pid
      stato.registro = registro(pid, exe)
      stato.porta = true
      stato.server = s.avvio !== "senza-server"
      return pid
    },
    ora: () => stato.tempo,
    attendi: async (ms) => {
      stato.tempo += ms
      if (stato.tempo > 10 * 60_000) throw new Error("la prova aspetta da dieci minuti: la logica non finisce")
    },
  }
  return { sistema, stato }
}

const opzioniDi = (righe: string[], extra: Partial<OpzioniRiavvio> = {}): OpzioniRiavvio => ({
  dati: DATI,
  porta: 47431,
  solaChiusura: false,
  exe: null,
  exePredefinito: EXE,
  ambiente: {},
  scrivi: (riga) => righe.push(riga),
  ...extra,
})

async function esegui(s: Scenario, extra: Partial<OpzioniRiavvio> = {}) {
  const { sistema, stato } = sistemaFinto(s)
  const righe: string[] = []
  const errore = await riavvia(sistema, opzioniDi(righe, extra)).then(
    () => null,
    (e: unknown) => (e instanceof Error ? e.message : String(e)),
  )
  return { stato, righe, testo: righe.join("\n"), errore }
}

describe("riavvia-app: la logica", () => {
  test("senza registro non c'è niente da fermare: accende l'app costruita e dice il pid nuovo", async () => {
    const r = await esegui({})
    expect(r.errore).toBeNull()
    expect(r.stato.chiamate).toEqual([`avvia ${EXE}`])
    expect(r.righe[0]).toContain("Nessuna app registrata")
    expect(r.righe.at(-1)).toBe("Accesa: pid 900, server su http://127.0.0.1:47431")
  })

  test("un'app accesa prima del registro non si vede: la frase dice di chiuderla a mano una volta", async () => {
    const r = await esegui({})
    expect(r.testo).toContain("chiusa a mano una volta")
  })

  test("un registro il cui pid non c'è più è un file vecchio: lo dice, non uccide niente, ne toglie il file e accende", async () => {
    const r = await esegui({ registro: registro(1234) })
    expect(r.errore).toBeNull()
    expect(r.testo).toContain("pid 1234 non c'è più")
    expect(r.stato.chiamate).toEqual(["togliRegistro", `avvia ${EXE}`])
  })

  test("un pid vivo che è un altro programma (pid riusato) non si tocca", async () => {
    const r = await esegui({ registro: registro(1234), processi: { 1234: ALTRO } })
    expect(r.errore).toBeNull()
    expect(r.testo).toContain("un altro programma")
    expect(r.stato.chiamate.filter((c) => c.startsWith("garbo") || c.startsWith("uccidi"))).toEqual([])
    expect(r.stato.processi.has(1234)).toBe(true)
  })

  test("un registro che non si legge si ignora", async () => {
    for (const guasto of ["non è json", "{}", JSON.stringify({ pid: "1", exe: EXE }), JSON.stringify({ pid: -4, exe: EXE })]) {
      const r = await esegui({ registro: guasto })
      expect(r.errore).toBeNull()
      expect(r.testo).toContain("non si legge")
      expect(r.stato.chiamate.some((c) => c.startsWith("uccidi"))).toBe(false)
    }
  })

  test("l'app chiusa con garbo: niente kill, poi riparte la stessa e il pid cambia", async () => {
    const r = await esegui({ registro: registro(1234), processi: { 1234: EXE } })
    expect(r.errore).toBeNull()
    expect(r.stato.chiamate).toEqual(["garbo 1234", "togliRegistro", `avvia ${EXE}`])
    expect(r.righe[0]).toBe("Chiudo l'app (pid 1234)…")
    expect(r.righe.at(-1)).toBe("Accesa: pid 900, server su http://127.0.0.1:47431")
  })

  test("il percorso si confronta senza maiuscole e con le barre di Windows", async () => {
    const scritto = "c:/codice/APP/target/release/Mango-Animation.exe"
    const r = await esegui({ registro: registro(1234, scritto), processi: { 1234: EXE }, esistono: [scritto] })
    expect(r.errore).toBeNull()
    expect(r.stato.chiamate[0]).toBe("garbo 1234")
  })

  test("se non esce entro 15 secondi si ferma per pid, e solo quello", async () => {
    const r = await esegui({ registro: registro(1234), processi: { 1234: EXE, 77: ALTRO }, esceConGarbo: false })
    expect(r.errore).toBeNull()
    expect(r.stato.chiamate).toEqual(["garbo 1234", "uccidi 1234", "togliRegistro", `avvia ${EXE}`])
    expect(r.stato.processi.has(77)).toBe(true)
    expect(r.stato.tempo).toBeGreaterThanOrEqual(15_000)
    expect(r.testo).toContain("non si chiude da sola")
  })

  test("un'app senza finestra da chiudere si ferma subito per pid", async () => {
    const r = await esegui({ registro: registro(1234), processi: { 1234: EXE }, finestra: false })
    expect(r.errore).toBeNull()
    expect(r.stato.chiamate.slice(0, 2)).toEqual(["garbo 1234", "uccidi 1234"])
    expect(r.testo).toContain("senza finestra")
  })

  test("se il pid cambia programma mentre si aspetta, non lo si uccide", async () => {
    const { sistema, stato } = sistemaFinto({ registro: registro(1234), processi: { 1234: EXE }, esceConGarbo: false })
    const attendi = sistema.attendi
    sistema.attendi = async (ms) => {
      stato.processi.set(1234, ALTRO)
      await attendi(ms)
    }
    await riavvia(sistema, opzioniDi([], { solaChiusura: true }))
    expect(stato.chiamate.some((c) => c.startsWith("uccidi"))).toBe(false)
  })

  test("un server tenuto da altri sulla porta non si ferma: avviso e si prosegue", async () => {
    const r = await esegui({ registro: registro(1234), processi: { 1234: EXE }, portaTenuta: true })
    expect(r.errore).toBeNull()
    expect(r.testo).toContain("porta 47431 è ancora occupata")
    expect(r.testo).toContain("non lo fermo")
    expect(r.stato.chiamate.filter((c) => c.startsWith("uccidi"))).toEqual([])
    expect(r.stato.chiamate.at(-1)).toBe(`avvia ${EXE}`)
  })

  test("senza app registrata una porta occupata si segnala senza aspettare", async () => {
    const { sistema, stato } = sistemaFinto({})
    stato.porta = true
    stato.server = true
    const righe: string[] = []
    await riavvia(sistema, opzioniDi(righe))
    expect(righe.join("\n")).toContain("porta 47431 è ancora occupata")
    expect(stato.tempo).toBeLessThan(10_000)
  })

  test("lanciato dalla chat dell'app (il pid è quello registrato) rifiuta e non tocca niente", async () => {
    const r = await esegui({ registro: registro(1234), processi: { 1234: EXE } }, { ambiente: { MANGO_ANIMATION_APP_PID: "1234" } })
    expect(r.errore).toContain("fuori dall'app")
    expect(r.stato.chiamate).toEqual([])
  })

  test("la variabile di un'altra app non blocca il comando", async () => {
    const r = await esegui({ registro: registro(1234), processi: { 1234: EXE } }, { ambiente: { MANGO_ANIMATION_APP_PID: "55" } })
    expect(r.errore).toBeNull()
  })

  test("--ferma chiude l'app e non la riavvia", async () => {
    const r = await esegui({ registro: registro(1234), processi: { 1234: EXE } }, { solaChiusura: true })
    expect(r.errore).toBeNull()
    expect(r.stato.chiamate).toEqual(["garbo 1234", "togliRegistro"])
    expect(r.righe.at(-1)).toBe("Ferma.")
  })

  test("--ferma senza app accesa lo dice e non accende niente", async () => {
    const r = await esegui({}, { solaChiusura: true })
    expect(r.errore).toBeNull()
    expect(r.stato.chiamate).toEqual([])
    expect(r.testo).toContain("Nessuna app")
  })

  test("--exe indica quale accendere quando l'app non c'è", async () => {
    const altro = String.raw`D:\prove\app.exe`
    const r = await esegui({ esistono: [altro] }, { exe: altro })
    expect(r.errore).toBeNull()
    expect(r.stato.chiamate).toEqual([`avvia ${altro}`])
  })

  test("--exe diverso dall'app accesa: quella non si tocca", async () => {
    const r = await esegui({ registro: registro(1234), processi: { 1234: EXE }, esistono: [EXE, String.raw`D:\x.exe`] }, { exe: String.raw`D:\x.exe` })
    expect(r.errore).toContain("un'altra app")
    expect(r.stato.chiamate).toEqual([])
  })

  test("l'eseguibile che non c'è dice come costruirlo", async () => {
    const r = await esegui({ esistono: [] })
    expect(r.errore).toContain("cargo tauri build --no-bundle")
    expect(r.errore).toContain(EXE)
    expect(r.stato.avviati).toEqual([])
  })

  test("se l'eseguibile dell'app accesa non c'è più, lo dice prima di chiuderla", async () => {
    const r = await esegui({ registro: registro(1234), processi: { 1234: EXE }, esistono: [] })
    expect(r.errore).toContain("cargo tauri build --no-bundle")
    expect(r.stato.chiamate).toEqual([])
  })

  test("l'app nuova non eredita il pid di quella vecchia, e riceve il resto dell'ambiente di chi lancia", async () => {
    const r = await esegui({}, { ambiente: { MANGO_ANIMATION_APP_PID: "55", MANGO_ANIMATION_LAVORO: String.raw`D:\prova`, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=9222" } })
    expect(r.stato.avviati[0]?.ambiente).toEqual({ MANGO_ANIMATION_LAVORO: String.raw`D:\prova`, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=9222" })
  })

  test("un avvio che non scrive il registro nuovo è un errore che dice dove guardare", async () => {
    const r = await esegui({ avvio: "muta" })
    expect(r.errore).toContain(String.raw`logs\server.log`)
    expect(r.stato.tempo).toBeGreaterThanOrEqual(120_000)
  })

  test("un'app registrata ma col server che non risponde è un errore dopo l'attesa", async () => {
    const r = await esegui({ avvio: "senza-server" })
    expect(r.errore).toContain(String.raw`logs\server.log`)
  })

  test("se l'app lanciata esce subito (un'altra era già accesa e non registrata) la frase lo spiega, senza aspettare i 120 secondi", async () => {
    const r = await esegui({ avvio: "esce" })
    expect(r.errore).toContain("chiudila a mano")
    expect(r.stato.tempo).toBeLessThan(60_000)
  })

  test("il pid registrato dopo l'avvio deve essere di quell'eseguibile", async () => {
    const { sistema, stato } = sistemaFinto({ avvio: "muta" })
    const avvia = sistema.avvia
    sistema.avvia = (exe, ambiente) => {
      const pid = avvia(exe, ambiente)
      stato.processi.set(5000, ALTRO)
      stato.registro = registro(5000, EXE)
      stato.server = true
      return pid
    }
    const errore = await riavvia(sistema, opzioniDi([])).then(
      () => null,
      (e: unknown) => String(e),
    )
    expect(errore).toContain("server.log")
  })

  test("la porta è quella chiesta", async () => {
    const r = await esegui({}, { porta: 48000 })
    expect(r.righe.at(-1)).toBe("Accesa: pid 900, server su http://127.0.0.1:48000")
  })
})

describe("riavvia-app: la riga di comando", () => {
  test("senza argomenti riavvia", () => {
    expect(argomentiDi([])).toEqual({ ferma: false, exe: null, dati: null })
  })

  test("--ferma, --exe e --dati", () => {
    const [exe, dati] = [String.raw`D:\prove\app.exe`, String.raw`D:\prove\dati`]
    expect(argomentiDi(["--ferma", "--exe", exe, "--dati", dati])).toEqual({ ferma: true, exe, dati })
  })

  test("un argomento sconosciuto o senza valore è un errore che dice cosa si può scrivere", () => {
    expect(() => argomentiDi(["--spegni"])).toThrow(/--ferma.*--exe.*--dati/)
    expect(() => argomentiDi(["--exe"])).toThrow(/--exe vuole/)
  })

  test("la porta è quella del server: 47431 se la variabile manca o è vuota", () => {
    expect(portaDelServer(undefined)).toBe(47431)
    expect(portaDelServer("")).toBe(47431)
    expect(portaDelServer("48000")).toBe(48000)
    expect(() => portaDelServer("abc")).toThrow(/non è una porta valida/)
  })
})

describe("riavvia-app: il sistema vero, su processi che si accendono qui", () => {
  const cartelle: string[] = []
  const pid: number[] = []
  const chiusure: (() => void)[] = []

  afterEach(async () => {
    for (const p of pid.splice(0)) if (sistemaVero.vivo(p)) await sistemaVero.uccidi(p)
    for (const chiudi of chiusure.splice(0)) chiudi()
    for (const c of cartelle.splice(0)) await rm(c, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  })

  const dormiente = (): number => {
    const processo = Bun.spawn([process.execPath, "-e", "setTimeout(() => {}, 60000)"], { stdin: "ignore", stdout: "ignore", stderr: "ignore" })
    pid.push(processo.pid)
    return processo.pid
  }

  test("il percorso dell'immagine di un pid si legge", async () => {
    const p = dormiente()
    expect(sistemaVero.vivo(p)).toBe(true)
    const immagine = await sistemaVero.immagineDi(p)
    expect(immagine?.toLowerCase()).toBe(process.execPath.toLowerCase())
  })

  test("un pid che non c'è non ha immagine e fermarlo non fa danni", async () => {
    expect(await sistemaVero.immagineDi(2_147_000_000)).toBeNull()
    expect(sistemaVero.vivo(2_147_000_000)).toBe(false)
    const accanto = dormiente()
    await sistemaVero.uccidi(2_147_000_000)
    expect(sistemaVero.vivo(accanto)).toBe(true)
  })

  test("taskkill per pid ferma quel processo e non quello accanto", async () => {
    const [a, b] = [dormiente(), dormiente()]
    await sistemaVero.uccidi(a)
    await aspetta(() => !sistemaVero.vivo(a))
    expect(sistemaVero.vivo(b)).toBe(true)
  })

  test("un processo senza finestra non si chiude con garbo: lo dice", async () => {
    const p = dormiente()
    expect(await sistemaVero.chiudiConGarbo(p)).toBe(false)
    expect(sistemaVero.vivo(p)).toBe(true)
  })

  test("la porta occupata e quella libera", async () => {
    const ascolto = createServer()
    await new Promise<void>((ok) => ascolto.listen(0, "127.0.0.1", ok))
    const porta = (ascolto.address() as { port: number }).port
    expect(await sistemaVero.portaOccupata(porta)).toBe(true)
    await new Promise<void>((ok) => ascolto.close(() => ok()))
    expect(await sistemaVero.portaOccupata(porta)).toBe(false)
  })

  test("il server risponde con qualunque risposta HTTP, anche 401", async () => {
    const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response("no", { status: 401 }) })
    chiusure.push(() => void server.stop(true))
    const porta = server.port!
    expect(await sistemaVero.serverRisponde(porta)).toBe(true)
    await server.stop(true)
    expect(await sistemaVero.serverRisponde(porta)).toBe(false)
  })

  test("il registro si legge e si toglie; senza file non c'è", async () => {
    const cartella = await mkdtemp(join(tmpdir(), "mango-riavvio-"))
    cartelle.push(cartella)
    expect(await sistemaVero.leggiRegistro(cartella)).toBeNull()
    await writeFile(join(cartella, "app.json"), registro(5))
    expect(await sistemaVero.leggiRegistro(cartella)).toBe(registro(5))
    await sistemaVero.togliRegistro(cartella)
    await sistemaVero.togliRegistro(cartella)
    expect(await sistemaVero.leggiRegistro(cartella)).toBeNull()
  })

  test("l'eseguibile si lancia staccato, con l'ambiente dato", async () => {
    const cartella = await mkdtemp(join(tmpdir(), "mango-riavvio-"))
    cartelle.push(cartella)
    const uscita = join(cartella, "ambiente.txt")
    const script = join(cartella, "finta-app.cmd")
    await writeFile(script, `@echo off\r\necho %PROVA_RIAVVIO%> "${uscita}"\r\nping -n 30 127.0.0.1 >nul\r\n`)
    const avviato = sistemaVero.avvia(script, { ...(process.env as Record<string, string>), PROVA_RIAVVIO: "ciao" })
    pid.push(avviato)
    const scritto = await aspetta(async () => (await readFile(uscita, "utf-8").catch(() => "")) || null, 10_000)
    expect(scritto.trim()).toBe("ciao")
    expect(sistemaVero.vivo(avviato)).toBe(true)
  })
})
