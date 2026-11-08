// La logica di `bun run --cwd server riavvia-app` (`docs/APP.md`): ferma l'app registrata in `app.json`, solo per il suo pid, e la riaccende.
// Il «sistema» (processi, file, rete) si passa da fuori: le prove lo sostituiscono.
import { rm } from "node:fs/promises"
import { connect } from "node:net"
import { dirname, join, win32 } from "node:path"

export const VARIABILE_PID_APP = "MANGO_ANIMATION_APP_PID"
const FILE_REGISTRO = "app.json"
const PORTA_DI_DEFAULT = 47431
const PASSO_MS = 250
const PASSO_AVVIO_MS = 500
const DOPO_L_UCCISIONE_MS = 5_000

export interface Sistema {
  /** Il testo di `app.json` nella cartella dei dati, `null` se non c'è. */
  leggiRegistro: (cartella: string) => Promise<string | null>
  togliRegistro: (cartella: string) => Promise<void>
  esiste: (percorso: string) => Promise<boolean>
  vivo: (pid: number) => boolean
  /** Il percorso dell'eseguibile del processo, `null` se il pid non c'è. */
  immagineDi: (pid: number) => Promise<string | null>
  /** Chiede alla finestra principale di chiudersi; `false` se il processo non ne ha una. */
  chiudiConGarbo: (pid: number) => Promise<boolean>
  /** Ferma quel pid e i suoi discendenti. */
  uccidi: (pid: number) => Promise<void>
  portaOccupata: (porta: number) => Promise<boolean>
  /** Il server dà una risposta HTTP qualsiasi (anche un 401). */
  serverRisponde: (porta: number) => Promise<boolean>
  /** Accende l'eseguibile staccato da chi lo lancia e ne dà il pid. */
  avvia: (exe: string, ambiente: Record<string, string>) => number
  ora: () => number
  attendi: (ms: number) => Promise<void>
}

export interface OpzioniRiavvio {
  /** La cartella locale dei dati dell'app, dove sta `app.json`. */
  dati: string
  porta: number
  /** Solo ferma, non riaccende. */
  solaChiusura: boolean
  exe: string | null
  /** L'eseguibile da accendere quando nessuna app è registrata e `exe` manca. */
  exePredefinito: string
  /** L'ambiente di chi lancia il comando: arriva all'app che si accende, meno il pid dell'app vecchia. */
  ambiente: Record<string, string | undefined>
  scrivi: (riga: string) => void
  attese?: { chiusuraMs: number; portaMs: number; avvioMs: number }
}

const ATTESE = { chiusuraMs: 15_000, portaMs: 10_000, avvioMs: 120_000 }

interface Istanza {
  pid: number
  exe: string
}

function leggiIstanza(testo: string | null): Istanza | null {
  if (testo === null) return null
  let valore: unknown
  try {
    valore = JSON.parse(testo)
  } catch {
    return null
  }
  if (typeof valore !== "object" || valore === null) return null
  const { pid, exe } = valore as Record<string, unknown>
  return typeof pid === "number" && Number.isInteger(pid) && pid > 0 && typeof exe === "string" && exe !== "" ? { pid, exe } : null
}

/** Stesso eseguibile: senza maiuscole, con le barre di Windows e senza il prefisso dei percorsi lunghi. */
function stessoPercorso(a: string, b: string): boolean {
  const normale = (p: string): string => win32.normalize(p.replace(/^\\\\\?\\/, "")).toLowerCase()
  return normale(a) === normale(b)
}

async function aspettaChe(sistema: Sistema, condizione: () => boolean | Promise<boolean>, massimoMs: number): Promise<boolean> {
  const limite = sistema.ora() + massimoMs
  for (;;) {
    if (await condizione()) return true
    const resto = limite - sistema.ora()
    if (resto <= 0) return false
    await sistema.attendi(Math.min(PASSO_MS, resto))
  }
}

/** Dopo la chiusura gentile, e se serve per pid. Non uccide un pid che nel frattempo è diventato un altro programma. */
async function fermaApp(sistema: Sistema, app: Istanza, scrivi: (riga: string) => void, chiusuraMs: number): Promise<void> {
  const conGarbo = await sistema.chiudiConGarbo(app.pid)
  if (conGarbo && (await aspettaChe(sistema, () => !sistema.vivo(app.pid), chiusuraMs))) return
  scrivi(conGarbo ? `L'app non si chiude da sola: la fermo (pid ${app.pid}).` : `L'app è senza finestra da chiudere: la fermo (pid ${app.pid}).`)
  const immagine = await sistema.immagineDi(app.pid)
  if (immagine === null) return
  if (!stessoPercorso(immagine, app.exe)) {
    scrivi(`Il pid ${app.pid} nel frattempo è diventato un altro programma (${immagine}): non lo tocco.`)
    return
  }
  await sistema.uccidi(app.pid)
  if (!(await aspettaChe(sistema, () => !sistema.vivo(app.pid), DOPO_L_UCCISIONE_MS))) throw new Error(`Non riesco a fermare l'app (pid ${app.pid}).`)
}

/** L'app di `app.json` se è davvero in esecuzione; altrimenti dice perché il file non vale e lo toglie. */
async function appRegistrata(sistema: Sistema, opzioni: OpzioniRiavvio): Promise<Istanza | null> {
  const { dati, scrivi } = opzioni
  const testo = await sistema.leggiRegistro(dati)
  if (testo === null) {
    scrivi("Nessuna app registrata in esecuzione (un'app accesa prima di questa versione non si registra: va chiusa a mano una volta).")
    return null
  }
  const istanza = leggiIstanza(testo)
  if (istanza === null) {
    scrivi(`Il registro dell'app (${FILE_REGISTRO}) non si legge: lo ignoro.`)
    await sistema.togliRegistro(dati)
    return null
  }
  if (opzioni.ambiente[VARIABILE_PID_APP] === String(istanza.pid)) {
    throw new Error("Lanciato dalla chat dell'app, questo comando fermerebbe se stesso insieme all'app. Lancialo da un terminale fuori dall'app.")
  }
  const immagine = await sistema.immagineDi(istanza.pid)
  if (immagine === null) {
    scrivi(`Il registro dice che l'app era il pid ${istanza.pid}, ma il pid ${istanza.pid} non c'è più (file rimasto da una chiusura brusca): lo ignoro.`)
    await sistema.togliRegistro(dati)
    return null
  }
  if (!stessoPercorso(immagine, istanza.exe)) {
    scrivi(`Il pid ${istanza.pid} del registro ora è un altro programma (${immagine}): il registro è vecchio, lo ignoro e non tocco niente.`)
    await sistema.togliRegistro(dati)
    return null
  }
  return istanza
}

function senzaPidDell(ambiente: Record<string, string | undefined>): Record<string, string> {
  const pulito: Record<string, string> = {}
  for (const [nome, valore] of Object.entries(ambiente)) {
    if (valore !== undefined && nome.toUpperCase() !== VARIABILE_PID_APP) pulito[nome] = valore
  }
  return pulito
}

export async function riavvia(sistema: Sistema, opzioni: OpzioniRiavvio): Promise<void> {
  const { dati, porta, scrivi } = opzioni
  const attese = opzioni.attese ?? ATTESE
  const app = await appRegistrata(sistema, opzioni)
  if (opzioni.solaChiusura && !app) return
  if (app && opzioni.exe !== null && !stessoPercorso(opzioni.exe, app.exe)) {
    throw new Error(`È accesa un'altra app (pid ${app.pid}, ${app.exe}), non quella indicata: non la tocco.`)
  }
  const exe = app?.exe ?? opzioni.exe ?? opzioni.exePredefinito
  if (!opzioni.solaChiusura && !(await sistema.esiste(exe))) {
    throw new Error(`Non trovo ${exe}: va costruita con «cargo tauri build --no-bundle» da app/.`)
  }

  if (app) {
    scrivi(`Chiudo l'app (pid ${app.pid})…`)
    await fermaApp(sistema, app, scrivi, attese.chiusuraMs)
    await sistema.togliRegistro(dati)
  }
  if (!(await aspettaChe(sistema, async () => !(await sistema.portaOccupata(porta)), app ? attese.portaMs : 0))) {
    scrivi(
      opzioni.solaChiusura
        ? `La porta ${porta} è ancora occupata da un server che non ho acceso io: non lo fermo.`
        : `La porta ${porta} è ancora occupata da un server che non ho acceso io: non lo fermo, la nuova app lo userà così com'è (le modifiche al server non si ricaricano).`,
    )
  }
  if (opzioni.solaChiusura) {
    scrivi("Ferma.")
    return
  }

  scrivi(`Accendo l'app (${exe})…`)
  const lanciato = sistema.avvia(exe, senzaPidDell(opzioni.ambiente))
  const log = join(dati, "logs", "server.log")
  const inizio = sistema.ora()
  for (;;) {
    const nuova = leggiIstanza(await sistema.leggiRegistro(dati))
    const immagine = nuova ? await sistema.immagineDi(nuova.pid) : null
    if (nuova && immagine !== null && stessoPercorso(immagine, exe) && (await sistema.serverRisponde(porta))) {
      scrivi(`Accesa: pid ${nuova.pid}, server su http://127.0.0.1:${porta}`)
      return
    }
    if (!sistema.vivo(lanciato)) {
      throw new Error(`L'app si è chiusa subito. Se ne era già accesa una costruita prima del registro, chiudila a mano una volta e rilancia il comando; altrimenti guarda ${log}.`)
    }
    const trascorso = sistema.ora() - inizio
    if (trascorso >= attese.avvioMs) throw new Error(`L'app non è pronta dopo ${Math.round(trascorso / 1000)} s: guarda ${log}.`)
    await sistema.attendi(PASSO_AVVIO_MS)
  }
}

/** Gli argomenti della riga di comando. */
export function argomentiDi(argv: string[]): { ferma: boolean; exe: string | null; dati: string | null } {
  const usa = "Si scrive: riavvia-app [--ferma] [--exe <percorso>] [--dati <cartella>]."
  const esito = { ferma: false, exe: null as string | null, dati: null as string | null }
  for (let i = 0; i < argv.length; i++) {
    const argomento = argv[i]
    if (argomento === "--ferma") esito.ferma = true
    else if (argomento === "--exe" || argomento === "--dati") {
      const valore = argv[++i]
      if (valore === undefined) throw new Error(`${argomento} vuole un valore. ${usa}`)
      if (argomento === "--exe") esito.exe = valore
      else esito.dati = valore
    } else throw new Error(`Non conosco «${argomento}». ${usa}`)
  }
  return esito
}

/** La porta del server, come la legge il server stesso. */
export function portaDelServer(valore: string | undefined): number {
  if (valore === undefined || valore === "") return PORTA_DI_DEFAULT
  const n = Number(valore)
  if (!Number.isInteger(n) || n < 0 || n > 65535) throw new Error(`«${valore}» non è una porta valida: MANGO_ANIMATION_PORTA vuole un numero da 0 a 65535.`)
  return n
}

async function powershell(comando: string): Promise<string> {
  const processo = Bun.spawn(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", comando], { stdin: "ignore", stdout: "pipe", stderr: "pipe" })
  const [uscita, errori, codice] = await Promise.all([new Response(processo.stdout).text(), new Response(processo.stderr).text(), processo.exited])
  if (codice !== 0) throw new Error(`PowerShell ha risposto con errore ${codice}: ${errori.trim()}`)
  return uscita.trim()
}

function pidValido(pid: number): number {
  if (!Number.isInteger(pid) || pid <= 0) throw new Error(`«${pid}» non è un pid.`)
  return pid
}

export const sistemaVero: Sistema = {
  leggiRegistro: async (cartella) => {
    const file = Bun.file(join(cartella, FILE_REGISTRO))
    return (await file.exists()) ? file.text() : null
  },
  togliRegistro: (cartella) => rm(join(cartella, FILE_REGISTRO), { force: true }),
  esiste: (percorso) => Bun.file(percorso).exists(),
  vivo: (pid) => {
    try {
      process.kill(pid, 0)
      return true
    } catch (errore) {
      return (errore as NodeJS.ErrnoException).code === "EPERM"
    }
  },
  immagineDi: async (pid) => {
    const risposta = await powershell(
      `$p = Get-Process -Id ${pidValido(pid)} -ErrorAction SilentlyContinue; if ($p) { 'SI ' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes([string]$p.Path)) } else { 'NO' }`,
    )
    return risposta.startsWith("SI") ? Buffer.from(risposta.slice(2).trim(), "base64").toString("utf-8") : null
  },
  chiudiConGarbo: async (pid) => (await powershell(`$p = Get-Process -Id ${pidValido(pid)} -ErrorAction SilentlyContinue; if ($p -and $p.CloseMainWindow()) { 'SI' } else { 'NO' }`)) === "SI",
  uccidi: async (pid) => {
    await Bun.spawn(["taskkill", "/PID", String(pidValido(pid)), "/T", "/F"], { stdin: "ignore", stdout: "ignore", stderr: "ignore" }).exited
  },
  portaOccupata: (porta) =>
    new Promise((risolvi) => {
      const presa = connect({ host: "127.0.0.1", port: porta })
      const esito = (occupata: boolean): void => {
        presa.destroy()
        risolvi(occupata)
      }
      presa.setTimeout(1000, () => esito(true))
      presa.once("connect", () => esito(true))
      presa.once("error", () => esito(false))
    }),
  serverRisponde: async (porta) => {
    try {
      const risposta = await fetch(`http://127.0.0.1:${porta}/api/lavori`, { signal: AbortSignal.timeout(3000) })
      await risposta.body?.cancel()
      return true
    } catch {
      return false
    }
  },
  avvia: (exe, ambiente) => {
    const processo = Bun.spawn([exe], { env: ambiente, cwd: dirname(exe), stdin: "ignore", stdout: "ignore", stderr: "ignore", detached: true })
    processo.unref()
    return processo.pid
  },
  ora: () => Date.now(),
  attendi: (ms) => Bun.sleep(ms),
}
