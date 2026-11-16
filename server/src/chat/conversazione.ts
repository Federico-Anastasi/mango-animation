// Una conversazione con un motore: la sua sessione accesa, i messaggi, le richieste in attesa del creator.
import { dettaglioDi, frase, type Frase, type Lingua } from "../lingua"
import type { ComandoChat } from "./comandi"
import type { Cambi } from "./modelli"
import { manca, type EventoMotore, type MessaggioPerIlMotore, type Motore, type NomiDelMotore, type RichiestaDelMotore, type RispostaAlMotore, type SessioneMotore } from "./motore"
import { ElencoTask } from "./task"
import { abbrevia, fraseDi, type Oggetto } from "./traduzione"
import { lavoroDeiGiri, Trascrizione } from "./trascrizione"
import { ErroreChat, type ContestoUsato, type DatiEventoChat, type ImpostazioniChat, type MessaggioChat, type Parte, type RichiestaChat, type StatoChat, type TempoDiLavoro } from "./tipi"
import { eOggetto } from "../disco"

export const CONVERSAZIONE_CHIUSA = frase("Questa conversazione è chiusa: non sta facendo niente. Scrivi un messaggio per riaprirla.", "This conversation is closed: nothing is running. Write a message to reopen it.")
const CONVERSAZIONE_CHIUSA_ORA = frase("La conversazione si è chiusa.", "The conversation was closed.")
const LAVORO_FERMATO = frase("Il lavoro è stato fermato.", "The job was stopped.")
const LAVORO_FERMATO_PRIMA = frase("Il lavoro è stato fermato prima della risposta.", "The job was stopped before it was answered.")

interface Attesa {
  richiesta: RichiestaChat
  risolvi: (risposta: RispostaAlMotore) => void
}

export interface DipendenzeConversazione {
  id: string
  /** La cartella del prodotto, da cui arriva il metodo. */
  codice: string
  /** La cartella in cui lavora il motore. */
  lavoro: string
  /** I messaggi già scritti (una conversazione riletta). */
  messaggi: MessaggioChat[]
  /** Il contesto che occupava all'ultima risposta scritta. */
  contestoUsato: ContestoUsato | null
  /** È cominciata con l'avvio del primo giro (`primoGiro.ts`). */
  primoGiro: boolean
  /** La conversazione c'è già presso il motore: si riprende invece di crearla. */
  esiste: boolean
  titolo: string
  aggiornata: number
  motore: Motore
  emetti: (id: string, dati: DatiEventoChat) => void
  adesso: () => Date
  /** La lingua dello studio: le frasi che nascono fuori da una richiesta (l'errore di un giro, la richiesta di un permesso) escono in questa. */
  lingua: () => Lingua
  /** Cambia ciò che l'elenco mostra (attiva, data, titolo). */
  elencoCambiato: (id: string) => void
  /** Il motore ha mandato l'elenco intero dei comandi con la barra. */
  comandiCambiati: (comandi: ComandoChat[]) => void
}

/** Cosa dice la richiesta di permesso: lo strumento e la cosa più riconoscibile del suo ingresso. */
function frasePerIlPermesso(nomi: NomiDelMotore, strumento: string, ingresso: Oggetto): Frase {
  const campo = ["command", "file_path", "path", "url", "pattern", "query", "skill", "description", "prompt"].find((c) => typeof ingresso[c] === "string" && ingresso[c] !== "")
  const cosa = campo ? `: ${abbrevia(String(ingresso[campo]), 240)}` : ""
  return frase(`${nomi.nelleFrasi ? `${nomi.nelleFrasi} vuole` : "Vuole"} usare ${strumento}${cosa}`, `${nomi.nelleFrasi ?? nomi.programma} wants to use ${strumento}${cosa}`)
}

const eTestoNonVuoto = (valore: unknown): valore is string => typeof valore === "string" && valore.trim() !== ""

export class Conversazione {
  readonly id: string
  titolo: string
  /** Il titolo è quello dato dal motore (`/rename`): vale più di quello riletto, che arriva dopo. */
  rinominata = false
  aggiornata: number
  stato: StatoChat = "pronta"
  private inizioDelGiro: Date | null = null
  /** Il lavoro del giro in corso nei tratti già chiusi (prima di un'attesa del creator), e l'inizio del tratto in corso. */
  private lavoroDelGiro = 0
  private lavoraDalle: Date | null = null
  private sessione: SessioneMotore | null = null
  private ciclo: Promise<void> = Promise.resolve()
  /** Il collegamento all'app del motore è già stato chiesto a questa sessione. */
  private collegata = false
  private esiste: boolean
  private inChiusura = false
  private readonly trascrizione: Trascrizione
  private readonly richieste = new Map<string, Attesa>()
  /** Il creator ha scritto a giro in corso e il motore non ha ancora letto: lo legge quando uno strumento finisce, o al giro dopo. */
  private inCoda = false
  private readonly inAttesaDelCreator = new Set<() => void>()
  readonly task: ElencoTask
  /** Gli strumenti che il creator ha permesso «sempre»: valgono fino alla fine della conversazione. */
  private readonly sempre = new Set<string>()
  /** Ciò che il creator ha scelto: vale al prossimo avvio e vince su ciò che il motore dice di aver acceso. */
  private scelto: ImpostazioniChat = { modello: null, effort: null }
  /** Ciò che il motore ha detto di aver acceso all'ultimo avvio. */
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
    this.trascrizione = new Trascrizione(d.messaggi, (dati) => d.emetti(d.id, dati), d.adesso, d.motore.nomi, () => this.chiudiIlLavoroDelGiro(), d.lingua)
    this.task = new ElencoTask(d.adesso)
  }

  private get programma(): string {
    return this.d.motore.nomi.programma
  }

  get primoGiro(): boolean {
    return this.d.primoGiro
  }

  get motore(): Motore {
    return this.d.motore
  }

  get attiva(): boolean {
    return this.sessione !== null
  }

  get impostazioni(): ImpostazioniChat {
    return { modello: this.scelto.modello ?? this.acceso.modello, effort: this.scelto.effort ?? this.acceso.effort }
  }

  /** Da quando il motore lavora al giro in corso; `null` se non lavora. */
  get lavoraDa(): string | null {
    return this.inizioDelGiro?.toISOString() ?? null
  }

  get messaggi(): MessaggioChat[] {
    return this.trascrizione.messaggi
  }

  /** Quanto il motore ha lavorato in tutta la conversazione, senza le attese del creator (`docs/CHAT.md`, «API», il campo `lavoro`). */
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

  /** Un messaggio del creator: si accoda al motore (che si riaccende se la conversazione era chiusa). Senza parti è l'avvio del primo giro, che la chat non mostra. */
  scrivi(parti: Parte[], messaggio: MessaggioPerIlMotore, titolo: string): void {
    const sessione = this.sessione ?? this.avvia()
    const aGiroInCorso = this.stato === "lavora" || this.stato === "aspetta"
    if (parti.length > 0) this.trascrizione.aggiungiMessaggioDelCreator(parti)
    if (this.titolo === "") this.titolo = titolo
    this.aggiornata = this.d.adesso().getTime()
    if (this.richieste.size === 0) this.imposta("lavora")
    this.d.elencoCambiato(this.id)
    sessione.scrivi(messaggio)
    if (!aGiroInCorso) return
    this.inCoda = true
    const avvisa = [...this.inAttesaDelCreator]
    this.inAttesaDelCreator.clear()
    avvisa.forEach((risolvi) => risolvi())
  }

  /** `true` quando c'è un messaggio del creator che il motore non ha ancora letto, subito se c'è già; `false` se chi aspetta smette prima (`annullata`). */
  quandoIlCreatorScrive(annullata: AbortSignal): Promise<boolean> {
    if (this.inCoda) return Promise.resolve(true)
    return new Promise<boolean>((risolvi) => {
      const scritto = () => risolvi(true)
      this.inAttesaDelCreator.add(scritto)
      annullata.addEventListener(
        "abort",
        () => {
          this.inAttesaDelCreator.delete(scritto)
          risolvi(false)
        },
        { once: true },
      )
    })
  }

  private avvia(): SessioneMotore {
    this.collegata = false
    const sessione = this.d.motore.apri({
      id: this.id,
      esiste: this.esiste,
      codice: this.d.codice,
      lavoro: this.d.lavoro,
      modello: this.scelto.modello,
      effort: this.scelto.effort,
      evento: (evento) => this.ricevi(evento),
      chiedi: this.chiedi,
      lingua: this.d.lingua,
    })
    this.sessione = sessione
    this.ciclo = this.segui(sessione)
    this.d.elencoCambiato(this.id)
    return sessione
  }

  private async segui(sessione: SessioneMotore): Promise<void> {
    try {
      await sessione.finita
      if (!this.inChiusura && this.stato !== "pronta") this.errore(frase(`${this.programma} si è chiuso prima di finire la risposta: riscrivi il messaggio.`, `${this.programma} closed before finishing the answer: write the message again.`))
    } catch (errore) {
      // Un errore che ha già la sua frase per il creator (`ErroreChat`) si mostra com'è, senza altro intorno.
      if (!this.inChiusura) this.errore(errore instanceof ErroreChat ? errore.testo : frase(`Il collegamento con ${this.programma} si è interrotto (${fraseDi(errore)}): riscrivi il messaggio.`, `The connection with ${this.programma} was interrupted (${fraseDi(errore)}): write the message again.`))
    } finally {
      // Una sessione finita male tiene ancora i suoi flussi: si chiude, e il messaggio dopo ne apre una nuova.
      sessione.chiudi()
      if (this.sessione === sessione) this.sessione = null
      this.annullaRichieste(CONVERSAZIONE_CHIUSA_ORA, false)
      this.annunciaTask(this.task.azzera())
      this.d.elencoCambiato(this.id)
    }
  }

  /** La conversazione compare nell'app del motore e si continua da lì, se il motore lo sa fare. */
  private collega(sessione: SessioneMotore): void {
    if (this.collegata) return
    this.collegata = true
    sessione.collega?.(`Mango Animation · ${abbrevia(this.titolo, 80)}`)
  }

  private errore(testo: Frase): void {
    this.trascrizione.finisciConErrore(testo)
    this.imposta("errore")
  }

  private ricevi(e: EventoMotore): void {
    switch (e.tipo) {
      case "avvio":
        this.esiste = true
        this.acceso = { modello: e.modello, effort: e.effort }
        this.annuncia()
        if (this.sessione) this.collega(this.sessione)
        return
      case "riassunto":
        return this.annunciaContesto(null)
      case "comandi":
        return this.d.comandiCambiati(e.comandi)
      case "titolo":
        return this.rinomina(e.titolo)
      case "lavoro":
        return this.annunciaTask(this.task.applica(e))
      case "contesto":
        return this.annunciaContesto({ usati: e.usati, totale: this.finestra })
      case "esito":
        this.inCoda = false
        break
      case "fine":
        this.inCoda = false
        this.annunciaTask(this.task.fineDelGiro())
        if (this.sessione) this.misuraIlContesto(this.sessione)
        break
    }
    this.aggiornata = this.d.adesso().getTime()
    if (e.tipo !== "fine" && (this.stato === "pronta" || this.stato === "errore")) this.imposta("lavora")
    const fine = this.trascrizione.applica(e)
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

  /** A fine giro la misura intera, con la finestra del modello. */
  private misuraIlContesto(sessione: SessioneMotore): void {
    sessione
      .misuraIlContesto()
      .then((misura) => {
        // Senza misura (un motore che non ha ancora contato) resta l'ultimo conto.
        if (misura) this.annunciaContesto(misura)
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
    const sessione = this.sessione
    if (cambi.effort != null && !this.d.motore.capacita.effort) throw manca(this.d.motore.nomi, "effort")
    try {
      if (cambi.modello !== undefined) {
        await sessione?.cambiaModello(cambi.modello)
        this.scelto = { ...this.scelto, modello: cambi.modello }
      }
      if (cambi.effort !== undefined) {
        await sessione?.cambiaEffort?.(cambi.effort)
        this.scelto = { ...this.scelto, effort: cambi.effort }
        if (cambi.effort === null) this.acceso = { ...this.acceso, effort: null }
      }
    } catch (errore) {
      const d = dettaglioDi(errore)
      throw new ErroreChat(502, frase(`${this.programma} non ha accettato il cambio: ${d.it}`, `${this.programma} did not accept the change: ${d.en}`))
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

  /** Una richiesta al creator: resta in attesa finché risponde, o finché `annullata` scatta o la conversazione si ferma o si chiude. */
  readonly chiedi = (richiesta: RichiestaDelMotore, annullata: AbortSignal): Promise<RispostaAlMotore> => {
    if (richiesta.tipo === "permesso" && this.sempre.has(richiesta.strumento)) return Promise.resolve({ consente: true })
    const { id } = richiesta
    const perIlCreator: RichiestaChat =
      richiesta.tipo === "domanda"
        ? { id, tipo: "domanda", domande: richiesta.domande }
        : { id, tipo: "permesso", strumento: richiesta.strumento, ingresso: richiesta.ingresso, frase: frasePerIlPermesso(this.d.motore.nomi, richiesta.strumento, richiesta.ingresso).in(this.d.lingua()) }
    return new Promise<RispostaAlMotore>((risolvi) => {
      this.richieste.set(id, { richiesta: perIlCreator, risolvi })
      annullata.addEventListener("abort", () => this.annulla(id, LAVORO_FERMATO_PRIMA, true), { once: true })
      this.d.emetti(this.id, { evento: "richiesta", richiesta: perIlCreator })
      this.imposta("aspetta")
    })
  }

  private annulla(id: string, motivo: Frase, daFermare: boolean): void {
    const attesa = this.richieste.get(id)
    if (!attesa) return
    this.richieste.delete(id)
    attesa.risolvi({ consente: false, motivo: motivo.in(this.d.lingua()), ferma: daFermare })
    this.d.emetti(this.id, { evento: "risposta", richiesta: id })
    if (this.stato === "aspetta" && this.richieste.size === 0) this.imposta(this.sessione ? "lavora" : "pronta")
  }

  private annullaRichieste(motivo: Frase, daFermare: boolean): void {
    ;[...this.richieste.keys()].forEach((id) => this.annulla(id, motivo, daFermare))
  }

  /** La risposta del creator a una richiesta; se non è scritta bene non succede niente e la richiesta resta. */
  rispondi(id: string, corpo: Oggetto): void {
    const attesa = this.richieste.get(id)
    if (!attesa) throw new ErroreChat(404, frase("Questa richiesta non c'è più: ha già avuto risposta, oppure è già stata ritirata.", "This request is gone: it has already been answered, or withdrawn."))
    const { richiesta } = attesa
    const risposta = richiesta.tipo === "permesso" ? this.rispostaAlPermesso(richiesta, corpo) : this.rispostaAllaDomanda(richiesta, corpo)
    this.richieste.delete(id)
    attesa.risolvi(risposta)
    this.d.emetti(this.id, { evento: "risposta", richiesta: id })
    if (this.richieste.size === 0) this.imposta("lavora")
  }

  private rispostaAlPermesso(richiesta: Extract<RichiestaChat, { tipo: "permesso" }>, corpo: Oggetto): RispostaAlMotore {
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
      return { consente: false, motivo: frase(`Il permesso di usare ${richiesta.strumento} non è stato dato${perche}`, `Permission to use ${richiesta.strumento} was not given${perche}`).in(this.d.lingua()), ferma: false }
    }
    if (scelta === "sempre") this.sempre.add(richiesta.strumento)
    return { consente: true }
  }

  private rispostaAllaDomanda(richiesta: Extract<RichiestaChat, { tipo: "domanda" }>, corpo: Oggetto): RispostaAlMotore {
    for (const campo of Object.keys(corpo)) {
      if (campo !== "scelta") throw new ErroreChat(400, frase(`«${campo}» non è un campo della risposta: c'è solo «scelta».`, `«${campo}» is not a field of the answer: the only field is «scelta».`))
    }
    const scelta = corpo["scelta"]
    const date = eOggetto(scelta) ? scelta["risposte"] : undefined
    if (!eOggetto(date)) throw new ErroreChat(400, frase("Per una domanda la «scelta» è { risposte: { <domanda>: <opzione o testo> } }.", "For a question, the «scelta» is { risposte: { <domanda>: <option or text> } }."))
    const domande = new Set(richiesta.domande.map((d) => d.domanda))
    const estranea = Object.keys(date).find((chiave) => !domande.has(chiave))
    if (estranea !== undefined) throw new ErroreChat(400, frase(`«${estranea}» non è una delle domande fatte.`, `«${estranea}» is not one of the questions asked.`))
    const risposte: Record<string, string> = {}
    for (const { domanda } of richiesta.domande) {
      const risposta = date[domanda]
      const testo = Array.isArray(risposta) ? risposta.filter(eTestoNonVuoto).join(", ") : risposta
      if (!eTestoNonVuoto(testo)) throw new ErroreChat(400, frase(`Manca la risposta alla domanda «${domanda}».`, `The answer to the question «${domanda}» is missing.`))
      risposte[domanda] = testo.trim()
    }
    return { consente: true, risposte }
  }

  // --- Fermare e chiudere ---------------------------------------------------------------------

  async ferma(): Promise<void> {
    const sessione = this.sessione
    if (!sessione) throw new ErroreChat(409, CONVERSAZIONE_CHIUSA)
    if (this.stato === "pronta" || this.stato === "errore") return
    this.trascrizione.fermata = true
    this.annullaRichieste(LAVORO_FERMATO, true)
    await sessione.ferma()
  }

  /** Come Ctrl+B nel terminale: i comandi e i sottoagenti in primo piano vanno in background, e il motore legge subito ciò che il creator ha scritto. */
  async inBackground(): Promise<void> {
    const sessione = this.sessione
    if (!sessione) throw new ErroreChat(409, CONVERSAZIONE_CHIUSA)
    if (!this.d.motore.capacita.inBackground || !sessione.inBackground) throw manca(this.d.motore.nomi, "inBackground")
    if (!this.task.inPrimoPiano) throw new ErroreChat(409, frase("Non c'è un lavoro in corso da mandare in background.", "There is no running job to send to the background."))
    await sessione.inBackground().catch((errore: unknown) => this.nonRiuscito(frase("non ha spostato il lavoro in background", "did not move the job to the background"), errore))
  }

  async fermaTask(id: string): Promise<void> {
    const sessione = this.sessione
    if (!sessione) throw new ErroreChat(409, CONVERSAZIONE_CHIUSA)
    if (!this.d.motore.capacita.fermaLavoro || !sessione.fermaLavoro) throw manca(this.d.motore.nomi, "fermaLavoro")
    if (!this.task.ha(id)) throw new ErroreChat(404, frase("Questo lavoro non c'è più: è già finito, o qualcuno l'ha già fermato.", "This job is gone: it has already finished, or someone stopped it."))
    await sessione.fermaLavoro(id).catch((errore: unknown) => this.nonRiuscito(frase("non ha fermato il lavoro", "did not stop the job"), errore))
  }

  private nonRiuscito(cosa: Frase, errore: unknown): never {
    const d = dettaglioDi(errore)
    throw new ErroreChat(502, frase(`${this.programma} ${cosa.it}: ${d.it}`, `${this.programma} ${cosa.en}: ${d.en}`))
  }

  async chiudi(): Promise<void> {
    this.inChiusura = true
    this.annullaRichieste(CONVERSAZIONE_CHIUSA_ORA, false)
    this.sessione?.chiudi()
    await this.ciclo
    this.imposta("pronta")
  }

  /** La chiusura che chiede il creator: prima ferma ciò che il motore sta facendo (potrebbe continuarlo da sé), poi lo spegne. */
  async chiudiSuRichiesta(): Promise<void> {
    if (this.sessione && this.stato !== "pronta" && this.stato !== "errore") {
      await this.ferma().catch((errore: unknown) => console.error(`chat: ${this.programma} non ha fermato il lavoro della conversazione ${this.id} prima di chiuderla: ${fraseDi(errore)}`))
    }
    await this.chiudi()
  }
}
