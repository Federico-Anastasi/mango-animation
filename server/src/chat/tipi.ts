// Le forme di `docs/CHAT.md` e le dipendenze che il gestore riceve da fuori (i motori).
import { ErroreConFrase, type Frase, type Testo } from "../lingua"
import type { Motore } from "./motore"

export interface ImmagineDelloStrumento {
  media_type: string
  data: string
}

export type Parte =
  | { tipo: "testo"; testo: string }
  | { tipo: "pensiero"; testo: string }
  | { tipo: "strumento"; id: string; nome: string; ingresso: unknown; esito?: string; errore?: string; immagini?: ImmagineDelloStrumento[]; iniziato?: string; finito?: string }
  | { tipo: "allegato"; percorso: string; immagine: boolean }
  | { tipo: "fine"; costo?: number; durata_ms: number; lavoro_ms?: number; errore?: string }

/** Quanto il motore ha lavorato nella conversazione, senza le attese del creator: `ms` già fatti, `da` l'inizio del tratto in corso (`null` se non lavora). */
export interface TempoDiLavoro {
  ms: number
  da: string | null
}

export interface MessaggioChat {
  id: string
  ruolo: "utente" | "claude"
  quando: string
  parti: Parte[]
}

export interface DomandaChat {
  domanda: string
  intestazione: string
  opzioni: { etichetta: string; descrizione: string }[]
  multipla: boolean
}

export type RichiestaChat =
  | { id: string; tipo: "permesso"; strumento: string; ingresso: unknown; frase: string }
  | { id: string; tipo: "domanda"; domande: DomandaChat[] }

/** Un lavoro che il motore ha in corso: in primo piano (la risposta aspetta) o in background (va avanti da sé). */
export interface TaskChat {
  id: string
  tipo: "comando" | "agente" | "altro"
  descrizione: string
  /** ISO. */
  iniziato: string
  background: boolean
  /** Quanto ha usato finora, dai messaggi di avanzamento dell'SDK: assente finché non ne arriva uno. */
  uso?: UsoTask
}

/** I token e gli strumenti che un lavoro ha usato dal suo inizio. */
export interface UsoTask {
  token: number
  strumenti: number
}

export type StatoChat = "pronta" | "lavora" | "aspetta" | "errore"

/** Quanta memoria del modello occupa la conversazione, in token: `totale` è la misura del suo contesto, `null` finché non si sa. */
export interface ContestoUsato {
  usati: number
  totale: number | null
}

/** Un livello di effort di un modello: `id` è ciò che si scrive in `effort`, `nome` come lo chiama lo studio. */
export interface LivelloDiEffort {
  id: string
  nome: { it: string; en: string }
}

/** L'`id` di un livello di effort; `null` al suo posto è il predefinito del modello. */
export type LivelloEffort = string
/** Il «modello» che vuol dire: quello di Claude Code dell'utente. */
export const MODELLO_PREDEFINITO = "default"

/** Un modello che un motore offre (`GET /api/chat/modelli`). */
export interface ModelloChat {
  /** Il nome da dare a `modello`. `default` è quello di Claude Code dell'utente. */
  id: string
  /** Nelle due lingue dove il nome è del prodotto («Predefinito»); gli altri sono quelli del motore. */
  nome: Testo
  descrizione: Testo
  /** L'`id` del motore a cui il modello appartiene. */
  motore: string
  /** Vuoto se il modello non ha livelli di effort. */
  effort: LivelloDiEffort[]
  /** Il modello vero a cui `id` rimanda: è ciò che il motore dice di aver acceso. */
  reale: string
}

/** Un motore come lo studio lo vede (`GET /api/chat/motori`). */
export interface VoceMotore {
  id: string
  /** Nel menu dei motori. */
  nome: string
  /** Come lo nominano le frasi dello studio; `null` se non lo nominano. */
  nelle_frasi: string | null
  /** L'inizio dell'`id` dei suoi modelli; `null` per il motore dei modelli senza prefisso. */
  prefisso: string | null
  pronto: boolean
  /** Il modello che il motore indica per il primo giro. */
  modello_grande: string | null
  capacita: {
    effort: boolean
    comandi: boolean
    ferma_lavoro: boolean
    in_background: boolean
    immagini_negli_esiti: boolean
    controllo_remoto: boolean
    sottoagenti: boolean
    browser: boolean
  }
}

/** Modello ed effort di una conversazione; `null`: nessuna scelta, vale ciò che il motore ha acceso o il suo predefinito. */
export interface ImpostazioniChat {
  modello: string | null
  effort: LivelloEffort | null
}

/** Il messaggio di `GET /api/eventi` per la chat, senza `tipo` e `id` (li mette chi lo manda). */
export type DatiEventoChat =
  | { evento: "messaggio"; messaggio: MessaggioChat }
  | { evento: "parte"; messaggio: string; indice: number; parte: Parte }
  | { evento: "stato"; stato: StatoChat; da?: string; lavoro: TempoDiLavoro }
  | ({ evento: "impostazioni" } & ImpostazioniChat)
  | { evento: "task"; task: TaskChat[] }
  | { evento: "richiesta"; richiesta: RichiestaChat }
  | { evento: "risposta"; richiesta: string }
  | { evento: "contesto_usato"; contesto_usato: ContestoUsato | null }
  | { evento: "titolo"; titolo: string }
  | { evento: "chiusa" }
  | { evento: "elenco" }

export type EventoChat = { tipo: "chat"; id: string } & DatiEventoChat

export interface VoceElenco {
  id: string
  /** L'`id` del motore della conversazione. */
  motore: string
  /** Il titolo scritto, o la frase che ne fa le veci (nelle due lingue). */
  titolo: Testo
  aggiornata: string
  attiva: boolean
}

export interface DettaglioChat extends ImpostazioniChat {
  id: string
  /** L'`id` del motore della conversazione. */
  motore: string
  titolo: Testo
  attiva: boolean
  stato: StatoChat
  /** Da quando il motore lavora al giro in corso (ISO); `null` se non lavora. */
  lavora_da: string | null
  lavoro: TempoDiLavoro
  messaggi: MessaggioChat[]
  in_attesa: RichiestaChat[]
  task: TaskChat[]
  /** `null` se nessuna risposta l'ha ancora detto. */
  contesto_usato: ContestoUsato | null
  /** La conversazione è cominciata con l'avvio del primo giro. */
  primo_giro: boolean
}

export interface VoceSessione {
  id: string
  /** Il titolo che il motore dà alla conversazione, o il suo primo messaggio com'è (con il contesto e gli allegati che il server ha aggiunto). */
  titolo: string
  /** Millisecondi. */
  aggiornata: number
}

/** I motori della chat, nell'ordine in cui lo studio li mostra. */
export interface OpzioniChat {
  motori: Motore[]
}

/** Una frase per il creator, sempre nelle due lingue: `testo` è una `Frase` perché una frase in una lingua sola non si può scrivere. */
export class ErroreChat extends ErroreConFrase {
  declare readonly testo: Frase
  constructor(
    readonly stato: number,
    testo: Frase,
  ) {
    super(testo)
  }
}
