// Le forme della chat, come le descrive `docs/CHAT.md`.

export interface ImmagineStrumento {
  media_type: string
  data: string
}

export type Parte =
  | { tipo: "testo"; testo: string }
  | { tipo: "pensiero"; testo: string }
  | { tipo: "strumento"; id: string; nome: string; ingresso: unknown; esito?: unknown; errore?: unknown; immagini?: ImmagineStrumento[]; iniziato?: string; finito?: string }
  | { tipo: "allegato"; percorso: string; immagine: boolean }
  | { tipo: "fine"; costo?: number; durata_ms: number; lavoro_ms?: number; errore?: string }

/** Quanto Claude ha lavorato in tutta la conversazione, senza le attese del creator: `ms` già fatti, `da` l'inizio del tratto in corso. */
export interface TempoDiLavoro {
  ms: number
  da: string | null
}

export type ParteStrumento = Extract<Parte, { tipo: "strumento" }>

export interface Messaggio {
  id: string
  ruolo: "utente" | "claude"
  quando: string
  parti: Parte[]
}

export interface DomandaOpzione {
  etichetta: string
  descrizione?: string
}

export interface DomandaChat {
  domanda: string
  intestazione?: string
  opzioni: DomandaOpzione[]
  multipla?: boolean
}

export type Richiesta =
  | { id: string; tipo: "permesso"; strumento: string; ingresso: unknown; frase: string }
  | { id: string; tipo: "domanda"; domande: DomandaChat[] }

/** Un lavoro che Claude Code ha in corso: `background: false` se Claude lo sta aspettando. */
export interface TaskChat {
  id: string
  tipo: "comando" | "agente" | "altro"
  descrizione: string
  iniziato: string
  background: boolean
  /** Quanto ha usato finora: assente finché il server non ne sa niente. */
  uso?: UsoTask
}

/** I token e gli strumenti che un lavoro ha usato dal suo inizio. */
export interface UsoTask {
  token: number
  strumenti: number
}

export type StatoConversazione = "pronta" | "lavora" | "aspetta" | "errore"

export type LivelloEffort = "low" | "medium" | "high" | "xhigh" | "max"

/** Un modello dell'elenco di Claude Code (`GET /api/chat/modelli`). */
export interface ModelloChat {
  id: string
  nome: string
  descrizione: string
  effort: LivelloEffort[]
  reale: string
}

/** Modello ed effort di una conversazione; `null`: nessuna scelta, vale il predefinito di Claude Code. */
export interface ImpostazioniChat {
  modello: string | null
  effort: LivelloEffort | null
}

/** Un comando con la barra di Claude Code (`GET /api/chat/comandi`); `argomenti` è il suggerimento, vuoto se non ne vuole. */
export interface ComandoChat {
  nome: string
  descrizione: string
  argomenti: string
  alias: string[]
}

export interface VoceConversazione {
  id: string
  titolo: string
  aggiornata: string
  attiva: boolean
}

export interface DettaglioConversazione extends ImpostazioniChat {
  id: string
  titolo: string
  attiva: boolean
  stato: StatoConversazione
  /** Da quando Claude lavora al giro in corso; `null` se non lavora. */
  lavora_da: string | null
  lavoro: TempoDiLavoro
  messaggi: Messaggio[]
  in_attesa: Richiesta[]
  task: TaskChat[]
  contesto_usato: ContestoUsato | null
  /** La conversazione è cominciata con l'avvio del primo giro. */
  primo_giro: boolean
}

/** Quanta memoria del modello occupa la conversazione, in token; `totale` è la misura del suo contesto, `null` finché non si sa. */
export interface ContestoUsato {
  usati: number
  totale: number | null
}

export interface ContestoChat {
  video?: string
  vista?: string
}

export interface AllegatoInviato {
  percorso: string
}

export type SceltaRisposta =
  | { scelta: "consenti" }
  | { scelta: "sempre" }
  | { scelta: "no"; motivo?: string }
  | { scelta: { risposte: Record<string, string> } }

export type EventoChat =
  | { tipo: "chat"; id: string; evento: "messaggio"; messaggio: Messaggio }
  | { tipo: "chat"; id: string; evento: "parte"; messaggio: string; indice: number; parte: Parte }
  | { tipo: "chat"; id: string; evento: "stato"; stato: StatoConversazione; da?: string; lavoro: TempoDiLavoro }
  | ({ tipo: "chat"; id: string; evento: "impostazioni" } & ImpostazioniChat)
  | { tipo: "chat"; id: string; evento: "task"; task: TaskChat[] }
  | { tipo: "chat"; id: string; evento: "richiesta"; richiesta: Richiesta }
  | { tipo: "chat"; id: string; evento: "risposta"; richiesta: string }
  | { tipo: "chat"; id: string; evento: "contesto_usato"; contesto_usato: ContestoUsato | null }
  | { tipo: "chat"; id: string; evento: "titolo"; titolo: string }
  | { tipo: "chat"; id: string; evento: "chiusa" }
  | { tipo: "chat"; id?: string; evento: "elenco" }
