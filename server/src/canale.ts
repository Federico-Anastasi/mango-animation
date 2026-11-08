// Le letture dei canali (`docs/ARCHIVIO.md`, «Una lettura del canale») in memoria: dei file grandi (commenti,
// messaggi) si tengono solo i conti e gli identificatori; il contenuto si legge dal disco quando lo chiede una rotta.
export interface VideoDelCanale {
  id: string
  slug?: string | null
  [chiave: string]: unknown
}

export interface LetturaDelCanale {
  /** Il nome della cartella: `AAAA-MM-GG-HHMM`. */
  lettura: string
  /** Una lettura esiste per le rotte solo quando `esito.json` si legge: lo scrive la skill per ultimo. */
  scritta: boolean
  quando: string
  completa: boolean
  mancano: string[]
  profilo: Record<string, unknown> | null
  video: VideoDelCanale[] | null
  /** Per ogni video, gli id dei commenti nel suo file. */
  commenti: Map<string, Set<string>>
  /** Per ogni conversazione, un'impronta per messaggio (la conversazione non ha identificatori). */
  conversazioni: Map<string, string[]> | null
  /** L'impronta del testo di ogni file letto, per accorgersi che non è cambiato niente. */
  impronte: Map<string, string>
}

export interface ProfiloInClassifica {
  nome: string
  cosa_fa: string
  follower: number
  mi_piace: number
  visualizzazioni: number
}

/** `classifica.json` del canale (`docs/ARCHIVIO.md`, «La classifica dei profili»). */
export interface Classifica {
  quando: string
  io: string | null
  quanti: number
  video_della_mediana: number
  come: string[]
  profili: ProfiloInClassifica[]
}

/** `crescita.json` del canale (`docs/ARCHIVIO.md`, «La crescita del canale»): si serve com'è scritto. */
export interface Crescita {
  quando: string
  obiettivo: string
  scenari: Array<{ nome: string; tappe: Array<{ data: string; follower: number }> }>
  [chiave: string]: unknown
}

export interface VariazioneVideo {
  visualizzazioni: number | null
  mi_piace: number | null
  commenti: number | null
}

const numero = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null)
const differenza = (ora: unknown, prima: unknown): number | null => (numero(ora) !== null && numero(prima) !== null ? (ora as number) - (prima as number) : null)

export const quandoDalNome = (nome: string): string => {
  const m = /^(\d{4}-\d{2}-\d{2})-(\d{2})(\d{2})$/.exec(nome)
  return m ? `${m[1]}T${m[2]}:${m[3]}:00` : nome
}

export const nuovaLettura = (lettura: string): LetturaDelCanale => ({
  lettura,
  scritta: false,
  quando: quandoDalNome(lettura),
  completa: false,
  mancano: [],
  profilo: null,
  video: null,
  commenti: new Map(),
  conversazioni: null,
  impronte: new Map(),
})

export const impronta = (...parti: string[]): string => Bun.hash(parti.join("\u0000")).toString(36)

const MISURE = ["follower", "mi_piace", "visualizzazioni"] as const

const mediana = (valori: number[]): number | null => {
  if (valori.length === 0) return null
  const ordinati = [...valori].sort((a, b) => a - b)
  const meta = Math.floor(ordinati.length / 2)
  return ordinati.length % 2 === 1 ? ordinati[meta]! : (ordinati[meta - 1]! + ordinati[meta]!) / 2
}

export class IndiceCanali {
  readonly canali = new Map<string, Map<string, LetturaDelCanale>>()
  readonly classifiche = new Map<string, Classifica>()
  readonly crescite = new Map<string, Crescita>()

  crescita(canale: string): object {
    return this.crescite.get(canale) ?? { quando: null }
  }

  /** Le letture leggibili, dalla più recente. */
  letture(canale: string): LetturaDelCanale[] {
    return [...(this.canali.get(canale)?.values() ?? [])].filter((l) => l.scritta).sort((a, b) => b.lettura.localeCompare(a.lettura))
  }

  private variazione(video: VideoDelCanale, piuVecchie: LetturaDelCanale[]): VariazioneVideo | null {
    for (const l of piuVecchie) {
      const prima = l.video?.find((v) => v.id === video.id)
      if (!prima) continue
      return { visualizzazioni: differenza(video["visualizzazioni"], prima["visualizzazioni"]), mi_piace: differenza(video["mi_piace"], prima["mi_piace"]), commenti: differenza(video["commenti"], prima["commenti"]) }
    }
    return null
  }

  vista(canale: string): object {
    const letture = this.letture(canale)
    const posto = letture.findIndex((l) => l.profilo !== null && l.video !== null)
    const riuscita = posto >= 0 ? letture[posto] : undefined
    return {
      ultima: letture[0] ? { lettura: letture[0].lettura, quando: letture[0].quando } : null,
      letture: letture.map((l) => ({ lettura: l.lettura, quando: l.quando, completa: l.completa, mancano: l.mancano })),
      profilo: riuscita?.profilo ?? null,
      video: (riuscita?.video ?? []).map((v) => ({ ...v, commenti_letti: riuscita?.commenti.get(v.id)?.size ?? 0, variazione: this.variazione(v, letture.slice(posto + 1)) })),
    }
  }

  andamento(canale: string): object[] {
    return this.letture(canale)
      .reverse()
      .map((l) => ({ quando: l.quando, follower: numero(l.profilo?.["follower"]), mi_piace: numero(l.profilo?.["mi_piace"]), video: numero(l.profilo?.["video"]) }))
  }

  /** I numeri del profilo del creator nell'ultima lettura riuscita: la mediana è sui video più recenti che hanno il numero. */
  private mieiNumeri(canale: string, quantiVideo: number): { quando: string; follower: number; mi_piace: number; visualizzazioni: number } | null {
    const riuscita = this.letture(canale).find((l) => l.profilo !== null && l.video !== null)
    const follower = numero(riuscita?.profilo?.["follower"])
    const miPiace = numero(riuscita?.profilo?.["mi_piace"])
    const recenti = [...(riuscita?.video ?? [])].sort((a, b) => String(b["pubblicato"] ?? "").localeCompare(String(a["pubblicato"] ?? "")))
    const visualizzazioni = mediana(recenti.flatMap((v) => numero(v["visualizzazioni"]) ?? []).slice(0, quantiVideo))
    if (!riuscita || follower === null || miPiace === null || visualizzazioni === null) return null
    return { quando: riuscita.quando, follower, mi_piace: miPiace, visualizzazioni }
  }

  classifica(canale: string): object {
    const scritta = this.classifiche.get(canale)
    if (!scritta) return { quando: null, io: null, quando_io: null, come: [], righe: [] }
    const miei = this.mieiNumeri(canale, scritta.video_della_mediana)
    const profili = scritta.profili.map((p) => (miei && p.nome === scritta.io ? { ...p, follower: miei.follower, mi_piace: miei.mi_piace, visualizzazioni: miei.visualizzazioni } : p))
    const punteggi = new Map<string, number>()
    for (const misura of MISURE) {
      ;[...profili].sort((a, b) => b[misura] - a[misura]).forEach((p, i) => punteggi.set(p.nome, (punteggi.get(p.nome) ?? 0) + i + 1))
    }
    const righe = profili
      .map((p) => ({ ...p, punteggio: punteggi.get(p.nome)! }))
      .sort((a, b) => a.punteggio - b.punteggio || b.follower - a.follower)
      .slice(0, scritta.quanti)
      .map((p, i) => ({ posto: i + 1, nome: p.nome, cosa_fa: p.cosa_fa, follower: p.follower, mi_piace: p.mi_piace, visualizzazioni: p.visualizzazioni, punteggio: p.punteggio }))
    return { quando: scritta.quando, io: scritta.io, quando_io: miei?.quando ?? scritta.quando, come: scritta.come, righe }
  }

  /** La lettura che ha i commenti di `video` (quella chiesta, o la più recente che li ha) e gli id che nella lettura prima non c'erano. */
  commenti(canale: string, video: string, lettura?: string): { lettura: LetturaDelCanale; nuovi: string[] } | null {
    const letture = this.letture(canale)
    const posto = letture.findIndex((l) => (lettura === undefined ? l.commenti.has(video) : l.lettura === lettura))
    const trovata = letture[posto]
    const ids = trovata?.commenti.get(video)
    if (!trovata || !ids) return null
    const prima = letture.slice(posto + 1).find((l) => l.commenti.has(video))?.commenti.get(video)
    return { lettura: trovata, nuovi: prima ? [...ids].filter((id) => !prima.has(id)) : [] }
  }

  /** La lettura con i messaggi (quella chiesta, o la più recente che li ha) e, per conversazione, gli indici dei messaggi che nella lettura prima non c'erano. */
  messaggi(canale: string, lettura?: string): { lettura: LetturaDelCanale; nuovi: Map<string, number[]> } | null {
    const letture = this.letture(canale)
    const posto = letture.findIndex((l) => l.conversazioni !== null && (lettura === undefined || l.lettura === lettura))
    const trovata = letture[posto]
    if (!trovata?.conversazioni) return null
    const prima = letture.slice(posto + 1).find((l) => l.conversazioni !== null)?.conversazioni
    const nuovi = new Map<string, number[]>()
    trovata.conversazioni.forEach((firme, con) => {
      if (!prima) {
        nuovi.set(con, [])
        return
      }
      const resto = new Map<string, number>()
      ;(prima.get(con) ?? []).forEach((f) => resto.set(f, (resto.get(f) ?? 0) + 1))
      const nonCerano = firme.flatMap((f, i) => {
        const rimasti = resto.get(f) ?? 0
        if (rimasti === 0) return [i]
        resto.set(f, rimasti - 1)
        return []
      })
      nuovi.set(con, nonCerano)
    })
    return { lettura: trovata, nuovi }
  }

  /** Il video del canale che un video dell'archivio ha come `slug`, nella lettura più recente che lo nomina. */
  legatoA(slug: string): { canale: string; id: string } | null {
    for (const canale of this.canali.keys()) {
      for (const l of this.letture(canale)) {
        const trovato = l.video?.find((v) => v.slug === slug)
        if (trovato) return { canale, id: trovato.id }
      }
    }
    return null
  }
}
