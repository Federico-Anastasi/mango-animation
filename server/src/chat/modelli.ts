// I modelli di tutti i motori e le scelte di modello ed effort di una conversazione (`docs/chat/sessione.md`, «Modello ed effort»).
import { frase, nellaLinguaDi } from "../lingua"
import { manca, type Motore } from "./motore"
import type { Oggetto } from "./traduzione"
import { ErroreChat, MODELLO_PREDEFINITO, type ImpostazioniChat, type LivelloEffort, type ModelloChat } from "./tipi"

/** Ciò che una richiesta cambia: solo i campi presenti. */
export interface Cambi {
  modello?: string
  effort?: LivelloEffort | null
}

export class ElencoModelli {
  constructor(
    private readonly motori: Motore[],
    private readonly lavoro: string,
  ) {}

  /**
   * I modelli di tutti i motori, nell'ordine dei motori. Un motore che non risponde non toglie quelli degli altri; se nessuno ne
   * dà e qualcuno ha fallito, si dà l'errore del primo.
   */
  async elenca(): Promise<ModelloChat[]> {
    const letture = await Promise.allSettled(this.motori.map((m) => m.modelli(this.lavoro)))
    const modelli = letture.flatMap((l) => (l.status === "fulfilled" ? l.value : []))
    const fallita = letture.find((l) => l.status === "rejected")
    if (modelli.length === 0 && fallita) throw fallita.reason
    return modelli
  }

  private static trova(elenco: ModelloChat[], nome: string | null): ModelloChat | undefined {
    return elenco.find((m) => m.id === (nome ?? MODELLO_PREDEFINITO)) ?? elenco.find((m) => m.reale === nome)
  }

  /**
   * Controlla una scelta del creator contro l'elenco: i campi che non esistono, i valori che nessun motore offre, un effort che il
   * modello non ha. Cambiando modello l'effort che il nuovo non ha torna al predefinito.
   */
  async verifica(corpo: Oggetto, corrente: ImpostazioniChat): Promise<Cambi> {
    for (const campo of Object.keys(corpo)) {
      if (campo !== "modello" && campo !== "effort") throw new ErroreChat(400, frase(`«${campo}» non è un'impostazione: ci sono «modello» e «effort».`, `«${campo}» is not a setting: the settings are «modello» and «effort».`))
    }
    const { modello, effort } = corpo
    if (modello === undefined && effort === undefined) throw new ErroreChat(400, frase("Manca cosa cambiare: scrivi «modello» o «effort».", "Nothing to change: write «modello» or «effort»."))
    if (modello !== undefined && typeof modello !== "string") {
      throw new ErroreChat(400, frase("Il «modello» è il nome di uno dei modelli dell'elenco (GET /api/chat/modelli).", "The «modello» is the name of one of the models in the list (GET /api/chat/modelli)."))
    }

    const elenco = await this.elenca()
    if (modello !== undefined && !elenco.some((m) => m.id === modello)) {
      const nomi = (lingua: "it" | "en") => elenco.map((m) => nellaLinguaDi(m.nome, lingua)).join(", ")
      throw new ErroreChat(400, frase(`«${modello}» non è un modello che la chat offre. Quelli che ci sono: ${nomi("it")}.`, `«${modello}» is not a model the chat offers. The available ones: ${nomi("en")}.`))
    }
    const scelto = ElencoModelli.trova(elenco, modello ?? corrente.modello)
    const livello = effort === undefined || effort === null ? effort : this.livelloValido(effort, scelto, elenco)
    const cambi: Cambi = {}
    if (modello !== undefined) cambi.modello = modello
    if (livello !== undefined) cambi.effort = livello
    if (scelto && livello === undefined && modello !== undefined && corrente.effort !== null && !scelto.effort.some((l) => l.id === corrente.effort)) cambi.effort = null
    return cambi
  }

  /** Un effort che è un livello di qualche modello, e che ha anche il modello scelto (se si sa) e il suo motore. */
  private livelloValido(effort: unknown, scelto: ModelloChat | undefined, elenco: ModelloChat[]): string {
    const motore = scelto && this.motori.find((m) => m.id === scelto.motore)
    if (motore && !motore.capacita.effort) throw manca(motore.nomi, "effort")
    const livelli = [...new Set(elenco.flatMap((m) => m.effort.map((l) => l.id)))].join(", ")
    if (typeof effort !== "string") {
      throw new ErroreChat(400, frase(`L'«effort» è uno dei livelli (${livelli}) oppure null per quello predefinito.`, `The «effort» is one of the levels (${livelli}) or null for the default one.`))
    }
    if (!elenco.some((m) => m.effort.some((l) => l.id === effort))) {
      throw new ErroreChat(400, frase(`L'effort «${effort}» non esiste. I livelli sono: ${livelli}.`, `The effort «${effort}» does not exist. The levels are: ${livelli}.`))
    }
    if (scelto && !scelto.effort.some((l) => l.id === effort)) {
      const [nomeIt, nomeEn] = [nellaLinguaDi(scelto.nome, "it"), nellaLinguaDi(scelto.nome, "en")]
      const suoi = scelto.effort.map((l) => l.id).join(", ")
      throw new ErroreChat(
        400,
        scelto.effort.length === 0 ? frase(`${nomeIt} non ha livelli di effort.`, `${nomeEn} has no effort levels.`) : frase(`${nomeIt} non ha l'effort «${effort}». I suoi livelli sono: ${suoi}.`, `${nomeEn} does not have the effort «${effort}». Its levels are: ${suoi}.`),
      )
    }
    return effort
  }
}