// Lo stato dell'archivio in memoria. Ha un solo proprietario, costruito all'avvio e tenuto al passo
// dall'osservatore (`elaboratore.ts`): le rotte di lettura rispondono da qui e non toccano il disco.
import { IndiceCanali } from "./canale"
import type { RichiestaLavoro } from "./coda"
import { faseDelVideo, type Fase } from "./fasi"
import { decimiDi, fotogrammaDi } from "./miniature"
import { applicaBase, fileDelPiano, quadriDelPiano, type Piano } from "./piano"
import type { PezzoSagoma } from "./sagoma"
import { Frase, type Testo } from "./lingua"

/** Il profilo del creator (`profilo.json` nella cartella di lavoro): `valore` è `{}` se il file non c'è. */
export interface Profilo {
  testo: string | null
  valore: Record<string, unknown>
}

export interface Scheda {
  titolo: string
  stato: string
  creato: string
  [chiave: string]: unknown
}

export interface SchedaGrezzo {
  tipo: string
  origine: string
  [chiave: string]: unknown
}

export interface Uscita {
  file: string
  byte: number
  cambiato: string
  /** Se questo è un secondo nome di un altro file di `uscite/` (lo stesso file sul disco, come `con-copertina.mp4` di `finale.mp4`), quell'altro; altrimenti `null`. */
  stesso_file: string | null
}

export interface Anteprima {
  /** Relativo all'archivio. */
  file: string
  mtime: number
}

/** Le versioni di prima del piano: `primo`..`ultimo` sono i file di `storia/`; `posizione` è quella in uso, `ultimo + 1` in testa. */
export interface PosizioneStoria {
  primo: number
  ultimo: number
  posizione: number
}

export interface VoceVideo {
  slug: string
  scheda: Scheda | null
  schedaTesto: string | null
  /** Perché la scheda sul disco non passa lo schema (o non è JSON): vuoto se passa. `scheda` resta l'ultima valida. */
  schedaProblemi: Testo[]
  piano: unknown
  /** L'ultimo piano letto che era JSON: `piano` e `pianoValido` vengono da qui. */
  pianoTesto: string | null
  /** Il testo che `piano.json` ha avuto per ultimo sul disco, JSON o no. */
  pianoVisto: string | null
  /** Perché il piano sul disco non passa lo schema (o non è JSON): vuoto se passa. */
  pianoProblemi: Testo[]
  pianoValido: Piano | null
  pianoMtime: number
  pianoConBase: Piano | null
  uscite: Uscita[]
  /** `materiali/anteprima.<estensione>`: l'immagine con cui la proposta si presenta nell'elenco. Il più recente, se ce n'è più d'uno. */
  anteprima: Anteprima | null
  /** C'è `materiali/testo-registrato.md`: il testo del video, battuta per battuta, approvato dal creator. */
  testoRegistrato: boolean
  durata: number | null
  /** La durata di ogni scena del risolto, per nome. */
  durataScene: Record<string, number>
  durataUscita: number | null
  risoltoMtime: number | null
  /** I tratti del risolto, nel suo ordine: da qui si sa quali fotogrammi servono. */
  trattiRisolti: TrattoRisolto[]
  controlloMtime: number | null
  ultimoCambio: number
  storia: PosizioneStoria
}

export interface Preparato {
  parole: string | null
  sagoma: string | null
  /** I pezzi di sagoma che `sagoma.json` elenca e che sono sul disco, coi file relativi all'archivio; `null` senza elenco. */
  sagoma_pezzi: PezzoSagoma[] | null
  leggero: string | null
  onda: string | null
  miniatura: string | null
  foto: string | null
  trascrizione: string | null
}

export interface TrattoRisolto {
  /** Da quale sorgente si prende il fotogramma del tratto: la sua voce o, per un pezzo senza voce, il suo `girato` muto; `null` per un pezzo di sola animazione, o se il risolto non lo dice. */
  sorgente: string | null
  da: number | null
}

const numero = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null)

export function trattiDelRisolto(risolto: unknown): TrattoRisolto[] {
  const tratti = (risolto as { tratti?: unknown } | null)?.tratti
  if (!Array.isArray(tratti)) return []
  return tratti.map((t: { sorgente?: unknown; da?: unknown; girato?: { sorgente?: unknown; da?: unknown; fermo?: unknown } | null } | null) => {
    if (typeof t?.sorgente === "string") return { sorgente: t.sorgente, da: numero(t.da) }
    const muto = t?.girato
    return typeof muto?.sorgente === "string" ? { sorgente: muto.sorgente, da: numero(muto.fermo ?? muto.da) } : { sorgente: null, da: null }
  })
}

export interface VoceGrezzo {
  giorno: string
  nome: string
  byte: number
  mtime: number
  scheda: SchedaGrezzo | null
  schedaTesto: string | null
  /** Perché la scheda sul disco non passa lo schema (o non è JSON): vuoto se passa o non c'è; `scheda` è `null` finché non la si corregge. */
  schedaProblemi: Testo[]
}

export const PREPARATO_VUOTO: Preparato = { parole: null, sagoma: null, sagoma_pezzi: null, leggero: null, onda: null, miniatura: null, foto: null, trascrizione: null }

export const voceVuota = (slug: string): VoceVideo => ({
  slug,
  scheda: null,
  schedaTesto: null,
  schedaProblemi: [],
  piano: null,
  pianoTesto: null,
  pianoVisto: null,
  pianoProblemi: [],
  pianoValido: null,
  pianoMtime: 0,
  pianoConBase: null,
  uscite: [],
  anteprima: null,
  testoRegistrato: false,
  durata: null,
  durataScene: {},
  durataUscita: null,
  risoltoMtime: null,
  trattiRisolti: [],
  controlloMtime: null,
  ultimoCambio: 0,
  storia: { primo: 1, ultimo: 0, posizione: 1 },
})

export class Indice {
  readonly video = new Map<string, VoceVideo>()
  readonly grezzo = new Map<string, Map<string, VoceGrezzo>>()
  readonly preparati = new Map<string, Preparato>()
  /** Per ogni file del girato, i decimi di secondo di cui c'è il fotogramma in `preparati/<file>/fotogrammi/`. */
  readonly fotogrammi = new Map<string, Set<number>>()
  readonly canali = new IndiceCanali((canale, id) => this.slugPubblicatoCome(canale, id))
  /** `serie` è lo stile del prodotto, `valore` quello che serve: lo stile del creator sovrapposto. */
  stile: { testo: string | null; serie: unknown; valore: unknown; mtime: number; quadri: Set<string> } = { testo: null, serie: null, valore: null, mtime: 0, quadri: new Set() }
  profilo: Profilo = { testo: null, valore: {} }
  /** Perché `profilo.json` com'è sul disco non passa lo schema; vuoto se passa (o se non c'è). `profilo` resta quello valido di prima, o vuoto. */
  profiloProblemi: Testo[] = []
  private usi = new Map<string, string[]>()

  /** Un video esiste per l'interfaccia solo con una scheda valida. */
  visibile(slug: string): VoceVideo | null {
    const voce = this.video.get(slug)
    return voce?.scheda ? voce : null
  }

  /** Il video la cui scheda ha una pubblicazione su `canale` con l'indirizzo del video `id` (l'identificatore è un pezzo del percorso). */
  private slugPubblicatoCome(canale: string, id: string): string | null {
    const pubblicaCome = (voce: VoceVideo): boolean => {
      const pubblicazioni = voce.scheda?.["pubblicazioni"]
      return Array.isArray(pubblicazioni) && pubblicazioni.some((p: { canale?: unknown; url?: unknown }) => p.canale === canale && typeof p.url === "string" && p.url.split(/[/?#]/).includes(id))
    }
    return [...this.video.values()].find(pubblicaCome)?.slug ?? null
  }

  pianoDi = (slug: string): Piano | null => this.video.get(slug)?.pianoValido ?? null

  /** Va richiamato dopo ogni cambio di un piano: i piani si leggono l'uno con l'altro, per `base`. Dice se «chi usa cosa» è cambiato. */
  ricalcolaUsi(): boolean {
    const usi = new Map<string, string[]>()
    ;[...this.video.values()].sort((a, b) => a.slug.localeCompare(b.slug)).forEach((voce) => {
      const risolto = voce.pianoValido ? applicaBase(voce.slug, this.pianoDi) : null
      voce.pianoConBase = risolto instanceof Frase ? null : risolto
      if (voce.pianoConBase) fileDelPiano(voce.pianoConBase).forEach((file) => usi.set(file, [...(usi.get(file) ?? []), voce.slug]))
    })
    const cambiato = JSON.stringify([...usi].sort()) !== JSON.stringify([...this.usi].sort())
    this.usi = usi
    return cambiato
  }

  /** Il file del girato e il secondo del fotogramma di ogni tratto, nello stesso ordine; `null` per un tratto che non ha girato. */
  posizioniDeiTratti(voce: VoceVideo, tratti: TrattoRisolto[]): Array<{ file: string; da: number } | null> {
    const sorgenti = voce.pianoConBase?.sorgenti ?? {}
    return tratti.map((t) => {
      const file = t.sorgente === null ? undefined : sorgenti[t.sorgente]?.file
      return file === undefined || t.da === null ? null : { file, da: t.da }
    })
  }

  /** Per ogni tratto del risolto, il percorso del suo fotogramma se è già stato fatto. */
  fotogrammiDeiTratti(voce: VoceVideo, tratti: TrattoRisolto[]): Array<string | null> {
    return this.posizioniDeiTratti(voce, tratti).map((p) => (p !== null && this.fotogrammi.get(p.file)?.has(decimiDi(p.da)) ? fotogrammaDi(p.file, p.da) : null))
  }

  usatoIn(file: string): string[] {
    return this.usi.get(file) ?? []
  }

  /** I video il cui piano passa da `slug` per `base`, a catena (senza `slug`). */
  dipendenti(slug: string): string[] {
    const dipendeDa = (partenza: string): boolean => {
      let corrente = this.pianoDi(partenza)?.base
      for (let passi = 0; corrente !== undefined && passi <= this.video.size; passi++) {
        if (corrente === slug) return true
        corrente = this.pianoDi(corrente)?.base
      }
      return false
    }
    return [...this.video.keys()].filter((altro) => altro !== slug && dipendeDa(altro))
  }

  /** L'ultima modifica del piano di `slug` o di una delle sue basi: da lì si sa se il risolto è rimasto indietro. */
  ultimoPiano(slug: string): number {
    const visti = new Set<string>()
    let ms = 0
    for (let corrente: string | undefined = slug; corrente !== undefined && !visti.has(corrente); corrente = this.video.get(corrente)?.pianoValido?.base) {
      visti.add(corrente)
      ms = Math.max(ms, this.video.get(corrente)?.pianoMtime ?? 0)
    }
    return ms
  }

  /** Il piano (o quello di una sua base) è stato salvato dopo `finale.mp4`. Senza montato, falso. */
  pianoPiuNuovoDelFinale(voce: VoceVideo): boolean {
    const finale = voce.uscite.find((u) => u.file === `video/${voce.slug}/uscite/finale.mp4`)
    return finale !== undefined && this.ultimoPiano(voce.slug) > Date.parse(finale.cambiato)
  }

  /** Il montato esiste: c'è `finale.mp4`. */
  haIlMontato(voce: VoceVideo): boolean {
    return voce.uscite.some((u) => u.file === `video/${voce.slug}/uscite/finale.mp4`)
  }

  preparatoDi(giorno: string, nome: string): Preparato {
    return this.preparati.get(`${giorno}/${nome}`) ?? PREPARATO_VUOTO
  }

  /**
   * I secondi di video su cui lavora un lavoro della coda, o `null` se non si sanno: per la preparazione il girato ancora
   * da trascrivere, per l'anteprima la scena o il pezzo, per gli altri comandi di un video la durata del risolto.
   */
  secondiDaLavorare({ comando, argomenti, slug, file }: RichiestaLavoro): number | null {
    const daPreparare = (files: string[], rifai = false): number | null => {
      const durate = files.map((f) => {
        const [giorno = "", nome = ""] = f.replaceAll("\\", "/").split("/")
        if (!rifai && this.preparatoDi(giorno, nome).parole !== null) return 0
        const durata = this.grezzo.get(giorno)?.get(nome)?.scheda?.["durata"]
        return typeof durata === "number" ? durata : null
      })
      return durate.includes(null) ? null : durate.reduce((somma: number, d) => somma + d!, 0)
    }
    if (slug === null) return file === null ? null : daPreparare([file], argomenti.includes("--ritrascrivi"))
    const voce = this.video.get(slug)
    if (!voce) return null
    if (comando === "prepara") return voce.pianoConBase ? daPreparare(fileDelPiano(voce.pianoConBase)) : null
    if (comando !== "anteprima") return voce.durata
    const dopo = (opzione: string): string | null => {
      const i = argomenti.indexOf(opzione)
      return i < 0 ? null : (argomenti[i + 1] ?? null)
    }
    const scena = dopo("--scena")
    if (scena !== null) return voce.durataScene[scena] ?? null
    return Number(dopo("--a")) - Number(dopo("--da"))
  }

  puoAnnullare(voce: VoceVideo): boolean {
    const { primo, ultimo, posizione } = voce.storia
    return posizione === ultimo + 1 ? ultimo >= primo : posizione > primo
  }

  puoRifare(voce: VoceVideo): boolean {
    return voce.storia.posizione < voce.storia.ultimo
  }

  /** A che passo del metodo è il video (`fasi.ts`); `null` per un carosello o uno scartato. */
  faseDi(voce: VoceVideo): Fase | null {
    return faseDelVideo(voce, this.pianoPiuNuovoDelFinale(voce))
  }

  /** Ciò che il video fa vedere nell'elenco: prima quello che è uscito, poi l'anteprima scelta apposta, poi i fotogrammi presi da sé. */
  miniaturaDi(voce: VoceVideo): string | null {
    if (voce.uscite.some((u) => u.file.endsWith("/uscite/copertina.png"))) return `video/${voce.slug}/uscite/copertina.png`
    if (voce.uscite.some((u) => u.file.endsWith("/uscite/miniatura.jpg"))) return `video/${voce.slug}/uscite/miniatura.jpg`
    if (voce.uscite.some((u) => u.file.endsWith("/uscite/slide-1.png"))) return `video/${voce.slug}/uscite/slide-1.png`
    if (voce.anteprima !== null) return voce.anteprima.file
    const primo = voce.pianoConBase?.scene?.[0]?.pezzi[0]?.sorgente
    const file = primo === undefined ? undefined : voce.pianoConBase?.sorgenti?.[primo]?.file
    if (file !== undefined) {
      const [giorno = "", ...resto] = file.replaceAll("\\", "/").split("/")
      const dalGirato = this.preparatoDi(giorno, resto.join("/")).miniatura
      if (dalGirato !== null) return dalGirato
    }
    return voce.uscite.some((u) => u.file.endsWith("/uscite/prova.jpg")) ? `video/${voce.slug}/uscite/prova.jpg` : null
  }

  elencoVideo(): object[] {
    return [...this.video.values()]
      .filter((voce) => voce.scheda !== null)
      .sort((a, b) => b.ultimoCambio - a.ultimoCambio || a.slug.localeCompare(b.slug))
      .map((voce) => ({
        slug: voce.slug,
        scheda: voce.scheda,
        durata: voce.durata ?? voce.durataUscita,
        miniatura: this.miniaturaDi(voce),
        anteprima: voce.anteprima?.file ?? null,
        ha_piano: voce.pianoTesto !== null,
        quadri: quadriDelPiano(voce.pianoConBase),
        ha_finale: voce.uscite.some((u) => u.file.endsWith("/uscite/finale.mp4")),
        fase: this.faseDi(voce),
        ultimo_cambio: new Date(voce.ultimoCambio).toISOString(),
      }))
  }

  elencoGrezzo(): object[] {
    return [...this.grezzo.entries()]
      .filter(([, files]) => files.size > 0)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([giorno, files]) => ({
        giorno,
        file: [...files.values()]
          .sort((a, b) => b.mtime - a.mtime || a.nome.localeCompare(b.nome))
          .map((f) => ({
            file: `${giorno}/${f.nome}`,
            nome: f.nome,
            byte: f.byte,
            scheda: f.scheda,
            scheda_problemi: f.schedaProblemi,
            preparato: this.preparatoDi(giorno, f.nome),
            usato_in: this.usi.get(`${giorno}/${f.nome}`) ?? [],
          })),
      }))
  }
}
