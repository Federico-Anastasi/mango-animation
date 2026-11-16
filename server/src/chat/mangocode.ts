// Mango Code come motore della chat (`docs/CHAT.md`, «Mango Code»): il contratto di Mango Code
// (https://github.com/Federico-Anastasi/mango-code/blob/master/docs/INTEGRATION.md) tradotto negli eventi del prodotto.
import { join } from "node:path"
import { eOggetto, jsonDaTesto, leggiTesto } from "../disco"
import { frase, type Frase, type Lingua } from "../lingua"
import { osserva } from "../osservatore"
import type { ComandoChat } from "./comandi"
import { istruzioniDelMetodo, serverVideo, stessaCartella } from "./metodo"
import { istruzioniDellApp, type Apertura, type CapacitaDelMotore, type ConversazioneLetta, type EsitoDelloStrumento, type MessaggioPerIlMotore, type Motore, type NomiDelMotore, type RispostaAlMotore, type SessioneMotore } from "./motore"
import { eAvvio } from "./primoGiro"
import { RegistroDelMotore } from "./registro"
import { messaggiDalleRighe, partiDelTestoDelCreator, type RigaLetta } from "./storico"
import type { Oggetto } from "./traduzione"
import { VociSpente } from "./vociSpente"
import { ErroreChat, type ContestoUsato, type DomandaChat, type ModelloChat, type Parte, type VoceSessione } from "./tipi"

/** Il prefisso dei modelli di Mango Code fra quelli della chat: `mango-code/toq`. */
export const PREFISSO = "mango-code/"

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

/** Il testo e le immagini di un messaggio del creator, come parti di Mango Code. */
const partiDelMessaggio = (messaggio: MessaggioPerIlMotore): Oggetto[] => [
  ...messaggio.immagini.map((i): Oggetto => ({ type: "file", mime: i.tipo, filename: `immagine.${i.tipo.split("/")[1] ?? "png"}`, url: `data:${i.tipo};base64,${i.dati}` })),
  { type: "text", text: messaggio.testo },
]

/** Le domande di Mango Code come le mostra la chat; `null` se non ce n'è nessuna o una non ha il testo. */
function domandeDa(domande: Oggetto[]): DomandaChat[] | null {
  if (domande.length === 0) return null
  const lette = domande.map((d): DomandaChat | null => {
    if (typeof d["question"] !== "string") return null
    const opzioni = (Array.isArray(d["options"]) ? d["options"].filter(eOggetto) : []).flatMap((o) =>
      typeof o["label"] === "string" ? [{ etichetta: o["label"], descrizione: typeof o["description"] === "string" ? o["description"] : "" }] : [],
    )
    return { domanda: d["question"], intestazione: typeof d["header"] === "string" ? d["header"] : "", opzioni, multipla: d["multiple"] === true }
  })
  return lette.every((d): d is DomandaChat => d !== null) ? lette : null
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

class SessioneDiMangoCode implements SessioneMotore {
  private readonly conclusione = Promise.withResolvers<void>()
  readonly finita = this.conclusione.promise
  private readonly coda: MessaggioPerIlMotore[] = []
  private sveglia: ((messaggio: MessaggioPerIlMotore | null) => void) | null = null
  private chiusa = false
  private readonly fine = new AbortController()
  private servizio: Servizio | null = null
  private sessione: string | null = null
  private modello: string
  /** La cartella da cui arriva il metodo: quella di lavoro, o il codice del prodotto se sta altrove. */
  private readonly metodo: string
  private inizioDelGiro = 0
  private readonly ruoli = new Map<string, string>()
  private readonly avviati = new Set<string>()
  private readonly scritto = new Map<string, number>()
  private readonly tipi = new Map<string, string>()
  private messaggioCorrente: string | null = null
  /** Quante volte il messaggio di Mango Code in corso è cambiato: con l'identificativo della parte fa la voce di ogni pezzo. */
  private messaggi = 0
  private erroreDelGiro: string | null = null
  private ultimoContesto = 0
  private contestoDelModello: { modello: string; contesto: number } | null = null

  constructor(
    private readonly o: OpzioniMangoCode,
    private readonly registro: RegistroDelMotore,
    private readonly voci: VociSpente,
    private readonly a: Apertura,
  ) {
    this.modello = (a.modello ?? "").slice(PREFISSO.length)
    this.metodo = stessaCartella(a.codice, a.lavoro) ? a.lavoro : a.codice
    void this.lavora().catch((errore: unknown) => this.rompi(errore instanceof Error ? errore : new Error(String(errore))))
  }

  private rompi(errore: Error): void {
    this.conclusione.reject(errore)
  }

  /** `nonRiuscito` è la frase per il creator se Mango Code risponde con un errore (secondo lo stato); ciò che ha risposto va nel registro. */
  private async chiama(metodo: string, percorso: string, corpo?: unknown, nonRiuscito: (stato: number) => Frase = () => frase("Mango Code non ha preso il messaggio: riprova.", "Mango Code did not take the message: try again.")): Promise<unknown> {
    if (!this.servizio) throw new ErroreChat(502, frase("Mango Code non è collegato.", "Mango Code is not connected."))
    const separatore = percorso.includes("?") ? "&" : "?"
    const r = await fetch(`${this.servizio.agente}${percorso}${separatore}directory=${encodeURIComponent(this.a.lavoro)}`, {
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

  private prossimo(): Promise<MessaggioPerIlMotore | null> {
    const primo = this.coda.shift()
    if (primo) return Promise.resolve(primo)
    if (this.chiusa) return Promise.resolve(null)
    return new Promise((risolvi) => {
      this.sveglia = risolvi
    })
  }

  private async lavora(): Promise<void> {
    const stato = await statoDiMangoCode(this.o.dati)
    if (stato.stato !== "pronto") throw new ErroreChat(502, stato.stato === "nonPronto" ? FRASE_NON_PRONTO : FRASE_SPENTO)
    this.servizio = stato.servizio
    await this.aggiungiGliStrumenti()
    await this.dichiaraIlMetodo()
    await this.voci.spegni(this.a.lavoro)
    await this.ascolta()
    const vecchio = this.a.esiste ? await this.registro.di(this.a.id) : undefined
    this.sessione = vecchio?.sessione ?? null
    if (vecchio && this.modello === "") this.modello = vecchio.modello
    this.a.evento({ tipo: "avvio", modello: `${PREFISSO}${this.modello}`, effort: null })
    const sistema = istruzioniDelMetodo(this.a.lavoro, this.metodo, istruzioniDellApp({ immaginiNegliEsiti: false, strumentoDelleDomande: "question" }))
    for (;;) {
      const messaggio = await this.prossimo()
      if (messaggio === null || this.chiusa) return
      if (this.sessione === null) {
        const titolo = (eAvvio(messaggio.testo) ? "" : messaggio.testo.replace(/^\[Context:[^\]]*\]\s*/, "")).slice(0, 60)
        const creata = await this.chiama("POST", "/session", { title: titolo || "Mango Animation" })
        if (!eOggetto(creata) || typeof creata["id"] !== "string") throw new ErroreChat(502, frase("Mango Code non ha aperto la conversazione: riprova.", "Mango Code did not open the conversation: try again."))
        this.sessione = creata["id"]
        const sessione = this.sessione
        await this.registro.cambia(this.a.id, () => ({ sessione, modello: this.modello, titolo: titolo || "Mango Animation", aggiornata: this.o.adesso().getTime() }))
      }
      this.inizioDelGiro ||= Date.now()
      await this.chiama("POST", `/session/${this.sessione}/prompt_async`, { parts: partiDelMessaggio(messaggio), system: sistema, ...(this.modello ? { model: { providerID: "mango", modelID: this.modello } } : {}) })
      const modello = this.modello
      await this.registro.cambia(this.a.id, (r) => ({ sessione: r?.sessione ?? this.sessione ?? "", modello, titolo: r?.titolo ?? "Mango Animation", aggiornata: this.o.adesso().getTime() }))
    }
  }

  /** La cartella del metodo come cartella in più di Mango Code: vale finché è acceso, e dichiararla di nuovo non cambia niente. */
  private async dichiaraIlMetodo(): Promise<void> {
    if (this.metodo === this.a.lavoro) return
    // Un Mango Code senza le cartelle in più non ha la rotta: è vecchio. Ogni altro errore è di quel momento.
    await this.chiama("PUT", "/mango/extra-folders", { folders: [this.metodo] }, (stato) =>
      stato === 404 || stato === 405
        ? frase("Questa versione di Mango Code è troppo vecchia: aggiornala.", "This version of Mango Code is too old: update it.")
        : frase("Mango Code non ha preso il metodo del prodotto: riprova.", "Mango Code did not take the method of the product: try again."),
    )
  }

  /** Lo strumento «video» passato alla cartella (il server MCP resta finché Mango Code è acceso). */
  private async aggiungiGliStrumenti(): Promise<void> {
    // Uno strumento già collegato non si registra di nuovo: per Mango Code sarebbe un client nuovo, e la sessione terrebbe quello chiuso.
    const presenti = await this.chiama("GET", "/mcp")
    for (const [nome, config] of Object.entries(serverVideo(this.a.codice, this.a.lavoro))) {
      const presente = eOggetto(presenti) ? presenti[nome] : undefined
      if (eOggetto(presente) && presente["status"] === "connected") continue
      await this.chiama("POST", "/mcp", { name: nome, config: { type: "local", enabled: true, command: [config.command, ...(config.args ?? [])], environment: config.env ?? {} } })
    }
  }

  private async ascolta(): Promise<void> {
    if (!this.servizio) return
    const r = await fetch(`${this.servizio.agente}/event?directory=${encodeURIComponent(this.a.lavoro)}`, { headers: CHI_CHIAMA, signal: this.fine.signal }).catch((errore: unknown) => {
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
            if (!eOggetto(evento)) continue
            try {
              this.evento(evento)
            } catch (errore) {
              // Un errore di chi riceve gli eventi non è Mango Code che chiude il collegamento: arriva alla conversazione com'è.
              return this.rompi(errore instanceof Error ? errore : new Error(String(errore)))
            }
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

  /** Mango Code sta scrivendo un messaggio: se è diverso dall'ultimo, la chat lo sa. */
  private inMessaggio(messaggioId: string): void {
    if (this.messaggioCorrente === messaggioId) return
    this.messaggioCorrente = messaggioId
    this.messaggi++
    this.a.evento({ tipo: "attivo" })
  }

  private pezzo(messaggioId: string, parte: string, tipo: string, testo: string): void {
    if (testo === "") return
    this.inMessaggio(messaggioId)
    this.a.evento({ tipo: tipo === "reasoning" ? "pensiero" : "testo", voce: `${this.messaggi}:${parte}`, pezzo: testo })
    this.scritto.set(parte, (this.scritto.get(parte) ?? 0) + testo.length)
  }

  private evento(e: Oggetto): void {
    const p = eOggetto(e["properties"]) ? e["properties"] : {}
    const info = eOggetto(p["info"]) ? p["info"] : null
    const parte = eOggetto(p["part"]) ? p["part"] : null
    const sessione = p["sessionID"] ?? info?.["sessionID"] ?? parte?.["sessionID"]
    if (this.sessione === null || sessione !== this.sessione) return
    switch (e["type"]) {
      case "message.updated": {
        if (info && typeof info["id"] === "string" && typeof info["role"] === "string") this.ruoli.set(info["id"], eRiassunto(info) ? "riassunto" : info["role"])
        const usati = info?.["role"] === "assistant" ? contestoDelPasso(info) : null
        if (usati !== null) {
          this.ultimoContesto = usati
          this.a.evento({ tipo: "contesto", usati })
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
        this.erroreDelGiro = typeof dati["message"] === "string" ? dati["message"] : typeof errore["name"] === "string" ? errore["name"] : "errore senza dettagli"
        return
      }
      case "session.compacted":
        // Il contesto nuovo si sa solo a fine del passo dopo: intanto il vecchio non vale più.
        this.a.evento({ tipo: "riassunto" })
        this.ultimoContesto = 0
        return
      case "session.idle":
        return this.fineDelGiro()
    }
  }

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
      this.inMessaggio(messaggioId)
      this.a.evento({ tipo: "strumento", id: chiamata, nome, ingresso: eOggetto(stato["input"]) ? stato["input"] : {} })
    }
    if (stato["status"] === "completed" || stato["status"] === "error") {
      const errore = stato["status"] === "error"
      const testo = errore ? String(stato["error"] ?? "errore") : typeof stato["output"] === "string" ? stato["output"] : JSON.stringify(stato["output"] ?? "")
      this.a.evento({ tipo: "esito", id: chiamata, esito: { testo, errore, immagini: [] } })
    }
  }

  /** Mango Code dice «inattivo» anche più volte di fila: chiude solo un giro aperto. */
  private fineDelGiro(): void {
    if (this.inizioDelGiro === 0) return
    const durata = Date.now() - this.inizioDelGiro
    this.inizioDelGiro = 0
    const causa = this.erroreDelGiro
    this.erroreDelGiro = null
    this.messaggioCorrente = null
    this.a.evento({ tipo: "fine", errore: causa ? { codice: "errore", causa } : null, durata_ms: durata, inCoda: 0 })
  }

  /** Una domanda di Mango Code diventa i bottoni della chat; una scritta male si rifiuta. */
  private domanda(p: Oggetto): void {
    const id = typeof p["id"] === "string" ? p["id"] : ""
    const domande = Array.isArray(p["questions"]) ? p["questions"].filter(eOggetto) : []
    const lette = domandeDa(domande)
    const risposta: Promise<RispostaAlMotore> = lette === null ? Promise.resolve({ consente: false, motivo: "", ferma: false }) : this.a.chiedi({ tipo: "domanda", id, domande: lette }, this.fine.signal)
    void risposta
      .then((r) => (r.consente ? this.chiama("POST", `/question/${id}/reply`, { answers: risposteDi(domande, r.risposte) }) : this.chiama("POST", `/question/${id}/reject`)))
      // Una domanda che non c'è più (risposta dalla finestra di Mango Code, o dopo un suo riavvio) non rompe la conversazione.
      .catch((errore: unknown) => console.error(`chat di Mango Code: la risposta alla domanda ${id} non è arrivata: ${dettaglioDi(errore)}`))
  }

  /** Un permesso chiesto da Mango Code (solo se le regole della conversazione lo vogliono): la chat lo mostra coi suoi bottoni. */
  private permesso(p: Oggetto): void {
    const id = typeof p["id"] === "string" ? p["id"] : ""
    const strumento = nomeDelloStrumento(typeof p["permission"] === "string" ? p["permission"] : "strumento")
    void this.a
      .chiedi({ tipo: "permesso", id, strumento, ingresso: { patterns: p["patterns"] ?? [] } }, this.fine.signal)
      .then((r) => this.chiama("POST", `/permission/${id}/reply`, r.consente ? { reply: "once" } : { reply: "reject", message: r.motivo }))
      .catch((errore: unknown) => console.error(`chat di Mango Code: la risposta al permesso ${id} non è arrivata: ${dettaglioDi(errore)}`))
  }

  scrivi(messaggio: MessaggioPerIlMotore): void {
    if (this.chiusa) return
    if (!this.sveglia) {
      this.coda.push(messaggio)
      return
    }
    const consegna = this.sveglia
    this.sveglia = null
    consegna(messaggio)
  }

  async ferma(): Promise<void> {
    if (this.sessione) await this.chiama("POST", `/session/${this.sessione}/abort`, undefined, () => frase("Mango Code non ha fermato il lavoro: riprova.", "Mango Code did not stop the job: try again."))
  }

  chiudi(): void {
    this.chiusa = true
    this.fine.abort()
    this.sveglia?.(null)
    this.sveglia = null
    this.conclusione.resolve()
  }

  async cambiaModello(modello: string): Promise<void> {
    this.modello = modello.slice(PREFISSO.length)
  }

  /** Il contesto dell'ultima risposta e quello del modello acceso, scritto nei modelli di Mango Code. */
  async misuraIlContesto(): Promise<ContestoUsato | null> {
    // La misura del modello si chiede una volta per modello: non cambia finché il modello è lo stesso.
    if (this.servizio && this.contestoDelModello?.modello !== this.modello) {
      this.contestoDelModello = { modello: this.modello, contesto: (await contestiDeiModelli(this.servizio, this.a.lavoro)).get(this.modello) ?? 0 }
    }
    if (this.ultimoContesto === 0) return null
    const finestra = this.contestoDelModello?.contesto ?? 0
    return { usati: this.ultimoContesto, totale: finestra > 0 ? finestra : null }
  }
}

const CAPACITA: CapacitaDelMotore = {
  effort: false,
  comandi: true,
  fermaLavoro: false,
  inBackground: false,
  immaginiNegliEsiti: false,
  controlloRemoto: false,
  sottoagenti: false,
  browser: false,
  strumentoDelleDomande: true,
}

/** Mango Code per la chat: le sue conversazioni, i suoi modelli e le conversazioni che tiene. */
export class MangoCode implements Motore {
  readonly id = "mango-code"
  readonly nomi: NomiDelMotore = { programma: "Mango Code", servizio: "Mango Code", menu: "Mango Code", comando: null, nelleFrasi: "Mango Code" }
  readonly prefisso = PREFISSO
  readonly capacita = CAPACITA
  private readonly registro: RegistroDelMotore
  private readonly voci: VociSpente

  constructor(private readonly o: OpzioniMangoCode) {
    this.registro = new RegistroDelMotore(o.archivio, this.id, this.nomi.programma)
    this.voci = new VociSpente(o.archivio)
  }

  async pronto(): Promise<boolean> {
    return (await statoDiMangoCode(this.o.dati)).stato === "pronto"
  }

  apri(apertura: Apertura): SessioneMotore {
    return new SessioneDiMangoCode(this.o, this.registro, this.voci, apertura)
  }

  /** Mango Code non ha comandi suoi da mostrare: quelli che scrive il creator arrivano com'è. */
  async comandi(): Promise<ComandoChat[]> {
    return []
  }

  modelloGrande(): null {
    return null
  }

  /** I modelli di Mango Code se è acceso, altrimenti nessuno (la chat offre solo quelli degli altri motori). */
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
        return [{ id: `${PREFISSO}${m["id"]}`, nome: `Mango Code · ${nome}`, descrizione, motore: this.id, effort: [], reale: `${PREFISSO}${m["id"]}` }]
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
  osservaAccensione(alCambio: () => void): { chiudi: () => void } | null {
    // Una scrittura dà più notifiche, e l'ultima può arrivare a osservatore già partito: avvisa solo se il file è cambiato.
    // `undefined` è un file che non si è potuto leggere: non si sa, quindi si avvisa.
    const leggi = (): Promise<string | null | undefined> => leggiTesto(join(this.o.dati, "service.json")).catch(() => undefined)
    let visto = leggi()
    try {
      return osserva(this.o.dati, {
        ricorsivo: false,
        rimbalzoMs: 200,
        ignora: (relativo) => relativo !== "service.json",
        alCambio: async () => {
          const prima = await visto
          const ora = await leggi()
          visto = Promise.resolve(ora)
          if (ora === undefined || ora !== prima) alCambio()
        },
      })
    } catch {
      return null
    }
  }

  /** La misura del contesto del modello di una sua conversazione; `null` se Mango Code è spento o non la dice. */
  private async contestoDi(id: string, cartella: string): Promise<number | null> {
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

  eSua(id: string): Promise<boolean> {
    return this.registro.eSua(id)
  }

  /** Le conversazioni di Mango Code, dal registro (si vedono anche a Mango Code spento). */
  elenca(): Promise<VoceSessione[]> {
    return this.registro.voci()
  }

  /** Una conversazione di Mango Code riletta da Mango Code; `null` se non è nel registro. */
  async leggi(id: string, dove: { lavoro: string; archivio: string; lingua: Lingua }): Promise<ConversazioneLetta | null> {
    const ricordo = await this.registro.di(id)
    if (!ricordo) return null
    const stato = await statoDiMangoCode(this.o.dati)
    if (stato.stato === "nonPronto") throw new ErroreChat(502, frase("Questa conversazione è di Mango Code, che non è ancora pronto: guarda la sua finestra e riprova.", "This conversation is with Mango Code, which is not ready yet: look at its window and try again."))
    if (stato.stato !== "pronto") throw new ErroreChat(502, frase("Questa conversazione è di Mango Code, che è spento: apri Mango Code per rileggerla.", "This conversation is with Mango Code, which is off: open Mango Code to read it again."))
    const s = stato.servizio
    const r = await fetch(`${s.agente}/session/${ricordo.sessione}/message?directory=${encodeURIComponent(dove.lavoro)}`, { headers: CHI_CHIAMA })
    if (!r.ok) throw new ErroreChat(502, frase(`Mango Code non dà i messaggi della conversazione (${r.status}).`, `Mango Code does not return the messages of the conversation (${r.status}).`))
    const messaggi = ((await r.json()) as unknown[]).filter(eOggetto)
    let usati: number | null = null
    for (const m of messaggi) {
      const contesto = contestoDelMessaggio(m)
      if (contesto !== undefined) usati = contesto
    }
    return {
      messaggi: messaggiDalleRighe(
        messaggi.flatMap((m) => righeDi(m, dove.archivio)),
        dove.lingua,
      ),
      contestoUsato: usati === null ? null : { usati, totale: await this.contestoDi(id, dove.lavoro) },
      primoGiro: messaggi.some((m) => eAvvio(testoDelCreator(m) ?? "")),
      modello: `${PREFISSO}${ricordo.modello}`,
    }
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

const eRiassunto = (info: Oggetto): boolean => info["summary"] === true || info["mode"] === "compaction"

/**
 * Quanto contesto occupa la conversazione dopo un passo di Mango Code: ciò che ha letto, anche dalla cache, più ciò che ha scritto
 * (il ragionamento conta con l'uscita). `null` se il passo non è finito (è a zero), se è il riassunto, i cui token sono quelli della
 * richiesta che lo scrive, o se non dice cosa ha letto.
 */
function contestoDelPasso(info: Oggetto): number | null {
  const tokens = info["tokens"]
  if (typeof info["finish"] !== "string" || info["summary"] === true || !eOggetto(tokens)) return null
  const cache = eOggetto(tokens["cache"]) ? tokens["cache"] : {}
  const n = (v: unknown): number => (typeof v === "number" ? v : 0)
  const letti = n(tokens["input"]) + n(cache["read"]) + n(cache["write"])
  return letti > 0 ? letti + n(tokens["output"]) + n(tokens["reasoning"]) : null
}

const infoDi = (m: Oggetto): Oggetto => (eOggetto(m["info"]) ? m["info"] : {})
const partiDi = (m: Oggetto): Oggetto[] => (Array.isArray(m["parts"]) ? m["parts"].filter(eOggetto) : [])

/** Il testo di un messaggio del creator, senza le istruzioni che Mango Code vi aggiunge; `null` se il messaggio non è suo. */
function testoDelCreator(m: Oggetto): string | null {
  if (typeof infoDi(m)["id"] !== "string" || infoDi(m)["role"] !== "user") return null
  return partiDi(m)
    .flatMap((p) => (p["type"] === "text" && p["synthetic"] !== true && typeof p["text"] === "string" ? [p["text"]] : []))
    .join("\n")
}

/**
 * Cosa un messaggio di Mango Code dice del contesto: i token del passo, se è finito e ha qualcosa da mostrare; `null` se è il riassunto
 * fatto (dopo di lui il contesto non si sa); `undefined` se non dice niente.
 */
function contestoDelMessaggio(m: Oggetto): number | null | undefined {
  const info = infoDi(m)
  if (typeof info["id"] !== "string" || info["role"] === "user") return undefined
  if (eRiassunto(info)) return typeof info["finish"] === "string" ? null : undefined
  const mostrabile = partiDi(m).some((p) => ((p["type"] === "text" || p["type"] === "reasoning") && typeof p["text"] === "string") || p["type"] === "tool")
  return mostrabile ? (contestoDelPasso(info) ?? undefined) : undefined
}

/** Un messaggio di Mango Code come righe di una conversazione riletta: il testo del creator, o ciò che Mango Code ha scritto e gli esiti degli strumenti. */
function righeDi(m: Oggetto, archivio: string): RigaLetta[] {
  const info = infoDi(m)
  const id = info["id"]
  if (typeof id !== "string") return []
  const quando = eOggetto(info["time"]) && typeof info["time"]["created"] === "number" ? new Date(info["time"]["created"]).toISOString() : undefined
  const tempo = quando === undefined ? {} : { quando }
  const testo = testoDelCreator(m)
  if (testo !== null) return testo === "" ? [] : [{ tipo: "creator", id, ...tempo, parti: partiDelTestoDelCreator(testo, archivio) }]
  // Il riassunto fatto, e il passo che riprende ancora no: il contesto di adesso non si sa. Il suo testo è per il modello, non per la chat.
  if (eRiassunto(info)) return typeof info["finish"] === "string" ? [{ tipo: "riassunto" }] : []
  const parti: Parte[] = []
  const esiti: { id: string; esito: EsitoDelloStrumento }[] = []
  for (const p of partiDi(m)) {
    if (p["type"] === "text" && typeof p["text"] === "string" && p["text"] !== "") parti.push({ tipo: "testo", testo: p["text"] })
    if (p["type"] === "reasoning" && typeof p["text"] === "string" && p["text"] !== "") parti.push({ tipo: "pensiero", testo: p["text"] })
    if (p["type"] !== "tool") continue
    const stato = eOggetto(p["state"]) ? p["state"] : {}
    const chiamata = typeof p["callID"] === "string" ? p["callID"] : String(p["id"])
    parti.push({ tipo: "strumento", id: chiamata, nome: nomeDelloStrumento(typeof p["tool"] === "string" ? p["tool"] : "strumento"), ingresso: eOggetto(stato["input"]) ? stato["input"] : {}, ...(quando === undefined ? {} : { iniziato: quando }) })
    if (stato["status"] === "completed") esiti.push({ id: chiamata, esito: { testo: typeof stato["output"] === "string" ? stato["output"] : "", errore: false, immagini: [] } })
    if (stato["status"] === "error") esiti.push({ id: chiamata, esito: { testo: String(stato["error"] ?? "errore"), errore: true, immagini: [] } })
  }
  return [{ tipo: "motore", id, ...tempo, parti }, ...(esiti.length > 0 ? [{ tipo: "esiti" as const, ...tempo, esiti }] : [])]
}
