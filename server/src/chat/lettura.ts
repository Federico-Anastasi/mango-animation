// Ciò che Claude Code dice di sé all'avvio, i modelli e i comandi con la barra: una `query` senza messaggi, subito chiusa, letta una volta sola.
import type { ModelInfo, SlashCommand } from "@anthropic-ai/claude-agent-sdk"
import { dettaglioDi, frase } from "../lingua"
import { IngressoDiMessaggi } from "./ingresso"
import { ErroreChat, type FunzioneQuery } from "./tipi"

const ATTESA_MS = 30_000

export interface AvvioDiClaudeCode {
  modelli: ModelInfo[]
  comandi: SlashCommand[]
}

export class LetturaDiClaudeCode {
  private letto: Promise<AvvioDiClaudeCode> | null = null

  constructor(
    private readonly query: FunzioneQuery,
    private readonly lavoro: string,
  ) {}

  /** Una lettura che fallisce non si ricorda: la richiesta dopo riprova. */
  leggi(): Promise<AvvioDiClaudeCode> {
    this.letto ??= this.avvia().catch((errore: unknown) => {
      this.letto = null
      const d = dettaglioDi(errore)
      throw errore instanceof ErroreChat ? errore : new ErroreChat(502, frase(`Claude Code ha dato un errore: ${d.it}`, `Claude Code gave an error: ${d.en}`))
    })
    return this.letto
  }

  private async avvia(): Promise<AvvioDiClaudeCode> {
    const ingresso = new IngressoDiMessaggi()
    const query = this.query({ prompt: ingresso, options: { cwd: this.lavoro, settingSources: ["user", "project", "local"] } })
    let scaduto: ReturnType<typeof setTimeout> | undefined
    try {
      const attesa = new Promise<never>((_, rifiuta) => {
        scaduto = setTimeout(() => rifiuta(new ErroreChat(502, frase("Claude Code non risponde.", "Claude Code is not answering."))), ATTESA_MS)
      })
      const [modelli, comandi] = await Promise.race([Promise.all([query.supportedModels(), query.supportedCommands()]), attesa])
      return { modelli, comandi }
    } finally {
      clearTimeout(scaduto)
      ingresso.chiudi()
      query.close()
    }
  }
}
