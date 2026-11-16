// Ciò che la chat usa dell'Agent SDK di Claude Code: la funzione `query`, le conversazioni dei suoi file e la misura del contesto.
import type { EffortLevel, ModelInfo, Options, SDKMessage, SDKUserMessage, SlashCommand } from "@anthropic-ai/claude-agent-sdk"
import type { VoceSessione } from "../tipi"

/** Della misura del contesto che dà Claude Code (`getContextUsage`) servono il totale usato e la finestra. */
export interface MisuraDelContesto {
  totalTokens: number
  rawMaxTokens: number
}

/** Della `Query` dell'SDK serve solo questo. */
export interface QueryChat extends AsyncIterable<SDKMessage> {
  interrupt: () => Promise<unknown>
  close: () => void
  setModel: (modello?: string) => Promise<void>
  /** L'effort a conversazione aperta: `null` torna al predefinito del modello. */
  applyFlagSettings: (impostazioni: { effortLevel: EffortLevel | null }) => Promise<void>
  supportedModels: () => Promise<ModelInfo[]>
  supportedCommands: () => Promise<SlashCommand[]>
  stopTask: (idLavoro: string) => Promise<void>
  backgroundTasks: (idStrumento?: string) => Promise<boolean>
  getContextUsage: (opzioni: { detail: "summary" }) => Promise<MisuraDelContesto>
  /** Il collegamento all'app di Claude (Remote Control): Claude Code lo apre da sé con il suo login. L'SDK ce l'ha ma non lo dichiara nei tipi. */
  enableRemoteControl?: (acceso: boolean, nome?: string) => Promise<unknown>
}

export type FunzioneQuery = (parametri: { prompt: AsyncIterable<SDKUserMessage>; options: Options }) => QueryChat

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
