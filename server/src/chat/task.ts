// I lavori che Claude Code ha in corso (comandi e sottoagenti, in primo piano o in background), seguiti dai messaggi `task_*` dell'SDK.
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk"
import type { TaskChat } from "./tipi"

const TIPI: Record<string, TaskChat["tipo"]> = { local_bash: "comando", local_agent: "agente" }
const tipoDi = (tipo: string | undefined): TaskChat["tipo"] => (tipo === undefined ? "altro" : (TIPI[tipo] ?? "altro"))

/** Un lavoro di servizio, o di un sottoagente, non è ciò che il creator guarda. */
const daMostrare = (m: { ambient?: boolean; skip_transcript?: boolean; parent_task_id?: string }): boolean => m.ambient !== true && m.skip_transcript !== true && m.parent_task_id === undefined

const FINITI = new Set(["completed", "failed", "killed"])

export class ElencoTask {
  private readonly voci = new Map<string, TaskChat>()

  constructor(private readonly adesso: () => Date) {}

  get elenco(): TaskChat[] {
    return [...this.voci.values()]
  }

  get inPrimoPiano(): boolean {
    return this.elenco.some((t) => !t.background)
  }

  ha(id: string): boolean {
    return this.voci.has(id)
  }

  /** Il processo di Claude Code è finito o riparte: i suoi lavori non ci sono più. */
  azzera(): boolean {
    const c = this.voci.size > 0
    this.voci.clear()
    return c
  }

  /** `true` se l'elenco è cambiato. */
  applica(m: SDKMessage): boolean {
    const prima = JSON.stringify(this.elenco)
    // A fine giro nessun lavoro è più in primo piano: se la sua fine non è arrivata, non resta.
    if (m.type === "result") {
      for (const voce of this.voci.values()) if (!voce.background) this.voci.delete(voce.id)
      return JSON.stringify(this.elenco) !== prima
    }
    if (m.type !== "system") return false
    switch (m.subtype) {
      case "task_started":
        if (daMostrare(m)) this.metti(m.task_id, m.task_type, m.description, m.is_backgrounded ?? true)
        break
      case "task_updated": {
        const voce = this.voci.get(m.task_id)
        if (FINITI.has(m.patch.status ?? "")) this.voci.delete(m.task_id)
        else if (voce) this.voci.set(m.task_id, { ...voce, background: m.patch.is_backgrounded ?? voce.background, descrizione: m.patch.description ?? voce.descrizione })
        break
      }
      case "task_notification":
        this.voci.delete(m.task_id)
        break
      case "background_tasks_changed": {
        const vivi = m.tasks.filter(daMostrare)
        vivi.forEach((t) => this.metti(t.task_id, t.task_type, t.description, true))
        const ids = new Set(vivi.map((t) => t.task_id))
        for (const voce of this.voci.values()) if (voce.background && !ids.has(voce.id)) this.voci.delete(voce.id)
        break
      }
    }
    return JSON.stringify(this.elenco) !== prima
  }

  private metti(id: string, tipo: string | undefined, descrizione: string, background: boolean): void {
    this.voci.set(id, { id, tipo: tipoDi(tipo), descrizione, iniziato: this.voci.get(id)?.iniziato ?? this.adesso().toISOString(), background })
  }
}
