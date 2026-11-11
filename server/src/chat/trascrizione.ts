// I messaggi di una conversazione e la traduzione dei messaggi che l'SDK emette in Parti. Un messaggio di Claude è un giro intero:
// tutto ciò che Claude fa fra un messaggio del creator e il risultato; ogni cambio di una Parte è un evento.
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk"
import { frase, type Frase, type Lingua } from "../lingua"
import { conEsito, parteStrumento, partiDeiBlocchi, risultatiDegliStrumenti, uscitaLocale, type Oggetto } from "./traduzione"
import type { DatiEventoChat, MessaggioChat, Parte } from "./tipi"
import { eOggetto } from "../disco"

export interface FineDelGiro {
  /** I messaggi del creator già in coda che avranno un altro giro. */
  inCoda: number
}

const ERRORI_DI_CLAUDE: Record<string, Frase> = {
  authentication_failed: frase(
    "Claude Code non è più collegato all'account: chiudi Mango Animation e riaprila, ti porta ad accedere di nuovo.",
    "Claude Code is no longer connected to the account: close Mango Animation and open it again, it will take you to sign in again.",
  ),
  overloaded: frase("Claude è sovraccarico in questo momento: riprova fra poco.", "Claude is overloaded right now: try again in a moment."),
  billing_error: frase("L'account di Claude ha un problema di pagamento: controllalo da un terminale con «claude».", "The Claude account has a billing problem: check it from a terminal with «claude»."),
  account_on_hold: frase("L'account di Claude è sospeso: controllalo da un terminale con «claude».", "The Claude account is on hold: check it from a terminal with «claude»."),
  oauth_org_not_allowed: frase("L'organizzazione di questo account non può usare Claude Code.", "The organization of this account cannot use Claude Code."),
  verification_required: frase("L'account di Claude chiede una verifica: aprila da un terminale con «claude».", "The Claude account needs to be verified: open it from a terminal with «claude»."),
  max_output_tokens: frase("La risposta era troppo lunga e si è fermata: chiedi di continuare.", "The answer was too long and stopped: ask it to continue."),
}

/** Quando si libera il limite dell'abbonamento: l'ora se è oggi, altrimenti il giorno e l'ora. `resetsAt` è in secondi dal 1970, come lo dà Claude Code. */
function quandoSiLibera(resetsAt: number, adesso: Date): Frase | null {
  const quando = new Date(resetsAt * 1000)
  if (Number.isNaN(quando.getTime()) || quando <= adesso) return null
  const ora = (locale: string) => quando.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })
  if (quando.toDateString() === adesso.toDateString()) return frase(`alle ${ora("it-IT")}`, `at ${ora("en-GB")}`)
  return frase(`${quando.toLocaleDateString("it-IT", { weekday: "long" })} alle ${ora("it-IT")}`, `${quando.toLocaleDateString("en-GB", { weekday: "long" })} at ${ora("en-GB")}`)
}

/** La frase di un giro finito male, nelle due lingue. */
function fraseDelGiro(risultato: Oggetto, erroreDiClaude: string | null, nome: string | null, limiteFinoA: number | null, adesso: Date): Frase | undefined {
  if (risultato["subtype"] === "success" && risultato["is_error"] !== true) return undefined
  if (erroreDiClaude === "rate_limit") {
    const quando = limiteFinoA === null ? null : quandoSiLibera(limiteFinoA, adesso)
    return frase(
      `Hai finito i messaggi che l'abbonamento permette per ora: ${quando ? `si libera ${quando.it}` : "di solito passano alcune ore"}.`,
      `You have used all the messages your subscription allows for now: ${quando ? `it resets ${quando.en}` : "it usually takes a few hours"}.`,
    )
  }
  if (erroreDiClaude) return ERRORI_DI_CLAUDE[erroreDiClaude] ?? frase(`Claude non ha risposto (${erroreDiClaude}).`, `Claude did not answer (${erroreDiClaude}).`)
  const dettagli = Array.isArray(risultato["errors"]) ? risultato["errors"].filter((e): e is string => typeof e === "string").join(" · ") : ""
  const motivo = typeof risultato["result"] === "string" ? risultato["result"] : ""
  const causa = (dettagli || motivo).trim().replace(/[.\s]+$/, "")
  const fermato = frase(nome ? `${nome} si è fermato` : "Si è fermato", nome ? `${nome} stopped` : "It stopped")
  switch (risultato["subtype"]) {
    case "error_max_turns":
      return frase(`${fermato.it}: ha fatto troppi passaggi in un solo giro. Scrivi «continua» per andare avanti.`, `${fermato.en}: it took too many steps in a single round. Write «continue» to go on.`)
    case "error_max_budget_usd":
      return frase(`${fermato.it}: ha raggiunto il limite di spesa del giro.`, `${fermato.en}: it reached the spending limit for the round.`)
    case "success":
      return frase(`${fermato.it}: ${causa || "senza dire altro"}.`, `${fermato.en}: ${causa || "without saying more"}.`)
    default:
      return frase(`${fermato.it}${causa ? `: ${causa}` : " con un errore"}.`, `${fermato.en}${causa ? `: ${causa}` : " with an error"}.`)
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
  /** Quando Claude Code ha detto che il limite si libera (secondi dal 1970), dall'ultimo avviso di limite raggiunto. */
  private limiteFinoA: number | null = null
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
    /** La lingua dello studio: le frasi nascono quando il giro finisce, non dentro una richiesta. */
    private readonly lingua: () => Lingua,
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
  finisciConErrore(testo: Frase): void {
    this.chiudiGiro({ tipo: "fine", durata_ms: 0, lavoro_ms: this.chiudiIlLavoro(), errore: testo.in(this.lingua()) })
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
      case "rate_limit_event":
        if (m.rate_limit_info.status === "rejected") this.limiteFinoA = m.rate_limit_info.resetsAt ?? null
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
      if (dove && parte?.tipo === "strumento") this.sostituisci(dove.messaggio, dove.indice, conEsito(parte, risultato, this.lingua(), this.adesso().toISOString()))
    }
  }

  private fine(risultato: Oggetto): FineDelGiro {
    const errore = this.fermata ? undefined : fraseDelGiro(risultato, this.erroreDiClaude, this.nome, this.limiteFinoA, this.adesso())
    const costo = risultato["total_cost_usd"]
    const durata = risultato["duration_ms"]
    this.chiudiGiro({
      tipo: "fine",
      ...(typeof costo === "number" ? { costo } : {}),
      durata_ms: typeof durata === "number" ? durata : 0,
      lavoro_ms: this.chiudiIlLavoro(),
      ...(errore === undefined ? {} : { errore: errore.in(this.lingua()) }),
    })
    this.erroreDiClaude = null
    this.limiteFinoA = null
    this.fermata = false
    const inCoda = risultato["queued_turn_count"]
    return { inCoda: typeof inCoda === "number" ? inCoda : 0 }
  }
}
