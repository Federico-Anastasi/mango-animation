// Mango Code al posto di Claude Code nella chat (`docs/CHAT.md`, «Mango Code»): la stessa `query` che la conversazione conosce,
// tradotta sul contratto di Mango Code (https://github.com/Federico-Anastasi/mango-code/blob/master/docs/INTEGRATION.md). Gli eventi di Mango Code diventano i
// messaggi dell'SDK di Claude Code, così trascrizione, richieste e studio restano gli stessi.
import type { Options, SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk"
import { join } from "node:path"
import { eOggetto, jsonDaTesto, leggiTesto, rinomina, scrivi, testoJson } from "../disco"
import { frase, type Frase } from "../lingua"
import { osserva } from "../osservatore"
import { cartellaDellaChat } from "./allegati"
import { contestoDaUsage, type Oggetto } from "./traduzione"
import { VociSpente } from "./vociSpente"
import { ErroreChat, type FunzioneQuery, type MessaggioSessione, type MisuraDelContesto, type ModelloChat, type QueryChat, type VoceSessione } from "./tipi"

/** Il prefisso dei modelli di Mango Code fra quelli della chat: `mango-code/toq`. */
export const PREFISSO = "mango-code/"
export const eDiMangoCode = (modello: string | null | undefined): boolean => typeof modello === "string" && modello.startsWith(PREFISSO)

/** Come si presenta a Mango Code ogni chiamata, che il suo registro scrive. */
export const CHI_CHIAMA = { "user-agent": "Mango Animation" }

const FRASE_CHIUSO = frase("Mango Code ha chiuso il collegamento: riscrivi il messaggio.", "Mango Code closed the connection: write the message again.")
const FRASE_SPENTO = frase("Mango Code è spento: aprilo dalla sua icona e riscrivi il messaggio.", "Mango Code is off: open it from its icon and write the message again.")
const FRASE_NON_PRONTO = frase("Mango Code si sta preparando o non è pronto: guarda la sua finestra e riscrivi il messaggio.", "Mango Code is getting ready or is not ready: look at its window and write the message again.")

const dettaglioDi = (errore: unknown): string => (errore instanceof Error ? errore.message : String(errore))

/** Mango Code non si raggiunge: il dettaglio tecnico va nel registro, al creator si dice che è spento. */
function nonSiRaggiunge(errore: unknown): never {
  console.error(`chat di Mango Code: non si raggiunge: ${dettaglioDi(errore)}`)
  throw new ErroreChat(502, FRASE_SPENTO)
}

export interface Servizio {
  pid: number
  agente: string
  motore: string
}

export type StatoMangoCode = { stato: "pronto"; servizio: Servizio } | { stato: "nonPronto" } | { stato: "spento" }

/**
 * Com'è Mango Code: `service.json` nella sua cartella dei dati e il processo vivo. Pronto se l'agente risponde; acceso ma non pronto se
 * il file c'è con `reason` al posto di `agent` e `engine` (il testo di `reason` è per il creator e non si legge).
 */
export async function statoDiMangoCode(dati: string): Promise<StatoMangoCode> {
  const spento: StatoMangoCode = { stato: "spento" }
  const testo = await leggiTesto(join(dati, "service.json"))
  const letto = testo === null ? null : jsonDaTesto(testo.replace(/^﻿/, ""))
  const s = letto && eOggetto(letto.valore) ? letto.valore : null
  if (!s || typeof s["pid"] !== "number") return spento
  try {
    process.kill(s["pid"], 0)
  } catch {
    return spento
  }
  if (typeof s["agent"] !== "string" || typeof s["engine"] !== "string") return typeof s["reason"] === "string" ? { stato: "nonPronto" } : spento
  try {
    const r = await fetch(`${s["agent"]}/global/health`, { headers: CHI_CHIAMA, signal: AbortSignal.timeout(3000) })
    if (!r.ok) console.error(`chat di Mango Code: il controllo di salute ha risposto ${r.status}: lo conto spento.`)
    return r.ok ? { stato: "pronto", servizio: { pid: s["pid"], agente: s["agent"], motore: s["engine"] } } : spento
  } catch (errore) {
    console.error(`chat di Mango Code: è acceso ma non risponde al controllo di salute: ${dettaglioDi(errore)}`)
    return spento
  }
}

/** Mango Code pronto, se c'è. */
export async function trovaMangoCode(dati: string): Promise<Servizio | null> {
  const s = await statoDiMangoCode(dati)
  return s.stato === "pronto" ? s.servizio : null
}

interface Ricordo {
  sessione: string
  modello: string
  titolo: string
  aggiornata: number
}

/** Quale sessione di Mango Code è di quale conversazione della chat (`archivio/.chat/mango-code.json`). */
export class RegistroMangoCode {
  private scrittura: Promise<void> = Promise.resolve()
  private readonly percorso: string

  constructor(private readonly archivio: string) {
    this.percorso = join(archivio, ".chat", "mango-code.json")
  }

  /** Il file com'è, `{}` se non c'è; `null` se c'è ma non è un oggetto JSON. */
  private async leggi(): Promise<Oggetto | null> {
    const testo = await leggiTesto(this.percorso)
    if (testo === null) return {}
    const letto = jsonDaTesto(testo)
    return letto && eOggetto(letto.valore) ? letto.valore : null
  }

  async tutti(): Promise<Record<string, Ricordo>> {
    const valore = await this.leggi()
    if (valore === null) {
      console.error(`chat di Mango Code: ${this.percorso} non si legge: le conversazioni di Mango Code non compaiono nell'elenco finché non si scrive di nuovo.`)
      return {}
    }
    return Object.fromEntries(
      Object.entries(valore).flatMap(([id, r]) =>
        eOggetto(r) && typeof r["sessione"] === "string" && typeof r["modello"] === "string" && typeof r["titolo"] === "string" && typeof r["aggiornata"] === "number"
          ? [[id, { sessione: r["sessione"], modello: r["modello"], titolo: r["titolo"], aggiornata: r["aggiornata"] }]]
          : [],
      ),
    )
  }

  async di(id: string): Promise<Ricordo | undefined> {
    return (await this.tutti())[id]
  }

  /** Un errore di scrittura va nel registro del server e non blocca le scritture dopo. */
  cambia(id: string, cambio: (vecchio: Ricordo | undefined) => Ricordo): Promise<void> {
    this.scrittura = this.scrittura
      .then(async () => {
        await cartellaDellaChat(this.archivio)
        // Un file che non si legge non si riscrive in silenzio: resta accanto, con un altro nome.
        if ((await this.leggi()) === null) {
          const messo = `${this.percorso}.illeggibile`
          await rinomina(this.percorso, messo)
          console.error(`chat di Mango Code: ${this.percorso} non si leggeva ed è stato messo da parte in ${messo}.`)
        }
        const tutti = await this.tutti()
        await scrivi(this.percorso, testoJson({ ...tutti, [id]: cambio(tutti[id]) }))
      })
      .catch((errore) => console.error(`chat di Mango Code: non riesco a scrivere ${this.percorso}: ${errore instanceof Error ? errore.message : String(errore)}`))
    return this.scrittura
  }
}

export interface OpzioniMangoCode {
  /** La cartella dei dati di Mango Code (`MANGO_DATA`, di base `%LOCALAPPDATA%\MangoCode`). */
  dati: string
  archivio: string
  adesso: () => Date
}

const NOMI_DEGLI_STRUMENTI: Record<string, string> = { bash: "Bash", read: "Read", edit: "Edit", write: "Write", glob: "Glob", grep: "Grep", list: "LS", webfetch: "WebFetch", todowrite: "TodoWrite", skill: "Skill", question: "AskUserQuestion" }

/** Il nome di uno strumento di Mango Code come lo scrive Claude Code: `video_foto` → `mcp__video__foto`. */
export function nomeDelloStrumento(nome: string): string {
  if (NOMI_DEGLI_STRUMENTI[nome]) return NOMI_DEGLI_STRUMENTI[nome]
  const mcp = /^(video)_(.+)$/.exec(nome)
  return mcp ? `mcp__${mcp[1]}__${mcp[2]}` : nome
}

/**
 * Ciò che Claude Code sa dall'ambiente e Mango Code no: dove sono i dati e cosa è il metodo. Il metodo stesso (CLAUDE.md, regole,
 * skill) Mango Code lo legge dalla cartella in più che la conversazione gli dichiara.
 */
export function istruzioniDelMetodo(lavoro: string, codice: string, aggiunte: string): string {
  return [
    `You work in ${lavoro}: the creator's data folder, where every relative path of the method starts (archivio/grezzo/<day>/ the footage, archivio/video/<slug>/ the videos, profilo.json and .claude/ the creator's profile and rules). Look for files there and with the tools, not elsewhere on the computer.`,
    `The product's method (its CLAUDE.md, rules and skills, which you already have) lives in ${codice}: read it, never write there.`,
    `The engine runs as \`python -m motore\` with PYTHONPATH=${codice}.`,
    aggiunte,
  ]
    .filter((r) => r !== "")
    .join("\n")
}

const messaggio = (m: Oggetto): SDKMessage => m as unknown as SDKMessage

/** Il testo e le immagini di un messaggio del creator, come parti di Mango Code. */
function partiDelMessaggio(contenuto: SDKUserMessage["message"]["content"]): Oggetto[] {
  if (typeof contenuto === "string") return [{ type: "text", text: contenuto }]
  return contenuto.flatMap((b): Oggetto[] => {
    if (b.type === "text") return [{ type: "text", text: b.text }]
    if (b.type === "image" && b.source.type === "base64") return [{ type: "file", mime: b.source.media_type, filename: `immagine.${b.source.media_type.split("/")[1] ?? "png"}`, url: `data:${b.source.media_type};base64,${b.source.data}` }]
    return []
  })
}

/** Le risposte della chat (`answers`: domanda → «a, b») nella forma di Mango Code: per ogni domanda le etichette scelte. */
export function risposteDi(domande: Oggetto[], answers: unknown): string[][] {
  const date = eOggetto(answers) ? answers : {}
  return domande.map((d) => {
    const risposta = typeof d["question"] === "string" ? date[d["question"]] : undefined
    const testo = typeof risposta === "string" ? risposta : ""
    const etichette = Array.isArray(d["options"]) ? d["options"].flatMap((o) => (eOggetto(o) && typeof o["label"] === "string" ? [o["label"]] : [])) : []
    if (etichette.includes(testo)) return [testo]
    const scelte = testo.split(", ").filter((t) => etichette.includes(t))
    return d["multiple"] === true && scelte.length > 1 ? scelte : [testo]
  })
}

class QueryMangoCode implements QueryChat {
  private readonly uscita: SDKMessage[] = []
  private sveglia: (() => void) | null = null
  private chiusa = false
  private errore: Error | null = null
  private readonly fine = new AbortController()
  private servizio: Servizio | null = null
  private sessione: string | null = null
  private modello: string
  private inizioDelGiro = 0
  private readonly ruoli = new Map<string, string>()
  private readonly indici = new Map<string, number>()
  private readonly avviati = new Set<string>()
  private readonly scritto = new Map<string, number>()
  private messaggioCorrente: string | null = null

  constructor(
    private readonly o: OpzioniMangoCode,
    private readonly registro: RegistroMangoCode,
    private readonly voci: VociSpente,
    private readonly opzioni: Options,
    prompt: AsyncIterable<SDKUserMessage>,
  ) {
    this.modello = (opzioni.model ?? "").slice(PREFISSO.length)
    void this.lavora(prompt).catch((errore: unknown) => this.rompi(errore instanceof Error ? errore : new Error(String(errore))))
  }

  private get id(): string {
    return this.opzioni.resume ?? this.opzioni.sessionId ?? ""
  }

  private get cartella(): string {
    return this.opzioni.cwd ?? ""
  }

  private emetti(m: Oggetto): void {
    this.uscita.push(messaggio(m))
    this.sveglia?.()
  }

  private rompi(errore: Error): void {
    this.errore = errore
    this.sveglia?.()
  }

  /** `nonRiuscito` è la frase per il creator se Mango Code risponde con un errore (secondo lo stato); ciò che ha risposto va nel registro. */
  private async chiama(metodo: string, percorso: string, corpo?: unknown, nonRiuscito: (stato: number) => Frase = () => frase("Mango Code non ha preso il messaggio: riprova.", "Mango Code did not take the message: try again.")): Promise<unknown> {
    if (!this.servizio) throw new ErroreChat(502, frase("Mango Code non è collegato.", "Mango Code is not connected."))
    const separatore = percorso.includes("?") ? "&" : "?"
    const r = await fetch(`${this.servizio.agente}${percorso}${separatore}directory=${encodeURIComponent(this.cartella)}`, {
      method: metodo,
      headers: corpo === undefined ? CHI_CHIAMA : { ...CHI_CHIAMA, "content-type": "application/json" },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    }).catch(nonSiRaggiunge)
    const testo = await r.text()
    if (!r.ok) {
      console.error(`chat di Mango Code: ha risposto ${r.status} a ${metodo} ${percorso}: ${testo.slice(0, 300)}`)
      throw new ErroreChat(502, nonRiuscito(r.status))
    }
    return testo ? (JSON.parse(testo) as unknown) : null
  }

  private async lavora(prompt: AsyncIterable<SDKUserMessage>): Promise<void> {
    const stato = await statoDiMangoCode(this.o.dati)
    if (stato.stato !== "pronto") throw new ErroreChat(502, stato.stato === "nonPronto" ? FRASE_NON_PRONTO : FRASE_SPENTO)
    this.servizio = stato.servizio
    await this.aggiungiGliStrumenti()
    await this.dichiaraIlMetodo()
    await this.voci.spegni(this.cartella)
    await this.ascolta()
    const vecchio = this.opzioni.resume ? await this.registro.di(this.opzioni.resume) : undefined
    this.sessione = vecchio?.sessione ?? null
    if (vecchio && this.modello === "") this.modello = vecchio.modello
    this.emetti({ type: "system", subtype: "init", model: `${PREFISSO}${this.modello}`, session_id: this.id })
    const append = this.opzioni.systemPrompt && typeof this.opzioni.systemPrompt === "object" && "append" in this.opzioni.systemPrompt ? (this.opzioni.systemPrompt.append ?? "") : ""
    // Il metodo è la cartella in più che la conversazione dà a Claude Code (`aperturaDelMetodo`).
    const sistema = istruzioniDelMetodo(this.cartella, this.metodo, append)
    for await (const m of prompt) {
      if (this.chiusa) return
      const parti = partiDelMessaggio(m.message.content)
      if (this.sessione === null) {
        const titolo = parti.flatMap((p) => (p["type"] === "text" && typeof p["text"] === "string" ? [p["text"].replace(/^\[Context:[^\]]*\]\s*/, "")] : [])).join(" ").slice(0, 60)
        const creata = await this.chiama("POST", "/session", { title: titolo || "Mango Animation" })
        if (!eOggetto(creata) || typeof creata["id"] !== "string") throw new ErroreChat(502, frase("Mango Code non ha aperto la conversazione: riprova.", "Mango Code did not open the conversation: try again."))
        this.sessione = creata["id"]
        const sessione = this.sessione
        await this.registro.cambia(this.id, () => ({ sessione, modello: this.modello, titolo: titolo || "Mango Animation", aggiornata: this.o.adesso().getTime() }))
      }
      this.inizioDelGiro ||= Date.now()
      await this.chiama("POST", `/session/${this.sessione}/prompt_async`, { parts: parti, system: sistema, ...(this.modello ? { model: { providerID: "mango", modelID: this.modello } } : {}) })
      const modello = this.modello
      await this.registro.cambia(this.id, (r) => ({ sessione: r?.sessione ?? this.sessione ?? "", modello, titolo: r?.titolo ?? "Mango Animation", aggiornata: this.o.adesso().getTime() }))
    }
  }

  /** Il metodo è la cartella in più che la conversazione dà a Claude Code (`aperturaDelMetodo`). */
  private get metodo(): string {
    return this.opzioni.additionalDirectories?.[0] ?? this.cartella
  }

  /** La cartella del metodo come cartella in più di Mango Code: vale finché è acceso, e dichiararla di nuovo non cambia niente. */
  private async dichiaraIlMetodo(): Promise<void> {
    if (this.metodo === this.cartella) return
    // Un Mango Code senza le cartelle in più non ha la rotta: è vecchio. Ogni altro errore è di quel momento.
    await this.chiama("PUT", "/mango/extra-folders", { folders: [this.metodo] }, (stato) =>
        stato === 404 || stato === 405
          ? frase("Questa versione di Mango Code è troppo vecchia: aggiornala.", "This version of Mango Code is too old: update it.")
          : frase("Mango Code non ha preso il metodo del prodotto: riprova.", "Mango Code did not take the method of the product: try again."))
  }

  /** Lo strumento «video» passato alla cartella, come a Claude Code (il server MCP resta finché Mango Code è acceso). */
  private async aggiungiGliStrumenti(): Promise<void> {
    // Uno strumento già collegato non si registra di nuovo: per Mango Code sarebbe un client nuovo, e la sessione terrebbe quello chiuso.
    const presenti = await this.chiama("GET", "/mcp")
    for (const [nome, config] of Object.entries(this.opzioni.mcpServers ?? {})) {
      const presente = eOggetto(presenti) ? presenti[nome] : undefined
      if (eOggetto(presente) && presente["status"] === "connected") continue
      if (!("command" in config) || typeof config.command !== "string") continue
      const args = "args" in config && Array.isArray(config.args) ? config.args : []
      const environment = "env" in config && config.env ? config.env : {}
      await this.chiama("POST", "/mcp", { name: nome, config: { type: "local", enabled: true, command: [config.command, ...args], environment } })
    }
  }

  private async ascolta(): Promise<void> {
    if (!this.servizio) return
    const r = await fetch(`${this.servizio.agente}/event?directory=${encodeURIComponent(this.cartella)}`, { headers: CHI_CHIAMA, signal: this.fine.signal }).catch((errore: unknown) => {
      // Gli eventi chiusi apposta (la conversazione si chiude) non sono un Mango Code che non si raggiunge.
      if (this.fine.signal.aborted) throw errore
      return nonSiRaggiunge(errore)
    })
    if (!r.ok || !r.body) {
      console.error(`chat di Mango Code: gli eventi hanno risposto ${r.status}`)
      throw new ErroreChat(502, frase("Mango Code non risponde.", "Mango Code is not answering."))
    }
    const lettore = r.body.getReader()
    const decodifica = new TextDecoder()
    void (async () => {
      let resto = ""
      for (;;) {
        const { value, done } = await lettore.read()
        if (done) break
        resto += decodifica.decode(value, { stream: true })
        let i: number
        while ((i = resto.indexOf("\n\n")) >= 0) {
          const blocco = resto.slice(0, i)
          resto = resto.slice(i + 2)
          for (const riga of blocco.split("\n")) {
            if (!riga.startsWith("data: ")) continue
            const evento = JSON.parse(riga.slice(6)) as unknown
            if (eOggetto(evento)) await this.evento(evento)
          }
        }
      }
      if (!this.chiusa) this.rompi(new ErroreChat(502, FRASE_CHIUSO))
    })().catch((errore: unknown) => {
      if (this.chiusa) return
      console.error(`chat di Mango Code: gli eventi si sono interrotti: ${dettaglioDi(errore)}`)
      this.rompi(new ErroreChat(502, FRASE_CHIUSO))
    })
  }

  private indice(messaggioId: string, parte: string): number {
    if (this.messaggioCorrente !== messaggioId) {
      this.messaggioCorrente = messaggioId
      this.indici.clear()
      this.emetti({ type: "stream_event", parent_tool_use_id: null, event: { type: "message_start", message: { id: messaggioId } } })
    }
    const gia = this.indici.get(parte)
    if (gia !== undefined) return gia
    const nuovo = this.indici.size
    this.indici.set(parte, nuovo)
    return nuovo
  }

  private pezzo(messaggioId: string, parte: string, tipo: string, testo: string): void {
    if (testo === "") return
    const delta = tipo === "reasoning" ? { type: "thinking_delta", thinking: testo } : { type: "text_delta", text: testo }
    this.emetti({ type: "stream_event", parent_tool_use_id: null, event: { type: "content_block_delta", index: this.indice(messaggioId, parte), delta } })
    this.scritto.set(parte, (this.scritto.get(parte) ?? 0) + testo.length)
  }

  private async evento(e: Oggetto): Promise<void> {
    const p = eOggetto(e["properties"]) ? e["properties"] : {}
    const info = eOggetto(p["info"]) ? p["info"] : null
    const parte = eOggetto(p["part"]) ? p["part"] : null
    const sessione = p["sessionID"] ?? info?.["sessionID"] ?? parte?.["sessionID"]
    if (this.sessione === null || sessione !== this.sessione) return
    switch (e["type"]) {
      case "message.updated": {
        if (info && typeof info["id"] === "string" && typeof info["role"] === "string") this.ruoli.set(info["id"], eRiassunto(info) ? "riassunto" : info["role"])
        // I token di un passo finito, nel conto dell'API di Claude che arriva coi pezzi: la conversazione ne ricava il contesto usato.
        const usage = info?.["role"] === "assistant" ? usageDai(info) : null
        const usati = contestoDaUsage(usage)
        if (usage && usati !== null) {
          this.ultimoContesto = usati
          this.emetti({ type: "stream_event", parent_tool_use_id: null, event: { type: "message_delta", usage } })
        }
        return
      }
      case "message.part.delta": {
        if (p["field"] !== "text" || typeof p["delta"] !== "string" || typeof p["partID"] !== "string") return
        const messaggioId = typeof p["messageID"] === "string" ? p["messageID"] : (this.messaggioCorrente ?? "mc")
        if (this.ruoli.get(messaggioId) === "user" || this.ruoli.get(messaggioId) === "riassunto") return
        this.pezzo(messaggioId, p["partID"], this.tipi.get(p["partID"]) ?? "text", p["delta"])
        return
      }
      case "message.part.updated":
        if (parte) this.parte(parte)
        return
      case "question.asked":
        return this.domanda(p)
      case "permission.asked":
        return this.permesso(p)
      case "session.error": {
        const errore = eOggetto(p["error"]) ? p["error"] : {}
        const dati = eOggetto(errore["data"]) ? errore["data"] : {}
        const frase = typeof dati["message"] === "string" ? dati["message"] : typeof errore["name"] === "string" ? errore["name"] : "errore senza dettagli"
        this.erroreDelGiro = frase
        return
      }
      case "session.compacted":
        // Il contesto nuovo si sa solo a fine del passo dopo: intanto il vecchio non vale più.
        this.emetti({ type: "system", subtype: "compact_boundary", compact_metadata: { trigger: "auto", pre_tokens: this.ultimoContesto } })
        this.ultimoContesto = 0
        return
      case "session.idle":
        return this.fineDelGiro()
    }
  }

  private readonly tipi = new Map<string, string>()
  private erroreDelGiro: string | null = null
  private ultimoContesto = 0
  private contestoDelModello: { modello: string; contesto: number } | null = null

  private parte(parte: Oggetto): void {
    const id = typeof parte["id"] === "string" ? parte["id"] : ""
    const messaggioId = typeof parte["messageID"] === "string" ? parte["messageID"] : ""
    const tipo = typeof parte["type"] === "string" ? parte["type"] : ""
    this.tipi.set(id, tipo)
    if (this.ruoli.get(messaggioId) === "user" || this.ruoli.get(messaggioId) === "riassunto") return
    if (tipo === "text" || tipo === "reasoning") {
      const testo = typeof parte["text"] === "string" ? parte["text"] : ""
      const finita = eOggetto(parte["time"]) && parte["time"]["end"] !== undefined
      if (finita && this.ruoli.get(messaggioId) === "assistant") this.pezzo(messaggioId, id, tipo, testo.slice(this.scritto.get(id) ?? 0))
      return
    }
    if (tipo !== "tool") return
    const stato = eOggetto(parte["state"]) ? parte["state"] : {}
    const chiamata = typeof parte["callID"] === "string" ? parte["callID"] : id
    const nome = nomeDelloStrumento(typeof parte["tool"] === "string" ? parte["tool"] : "strumento")
    // In attesa lo strumento non ha ancora gli argomenti: si apre quando parte.
    if (nome === "AskUserQuestion" || stato["status"] === "pending") return
    if (!this.avviati.has(chiamata)) {
      this.avviati.add(chiamata)
      const indice = this.indice(messaggioId, id)
      this.emetti({ type: "stream_event", parent_tool_use_id: null, event: { type: "content_block_start", index: indice, content_block: { type: "tool_use", id: chiamata, name: nome, input: eOggetto(stato["input"]) ? stato["input"] : {} } } })
    }
    if (stato["status"] === "completed" || stato["status"] === "error") {
      const errore = stato["status"] === "error"
      const esito = errore ? String(stato["error"] ?? "errore") : typeof stato["output"] === "string" ? stato["output"] : JSON.stringify(stato["output"] ?? "")
      this.emetti({ type: "user", parent_tool_use_id: null, message: { role: "user", content: [{ type: "tool_result", tool_use_id: chiamata, content: esito, is_error: errore }] } })
    }
  }

  /** Mango Code dice «inattivo» anche più volte di fila: chiude solo un giro aperto. */
  private fineDelGiro(): void {
    if (this.inizioDelGiro === 0) return
    const durata = Date.now() - this.inizioDelGiro
    this.inizioDelGiro = 0
    const errore = this.erroreDelGiro
    this.erroreDelGiro = null
    this.messaggioCorrente = null
    this.emetti(errore ? { type: "result", subtype: "error_during_execution", is_error: true, errors: [errore], duration_ms: durata } : { type: "result", subtype: "success", is_error: false, result: "", duration_ms: durata })
  }

  /** Una domanda di Mango Code diventa quella di Claude Code (AskUserQuestion), coi bottoni della chat. */
  private async domanda(p: Oggetto): Promise<void> {
    const id = typeof p["id"] === "string" ? p["id"] : ""
    const domande = Array.isArray(p["questions"]) ? p["questions"].filter(eOggetto) : []
    const ingresso = {
      questions: domande.map((d) => ({
        question: d["question"],
        header: typeof d["header"] === "string" ? d["header"] : "",
        multiSelect: d["multiple"] === true,
        options: (Array.isArray(d["options"]) ? d["options"].filter(eOggetto) : []).map((o) => ({ label: o["label"], description: typeof o["description"] === "string" ? o["description"] : "" })),
      })),
    }
    const chiedi = this.opzioni.canUseTool
    if (!chiedi) return void (await this.chiama("POST", `/question/${id}/reject`))
    void chiedi("AskUserQuestion", ingresso, { signal: this.fine.signal, toolUseID: id, requestId: id })
      .then((r) => (r?.behavior === "allow" ? this.chiama("POST", `/question/${id}/reply`, { answers: risposteDi(domande, r.updatedInput?.["answers"]) }) : this.chiama("POST", `/question/${id}/reject`)))
      // Una domanda che non c'è più (risposta dalla finestra di Mango Code, o dopo un suo riavvio) non rompe la conversazione.
      .catch((errore: unknown) => console.error(`chat di Mango Code: la risposta alla domanda ${id} non è arrivata: ${errore instanceof Error ? errore.message : String(errore)}`))
  }

  /** Un permesso chiesto da Mango Code (solo se le regole della conversazione lo vogliono): la chat lo mostra coi suoi bottoni. */
  private async permesso(p: Oggetto): Promise<void> {
    const id = typeof p["id"] === "string" ? p["id"] : ""
    const chiedi = this.opzioni.canUseTool
    const strumento = nomeDelloStrumento(typeof p["permission"] === "string" ? p["permission"] : "strumento")
    if (!chiedi) return void (await this.chiama("POST", `/permission/${id}/reply`, { reply: "reject" }))
    void chiedi(strumento, { patterns: p["patterns"] ?? [] }, { signal: this.fine.signal, toolUseID: id, requestId: id })
      .then((r) => this.chiama("POST", `/permission/${id}/reply`, r?.behavior === "allow" ? { reply: "once" } : { reply: "reject", ...(r ? { message: r.message } : {}) }))
      .catch((errore: unknown) => console.error(`chat di Mango Code: la risposta al permesso ${id} non è arrivata: ${errore instanceof Error ? errore.message : String(errore)}`))
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKMessage> {
    return {
      next: async (): Promise<IteratorResult<SDKMessage>> => {
        for (;;) {
          const primo = this.uscita.shift()
          if (primo) return { value: primo, done: false }
          if (this.errore) throw this.errore
          if (this.chiusa) return { value: undefined, done: true }
          await new Promise<void>((risolvi) => {
            this.sveglia = risolvi
          })
          this.sveglia = null
        }
      },
    }
  }

  interrupt = async (): Promise<unknown> => (this.sessione ? this.chiama("POST", `/session/${this.sessione}/abort`, undefined, () => frase("Mango Code non ha fermato il lavoro: riprova.", "Mango Code did not stop the job: try again.")) : null)

  close = (): void => {
    this.chiusa = true
    this.fine.abort()
    this.sveglia?.()
  }

  setModel = async (modello?: string): Promise<void> => {
    if (!eDiMangoCode(modello)) throw new ErroreChat(400, frase("Una conversazione di Mango Code resta di Mango Code: per Claude apri una conversazione nuova.", "A Mango Code conversation stays with Mango Code: to use Claude, start a new conversation."))
    this.modello = (modello ?? "").slice(PREFISSO.length)
  }

  applyFlagSettings = async (impostazioni: { effortLevel: string | null }): Promise<void> => {
    if (impostazioni.effortLevel !== null) throw new ErroreChat(400, frase("Mango Code non ha livelli di effort.", "Mango Code has no effort levels."))
  }

  supportedModels = async (): Promise<never[]> => []

  supportedCommands = async (): Promise<never[]> => []

  stopTask = async (): Promise<void> => {
    throw new ErroreChat(400, frase("Mango Code non ha lavori da fermare uno per uno: usa «Ferma».", "Mango Code has no jobs to stop one by one: use «Stop»."))
  }

  backgroundTasks = async (): Promise<boolean> => false

  /** Il contesto dell'ultima risposta e quello del modello acceso, scritto nei modelli di Mango Code (0 se non si sa). */
  getContextUsage = async (): Promise<MisuraDelContesto> => {
    // La misura del modello si chiede una volta per modello: non cambia finché il modello è lo stesso.
    if (this.servizio && this.contestoDelModello?.modello !== this.modello) {
      this.contestoDelModello = { modello: this.modello, contesto: (await contestiDeiModelli(this.servizio, this.cartella)).get(this.modello) ?? 0 }
    }
    return { totalTokens: this.ultimoContesto, rawMaxTokens: this.contestoDelModello?.contesto ?? 0 }
  }
}

/** Mango Code per la chat: la sua `query`, i suoi modelli e le sue conversazioni come quelle di Claude Code. */
export class MangoCode {
  readonly registro: RegistroMangoCode
  private readonly voci: VociSpente

  constructor(private readonly o: OpzioniMangoCode) {
    this.registro = new RegistroMangoCode(o.archivio)
    this.voci = new VociSpente(o.archivio)
  }

  readonly query: FunzioneQuery = ({ prompt, options }) => new QueryMangoCode(this.o, this.registro, this.voci, options, prompt)

  /** I modelli di Mango Code se è acceso, altrimenti nessuno (la chat offre solo quelli di Claude Code). */
  async modelli(cartella: string): Promise<ModelloChat[]> {
    const s = await trovaMangoCode(this.o.dati)
    if (!s) return []
    try {
      return (await modelliDi(s, cartella)).flatMap((m) => {
        if (typeof m["id"] !== "string") return []
        const nome = typeof m["name"] === "string" ? m["name"] : m["id"]
        const contesto = contestoDel(m)
        const immagini = eOggetto(m["capabilities"]) && eOggetto(m["capabilities"]["input"]) && m["capabilities"]["input"]["image"] === true
        const k = contesto ? Math.round(contesto / 1024) : null
        const unisci = (voci: (string | null)[]) => voci.filter((v): v is string => v !== null).join(" · ")
        const descrizione = frase(
          unisci(["Mango Code, sul computer", k ? `${k}k di contesto` : null, immagini ? "vede le immagini" : "non vede le immagini"]),
          unisci(["Mango Code, on this computer", k ? `${k}k of context` : null, immagini ? "sees images" : "does not see images"]),
        )
        return [{ id: `${PREFISSO}${m["id"]}`, nome: `Mango Code · ${nome}`, descrizione, effort: [], reale: `${PREFISSO}${m["id"]}` }]
      })
    } catch (errore) {
      console.error(`chat di Mango Code: non riesco a leggere i suoi modelli: ${dettaglioDi(errore)}`)
      return []
    }
  }

  /**
   * Avvisa quando Mango Code si accende o si spegne (scrive e toglie `service.json`): i suoi modelli sono da rileggere. `null` se
   * Mango Code non c'è su questo computer (la sua cartella dei dati manca).
   */
  osserva(alCambio: () => void): { chiudi: () => void } | null {
    try {
      return osserva(this.o.dati, { ricorsivo: false, rimbalzoMs: 200, ignora: (relativo) => relativo !== "service.json", alCambio: async () => alCambio() })
    } catch {
      return null
    }
  }

  /** La misura del contesto del modello di una sua conversazione; `null` se Mango Code è spento o non la dice. */
  async contestoDi(id: string, cartella: string): Promise<number | null> {
    const ricordo = await this.registro.di(id)
    const s = ricordo ? await trovaMangoCode(this.o.dati) : null
    if (!ricordo || !s) return null
    try {
      return (await contestiDeiModelli(s, cartella)).get(ricordo.modello) ?? null
    } catch (errore) {
      console.error(`chat di Mango Code: non riesco a leggere il contesto del modello: ${dettaglioDi(errore)}`)
      return null
    }
  }

  async eSua(id: string): Promise<boolean> {
    return (await this.registro.di(id)) !== undefined
  }

  /** Il modello di una sua conversazione (`mango-code/<chiave>`), anche chiusa; `null` se non è sua. */
  async modelloDi(id: string): Promise<string | null> {
    const ricordo = await this.registro.di(id)
    return ricordo ? `${PREFISSO}${ricordo.modello}` : null
  }

  /** Le conversazioni di Mango Code, dal registro (si vedono anche a Mango Code spento). */
  async elenca(): Promise<VoceSessione[]> {
    return Object.entries(await this.registro.tutti()).map(([id, r]) => ({ id, titolo: r.titolo, aggiornata: r.aggiornata }))
  }

  /** Una conversazione di Mango Code nella forma dei file di Claude Code, così la chat la rilegge allo stesso modo. */
  async leggi(id: string, cartella: string): Promise<MessaggioSessione[] | null> {
    const ricordo = await this.registro.di(id)
    if (!ricordo) return null
    const stato = await statoDiMangoCode(this.o.dati)
    if (stato.stato === "nonPronto") throw new ErroreChat(502, frase("Questa conversazione è di Mango Code, che non è ancora pronto: guarda la sua finestra e riprova.", "This conversation is with Mango Code, which is not ready yet: look at its window and try again."))
    if (stato.stato !== "pronto") throw new ErroreChat(502, frase("Questa conversazione è di Mango Code, che è spento: apri Mango Code per rileggerla.", "This conversation is with Mango Code, which is off: open Mango Code to read it again."))
    const s = stato.servizio
    const r = await fetch(`${s.agente}/session/${ricordo.sessione}/message?directory=${encodeURIComponent(cartella)}`, { headers: CHI_CHIAMA })
    if (!r.ok) throw new ErroreChat(502, frase(`Mango Code non dà i messaggi della conversazione (${r.status}).`, `Mango Code does not return the messages of the conversation (${r.status}).`))
    const messaggi = ((await r.json()) as unknown[]).filter(eOggetto)
    return messaggi.flatMap((m) => righeDi(m))
  }
}

/** I modelli che Mango Code offre (`GET /config/providers`, fornitore `mango`). */
async function modelliDi(s: Servizio, cartella: string): Promise<Oggetto[]> {
  const r = await fetch(`${s.agente}/config/providers?directory=${encodeURIComponent(cartella)}`, { headers: CHI_CHIAMA, signal: AbortSignal.timeout(5000) })
  const v = r.ok ? ((await r.json()) as unknown) : null
  const fornitori = eOggetto(v) && Array.isArray(v["providers"]) ? v["providers"].filter(eOggetto) : []
  const mango = fornitori.find((f) => f["id"] === "mango")
  return mango && eOggetto(mango["models"]) ? Object.values(mango["models"]).filter(eOggetto) : []
}

/** La misura del contesto di un modello; `null` se non la dice (anche uno 0). */
const contestoDel = (m: Oggetto): number | null => (eOggetto(m["limit"]) && typeof m["limit"]["context"] === "number" && m["limit"]["context"] > 0 ? m["limit"]["context"] : null)

/** Per ogni modello di Mango Code la misura del suo contesto. */
async function contestiDeiModelli(s: Servizio, cartella: string): Promise<Map<string, number>> {
  return new Map(
    (await modelliDi(s, cartella)).flatMap((m): [string, number][] => {
      const contesto = contestoDel(m)
      return typeof m["id"] === "string" && contesto !== null ? [[m["id"], contesto]] : []
    }),
  )
}

/**
 * I token di un passo di Mango Code nel conto dell'API di Claude; `null` se il passo non è finito (è a zero) o è il riassunto, i cui
 * token sono quelli della richiesta che lo scrive e non il contesto dopo. Il ragionamento conta con l'uscita, come per Claude.
 */
function usageDai(info: Oggetto): Oggetto | null {
  const tokens = info["tokens"]
  if (typeof info["finish"] !== "string" || info["summary"] === true || !eOggetto(tokens)) return null
  const cache = eOggetto(tokens["cache"]) ? tokens["cache"] : {}
  const n = (v: unknown): number => (typeof v === "number" ? v : 0)
  return { input_tokens: n(tokens["input"]), output_tokens: n(tokens["output"]) + n(tokens["reasoning"]), cache_read_input_tokens: n(cache["read"]), cache_creation_input_tokens: n(cache["write"]) }
}

/** Un messaggio di Mango Code come righe del file di Claude Code: il testo del creator, o i blocchi di Claude e gli esiti. */
export function righeDi(m: Oggetto): MessaggioSessione[] {
  const info = eOggetto(m["info"]) ? m["info"] : {}
  const parti = Array.isArray(m["parts"]) ? m["parts"].filter(eOggetto) : []
  const id = info["id"]
  if (typeof id !== "string") return []
  const tempo = eOggetto(info["time"]) && typeof info["time"]["created"] === "number" ? new Date(info["time"]["created"]).toISOString() : undefined
  const comune = { uuid: id, ...(tempo ? { timestamp: tempo } : {}) }
  if (info["role"] === "user") {
    const testo = parti.flatMap((p) => (p["type"] === "text" && p["synthetic"] !== true && typeof p["text"] === "string" ? [p["text"]] : [])).join("\n")
    return testo === "" ? [] : [{ type: "user", ...comune, message: { role: "user", content: testo } }]
  }
  const blocchi: Oggetto[] = []
  const esiti: Oggetto[] = []
  for (const p of parti) {
    if (p["type"] === "text" && typeof p["text"] === "string") blocchi.push({ type: "text", text: p["text"] })
    if (p["type"] === "reasoning" && typeof p["text"] === "string") blocchi.push({ type: "thinking", thinking: p["text"] })
    if (p["type"] !== "tool") continue
    const stato = eOggetto(p["state"]) ? p["state"] : {}
    const chiamata = typeof p["callID"] === "string" ? p["callID"] : String(p["id"])
    const nome = nomeDelloStrumento(typeof p["tool"] === "string" ? p["tool"] : "strumento")
    blocchi.push({ type: "tool_use", id: chiamata, name: nome, input: eOggetto(stato["input"]) ? stato["input"] : {} })
    if (stato["status"] === "completed") esiti.push({ type: "tool_result", tool_use_id: chiamata, content: typeof stato["output"] === "string" ? stato["output"] : "", is_error: false })
    if (stato["status"] === "error") esiti.push({ type: "tool_result", tool_use_id: chiamata, content: String(stato["error"] ?? "errore"), is_error: true })
  }
  // Il riassunto fatto, e il passo che riprende ancora no: il contesto di adesso non si sa. Il suo testo è per il modello, non per la chat.
  if (eRiassunto(info)) return typeof info["finish"] === "string" ? [{ type: "system", subtype: "compact_boundary", uuid: `${id}-riassunto`, message: null }] : []
  const usage = usageDai(info)
  return [
    ...(blocchi.length > 0 ? [{ type: "assistant", ...comune, message: { role: "assistant", content: blocchi, ...(usage ? { usage } : {}) } }] : []),
    ...(esiti.length > 0 ? [{ type: "user", uuid: `${id}-esiti`, ...(tempo ? { timestamp: tempo } : {}), message: { role: "user", content: esiti } }] : []),
  ]
}

const eRiassunto = (info: Oggetto): boolean => info["summary"] === true || info["mode"] === "compaction"
