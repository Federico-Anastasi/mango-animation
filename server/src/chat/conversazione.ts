// Una conversazione con Claude Code: il `query` dell'SDK in streaming, i messaggi, le richieste in attesa del creator.
import type { CanUseTool, Options, PermissionResult, SDKMessage, SDKUserMessage, SlashCommand } from "@anthropic-ai/claude-agent-sdk"
import type { BloccoDiIngresso } from "./allegati"
import { dettaglioDi, frase, type Frase, type Lingua } from "../lingua"
import { IngressoDiMessaggi } from "./ingresso"
import { aperturaDelMetodo, serverVideo } from "./metodo"
import type { Cambi } from "./modelli"
import { ElencoTask } from "./task"
import { abbrevia, contestoDaUsage, type Oggetto } from "./traduzione"
import { lavoroDeiGiri, Trascrizione } from "./trascrizione"
import { ErroreChat, MODELLO_PREDEFINITO, type ContestoUsato, type DatiEventoChat, type DomandaChat, type FunzioneQuery, type ImpostazioniChat, type MessaggioChat, type Parte, type QueryChat, type RichiestaChat, type StatoChat, type TempoDiLavoro } from "./tipi"
import { eOggetto } from "../disco"

const DOMANDA = "AskUserQuestion"
export const CONVERSAZIONE_CHIUSA = frase("Questa conversazione è chiusa: non sta facendo niente. Scrivi un messaggio per riaprirla.", "This conversation is closed: nothing is running. Write a message to reopen it.")
const CONVERSAZIONE_CHIUSA_ORA = frase("La conversazione si è chiusa.", "The conversation was closed.")
const LAVORO_FERMATO = frase("Il lavoro è stato fermato.", "The job was stopped.")
const LAVORO_FERMATO_PRIMA = frase("Il lavoro è stato fermato prima della risposta.", "The job was stopped before it was answered.")
const DOMANDA_STORTA = frase("La domanda non è scritta bene: servono da 1 a 4 domande, ciascuna con le sue opzioni.", "The question is not well formed: it needs 1 to 4 questions, each with its options.")

interface Attesa {
  richiesta: RichiestaChat
  ingresso: Record<string, unknown>
  risolvi: (risultato: PermissionResult) => void
}

export interface DipendenzeConversazione {
  id: string
  /** La cartella del prodotto, da cui arriva il metodo. */
  codice: string
  /** La cartella in cui lavora Claude. */
  lavoro: string
  /** I messaggi già scritti (una conversazione ripresa dal suo file). */
  messaggi: MessaggioChat[]
  /** Il contesto che occupava all'ultima risposta scritta nel suo file. */
  contestoUsato: ContestoUsato | null
  /** La conversazione c'è già nei file di Claude Code: si riprende con `resume` invece di crearla. */
  esiste: boolean
  titolo: string
  aggiornata: number
  query: FunzioneQuery
  /** Con cosa parla la conversazione, per le frasi d'errore: «Claude Code» o «Mango Code». */
  motore: string
  emetti: (id: string, dati: DatiEventoChat) => void
  adesso: () => Date
  /** La lingua dello studio: le frasi che nascono fuori da una richiesta (l'errore di un giro, la richiesta di un permesso) escono in questa. */
  lingua: () => Lingua
  /** Cambia ciò che l'elenco mostra (attiva, data, titolo). */
  elencoCambiato: (id: string) => void
  /** Claude Code ha mandato l'elenco intero dei comandi con la barra. */
  comandiCambiati: (comandi: SlashCommand[]) => void
}

/** Cosa dice la richiesta di permesso: lo strumento e la cosa più riconoscibile del suo ingresso. */
function frasePerIlPermesso(nome: string | null, strumento: string, ingresso: Oggetto): Frase {
  const campo = ["command", "file_path", "path", "url", "pattern", "query", "skill", "description", "prompt"].find((c) => typeof ingresso[c] === "string" && ingresso[c] !== "")
  const cosa = campo ? `: ${abbrevia(String(ingresso[campo]), 240)}` : ""
  return frase(`${nome ? `${nome} vuole` : "Vuole"} usare ${strumento}${cosa}`, `${nome ?? "Claude Code"} wants to use ${strumento}${cosa}`)
}

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

const eTestoNonVuoto = (valore: unknown): valore is string => typeof valore === "string" && valore.trim() !== ""

/** Ciò che cambia nell'app rispetto al terminale; le immagini degli strumenti la chat le mostra solo da Claude Code. */
const nellApp = (motore: string): string =>
  [
    "The creator writes to you from the chat of the Mango Animation app, not from a terminal: next to the chat there is the studio with the videos.",
    motore === "Claude Code" ? "The creator sees in the chat the images returned by the tools (foto, slide, scene_foto): to show a result, use them." : null,
    `When a choice is needed use the ${motore === "Claude Code" ? "AskUserQuestion" : "question"} tool: in the chat it becomes a set of buttons.`,
    "Never ask the creator to run commands: if a command is needed, run it yourself.",
    "Name a video by its slug or by the path archivio/video/<slug>/…: in the chat it becomes a link that opens it in the studio. Other paths inside archivio/ become a button that shows them in Explorer; paths elsewhere are plain text.",
    "Write to the creator in their language (`creator.lingua` in `profilo.json`), in every sentence, even the short ones between one step and the next, and in the description of the commands you run (the chat shows it to the creator).",
  ]
    .filter((riga): riga is string => riga !== null)
    .join("\n")

/** Come il motore si chiama nelle frasi per il creator: Mango Code col suo nome, l'assistente di Claude Code senza (`null`). */
const nomeNelleFrasi = (motore: string): string | null => (motore === "Claude Code" ? null : motore)

const fraseDi = (errore: unknown): string => (errore instanceof Error ? errore.message : String(errore))

/** Il titolo che Claude Code dà alla conversazione con `/rename`; l'SDK non lo dichiara fra i suoi messaggi. */
function titoloDato(m: unknown): string | null {
  return eOggetto(m) && m["subtype"] === "session_title_changed" && typeof m["title"] === "string" ? m["title"] : null
}

export class Conversazione {
  readonly id: string
  titolo: string
  /** Il titolo è quello dato con `/rename`: vale più di quello che il file riporta, che arriva dopo. */
  rinominata = false
  aggiornata: number
  stato: StatoChat = "pronta"
  private inizioDelGiro: Date | null = null
  /** Il lavoro del giro in corso nei tratti già chiusi (prima di un'attesa del creator), e l'inizio del tratto in corso. */
  private lavoroDelGiro = 0
  private lavoraDalle: Date | null = null
  private query: QueryChat | null = null
  private ingresso = new IngressoDiMessaggi()
  private ciclo: Promise<void> = Promise.resolve()
  /** Il collegamento all'app di Claude è già stato chiesto a questa `query`. */
  private collegata = false
  private esiste: boolean
  private inChiusura = false
  private readonly trascrizione: Trascrizione
  private readonly richieste = new Map<string, Attesa>()
  readonly task: ElencoTask
  /** Gli strumenti che il creator ha permesso «sempre»: valgono fino alla fine della conversazione. */
  private readonly sempre = new Set<string>()
  /** Ciò che il creator ha scelto: vale al prossimo avvio e vince su ciò che Claude Code dice di aver acceso. */
  private scelto: ImpostazioniChat = { modello: null, effort: null }
  /** Ciò che Claude Code ha detto di aver acceso all'ultimo avvio. */
  private acceso: ImpostazioniChat = { modello: null, effort: null }
  private annunciato = JSON.stringify(this.impostazioni)
  contestoUsato: ContestoUsato | null
  /** L'ultima misura della finestra del modello: un contesto riassunto la lascia, e il conto che viene dopo la ritrova. */
  private finestra: number | null

  constructor(private readonly d: DipendenzeConversazione) {
    this.id = d.id
    this.titolo = d.titolo
    this.aggiornata = d.aggiornata
    this.esiste = d.esiste
    this.contestoUsato = d.contestoUsato
    this.finestra = d.contestoUsato?.totale ?? null
    this.trascrizione = new Trascrizione(d.messaggi, (dati) => d.emetti(d.id, dati), d.adesso, nomeNelleFrasi(d.motore), () => this.chiudiIlLavoroDelGiro(), d.lingua)
    this.task = new ElencoTask(d.adesso)
  }

  get attiva(): boolean {
    return this.query !== null
  }

  get impostazioni(): ImpostazioniChat {
    return { modello: this.scelto.modello ?? this.acceso.modello, effort: this.scelto.effort ?? this.acceso.effort }
  }

  /** Da quando Claude lavora al giro in corso; `null` se non lavora. */
  get lavoraDa(): string | null {
    return this.inizioDelGiro?.toISOString() ?? null
  }

  get messaggi(): MessaggioChat[] {
    return this.trascrizione.messaggi
  }

  /** Quanto Claude ha lavorato in tutta la conversazione, senza le attese del creator (`docs/CHAT.md`, «API», il campo `lavoro`). */
  get lavoro(): TempoDiLavoro {
    const inCorso = this.stato === "lavora" || this.stato === "aspetta"
    return { ms: lavoroDeiGiri(this.messaggi, inCorso) + this.lavoroDelGiro, da: this.lavoraDalle?.toISOString() ?? null }
  }

  private chiudiIlLavoroDelGiro(): number {
    const ora = this.d.adesso()
    const fatto = this.lavoroDelGiro + (this.lavoraDalle ? ora.getTime() - this.lavoraDalle.getTime() : 0)
    this.lavoroDelGiro = 0
    if (this.lavoraDalle) this.lavoraDalle = ora
    return fatto
  }

  get inAttesa(): RichiestaChat[] {
    return [...this.richieste.values()].map((a) => a.richiesta)
  }

  /** Un messaggio del creator: si accoda a Claude Code (che si riapre se la conversazione era chiusa). */
  scrivi(parti: Parte[], contenuto: string | BloccoDiIngresso[], titolo: string): void {
    const messaggio: SDKUserMessage = { type: "user", message: { role: "user", content: contenuto }, parent_tool_use_id: null }
    this.accogli(parti, messaggio, titolo)
  }

  private accogli(parti: Parte[], messaggio: SDKUserMessage, titolo: string): void {
    if (!this.query) this.avvia()
    this.trascrizione.aggiungiMessaggioDelCreator(parti)
    if (this.titolo === "") this.titolo = titolo
    this.aggiornata = this.d.adesso().getTime()
    if (this.richieste.size === 0) this.imposta("lavora")
    this.d.elencoCambiato(this.id)
    this.ingresso.metti(messaggio)
  }

  private avvia(): void {
    this.ingresso = new IngressoDiMessaggi()
    this.collegata = false
    const opzioni: Options = {
      cwd: this.d.lavoro,
      ...aperturaDelMetodo(this.d.codice, this.d.lavoro),
      settingSources: ["user", "project", "local"],
      // Lo stesso prompt di Claude Code nel terminale, più ciò che cambia nell'app.
      systemPrompt: { type: "preset", preset: "claude_code", append: nellApp(this.d.motore) },
      includePartialMessages: true,
      // Claude Code lavora in autonomia, come `--dangerously-skip-permissions` (`docs/CHAT.md`, «I permessi»).
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      canUseTool: this.chiedi,
      // Claude in Chrome (come `--chrome`).
      extraArgs: { chrome: null },
      ...(this.scelto.modello !== null && this.scelto.modello !== MODELLO_PREDEFINITO ? { model: this.scelto.modello } : {}),
      ...(this.scelto.effort !== null ? { effort: this.scelto.effort } : {}),
      mcpServers: serverVideo(this.d.codice, this.d.lavoro),
      ...(this.esiste ? { resume: this.id } : { sessionId: this.id }),
    }
    const query = this.d.query({ prompt: this.ingresso, options: opzioni })
    this.query = query
    this.ciclo = this.leggi(query)
    this.d.elencoCambiato(this.id)
  }

  private async leggi(query: QueryChat): Promise<void> {
    try {
      for await (const messaggio of query) this.ricevi(messaggio)
      if (!this.inChiusura && this.stato !== "pronta") this.errore(frase(`${this.d.motore} si è chiuso prima di finire la risposta: riscrivi il messaggio.`, `${this.d.motore} closed before finishing the answer: write the message again.`))
    } catch (errore) {
      // Un errore che ha già la sua frase per il creator (`ErroreChat`) si mostra com'è, senza altro intorno.
      if (!this.inChiusura) this.errore(errore instanceof ErroreChat ? errore.testo : frase(`Il collegamento con ${this.d.motore} si è interrotto (${fraseDi(errore)}): riscrivi il messaggio.`, `The connection with ${this.d.motore} was interrupted (${fraseDi(errore)}): write the message again.`))
    } finally {
      // Una query finita male tiene ancora i suoi flussi: si chiude, e il messaggio dopo ne apre una nuova.
      query.close()
      if (this.query === query) {
        this.query = null
        this.ingresso.chiudi()
      }
      this.annullaRichieste(CONVERSAZIONE_CHIUSA_ORA, false)
      this.annunciaTask(this.task.azzera())
      this.d.elencoCambiato(this.id)
    }
  }

  /**
   * Come una chat aperta nel terminale con il controllo remoto: la conversazione compare nell'app di Claude e si continua da lì.
   * Lo apre Claude Code con il suo login (le chat di Mango Code non l'hanno): da qui non passa nessun accesso, e l'indirizzo
   * della sessione che risponde non si tiene né si scrive. Una conversazione ripresa si riaggancia da sé alla sua sessione.
   */
  private collega(query: QueryChat): void {
    if (this.collegata) return
    this.collegata = true
    if (!query.enableRemoteControl) {
      if (this.d.motore === "Claude Code") console.error(`chat: l'SDK installato non sa collegare la conversazione ${this.id} all'app di Claude.`)
      return
    }
    query
      .enableRemoteControl(true, `Mango Animation · ${abbrevia(this.titolo, 80)}`)
      .catch((errore: unknown) => console.error(`chat: la conversazione ${this.id} non è collegata all'app di Claude: ${abbrevia(fraseDi(errore), 300)}`))
  }

  private errore(testo: Frase): void {
    this.trascrizione.finisciConErrore(testo)
    this.imposta("errore")
  }

  private ricevi(m: SDKMessage): void {
    if (m.type === "conversation_reset") {
      console.error(`chat: Claude Code ha azzerato la conversazione ${this.id} (${m.trigger ?? "senza dire perché"}): la chat non lo segue.`)
      return
    }
    if (m.type === "result") {
      this.annunciaTask(this.task.applica(m))
      if (this.query) this.misuraIlContesto(this.query)
    }
    if (m.type === "system") {
      if (m.subtype === "init") {
        this.esiste = true
        this.acceso = { modello: m.model, effort: m.effort ?? null }
        this.annuncia()
        if (this.query) this.collega(this.query)
      } else {
        if (m.subtype === "compact_boundary") this.annunciaContesto(null)
        if (m.subtype === "commands_changed") this.d.comandiCambiati(m.commands)
        const titolo = titoloDato(m)
        if (titolo !== null) this.rinomina(titolo)
        this.annunciaTask(this.task.applica(m))
      }
      return
    }
    const delGiro = m.type === "stream_event" || m.type === "assistant" || m.type === "user"
    if (delGiro && "parent_tool_use_id" in m && m.parent_tool_use_id) return
    this.contaIlContesto(m)
    // Il conto dei token non porta testo: arriva anche a giro finito, e non lo riapre.
    if (m.type === "stream_event" && m.event.type === "message_delta") return
    this.aggiornata = this.d.adesso().getTime()
    if (delGiro && (this.stato === "pronta" || this.stato === "errore")) this.imposta("lavora")
    const fine = this.trascrizione.applica(m)
    if (fine) {
      this.imposta(fine.inCoda > 0 ? "lavora" : this.richieste.size > 0 ? "aspetta" : "pronta")
      this.d.elencoCambiato(this.id)
    }
  }

  private rinomina(titolo: string): void {
    const breve = abbrevia(titolo)
    if (breve === "" || (this.rinominata && breve === this.titolo)) return
    this.titolo = breve
    this.rinominata = true
    this.d.emetti(this.id, { evento: "titolo", titolo: breve })
    this.d.elencoCambiato(this.id)
  }

  /** I token di una risposta (il messaggio intero o il conto che arriva coi pezzi) dicono quanto contesto è occupato. */
  private contaIlContesto(m: SDKMessage): void {
    const usage = m.type === "assistant" ? m.message.usage : m.type === "stream_event" && m.event.type === "message_delta" ? m.event.usage : undefined
    const usati = contestoDaUsage(usage)
    if (usati !== null) this.annunciaContesto({ usati, totale: this.finestra })
  }

  /** A fine giro la misura intera, con la finestra del modello: è quella che Claude Code usa per decidere quando riassumere. */
  private misuraIlContesto(query: QueryChat): void {
    query
      .getContextUsage({ detail: "summary" })
      .then((m) => {
        // Una misura senza token (un motore che non li ha ancora contati) lascia l'ultimo conto.
        if (m.totalTokens > 0) this.annunciaContesto({ usati: m.totalTokens, totale: m.rawMaxTokens > 0 ? m.rawMaxTokens : null })
      })
      .catch((errore) => console.error(`chat: la misura del contesto della conversazione ${this.id} non è arrivata: ${fraseDi(errore)}`))
  }

  /** `null`: il contesto è stato riassunto e il nuovo non si sa ancora. */
  private annunciaContesto(contesto: ContestoUsato | null): void {
    if (contesto?.usati === this.contestoUsato?.usati && contesto?.totale === this.contestoUsato?.totale) return
    if (contesto?.totale) this.finestra = contesto.totale
    this.contestoUsato = contesto
    this.d.emetti(this.id, { evento: "contesto_usato", contesto_usato: contesto })
  }

  private annunciaTask(cambiato: boolean): void {
    if (cambiato) this.d.emetti(this.id, { evento: "task", task: this.task.elenco })
  }

  private annuncia(): void {
    const ora = this.impostazioni
    const chiave = JSON.stringify(ora)
    if (chiave === this.annunciato) return
    this.annunciato = chiave
    this.d.emetti(this.id, { evento: "impostazioni", ...ora })
  }

  /** Prima del primo avvio: il modello e l'effort con cui nasce la conversazione. */
  preimposta(cambi: Cambi): void {
    this.scelto = { modello: cambi.modello ?? this.scelto.modello, effort: cambi.effort === undefined ? this.scelto.effort : cambi.effort }
    this.annunciato = JSON.stringify(this.impostazioni)
  }

  /** Cambia modello ed effort a conversazione aperta, senza riavviarla; se è chiusa vale al prossimo avvio. */
  async cambia(cambi: Cambi): Promise<ImpostazioniChat> {
    const query = this.query
    try {
      if (cambi.modello !== undefined) {
        await query?.setModel(cambi.modello === MODELLO_PREDEFINITO ? undefined : cambi.modello)
        this.scelto = { ...this.scelto, modello: cambi.modello }
      }
      if (cambi.effort !== undefined) {
        await query?.applyFlagSettings({ effortLevel: cambi.effort })
        this.scelto = { ...this.scelto, effort: cambi.effort }
        if (cambi.effort === null) this.acceso = { ...this.acceso, effort: null }
      }
    } catch (errore) {
      const d = dettaglioDi(errore)
      throw new ErroreChat(502, frase(`${this.d.motore} non ha accettato il cambio: ${d.it}`, `${this.d.motore} did not accept the change: ${d.en}`))
    } finally {
      this.annuncia()
    }
    return this.impostazioni
  }

  private imposta(stato: StatoChat): void {
    if (stato === this.stato) return
    const ora = this.d.adesso()
    if (this.lavoraDalle) this.lavoroDelGiro += ora.getTime() - this.lavoraDalle.getTime()
    this.lavoraDalle = stato === "lavora" ? ora : null
    if (stato === "pronta" || stato === "errore") this.lavoroDelGiro = 0
    this.stato = stato
    this.inizioDelGiro = stato === "pronta" || stato === "errore" ? null : (this.inizioDelGiro ?? ora)
    this.d.emetti(this.id, { evento: "stato", stato, ...(this.inizioDelGiro ? { da: this.inizioDelGiro.toISOString() } : {}), lavoro: this.lavoro })
  }

  // --- Le richieste ---------------------------------------------------------------------------

  private readonly chiedi: CanUseTool = (strumento, ingresso, opzioni) => {
    if (strumento !== DOMANDA && this.sempre.has(strumento)) return Promise.resolve({ behavior: "allow", updatedInput: ingresso })
    const id = opzioni.toolUseID
    const domande = strumento === DOMANDA ? domandeDa(ingresso) : null
    if (strumento === DOMANDA && domande === null) return Promise.resolve({ behavior: "deny", message: DOMANDA_STORTA.in(this.d.lingua()) })
    const richiesta: RichiestaChat = domande ? { id, tipo: "domanda", domande } : { id, tipo: "permesso", strumento, ingresso, frase: frasePerIlPermesso(nomeNelleFrasi(this.d.motore), strumento, ingresso).in(this.d.lingua()) }
    return new Promise<PermissionResult>((risolvi) => {
      this.richieste.set(id, { richiesta, ingresso, risolvi })
      opzioni.signal.addEventListener("abort", () => this.annulla(id, LAVORO_FERMATO_PRIMA, true), { once: true })
      this.d.emetti(this.id, { evento: "richiesta", richiesta })
      this.imposta("aspetta")
    })
  }

  private annulla(id: string, motivo: Frase, daFermare: boolean): void {
    const attesa = this.richieste.get(id)
    if (!attesa) return
    this.richieste.delete(id)
    attesa.risolvi({ behavior: "deny", message: motivo.in(this.d.lingua()), ...(daFermare ? { interrupt: true } : {}) })
    this.d.emetti(this.id, { evento: "risposta", richiesta: id })
    if (this.stato === "aspetta" && this.richieste.size === 0) this.imposta(this.query ? "lavora" : "pronta")
  }

  private annullaRichieste(motivo: Frase, daFermare: boolean): void {
    ;[...this.richieste.keys()].forEach((id) => this.annulla(id, motivo, daFermare))
  }

  /** La risposta del creator a una richiesta; se non è scritta bene non succede niente e la richiesta resta. */
  rispondi(id: string, corpo: Oggetto): void {
    const attesa = this.richieste.get(id)
    if (!attesa) throw new ErroreChat(404, frase("Questa richiesta non c'è più: ha già avuto risposta, oppure è già stata ritirata.", "This request is gone: it has already been answered, or withdrawn."))
    const { richiesta } = attesa
    const risultato = richiesta.tipo === "permesso" ? this.rispostaAlPermesso(richiesta, attesa.ingresso, corpo) : this.rispostaAllaDomanda(richiesta, attesa.ingresso, corpo)
    this.richieste.delete(id)
    attesa.risolvi(risultato)
    this.d.emetti(this.id, { evento: "risposta", richiesta: id })
    if (this.richieste.size === 0) this.imposta("lavora")
  }

  private rispostaAlPermesso(richiesta: Extract<RichiestaChat, { tipo: "permesso" }>, ingresso: Oggetto, corpo: Oggetto): PermissionResult {
    for (const campo of Object.keys(corpo)) {
      if (campo !== "scelta" && campo !== "motivo") {
        throw new ErroreChat(400, frase(`«${campo}» non è un campo della risposta: ci sono «scelta» e, con «no», «motivo».`, `«${campo}» is not a field of the answer: the fields are «scelta» and, with «no», «motivo».`))
      }
    }
    const { scelta, motivo } = corpo
    if (scelta !== "consenti" && scelta !== "sempre" && scelta !== "no") throw new ErroreChat(400, frase("Per un permesso la «scelta» è «consenti», «sempre» o «no».", "For a permission, the «scelta» is «consenti», «sempre» or «no»."))
    if (motivo !== undefined && (scelta !== "no" || typeof motivo !== "string")) throw new ErroreChat(400, frase("Il «motivo» è un testo e vale solo per «no».", "The «motivo» is text and applies only to «no»."))
    if (scelta === "no") {
      const perche = eTestoNonVuoto(motivo) ? `: ${motivo.trim()}` : "."
      return { behavior: "deny", message: frase(`Il permesso di usare ${richiesta.strumento} non è stato dato${perche}`, `Permission to use ${richiesta.strumento} was not given${perche}`).in(this.d.lingua()) }
    }
    if (scelta === "sempre") this.sempre.add(richiesta.strumento)
    return { behavior: "allow", updatedInput: ingresso }
  }

  private rispostaAllaDomanda(richiesta: Extract<RichiestaChat, { tipo: "domanda" }>, ingresso: Oggetto, corpo: Oggetto): PermissionResult {
    for (const campo of Object.keys(corpo)) {
      if (campo !== "scelta") throw new ErroreChat(400, frase(`«${campo}» non è un campo della risposta: c'è solo «scelta».`, `«${campo}» is not a field of the answer: the only field is «scelta».`))
    }
    const scelta = corpo["scelta"]
    const risposte = eOggetto(scelta) ? scelta["risposte"] : undefined
    if (!eOggetto(risposte)) throw new ErroreChat(400, frase("Per una domanda la «scelta» è { risposte: { <domanda>: <opzione o testo> } }.", "For a question, the «scelta» is { risposte: { <domanda>: <option or text> } }."))
    const domande = new Set(richiesta.domande.map((d) => d.domanda))
    const estranea = Object.keys(risposte).find((chiave) => !domande.has(chiave))
    if (estranea !== undefined) throw new ErroreChat(400, frase(`«${estranea}» non è una delle domande fatte.`, `«${estranea}» is not one of the questions asked.`))
    const answers: Record<string, string> = {}
    for (const { domanda } of richiesta.domande) {
      const risposta = risposte[domanda]
      const testo = Array.isArray(risposta) ? risposta.filter(eTestoNonVuoto).join(", ") : risposta
      if (!eTestoNonVuoto(testo)) throw new ErroreChat(400, frase(`Manca la risposta alla domanda «${domanda}».`, `The answer to the question «${domanda}» is missing.`))
      answers[domanda] = testo.trim()
    }
    return { behavior: "allow", updatedInput: { ...ingresso, answers } }
  }

  // --- Fermare e chiudere ---------------------------------------------------------------------

  async ferma(): Promise<void> {
    const query = this.query
    if (!query) throw new ErroreChat(409, CONVERSAZIONE_CHIUSA)
    if (this.stato === "pronta" || this.stato === "errore") return
    this.trascrizione.fermata = true
    this.annullaRichieste(LAVORO_FERMATO, true)
    await query.interrupt()
  }

  /** Come Ctrl+B nel terminale: i comandi e i sottoagenti in primo piano vanno in background, e Claude legge subito ciò che il creator ha scritto. */
  async inBackground(): Promise<void> {
    if (!this.query) throw new ErroreChat(409, CONVERSAZIONE_CHIUSA)
    if (!this.task.inPrimoPiano) throw new ErroreChat(409, frase("Non c'è un lavoro in corso da mandare in background.", "There is no running job to send to the background."))
    await this.query.backgroundTasks().catch((errore: unknown) => this.nonRiuscito(frase("non ha spostato il lavoro in background", "did not move the job to the background"), errore))
  }

  async fermaTask(id: string): Promise<void> {
    if (!this.query) throw new ErroreChat(409, CONVERSAZIONE_CHIUSA)
    if (!this.task.ha(id)) throw new ErroreChat(404, frase("Questo lavoro non c'è più: è già finito, o qualcuno l'ha già fermato.", "This job is gone: it has already finished, or someone stopped it."))
    await this.query.stopTask(id).catch((errore: unknown) => this.nonRiuscito(frase("non ha fermato il lavoro", "did not stop the job"), errore))
  }

  private nonRiuscito(cosa: Frase, errore: unknown): never {
    const d = dettaglioDi(errore)
    throw new ErroreChat(502, frase(`${this.d.motore} ${cosa.it}: ${d.it}`, `${this.d.motore} ${cosa.en}: ${d.en}`))
  }

  async chiudi(): Promise<void> {
    this.inChiusura = true
    this.annullaRichieste(CONVERSAZIONE_CHIUSA_ORA, false)
    this.ingresso.chiudi()
    this.query?.close()
    await this.ciclo
    this.imposta("pronta")
  }

  /** La chiusura che chiede il creator: prima ferma ciò che Claude sta facendo (Mango Code lo continuerebbe da sé), poi spegne il processo. */
  async chiudiSuRichiesta(): Promise<void> {
    if (this.query && this.stato !== "pronta" && this.stato !== "errore") {
      await this.ferma().catch((errore: unknown) => console.error(`chat: ${this.d.motore} non ha fermato il lavoro della conversazione ${this.id} prima di chiuderla: ${fraseDi(errore)}`))
    }
    await this.chiudi()
  }
}
