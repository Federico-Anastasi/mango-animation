// Il lavoro di Codex (`docs/api/consumi.md`): i thread che Codex tiene per la cartella di lavoro, letti con `thread/read` all'avvio e
// riletti, solo quelli il cui `updatedAt` è cambiato, quando un giro finisce nella chat. La regola del giro è quella di `lettura.ts`.
import { join } from "node:path"
import { cartellaDellaChat } from "../chat/allegati"
import type { ClienteCodex } from "../chat/codex/protocollo"
import { comandoDi } from "../chat/codex/voci"
import { fraseDi, type Oggetto } from "../chat/traduzione"
import { eOggetto, jsonDaTesto, leggiTesto, scrivi, testoJson } from "../disco"
import { slugDelContesto, slugToccati, type Token, type Unita } from "./lettura"

const PAGINA = 100
const FILE_DEI_TOKEN = "codex-consumi.json"

const testo = (valore: unknown): string | null => (typeof valore === "string" ? valore : null)
const numero = (valore: unknown): number | null => (typeof valore === "number" && Number.isFinite(valore) ? valore : null)
const oggetti = (valore: unknown): Oggetto[] => (Array.isArray(valore) ? valore.filter(eOggetto) : [])

/** Le chiamate di strumento di una voce, coi nomi e gli ingressi con cui `slugToccati` riconosce un video. */
function chiamateDi(voce: Oggetto): Array<{ nome: string; ingresso: unknown }> {
  switch (voce["type"]) {
    case "commandExecution":
      return [{ nome: "Bash", ingresso: { command: comandoDi(voce) } }]
    case "fileChange":
      return oggetti(voce["changes"]).map((cambio) => ({ nome: "Edit", ingresso: { file_path: testo(cambio["path"]) ?? "" } }))
    case "mcpToolCall":
      return [{ nome: `mcp__${String(voce["server"])}__${String(voce["tool"])}`, ingresso: voce["arguments"] ?? {} }]
    default:
      return []
  }
}

const testiDelCreator = (voci: Oggetto[]): string[] =>
  voci
    .filter((v) => v["type"] === "userMessage")
    .flatMap((v) => oggetti(v["content"]))
    .flatMap((c) => testo(c["text"]) ?? [])

/** Un giro di Codex come giro contato; `null` se è ancora in corso, se non ha nessuna risposta di Codex o se non si sa quando è cominciato. */
function unitaDelGiro(giro: Oggetto): Unita | null {
  const voci = oggetti(giro["items"])
  const partito = numero(giro["startedAt"])
  const finito = numero(giro["completedAt"])
  const durata = numero(giro["durationMs"]) ?? (partito !== null && finito !== null ? (finito - partito) * 1000 : null)
  if (giro["status"] === "inProgress" || partito === null || durata === null || !voci.some((v) => v["type"] !== "userMessage")) return null
  const tocchi = new Map<string, number>()
  for (const voce of voci) {
    for (const { nome, ingresso } of chiamateDi(voce)) {
      for (const slug of slugToccati(nome, [ingresso])) tocchi.set(slug, (tocchi.get(slug) ?? 0) + 1)
    }
  }
  return { contesto: slugDelContesto(testiDelCreator(voci)), tocchi, token: { scritti: 0, riletti: 0, nuovi: 0 }, tempoMs: durata, giri: 1, inizio: partito * 1000, fine: partito * 1000 + durata }
}

/** Un giro letto con `thread/read`: il suo identificativo è quello con cui Codex ne annuncia i token. */
interface GiroLetto {
  id: string | null
  unita: Unita
}

/** I giri di un thread riletto con i suoi giri (`thread/read`). */
export const giriDelThread = (thread: Oggetto): GiroLetto[] =>
  oggetti(thread["turns"]).flatMap((giro) => {
    const unita = unitaDelGiro(giro)
    return unita === null ? [] : { id: testo(giro["id"]), unita }
  })

interface ThreadLetto {
  /** Il suo `updatedAt` quando è stato letto. */
  aggiornato: number | null
  giri: GiroLetto[]
}

/** Quanto il thread aveva usato prima del giro e quanto al suo ultimo aggiornamento, nelle tre voci del prodotto. */
interface TokenDelGiro {
  prima: Token
  ultimo: Token
}

type TokenDeiThread = Map<string, Map<string, TokenDelGiro>>

/** `inputTokens` comprende il contesto riletto dalla cache e quello messo per la prima volta: i nuovi sono la differenza. */
function tokenDi(conto: unknown): Token | null {
  if (!eOggetto(conto)) return null
  const scritti = numero(conto["outputTokens"])
  const riletti = numero(conto["cachedInputTokens"])
  const letti = numero(conto["inputTokens"])
  return scritti === null || riletti === null || letti === null ? null : { scritti, riletti, nuovi: letti - riletti }
}

const eToken = (valore: unknown): valore is Token => eOggetto(valore) && numero(valore["scritti"]) !== null && numero(valore["riletti"]) !== null && numero(valore["nuovi"]) !== null

const uguali = (a: Token, b: Token): boolean => a.scritti === b.scritti && a.riletti === b.riletti && a.nuovi === b.nuovi

const meno = (a: Token, b: Token): Token => ({ scritti: a.scritti - b.scritti, riletti: a.riletti - b.riletti, nuovi: a.nuovi - b.nuovi })

const delGiro = ({ prima, ultimo }: TokenDelGiro): Token => {
  const speso = meno(ultimo, prima)
  return { scritti: Math.max(0, speso.scritti), riletti: Math.max(0, speso.riletti), nuovi: Math.max(0, speso.nuovi) }
}

/** `null` se il file non ha la forma che si scrive: un file letto a metà non vale più di uno illeggibile. */
function tokenDalFile(valore: unknown): TokenDeiThread | null {
  if (!eOggetto(valore)) return null
  const thread: TokenDeiThread = new Map()
  for (const [id, giri] of Object.entries(valore)) {
    if (!eOggetto(giri)) return null
    const letti = new Map<string, TokenDelGiro>()
    for (const [giro, conti] of Object.entries(giri)) {
      if (!eOggetto(conti) || !eToken(conti["prima"]) || !eToken(conti["ultimo"])) return null
      letti.set(giro, { prima: conti["prima"], ultimo: conti["ultimo"] })
    }
    thread.set(id, letti)
  }
  return thread
}

export class ConsumiDiCodex {
  private readonly thread = new Map<string, ThreadLetto>()
  /** L'unico proprietario in memoria dei token dei giri: il file in `archivio/.chat/` li ripete, scritto senza bloccare. */
  private readonly token: TokenDeiThread = new Map()
  private readonly percorso: string
  private coda: Promise<void> = Promise.resolve()
  private inAttesa: Promise<void> | null = null
  private scrittura: Promise<void> = Promise.resolve()
  private daScrivere = false
  private smetti: (() => void) | null = null
  private scadenza: ReturnType<typeof setTimeout> | undefined
  private chiuso = false
  /** I thread di cui un giro è appena finito: si rileggono anche se l'elenco di Codex non dice ancora che sono cambiati. */
  private readonly finiti = new Set<string>()
  /** I giri visti partire e non ancora finiti: solo di questi si contano i token, perché Codex ripete l'ultimo uso di un thread che si riprende. */
  private readonly partiti = new Set<string>()
  /** I thread con un giro in corso: l'elenco di Codex può non portarli ancora, e i loro token non si tolgono. */
  private readonly attivi = new Set<string>()

  /** `cambiato` avvisa quando i conti sono diversi da come erano. */
  constructor(
    private readonly cliente: ClienteCodex,
    private readonly lavoro: string,
    private readonly archivio: string,
    private readonly attesaMs: number,
    private readonly cambiato: () => void,
  ) {
    this.percorso = join(archivio, ".chat", FILE_DEI_TOKEN)
  }

  /** Comincia ad ascoltare i giri e i loro token e legge i thread. Torna a lettura finita, o quando l'attesa scade: non fallisce mai. */
  async avvia(): Promise<void> {
    await this.carica()
    this.smetti = this.cliente.ascolta((metodo, parametri) => {
      if (metodo === "turn/started") return this.parte(parametri)
      if (metodo === "thread/tokenUsage/updated") return this.contaToken(parametri)
      if (metodo !== "turn/completed") return
      const thread = testo(parametri["threadId"])
      const giro = eOggetto(parametri["turn"]) ? testo(parametri["turn"]["id"]) : null
      if (giro !== null) this.partiti.delete(giro)
      if (thread !== null) {
        this.finiti.add(thread)
        this.attivi.delete(thread)
      }
      void this.rileggi()
    })
    const scaduta = new Promise<void>((risolvi) => {
      this.scadenza = setTimeout(() => {
        console.error("consumi di Codex: Codex non ha ancora risposto, i suoi conti arrivano quando risponde")
        risolvi()
      }, this.attesaMs)
    })
    await Promise.race([this.rileggi(), scaduta])
    clearTimeout(this.scadenza)
  }

  /** I giri contati; `conToken` sono quelli di cui si sanno i token, e portano i loro. */
  unita(): { tutte: Unita[]; conToken: Unita[] } {
    const tutte: Unita[] = []
    const conToken: Unita[] = []
    for (const [thread, letto] of this.thread) {
      for (const { id, unita } of letto.giri) {
        const conti = id === null ? undefined : this.token.get(thread)?.get(id)
        const giro = conti === undefined ? unita : { ...unita, token: delGiro(conti) }
        tutte.push(giro)
        if (conti !== undefined) conToken.push(giro)
      }
    }
    return { tutte, conToken }
  }

  async chiudi(): Promise<void> {
    this.chiuso = true
    this.smetti?.()
    clearTimeout(this.scadenza)
    await this.scrittura
  }

  private parte(parametri: Oggetto): void {
    const giro = eOggetto(parametri["turn"]) ? testo(parametri["turn"]["id"]) : null
    if (giro !== null) this.partiti.add(giro)
  }

  /** Il totale del thread alla prima notifica di un giro, meno quello dell'ultima richiesta, è ciò che il thread aveva usato prima del giro. */
  private contaToken(parametri: Oggetto): void {
    const thread = testo(parametri["threadId"])
    const giro = testo(parametri["turnId"])
    const uso = eOggetto(parametri["tokenUsage"]) ? parametri["tokenUsage"] : {}
    const totale = tokenDi(uso["total"])
    const ultima = tokenDi(uso["last"])
    if (thread === null || giro === null || totale === null || ultima === null) return
    const giri = this.token.get(thread) ?? new Map<string, TokenDelGiro>()
    const noto = giri.get(giro)
    if (noto === undefined && !this.partiti.has(giro)) return
    this.attivi.add(thread)
    if (noto !== undefined && uguali(noto.ultimo, totale)) return
    giri.set(giro, { prima: noto?.prima ?? meno(totale, ultima), ultimo: totale })
    this.token.set(thread, giri)
    this.salva()
    if (this.thread.get(thread)?.giri.some((g) => g.id === giro)) this.cambiato()
  }

  /** Un file che non si legge vale «nessun token saputo»: i giri di prima restano senza, e il file si riscrive con quelli nuovi. */
  private async carica(): Promise<void> {
    try {
      const scritto = await leggiTesto(this.percorso)
      if (scritto === null) return
      const letto = jsonDaTesto(scritto)
      const token = letto === null ? null : tokenDalFile(letto.valore)
      if (token === null) {
        console.error(`consumi di Codex: ${this.percorso} non si legge: i token dei giri fatti prima non si sanno, e il file si riscrive con quelli nuovi`)
        return
      }
      token.forEach((giri, thread) => this.token.set(thread, giri))
    } catch (errore) {
      console.error(`consumi di Codex: non riesco a leggere ${this.percorso}, i token dei giri fatti prima non si sanno: ${fraseDi(errore)}`)
    }
  }

  /** Più richieste mentre una scrittura è in coda ne fanno una sola, con lo stato di quando parte. */
  private salva(): void {
    if (this.daScrivere) return
    this.daScrivere = true
    this.scrittura = this.scrittura
      .then(async () => {
        this.daScrivere = false
        await cartellaDellaChat(this.archivio)
        await scrivi(this.percorso, testoJson(Object.fromEntries([...this.token].map(([thread, giri]) => [thread, Object.fromEntries(giri)]))))
      })
      .catch((errore) => console.error(`consumi di Codex: non riesco a scrivere ${this.percorso}, i token dei giri non restano al riavvio: ${fraseDi(errore)}`))
  }

  private togliITokenDeiThreadSpariti(elenco: ReadonlyMap<string, number | null>): void {
    const spariti = [...this.token.keys()].filter((id) => !elenco.has(id) && !this.attivi.has(id))
    if (spariti.length === 0) return
    spariti.forEach((id) => this.token.delete(id))
    this.salva()
  }

  /** Una lettura dopo quella in corso; più richieste insieme ne fanno una sola. */
  private rileggi(): Promise<void> {
    if (this.inAttesa !== null) return this.inAttesa
    const lettura = this.coda.then(() => {
      this.inAttesa = null
      return this.leggi()
    })
    this.inAttesa = lettura
    this.coda = lettura
    return lettura
  }

  private async elenca(): Promise<Map<string, number | null>> {
    const viste = new Map<string, number | null>()
    let dopo: string | null = null
    do {
      const pagina: Oggetto = await this.cliente.chiedi<Oggetto>("thread/list", { cwd: this.lavoro, limit: PAGINA, ...(dopo === null ? {} : { cursor: dopo }) })
      for (const t of oggetti(pagina["data"])) {
        const id = testo(t["id"])
        if (id !== null && testo(t["parentThreadId"]) === null) viste.set(id, numero(t["updatedAt"]))
      }
      dopo = testo(pagina["nextCursor"])
    } while (dopo !== null)
    return viste
  }

  /** Non fallisce: un Codex che non risponde lascia i conti com'erano. */
  private async leggi(): Promise<void> {
    let diverso = false
    const finiti = new Set(this.finiti)
    this.finiti.clear()
    try {
      const elenco = await this.elenca()
      for (const id of this.thread.keys()) {
        if (!elenco.has(id)) diverso = this.thread.delete(id) || diverso
      }
      if (!this.chiuso) this.togliITokenDeiThreadSpariti(elenco)
      for (const [id, aggiornato] of elenco) {
        if (this.chiuso) return
        const letto = this.thread.get(id)
        if (letto !== undefined && aggiornato !== null && letto.aggiornato === aggiornato && !finiti.has(id)) continue
        try {
          const risposta = await this.cliente.chiedi<Oggetto>("thread/read", { threadId: id, includeTurns: true })
          const giri = giriDelThread(eOggetto(risposta["thread"]) ? risposta["thread"] : {})
          diverso = diverso || JSON.stringify(giri) !== JSON.stringify(letto?.giri)
          this.thread.set(id, { aggiornato, giri })
        } catch (errore) {
          console.error(`consumi di Codex: non riesco a leggere il thread ${id}, i suoi conti restano come erano: ${fraseDi(errore)}`)
        }
      }
    } catch (errore) {
      console.error(`consumi di Codex: non riesco a leggere i suoi thread, i conti restano come erano: ${fraseDi(errore)}`)
    } finally {
      if (diverso && !this.chiuso) this.cambiato()
    }
  }
}
