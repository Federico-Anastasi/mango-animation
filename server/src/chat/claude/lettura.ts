// Ciò che Claude Code dice di sé all'avvio, i modelli e i comandi con la barra: una `query` senza messaggi, subito chiusa, letta una volta sola.
import type { ModelInfo, SlashCommand } from "@anthropic-ai/claude-agent-sdk"
import { dettaglioDi, frase } from "../../lingua"
import { ErroreChat } from "../tipi"
import { IngressoDiMessaggi } from "./ingresso"
import type { FunzioneQuery } from "./query"

const ATTESA_MS = 30_000

export interface AvvioDiClaudeCode {
  modelli: ModelInfo[]
  comandi: SlashCommand[]
}

export class LetturaDiClaudeCode {
  private letto: Promise<AvvioDiClaudeCode> | null = null

  constructor(private readonly query: FunzioneQuery) {}

  /** Si legge una volta sola, dalla cartella di lavoro della prima richiesta. Una lettura che fallisce non si ricorda: la richiesta dopo riprova. */
  leggi(lavoro: string): Promise<AvvioDiClaudeCode> {
    this.letto ??= this.avvia(lavoro).catch((errore: unknown) => {
      this.letto = null
      const d = dettaglioDi(errore)
      throw errore instanceof ErroreChat ? errore : new ErroreChat(502, frase(`Claude Code ha dato un errore: ${d.it}`, `Claude Code gave an error: ${d.en}`))
    })
    return this.letto
  }

  private async avvia(lavoro: string): Promise<AvvioDiClaudeCode> {
    const ingresso = new IngressoDiMessaggi()
    const query = this.query({ prompt: ingresso, options: { cwd: lavoro, settingSources: ["user", "project", "local"] } })
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
