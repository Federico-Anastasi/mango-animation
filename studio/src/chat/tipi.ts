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

/** Quanto il motore ha lavorato in tutta la conversazione, senza le attese del creator: `ms` già fatti, `da` l'inizio del tratto in corso. */
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

/** Un lavoro che il motore ha in corso: `background: false` se lo sta aspettando. */
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

export type LivelloEffort = string

/** Un livello di effort che un modello offre, col nome per il creator nelle due lingue. */
export interface LivelloDelModello {
  id: LivelloEffort
  nome: { it: string; en: string }
}

/** Un modello dell'elenco della chat (`GET /api/chat/modelli`); `motore` è l'id del motore che lo offre. */
export interface ModelloChat {
  id: string
  nome: string
  descrizione: string
  effort: LivelloDelModello[]
  reale: string
  motore: string
}

/** Ciò che un motore sa fare: lo studio non offre il resto. */
export interface CapacitaMotore {
  effort: boolean
  comandi: boolean
  ferma_lavoro: boolean
  in_background: boolean
  immagini_negli_esiti: boolean
  controllo_remoto: boolean
  sottoagenti: boolean
  /** Sa usare il browser del creator. */
  browser: boolean
}

/** Un motore della chat (`GET /api/chat/motori`). */
export interface MotoreChat {
  id: string
  /** Come si chiama nel menu dei motori. */
  nome: string
  /** Come lo chiamano le frasi dello studio; `null` se non lo nominano. */
  nelle_frasi: string | null
  /** L'inizio dell'`id` dei suoi modelli; `null` se non hanno prefisso. */
  prefisso: string | null
  /** Risponde adesso. */
  pronto: boolean
  /** L'`id` del modello che indica per il primo giro; `null` se non ne indica uno. */
  modello_grande: string | null
  capacita: CapacitaMotore
}

/** Modello ed effort di una conversazione; `null`: nessuna scelta, vale il predefinito del motore. */
export interface ImpostazioniChat {
  modello: string | null
  effort: LivelloEffort | null
}

/** Un comando con la barra di un motore (`GET /api/chat/comandi?motore=<id>`); `argomenti` è il suggerimento, vuoto se non ne vuole. */
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
  motore: string
}

export interface DettaglioConversazione extends ImpostazioniChat {
  id: string
  motore: string
  titolo: string
  attiva: boolean
  stato: StatoConversazione
  /** Da quando il motore lavora al giro in corso; `null` se non lavora. */
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
