// I messaggi di una conversazione e la traduzione dei messaggi che l'SDK emette in Parti. Un messaggio di Claude è un giro intero:
// tutto ciò che Claude fa fra un messaggio del creator e il risultato; ogni cambio di una Parte è un evento.
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk"
import { conEsito, eOggetto, parteStrumento, partiDeiBlocchi, risultatiDegliStrumenti, uscitaLocale, type Oggetto } from "./traduzione"
import type { DatiEventoChat, MessaggioChat, Parte } from "./tipi"

export interface FineDelGiro {
  /** I messaggi del creator già in coda che avranno un altro giro. */
  inCoda: number
}

const ERRORI_DI_CLAUDE: Record<string, string> = {
  authentication_failed: "Claude Code non è collegato all'account: apri un terminale, lancia «claude» e fai «/login».",
  rate_limit: "Hai finito i messaggi che l'abbonamento permette per ora: riprova più tardi.",
  overloaded: "Claude è sovraccarico in questo momento: riprova fra poco.",
  billing_error: "L'account di Claude ha un problema di pagamento: controllalo da un terminale con «claude».",
  account_on_hold: "L'account di Claude è sospeso: controllalo da un terminale con «claude».",
  oauth_org_not_allowed: "L'organizzazione di questo account non può usare Claude Code.",
  verification_required: "L'account di Claude chiede una verifica: aprila da un terminale con «claude».",
  max_output_tokens: "La risposta era troppo lunga e si è fermata: chiedi di continuare.",
}

/** La frase in italiano di un giro finito male. */
function fraseDelGiro(risultato: Oggetto, erroreDiClaude: string | null, nome: string | null): string | undefined {
  if (risultato["subtype"] === "success" && risultato["is_error"] !== true) return undefined
  if (erroreDiClaude) return ERRORI_DI_CLAUDE[erroreDiClaude] ?? `Claude non ha risposto (${erroreDiClaude}).`
  const dettagli = Array.isArray(risultato["errors"]) ? risultato["errors"].filter((e): e is string => typeof e === "string").join(" · ") : ""
  const motivo = typeof risultato["result"] === "string" ? risultato["result"] : ""
  const causa = (dettagli || motivo).trim().replace(/[.\s]+$/, "")
  const fermato = nome ? `${nome} si è fermato` : "Si è fermato"
  switch (risultato["subtype"]) {
    case "error_max_turns":
      return `${fermato}: ha fatto troppi passaggi in un solo giro. Scrivi «continua» per andare avanti.`
    case "error_max_budget_usd":
      return `${fermato}: ha raggiunto il limite di spesa del giro.`
    case "success":
      return `${fermato}: ${causa || "senza dire altro"}.`
    default:
      return `${fermato}${causa ? `: ${causa}` : " con un errore"}.`
  }
}

/**
 * Il lavoro dei giri nei messaggi: quello misurato nella Parte `fine` (`lavoro_ms`, o la durata se manca) o,
 * per un giro letto da una sessione che non lo dice, dal messaggio del creator all'ultima cosa di Claude. Con `ultimoInCorso` l'ultimo
 * giro senza `fine` non si stima: lo conta chi lo sta misurando.
 */
export function lavoroDeiGiri(messaggi: MessaggioChat[], ultimoInCorso: boolean): number {
  let totale = 0
  let inizio: number | null = null
  let ultimo: number | null = null
  let misurato: number | null = null
  const chiudi = (stima: boolean) => {
    if (misurato !== null) totale += misurato
    else if (stima && inizio !== null && ultimo !== null && ultimo > inizio) totale += ultimo - inizio
  }
  for (const m of messaggi) {
    const quando = Date.parse(m.quando)
    if (m.ruolo === "utente") {
      chiudi(true)
      inizio = Number.isNaN(quando) ? null : quando
      ultimo = null
      misurato = null
      continue
    }
    for (const istante of [quando, ...m.parti.flatMap((p) => (p.tipo === "strumento" ? [Date.parse(p.iniziato ?? ""), Date.parse(p.finito ?? "")] : []))]) {
      if (!Number.isNaN(istante)) ultimo = Math.max(ultimo ?? istante, istante)
    }
    for (const p of m.parti) if (p.tipo === "fine") misurato = (misurato ?? 0) + (p.lavoro_ms ?? p.durata_ms)
  }
  chiudi(!ultimoInCorso)
  return totale
}

export class Trascrizione {
  /** Il messaggio di Claude dove vanno le Parti nuove. */
  private corrente: MessaggioChat | null = null
  /** L'ultimo messaggio di Claude del giro in corso: ci finisce la Parte `fine`, anche se il creator ha scritto sotto nel frattempo. */
  private delGiro: MessaggioChat | null = null
  private progressivo: number
  /** Dove sta, nel messaggio, la Parte di ogni blocco del messaggio dell'API che sta arrivando a pezzi (per l'indice del blocco). */
  private readonly blocchi = new Map<number, number>()
  private readonly jsonParziali = new Map<number, string>()
  private readonly arrivatiAPezzi = new Set<string>()
  private readonly strumenti = new Map<string, { messaggio: MessaggioChat; indice: number }>()
  private erroreDiClaude: string | null = null
  /** Il creator ha fermato il giro: il risultato che segue non è un errore. */
  fermata = false

  constructor(
    readonly messaggi: MessaggioChat[],
    private readonly emetti: (dati: DatiEventoChat) => void,
    private readonly adesso: () => Date,
    /** Come il motore si chiama nelle frasi per il creator. */
    private readonly nome: string | null,
    /** Il lavoro del giro che finisce, senza le attese del creator: chi lo misura ricomincia da zero. */
    private readonly chiudiIlLavoro: () => number,
  ) {
    this.progressivo = messaggi.length
  }

  private nuovoMessaggio(ruolo: MessaggioChat["ruolo"], parti: Parte[]): MessaggioChat {
    const messaggio: MessaggioChat = { id: `m${++this.progressivo}`, ruolo, quando: this.adesso().toISOString(), parti: [] }
    this.messaggi.push(messaggio)
    this.emetti({ evento: "messaggio", messaggio: { ...messaggio, parti: [] } })
    parti.forEach((parte) => this.aggiungi(messaggio, parte))
    return messaggio
  }

  private aggiungi(messaggio: MessaggioChat, parte: Parte): number {
    const indice = messaggio.parti.push(parte) - 1
    this.emetti({ evento: "parte", messaggio: messaggio.id, indice, parte })
    if (parte.tipo === "strumento") this.strumenti.set(parte.id, { messaggio, indice })
    return indice
  }

  private sostituisci(messaggio: MessaggioChat, indice: number, parte: Parte): void {
    messaggio.parti[indice] = parte
    this.emetti({ evento: "parte", messaggio: messaggio.id, indice, parte })
  }

  private aggiungiAlGiro(parte: Parte): { messaggio: MessaggioChat; indice: number } {
    this.corrente ??= this.nuovoMessaggio("claude", [])
    this.delGiro = this.corrente
    return { messaggio: this.corrente, indice: this.aggiungi(this.corrente, parte) }
  }

  /** Il messaggio del creator; quello che Claude sta scrivendo si chiude lì, e ciò che segue è un messaggio nuovo sotto. */
  aggiungiMessaggioDelCreator(parti: Parte[]): MessaggioChat {
    this.corrente = null
    return this.nuovoMessaggio("utente", parti)
  }

  /** Un errore che non viene da Claude (il processo si è chiuso): finisce il giro con la sua frase. */
  finisciConErrore(frase: string): void {
    this.chiudiGiro({ tipo: "fine", durata_ms: 0, lavoro_ms: this.chiudiIlLavoro(), errore: frase })
  }

  private chiudiGiro(parte: Parte): void {
    this.aggiungi(this.delGiro ?? this.nuovoMessaggio("claude", []), parte)
    this.corrente = null
    this.delGiro = null
  }

  applica(m: SDKMessage): FineDelGiro | null {
    if ("parent_tool_use_id" in m && m.parent_tool_use_id) return null
    switch (m.type) {
      case "stream_event":
        this.aPezzi(m.event)
        return null
      case "assistant":
        this.completo(m.message, m.error)
        return null
      case "user":
        this.esiti(m.message)
        return null
      case "result":
        return this.fine(m)
      default:
        return null
    }
  }

  private aPezzi(evento: unknown): void {
    if (!eOggetto(evento)) return
    const indiceBlocco = typeof evento["index"] === "number" ? evento["index"] : -1
    switch (evento["type"]) {
      case "message_start": {
        const id = eOggetto(evento["message"]) ? evento["message"]["id"] : undefined
        if (typeof id === "string") this.arrivatiAPezzi.add(id)
        this.blocchi.clear()
        this.jsonParziali.clear()
        return
      }
      case "content_block_start": {
        const blocco = evento["content_block"]
        if (!eOggetto(blocco) || blocco["type"] !== "tool_use") return
        const parte = parteStrumento(blocco, this.adesso().toISOString())
        if (parte) this.blocchi.set(indiceBlocco, this.aggiungiAlGiro(parte).indice)
        return
      }
      case "content_block_delta":
        return this.pezzoDelBlocco(indiceBlocco, evento["delta"])
      case "content_block_stop": {
        const json = this.jsonParziali.get(indiceBlocco)
        const indice = this.blocchi.get(indiceBlocco)
        const parte = this.corrente && indice !== undefined ? this.corrente.parti[indice] : undefined
        if (json === undefined || !this.corrente || parte?.tipo !== "strumento") return
        try {
          this.sostituisci(this.corrente, indice ?? 0, { ...parte, ingresso: JSON.parse(json) as unknown })
        } catch {
          // Un ingresso troncato non si legge: lo strumento non parte, e la Parte resta con l'ingresso vuoto.
        }
        return
      }
    }
  }

  private pezzoDelBlocco(indiceBlocco: number, delta: unknown): void {
    if (!eOggetto(delta)) return
    if (delta["type"] === "input_json_delta" && typeof delta["partial_json"] === "string") {
      this.jsonParziali.set(indiceBlocco, (this.jsonParziali.get(indiceBlocco) ?? "") + delta["partial_json"])
      return
    }
    const tipo = delta["type"] === "text_delta" ? "testo" : delta["type"] === "thinking_delta" ? "pensiero" : null
    const pezzo = delta["type"] === "text_delta" ? delta["text"] : delta["thinking"]
    if (tipo === null || typeof pezzo !== "string" || pezzo === "") return
    const indice = this.blocchi.get(indiceBlocco)
    const parte = this.corrente && indice !== undefined ? this.corrente.parti[indice] : undefined
    if (this.corrente && indice !== undefined && parte && (parte.tipo === "testo" || parte.tipo === "pensiero")) {
      this.sostituisci(this.corrente, indice, { tipo: parte.tipo, testo: parte.testo + pezzo })
      return
    }
    this.blocchi.set(indiceBlocco, this.aggiungiAlGiro({ tipo, testo: pezzo }).indice)
  }

  /** Il messaggio completo di Claude: ciò che è già arrivato a pezzi c'è, il resto (nessun pezzo emesso) si aggiunge ora. */
  private completo(messaggio: unknown, errore: string | undefined): void {
    if (errore) this.erroreDiClaude = errore
    if (!eOggetto(messaggio)) return
    const id = messaggio["id"]
    if (typeof id === "string" && this.arrivatiAPezzi.has(id)) return
    partiDeiBlocchi(messaggio["content"], this.adesso().toISOString()).forEach((parte) => this.aggiungiAlGiro(parte))
  }

  private esiti(messaggio: unknown): void {
    if (!eOggetto(messaggio)) return
    const uscita = typeof messaggio["content"] === "string" ? uscitaLocale(messaggio["content"]) : null
    if (uscita) this.aggiungiAlGiro({ tipo: "testo", testo: uscita })
    for (const risultato of risultatiDegliStrumenti(messaggio["content"])) {
      const dove = this.strumenti.get(String(risultato["tool_use_id"]))
      const parte = dove?.messaggio.parti[dove.indice]
      if (dove && parte?.tipo === "strumento") this.sostituisci(dove.messaggio, dove.indice, conEsito(parte, risultato, this.adesso().toISOString()))
    }
  }

  private fine(risultato: Oggetto): FineDelGiro {
    const errore = this.fermata ? undefined : fraseDelGiro(risultato, this.erroreDiClaude, this.nome)
    const costo = risultato["total_cost_usd"]
    const durata = risultato["duration_ms"]
    this.chiudiGiro({
      tipo: "fine",
      ...(typeof costo === "number" ? { costo } : {}),
      durata_ms: typeof durata === "number" ? durata : 0,
      lavoro_ms: this.chiudiIlLavoro(),
      ...(errore === undefined ? {} : { errore }),
    })
    this.erroreDiClaude = null
    this.fermata = false
    const inCoda = risultato["queued_turn_count"]
    return { inCoda: typeof inCoda === "number" ? inCoda : 0 }
  }
}
