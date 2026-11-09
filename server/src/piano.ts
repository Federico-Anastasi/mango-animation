// Il piano di un video (`docs/PIANO.md`) visto dal server: solo ciò che serve per fonderlo con la sua
// base e per controllarne i riferimenti. Il resto passa com'è.
import { frase, Frase } from "./lingua"

export interface Vista {
  taglio: number[]
  inserto?: number[]
}

export interface Sorgente {
  file: string
  riquadri?: Record<string, number[]>
  viste?: Record<string, Vista>
}

/** Un pezzo di una sorgente o un pezzo senza voce (`durata`): solo l'animazione, o il `girato` muto di una ripresa. */
export interface Pezzo {
  sorgente?: string
  durata?: number
  vista?: string
  girato?: { sorgente: string; fermo?: number; da?: number; a?: number }
}

export interface Scena {
  nome: string
  quadro?: string
  vista?: string
  pezzi: Pezzo[]
  ancore?: [string, number, number][]
  parole?: Record<string, [string, number]>
}

export interface Sottotitoli {
  modo?: string
  nomi?: string[]
  correzioni?: { sorgente?: string }[]
  ritocchi?: { sorgente: string }[]
}

export interface Piano {
  base?: string
  quadro?: string
  sorgenti?: Record<string, Sorgente>
  scene?: Scena[]
  sottotitoli?: Sottotitoli
  titolo?: { testo: string; da?: number; a?: number }
  suoni?: { sorgente?: string; scena?: string }[]
  coda?: number
}

export type TrovaPiano = (slug: string) => Piano | null

function unisciSorgente(base: Sorgente | undefined, propria: Sorgente | undefined): Sorgente {
  const unita = { ...base, ...propria } as Sorgente
  if (base?.viste || propria?.viste) unita.viste = { ...base?.viste, ...propria?.viste }
  if (base?.riquadri || propria?.riquadri) unita.riquadri = { ...base?.riquadri, ...propria?.riquadri }
  return unita
}

function unisci(base: Piano, propria: Piano): Piano {
  const unito: Piano = { ...base, ...propria }
  delete unito.base

  const nomiSorgenti = new Set([...Object.keys(base.sorgenti ?? {}), ...Object.keys(propria.sorgenti ?? {})])
  if (nomiSorgenti.size > 0) {
    unito.sorgenti = Object.fromEntries([...nomiSorgenti].map((nome) => [nome, unisciSorgente(base.sorgenti?.[nome], propria.sorgenti?.[nome])]))
  }

  const proprie = propria.scene ?? []
  if (base.scene || propria.scene) {
    unito.scene = [...(base.scene ?? []).map((s) => proprie.find((p) => p.nome === s.nome) ?? s), ...proprie.filter((p) => !(base.scene ?? []).some((s) => s.nome === p.nome))]
  }

  if (base.sottotitoli || propria.sottotitoli) {
    const somma = <T>(a?: T[], b?: T[]): T[] | undefined => (a || b ? [...(a ?? []), ...(b ?? [])] : undefined)
    const sottotitoli: Sottotitoli = { ...base.sottotitoli, ...propria.sottotitoli }
    const nomi = somma(base.sottotitoli?.nomi, propria.sottotitoli?.nomi)
    const correzioni = somma(base.sottotitoli?.correzioni, propria.sottotitoli?.correzioni)
    const ritocchi = somma(base.sottotitoli?.ritocchi, propria.sottotitoli?.ritocchi)
    if (nomi) sottotitoli.nomi = nomi
    if (correzioni) sottotitoli.correzioni = correzioni
    if (ritocchi) sottotitoli.ritocchi = ritocchi
    unito.sottotitoli = sottotitoli
  }
  return unito
}

/** Il piano di `slug` con la sua `base` già applicata (a catena), o la frase che dice perché non si può. */
export function applicaBase(slug: string, trova: TrovaPiano): Piano | Frase {
  const risolvi = (corrente: string, percorso: string[]): Piano | Frase => {
    const piano = trova(corrente)
    if (!piano) {
      if (percorso.length === 1) return frase(`Il video «${corrente}» non ha un piano.`, `The video «${corrente}» has no plan.`)
      const da = percorso[percorso.length - 2]
      return frase(
        `La base «${corrente}» di «${da}» non esiste o non ha un piano: scegli un altro video come base o togli «base».`,
        `The base «${corrente}» of «${da}» does not exist or has no plan: pick another video as the base or remove «base».`,
      )
    }
    if (!piano.base) return piano
    if (percorso.includes(piano.base)) {
      const giro = [...percorso, piano.base].join(" → ")
      return frase(
        `La base fa un giro: ${giro}. Un piano non può dipendere da sé stesso: cambia o togli «base».`,
        `The base goes in a circle: ${giro}. A plan cannot depend on itself: change or remove «base».`,
      )
    }
    const dallaBase = risolvi(piano.base, [...percorso, piano.base])
    return dallaBase instanceof Frase ? dallaBase : unisci(dallaBase, piano)
  }
  return risolvi(slug, [slug])
}

/** Chiavi dello stile e sorgenti a cui il piano (già con la base applicata) rimanda, controllate contro ciò che dichiara. */
export function controllaRiferimenti(piano: Piano, quadriDelloStile: ReadonlySet<string>): Frase[] {
  const problemi: Frase[] = []
  const sorgenti = piano.sorgenti ?? {}
  const sorgenteEsiste = (nome: string, dove: string): void => {
    if (!(nome in sorgenti)) problemi.push(frase(`${dove}: la sorgente «${nome}» non è dichiarata in «sorgenti».`, `${dove}: the source «${nome}» is not declared in «sorgenti».`))
  }
  const quadroEsiste = (nome: string | undefined, dove: string): void => {
    if (nome !== undefined && !quadriDelloStile.has(nome)) {
      const quadri = [...quadriDelloStile].join(", ")
      problemi.push(frase(`${dove}: il quadro «${nome}» non c'è in stile.json (quadri: ${quadri}).`, `${dove}: the layout «${nome}» is not in stile.json (layouts: ${quadri}).`))
    }
  }

  quadroEsiste(piano.quadro, "quadro")
  ;(piano.scene ?? []).forEach((scena, i) => {
    const dove = `scene[${i}] («${scena.nome}»)`
    quadroEsiste(scena.quadro, dove)
    scena.pezzi.forEach((pezzo, j) => {
      if (pezzo.girato !== undefined) sorgenteEsiste(pezzo.girato.sorgente, `${dove}.pezzi[${j}].girato`)
      const { sorgente } = pezzo
      if (sorgente !== undefined) sorgenteEsiste(sorgente, `${dove}.pezzi[${j}]`)
      // La vista inquadra ciò che si vede: col girato di un'altra ripresa è quella, non la voce; un pezzo senza voce né girato non ne ha.
      const visto = pezzo.girato?.sorgente ?? sorgente
      if (visto === undefined) return
      const vista = pezzo.vista ?? scena.vista
      if (vista !== undefined && visto in sorgenti && !(vista in (sorgenti[visto]?.viste ?? {}))) {
        problemi.push(frase(`${dove}.pezzi[${j}]: la vista «${vista}» non è dichiarata in «sorgenti.${visto}.viste».`, `${dove}.pezzi[${j}]: the view «${vista}» is not declared in «sorgenti.${visto}.viste».`))
      }
    })
    ;(scena.ancore ?? []).forEach((ancora, j) => sorgenteEsiste(ancora[0], `${dove}.ancore[${j}]`))
    Object.entries(scena.parole ?? {}).forEach(([nome, voce]) => sorgenteEsiste(voce[0], `${dove}.parole.${nome}`))
  })
  const scene = new Set((piano.scene ?? []).map((scena) => scena.nome))
  ;(piano.suoni ?? []).forEach((suono, i) => {
    if (suono.sorgente !== undefined) sorgenteEsiste(suono.sorgente, `suoni[${i}]`)
    if (suono.scena !== undefined && !scene.has(suono.scena)) problemi.push(frase(`suoni[${i}]: la scena «${suono.scena}» non c'è fra le scene del piano.`, `suoni[${i}]: the scene «${suono.scena}» is not among the plan's scenes.`))
  })
  ;(piano.sottotitoli?.correzioni ?? []).forEach((c, i) => c.sorgente !== undefined && sorgenteEsiste(c.sorgente, `sottotitoli.correzioni[${i}]`))
  ;(piano.sottotitoli?.ritocchi ?? []).forEach((r, i) => sorgenteEsiste(r.sorgente, `sottotitoli.ritocchi[${i}]`))
  return problemi
}

/** Un piano completo ha quadro, sorgenti e scene: dopo la base, deve averli. */
export function controllaCompleto(piano: Piano): Frase[] {
  return (["quadro", "sorgenti", "scene"] as const).filter((chiave) => piano[chiave] === undefined).map((chiave) => frase(`manca «${chiave}», neppure nella base.`, `«${chiave}» is missing, also from the base.`))
}

/** I file del girato (relativi a `grezzo/`, con `/`) che il piano usa. */
export const fileDelPiano = (piano: Piano): string[] => Object.values(piano.sorgenti ?? {}).map((s) => s.file.replaceAll("\\", "/"))
