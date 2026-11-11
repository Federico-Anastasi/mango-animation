// Cercare nel parlato di tutto il girato: le parole già trascritte (`preparati/<giorno>/<file>/parole.json`), cercate senza badare a maiuscole e accenti.
// Di ogni file si tiene in memoria solo il testo semplificato (una quindicina di byte a parola); le parole come sono scritte, coi loro tempi, si rileggono
// per i soli file che hanno un risultato. Un file che cambia (data o peso) si ricarica alla ricerca dopo.
import { jsonDaTesto, leggiTesto, statistica } from "./disco"

interface Parola {
  p: string
  da: number
  a: number
}

/** Un file, per la ricerca: `testo` è «␣parola␣parola…» semplificato; la parola `i` comincia al carattere `inizi[i]` ed è la parola `originali[i]` del file. */
interface Voce {
  mtime: number
  byte: number
  parole: number
  testo: string
  inizi: Int32Array
  originali: Int32Array
}

export interface Risultato {
  file: string
  /** Secondo del file in cui comincia ciò che si è trovato, e secondo in cui finisce. */
  da: number
  a: number
  prima: string
  trovato: string
  dopo: string
}

export interface Ricerca {
  risultati: Risultato[]
  /** Quanti risultati ci sono in tutto (`risultati` ne porta al più `massimo`). */
  totale: number
  /** Quanti file col parlato sono stati cercati, e quanti non si sono potuti leggere. */
  cercati: number
  non_letti: number
}

/** Minuscolo, senza accenti, solo lettere e numeri separati da uno spazio: «L'impasto è già così» → «l impasto e gia cosi». */
export const semplifica = (testo: string): string =>
  testo
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()

const PAROLE_ATTORNO = 8
const LETTURE_INSIEME = 16

function eParola(x: unknown): x is Parola {
  const p = x as Partial<Parola> | null
  return typeof p?.p === "string" && typeof p.da === "number" && typeof p.a === "number"
}

function leggiParole(testo: string | null): Parola[] | null {
  const letto = testo === null ? null : jsonDaTesto(testo)
  return Array.isArray(letto?.valore) && letto.valore.every(eParola) ? (letto.valore as Parola[]) : null
}

function costruisci(parole: Parola[], mtime: number, byte: number): Voce {
  const pezzi: string[] = []
  const originali: number[] = []
  parole.forEach((parola, i) => {
    for (const pezzo of semplifica(parola.p).split(" ")) {
      if (pezzo === "") continue
      pezzi.push(pezzo)
      originali.push(i)
    }
  })
  const inizi = new Int32Array(pezzi.length)
  let posto = 1
  pezzi.forEach((pezzo, i) => {
    inizi[i] = posto
    posto += pezzo.length + 1
  })
  return { mtime, byte, parole: parole.length, testo: ` ${pezzi.join(" ")}`, inizi, originali: Int32Array.from(originali) }
}

/** L'indice della parola semplificata che comincia al carattere `posto`. */
function parolaA(voce: Voce, posto: number): number {
  let basso = 0
  let alto = voce.inizi.length - 1
  while (basso < alto) {
    const meta = (basso + alto) >> 1
    if (voce.inizi[meta]! < posto) basso = meta + 1
    else alto = meta
  }
  return basso
}

interface Trovata {
  chiave: string
  percorso: string
  voce: Voce
  /** L'indice della prima parola semplificata trovata e quante sono. */
  da: number
  quante: number
}

export class Parlato {
  private readonly voci = new Map<string, Voce>()

  /**
   * Cerca `domanda` (parole di fila: tutte intere tranne l'ultima, che può essere l'inizio di una parola) nei file `file` (`[chiave «giorno/nome», percorso di parole.json]`).
   * Dà al più `massimo` risultati, nell'ordine dei file dati e, in ogni file, del tempo.
   */
  async cerca(domanda: string, file: Array<[string, string]>, massimo: number): Promise<Ricerca> {
    const parole = semplifica(domanda)
    if (parole === "") return { risultati: [], totale: 0, cercati: 0, non_letti: 0 }
    const ago = ` ${parole}`
    const quante = parole.split(" ").length
    const { caricati, nonLetti } = await this.carica(file)
    const trovate: Trovata[] = []
    let totale = 0
    for (const [chiave, percorso] of file) {
      const voce = caricati.get(chiave)
      if (!voce) continue
      for (let posto = voce.testo.indexOf(ago); posto >= 0; posto = voce.testo.indexOf(ago, posto + 1)) {
        totale++
        if (trovate.length < massimo) trovate.push({ chiave, percorso, voce, da: parolaA(voce, posto + 1), quante })
      }
    }
    return { risultati: await this.mostra(trovate), totale, cercati: caricati.size, non_letti: nonLetti }
  }

  /** Per ogni file la voce aggiornata, e quanti file ci sono ma non si leggono. Un file che non c'è più non conta e non resta in memoria. */
  private async carica(file: Array<[string, string]>): Promise<{ caricati: Map<string, Voce>; nonLetti: number }> {
    const caricati = new Map<string, Voce>()
    let nonLetti = 0
    let prossimo = 0
    const lavora = async (): Promise<void> => {
      for (let i = prossimo++; i < file.length; i = prossimo++) {
        const [chiave, percorso] = file[i]!
        const stato = await statistica(percorso)
        if (stato === null) continue
        let voce = this.voci.get(chiave)
        if (!voce || voce.mtime !== stato.mtimeMs || voce.byte !== stato.size) {
          const parole = leggiParole(await leggiTesto(percorso))
          if (parole === null) {
            this.voci.delete(chiave)
            nonLetti++
            continue
          }
          voce = costruisci(parole, stato.mtimeMs, stato.size)
          this.voci.set(chiave, voce)
        }
        caricati.set(chiave, voce)
      }
    }
    await Promise.all(Array.from({ length: Math.min(LETTURE_INSIEME, file.length) }, lavora))
    const chiavi = new Set(file.map(([chiave]) => chiave))
    for (const chiave of this.voci.keys()) if (!chiavi.has(chiave)) this.voci.delete(chiave)
    return { caricati, nonLetti }
  }

  /** Le parole come sono scritte, coi loro tempi, intorno a ogni risultato: si rileggono i file che ne hanno. */
  private async mostra(trovate: Trovata[]): Promise<Risultato[]> {
    const scritte = new Map<string, Parola[] | null>()
    await Promise.all([...new Map(trovate.map((t) => [t.chiave, t.percorso])).entries()].map(async ([chiave, percorso]) => scritte.set(chiave, leggiParole(await leggiTesto(percorso)))))
    return trovate.flatMap(({ chiave, voce, da, quante }) => {
      const parole = scritte.get(chiave)
      // Il file è cambiato fra la ricerca e la rilettura: il risultato non si può mostrare, e alla prossima ricerca si ricarica.
      if (!parole || parole.length !== voce.parole) return []
      const primo = voce.originali[da]!
      const ultimo = voce.originali[da + quante - 1]!
      const testo = (daParola: number, aParola: number): string => parole.slice(Math.max(daParola, 0), aParola).map((p) => p.p.trim()).join(" ")
      return [
        {
          file: chiave,
          da: Math.round(parole[primo]!.da * 100) / 100,
          a: Math.round(parole[ultimo]!.a * 100) / 100,
          prima: testo(primo - PAROLE_ATTORNO, primo),
          trovato: testo(primo, ultimo + 1),
          dopo: testo(ultimo + 1, ultimo + 1 + PAROLE_ATTORNO),
        },
      ]
    })
  }
}
