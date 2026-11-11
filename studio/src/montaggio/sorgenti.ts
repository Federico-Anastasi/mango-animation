// Ciò che l'anteprima sa dei file del girato usati da un piano: le misure, e quali copie preparate esistono.
import { urlMedia } from "../api"
import type { GiornoGrezzo, Sorgente, Tratto } from "../tipi"

export interface InfoSorgente {
  nome: string
  file: string
  larghezza: number | null
  altezza: number | null
  durata: number | null
  /** Lo sfasamento del piano fra i tempi della trascrizione e quelli del file (secondi, 0 se non c'è). */
  sfasamento: number
  /** Le parole di questo file sono già state trascritte. */
  parole: boolean
  /** Le copie preparate, già come indirizzi; `null` se il file non le ha. */
  leggero: string | null
  /** La sagoma di prima: un file solo con ogni fotogramma al suo istante. */
  sagoma: string | null
  /** I pezzi di sagoma preparati, già come indirizzi; `null` se non c'è l'elenco. */
  sagomaPezzi: Array<{ da: number; a: number; url: string; inizio: number }> | null
  miniatura: string | null
  /** Il percorso dell'onda della voce, per leggerla. */
  onda: string | null
  /** Il file non è nel girato: il piano lo cita ma non c'è. */
  trovato: boolean
}

export function infoSorgenti(sorgenti: Record<string, Sorgente>, giorni: GiornoGrezzo[]): Record<string, InfoSorgente> {
  const perFile = new Map(giorni.flatMap((g) => g.file.map((f) => [f.file, f] as const)))
  return Object.fromEntries(
    Object.entries(sorgenti).map(([nome, s]) => {
      const f = perFile.get(s.file)
      const indirizzo = (percorso: string | null | undefined) => (percorso ? urlMedia(percorso) : null)
      const info: InfoSorgente = {
        nome,
        file: s.file,
        larghezza: f?.scheda?.largo ?? null,
        altezza: f?.scheda?.alto ?? null,
        durata: f?.scheda?.durata ?? null,
        sfasamento: s.sfasamento ?? 0,
        parole: Boolean(f?.preparato.parole),
        leggero: indirizzo(f?.preparato.leggero),
        sagoma: indirizzo(f?.preparato.sagoma),
        sagomaPezzi: f?.preparato.sagoma_pezzi?.map((p) => ({ da: p.da, a: p.a, url: urlMedia(p.file), inizio: p.inizio })) ?? null,
        miniatura: indirizzo(f?.preparato.miniatura),
        onda: f?.preparato.onda ?? null,
        trovato: f !== undefined,
      }
      return [nome, info]
    }),
  )
}

const TOLLERANZA_S = 1e-3

/** Il file di sagoma che porta i secondi `da`–`a` della ripresa, e il secondo della ripresa a cui il file comincia; `null` se nessuno li porta.
 * Con l'elenco dei pezzi conta solo quello; senza, vale la sagoma di prima, che copre tutta la ripresa. */
export function sagomaDi(info: InfoSorgente | undefined, da: number, a: number): { url: string; inizio: number } | null {
  if (!info) return null
  if (info.sagomaPezzi === null) return info.sagoma === null ? null : { url: info.sagoma, inizio: 0 }
  const pezzo = info.sagomaPezzi.find((p) => p.da <= da + TOLLERANZA_S && a <= p.a + TOLLERANZA_S)
  return pezzo ? { url: pezzo.url, inizio: pezzo.inizio } : null
}

/** Ciò che una mappa per nome di sorgente dice del tratto; per un tratto che non c'è o è senza voce (nessuna sorgente) niente. */
export function dellaSorgente<T>(mappa: Record<string, T>, tratto: Tratto | undefined): T | undefined {
  return tratto?.sorgente == null ? undefined : mappa[tratto.sorgente]
}
