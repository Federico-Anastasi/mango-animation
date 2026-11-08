import { query } from "@anthropic-ai/claude-agent-sdk"
import { statSync } from "node:fs"
import { homedir, type NetworkInterfaceInfo } from "node:os"
import { dirname, join, resolve } from "node:path"
import { leggiConPowerShell, type LeggiFirewall } from "./arrivi/firewall"
import type { OpzioniChat } from "./chat/tipi"
import { MangoCode } from "./chat/mangocode"
import { conIlClaudeDelCreator } from "./chat/metodo"
import { cartellaDelleSessioni, sessioniDiClaudeCode } from "./chat/sessioni"
import type { OpzioniConsumi } from "./consumi/consumi"
import { prestitoDaMangoCode, type PrestitoSchede } from "./schede"
import { elencaConFfmpeg, type OpzioniRegistrazione } from "./registrazione"

const PORTA_DI_DEFAULT = 47431
const PORTA_ARRIVI_DI_DEFAULT = 47420
const LIMITE_ARRIVI_BYTE = 20 * 1024 ** 3
const RIMBALZO_MS = 150

export const VARIABILE_LAVORO = "MANGO_ANIMATION_LAVORO"

const CODIFICA_CON_SCHEDA = ["-c:v", "h264_nvenc"]
const CODIFICA_SU_PROCESSORE = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20"]
const CODIFICA_COMUNE = ["-pix_fmt", "yuv420p"]

export interface Opzioni {
  /** La cartella del prodotto: motore, strumenti, studio, stile, metodo. */
  codice: string
  /** La cartella di chi usa il prodotto (`docs/ARCHITETTURA.md`, «La cartella di lavoro»): l'archivio, e il posto dove Claude lavora. */
  lavoro: string
  archivio: string
  /** Lo stile di serie del prodotto. */
  stile: string
  /** Lo stile del creator, nella cartella di lavoro, che si sovrappone a quello di serie (`docs/ARCHITETTURA.md`, «Lo stile»): può non esserci. */
  stileCreator: string
  schemi: string
  porta: number
  indirizzo: string
  studio: string
  font: string
  motore: { eseguibile: string; modulo: string; ambiente: Record<string, string> }
  ffprobe: string | null
  /** Per l'immagine di un file del girato appena entrato; `null` se non è installato. */
  ffmpeg: string | null
  /** Il comando di yt-dlp per scaricare dal web nel girato; `null` se non è installato. */
  ytdlp: string[] | null
  registrazione: OpzioniRegistrazione
  animazioni: { cartella: string; comando: string[] }
  /** Claude Code per la chat: la funzione `query` dell'SDK e la lettura delle sue conversazioni; le prove ne mettono di finte. */
  chat: OpzioniChat
  /** Le conversazioni di Claude Code da cui si ricava il lavoro di Claude per video (`consumi/`): la loro cartella e quanto devono restare ferme prima di rileggerle. */
  consumi: OpzioniConsumi & { cartella: string }
  /** Le schede video in prestito dal modello di Mango Code, per i lavori che le vogliono (`schede.ts`). */
  schede: PrestitoSchede
  arrivi: { porta: number; limiteByte: number; indirizzo: string | null; spazioLibero?: (cartella: string) => number | Promise<number>; adesso?: () => Date; interfacce?: () => NodeJS.Dict<NetworkInterfaceInfo[]> }
  rimbalzoMs: number
  /** Quanto deve restare fermo un file in `uscite/` prima che si annunci (il montaggio lo scrive per minuti). */
  quietoUsciteMs: number
  /** Quanto deve restare fermo un file copiato a mano in `grezzo/` prima di misurarlo. */
  fermoMs: number
  battitoMs: number
  leggiFirewall: LeggiFirewall
  /** Mostra un percorso in Esplora file; sostituibile per non aprire finestre nelle prove. */
  mostraInEsplora: (percorso: string, eCartella: boolean) => void
  /** Apre un indirizzo nel browser di sistema; sostituibile per non aprire finestre nelle prove. */
  apriNelBrowser: (indirizzo: string) => void
}

export interface Percorsi {
  archivio: string
  video: (slug: string) => string
  scheda: (slug: string) => string
  piano: (slug: string) => string
  risolto: (slug: string) => string
  controllo: (slug: string) => string
  storia: (slug: string) => string
  uscite: (slug: string) => string
  materiali: (slug: string) => string
  grezzo: (file: string) => string
  schedaGrezzo: (file: string) => string
  preparato: (file: string) => string
  lavori: string
  arrivi: string
  canali: string
}

export function creaPercorsi(archivio: string): Percorsi {
  const video = (slug: string): string => join(archivio, "video", slug)
  return {
    archivio,
    video,
    scheda: (slug) => join(video(slug), "scheda.json"),
    piano: (slug) => join(video(slug), "piano.json"),
    risolto: (slug) => join(video(slug), "lavoro", "risolto.json"),
    controllo: (slug) => join(video(slug), "lavoro", "controllo.json"),
    storia: (slug) => join(video(slug), "storia"),
    uscite: (slug) => join(video(slug), "uscite"),
    materiali: (slug) => join(video(slug), "materiali"),
    grezzo: (file) => join(archivio, "grezzo", file),
    schedaGrezzo: (file) => join(archivio, "grezzo", `${file}.scheda.json`),
    preparato: (file) => join(archivio, "preparati", file),
    lavori: join(archivio, "lavori.jsonl"),
    arrivi: join(archivio, "arrivi"),
    canali: join(archivio, "canali"),
  }
}

function portaDa(valore: string | undefined, predefinita: number): number {
  if (valore === undefined || valore === "") return predefinita
  const n = Number(valore)
  if (!Number.isInteger(n) || n < 0 || n > 65535) throw new Error(`«${valore}» non è una porta valida: usa un numero da 0 a 65535.`)
  return n
}

function mostraInEsplora(percorso: string, eCartella: boolean): void {
  Bun.spawn(eCartella ? ["explorer.exe", percorso] : ["explorer.exe", `/select,${percorso}`], { stdin: "ignore", stdout: "ignore", stderr: "ignore" })
}

/** `rundll32` e non `cmd /c start`: l'indirizzo ha «&», che `cmd` prenderebbe per un secondo comando. */
export function apriNelBrowser(indirizzo: string): void {
  Bun.spawn(["rundll32", "url.dll,FileProtocolHandler", indirizzo], { stdin: "ignore", stdout: "ignore", stderr: "ignore" })
}

/** L'unico punto del server che cerca la cartella di lavoro. */
export function cartellaDiLavoro(ambiente: Record<string, string | undefined>): string {
  const indicata = ambiente[VARIABILE_LAVORO]
  if (!indicata) throw new Error(`Manca la cartella di lavoro: indicala con la variabile ${VARIABILE_LAVORO} (l'app la sceglie al primo avvio e la passa da sola).`)
  if (!statSync(indicata, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`La cartella di lavoro «${indicata}» (${VARIABILE_LAVORO}) non c'è: crea la cartella o correggi la variabile.`)
  return resolve(indicata)
}

/** Come si codifica lo schermo registrato: la scheda del profilo (`macchina.scheda_registrazione`), la scheda NVIDIA che c'è se il profilo non dice, il processore con `null` o se nessuna scheda c'è. */
export function codificaRegistrazione(scheda: number | null | undefined, haSchedaNvidia: boolean): string[] {
  if (scheda === null || (scheda === undefined && !haSchedaNvidia)) return [...CODIFICA_SU_PROCESSORE, ...CODIFICA_COMUNE]
  const sceltaScheda = scheda === undefined ? [] : ["-gpu", String(scheda)]
  return [...CODIFICA_CON_SCHEDA, ...sceltaScheda, "-preset", "p5", "-rc", "constqp", "-qp", "20", ...CODIFICA_COMUNE]
}

function rilevaSchedaNvidia(): boolean {
  const programma = Bun.which("nvidia-smi")
  return programma !== null && Bun.spawnSync([programma, "-L"], { stdout: "pipe", stderr: "ignore" }).exitCode === 0
}

function schedaDelProfilo(profilo: Record<string, unknown>, campo: "scheda_registrazione" | "scheda_video"): number | null | undefined {
  const macchina = profilo["macchina"]
  const scheda = typeof macchina === "object" && macchina !== null ? (macchina as Record<string, unknown>)[campo] : undefined
  return typeof scheda === "number" || scheda === null ? scheda : undefined
}

const schedaDiRegistrazione = (profilo: Record<string, unknown>): number | null | undefined => schedaDelProfilo(profilo, "scheda_registrazione")

/** La scheda dei lavori del motore (`macchina.scheda_video`): `null` il processore, `undefined` quella che c'è. */
export const schedaVideoDi = (profilo: Record<string, unknown>): number | null | undefined => schedaDelProfilo(profilo, "scheda_video")

/** Le opzioni di una partenza vera: la cartella del codice, quella di lavoro, le variabili d'ambiente, i valori fissi. */
export function opzioniDaAmbiente(ambiente: Record<string, string | undefined> = process.env, haSchedaNvidia: boolean = rilevaSchedaNvidia()): Opzioni {
  const repo = resolve(dirname(dirname(import.meta.dir)))
  const lavoro = cartellaDiLavoro(ambiente)
  const cartellaAnimazioni = join(repo, "animazioni")
  const ffmpeg = Bun.which("ffmpeg")
  const ytdlp = Bun.which("yt-dlp")
  const datiDiMangoCode = ambiente["MANGO_DATA"] || join(ambiente["LOCALAPPDATA"] || join(homedir(), "AppData", "Local"), "MangoCode")
  return {
    codice: repo,
    lavoro,
    archivio: join(lavoro, "archivio"),
    stile: join(repo, "stile.json"),
    stileCreator: join(lavoro, "stile.json"),
    schemi: join(repo, "motore", "schemi"),
    porta: portaDa(ambiente["MANGO_ANIMATION_PORTA"], PORTA_DI_DEFAULT),
    indirizzo: "127.0.0.1",
    studio: join(repo, "studio", "dist"),
    font: join(repo, "font"),
    motore: { eseguibile: ambiente["MANGO_ANIMATION_PYTHON"] || "python", modulo: ambiente["MANGO_ANIMATION_MODULO"] || "motore", ambiente: {} },
    ffprobe: Bun.which("ffprobe"),
    ffmpeg,
    ytdlp: ytdlp === null ? null : [ytdlp],
    registrazione: {
      comando: ffmpeg === null ? null : [ffmpeg],
      // Lo schermo intero a 30 fotogrammi, portato in memoria.
      schermo: ["-f", "lavfi", "-i", "ddagrab=output_idx=0:framerate=30,hwdownload,format=bgra"],
      codifica: (profilo) => codificaRegistrazione(schedaDiRegistrazione(profilo), haSchedaNvidia),
      elenca: elencaConFfmpeg,
    },
    animazioni: { cartella: cartellaAnimazioni, comando: [process.execPath, "run", "--cwd", cartellaAnimazioni, "elenco"] },
    arrivi: { porta: portaDa(ambiente["MANGO_ANIMATION_PORTA_ARRIVI"], PORTA_ARRIVI_DI_DEFAULT), limiteByte: LIMITE_ARRIVI_BYTE, indirizzo: null },
    chat: {
      query: conIlClaudeDelCreator(query, ambiente["MANGO_ANIMATION_CLAUDE"]),
      sessioni: sessioniDiClaudeCode(lavoro, RIMBALZO_MS),
      mangoCode: new MangoCode({ dati: datiDiMangoCode, archivio: join(lavoro, "archivio"), adesso: () => new Date() }),
    },
    consumi: { cartella: cartellaDelleSessioni(lavoro, ambiente["CLAUDE_CONFIG_DIR"] || undefined), quietoMs: 2000 },
    schede: prestitoDaMangoCode(datiDiMangoCode),
    rimbalzoMs: RIMBALZO_MS,
    quietoUsciteMs: 1500,
    fermoMs: 3000,
    battitoMs: 20_000,
    leggiFirewall: leggiConPowerShell,
    mostraInEsplora,
    apriNelBrowser,
  }
}
