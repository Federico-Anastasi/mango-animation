// Cosa entra nel prompt di Mango Code per la cartella di lavoro (`docs/CHAT.md`, «Mango Code»): le app non possono spegnere voci dalla
// rotta, quindi i server MCP che il metodo non usa si spengono nel file `.mango/settings.json` della cartella (https://github.com/Federico-Anastasi/mango-code/blob/master/docs/INTEGRATION.md,
// «What goes into the prompt»).
import { join } from "node:path"
import { jsonDaTesto, leggiTesto, scrivi, testoJson } from "../disco"
import { cartellaDellaChat } from "./allegati"
import { ErroreChat } from "./tipi"
import { eOggetto, type Oggetto } from "./traduzione"

/** I server MCP di Mango Code che il metodo non usa e che pesano nel prompt a ogni richiesta (`web-search` resta acceso). */
export const SERVER_SPENTI: readonly string[] = ["chrome-devtools", "documenti"]

const FRASE_NON_SI_LEGGE = "Il file .mango/settings.json della cartella di lavoro non si legge: correggilo o toglilo, poi riscrivi il messaggio."

/** La sezione `nome` di un oggetto del file; assente è vuota, di un'altra forma è un file che Mango Code stesso rifiuterebbe. */
function sezione(padre: Oggetto, nome: string): Oggetto {
  const valore = padre[nome]
  if (valore === undefined) return {}
  if (!eOggetto(valore)) throw new ErroreChat(502, FRASE_NON_SI_LEGGE)
  return valore
}

/**
 * Spegne ogni voce di `SERVER_SPENTI` una volta sola per cartella di lavoro. Se il creator la riaccende dalla pagina di Mango Code («solo
 * questa cartella») la pagina toglie la voce dal file: la voce assente non dice quindi «mai spenta», e quel che dice «già fatto» è il
 * ricordo in `archivio/.chat/`. Una voce già scritta nel file, vera o falsa, è del creator e non si tocca.
 */
export class VociSpente {
  private coda: Promise<void> = Promise.resolve()
  private readonly ricordo: string

  constructor(private readonly archivio: string) {
    this.ricordo = join(archivio, ".chat", "mango-code-voci-spente.json")
  }

  /** Le conversazioni che partono insieme leggono e scrivono il file una alla volta. */
  spegni(cartella: string): Promise<void> {
    const fatto = this.coda.then(() => this.applica(cartella))
    this.coda = fatto.catch(() => undefined)
    return fatto
  }

  private async fatte(): Promise<string[]> {
    const testo = await leggiTesto(this.ricordo)
    const letto = testo === null ? null : jsonDaTesto(testo)
    return letto && Array.isArray(letto.valore) ? letto.valore.filter((v): v is string => typeof v === "string") : []
  }

  private async applica(cartella: string): Promise<void> {
    const fatte = await this.fatte()
    const daFare = SERVER_SPENTI.filter((nome) => !fatte.includes(nome))
    if (daFare.length === 0) return
    const file = join(cartella, ".mango", "settings.json")
    const testo = await leggiTesto(file)
    const letto = testo === null ? { valore: {} } : jsonDaTesto(testo.replace(/^﻿/, ""))
    if (!letto || !eOggetto(letto.valore)) throw new ErroreChat(502, FRASE_NON_SI_LEGGE)
    const prompt = sezione(letto.valore, "prompt")
    const mcp = sezione(prompt, "mcp")
    const nuove = daFare.filter((nome) => !(nome in mcp))
    if (nuove.length > 0) await scrivi(file, testoJson({ ...letto.valore, prompt: { ...prompt, mcp: { ...mcp, ...Object.fromEntries(nuove.map((nome) => [nome, false])) } } }))
    await cartellaDellaChat(this.archivio)
    await scrivi(this.ricordo, testoJson([...fatte, ...daFare]))
  }
}
