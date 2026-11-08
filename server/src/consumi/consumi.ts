// Il consumo di Claude per video (`docs/API.md`, «Consumi»). Un solo proprietario in memoria: legge una volta tutti i file delle conversazioni
// della cartella di lavoro e poi, quando l'osservatore dice che uno è cambiato, solo ciò che vi si è aggiunto.
import { mkdir, readdir } from "node:fs/promises"
import { join, sep } from "node:path"
import { leggiTesto, statistica } from "../disco"
import { osserva } from "../osservatore"
import { eOggetto } from "../chat/traduzione"
import { FileDiConversazione, riepiloga, type Riepilogo, type Token } from "./lettura"

const BLOCCO_BYTE = 16 * 1024 ** 2

export interface ConsumoDiVideo {
  /** Secondi di lavoro di Claude (`docs/API.md`, «Consumi»). */
  tempo: number
  giri: number
  token: Token
  dal: string
  al: string
}

export interface VistaConsumi {
  /** Falso finché non sono stati letti tutti i file la prima volta: i conti di allora sono parziali. */
  pronto: boolean
  video: Record<string, ConsumoDiVideo>
  senza_video: { tempo: number; giri: number; token: Token }
}

export interface OpzioniConsumi {
  /** Quanto devono restare fermi i file delle conversazioni prima che si rileggano: Claude li scrive di continuo mentre lavora. */
  quietoMs: number
}

const secondi = (ms: number): number => Math.round(ms / 1000)

function vistaDi(riepilogo: Riepilogo, pronto: boolean): VistaConsumi {
  const video: Record<string, ConsumoDiVideo> = {}
  for (const [slug, v] of [...riepilogo.video].sort(([a], [b]) => a.localeCompare(b))) {
    video[slug] = { tempo: secondi(v.tempoMs), giri: v.giri, token: v.token, dal: new Date(v.dal).toISOString(), al: new Date(v.al).toISOString() }
  }
  return { pronto, video, senza_video: { tempo: secondi(riepilogo.senzaVideo.tempoMs), giri: riepilogo.senzaVideo.giri, token: riepilogo.senzaVideo.token } }
}

/** Legge le righe complete di `percorso` da `da` a `fino`, a blocchi, e dice fin dove è arrivato: una riga a metà aspetta il resto. */
async function leggiRighe(percorso: string, da: number, fino: number, perRiga: (riga: string) => void): Promise<number> {
  let posizione = da
  let blocco = BLOCCO_BYTE
  while (posizione < fino) {
    const fetta = Buffer.from(await Bun.file(percorso).slice(posizione, Math.min(fino, posizione + blocco)).arrayBuffer())
    const ultimo = fetta.lastIndexOf(10)
    if (ultimo < 0) {
      if (posizione + fetta.length >= fino) break
      blocco *= 2
      continue
    }
    for (const riga of fetta.toString("utf8", 0, ultimo).split("\n")) if (riga !== "") perRiga(riga)
    posizione += ultimo + 1
    blocco = BLOCCO_BYTE
  }
  return posizione
}

export class Consumi {
  private readonly file = new Map<string, FileDiConversazione>()
  /** Per ogni richiesta, il file che l'ha contata. */
  private readonly proprietari = new Map<string, string>()
  private coda: Promise<void> = Promise.resolve()
  private osservatore: { chiudi: () => void } | null = null
  private pronto = false
  private chiuso = false
  private riepilogo: Riepilogo = { video: new Map(), senzaVideo: { tempoMs: 0, giri: 0, token: { scritti: 0, riletti: 0, nuovi: 0 } } }
  private ultima = ""

  /** `cambiato` avvisa quando i conti sono diversi da come erano (e la prima volta che sono pronti). */
  constructor(
    private readonly cartella: string,
    private readonly opzioni: OpzioniConsumi,
    private readonly cambiato: () => void,
  ) {}

  /** Comincia a osservare la cartella e legge i file in sfondo: i conti sono `pronto: false` finché non ha finito. */
  async avvia(): Promise<void> {
    // Su un computer nuovo la cartella la crea Claude Code alla prima conversazione, magari dopo l'avvio: la si crea qui per osservarla.
    if (!(await statistica(this.cartella))?.isDirectory()) {
      try {
        await mkdir(this.cartella, { recursive: true })
      } catch (errore) {
        console.error(`consumi di Claude: non riesco a creare ${this.cartella}, i conti restano vuoti: ${errore instanceof Error ? errore.message : String(errore)}`)
        this.pronto = true
        this.ricalcola()
        return
      }
    }
    this.osservatore = osserva(this.cartella, {
      ricorsivo: true,
      rimbalzoMs: this.opzioni.quietoMs,
      lenti: { quietoMs: this.opzioni.quietoMs, riconosci: () => true },
      ignora: (relativo) => !relativo.endsWith(".jsonl") && !relativo.endsWith(".meta.json"),
      alCambio: async (relativi) => {
        relativi.forEach((r) => this.accoda(() => this.aggiorna(join(this.cartella, r))))
        this.accoda(async () => this.ricalcola())
      },
    })
    this.accoda(async () => {
      // Dal più vecchio: una richiesta ripetuta in una conversazione biforcata si conta nel file dov'è nata.
      const percorsi = (await readdir(this.cartella, { recursive: true })).filter((r) => r.endsWith(".jsonl") || r.endsWith(".meta.json")).map((r) => join(this.cartella, r))
      const conData = await Promise.all(percorsi.map(async (p) => ({ p, ms: (await statistica(p))?.mtimeMs ?? 0 })))
      for (const { p } of conData.sort((a, b) => a.ms - b.ms)) {
        if (this.chiuso) return
        await this.aggiorna(p)
      }
      this.pronto = true
      this.ricalcola()
    })
  }

  vista(): VistaConsumi {
    return vistaDi(this.riepilogo, this.pronto)
  }

  async chiudi(): Promise<void> {
    this.chiuso = true
    this.osservatore?.chiudi()
    await this.coda
  }

  private accoda(lavoro: () => Promise<void>): void {
    this.coda = this.coda.then(lavoro).catch((errore) => console.error(`consumi di Claude: ${errore instanceof Error ? (errore.stack ?? errore.message) : String(errore)}`))
  }

  private ricalcola(): void {
    const principali = new Map<string, FileDiConversazione>()
    const agenti: FileDiConversazione[] = []
    for (const [percorso, f] of this.file) {
      if (f.eAgente) agenti.push(f)
      else principali.set(this.doveSta(percorso).sessione, f)
    }
    this.riepilogo = riepiloga(principali, agenti)
    const scritta = JSON.stringify(vistaDi(this.riepilogo, this.pronto))
    if (scritta === this.ultima) return
    this.ultima = scritta
    this.cambiato()
  }

  /** Una conversazione sta in un file della cartella; un suo sottoagente in una cartella col suo id. */
  private doveSta(percorso: string): { sessione: string; eAgente: boolean } {
    const parti = percorso.slice(this.cartella.length + 1).split(sep)
    const primo = parti[0] ?? ""
    return parti.length === 1 ? { sessione: primo.replace(/\.jsonl$/, ""), eAgente: false } : { sessione: primo, eAgente: true }
  }

  private scarta(percorso: string): void {
    const f = this.file.get(percorso)
    if (!f) return
    f.richiesteContate().forEach((id) => this.proprietari.delete(id))
    this.file.delete(percorso)
  }

  private async aggiorna(percorso: string): Promise<void> {
    if (percorso.endsWith(".meta.json")) return this.leggiMeta(percorso.replace(/\.meta\.json$/, ".jsonl"))
    const stato = await statistica(percorso)
    if (!stato?.isFile()) return this.scarta(percorso)
    let f = this.file.get(percorso)
    if (f && stato.size < f.byteLetti) {
      this.scarta(percorso)
      f = undefined
    }
    if (!f) {
      const { sessione, eAgente } = this.doveSta(percorso)
      f = new FileDiConversazione(eAgente)
      f.sessione = sessione
      this.file.set(percorso, f)
    }
    const reclama = (richiesta: string): boolean => {
      if (!this.proprietari.has(richiesta)) this.proprietari.set(richiesta, percorso)
      return this.proprietari.get(richiesta) === percorso
    }
    f.byteLetti = await leggiRighe(percorso, f.byteLetti, stato.size, (riga) => f.aggiungi(riga, reclama))
    if (f.eAgente && f.idStrumento === null) await this.leggiMeta(percorso)
  }

  /** Il file di dati accanto a un sottoagente dice quale chiamata di strumento l'ha lanciato. */
  private async leggiMeta(percorsoAgente: string): Promise<void> {
    const f = this.file.get(percorsoAgente)
    if (!f?.eAgente) return
    const scritto = await leggiTesto(percorsoAgente.replace(/\.jsonl$/, ".meta.json"))
    if (scritto === null) return
    try {
      const dati: unknown = JSON.parse(scritto)
      if (eOggetto(dati) && typeof dati["toolUseId"] === "string") f.idStrumento = dati["toolUseId"]
    } catch {
      // un file a metà: si rilegge al prossimo cambio
    }
  }
}
