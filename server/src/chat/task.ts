// I lavori che il motore ha in corso (comandi e sottoagenti, in primo piano o in background), seguiti dai suoi eventi `lavoro`.
import type { EventoMotore } from "./motore"
import type { TaskChat } from "./tipi"

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

  /** Il motore si è spento o riparte: i suoi lavori non ci sono più. */
  azzera(): boolean {
    const c = this.voci.size > 0
    this.voci.clear()
    return c
  }

  /** A fine giro nessun lavoro è più in primo piano: se la sua fine non è arrivata, non resta. `true` se l'elenco è cambiato. */
  fineDelGiro(): boolean {
    const prima = this.voci.size
    for (const voce of this.voci.values()) if (!voce.background) this.voci.delete(voce.id)
    return this.voci.size !== prima
  }

  /** `true` se l'elenco è cambiato. */
  applica(e: Extract<EventoMotore, { tipo: "lavoro" }>): boolean {
    const prima = JSON.stringify(this.elenco)
    switch (e.cosa) {
      case "iniziato":
        this.metti(e.id, e.genere, e.descrizione, e.background)
        break
      case "cambiato": {
        const voce = this.voci.get(e.id)
        if (voce) this.voci.set(e.id, { ...voce, background: e.background ?? voce.background, descrizione: e.descrizione ?? voce.descrizione })
        break
      }
      case "uso": {
        // Solo di un lavoro che si mostra: l'avanzamento di uno di servizio o già finito non lo fa comparire.
        const voce = this.voci.get(e.id)
        if (voce) this.voci.set(e.id, { ...voce, uso: e.uso })
        break
      }
      case "finito":
        this.voci.delete(e.id)
        break
      case "in_background": {
        e.lavori.forEach((l) => this.metti(l.id, l.genere, l.descrizione, true))
        const ids = new Set(e.lavori.map((l) => l.id))
        for (const voce of this.voci.values()) if (voce.background && !ids.has(voce.id)) this.voci.delete(voce.id)
        break
      }
    }
    return JSON.stringify(this.elenco) !== prima
  }

  /** Un lavoro che il motore annuncia di nuovo (l'elenco a ogni cambio) resta com'era: l'inizio e l'uso non si perdono. */
  private metti(id: string, tipo: TaskChat["tipo"], descrizione: string, background: boolean): void {
    const prima = this.voci.get(id)
    this.voci.set(id, { id, tipo, descrizione, iniziato: prima?.iniziato ?? this.adesso().toISOString(), background, ...(prima?.uso ? { uso: prima.uso } : {}) })
  }
}
