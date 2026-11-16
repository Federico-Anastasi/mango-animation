// Quale conversazione della chat è quale presso un motore che dà lui l'identificativo alle sue conversazioni: un file per motore,
// `archivio/.chat/<id del motore>.json`.
import { join } from "node:path"
import { eOggetto, jsonDaTesto, leggiTesto, rinomina, scrivi, testoJson } from "../disco"
import { cartellaDellaChat } from "./allegati"
import type { Oggetto } from "./traduzione"
import type { ContestoUsato, VoceSessione } from "./tipi"

export interface Ricordo {
  /** L'identificativo della conversazione presso il motore. */
  sessione: string
  /** Il modello com'è per il motore, senza il prefisso della chat. */
  modello: string
  titolo: string
  aggiornata: number
  /** L'ultima misura del contesto; `null` dopo un riassunto, assente finché il motore non ne ha data una. */
  contesto?: ContestoUsato | null
}

function contestoDi(valore: unknown): { contesto: ContestoUsato | null } | null {
  if (valore === null) return { contesto: null }
  if (!eOggetto(valore) || typeof valore["usati"] !== "number" || (valore["totale"] !== null && typeof valore["totale"] !== "number")) return null
  return { contesto: { usati: valore["usati"], totale: valore["totale"] } }
}

export class RegistroDelMotore {
  private scrittura: Promise<void> = Promise.resolve()
  private readonly percorso: string

  /** `nome` è come il motore si chiama nel registro del server. */
  constructor(
    private readonly archivio: string,
    id: string,
    private readonly nome: string,
  ) {
    this.percorso = join(archivio, ".chat", `${id}.json`)
  }

  /** Il file com'è, `{}` se non c'è; `null` se c'è ma non è un oggetto JSON. */
  private async leggi(): Promise<Oggetto | null> {
    const testo = await leggiTesto(this.percorso)
    if (testo === null) return {}
    const letto = jsonDaTesto(testo)
    return letto && eOggetto(letto.valore) ? letto.valore : null
  }

  async tutti(): Promise<Record<string, Ricordo>> {
    const valore = await this.leggi()
    if (valore === null) {
      console.error(`chat di ${this.nome}: ${this.percorso} non si legge: le conversazioni di ${this.nome} non compaiono nell'elenco finché non si scrive di nuovo.`)
      return {}
    }
    return Object.fromEntries(
      Object.entries(valore).flatMap(([id, r]) =>
        eOggetto(r) && typeof r["sessione"] === "string" && typeof r["modello"] === "string" && typeof r["titolo"] === "string" && typeof r["aggiornata"] === "number"
          ? [[id, { sessione: r["sessione"], modello: r["modello"], titolo: r["titolo"], aggiornata: r["aggiornata"], ...contestoDi(r["contesto"]) }]]
          : [],
      ),
    )
  }

  async di(id: string): Promise<Ricordo | undefined> {
    return (await this.tutti())[id]
  }

  async eSua(id: string): Promise<boolean> {
    return (await this.di(id)) !== undefined
  }

  /** Le conversazioni del registro, per l'elenco della chat. */
  async voci(): Promise<VoceSessione[]> {
    return Object.entries(await this.tutti()).map(([id, r]) => ({ id, titolo: r.titolo, aggiornata: r.aggiornata }))
  }

  /** Un errore di scrittura va nel registro del server e non blocca le scritture dopo. */
  cambia(id: string, cambio: (vecchio: Ricordo | undefined) => Ricordo): Promise<void> {
    this.scrittura = this.scrittura
      .then(async () => {
        await cartellaDellaChat(this.archivio)
        // Un file che non si legge non si riscrive in silenzio: resta accanto, con un altro nome.
        if ((await this.leggi()) === null) {
          const messo = `${this.percorso}.illeggibile`
          await rinomina(this.percorso, messo)
          console.error(`chat di ${this.nome}: ${this.percorso} non si leggeva ed è stato messo da parte in ${messo}.`)
        }
        const tutti = await this.tutti()
        await scrivi(this.percorso, testoJson({ ...tutti, [id]: cambio(tutti[id]) }))
      })
      .catch((errore) => console.error(`chat di ${this.nome}: non riesco a scrivere ${this.percorso}: ${errore instanceof Error ? errore.message : String(errore)}`))
    return this.scrittura
  }
}
