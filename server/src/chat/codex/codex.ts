// Codex come motore della chat: `codex app-server` (JSON-RPC, un programma solo per tutte le conversazioni) tradotto negli eventi del prodotto.
import { isAbsolute, join, relative, resolve } from "node:path"
import { elencaFile, eOggetto, statistica } from "../../disco"
import { frase, type Frase } from "../../lingua"
import { osserva } from "../../osservatore"
import type { ComandoChat } from "../comandi"
import { livelloDi } from "../livelli"
import { serverVideo, stessaCartella } from "../metodo"
import type { Apertura, CapacitaDelMotore, ConversazioneLetta, EventoMotore, MessaggioPerIlMotore, Motore, NomiDelMotore, SessioneMotore } from "../motore"
import { eAvvio } from "../primoGiro"
import { RegistroDelMotore, type Ricordo } from "../registro"
import { messaggiDalleRighe } from "../storico"
import { ErroreChat, type ContestoUsato, type LivelloEffort, type ModelloChat, type VoceSessione } from "../tipi"
import { fraseDi, type Oggetto } from "../traduzione"
import { istruzioniDiCodex } from "./istruzioni"
import { orfani, sistemaVero, type Sistema } from "./processi"
import { CodexTroppoVecchio, ErroreDiCodex, type ClienteCodex } from "./protocollo"
import { comandoDi, domandeDiCodex, righeDelThread, risposteACodex, TraduttoreDiCodex } from "./voci"

/** Il prefisso dei modelli di Codex fra quelli della chat: `codex/gpt-5.6-luna`. */
const PREFISSO = "codex/"

/** Una domanda al creator può aspettare ore: lo strumento «video» non scade prima. */
const ATTESA_DELLE_DOMANDE_S = 86_400

const NOMI: NomiDelMotore = { programma: "Codex", servizio: "Codex", menu: "Codex", comando: "codex", nelleFrasi: "Codex" }

const CAPACITA: CapacitaDelMotore = {
  effort: true,
  comandi: true,
  fermaLavoro: true,
  inBackground: false,
  immaginiNegliEsiti: true,
  controlloRemoto: false,
  sottoagenti: true,
  browser: true,
  strumentoDelleDomande: false,
}

const COMANDO_COMPATTA: ComandoChat = { nome: "compact", descrizione: "Summarize the conversation to free up context.", argomenti: "", alias: [] }
const COMANDO_REVISIONE: ComandoChat = { nome: "review", descrizione: "Have Codex review the work done in this conversation, or what you ask it to look at.", argomenti: "[what to review]", alias: [] }
const COMANDO_RINOMINA: ComandoChat = { nome: "rename", descrizione: "Give the conversation a name.", argomenti: "<name>", alias: [] }
const COMANDI_DEL_MOTORE = [COMANDO_COMPATTA, COMANDO_REVISIONE, COMANDO_RINOMINA]

/** Cosa rivedere quando il creator scrive solo «/review». */
const REVISIONE_DEL_LAVORO = "Review the work done in this conversation: what was written or changed in the working folder. Say what is wrong or missing, with the file and the reason. Do not change anything."

/** Dove Codex tiene i file dei suoi thread, sotto la sua cartella, e come si chiamano: l'identificativo del thread chiude il nome. */
const CARTELLA_DEI_THREAD = "sessions"
const FILE_DEL_THREAD = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i
const RIMBALZO_MS = 200

const FRASE_CADUTO = frase("Codex si è chiuso all'improvviso: riscrivi il messaggio.", "Codex closed unexpectedly: write the message again.")
const FRASE_NON_RISPONDE = frase("Codex non risponde: controlla che sia installato e riscrivi il messaggio.", "Codex is not answering: check that it is installed and write the message again.")
const FRASE_NON_COLLEGATO = frase(
  "Codex non è collegato a un account: accedi da un terminale con «codex login» e riscrivi il messaggio.",
  "Codex is not connected to an account: sign in from a terminal with «codex login» and write the message again.",
)

const testo = (valore: unknown): string | null => (typeof valore === "string" ? valore : null)
const oggetti = (valore: unknown): Oggetto[] => (Array.isArray(valore) ? valore.filter(eOggetto) : [])
const oggetto = (valore: unknown): Oggetto => (eOggetto(valore) ? valore : {})

/** L'errore di Codex come la chat lo dà al creator: una frase intera nelle due lingue. */
function fraseDiCodex(errore: unknown): ErroreChat {
  if (errore instanceof ErroreChat) return errore
  if (errore instanceof CodexTroppoVecchio) {
    return new ErroreChat(
      502,
      frase(
        `Questo Codex (${errore.versione}) è troppo vecchio per la chat: aggiornalo alla ${errore.minima} o a una più recente e riscrivi il messaggio.`,
        `This Codex (${errore.versione}) is too old for the chat: update it to ${errore.minima} or newer and write the message again.`,
      ),
    )
  }
  if (errore instanceof ErroreDiCodex) {
    return errore.codice === null ? new ErroreChat(502, FRASE_NON_RISPONDE) : new ErroreChat(502, frase(`Codex ha dato un errore: ${errore.message}`, `Codex gave an error: ${errore.message}`))
  }
  console.error(`chat di Codex: non si raggiunge: ${fraseDi(errore)}`)
  return new ErroreChat(502, FRASE_NON_RISPONDE)
}

/** Un account collegato, o un Codex che non ne vuole uno. */
const eCollegato = (risposta: Oggetto): boolean => eOggetto(risposta["account"]) || risposta["requiresOpenaiAuth"] === false

const sotto = (percorso: string, radice: string): boolean => {
  const relativo = relative(resolve(radice), resolve(percorso))
  return relativo !== "" && !relativo.startsWith("..") && !isAbsolute(relativo)
}

interface Skill {
  nome: string
  descrizione: string
  percorso: string
}

/** Il nome di una skill senza ciò che lo precede ai due punti. */
const nomeSenzaPrefisso = (nome: string): string => nome.slice(nome.indexOf(":") + 1)

export interface OpzioniDelMotoreCodex {
  cliente: ClienteCodex
  /** Dove il motore tiene il registro delle sue conversazioni. */
  archivio: string
  /** La cartella del prodotto: ne arrivano le skill, il metodo e lo strumento «video». */
  codice: string
  /** La cartella in cui Codex lavora. */
  lavoro: string
  adesso: () => Date
  /** I processi del computer, per fermare ciò che Codex lascia acceso quando chiude un comando; le prove ne mettono uno finto. */
  sistema?: Sistema
}

/** Quanto si aspetta che Codex abbia chiuso la shell di un comando prima di guardare cosa ne è rimasto. */
const ATTESA_DELLA_SHELL_MS = 300

class SessioneDiCodex implements SessioneMotore {
  private readonly conclusione = Promise.withResolvers<void>()
  readonly finita = this.conclusione.promise
  readonly traduttore: TraduttoreDiCodex
  private readonly fine = new AbortController()
  private thread: string | null = null
  /** Il modello con cui Codex ha acceso la conversazione. */
  private acceso = ""
  private modello: string | null
  private effort: LivelloEffort | null
  private effortInviato = false
  /** Il giro avviato di cui Codex non ha ancora detto che è cominciato. */
  private giroAvviato: string | null = null
  private coda: Promise<void> = Promise.resolve()
  private chiusa = false

  constructor(
    private readonly codex: Codex,
    private readonly a: Apertura,
  ) {
    this.modello = a.modello?.startsWith(PREFISSO) ? a.modello.slice(PREFISSO.length) : null
    this.effort = a.effort
    this.traduttore = new TraduttoreDiCodex((evento) => this.evento(evento), PREFISSO)
    const pronta = this.avvia()
    pronta.catch((errore: unknown) => this.rompi(errore))
    this.coda = pronta.catch(() => undefined)
  }

  private rompi(errore: unknown): void {
    this.conclusione.reject(fraseDiCodex(errore))
  }

  private evento(e: EventoMotore): void {
    if (e.tipo === "fine") {
      this.giroAvviato = null
      void this.verificaGliSfondi()
    }
    if (e.tipo === "titolo") void this.aggiorna(() => ({ titolo: e.titolo }))
    if (e.tipo === "contesto") void this.aggiorna(() => ({ contesto: this.traduttore.contesto }))
    if (e.tipo === "riassunto") void this.aggiorna(() => ({ contesto: null }))
    this.a.evento(e)
  }

  /** Il registro lega la conversazione della chat al suo thread, col modello e il titolo. */
  private aggiorna(cambio: (vecchio: Ricordo | undefined) => Partial<Ricordo>): Promise<void> {
    const thread = this.thread
    if (thread === null) return Promise.resolve()
    return this.codex.registro.cambia(this.a.id, (vecchio) => ({
      ...vecchio,
      sessione: thread,
      modello: this.modello ?? vecchio?.modello ?? this.acceso,
      titolo: vecchio?.titolo ?? "",
      aggiornata: this.codex.adesso().getTime(),
      ...cambio(vecchio),
    }))
  }

  private async avvia(): Promise<void> {
    const cliente = this.codex.cliente
    await this.codex.preparaIlProgramma()
    if (!eCollegato(await cliente.chiedi<Oggetto>("account/read", {}))) throw new ErroreChat(502, FRASE_NON_COLLEGATO)
    const { codice, lavoro } = this.codex.cartelle
    const ricordo = this.a.esiste ? await this.codex.registro.di(this.a.id) : undefined
    const comuni = {
      ...(this.modello === null ? {} : { model: this.modello }),
      cwd: lavoro,
      approvalPolicy: "never",
      sandbox: "danger-full-access",
      developerInstructions: istruzioniDiCodex(lavoro, codice, { immaginiNegliEsiti: CAPACITA.immaginiNegliEsiti, strumentoDelleDomande: "domanda (video server)" }),
      config: {
        mcp_servers: Object.fromEntries(
          Object.entries(serverVideo(codice, lavoro, { id: this.a.id, capacita: CAPACITA })).map(([nome, s]) => [nome, { command: s.command, args: s.args, env: s.env, tool_timeout_sec: ATTESA_DELLE_DOMANDE_S }]),
        ),
        project_doc_fallback_filenames: ["CLAUDE.md"],
      },
    }
    await this.codex.chiusure.get(ricordo?.sessione ?? this.a.id)
    const risposta = this.a.esiste ? await cliente.chiedi<Oggetto>("thread/resume", { threadId: ricordo?.sessione ?? this.a.id, ...comuni }) : await cliente.chiedi<Oggetto>("thread/start", comuni)
    const thread = oggetto(risposta["thread"])
    const id = testo(thread["id"])
    if (id === null) throw new ErroreDiCodex("Codex did not give the identifier of the conversation.", 0)
    if (this.chiusa) {
      if (!this.codex.sessioni.has(id)) this.codex.disiscrivi(id)
      return
    }
    this.thread = id
    this.acceso = testo(risposta["model"]) ?? ""
    this.codex.sessioni.set(id, this)
    await this.aggiorna((vecchio) => (vecchio ? {} : { titolo: testo(thread["name"]) ?? testo(thread["preview"]) ?? "" }))
    this.a.evento({ tipo: "avvio", modello: `${PREFISSO}${this.acceso}`, effort: testo(risposta["reasoningEffort"]) })
  }

  /** Il programma di Codex è caduto: la conversazione non c'è più finché non si riprende. */
  caduto(): void {
    this.rompi(new ErroreChat(502, FRASE_CADUTO))
  }

  /** Una notifica di Codex per questo thread; un errore di chi la riceve rompe la conversazione. */
  notifica(metodo: string, parametri: Oggetto): void {
    try {
      this.traduttore.notifica(metodo, parametri)
    } catch (errore) {
      this.rompi(errore)
    }
  }

  /** Una notifica del thread di un aiutante. */
  notificaDelFiglio(thread: string, metodo: string, parametri: Oggetto): void {
    try {
      this.traduttore.notificaDelFiglio(thread, metodo, parametri)
    } catch (errore) {
      this.rompi(errore)
    }
  }

  haFiglio(thread: string): boolean {
    return this.traduttore.haFiglio(thread)
  }

  figlioNato(thread: string): void {
    this.traduttore.figlioNato(thread)
  }

  /** A fine giro Codex dice quali comandi accesi sono ancora vivi: quelli che non elenca sono finiti. */
  private async verificaGliSfondi(): Promise<void> {
    const thread = this.thread
    const attesi = this.traduttore.processiInSfondo
    if (thread === null || attesi.length === 0) return
    try {
      const vivi = new Set<string>()
      let dopo: string | null = null
      do {
        const pagina: Oggetto = await this.codex.cliente.chiedi("thread/backgroundTerminals/list", { threadId: thread, ...(dopo === null ? {} : { cursor: dopo }) })
        for (const terminale of oggetti(pagina["data"])) {
          const processo = testo(terminale["processId"])
          if (processo !== null) vivi.add(processo)
        }
        dopo = testo(pagina["nextCursor"])
      } while (dopo !== null)
      if (!this.chiusa) this.traduttore.terminaliFiniti(attesi, vivi)
    } catch (errore) {
      console.error(`chat di Codex: non riesco a leggere i comandi lasciati accesi: ${fraseDi(errore)}`)
    }
  }

  scrivi(messaggio: MessaggioPerIlMotore): void {
    if (this.chiusa) return
    this.coda = this.coda.then(() => this.manda(messaggio)).catch((errore: unknown) => this.rompi(errore))
  }

  private async manda(messaggio: MessaggioPerIlMotore): Promise<void> {
    if (this.thread === null || this.chiusa) return
    await this.aggiorna((vecchio) => (vecchio?.titolo ? {} : { titolo: messaggio.testo.slice(0, 300) }))
    const comando = /^\/(\S+)(?:\s+([\s\S]*))?$/.exec(messaggio.testo)
    if (comando?.[1] === "compact") {
      await this.codex.cliente.chiedi("thread/compact/start", { threadId: this.thread })
      return
    }
    if (comando?.[1] === "review") return this.rivedi(this.thread, comando[2]?.trim() ?? "")
    if (comando?.[1] === "rename") return this.daUnNome(this.thread, comando[2]?.trim() ?? "")
    const skill = comando?.[1] === undefined ? undefined : await this.codex.skill(comando[1])
    const parole = skill === undefined ? messaggio.testo : `$${skill.nome}${comando?.[2] ? ` ${comando[2]}` : ""}`
    const ingresso: Oggetto[] = [
      { type: "text", text: parole, text_elements: [] },
      ...(skill === undefined ? [] : [{ type: "skill", name: skill.nome, path: skill.percorso }]),
      ...messaggio.immagini.map((i) => ({ type: "image", url: `data:${i.tipo};base64,${i.dati}` })),
    ]
    await this.invia(this.thread, ingresso)
  }

  /** La revisione è un giro di Codex sul thread: dice cosa rivedere, e il resto lo traduce il giro. */
  private async rivedi(thread: string, istruzioni: string): Promise<void> {
    if (this.inCorso()) return this.rispondiDaSolo(frase("Una revisione parte quando il lavoro in corso è finito: riscrivi «/review» allora.", "A review starts when the running work is done: write «/review» again then."))
    const risposta = await this.codex.cliente.chiedi<Oggetto>("review/start", { threadId: thread, target: { type: "custom", instructions: istruzioni === "" ? REVISIONE_DEL_LAVORO : istruzioni } })
    this.giroAvviato = testo(oggetto(risposta["turn"])["id"])
  }

  private async daUnNome(thread: string, nome: string): Promise<void> {
    if (nome === "") return this.rispondiDaSolo(frase("Scrivi il nome dopo «/rename».", "Write the name after «/rename»."))
    await this.codex.cliente.chiedi("thread/name/set", { threadId: thread, name: nome })
    this.evento({ tipo: "titolo", titolo: nome })
    this.rispondiDaSolo(frase(`Conversazione rinominata: «${nome}».`, `Conversation renamed: «${nome}».`))
  }

  private inCorso(): boolean {
    return (this.traduttore.giroInCorso ?? this.giroAvviato) !== null
  }

  /** La risposta di un comando che non fa partire nessun giro: la conversazione torna pronta, se Codex non sta lavorando. */
  private rispondiDaSolo(detto: Frase): void {
    this.evento({ tipo: "uscita", testo: detto.in(this.a.lingua()) })
    if (!this.inCorso()) this.evento({ tipo: "fine", errore: null, durata_ms: 0, inCoda: 0 })
  }

  /** Un giro in corso legge il messaggio mentre lavora; senza, comincia un giro. */
  private async invia(thread: string, ingresso: Oggetto[]): Promise<void> {
    const cliente = this.codex.cliente
    const inCorso = this.traduttore.giroInCorso ?? this.giroAvviato
    if (inCorso !== null) {
      try {
        await cliente.chiedi("turn/steer", { threadId: thread, expectedTurnId: inCorso, input: ingresso })
        return
      } catch (errore) {
        // Il giro può essere finito proprio adesso: allora il messaggio ne comincia uno nuovo.
        if (!(errore instanceof ErroreDiCodex) || errore.codice === null) throw errore
      }
    }
    const effort = await this.effortDelGiro()
    const risposta = await cliente.chiedi<Oggetto>("turn/start", { threadId: thread, input: ingresso, ...(this.modello === null ? {} : { model: this.modello }), ...(effort === null ? {} : { effort }), summary: "auto" })
    this.giroAvviato = testo(oggetto(risposta["turn"])["id"])
  }

  /** Codex tiene l'effort mandato per i giri dopo: tornare al predefinito vuol dire mandare quello del modello. */
  private async effortDelGiro(): Promise<LivelloEffort | null> {
    if (this.effort !== null) {
      this.effortInviato = true
      return this.effort
    }
    if (!this.effortInviato) return null
    this.effortInviato = false
    return this.codex.effortPredefinito(this.modello)
  }

  async ferma(): Promise<void> {
    // Un messaggio che sta ancora partendo comincia il suo giro prima che lo si possa fermare.
    await this.coda
    const thread = this.thread
    if (thread === null) return
    const giro = this.traduttore.giroInCorso ?? this.giroAvviato
    if (giro !== null) await this.codex.chiedi("turn/interrupt", { threadId: thread, turnId: giro })
    const chiusure = await Promise.allSettled(this.traduttore.processiVivi.map((processo) => this.chiudiIlProcesso(thread, processo)))
    const fallita = chiusure.find((c) => c.status === "rejected")
    if (fallita) throw fallita.reason
  }

  private async chiudiIlProcesso(thread: string, processo: string): Promise<void> {
    const programma = this.codex.cliente.pid()
    const prima = programma === null ? null : await this.codex.sistema.processi().catch(() => null)
    await this.codex.chiedi("thread/backgroundTerminals/terminate", { threadId: thread, processId: processo })
    this.traduttore.chiuso(processo)
    if (programma !== null && prima !== null) void this.fermaIRimasti(programma, prima)
  }

  /** Codex chiude la shell del comando, non ciò che la shell ha lanciato: quello che ne resta si ferma qui. */
  private async fermaIRimasti(programma: number, prima: Map<number, number>): Promise<void> {
    try {
      await Bun.sleep(ATTESA_DELLA_SHELL_MS)
      const rimasti = orfani(prima, new Set((await this.codex.sistema.processi()).keys()), programma)
      if (rimasti.length > 0) await this.codex.sistema.ferma(rimasti)
    } catch (errore) {
      console.error(`chat di Codex: non riesco a fermare ciò che il comando chiuso ha lasciato acceso: ${fraseDi(errore)}`)
    }
  }

  fermaLavoro = async (id: string): Promise<void> => {
    const processo = this.traduttore.processoDi(id)
    if (this.thread !== null && processo !== null) return this.chiudiIlProcesso(this.thread, processo)
    const giro = this.traduttore.giroDelFiglio(id)
    if (giro !== null) {
      await this.codex.chiedi("turn/interrupt", { threadId: id, turnId: giro })
      return
    }
    throw new ErroreChat(
      409,
      this.traduttore.haFiglio(id)
        ? frase("Questo aiutante non si può fermare: Codex non ha detto a che giro sta lavorando.", "This helper cannot be stopped: Codex did not say which turn it is working on.")
        : frase("Questo comando non si può fermare uno per uno: Codex non ha detto qual è il suo processo.", "This command cannot be stopped on its own: Codex did not say which process it is."),
    )
  }

  chiudi(): void {
    this.chiusa = true
    this.fine.abort()
    // Un programma caduto ha già svuotato le sessioni: non c'è niente da cui disiscriversi, e chiederlo lo riaccenderebbe.
    if (this.thread !== null && this.codex.sessioni.get(this.thread) === this) {
      this.codex.sessioni.delete(this.thread)
      this.codex.disiscrivi(this.thread)
    }
    this.conclusione.resolve()
  }

  cambiaModello = async (modello: string): Promise<void> => {
    this.modello = modello.slice(PREFISSO.length)
  }

  cambiaEffort = async (effort: LivelloEffort | null): Promise<void> => {
    this.effort = effort
  }

  misuraIlContesto = async (): Promise<ContestoUsato | null> => this.traduttore.contesto

  /** Codex chiede al creator di rispondere a una domanda. */
  async domanda(p: Oggetto, ritirata: AbortSignal): Promise<unknown> {
    const risposta = await this.a.chiedi({ tipo: "domanda", id: String(p["itemId"]), domande: domandeDiCodex(p) }, AbortSignal.any([ritirata, this.fine.signal]))
    if (!risposta.consente) throw new Error(risposta.motivo)
    return risposteACodex(p, risposta.risposte ?? {})
  }

  /** Codex chiede il permesso di fare qualcosa. */
  async permesso(metodo: string, p: Oggetto, ritirata: AbortSignal): Promise<unknown> {
    const comando = metodo === "item/commandExecution/requestApproval"
    const strumento = comando ? "Bash" : metodo === "item/fileChange/requestApproval" ? "Edit" : "Permissions"
    const motivo = testo(p["reason"])
    const ingresso: Oggetto = comando ? { command: comandoDi(p) } : { ...(motivo === null ? {} : { description: motivo }), ...(testo(p["grantRoot"]) === null ? {} : { path: p["grantRoot"] }) }
    const risposta = await this.a.chiedi({ tipo: "permesso", id: testo(p["approvalId"]) ?? String(p["itemId"]), strumento, ingresso }, AbortSignal.any([ritirata, this.fine.signal]))
    if (metodo === "item/permissions/requestApproval") return { permissions: risposta.consente ? oggetto(p["permissions"]) : {}, scope: "turn" }
    return { decision: risposta.consente ? "accept" : risposta.ferma ? "cancel" : "decline" }
  }
}

/** Codex per la chat: il suo `app-server` e le conversazioni che tiene, anche quelle aperte dal terminale. */
export class Codex implements Motore {
  readonly id = "codex"
  readonly nomi = NOMI
  readonly prefisso = PREFISSO
  readonly capacita = CAPACITA
  readonly cliente: ClienteCodex
  readonly registro: RegistroDelMotore
  readonly cartelle: { codice: string; lavoro: string }
  readonly adesso: () => Date
  readonly sistema: Sistema
  /** Le conversazioni accese, per thread. */
  readonly sessioni = new Map<string, SessioneDiCodex>()
  /** Le conversazioni che Codex ha per la cartella di lavoro e il registro no (aperte dal terminale), col loro modello. */
  private readonly delTerminale = new Map<string, string | null>()
  private preparato: Promise<void> | null = null
  /** Le disiscrizioni in corso, per thread: chi riprende lo stesso thread aspetta che finiscano. */
  readonly chiusure = new Map<string, Promise<void>>()
  /** Il modello che `model/list` indica come predefinito, col nome della chat: `modelli` lo ricorda per `modelloGrande`. */
  private predefinito: string | null = null

  constructor(o: OpzioniDelMotoreCodex) {
    this.cliente = o.cliente
    this.cartelle = { codice: o.codice, lavoro: o.lavoro }
    this.adesso = o.adesso
    this.sistema = o.sistema ?? sistemaVero
    this.registro = new RegistroDelMotore(o.archivio, this.id, NOMI.programma)
    this.cliente.ascolta((metodo, parametri) => {
      const thread = testo(parametri["threadId"])
      if (thread !== null) {
        const propria = this.sessioni.get(thread)
        return propria ? propria.notifica(metodo, parametri) : this.delGenitore(thread)?.notificaDelFiglio(thread, metodo, parametri)
      }
      // Un thread figlio che nasce è di chi ha il genitore, non di tutte le conversazioni.
      const nato = metodo === "thread/started" ? oggetto(parametri["thread"]) : {}
      const [figlio, genitore] = [testo(nato["id"]), testo(nato["parentThreadId"])]
      if (genitore !== null) return figlio === null ? undefined : (this.sessioni.get(genitore) ?? this.delGenitore(genitore))?.figlioNato(figlio)
      for (const sessione of this.sessioni.values()) sessione.notifica(metodo, parametri)
    })
    this.cliente.rispondi((metodo, parametri, ritirata) => this.gestisci(metodo, parametri, ritirata))
    this.cliente.allaCaduta((errore) => {
      console.error(`chat di Codex: il programma è caduto: ${errore.message}`)
      this.preparato = null
      const sessioni = [...this.sessioni.values()]
      this.sessioni.clear()
      sessioni.forEach((sessione) => sessione.caduto())
    })
  }

  /** La conversazione di cui il thread è un aiutante. */
  private delGenitore(thread: string): SessioneDiCodex | undefined {
    return [...this.sessioni.values()].find((sessione) => sessione.haFiglio(thread))
  }

  /** Le richieste di Codex al creator, di ogni conversazione: ognuna va alla sua per `threadId`. */
  private async gestisci(metodo: string, parametri: Oggetto, ritirata: AbortSignal): Promise<unknown> {
    const sessione = this.sessioni.get(testo(parametri["threadId"]) ?? "")
    if (!sessione) throw new Error(`The request ${metodo} is for a conversation that is not open.`)
    switch (metodo) {
      case "item/tool/requestUserInput":
        return sessione.domanda(parametri, ritirata)
      case "item/commandExecution/requestApproval":
      case "item/fileChange/requestApproval":
      case "item/permissions/requestApproval":
        return sessione.permesso(metodo, parametri, ritirata)
      default:
        throw new Error(`The chat does not answer ${metodo}.`)
    }
  }

  /** Una richiesta a Codex il cui errore è già una frase per il creator. */
  async chiedi<T = Oggetto>(metodo: string, parametri?: unknown): Promise<T> {
    try {
      return await this.cliente.chiedi<T>(metodo, parametri)
    } catch (errore) {
      throw fraseDiCodex(errore)
    }
  }

  /** Le cartelle di skill del prodotto e del creator: Codex le legge solo se glielo si dice, e se ne dimentica quando il programma riparte. */
  preparaIlProgramma(): Promise<void> {
    this.preparato ??= this.cliente.chiedi("skills/extraRoots/set", { extraRoots: this.radiciDelleSkill() }).then(
      () => undefined,
      (errore: unknown) => {
        this.preparato = null
        throw errore
      },
    )
    return this.preparato
  }

  private radiciDelleSkill(): string[] {
    const { codice, lavoro } = this.cartelle
    return (stessaCartella(codice, lavoro) ? [codice] : [codice, lavoro]).map((radice) => join(radice, ".claude", "skills"))
  }

  /** Le skill del prodotto e del creator, col nome senza ciò che precede i due punti. */
  private async elencoSkill(): Promise<Skill[]> {
    await this.preparaIlProgramma().catch((errore: unknown) => {
      throw fraseDiCodex(errore)
    })
    const risposta = await this.chiedi("skills/list", { cwds: [this.cartelle.lavoro], forceReload: true })
    const radici = this.radiciDelleSkill()
    const viste = new Set<string>()
    return oggetti(risposta["data"])
      .flatMap((voce) => oggetti(voce["skills"]))
      .flatMap((s): Skill[] => {
        const [nome, percorso] = [testo(s["name"]), testo(s["path"])]
        if (nome === null || percorso === null || s["enabled"] === false || !radici.some((r) => sotto(percorso, r)) || viste.has(nomeSenzaPrefisso(nome))) return []
        viste.add(nomeSenzaPrefisso(nome))
        return [{ nome: nomeSenzaPrefisso(nome), descrizione: testo(s["description"]) ?? "", percorso }]
      })
  }

  async skill(nome: string): Promise<Skill | undefined> {
    return (await this.elencoSkill()).find((s) => s.nome === nomeSenzaPrefisso(nome))
  }

  async comandi(): Promise<ComandoChat[]> {
    const propri = new Set(COMANDI_DEL_MOTORE.map((c) => c.nome))
    return [...COMANDI_DEL_MOTORE, ...(await this.elencoSkill()).filter((s) => !propri.has(s.nome)).map((s) => ({ nome: s.nome, descrizione: s.descrizione, argomenti: "", alias: [] }))]
  }

  modelloGrande(modelli: ModelloChat[]): string | null {
    return modelli.find((m) => m.id === this.predefinito)?.id ?? null
  }

  /** Smette di seguire il thread presso Codex; resta fra i suoi e si riprende con `thread/resume`. */
  disiscrivi(thread: string): void {
    const chiusura: Promise<void> = this.cliente
      .chiedi("thread/unsubscribe", { threadId: thread })
      .then(
        () => undefined,
        (errore: unknown) => console.error(`chat di Codex: non riesco a chiudere la conversazione ${thread} presso Codex: ${fraseDi(errore)}`),
      )
      .then(() => {
        if (this.chiusure.get(thread) === chiusura) this.chiusure.delete(thread)
      })
    this.chiusure.set(thread, chiusura)
  }

  /** Pronto se risponde e l'account è collegato. */
  async pronto(): Promise<boolean> {
    try {
      return eCollegato(await this.cliente.chiedi<Oggetto>("account/read", {}))
    } catch {
      return false
    }
  }

  apri(apertura: Apertura): SessioneMotore {
    return new SessioneDiCodex(this, apertura)
  }

  private async tuttiIModelli(): Promise<Oggetto[]> {
    const modelli: Oggetto[] = []
    let dopo: string | null = null
    do {
      const pagina: Oggetto = await this.chiedi("model/list", { includeHidden: false, ...(dopo === null ? {} : { cursor: dopo }) })
      modelli.push(...oggetti(pagina["data"]).filter((m) => m["hidden"] !== true))
      dopo = testo(pagina["nextCursor"])
    } while (dopo !== null)
    return modelli
  }

  async modelli(): Promise<ModelloChat[]> {
    const tutti = await this.tuttiIModelli()
    const predefinito = testo(tutti.find((m) => m["isDefault"] === true)?.["model"])
    this.predefinito = predefinito === null ? null : `${PREFISSO}${predefinito}`
    return tutti.flatMap((m): ModelloChat[] => {
      const id = testo(m["model"])
      if (id === null) return []
      const efforts = oggetti(m["supportedReasoningEfforts"]).flatMap((o) => testo(o["reasoningEffort"]) ?? [])
      return [{ id: `${PREFISSO}${id}`, nome: `Codex · ${testo(m["displayName"]) ?? id}`, descrizione: testo(m["description"]) ?? "", motore: this.id, effort: efforts.map(livelloDi), reale: `${PREFISSO}${id}` }]
    })
  }

  /** L'effort che il modello dichiara come predefinito; senza modello, quello del modello predefinito di Codex. */
  async effortPredefinito(modello: string | null): Promise<LivelloEffort | null> {
    const trovato = (await this.tuttiIModelli()).find((m) => (modello === null ? m["isDefault"] === true : m["model"] === modello))
    return trovato === undefined ? null : testo(trovato["defaultReasoningEffort"])
  }

  eSua = async (id: string): Promise<boolean> => (await this.registro.eSua(id)) || this.delTerminale.has(id)

  /** Le conversazioni del registro, più quelle che Codex ha per la cartella di lavoro e che il registro non ha: le ha aperte il terminale. */
  async elenca(): Promise<VoceSessione[]> {
    try {
      const lista = await this.cliente.chiedi<Oggetto>("thread/list", { cwd: this.cartelle.lavoro, limit: 100 })
      // Il registro si legge dopo: un thread nato mentre Codex rispondeva è già di una conversazione della chat, non del terminale.
      const ricordi = await this.registro.tutti()
      const note = new Set([...Object.keys(ricordi), ...Object.values(ricordi).map((r) => r.sessione), ...this.sessioni.keys()])
      const nuovi = oggetti(lista["data"]).flatMap((t): (VoceSessione & { modello: string | null })[] => {
        const id = testo(t["id"])
        if (id === null || note.has(id) || testo(t["parentThreadId"]) !== null) return []
        const secondi = typeof t["updatedAt"] === "number" ? t["updatedAt"] : 0
        return [{ id, titolo: testo(t["name"]) ?? testo(t["preview"]) ?? "", aggiornata: secondi * 1000, modello: testo(t["model"]) }]
      })
      this.delTerminale.clear()
      for (const t of nuovi) this.delTerminale.set(t.id, t.modello)
      return [...(await this.registro.voci()), ...nuovi.map(({ id, titolo, aggiornata }) => ({ id, titolo, aggiornata }))]
    } catch (errore) {
      console.error(`chat di Codex: non riesco a leggere le sue conversazioni: ${fraseDi(errore)}`)
      return this.registro.voci()
    }
  }

  /** Un file dei thread di Codex che cambia fuori dalla chat: l'elenco si rilegge. Le conversazioni accese qui annunciano da sole i loro cambi. */
  osservaConversazioni = async (alCambio: (id: string) => void): Promise<{ chiudi: () => void }> => {
    const nessuno = { chiudi: () => undefined }
    try {
      const casa = await this.cliente.codexHome()
      if (casa === null) {
        console.error("chat di Codex: Codex non ha detto dove tiene le sue conversazioni: l'elenco si rilegge solo quando la chat lo rilegge.")
        return nessuno
      }
      const cartella = join(casa, CARTELLA_DEI_THREAD)
      const dei = async (relativi: string[]) => {
        const fuori = [...new Set(relativi.flatMap((r) => FILE_DEL_THREAD.exec(r)?.[1] ?? []))].filter((t) => !this.sessioni.has(t))
        if (fuori.length === 0) return
        const ricordi = Object.entries(await this.registro.tutti())
        for (const t of fuori) alCambio(ricordi.find(([, r]) => r.sessione === t)?.[0] ?? t)
      }
      const dentro = () => osserva(cartella, { ricorsivo: true, rimbalzoMs: RIMBALZO_MS, ignora: (relativo) => !FILE_DEL_THREAD.test(relativo), alCambio: dei })
      if ((await statistica(cartella)) !== null) return dentro()

      // Codex crea `sessions` col primo thread: se non c'è ancora si guarda la sua nascita nella cartella che la contiene, e poi si guarda dentro.
      let seguendo: { chiudi: () => void } | null = null
      let chiuso = false
      const nata = async () => {
        if (seguendo || chiuso || (await statistica(cartella)) === null) return
        seguendo = dentro()
        nascita.chiudi()
        // I file nati prima che si cominciasse a guardare dentro.
        await dei((await elencaFile(cartella)).map((f) => f.relativo))
      }
      const nascita = osserva(casa, { ricorsivo: false, rimbalzoMs: RIMBALZO_MS, ignora: (relativo) => relativo !== CARTELLA_DEI_THREAD, alCambio: nata })
      // Nata fra il controllo e l'inizio dell'osservazione.
      await nata().catch((errore: unknown) => {
        nascita.chiudi()
        throw errore
      })
      return {
        chiudi: () => {
          chiuso = true
          nascita.chiudi()
          seguendo?.chiudi()
        },
      }
    } catch (errore) {
      console.error(`chat di Codex: non riesco a seguire le sue conversazioni: ${fraseDi(errore)}. L'elenco si rilegge solo quando la chat lo rilegge.`)
      return nessuno
    }
  }

  async leggi(id: string, dove: Parameters<Motore["leggi"]>[1]): Promise<ConversazioneLetta | null> {
    const ricordo = await this.registro.di(id)
    const thread = ricordo?.sessione ?? (this.delTerminale.has(id) ? id : null)
    if (thread === null) return null
    const letto = await this.chiedi("thread/read", { threadId: thread, includeTurns: true })
    const { righe, testiDelCreator } = righeDelThread(oggetto(letto["thread"]), dove.archivio)
    const modello = ricordo?.modello ?? this.delTerminale.get(id) ?? null
    return { messaggi: messaggiDalleRighe(righe, dove.lingua), contestoUsato: ricordo?.contesto ?? null, primoGiro: testiDelCreator.some(eAvvio), modello: modello === null || modello === "" ? null : `${PREFISSO}${modello}` }
  }
}
