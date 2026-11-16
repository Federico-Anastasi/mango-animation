// Il lavoro in chat per video (`docs/api/consumi.md`). Un solo proprietario in memoria: legge una volta tutti i file delle conversazioni
// di Claude Code della cartella di lavoro e poi, quando l'osservatore dice che uno è cambiato, solo ciò che vi si è aggiunto; a fianco
// tiene i conti dei thread di Codex (`codex.ts`).
import { mkdir, readdir } from "node:fs/promises"
import { join, sep } from "node:path"
import type { ClienteCodex } from "../chat/codex/protocollo"
import { eOggetto, leggiTesto, statistica } from "../disco"
import { osserva } from "../osservatore"
import { ConsumiDiCodex } from "./codex"
import { CLAUDE_CODE, CODEX, FileDiConversazione, riepiloga, riepilogaUnita, type Riepilogo, type Token } from "./lettura"

const BLOCCO_BYTE = 16 * 1024 ** 2

/** La parte di un motore in un conto: `token` è `null` se di nessun suo giro si sa quanti token ha usato. */
export interface ConsumoDelMotore {
  /** Secondi di lavoro (`docs/api/consumi.md`). */
  tempo: number
  giri: number
  /** Quanti dei `giri` hanno i token saputi. */
  giri_con_token: number
  token: Token | null
}

export interface ConsumoDiVideo {
  /** Il tempo e i giri dei motori sommati; i token sono quelli dei soli motori che li dicono. */
  tempo: number
  giri: number
  token: Token
  dal: string
  al: string
  motori: Record<string, ConsumoDelMotore>
}

export interface VistaConsumi {
  /** Falso finché non sono stati letti tutti i file la prima volta: i conti di allora sono parziali. */
  pronto: boolean
  /** I motori di cui il server legge il lavoro. */
  contati: string[]
  video: Record<string, ConsumoDiVideo>
  senza_video: { tempo: number; giri: number; token: Token; motori: Record<string, ConsumoDelMotore> }
}

export interface OpzioniConsumi {
  /** Quanto devono restare fermi i file delle conversazioni prima che si rileggano: Claude li scrive di continuo mentre lavora. */
  quietoMs: number
  /** Codex, se c'è: il suo programma è quello della chat, `lavoro` la cartella in cui lavora, `archivio` dove tiene i token dei giri, `attesaMs` quanto `pronto` lo aspetta. */
  codex?: { cliente: ClienteCodex; lavoro: string; archivio: string; attesaMs: number }
}

interface Conteggio {
  id: string
  riepilogo: Riepilogo
  /** Gli stessi conti, dei soli giri di cui si sa quanti token hanno usato. */
  conToken: Riepilogo
}

const secondi = (ms: number): number => Math.round(ms / 1000)

type Totali = { tempoMs: number; giri: number; token: Token }

const haLavorato = (v: Totali): boolean => v.giri > 0 || v.tempoMs > 0 || v.token.scritti + v.token.riletti + v.token.nuovi > 0

const parteDi = (v: Totali, saputo: Totali | undefined): ConsumoDelMotore => ({
  tempo: secondi(v.tempoMs),
  giri: v.giri,
  giri_con_token: saputo?.giri ?? 0,
  token: saputo === undefined ? null : v.token,
})

function sommaDelle(parti: Record<string, ConsumoDelMotore>): { tempo: number; giri: number; token: Token } {
  const somma = { tempo: 0, giri: 0, token: { scritti: 0, riletti: 0, nuovi: 0 } }
  for (const p of Object.values(parti)) {
    somma.tempo += p.tempo
    somma.giri += p.giri
    if (p.token === null) continue
    somma.token.scritti += p.token.scritti
    somma.token.riletti += p.token.riletti
    somma.token.nuovi += p.token.nuovi
  }
  return somma
}

function vistaDi(conteggi: Conteggio[], pronto: boolean): VistaConsumi {
  const video: Record<string, ConsumoDiVideo> = {}
  const slug = [...new Set(conteggi.flatMap((c) => [...c.riepilogo.video.keys()]))].sort((a, b) => a.localeCompare(b))
  for (const s of slug) {
    const motori: Record<string, ConsumoDelMotore> = {}
    let dal = Number.POSITIVE_INFINITY
    let al = Number.NEGATIVE_INFINITY
    for (const c of conteggi) {
      const v = c.riepilogo.video.get(s)
      if (!v) continue
      motori[c.id] = parteDi(v, c.conToken.video.get(s))
      dal = Math.min(dal, v.dal)
      al = Math.max(al, v.al)
    }
    video[s] = { ...sommaDelle(motori), dal: new Date(dal).toISOString(), al: new Date(al).toISOString(), motori }
  }
  const motori = Object.fromEntries(conteggi.filter((c) => haLavorato(c.riepilogo.senzaVideo)).map((c) => [c.id, parteDi(c.riepilogo.senzaVideo, haLavorato(c.conToken.senzaVideo) ? c.conToken.senzaVideo : undefined)]))
  return { pronto, contati: conteggi.map((c) => c.id), video, senza_video: { ...sommaDelle(motori), motori } }
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
  private fileLetti = false
  private codexLetto = false
  private chiuso = false
  private readonly codex: ConsumiDiCodex | null
  private conteggi: Conteggio[] = []
  private ultima = ""

  /** `cambiato` avvisa quando i conti sono diversi da come erano (e la prima volta che sono pronti). */
  constructor(
    private readonly cartella: string,
    private readonly opzioni: OpzioniConsumi,
    private readonly cambiato: () => void,
  ) {
    this.codex = opzioni.codex ? new ConsumiDiCodex(opzioni.codex.cliente, opzioni.codex.lavoro, opzioni.codex.archivio, opzioni.codex.attesaMs, () => this.ricalcola()) : null
    this.conteggi = this.conteggiDi(riepilogaUnita([]))
  }

  /** Comincia a osservare la cartella e legge i file e i thread di Codex in sfondo: i conti sono `pronto: false` finché non ha finito. */
  async avvia(): Promise<void> {
    if (this.codex === null) this.codexLetto = true
    else void this.codex.avvia().then(() => this.segna("codex"))
    // Su un computer nuovo la cartella la crea Claude Code alla prima conversazione, magari dopo l'avvio: la si crea qui per osservarla.
    if (!(await statistica(this.cartella))?.isDirectory()) {
      try {
        await mkdir(this.cartella, { recursive: true })
      } catch (errore) {
        console.error(`consumi di Claude: non riesco a creare ${this.cartella}, i conti restano vuoti: ${errore instanceof Error ? errore.message : String(errore)}`)
        this.segna("file")
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
      this.segna("file")
    })
  }

  vista(): VistaConsumi {
    return vistaDi(this.conteggi, this.pronto)
  }

  async chiudi(): Promise<void> {
    this.chiuso = true
    this.osservatore?.chiudi()
    await this.codex?.chiudi()
    await this.coda
  }

  private accoda(lavoro: () => Promise<void>): void {
    this.coda = this.coda.then(lavoro).catch((errore) => console.error(`consumi di Claude: ${errore instanceof Error ? (errore.stack ?? errore.message) : String(errore)}`))
  }

  /** I conti sono pronti quando i file di Claude e i thread di Codex sono stati letti la prima volta (o Codex ha smesso di essere aspettato). */
  private segna(letto: "file" | "codex"): void {
    if (letto === "file") this.fileLetti = true
    else this.codexLetto = true
    if (!this.fileLetti || !this.codexLetto || this.pronto) return
    this.pronto = true
    this.ricalcola()
  }

  private conteggiDi(claude: Riepilogo): Conteggio[] {
    const codex = this.codex?.unita()
    return [{ id: CLAUDE_CODE, riepilogo: claude, conToken: claude }, ...(codex ? [{ id: CODEX, riepilogo: riepilogaUnita(codex.tutte), conToken: riepilogaUnita(codex.conToken) }] : [])]
  }

  private ricalcola(): void {
    const principali = new Map<string, FileDiConversazione>()
    const agenti: FileDiConversazione[] = []
    for (const [percorso, f] of this.file) {
      if (f.eAgente) agenti.push(f)
      else principali.set(this.doveSta(percorso).sessione, f)
    }
    this.conteggi = this.conteggiDi(riepiloga(principali, agenti))
    const scritta = JSON.stringify(vistaDi(this.conteggi, this.pronto))
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
