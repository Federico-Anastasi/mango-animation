// Claude Code come motore della chat: il `query` dell'Agent SDK in streaming, tradotto negli eventi del prodotto.
import type { CanUseTool, EffortLevel, Options, PermissionResult, SDKMessage } from "@anthropic-ai/claude-agent-sdk"
import { eOggetto } from "../../disco"
import { frase } from "../../lingua"
import type { ComandoChat } from "../comandi"
import { serverVideo } from "../metodo"
import { istruzioniDellApp, type Apertura, type CapacitaDelMotore, type ConversazioneLetta, type ErroreDelGiro, type MessaggioPerIlMotore, type Motore, type NomiDelMotore, type RispostaAlMotore, type SessioneMotore } from "../motore"
import { MODELLO_PREDEFINITO, type ContestoUsato, type DomandaChat, type LivelloEffort, type ModelloChat, type TaskChat, type VoceSessione } from "../tipi"
import { abbrevia, fraseDi, type Oggetto } from "../traduzione"
import { blocchiDi, contestoDaUsage, esitoDelRisultato, risultatiDegliStrumenti, uscitaLocale } from "./blocchi"
import { rifiutaIlComandoDelloStudio, traduciComandi } from "./comandi"
import { IngressoDiMessaggi } from "./ingresso"
import { LetturaDiClaudeCode } from "./lettura"
import { aperturaDelMetodo } from "./metodo"
import { modelloGrande, traduciModelli } from "./modelli"
import type { FunzioneQuery, QueryChat, Sessioni } from "./query"
import { contestoDaSessione, eDelPrimoGiro, messaggiDaSessione } from "./storico"

const DOMANDA = "AskUserQuestion"
const DOMANDA_STORTA = frase("La domanda non è scritta bene: servono da 1 a 4 domande, ciascuna con le sue opzioni.", "The question is not well formed: it needs 1 to 4 questions, each with its options.")

const NOMI: NomiDelMotore = { programma: "Claude Code", servizio: "Claude", menu: "Claude", comando: "claude", nelleFrasi: null }

const CAPACITA: CapacitaDelMotore = {
  effort: true,
  comandi: true,
  fermaLavoro: true,
  inBackground: true,
  immaginiNegliEsiti: true,
  controlloRemoto: true,
  sottoagenti: true,
  browser: true,
  strumentoDelleDomande: true,
}

/** Gli errori che l'API di Claude dà a un messaggio, nei codici del prodotto. */
const ERRORI_DEL_SERVIZIO: Record<string, Exclude<ErroreDelGiro["codice"], "limite" | "non_risposto" | "fermato" | "errore">> = {
  authentication_failed: "non_collegato",
  overloaded: "sovraccarico",
  billing_error: "pagamento",
  account_on_hold: "sospeso",
  oauth_org_not_allowed: "organizzazione",
  verification_required: "verifica",
  max_output_tokens: "risposta_troppo_lunga",
}

/** I livelli che la chat passa a Claude Code sono già controllati contro quelli che l'SDK dichiara per il modello. */
const livelloDellSdk = (effort: LivelloEffort): EffortLevel => effort as EffortLevel

const GENERI: Record<string, TaskChat["tipo"]> = { local_bash: "comando", local_agent: "agente" }
const genereDi = (tipo: string | undefined): TaskChat["tipo"] => (tipo === undefined ? "altro" : (GENERI[tipo] ?? "altro"))

/** Un lavoro di servizio, o di un sottoagente, non è ciò che il creator guarda. */
const daMostrare = (m: { ambient?: boolean; skip_transcript?: boolean; parent_task_id?: string }): boolean => m.ambient !== true && m.skip_transcript !== true && m.parent_task_id === undefined

const FINITI = new Set(["completed", "failed", "killed"])

function domandeDa(ingresso: Oggetto): DomandaChat[] | null {
  const domande = ingresso["questions"]
  if (!Array.isArray(domande) || domande.length === 0) return null
  const lette = domande.map((d): DomandaChat | null => {
    if (!eOggetto(d) || typeof d["question"] !== "string" || !Array.isArray(d["options"])) return null
    const opzioni = d["options"].flatMap((o) => (eOggetto(o) && typeof o["label"] === "string" ? [{ etichetta: o["label"], descrizione: typeof o["description"] === "string" ? o["description"] : "" }] : []))
    return { domanda: d["question"], intestazione: typeof d["header"] === "string" ? d["header"] : "", opzioni, multipla: d["multiSelect"] === true }
  })
  return lette.every((d): d is DomandaChat => d !== null) ? lette : null
}

/** Il titolo che Claude Code dà alla conversazione con `/rename`; l'SDK non lo dichiara fra i suoi messaggi. */
function titoloDato(m: unknown): string | null {
  return eOggetto(m) && m["subtype"] === "session_title_changed" && typeof m["title"] === "string" ? m["title"] : null
}

class SessioneDiClaudeCode implements SessioneMotore {
  readonly finita: Promise<void>
  private readonly ingresso = new IngressoDiMessaggi()
  private readonly query: QueryChat
  /** Quanti messaggi dell'API sono cominciati a pezzi, e quanti sono arrivati interi: con l'indice del blocco fanno la voce di ogni pezzo. */
  private messaggi = 0
  private interi = 0
  private readonly arrivatiAPezzi = new Set<string>()
  /** Lo strumento di ogni blocco del messaggio che sta arrivando a pezzi, e il suo ingresso scritto finora. */
  private readonly strumenti = new Map<number, string>()
  private readonly jsonParziali = new Map<number, string>()
  private erroreDelServizio: string | null = null
  /** Quando Claude Code ha detto che il limite si libera (secondi dal 1970), dall'ultimo avviso di limite raggiunto. */
  private limiteFinoA: number | null = null

  constructor(
    query: FunzioneQuery,
    private readonly a: Apertura,
  ) {
    const opzioni: Options = {
      cwd: a.lavoro,
      ...aperturaDelMetodo(a.codice, a.lavoro),
      settingSources: ["user", "project", "local"],
      // Lo stesso prompt di Claude Code nel terminale, più ciò che cambia nell'app.
      systemPrompt: { type: "preset", preset: "claude_code", append: istruzioniDellApp({ immaginiNegliEsiti: true, strumentoDelleDomande: DOMANDA }) },
      includePartialMessages: true,
      // Claude Code lavora in autonomia, come `--dangerously-skip-permissions` (`docs/CHAT.md`, «I permessi»).
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      canUseTool: this.chiedi,
      // Claude in Chrome (come `--chrome`).
      extraArgs: { chrome: null },
      ...(a.modello !== null && a.modello !== MODELLO_PREDEFINITO ? { model: a.modello } : {}),
      ...(a.effort !== null ? { effort: livelloDellSdk(a.effort) } : {}),
      mcpServers: serverVideo(a.codice, a.lavoro, { id: a.id, capacita: CAPACITA }),
      ...(a.esiste ? { resume: a.id } : { sessionId: a.id }),
    }
    this.query = query({ prompt: this.ingresso, options: opzioni })
    this.finita = this.leggi()
  }

  private async leggi(): Promise<void> {
    for await (const messaggio of this.query) this.ricevi(messaggio)
  }

  private ricevi(m: SDKMessage): void {
    if (m.type === "conversation_reset") {
      console.error(`chat: Claude Code ha azzerato la conversazione ${this.a.id} (${m.trigger ?? "senza dire perché"}): la chat non lo segue.`)
      return
    }
    if (m.type === "result") return this.fine(m)
    if (m.type === "system") return this.diSistema(m)
    const delGiro = m.type === "stream_event" || m.type === "assistant" || m.type === "user"
    if (delGiro && "parent_tool_use_id" in m && m.parent_tool_use_id) return
    // I token di una risposta (il messaggio intero o il conto che arriva coi pezzi) dicono quanto contesto è occupato.
    const usati = contestoDaUsage(m.type === "assistant" ? m.message.usage : m.type === "stream_event" && m.event.type === "message_delta" ? m.event.usage : undefined)
    if (usati !== null) this.a.evento({ tipo: "contesto", usati })
    // Il conto dei token non porta testo: arriva anche a giro finito, e non lo riapre.
    if (m.type === "stream_event" && m.event.type === "message_delta") return
    if (delGiro) this.a.evento({ tipo: "attivo" })
    switch (m.type) {
      case "stream_event":
        return this.aPezzi(m.event)
      case "assistant":
        return this.completo(m.message, m.error)
      case "user":
        return this.esiti(m.message)
      case "rate_limit_event":
        if (m.rate_limit_info.status === "rejected") this.limiteFinoA = m.rate_limit_info.resetsAt ?? null
    }
  }

  private diSistema(m: Extract<SDKMessage, { type: "system" }>): void {
    if (m.subtype === "init") return this.a.evento({ tipo: "avvio", modello: m.model, effort: m.effort ?? null })
    if (m.subtype === "compact_boundary") this.a.evento({ tipo: "riassunto" })
    if (m.subtype === "commands_changed") this.a.evento({ tipo: "comandi", comandi: traduciComandi(m.commands) })
    const titolo = titoloDato(m)
    if (titolo !== null) this.a.evento({ tipo: "titolo", titolo })
    switch (m.subtype) {
      case "task_started":
        if (daMostrare(m)) this.a.evento({ tipo: "lavoro", cosa: "iniziato", id: m.task_id, genere: genereDi(m.task_type), descrizione: m.description, background: m.is_backgrounded ?? true })
        return
      case "task_updated":
        if (FINITI.has(m.patch.status ?? "")) return this.a.evento({ tipo: "lavoro", cosa: "finito", id: m.task_id })
        return this.a.evento({
          tipo: "lavoro",
          cosa: "cambiato",
          id: m.task_id,
          ...(m.patch.is_backgrounded === undefined ? {} : { background: m.patch.is_backgrounded }),
          ...(m.patch.description === undefined ? {} : { descrizione: m.patch.description }),
        })
      case "task_progress":
        return this.a.evento({ tipo: "lavoro", cosa: "uso", id: m.task_id, uso: { token: m.usage.total_tokens, strumenti: m.usage.tool_uses } })
      case "task_notification":
        return this.a.evento({ tipo: "lavoro", cosa: "finito", id: m.task_id })
      case "background_tasks_changed":
        return this.a.evento({ tipo: "lavoro", cosa: "in_background", lavori: m.tasks.filter(daMostrare).map((t) => ({ id: t.task_id, genere: genereDi(t.task_type), descrizione: t.description })) })
    }
  }

  private aPezzi(evento: unknown): void {
    if (!eOggetto(evento)) return
    const indice = typeof evento["index"] === "number" ? evento["index"] : -1
    switch (evento["type"]) {
      case "message_start": {
        const id = eOggetto(evento["message"]) ? evento["message"]["id"] : undefined
        if (typeof id === "string") this.arrivatiAPezzi.add(id)
        this.messaggi++
        this.strumenti.clear()
        this.jsonParziali.clear()
        return
      }
      case "content_block_start": {
        const blocco = evento["content_block"]
        if (!eOggetto(blocco) || blocco["type"] !== "tool_use") return
        if (this.strumento(blocco)) this.strumenti.set(indice, String(blocco["id"]))
        return
      }
      case "content_block_delta":
        return this.pezzoDelBlocco(indice, evento["delta"])
      case "content_block_stop": {
        const json = this.jsonParziali.get(indice)
        const id = this.strumenti.get(indice)
        if (json === undefined || id === undefined) return
        let ingresso: unknown
        try {
          ingresso = JSON.parse(json)
        } catch {
          // Un ingresso troncato non si legge: lo strumento non parte, e la Parte resta con l'ingresso vuoto.
          return
        }
        this.a.evento({ tipo: "ingresso", id, ingresso })
      }
    }
  }

  /** `false` se il blocco non ha né identificativo né nome: non è uno strumento che la chat può mostrare. */
  private strumento(blocco: Oggetto): boolean {
    const { id, name, input } = blocco
    if (typeof id !== "string" || typeof name !== "string") return false
    this.a.evento({ tipo: "strumento", id, nome: name, ingresso: input ?? {} })
    return true
  }

  private pezzoDelBlocco(indice: number, delta: unknown): void {
    if (!eOggetto(delta)) return
    if (delta["type"] === "input_json_delta" && typeof delta["partial_json"] === "string") {
      this.jsonParziali.set(indice, (this.jsonParziali.get(indice) ?? "") + delta["partial_json"])
      return
    }
    const tipo = delta["type"] === "text_delta" ? "testo" : delta["type"] === "thinking_delta" ? "pensiero" : null
    const pezzo = delta["type"] === "text_delta" ? delta["text"] : delta["thinking"]
    if (tipo === null || typeof pezzo !== "string") return
    this.a.evento({ tipo, voce: `${this.messaggi}:${indice}`, pezzo })
  }

  /** Il messaggio completo di Claude: ciò che è già arrivato a pezzi c'è, il resto (nessun pezzo emesso) si dà ora. */
  private completo(messaggio: unknown, errore: string | undefined): void {
    if (errore) this.erroreDelServizio = errore
    if (!eOggetto(messaggio)) return
    const id = messaggio["id"]
    if (typeof id === "string" && this.arrivatiAPezzi.has(id)) return
    this.interi++
    blocchiDi(messaggio["content"]).forEach((b, indice) => {
      if (b["type"] === "text" && typeof b["text"] === "string") this.a.evento({ tipo: "testo", voce: `intero ${this.interi}:${indice}`, pezzo: b["text"] })
      if (b["type"] === "thinking" && typeof b["thinking"] === "string") this.a.evento({ tipo: "pensiero", voce: `intero ${this.interi}:${indice}`, pezzo: b["thinking"] })
      if (b["type"] === "tool_use") this.strumento(b)
    })
  }

  private esiti(messaggio: unknown): void {
    if (!eOggetto(messaggio)) return
    const uscita = typeof messaggio["content"] === "string" ? uscitaLocale(messaggio["content"]) : null
    if (uscita) this.a.evento({ tipo: "uscita", testo: uscita })
    for (const risultato of risultatiDegliStrumenti(messaggio["content"])) this.a.evento({ tipo: "esito", id: String(risultato["tool_use_id"]), esito: esitoDelRisultato(risultato) })
  }

  private fine(risultato: Oggetto): void {
    const errore = this.erroreDelGiro(risultato)
    const costo = risultato["total_cost_usd"]
    const durata = risultato["duration_ms"]
    const inCoda = risultato["queued_turn_count"]
    this.erroreDelServizio = null
    this.limiteFinoA = null
    this.a.evento({ tipo: "fine", errore, ...(typeof costo === "number" ? { costo } : {}), durata_ms: typeof durata === "number" ? durata : 0, inCoda: typeof inCoda === "number" ? inCoda : 0 })
  }

  private erroreDelGiro(risultato: Oggetto): ErroreDelGiro | null {
    if (risultato["subtype"] === "success" && risultato["is_error"] !== true) return null
    if (this.erroreDelServizio === "rate_limit") return { codice: "limite", finoA: this.limiteFinoA }
    if (this.erroreDelServizio) {
      const codice = ERRORI_DEL_SERVIZIO[this.erroreDelServizio]
      return codice ? { codice } : { codice: "non_risposto", dettaglio: this.erroreDelServizio }
    }
    const dettagli = Array.isArray(risultato["errors"]) ? risultato["errors"].filter((e): e is string => typeof e === "string").join(" · ") : ""
    const motivo = typeof risultato["result"] === "string" ? risultato["result"] : ""
    const causa = dettagli || motivo
    switch (risultato["subtype"]) {
      case "error_max_turns":
        return { codice: "troppi_passaggi" }
      case "error_max_budget_usd":
        return { codice: "limite_di_spesa" }
      case "success":
        return { codice: "fermato", causa }
      default:
        return { codice: "errore", causa }
    }
  }

  private readonly chiedi: CanUseTool = async (strumento, ingresso, opzioni) => {
    if (strumento !== DOMANDA) return this.risposta(ingresso, await this.a.chiedi({ tipo: "permesso", id: opzioni.toolUseID, strumento, ingresso }, opzioni.signal))
    const domande = domandeDa(ingresso)
    if (domande === null) return { behavior: "deny", message: DOMANDA_STORTA.in(this.a.lingua()) }
    return this.risposta(ingresso, await this.a.chiedi({ tipo: "domanda", id: opzioni.toolUseID, domande }, opzioni.signal))
  }

  private risposta(ingresso: Oggetto, risposta: RispostaAlMotore): PermissionResult {
    if (!risposta.consente) return { behavior: "deny", message: risposta.motivo, ...(risposta.ferma ? { interrupt: true } : {}) }
    return { behavior: "allow", updatedInput: risposta.risposte ? { ...ingresso, answers: risposta.risposte } : ingresso }
  }

  scrivi = (messaggio: MessaggioPerIlMotore): void => {
    const contenuto =
      messaggio.immagini.length === 0
        ? messaggio.testo
        : [...messaggio.immagini.map((i) => ({ type: "image" as const, source: { type: "base64" as const, media_type: i.tipo, data: i.dati } })), { type: "text" as const, text: messaggio.testo }]
    this.ingresso.metti({ type: "user", message: { role: "user", content: contenuto }, parent_tool_use_id: null })
  }

  ferma = async (): Promise<void> => {
    await this.query.interrupt()
  }

  chiudi = (): void => {
    this.ingresso.chiudi()
    this.query.close()
  }

  cambiaModello = (modello: string): Promise<void> => this.query.setModel(modello === MODELLO_PREDEFINITO ? undefined : modello)

  cambiaEffort = (effort: LivelloEffort | null): Promise<void> => this.query.applyFlagSettings({ effortLevel: effort === null ? null : livelloDellSdk(effort) })

  fermaLavoro = (id: string): Promise<void> => this.query.stopTask(id)

  inBackground = async (): Promise<void> => {
    await this.query.backgroundTasks()
  }

  /** La misura con la finestra del modello: è quella che Claude Code usa per decidere quando riassumere. */
  misuraIlContesto = async (): Promise<ContestoUsato | null> => {
    const m = await this.query.getContextUsage({ detail: "summary" })
    return m.totalTokens > 0 ? { usati: m.totalTokens, totale: m.rawMaxTokens > 0 ? m.rawMaxTokens : null } : null
  }

  /**
   * Come una chat aperta nel terminale con il controllo remoto: la conversazione compare nell'app di Claude e si continua da lì.
   * Lo apre Claude Code con il suo login: da qui non passa nessun accesso, e l'indirizzo della sessione che risponde non si tiene né
   * si scrive. Una conversazione ripresa si riaggancia da sé alla sua sessione.
   */
  collega = (nome: string): void => {
    if (!this.query.enableRemoteControl) {
      console.error(`chat: l'SDK installato non sa collegare la conversazione ${this.a.id} all'app di Claude.`)
      return
    }
    this.query.enableRemoteControl(true, nome).catch((errore: unknown) => console.error(`chat: la conversazione ${this.a.id} non è collegata all'app di Claude: ${abbrevia(fraseDi(errore), 300)}`))
  }
}

/** Claude Code per la chat: la `query` dell'Agent SDK e le conversazioni che Claude Code tiene nei suoi file. */
export class ClaudeCode implements Motore {
  readonly id = "claude-code"
  readonly nomi = NOMI
  readonly prefisso = null
  readonly capacita = CAPACITA
  private readonly lettura: LetturaDiClaudeCode

  constructor(
    private readonly query: FunzioneQuery,
    private readonly sessioni: Sessioni,
  ) {
    this.lettura = new LetturaDiClaudeCode(query)
  }

  /** Pronto se ha dato l'elenco dei suoi modelli. */
  pronto = (lavoro: string): Promise<boolean> =>
    this.lettura.leggi(lavoro).then(
      () => true,
      () => false,
    )

  apri = (apertura: Apertura): SessioneMotore => new SessioneDiClaudeCode(this.query, apertura)

  modelli = async (lavoro: string): Promise<ModelloChat[]> => traduciModelli((await this.lettura.leggi(lavoro)).modelli, this.id)

  comandi = async (lavoro: string): Promise<ComandoChat[]> => traduciComandi((await this.lettura.leggi(lavoro)).comandi)

  modelloGrande = modelloGrande

  controllaIlComando = rifiutaIlComandoDelloStudio

  elenca = (): Promise<VoceSessione[]> => this.sessioni.elenca()

  osservaConversazioni = (alCambio: (id: string) => void): Promise<{ chiudi: () => void }> => this.sessioni.osserva(alCambio)

  leggi: Motore["leggi"] = async (id, dove): Promise<ConversazioneLetta | null> => {
    const righe = await this.sessioni.leggi(id)
    if (righe === null) return null
    const usati = contestoDaSessione(righe)
    // La finestra la dà solo Claude Code acceso, a fine giro.
    return { messaggi: messaggiDaSessione(righe, dove.archivio, dove.lingua), contestoUsato: usati === null ? null : { usati, totale: null }, primoGiro: eDelPrimoGiro(righe) }
  }
}
