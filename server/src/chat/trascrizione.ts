// I messaggi di una conversazione e la traduzione degli eventi del motore in Parti. Un messaggio del motore è un giro intero:
// tutto ciò che fa fra un messaggio del creator e la fine; ogni cambio di una Parte è un evento.
import { frase, type Frase, type Lingua } from "../lingua"
import type { ErroreDelGiro, EventoMotore, NomiDelMotore } from "./motore"
import { conEsito } from "./traduzione"
import type { DatiEventoChat, MessaggioChat, Parte } from "./tipi"

export interface FineDelGiro {
  /** I messaggi del creator già in coda che avranno un altro giro. */
  inCoda: number
}

/** Quando si libera il limite dell'abbonamento: l'ora se è oggi, altrimenti il giorno e l'ora. `resetsAt` è in secondi dal 1970. */
function quandoSiLibera(resetsAt: number, adesso: Date): Frase | null {
  const quando = new Date(resetsAt * 1000)
  if (Number.isNaN(quando.getTime()) || quando <= adesso) return null
  const ora = (locale: string) => quando.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })
  if (quando.toDateString() === adesso.toDateString()) return frase(`alle ${ora("it-IT")}`, `at ${ora("en-GB")}`)
  return frase(`${quando.toLocaleDateString("it-IT", { weekday: "long" })} alle ${ora("it-IT")}`, `${quando.toLocaleDateString("en-GB", { weekday: "long" })} at ${ora("en-GB")}`)
}

/** La frase di un giro finito male, nelle due lingue, coi nomi del motore che l'ha dato. */
export function fraseDellErrore(errore: ErroreDelGiro, nomi: NomiDelMotore, adesso: Date): Frase {
  const { programma, servizio } = nomi
  const daTerminale = (cosaIt: string, cosaEn: string) => (nomi.comando === null ? frase("", "") : frase(`: ${cosaIt} da un terminale con «${nomi.comando}»`, `: ${cosaEn} from a terminal with «${nomi.comando}»`))
  const fermato = frase(nomi.nelleFrasi ? `${nomi.nelleFrasi} si è fermato` : "Si è fermato", nomi.nelleFrasi ? `${nomi.nelleFrasi} stopped` : "It stopped")
  switch (errore.codice) {
    case "limite": {
      const quando = errore.finoA === null ? null : quandoSiLibera(errore.finoA, adesso)
      return frase(
        `Hai finito i messaggi che l'abbonamento permette per ora: ${quando ? `si libera ${quando.it}` : "di solito passano alcune ore"}.`,
        `You have used all the messages your subscription allows for now: ${quando ? `it resets ${quando.en}` : "it usually takes a few hours"}.`,
      )
    }
    case "non_collegato":
      return frase(
        `${programma} non è più collegato all'account: chiudi Mango Animation e riaprila, ti porta ad accedere di nuovo.`,
        `${programma} is no longer connected to the account: close Mango Animation and open it again, it will take you to sign in again.`,
      )
    case "sovraccarico":
      return frase(`${servizio} è sovraccarico in questo momento: riprova fra poco.`, `${servizio} is overloaded right now: try again in a moment.`)
    case "pagamento": {
      const come = daTerminale("controllalo", "check it")
      return frase(`L'account di ${servizio} ha un problema di pagamento${come.it}.`, `The ${servizio} account has a billing problem${come.en}.`)
    }
    case "sospeso": {
      const come = daTerminale("controllalo", "check it")
      return frase(`L'account di ${servizio} è sospeso${come.it}.`, `The ${servizio} account is on hold${come.en}.`)
    }
    case "organizzazione":
      return frase(`L'organizzazione di questo account non può usare ${programma}.`, `The organization of this account cannot use ${programma}.`)
    case "verifica": {
      const come = daTerminale("aprila", "open it")
      return frase(`L'account di ${servizio} chiede una verifica${come.it}.`, `The ${servizio} account needs to be verified${come.en}.`)
    }
    case "risposta_troppo_lunga":
      return frase("La risposta era troppo lunga e si è fermata: chiedi di continuare.", "The answer was too long and stopped: ask it to continue.")
    case "non_risposto":
      return frase(`${servizio} non ha risposto (${errore.dettaglio}).`, `${servizio} did not answer (${errore.dettaglio}).`)
    case "troppi_passaggi":
      return frase(`${fermato.it}: ha fatto troppi passaggi in un solo giro. Scrivi «continua» per andare avanti.`, `${fermato.en}: it took too many steps in a single round. Write «continue» to go on.`)
    case "limite_di_spesa":
      return frase(`${fermato.it}: ha raggiunto il limite di spesa del giro.`, `${fermato.en}: it reached the spending limit for the round.`)
    case "fermato": {
      const causa = errore.causa.trim().replace(/[.\s]+$/, "")
      return frase(`${fermato.it}: ${causa || "senza dire altro"}.`, `${fermato.en}: ${causa || "without saying more"}.`)
    }
    case "errore": {
      const causa = errore.causa.trim().replace(/[.\s]+$/, "")
      return frase(`${fermato.it}${causa ? `: ${causa}` : " con un errore"}.`, `${fermato.en}${causa ? `: ${causa}` : " with an error"}.`)
    }
  }
}

/**
 * Il lavoro dei giri nei messaggi: quello misurato nella Parte `fine` (`lavoro_ms`, o la durata se manca) o,
 * per un giro riletto che non lo dice, dal messaggio del creator all'ultima cosa del motore. Con `ultimoInCorso` l'ultimo
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

interface Posto {
  messaggio: MessaggioChat
  indice: number
}

export class Trascrizione {
  /** Il messaggio del motore dove vanno le Parti nuove. */
  private corrente: MessaggioChat | null = null
  /** L'ultimo messaggio del motore nel giro in corso: ci finisce la Parte `fine`, anche se il creator ha scritto sotto nel frattempo. */
  private delGiro: MessaggioChat | null = null
  private progressivo: number
  /** Dove sta la Parte di ogni voce di testo o di pensiero che sta arrivando a pezzi. */
  private readonly voci = new Map<string, Posto>()
  private readonly strumenti = new Map<string, Posto>()
  /** Gli strumenti partiti nel giro in corso: se il creator lo ferma, quelli rimasti senza esito sono stati fermati con lui. */
  private readonly partitiNelGiro = new Set<string>()
  /** Il creator ha fermato il giro: la fine che segue non è un errore. */
  fermata = false

  constructor(
    readonly messaggi: MessaggioChat[],
    private readonly emetti: (dati: DatiEventoChat) => void,
    private readonly adesso: () => Date,
    private readonly nomi: NomiDelMotore,
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

  private sostituisci(posto: Posto, parte: Parte): void {
    posto.messaggio.parti[posto.indice] = parte
    this.emetti({ evento: "parte", messaggio: posto.messaggio.id, indice: posto.indice, parte })
  }

  private aggiungiAlGiro(parte: Parte): Posto {
    this.corrente ??= this.nuovoMessaggio("claude", [])
    this.delGiro = this.corrente
    return { messaggio: this.corrente, indice: this.aggiungi(this.corrente, parte) }
  }

  /** Il messaggio del creator; quello che il motore sta scrivendo si chiude lì, e ciò che segue è un messaggio nuovo sotto. */
  aggiungiMessaggioDelCreator(parti: Parte[]): MessaggioChat {
    this.corrente = null
    return this.nuovoMessaggio("utente", parti)
  }

  /** Un errore che non viene dal giro (il motore si è chiuso): finisce il giro con la sua frase. */
  finisciConErrore(testo: Frase): void {
    this.chiudiGiro({ tipo: "fine", durata_ms: 0, lavoro_ms: this.chiudiIlLavoro(), errore: testo.in(this.lingua()) })
  }

  private chiudiGiro(parte: Parte): void {
    this.aggiungi(this.delGiro ?? this.nuovoMessaggio("claude", []), parte)
    this.corrente = null
    this.delGiro = null
  }

  /** La Parte a quel posto, se sta nel messaggio che il motore sta scrivendo. */
  private parteIn(posto: Posto | undefined): Parte | undefined {
    return posto && posto.messaggio === this.corrente ? posto.messaggio.parti[posto.indice] : undefined
  }

  applica(e: EventoMotore): FineDelGiro | null {
    switch (e.tipo) {
      case "testo":
      case "pensiero":
        this.pezzo(e.tipo, e.voce, e.pezzo)
        return null
      case "strumento":
        this.aggiungiAlGiro({ tipo: "strumento", id: e.id, nome: e.nome, ingresso: e.ingresso, iniziato: this.adesso().toISOString() })
        this.partitiNelGiro.add(e.id)
        return null
      case "ingresso": {
        const posto = this.strumenti.get(e.id)
        const parte = this.parteIn(posto)
        if (posto && parte?.tipo === "strumento") this.sostituisci(posto, { ...parte, ingresso: e.ingresso })
        return null
      }
      case "esito": {
        const posto = this.strumenti.get(e.id)
        const parte = posto?.messaggio.parti[posto.indice]
        if (posto && parte?.tipo === "strumento") this.sostituisci(posto, conEsito(parte, e.esito, this.lingua(), this.adesso().toISOString()))
        return null
      }
      case "uscita":
        this.aggiungiAlGiro({ tipo: "testo", testo: e.testo })
        return null
      case "fine":
        return this.fine(e)
      default:
        return null
    }
  }

  private pezzo(tipo: "testo" | "pensiero", voce: string, pezzo: string): void {
    if (pezzo === "") return
    const posto = this.voci.get(voce)
    const parte = this.parteIn(posto)
    if (posto && parte && (parte.tipo === "testo" || parte.tipo === "pensiero")) {
      this.sostituisci(posto, { tipo: parte.tipo, testo: parte.testo + pezzo })
      return
    }
    this.voci.set(voce, this.aggiungiAlGiro({ tipo, testo: pezzo }))
  }

  private fine(e: Extract<EventoMotore, { tipo: "fine" }>): FineDelGiro {
    if (this.fermata) {
      const fermato = { testo: frase("Fermato prima della fine.", "Stopped before it finished.").in(this.lingua()), errore: true, immagini: [] }
      for (const id of this.partitiNelGiro) {
        const posto = this.strumenti.get(id)
        const parte = posto?.messaggio.parti[posto.indice]
        if (posto && parte?.tipo === "strumento" && parte.esito === undefined && parte.errore === undefined) this.sostituisci(posto, conEsito(parte, fermato, this.lingua(), this.adesso().toISOString()))
      }
    }
    this.partitiNelGiro.clear()
    const errore = this.fermata || e.errore === null ? undefined : fraseDellErrore(e.errore, this.nomi, this.adesso())
    this.chiudiGiro({
      tipo: "fine",
      ...(e.costo === undefined ? {} : { costo: e.costo }),
      durata_ms: e.durata_ms,
      lavoro_ms: this.chiudiIlLavoro(),
      ...(errore === undefined ? {} : { errore: errore.in(this.lingua()) }),
    })
    this.voci.clear()
    this.fermata = false
    return { inCoda: e.inCoda }
  }
}
