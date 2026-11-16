// Le voci e le notifiche di un thread di Codex negli eventi del prodotto, in diretta e rilette.
import { eOggetto } from "../../disco"
import type { ErroreDelGiro, EsitoDelloStrumento, EventoMotore } from "../motore"
import { partiDelTestoDelCreator, type RigaLetta } from "../storico"
import { abbrevia, type Oggetto } from "../traduzione"
import type { ContestoUsato, DomandaChat, ImmagineDelloStrumento, Parte } from "../tipi"

const testo = (valore: unknown): string | null => (typeof valore === "string" ? valore : null)
const numero = (valore: unknown): number | null => (typeof valore === "number" ? valore : null)
const oggetti = (valore: unknown): Oggetto[] => (Array.isArray(valore) ? valore.filter(eOggetto) : [])
const testi = (valore: unknown): string[] => (Array.isArray(valore) ? valore.filter((v): v is string => typeof v === "string") : [])

/** La shell in cui Codex avvolge ogni comando: al creator si mostra ciò che sta dentro. */
const AVVOLTO = /^"?[^"']*?(?:pwsh|powershell|bash|zsh|sh|cmd)(?:\.exe)?"?\s+(?:-\w+\s+)*?(?:-Command|-lc|-c|\/c)\s+(['"])([\s\S]*)\1$/i

/** Il comando come l'ha scritto il modello. */
export function comandoDi(voce: Oggetto): string {
  const azioni = oggetti(voce["commandActions"]).flatMap((a) => testo(a["command"]) ?? [])
  if (azioni.length === 1 && azioni[0] !== undefined) return azioni[0]
  const intero = testo(voce["command"]) ?? ""
  return AVVOLTO.exec(intero)?.[2] ?? intero
}

interface Chiamata {
  id: string
  nome: string
  ingresso: unknown
}

/** Gli strumenti di una voce, coi nomi della chat; nessuno se la voce non è uno strumento. Una modifica a più file è uno strumento per file. */
function chiamateDi(voce: Oggetto): Chiamata[] {
  const id = String(voce["id"])
  switch (voce["type"]) {
    case "commandExecution":
      return [{ id, nome: "Bash", ingresso: { command: comandoDi(voce) } }]
    case "fileChange":
      return oggetti(voce["changes"]).map((cambio, n) => {
        const nuovo = eOggetto(cambio["kind"]) && cambio["kind"]["type"] === "add"
        return { id: n === 0 ? id : `${id}:${n}`, nome: nuovo ? "Write" : "Edit", ingresso: { file_path: testo(cambio["path"]) ?? "", [nuovo ? "content" : "diff"]: testo(cambio["diff"]) ?? "" } }
      })
    case "mcpToolCall":
      return [{ id, nome: `mcp__${String(voce["server"])}__${String(voce["tool"])}`, ingresso: voce["arguments"] ?? {} }]
    case "dynamicToolCall":
      return [{ id, nome: String(voce["tool"]), ingresso: voce["arguments"] ?? {} }]
    case "webSearch":
      return [{ id, nome: "WebSearch", ingresso: { query: testo(voce["query"]) ?? "" } }]
    case "imageView":
      return [{ id, nome: "Read", ingresso: { file_path: testo(voce["path"]) ?? "" } }]
    case "collabAgentToolCall":
      return [{ id, nome: "Agent", ingresso: { description: testo(voce["prompt"]) ?? "", prompt: testo(voce["prompt"]) ?? "" } }]
    default:
      return []
  }
}

function esitoDelloStrumentoMcp(voce: Oggetto): EsitoDelloStrumento {
  if (eOggetto(voce["error"])) return { testo: testo(voce["error"]["message"]) ?? "", errore: true, immagini: [] }
  const blocchi = eOggetto(voce["result"]) ? oggetti(voce["result"]["content"]) : []
  const immagini = blocchi.flatMap((b): ImmagineDelloStrumento[] => {
    const [tipo, dati] = [testo(b["mimeType"]), testo(b["data"])]
    return b["type"] === "image" && tipo !== null && dati !== null ? [{ media_type: tipo, data: dati }] : []
  })
  return { testo: blocchi.flatMap((b) => (b["type"] === "text" ? (testo(b["text"]) ?? []) : [])).join("\n"), errore: voce["status"] === "failed", immagini }
}

/** L'esito di una voce finita; `null` se la voce non è uno strumento. */
function esitoDi(voce: Oggetto): EsitoDelloStrumento | null {
  const finitaMale = voce["status"] !== "completed"
  switch (voce["type"]) {
    case "commandExecution": {
      const uscita = numero(voce["exitCode"])
      return { testo: testo(voce["aggregatedOutput"]) ?? "", errore: finitaMale || (uscita !== null && uscita !== 0), immagini: [] }
    }
    case "mcpToolCall":
      return esitoDelloStrumentoMcp(voce)
    case "dynamicToolCall":
      return { testo: oggetti(voce["contentItems"]).flatMap((c) => testo(c["text"]) ?? []).join("\n"), errore: voce["success"] === false, immagini: [] }
    case "fileChange":
    case "collabAgentToolCall":
      return { testo: "", errore: finitaMale, immagini: [] }
    case "webSearch":
    case "imageView":
      return { testo: "", errore: false, immagini: [] }
    default:
      return null
  }
}

/** Il pensiero di una voce `reasoning` intera: ciò che il modello ha pensato, o il riassunto se dà solo quello. */
function pensieroDi(voce: Oggetto): string {
  const intero = testi(voce["content"]).join("\n\n")
  return intero || testi(voce["summary"]).join("\n\n")
}

/** Il nome di un errore di Codex: una parola, o la chiave dell'oggetto che lo porta. */
function nomeDellErrore(info: unknown): string | null {
  if (typeof info === "string") return info
  return eOggetto(info) ? (Object.keys(info)[0] ?? null) : null
}

const NON_HA_RISPOSTO = new Set(["httpConnectionFailed", "responseStreamConnectionFailed", "responseStreamDisconnected", "responseTooManyFailedAttempts", "internalServerError"])

/** Fino a quando dura il limite raggiunto (secondi dal 1970): la finestra esaurita che si libera per ultima; `null` se nessuna lo è. */
function limiteFinoA(limiti: unknown): number | null {
  if (!eOggetto(limiti)) return null
  const esaurite = [limiti["primary"], limiti["secondary"]].flatMap((f) => (eOggetto(f) && (numero(f["usedPercent"]) ?? 0) >= 100 ? (numero(f["resetsAt"]) ?? []) : []))
  return esaurite.length > 0 ? Math.max(...esaurite) : null
}

/** Le domande che Codex fa col suo strumento, nella forma della chat. */
export const domandeDiCodex = (parametri: Oggetto): DomandaChat[] =>
  oggetti(parametri["questions"]).map((d) => ({
    domanda: testo(d["question"]) ?? "",
    intestazione: testo(d["header"]) ?? "",
    opzioni: oggetti(d["options"]).map((o) => ({ etichetta: testo(o["label"]) ?? "", descrizione: testo(o["description"]) ?? "" })),
    multipla: false,
  }))

/** Le risposte del creator (per testo della domanda) come Codex le vuole: per identificativo della domanda. */
export const risposteACodex = (parametri: Oggetto, risposte: Record<string, string>): { answers: Record<string, { answers: string[] }> } => ({
  answers: Object.fromEntries(oggetti(parametri["questions"]).flatMap((d) => (typeof d["id"] === "string" ? [[d["id"], { answers: [risposte[testo(d["question"]) ?? ""] ?? ""] }]] : []))),
})

/** Gli stati di un aiutante che dicono che ha finito di lavorare. */
const STATI_FINALI = new Set(["completed", "errored", "shutdown", "notFound", "interrupted"])

/** Un aiutante: il thread figlio che Codex ha aperto, e il lavoro che lo mostra. */
interface Figlio {
  /** Ciò che il lavoro dice; `null` finché il lavoro non c'è. */
  descrizione: string | null
  /** La descrizione viene dalla richiesta fatta all'aiutante, non da un ripiego. */
  daRichiesta: boolean
  sfondo: boolean
  strumenti: number
  /** Il giro a cui lavora adesso. */
  giro: string | null
  finito: boolean
}

/** Un thread acceso: le notifiche di Codex, una alla volta, diventano gli eventi che la chat mostra. */
export class TraduttoreDiCodex {
  /** Le voci di testo e di pensiero arrivate a pezzi: quando arrivano intere non si ripetono. */
  private readonly aPezzi = new Set<string>()
  /** I comandi partiti e non ancora finiti: la voce e il suo processo. Un comando di un giro fermato resta qui finché non lo si chiude. */
  private readonly comandi = new Map<string, string | null>()
  /** Come la chat chiama ogni comando partito e non ancora finito. */
  private readonly descrizioni = new Map<string, string>()
  /** I comandi che la chat mostra fra i lavori in corso: quelli che un giro ha lasciato accesi. Un comando del giro è solo il suo strumento. */
  private readonly mostrati = new Set<string>()
  /** I comandi di un giro fermato: restano da chiudere e non diventano mai lavori. */
  private readonly fermati = new Set<string>()
  private readonly sfondo = new Set<string>()
  /** I thread degli aiutanti, quelli lanciati da questo thread e da loro. */
  private readonly figli = new Map<string, Figlio>()
  /** Gli strumenti partiti nel giro e non ancora finiti, e quelli che un giro finito ha lasciato così. */
  private readonly aperti = new Set<string>()
  private readonly lasciati = new Set<string>()
  private giro: string | null = null
  private errore: Oggetto | null = null
  private limite: number | null = null
  private usati: number | null = null
  private finestra: number | null = null
  private piani = 0
  private riassunto = false

  constructor(
    private readonly evento: (evento: EventoMotore) => void,
    /** L'inizio dell'`id` dei modelli di Codex nella chat. */
    private readonly prefisso: string,
  ) {}

  /** Il giro a cui Codex sta lavorando; `null` fra un giro e l'altro. */
  get giroInCorso(): string | null {
    return this.giro
  }

  /** I processi dei comandi ancora vivi, anche di un giro già fermato. */
  get processiVivi(): string[] {
    return [...this.comandi.values()].filter((p): p is string => p !== null)
  }

  /** I processi dei comandi che un giro ha lasciato accesi. */
  get processiInSfondo(): string[] {
    return [...this.sfondo].flatMap((voce) => this.comandi.get(voce) ?? [])
  }

  /** Codex ha detto quali processi sono ancora vivi: quelli attesi che non ci sono più sono finiti. */
  terminaliFiniti(attesi: string[], vivi: ReadonlySet<string>): void {
    for (const processo of attesi) if (!vivi.has(processo)) this.chiuso(processo)
  }

  /** Il processo di un comando che la chat mostra; `null` se non c'è più. */
  processoDi(voce: string): string | null {
    return this.comandi.get(voce) ?? null
  }

  /** Il processo è stato chiuso da chi tiene la conversazione. */
  chiuso(processo: string): void {
    for (const [voce, p] of this.comandi) if (p === processo) this.finisciIlComando(voce)
  }

  /** Il thread è un aiutante di questo thread. */
  haFiglio(thread: string): boolean {
    return this.figli.has(thread)
  }

  /** Codex ha aperto un thread figlio: le sue notifiche non sono della conversazione. */
  figlioNato(thread: string): void {
    this.figlio(thread)
  }

  /** Il giro a cui un aiutante lavora; `null` se non lavora. */
  giroDelFiglio(thread: string): string | null {
    return this.figli.get(thread)?.giro ?? null
  }

  /** L'ultima misura che Codex ha dato; `null` prima della prima risposta. */
  get contesto(): ContestoUsato | null {
    return this.usati === null ? null : { usati: this.usati, totale: this.finestra }
  }

  notifica(metodo: string, p: Oggetto): void {
    switch (metodo) {
      case "thread/settings/updated": {
        const scelte = eOggetto(p["threadSettings"]) ? p["threadSettings"] : {}
        const modello = testo(scelte["model"])
        if (modello !== null) this.evento({ tipo: "avvio", modello: `${this.prefisso}${modello}`, effort: testo(scelte["effort"]) })
        return
      }
      case "turn/started":
        this.giro = eOggetto(p["turn"]) ? testo(p["turn"]["id"]) : null
        this.errore = null
        this.riassunto = false
        return this.evento({ tipo: "attivo" })
      case "item/started":
        return eOggetto(p["item"]) ? this.iniziata(p["item"]) : undefined
      case "item/completed":
        return eOggetto(p["item"]) ? this.finita(p["item"]) : undefined
      case "item/agentMessage/delta":
      case "item/plan/delta":
        return this.pezzo("testo", String(p["itemId"]), String(p["itemId"]), p["delta"])
      case "item/reasoning/textDelta":
        return this.pezzo("pensiero", String(p["itemId"]), `${String(p["itemId"])}:c${String(p["contentIndex"])}`, p["delta"])
      case "item/reasoning/summaryTextDelta":
        return this.pezzo("pensiero", String(p["itemId"]), `${String(p["itemId"])}:s${String(p["summaryIndex"])}`, p["delta"])
      case "turn/plan/updated":
        return this.piano(p)
      case "thread/tokenUsage/updated": {
        const uso = eOggetto(p["tokenUsage"]) ? p["tokenUsage"] : {}
        const usati = eOggetto(uso["last"]) ? numero(uso["last"]["totalTokens"]) : null
        this.finestra = numero(uso["modelContextWindow"]) ?? this.finestra
        if (usati === null || usati <= 0) return
        this.usati = usati
        return this.evento({ tipo: "contesto", usati })
      }
      case "thread/compacted":
        return this.riassumi()
      case "thread/name/updated": {
        const titolo = testo(p["threadName"])
        if (titolo) this.evento({ tipo: "titolo", titolo })
        return
      }
      case "account/rateLimits/updated":
        this.limite = limiteFinoA(p["rateLimits"])
        return
      case "error":
        if (p["willRetry"] !== true && eOggetto(p["error"])) this.errore = p["error"]
        return
      case "turn/completed":
        return this.fine(eOggetto(p["turn"]) ? p["turn"] : {})
    }
  }

  /** Di un aiutante la chat segue il lavoro e quanto ha usato: il resto di ciò che il suo thread dice non è della conversazione. */
  notificaDelFiglio(thread: string, metodo: string, p: Oggetto): void {
    const figlio = this.figlio(thread)
    switch (metodo) {
      case "turn/started":
        figlio.giro = eOggetto(p["turn"]) ? testo(p["turn"]["id"]) : null
        return
      case "turn/completed":
        figlio.giro = null
        if (eOggetto(p["turn"]) && p["turn"]["status"] === "interrupted") this.concluso(thread)
        return
      case "thread/closed":
        return this.concluso(thread)
      case "item/started":
        if (!eOggetto(p["item"])) return
        figlio.strumenti += chiamateDi(p["item"]).length
        return this.aiutantiDi(p["item"])
      case "item/completed":
        return eOggetto(p["item"]) ? this.aiutantiDi(p["item"]) : undefined
      case "thread/tokenUsage/updated": {
        const totale = eOggetto(p["tokenUsage"]) && eOggetto(p["tokenUsage"]["total"]) ? numero(p["tokenUsage"]["total"]["totalTokens"]) : null
        if (totale !== null && figlio.descrizione !== null && !figlio.finito) this.evento({ tipo: "lavoro", cosa: "uso", id: thread, uso: { token: totale, strumenti: figlio.strumenti } })
      }
    }
  }

  private figlio(thread: string): Figlio {
    const noto = this.figli.get(thread)
    if (noto) return noto
    const nuovo: Figlio = { descrizione: null, daRichiesta: false, sfondo: false, strumenti: 0, giro: null, finito: false }
    this.figli.set(thread, nuovo)
    return nuovo
  }

  /** Le voci che parlano degli aiutanti: lanciarne uno apre il lavoro, le altre chiamate decidono come sta quello che c'è. */
  private aiutantiDi(voce: Oggetto): void {
    if (voce["type"] === "subAgentActivity") {
      const thread = testo(voce["agentThreadId"])
      if (thread === null) return
      if (voce["kind"] === "started") return this.lanciato(thread, null, testo(voce["agentPath"]) ?? "Agent")
      if (voce["kind"] === "completed" || voce["kind"] === "interrupted") return this.concluso(thread)
      this.figlio(thread)
      return
    }
    if (voce["type"] !== "collabAgentToolCall") return
    const [strumento, stato] = [voce["tool"], voce["status"]]
    const ricevitori = testi(voce["receiverThreadIds"])
    if (stato !== "inProgress") {
      for (const [thread, stati] of Object.entries(eOggetto(voce["agentsStates"]) ? voce["agentsStates"] : {})) {
        if (eOggetto(stati) && STATI_FINALI.has(String(stati["status"]))) this.concluso(thread)
      }
      const chiusi = stato === "completed" ? strumento === "closeAgent" || strumento === "interruptAgent" : strumento === "spawnAgent"
      if (chiusi) ricevitori.forEach((thread) => this.concluso(thread))
    }
    if (strumento === "spawnAgent") ricevitori.forEach((thread) => this.lanciato(thread, testo(voce["prompt"]), "Agent"))
  }

  private lanciato(thread: string, prompt: string | null, ripiego: string): void {
    const figlio = this.figlio(thread)
    if (figlio.finito) return
    const richiesta = prompt === null || prompt.trim() === "" ? null : abbrevia(prompt, 80)
    if (figlio.descrizione === null) {
      figlio.descrizione = richiesta ?? ripiego
      figlio.daRichiesta = richiesta !== null
      return this.evento({ tipo: "lavoro", cosa: "iniziato", id: thread, genere: "agente", descrizione: figlio.descrizione, background: false })
    }
    if (richiesta === null || figlio.daRichiesta) return
    figlio.descrizione = richiesta
    figlio.daRichiesta = true
    this.evento({ tipo: "lavoro", cosa: "cambiato", id: thread, descrizione: richiesta })
  }

  private concluso(thread: string): void {
    const figlio = this.figlio(thread)
    if (figlio.finito) return
    figlio.finito = true
    if (figlio.descrizione !== null) this.evento({ tipo: "lavoro", cosa: "finito", id: thread })
  }

  private pezzo(tipo: "testo" | "pensiero", voce: string, parte: string, pezzo: unknown): void {
    if (typeof pezzo !== "string" || pezzo === "") return
    this.aPezzi.add(voce)
    this.evento({ tipo, voce: parte, pezzo })
  }

  private iniziata(voce: Oggetto): void {
    for (const { id, nome, ingresso } of chiamateDi(voce)) {
      this.aperti.add(id)
      this.evento({ tipo: "strumento", id, nome, ingresso })
    }
    this.aiutantiDi(voce)
    if (voce["type"] !== "commandExecution") return
    const id = String(voce["id"])
    this.comandi.set(id, testo(voce["processId"]))
    this.descrizioni.set(id, comandoDi(voce))
  }

  private finita(voce: Oggetto): void {
    const id = String(voce["id"])
    this.aiutantiDi(voce)
    switch (voce["type"]) {
      case "agentMessage":
      case "plan": {
        const intero = testo(voce["text"])
        if (intero && !this.aPezzi.has(id)) this.evento({ tipo: "testo", voce: id, pezzo: intero })
        return
      }
      case "reasoning": {
        const pensiero = pensieroDi(voce)
        if (pensiero && !this.aPezzi.has(id)) this.evento({ tipo: "pensiero", voce: id, pezzo: pensiero })
        return
      }
      case "exitedReviewMode": {
        const revisione = testo(voce["review"])
        if (revisione) this.evento({ tipo: "testo", voce: id, pezzo: revisione })
        return
      }
      case "contextCompaction":
        return this.riassumi()
      case "commandExecution":
        this.finisciIlComando(id)
    }
    const esito = esitoDi(voce)
    if (esito === null) return
    // Una modifica a più file ha un esito solo: vale per ognuno.
    for (const chiamata of chiamateDi(voce)) {
      this.aperti.delete(chiamata.id)
      // L'esito di uno strumento di un giro già finito (un comando fermato, che Codex chiude dopo) non riapre il giro.
      if (!this.lasciati.delete(chiamata.id)) this.evento({ tipo: "esito", id: chiamata.id, esito })
    }
  }

  private finisciIlComando(voce: string): void {
    this.comandi.delete(voce)
    this.descrizioni.delete(voce)
    this.sfondo.delete(voce)
    this.fermati.delete(voce)
    if (this.mostrati.delete(voce)) this.evento({ tipo: "lavoro", cosa: "finito", id: voce })
  }

  /** Ogni aggiornamento del piano è un elenco dei passi nuovo, come quello che scrive Claude Code. */
  private piano(p: Oggetto): void {
    const id = `piano:${String(p["turnId"])}:${this.piani++}`
    const stati: Record<string, string> = { pending: "pending", inProgress: "in_progress", completed: "completed" }
    const todos = oggetti(p["plan"]).map((passo) => ({ content: testo(passo["step"]) ?? "", activeForm: testo(passo["step"]) ?? "", status: stati[String(passo["status"])] ?? "pending" }))
    this.evento({ tipo: "strumento", id, nome: "TodoWrite", ingresso: { todos } })
    this.evento({ tipo: "esito", id, esito: { testo: "", errore: false, immagini: [] } })
  }

  /** Codex lo dice con una notifica e con una voce: per la chat è un riassunto solo. */
  private riassumi(): void {
    if (this.riassunto) return
    this.riassunto = true
    this.usati = null
    this.evento({ tipo: "riassunto" })
  }

  private fine(giro: Oggetto): void {
    // Un giro finito da solo lascia accesi i comandi che non ha chiuso: da qui sono lavori in background. Quelli di un giro
    // fermato no: il loro processo resta da chiudere.
    for (const voce of [...this.comandi.keys()].filter((v) => !this.mostrati.has(v) && !this.fermati.has(v))) {
      if (giro["status"] === "interrupted") {
        this.fermati.add(voce)
        continue
      }
      this.mostrati.add(voce)
      this.sfondo.add(voce)
      this.evento({ tipo: "lavoro", cosa: "iniziato", id: voce, genere: "comando", descrizione: this.descrizioni.get(voce) ?? "", background: true })
    }
    for (const [thread, figlio] of this.figli) {
      if (figlio.descrizione === null || figlio.finito || figlio.sfondo) continue
      figlio.sfondo = true
      this.evento({ tipo: "lavoro", cosa: "cambiato", id: thread, background: true })
    }
    for (const id of this.aperti) this.lasciati.add(id)
    this.aperti.clear()
    const errore = this.erroreDelGiro(giro)
    this.giro = null
    this.errore = null
    this.evento({ tipo: "fine", errore, durata_ms: numero(giro["durationMs"]) ?? 0, inCoda: 0 })
  }

  private erroreDelGiro(giro: Oggetto): ErroreDelGiro | null {
    if (giro["status"] === "completed") return null
    if (giro["status"] === "interrupted") return { codice: "fermato", causa: "" }
    const errore = eOggetto(giro["error"]) ? giro["error"] : this.errore
    const messaggio = (errore && testo(errore["message"])) ?? ""
    const nome = errore ? nomeDellErrore(errore["codexErrorInfo"]) : null
    if (nome === "usageLimitExceeded") return { codice: "limite", finoA: this.limite }
    if (nome === "serverOverloaded" || nome === "rateLimitExceeded") return { codice: "sovraccarico" }
    if (nome === "unauthorized") return { codice: "non_collegato" }
    if (nome !== null && NON_HA_RISPOSTO.has(nome)) return { codice: "non_risposto", dettaglio: messaggio || nome }
    return { codice: "errore", causa: messaggio }
  }
}

const quandoDi = (ms: unknown): { quando?: string } => (typeof ms === "number" ? { quando: new Date(ms).toISOString() } : {})

/** Il testo che il creator ha scritto in una voce `userMessage`: una skill chiamata con la barra torna com'era scritta, non col nome che Codex le dà. */
function testoDelCreator(voce: Oggetto): string {
  const contenuto = oggetti(voce["content"])
  const scritto = contenuto.flatMap((c) => (c["type"] === "text" ? (testo(c["text"]) ?? []) : [])).join("\n")
  const skill = contenuto.flatMap((c) => (c["type"] === "skill" ? (testo(c["name"]) ?? []) : []))[0]
  return skill !== undefined && scritto.startsWith(`$${skill}`) ? `/${skill.slice(skill.lastIndexOf(":") + 1)}${scritto.slice(skill.length + 1)}` : scritto
}

/** Un thread riletto (`thread/read` coi giri) come righe della chat, e i testi che il creator vi ha scritto. */
export function righeDelThread(thread: Oggetto, archivio: string): { righe: RigaLetta[]; testiDelCreator: string[] } {
  const righe: RigaLetta[] = []
  const testiDelCreator: string[] = []
  for (const voce of oggetti(thread["turns"]).flatMap((giro) => oggetti(giro["items"]))) {
    const id = String(voce["id"])
    const inizio = quandoDi(voce["startedAtMs"])
    switch (voce["type"]) {
      case "userMessage": {
        const scritto = testoDelCreator(voce)
        testiDelCreator.push(scritto)
        righe.push({ tipo: "creator", id, ...inizio, parti: partiDelTestoDelCreator(scritto, archivio) })
        continue
      }
      case "agentMessage":
      case "plan": {
        const scritto = testo(voce["text"])
        if (scritto) righe.push({ tipo: "motore", id, ...inizio, parti: [{ tipo: "testo", testo: scritto }] })
        continue
      }
      case "enteredReviewMode":
        righe.push({ tipo: "creator", id, ...inizio, parti: partiDelTestoDelCreator("/review", archivio) })
        continue
      case "exitedReviewMode": {
        const revisione = testo(voce["review"])
        if (revisione) righe.push({ tipo: "motore", id, ...inizio, parti: [{ tipo: "testo", testo: revisione }] })
        continue
      }
      case "reasoning": {
        const pensiero = pensieroDi(voce)
        if (pensiero) righe.push({ tipo: "motore", id, ...inizio, parti: [{ tipo: "pensiero", testo: pensiero }] })
        continue
      }
      case "contextCompaction":
        righe.push({ tipo: "riassunto" })
        continue
    }
    const chiamate = chiamateDi(voce)
    if (chiamate.length === 0) continue
    righe.push({ tipo: "motore", id, ...inizio, parti: chiamate.map((c): Parte => ({ tipo: "strumento", id: c.id, nome: c.nome, ingresso: c.ingresso, ...(inizio.quando === undefined ? {} : { iniziato: inizio.quando }) })) })
    const esito = voce["status"] === "inProgress" ? null : esitoDi(voce)
    if (esito !== null) righe.push({ tipo: "esiti", ...quandoDi(voce["completedAtMs"]), esiti: chiamate.map((c) => ({ id: c.id, esito })) })
  }
  return { righe, testiDelCreator }
}
