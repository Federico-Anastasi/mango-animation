// La coda dei lavori del motore: uno alla volta, perché il motore usa la scheda video. Un lavoro è
// `python -m motore <comando> …` lanciato dalla cartella del codice; si ferma per PID, mai per nome.
// Quanto durerà si stima dai lavori uguali già riusciti, per secondo di video da lavorare.
import { randomUUID } from "node:crypto"
import type { Opzioni, Percorsi } from "./configurazione"
import { aggiungiRiga, jsonDaTesto, leggiTesto, scrivi } from "./disco"
import type { Eventi } from "./eventi"
import { ErroreConFrase, frase, linguaDellaRichiesta, nellaLinguaDi, type Lingua } from "./lingua"
import { COMANDI_SULLA_SCHEDA } from "./schede"

/** Ciò che un lavoro che non è un comando del motore può fare mentre gira. */
export interface IoLavoro {
  /** Lancia un processo: le sue righe vanno nel lavoro e il suo PID è quello che «ferma» chiude. Un lavoro già fermato non lancia più niente. Con `uscita`, le righe di stdout si raccolgono anche lì, tutte (le righe del lavoro sono le ultime 200). */
  lancia: (comando: string[], uscita?: string[]) => Promise<{ codice: number; ultimoErrore: string | null }>
  riga: (riga: string) => void
  fermato: () => boolean
  /** La lingua di chi ha chiesto il lavoro: le righe che scrive il lavoro sono in questa. */
  lingua: Lingua
}

export interface RichiestaLavoro {
  comando: string
  argomenti: string[]
  slug: string | null
  file: string | null
  /** Per un lavoro che non lancia `python -m motore`: cosa fa. Se fallisce lancia un errore la cui frase è quella che il lavoro mostra; ciò che torna è il `risultato` del lavoro finito. */
  esegui?: (io: IoLavoro) => Promise<unknown>
}

interface Lavoro extends RichiestaLavoro {
  id: string
  /** La lingua di chi l'ha chiesto: le frasi del lavoro (e dei suoi errori) sono in quella; un lavoro che parte da solo è in italiano. */
  lingua: Lingua
  chiave: string
  accodato: number
  iniziato: number | null
  righe: string[]
  pid: number | null
  fermato: boolean
  fine: Promise<void>
  /** Fissati quando parte. */
  secondiVideo: number | null
  stima: number | null
}

export interface LavoroFinito {
  id: string
  slug: string | null
  comando: string
  file: string | null
  iniziato: string
  finito: string
  esito: "riuscito" | "fallito" | "fermato" | "interrotto"
  errore: string | null
  righe: string[]
  /** I secondi di video su cui ha lavorato; `null` se non si sapevano (e nelle righe scritte prima che ci fossero). */
  secondi_video: number | null
  /** Ciò che il lavoro ha prodotto per chi l'aspettava, se è un lavoro che lo dà (`scene-foto`). */
  risultato?: unknown
}

/** La riga di `lavori.jsonl` scritta quando un lavoro parte: se al riavvio non ha la sua fine, il server si è fermato a metà. */
interface LavoroPartito {
  id: string
  slug: string | null
  comando: string
  file: string | null
  iniziato: string
  lingua: Lingua
  esito: "in corso"
}

const INTERROTTO = frase(
  "Il server si è fermato mentre il lavoro girava: il lavoro non è finito. Rilancialo.",
  "The server stopped while the job was running: the job did not finish. Start it again.",
)

const RIGHE_TENUTE = 200
const RIGHE_DEI_FINITI = 30
const FINITI_TENUTI = 20
const RIGHE_MASSIME_NEL_FILE = 100
/** I lavori riusciti tenuti per comando, da cui viene la stima, e quanti ne servono almeno. */
const STORIA_PER_COMANDO = 10
const MINIMO_PER_STIMARE = 3

const iso = (ms: number): string => new Date(ms).toISOString()

const mediana = (valori: number[]): number => {
  const ordinati = [...valori].sort((a, b) => a - b)
  const mezzo = Math.floor(ordinati.length / 2)
  return ordinati.length % 2 === 1 ? ordinati[mezzo]! : (ordinati[mezzo - 1]! + ordinati[mezzo]!) / 2
}

/** La frase di un errore nella lingua del lavoro: quella che ha, se è nelle due lingue, altrimenti il suo testo. */
const fraseDi = (causa: unknown, lingua: Lingua): string => (causa instanceof ErroreConFrase ? nellaLinguaDi(causa.testo, lingua) : causa instanceof Error ? causa.message : String(causa))

const durataIn = (f: LavoroFinito): number => (Date.parse(f.finito) - Date.parse(f.iniziato)) / 1000

async function leggiRighe(flusso: ReadableStream<Uint8Array>, perRiga: (riga: string) => void, dopoPezzo: () => void): Promise<void> {
  const decodifica = new TextDecoder()
  let resto = ""
  for await (const pezzo of flusso) {
    const righe = (resto + decodifica.decode(pezzo, { stream: true })).split(/\r\n|\n|\r/)
    resto = righe.pop() ?? ""
    righe.filter((r) => r.length > 0).forEach(perRiga)
    dopoPezzo()
  }
  resto += decodifica.decode()
  if (resto.length > 0) perRiga(resto)
}

export class Coda {
  private inCoda: Lavoro[] = []
  private inCorso: Lavoro | null = null
  private finiti: LavoroFinito[] = []
  /** Gli ultimi riusciti di ogni comando, anche quelli usciti da `finiti`. */
  private riusciti = new Map<string, LavoroFinito[]>()
  private righeNelFile = 0
  private chiuso = false
  /** L'ultima lingua che lo studio ha dichiarato: la parlano i lavori che partono da soli, fuori da ogni richiesta. */
  linguaDelloStudio: Lingua = "it"

  constructor(
    private readonly opzioni: Opzioni,
    private readonly percorsi: Percorsi,
    private readonly eventi: Eventi,
    /** Aggiorna l'indice per ciò che il lavoro può aver scritto: la fine si annuncia solo dopo, su un indice al passo. */
    private readonly dopoIlLavoro: (lavoro: RichiestaLavoro) => Promise<void>,
    /** I secondi di video che il lavoro ha da lavorare, dall'indice in memoria; `null` se non si sanno. */
    private readonly secondiDi: (lavoro: RichiestaLavoro) => number | null,
    /** La scheda del profilo (`macchina.scheda_video`): `null` il processore, `undefined` quella che c'è. */
    private readonly schedaDelProfilo: () => number | null | undefined,
  ) {}

  /** Se il modello di Mango Code tiene la scheda, la libera; un lavoro che non può averla fallisce con la frase che dice perché. */
  private async prendiLaScheda(lingua: Lingua, tieni: (riga: string) => void): Promise<Pick<LavoroFinito, "esito" | "errore" | "risultato"> | null> {
    try {
      const avviso = await this.opzioni.schede.prendi(this.schedaDelProfilo())
      if (avviso) tieni(avviso.in(lingua))
      return null
    } catch (causa) {
      return { esito: "fallito", errore: fraseDi(causa, lingua) }
    }
  }

  /** Finiti i lavori sulla scheda, il modello di Mango Code la riprende; la coda intanto va avanti. */
  private rendiLaScheda(): void {
    if (this.inCoda.some((l) => COMANDI_SULLA_SCHEDA.has(l.comando))) return
    this.opzioni.schede
      .rendi()
      .then((riga) => riga && console.log(`coda: ${riga}`))
      .catch((causa) => console.error(`coda: il modello di Mango Code non si riaccende: ${causa instanceof Error ? causa.message : String(causa)}`))
  }

  async carica(): Promise<void> {
    const righe = ((await leggiTesto(this.percorsi.lavori)) ?? "").split("\n").filter((r) => r.length > 0)
    this.righeNelFile = righe.length
    const partiti = new Map<string, LavoroPartito>()
    const letti: LavoroFinito[] = []
    for (const riga of righe) {
      const letto = jsonDaTesto(riga)?.valore
      if (typeof letto !== "object" || letto === null) continue
      if ("esito" in letto && letto.esito === "in corso") partiti.set((letto as LavoroPartito).id, letto as LavoroPartito)
      else {
        const finito = { secondi_video: null, ...letto } as LavoroFinito
        partiti.delete(finito.id)
        letti.push(finito)
      }
    }
    const interrotti = [...partiti.values()].map((p): LavoroFinito => ({ id: p.id, slug: p.slug, comando: p.comando, file: p.file, iniziato: p.iniziato, finito: iso(Date.now()), esito: "interrotto", errore: nellaLinguaDi(INTERROTTO, p.lingua), righe: [], secondi_video: null }))
    letti.push(...interrotti)
    // Prima le raccolte, poi la scrittura: la compattazione del file riparte da loro.
    this.finiti = letti.slice(-FINITI_TENUTI)
    letti.forEach((f) => this.tieniSeRiuscito(f))
    for (const interrotto of interrotti) await this.ricorda(interrotto)
  }

  /**
   * In secondi: la mediana dei lavori uguali riusciti, per secondo di video se si sanno i secondi di questo, altrimenti la
   * mediana delle durate di quelli che non li sapevano. Con meno di `MINIMO_PER_STIMARE` lavori così, `null`: non si inventa.
   */
  private stimaDi(comando: string, secondiVideo: number | null): number | null {
    if (secondiVideo === 0) return null
    const uguali = (this.riusciti.get(comando) ?? []).filter((f) => (secondiVideo === null ? f.secondi_video === null : (f.secondi_video ?? 0) > 0))
    if (uguali.length < MINIMO_PER_STIMARE) return null
    if (secondiVideo === null) return Math.round(mediana(uguali.map(durataIn)))
    return Math.round(mediana(uguali.map((f) => durataIn(f) / f.secondi_video!)) * secondiVideo)
  }

  private tieniSeRiuscito(finito: LavoroFinito): void {
    if (finito.esito !== "riuscito") return
    this.riusciti.set(finito.comando, [...(this.riusciti.get(finito.comando) ?? []), finito].slice(-STORIA_PER_COMANDO))
  }

  /** Mette in coda e dà l'id; un lavoro uguale già in attesa si fonde con questo e dà il suo. `risolvi` passa avanti agli altri. */
  accoda(richiesta: RichiestaLavoro): string {
    const chiave = [richiesta.comando, ...richiesta.argomenti].join("\u0000")
    const uguale = this.inCoda.find((l) => l.chiave === chiave)
    if (uguale) return uguale.id

    const lavoro: Lavoro = { ...richiesta, id: randomUUID().slice(0, 8), lingua: linguaDellaRichiesta() ?? this.linguaDelloStudio, chiave, accodato: Date.now(), iniziato: null, righe: [], pid: null, fermato: false, fine: Promise.resolve(), secondiVideo: null, stima: null }
    if (richiesta.comando === "risolvi") this.inCoda.splice(this.inCoda.findLastIndex((l) => l.comando === "risolvi") + 1, 0, lavoro)
    else this.inCoda.push(lavoro)
    this.eventi.emetti({ tipo: "lavori" })
    this.avanti()
    return lavoro.id
  }

  /** Toglie dalla coda o ferma quello in corso; `null` se l'id non c'è. */
  async ferma(id: string): Promise<"tolto" | "fermato" | null> {
    const postoInCoda = this.inCoda.findIndex((l) => l.id === id)
    if (postoInCoda >= 0) {
      this.inCoda.splice(postoInCoda, 1)
      this.eventi.emetti({ tipo: "lavori" })
      return "tolto"
    }
    if (this.inCorso?.id !== id) return null
    await this.fermaQuelloInCorso()
    return "fermato"
  }

  togliDi(slug: string): void {
    this.inCoda = this.inCoda.filter((l) => l.slug !== slug)
    this.eventi.emetti({ tipo: "lavori" })
  }

  lavoroDi(slug: string): { id: string; comando: string; stato: "in corso" | "in coda" } | null {
    if (this.inCorso?.slug === slug) return { id: this.inCorso.id, comando: this.inCorso.comando, stato: "in corso" }
    const atteso = this.inCoda.find((l) => l.slug === slug)
    return atteso ? { id: atteso.id, comando: atteso.comando, stato: "in coda" } : null
  }

  /** Quando è partito il montaggio in corso di questo video, o `null` se non ce n'è uno. */
  montaggioIniziato(slug: string): number | null {
    return this.inCorso?.comando === "monta" && this.inCorso.slug === slug ? this.inCorso.iniziato : null
  }

  stato(): object {
    const descrizione = (l: Lavoro): object => ({ id: l.id, slug: l.slug, comando: l.comando, file: l.file })
    const inCorso = (l: Lavoro): object => {
      const iniziato = l.iniziato ?? l.accodato
      return {
        ...descrizione(l),
        iniziato: iso(iniziato),
        righe: l.righe,
        secondi_video: l.secondiVideo,
        stima: l.stima,
        trascorsi: Math.round((Date.now() - iniziato) / 1000),
        fine_prevista: l.stima === null ? null : iso(iniziato + l.stima * 1000),
      }
    }
    // Uno in attesa si stima con ciò che si sa adesso; partendo si rifà, perché un risolvi davanti può cambiare la durata del video.
    const inAttesa = (l: Lavoro): object => {
      const secondiVideo = this.secondiDi(l)
      return { ...descrizione(l), accodato: iso(l.accodato), secondi_video: secondiVideo, stima: this.stimaDi(l.comando, secondiVideo) }
    }
    return {
      in_corso: this.inCorso ? inCorso(this.inCorso) : null,
      in_coda: this.inCoda.map(inAttesa),
      finiti: [...this.finiti].reverse(),
    }
  }

  async chiudi(): Promise<void> {
    this.chiuso = true
    this.inCoda = []
    await this.fermaQuelloInCorso()
    // Il server che si chiude non lascia spento il modello di Mango Code a cui ha preso le schede.
    await this.opzioni.schede.rendi().catch((causa) => console.error(`coda: il modello di Mango Code non si riaccende: ${causa instanceof Error ? causa.message : String(causa)}`))
  }

  private async fermaQuelloInCorso(): Promise<void> {
    const lavoro = this.inCorso
    if (!lavoro) return
    lavoro.fermato = true
    if (lavoro.pid) await Bun.spawn(["taskkill", "/PID", String(lavoro.pid), "/T", "/F"], { stdin: "ignore", stdout: "ignore", stderr: "ignore" }).exited
    await lavoro.fine
  }

  /** Fa il lavoro e dice com'è finito. */
  private async corpo(lavoro: Lavoro, tieni: (riga: string) => void): Promise<Pick<LavoroFinito, "esito" | "errore" | "risultato">> {
    const annuncia = (): void => this.eventi.emetti({ tipo: "lavori" })
    const lancia: IoLavoro["lancia"] = async (comando, uscita) => {
      if (lavoro.fermato) throw new ErroreConFrase(frase("Lavoro fermato.", "The job was stopped."))
      const { ambiente } = this.opzioni.motore
      let processo: Bun.Subprocess<"ignore", "pipe", "pipe">
      try {
        processo = Bun.spawn(comando, {
          cwd: this.opzioni.codice,
          env: { ...process.env, ...ambiente, MANGO_ANIMATION_LAVORO: this.opzioni.lavoro, MANGO_ANIMATION_LINGUA: lavoro.lingua, PYTHONUNBUFFERED: "1", PYTHONUTF8: "1" },
          stdin: "ignore",
          stdout: "pipe",
          stderr: "pipe",
        })
      } catch (causa) {
        const motivo = causa instanceof Error ? causa.message : String(causa)
        throw new ErroreConFrase(
          frase(`Non riesco ad avviare «${comando[0]}»: controlla che sia installato e nel PATH (${motivo}).`, `I cannot start «${comando[0]}»: check that it is installed and on the PATH (${motivo}).`),
        )
      }
      lavoro.pid = processo.pid
      const ultimoErrore: { riga: string | null } = { riga: null }
      try {
        const [codice] = await Promise.all([
          processo.exited,
          leggiRighe(
            processo.stdout,
            (riga) => {
              tieni(riga)
              uscita?.push(riga)
            },
            annuncia,
          ),
          leggiRighe(
            processo.stderr,
            (riga) => {
              tieni(riga)
              ultimoErrore.riga = riga
            },
            annuncia,
          ),
        ])
        return { codice, ultimoErrore: ultimoErrore.riga }
      } finally {
        lavoro.pid = null
      }
    }

    try {
      if (lavoro.esegui) {
        const risultato = await lavoro.esegui({ lancia, riga: tieni, fermato: () => lavoro.fermato, lingua: lavoro.lingua })
        return lavoro.fermato ? { esito: "fermato", errore: null } : { esito: "riuscito", errore: null, ...(risultato === undefined ? {} : { risultato }) }
      }
      const { eseguibile, modulo } = this.opzioni.motore
      const { codice, ultimoErrore } = await lancia([eseguibile, "-m", modulo, lavoro.comando, ...lavoro.argomenti])
      if (lavoro.fermato) return { esito: "fermato", errore: null }
      if (codice === 0) return { esito: "riuscito", errore: null }
      if (ultimoErrore !== null) return { esito: "fallito", errore: ultimoErrore }
      tieni(nellaLinguaDi(frase(`Uscito con codice ${codice}.`, `Exited with code ${codice}.`), lavoro.lingua))
      return { esito: "fallito", errore: nellaLinguaDi(frase("Il lavoro si è fermato senza spiegare perché: guarda le ultime righe.", "The job stopped without saying why: look at the last lines."), lavoro.lingua) }
    } catch (causa) {
      if (lavoro.fermato) return { esito: "fermato", errore: null }
      return { esito: "fallito", errore: fraseDi(causa, lavoro.lingua) }
    }
  }

  private avanti(): void {
    if (this.chiuso || this.inCorso) return
    const prossimo = this.inCoda.shift()
    if (!prossimo) return
    this.inCorso = prossimo
    prossimo.fine = this.esegui(prossimo)
  }

  private async esegui(lavoro: Lavoro): Promise<void> {
    lavoro.iniziato = Date.now()
    lavoro.secondiVideo = this.secondiDi(lavoro)
    lavoro.stima = this.stimaDi(lavoro.comando, lavoro.secondiVideo)
    this.eventi.emetti({ tipo: "lavori" })
    const tieni = (riga: string): void => {
      lavoro.righe.push(riga)
      if (lavoro.righe.length > RIGHE_TENUTE) lavoro.righe.shift()
    }
    const sullaScheda = COMANDI_SULLA_SCHEDA.has(lavoro.comando)
    await this.segnaPartito(lavoro)
    const { esito: finePerChiHaFermato, errore, risultato } = (sullaScheda ? await this.prendiLaScheda(lavoro.lingua, tieni) : null) ?? (await this.corpo(lavoro, tieni))

    const esito = this.chiuso && finePerChiHaFermato === "fermato" ? "interrotto" : finePerChiHaFermato
    const finito: LavoroFinito = {
      id: lavoro.id,
      slug: lavoro.slug,
      comando: lavoro.comando,
      file: lavoro.file,
      iniziato: iso(lavoro.iniziato),
      finito: iso(Date.now()),
      esito,
      errore: esito === "interrotto" ? nellaLinguaDi(INTERROTTO, lavoro.lingua) : errore,
      righe: lavoro.righe.slice(-RIGHE_DEI_FINITI),
      secondi_video: lavoro.secondiVideo,
      ...(risultato === undefined ? {} : { risultato }),
    }
    try {
      await this.dopoIlLavoro(lavoro)
    } catch (causa) {
      console.error(`coda: non riesco ad aggiornare l'indice dopo «${lavoro.comando}»: ${causa instanceof Error ? (causa.stack ?? causa.message) : String(causa)}`)
    }
    this.finiti = [...this.finiti, finito].slice(-FINITI_TENUTI)
    this.tieniSeRiuscito(finito)
    this.inCorso = null
    if (sullaScheda) this.rendiLaScheda()
    await this.ricorda(finito)
    this.eventi.emetti({ tipo: "lavori" })
    this.avanti()
  }

  /** Senza questa riga un lavoro ucciso col server sparirebbe: né in coda né fra i finiti. */
  private async segnaPartito(lavoro: Lavoro): Promise<void> {
    const partito: LavoroPartito = { id: lavoro.id, slug: lavoro.slug, comando: lavoro.comando, file: lavoro.file, iniziato: iso(lavoro.iniziato ?? Date.now()), lingua: lavoro.lingua, esito: "in corso" }
    try {
      await aggiungiRiga(this.percorsi.lavori, JSON.stringify(partito))
      this.righeNelFile++
    } catch (errore) {
      console.error(`coda: non riesco a scrivere ${this.percorsi.lavori}: ${errore instanceof Error ? errore.message : String(errore)}`)
    }
  }

  private async ricorda(finito: LavoroFinito): Promise<void> {
    try {
      await aggiungiRiga(this.percorsi.lavori, JSON.stringify(finito))
      this.righeNelFile++
      if (this.righeNelFile <= RIGHE_MASSIME_NEL_FILE) return
      // Restano gli ultimi finiti e i riusciti da cui viene la stima, in ordine di fine.
      const tenuti = [...new Set([...this.finiti, ...[...this.riusciti.values()].flat()])].sort((a, b) => a.finito.localeCompare(b.finito))
      await scrivi(this.percorsi.lavori, `${tenuti.map((f) => JSON.stringify(f)).join("\n")}\n`)
      this.righeNelFile = tenuti.length
    } catch (errore) {
      console.error(`coda: non riesco a scrivere ${this.percorsi.lavori}: ${errore instanceof Error ? errore.message : String(errore)}`)
    }
  }
}
