// I file che il creator ha scelto con un gesto: li ha lasciati sulla finestra dell'app o copiati in Esplora risorse. Solo l'app li vede, e
// solo lei, con la sua chiave (`arrivi/chiave-app.json`), può dire al server di quali prendere il percorso: chi ha soltanto la chiave delle
// API non può far leggere al server un file qualunque del computer.
import { resolve } from "node:path"
import { chiaveGiusta } from "./chiave"

const VALIDO_MS = 10 * 60_000
const MASSIMO = 500

const chiaveDi = (percorso: string): string => resolve(percorso).toLowerCase()

export class PercorsiScelti {
  private readonly scelti = new Map<string, number>()

  constructor(
    private readonly chiaveApp: string,
    private readonly adesso: () => number = Date.now,
  ) {}

  /** Vero se `chiave` è quella dell'app e i percorsi sono stati registrati. */
  registra(chiave: string | null, percorsi: string[]): boolean {
    if (!chiaveGiusta(this.chiaveApp, chiave)) return false
    const ora = this.adesso()
    for (const [percorso, scadenza] of this.scelti) if (scadenza <= ora) this.scelti.delete(percorso)
    for (const percorso of percorsi) {
      if (this.scelti.size >= MASSIMO) break
      this.scelti.set(chiaveDi(percorso), ora + VALIDO_MS)
    }
    return true
  }

  /** Il percorso è fra quelli scelti? Vale una volta sola: chi lo usa lo consuma. */
  prendi(percorso: string): boolean {
    const chiave = chiaveDi(percorso)
    const scadenza = this.scelti.get(chiave)
    this.scelti.delete(chiave)
    return scadenza !== undefined && scadenza > this.adesso()
  }
}
