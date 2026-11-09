// Le forme di `docs/CHAT.md` e le dipendenze che il gestore riceve da fuori (la funzione `query` dell'SDK e la lettura delle sessioni).
import type { EffortLevel, ModelInfo, Options, SDKMessage, SDKUserMessage, SlashCommand } from "@anthropic-ai/claude-agent-sdk"
import type { Testo } from "../lingua"
import type { MangoCode } from "./mangocode"

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

/** Quanto Claude ha lavorato nella conversazione, senza le attese del creator: `ms` già fatti, `da` l'inizio del tratto in corso (`null` se non lavora). */
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

/** Un lavoro che Claude Code ha in corso: in primo piano (la risposta aspetta) o in background (va avanti da sé). */
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

/** Della misura del contesto che dà Claude Code (`getContextUsage`) servono il totale usato e la finestra. */
export interface MisuraDelContesto {
  totalTokens: number
  rawMaxTokens: number
}

export type LivelloEffort = EffortLevel
/** Il «modello» che vuol dire: quello di Claude Code dell'utente. */
export const MODELLO_PREDEFINITO = "default"
export const LIVELLI_EFFORT: readonly LivelloEffort[] = ["low", "medium", "high", "xhigh", "max"]

/** Un modello che Claude Code offre (`GET /api/chat/modelli`). */
export interface ModelloChat {
  /** Il nome da dare a `modello`. `default` è quello di Claude Code dell'utente. */
  id: string
  /** Nelle due lingue dove il nome è del prodotto («Predefinito»); gli altri sono quelli di Claude Code. */
  nome: Testo
  descrizione: string
  /** Vuoto se il modello non ha livelli di effort. */
  effort: LivelloEffort[]
  /** Il modello vero a cui `id` rimanda: è ciò che Claude Code dice di aver acceso. */
  reale: string
}

/** Modello ed effort di una conversazione; `null`: nessuna scelta, vale ciò che Claude Code ha acceso o il suo predefinito. */
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
  titolo: string
  aggiornata: string
  attiva: boolean
}

export interface DettaglioChat extends ImpostazioniChat {
  id: string
  titolo: string
  attiva: boolean
  stato: StatoChat
  /** Da quando Claude lavora al giro in corso (ISO); `null` se non lavora. */
  lavora_da: string | null
  lavoro: TempoDiLavoro
  messaggi: MessaggioChat[]
  in_attesa: RichiestaChat[]
  task: TaskChat[]
  /** `null` se nessuna risposta l'ha ancora detto. */
  contesto_usato: ContestoUsato | null
}

/** Della `Query` dell'SDK serve solo questo. */
export interface QueryChat extends AsyncIterable<SDKMessage> {
  interrupt: () => Promise<unknown>
  close: () => void
  setModel: (modello?: string) => Promise<void>
  /** L'effort a conversazione aperta: `null` torna al predefinito del modello. */
  applyFlagSettings: (impostazioni: { effortLevel: LivelloEffort | null }) => Promise<void>
  supportedModels: () => Promise<ModelInfo[]>
  supportedCommands: () => Promise<SlashCommand[]>
  stopTask: (idLavoro: string) => Promise<void>
  backgroundTasks: (idStrumento?: string) => Promise<boolean>
  getContextUsage: (opzioni: { detail: "summary" }) => Promise<MisuraDelContesto>
}

export type FunzioneQuery = (parametri: { prompt: AsyncIterable<SDKUserMessage>; options: Options }) => QueryChat

export interface VoceSessione {
  id: string
  /** Il titolo che Claude Code dà alla conversazione, o il suo primo messaggio com'è nel file (con il contesto e gli allegati che il server ha aggiunto). */
  titolo: string
  /** Millisecondi. */
  aggiornata: number
}

/** Un messaggio di un file di conversazione; i campi oltre a questi non servono alla chat. */
export interface MessaggioSessione {
  type: string
  /** Delle righe `system`, solo quelle che la chat legge: `local_command` e `compact_boundary`. */
  subtype?: string
  /** Delle righe `system`: il testo, con i tag `<local-command-stdout>` per un comando locale. */
  content?: string
  uuid: string
  message: unknown
  timestamp?: string
  origin?: { kind?: string }
  /** Il riassunto che Claude Code scrive per sé dopo `/compact`: non è un messaggio del creator. */
  isCompactSummary?: boolean
}

export interface Sessioni {
  elenca: () => Promise<VoceSessione[]>
  /** `null` se la conversazione non c'è. */
  leggi: (id: string) => Promise<MessaggioSessione[] | null>
  /** Avvisa quando il file di una conversazione cambia (anche per quelle aperte da terminale). */
  osserva: (alCambio: (id: string) => void) => Promise<{ chiudi: () => void }>
}

export interface OpzioniChat {
  query: FunzioneQuery
  sessioni: Sessioni
  mangoCode: MangoCode
}

export class ErroreChat extends Error {
  constructor(
    readonly stato: number,
    messaggio: string,
  ) {
    super(messaggio)
  }
}
