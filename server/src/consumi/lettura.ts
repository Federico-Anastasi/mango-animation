// Il lavoro di Claude letto dai file delle conversazioni (`docs/API.md`, «Consumi»): ogni file si legge a righe, una volta, e poi solo ciò
// che si aggiunge. Qui sta la regola; chi tiene i file e li osserva è `consumi.ts`.
import { eOggetto } from "../chat/traduzione"

export interface Token {
  /** `output_tokens`: ciò che Claude ha scritto. */
  scritti: number
  /** `cache_read_input_tokens`: il contesto già visto, riletto a ogni richiesta. */
  riletti: number
  /** `input_tokens` più `cache_creation_input_tokens`: il contesto nuovo. */
  nuovi: number
}

export interface Giro {
  /** Il messaggio che l'ha aperto; per un giro senza messaggio (un file che comincia a metà), la prima risposta. */
  inizio: number
  /** L'ultima risposta di Claude nel giro. */
  fine: number
  richieste: number
  /** Il video della riga di contesto del messaggio, se c'è. */
  contesto: string | null
  /** Quante chiamate di strumento hanno toccato ogni video. */
  tocchi: Map<string, number>
  token: Token
}

/** Il lavoro di Claude su un video com'è contato (tempo in millisecondi, istanti in millisecondi); `consumi.ts` lo rende come lo dà l'API. */
export interface ConsumoInMs {
  tempoMs: number
  giri: number
  token: Token
  dal: number
  al: number
}

export interface Riepilogo {
  video: Map<string, ConsumoInMs>
  senzaVideo: { tempoMs: number; giri: number; token: Token }
}

/** Quanto si guarda all'inizio e alla fine di una riga per sapere se è un messaggio. */
const BORDO = 2048
const SLUG = "[a-z0-9]+(?:-[a-z0-9]+)*"
const SEPARATORE = String.raw`(?:/|\\{1,2})`
// Un video si nomina per percorso dell'archivio o dell'API (anche con le barre di Windows, che nel JSON sono doppie) o come argomento di un comando del motore.
const PERCORSO = new RegExp(String.raw`(?:archivio|/api|/media|#)${SEPARATORE}video${SEPARATORE}(${SLUG})(?![A-Za-z0-9_.-])`, "g")
const COMANDO = new RegExp(String.raw`-m motore [a-z-]+ (${SLUG})(?![A-Za-z0-9_./\\-])`, "g")
const SLUG_INTERO = new RegExp(`^${SLUG}$`)
const CONTESTO = new RegExp(String.raw`^\[(?:Context|Contesto): [^\]]*?video «[^\]]*?» \((${SLUG})\)`)

const vuoti = (): Token => ({ scritti: 0, riletti: 0, nuovi: 0 })

const conteggio = (valore: unknown): number => (typeof valore === "number" && Number.isFinite(valore) ? valore : 0)
const testo = (valore: unknown): string | null => (typeof valore === "string" && valore !== "" ? valore : null)
const istante = (valore: unknown): number => (typeof valore === "string" ? Date.parse(valore) : Number.NaN)

function slugToccati(nome: string, ingressi: unknown[]): Set<string> {
  const trovati = new Set<string>()
  for (const ingresso of ingressi) {
    if (nome.startsWith("mcp__video__") && eOggetto(ingresso) && typeof ingresso["slug"] === "string" && SLUG_INTERO.test(ingresso["slug"])) trovati.add(ingresso["slug"])
    const scritto = JSON.stringify(ingresso) ?? ""
    for (const m of scritto.matchAll(PERCORSO)) trovati.add(m[1]!)
    for (const m of scritto.matchAll(COMANDO)) trovati.add(m[1]!)
  }
  return trovati
}

/** Il testo di un messaggio del creator, se lo è: `null` per l'esito di uno strumento. */
function testiDelMessaggio(riga: Record<string, unknown>): string[] | null {
  const messaggio = riga["message"]
  const contenuto = eOggetto(messaggio) ? messaggio["content"] : undefined
  if (typeof contenuto === "string") return [contenuto]
  if (!Array.isArray(contenuto)) return []
  if (contenuto.some((b) => eOggetto(b) && b["type"] === "tool_result")) return null
  return contenuto.flatMap((b) => (eOggetto(b) && typeof b["text"] === "string" ? [b["text"]] : []))
}

/** Il file di una conversazione (o di un suo sottoagente) letto fin dove è arrivato. */
export class FileDiConversazione {
  /** I byte già consegnati a `aggiungi`, fino all'ultimo a capo. */
  byteLetti = 0
  readonly giri: Giro[] = []
  /** Per ogni sottoagente lanciato da questo file, il giro che l'ha lanciato. */
  readonly agenti = new Map<string, number>()
  /** Solo per un sottoagente: la conversazione che l'ha lanciato e l'id della chiamata che l'ha lanciato. */
  sessione = ""
  idStrumento: string | null = null
  private readonly richieste = new Map<string, Token>()

  constructor(readonly eAgente: boolean) {}

  /** `reclama` dice se la richiesta è di questo file: una conversazione ripresa o biforcata ne ripete alcune, e si contano dove sono nate. */
  aggiungi(riga: string, reclama: (richiesta: string) => boolean): void {
    // Solo le righe di un messaggio, qualunque sia l'ordine delle chiavi: `type` sta prima o dopo il messaggio, che è la parte lunga.
    const bordi = riga.length > 2 * BORDO ? riga.slice(0, BORDO) + riga.slice(-BORDO) : riga
    if (!bordi.includes('"type":"assistant"') && !bordi.includes('"type":"user"')) return
    const cima = riga.slice(0, 1500)
    if (cima.includes('"content":[{"tool_use_id"') || cima.includes('"content":[{"type":"tool_result"')) return
    let letta: unknown
    try {
      letta = JSON.parse(riga)
    } catch {
      return
    }
    if (!eOggetto(letta)) return
    if (letta["type"] === "assistant") this.risposta(letta, reclama)
    else if (letta["type"] === "user") this.messaggio(letta)
  }

  private messaggio(riga: Record<string, unknown>): void {
    if (this.eAgente || riga["isMeta"] === true || riga["isSidechain"] === true) return
    const inizio = istante(riga["timestamp"])
    const testi = testiDelMessaggio(riga)
    if (Number.isNaN(inizio) || testi === null) return
    const contesto = testi.map((t) => CONTESTO.exec(t)?.[1]).find((s) => s !== undefined) ?? null
    this.giri.push({ inizio, fine: inizio, richieste: 0, contesto, tocchi: new Map(), token: vuoti() })
  }

  private risposta(riga: Record<string, unknown>, reclama: (richiesta: string) => boolean): void {
    const messaggio = riga["message"]
    if (!eOggetto(messaggio)) return
    const chiave = testo(messaggio["id"]) ?? testo(riga["requestId"]) ?? testo(riga["uuid"])
    const quando = istante(riga["timestamp"])
    if (chiave === null || Number.isNaN(quando) || !reclama(chiave)) return
    const giro = this.giri.at(-1) ?? this.apri(quando)
    if (quando > giro.fine) giro.fine = quando

    const uso = eOggetto(messaggio["usage"]) ? messaggio["usage"] : {}
    const ora: Token = { scritti: conteggio(uso["output_tokens"]), riletti: conteggio(uso["cache_read_input_tokens"]), nuovi: conteggio(uso["input_tokens"]) + conteggio(uso["cache_creation_input_tokens"]) }
    const prima = this.richieste.get(chiave)
    if (prima === undefined) giro.richieste++
    const meglio: Token = { scritti: Math.max(prima?.scritti ?? 0, ora.scritti), riletti: Math.max(prima?.riletti ?? 0, ora.riletti), nuovi: Math.max(prima?.nuovi ?? 0, ora.nuovi) }
    giro.token.scritti += meglio.scritti - (prima?.scritti ?? 0)
    giro.token.riletti += meglio.riletti - (prima?.riletti ?? 0)
    giro.token.nuovi += meglio.nuovi - (prima?.nuovi ?? 0)
    this.richieste.set(chiave, meglio)

    const contenuto = Array.isArray(messaggio["content"]) ? messaggio["content"] : []
    const scritti = eOggetto(riga["wireToolInputs"]) ? riga["wireToolInputs"] : {}
    for (const blocco of contenuto) {
      if (!eOggetto(blocco) || blocco["type"] !== "tool_use") continue
      const nome = testo(blocco["name"]) ?? ""
      const idStrumento = testo(blocco["id"])
      if ((nome === "Agent" || nome === "Task") && idStrumento !== null) this.agenti.set(idStrumento, this.giri.length - 1)
      for (const slug of slugToccati(nome, [blocco["input"], idStrumento === null ? undefined : scritti[idStrumento]])) giro.tocchi.set(slug, (giro.tocchi.get(slug) ?? 0) + 1)
    }
  }

  private apri(inizio: number): Giro {
    const giro: Giro = { inizio, fine: inizio, richieste: 0, contesto: null, tocchi: new Map(), token: vuoti() }
    this.giri.push(giro)
    return giro
  }

  /** Le richieste che questo file ha contato: chi lo scarta le restituisce. */
  richiesteContate(): string[] {
    return [...this.richieste.keys()]
  }
}

/**
 * Il video di un giro: quello che le chiamate di strumento hanno toccato di più; a parità, quello del contesto se è fra loro;
 * se nessuno strumento ha toccato un video, quello del contesto; se non c'è nemmeno quello, nessuno.
 */
export function videoDelGiro(contesto: string | null, tocchi: ReadonlyMap<string, number>): string | null {
  let scelto: string | null = null
  let massimo = 0
  for (const [slug, volte] of tocchi) {
    if (volte > massimo || (volte === massimo && slug === contesto)) {
      scelto = slug
      massimo = volte
    }
  }
  return scelto ?? contesto
}

interface Unita {
  contesto: string | null
  tocchi: Map<string, number>
  token: Token
  tempoMs: number
  giri: number
  inizio: number
  fine: number
}

const somma = (a: Token, b: Token): void => {
  a.scritti += b.scritti
  a.riletti += b.riletti
  a.nuovi += b.nuovi
}

/**
 * Somma i giri per video. Un sottoagente aggiunge i suoi token e i video che ha toccato al giro che l'ha lanciato, e nessun tempo (gira dentro
 * quel giro); se il giro non si trova conta da solo, per i video che tocca. Il tempo di un giro è dal messaggio del creator all'ultima risposta,
 * compresa l'attesa degli strumenti: un giro senza risposta non conta.
 */
export function riepiloga(principali: ReadonlyMap<string, FileDiConversazione>, agenti: Iterable<FileDiConversazione>): Riepilogo {
  const daGiro = (giro: Giro): Unita => ({
    contesto: giro.contesto,
    tocchi: new Map(giro.tocchi),
    token: { ...giro.token },
    tempoMs: giro.richieste > 0 ? giro.fine - giro.inizio : 0,
    giri: giro.richieste > 0 ? 1 : 0,
    inizio: giro.inizio,
    fine: giro.fine,
  })
  const unita = new Map<Giro, Unita>()
  for (const file of principali.values()) file.giri.forEach((giro) => unita.set(giro, daGiro(giro)))
  const soli: Unita[] = []
  for (const agente of agenti) {
    const sede = agente.idStrumento === null ? undefined : principali.get(agente.sessione)
    const posto = agente.idStrumento === null ? undefined : sede?.agenti.get(agente.idStrumento)
    const padre = posto === undefined ? undefined : unita.get(sede!.giri[posto]!)
    for (const giro of agente.giri) {
      if (padre === undefined) {
        soli.push({ ...daGiro(giro), tempoMs: 0, giri: 0 })
        continue
      }
      giro.tocchi.forEach((volte, slug) => padre.tocchi.set(slug, (padre.tocchi.get(slug) ?? 0) + volte))
      somma(padre.token, giro.token)
    }
  }

  const riepilogo: Riepilogo = { video: new Map(), senzaVideo: { tempoMs: 0, giri: 0, token: vuoti() } }
  for (const u of [...unita.values(), ...soli]) {
    if (u.giri === 0 && u.token.scritti + u.token.riletti + u.token.nuovi === 0) continue
    const slug = videoDelGiro(u.contesto, u.tocchi)
    if (slug === null) {
      riepilogo.senzaVideo.tempoMs += u.tempoMs
      riepilogo.senzaVideo.giri += u.giri
      somma(riepilogo.senzaVideo.token, u.token)
      continue
    }
    const voce = riepilogo.video.get(slug) ?? { tempoMs: 0, giri: 0, token: vuoti(), dal: u.inizio, al: u.fine }
    voce.tempoMs += u.tempoMs
    voce.giri += u.giri
    somma(voce.token, u.token)
    voce.dal = Math.min(voce.dal, u.inizio)
    voce.al = Math.max(voce.al, u.fine)
    riepilogo.video.set(slug, voce)
  }
  return riepilogo
}
