// Sottotitoli e titolo come li compone il motore (`motore/sottotitoli.py`, `motore/monta.py`): gli stessi a capo, gli
// stessi corpi, gli stessi istanti. Qui sta la parte che non disegna: dove va ogni parola e quale cartello si vede a un fotogramma.
import type { Battuta, ModoSottotitoli, Quadro, Risolto, SpecCartello, Stile } from "../tipi"
import { arrotonda, colore } from "./composizione"

/** Quanto è larga una scritta a un dato corpo. */
export type Misura = (testo: string, corpo: number) => number

export interface Scheda {
  corpo: number
  corpo_minimo: number
  passo_corpo: number
  interlinea: number
  margine: number
  margine_alto: number
  margine_basso: number
  largo: number
  fondo: string | null
  colore: string
  colore_correzione: string
  bordo: number
  contorno: number
  colore_contorno: string | null
  centrata: boolean
}

interface BaseCartello {
  corpo: number
  corpo_minimo: number
  passo_corpo: number
  interlinea: number
  margine: number
  margine_alto: number
  margine_basso: number
  largo?: number
  fondo: string | null
  colore: string
  colore_correzione?: string
  bordo?: number
  contorno?: number
  colore_contorno?: string
  allinea?: string
}

type Spec = SpecCartello & { largo?: number }

/** Le misure di un cartello dallo stile, con i colori già risolti; colonna, corpo e aspetto possono venire dal quadro. */
export function schedaCartello(stile: Stile, quale: "sottotitoli" | "titolo", spec: Spec): Scheda {
  const base: BaseCartello = quale === "titolo" ? stile.titolo : stile.sottotitoli
  const fondo = spec.fondo === undefined ? base.fondo : spec.fondo
  const nome = spec.colore ?? base.colore
  const contorno = spec.contorno ?? base.contorno ?? 0
  const filo = spec.colore_contorno ?? base.colore_contorno
  return {
    corpo: spec.corpo ?? base.corpo,
    corpo_minimo: spec.corpo_minimo ?? base.corpo_minimo,
    passo_corpo: base.passo_corpo,
    interlinea: base.interlinea,
    margine: base.margine,
    margine_alto: base.margine_alto,
    margine_basso: base.margine_basso,
    largo: spec.largo ?? base.largo ?? 0,
    fondo: fondo === null ? null : colore(stile, fondo),
    colore: colore(stile, nome),
    colore_correzione: colore(stile, base.colore_correzione ?? nome),
    bordo: spec.bordo ?? base.bordo ?? 0,
    contorno,
    colore_contorno: contorno > 0 && filo !== undefined ? colore(stile, filo) : null,
    centrata: base.allinea === "centro",
  }
}

export interface ParolaDisposta {
  testo: string
  correzione: boolean
  x: number
  riga: number
  larghezza: number
}

export interface Disposizione {
  corpo: number
  passo: number
  righe: number
  /** Le misure del cartello con tutto il testo: da qui si calcola il posto, anche quando se ne vede solo una parte. */
  largo: number
  alto: number
  parole: ParolaDisposta[]
}

/** Il testo a capo dentro la sua colonna, con il corpo che scende finché ci sta; un asterisco davanti a una parola la segna come correzione. */
export function disponi(testo: string, scheda: Scheda, misura: Misura): Disposizione {
  const parole = testo.split(/\s+/).filter(Boolean)
  const colonna = scheda.largo - 2 * scheda.margine
  let corpo = scheda.corpo
  for (;;) {
    const lunga = (riga: string) => misura(riga.replaceAll("*", ""), corpo)
    const righe: string[] = []
    let riga = ""
    for (const parola of parole) {
      const prova = `${riga} ${parola}`.trim()
      if (riga !== "" && lunga(prova) > colonna) {
        righe.push(riga)
        riga = parola
      } else riga = prova
    }
    righe.push(riga)
    const piuLunga = Math.max(...righe.map(lunga))
    if (piuLunga <= colonna || corpo <= scheda.corpo_minimo) {
      const passo = arrotonda(corpo * scheda.interlinea)
      const disposte: ParolaDisposta[] = []
      righe.forEach((r, n) => {
        let x = scheda.margine + (scheda.centrata ? (arrotonda(piuLunga) - lunga(r)) / 2 : 0)
        for (const parola of r.split(/\s+/).filter(Boolean)) {
          const nuda = parola.replace(/^\*+/, "")
          const larghezza = misura(nuda, corpo)
          disposte.push({ testo: nuda, correzione: parola.startsWith("*"), x, riga: n, larghezza })
          x += misura(`${nuda} `, corpo)
        }
      })
      return { corpo, passo, righe: righe.length, largo: arrotonda(piuLunga) + 2 * scheda.margine, alto: passo * righe.length + scheda.margine_alto + scheda.margine_basso, parole: disposte }
    }
    corpo -= scheda.passo_corpo
  }
}

/** Il riquadro che si vede quando sono scritte le prime `dette` parole (tutte, senza numero): finisce dove finisce l'ultima, e sotto l'ultima riga. */
export function misureVisibili(d: Disposizione, scheda: Scheda, dette: number | null): { largo: number; alto: number; parole: ParolaDisposta[] } | null {
  const parole = dette === null ? d.parole : d.parole.slice(0, dette)
  if (parole.length === 0) return null
  const largo = Math.max(...parole.map((p) => arrotonda(p.x + p.larghezza) + scheda.margine))
  const ultima = Math.max(...parole.map((p) => p.riga))
  return { largo, alto: d.passo * (ultima + 1) + scheda.margine_alto + scheda.margine_basso, parole }
}

/** In alto a sinistra di un riquadro che ha misure `largo` × `alto`: `x` è il bordo sinistro o il centro, `y` il centro. */
export function postoDelCartello(spec: { x: number; y: number; ancora: "sinistra" | "centro" }, largo: number, alto: number): { x: number; y: number } {
  return { x: spec.ancora === "centro" ? Math.floor((2 * spec.x - largo) / 2) : spec.x, y: spec.y - Math.floor(alto / 2) }
}

/** Il fotogramma mostrato a `t`: quello che comincia prima, mai uno oltre. */
export const fotogrammaA = (t: number, fps: number): number => Math.floor(t * fps + 1e-9)

/** Il primo fotogramma in cui si vede ciò che comincia a `t`: il motore mette un cartello sul fotogramma più vicino. */
const primoFotogramma = (t: number, fps: number): number => Math.max(0, Math.ceil(t * fps - 0.5))

const scenaA = (risolto: Risolto, t: number): number => {
  const n = risolto.scene.findIndex((s) => t < s.inizio + s.durata)
  return n < 0 ? risolto.scene.length - 1 : n
}

export interface SottotitoloVisibile {
  battuta: Battuta
  spec: Quadro["sottotitoli"]
  /** Quante parole sono già scritte; `null`: la battuta intera. */
  dette: number | null
  rilievo: boolean
  /** Di quanti px sta sopra il suo posto (il salto di una parola in rilievo). */
  sopra: number
}

/** Il cartello dei sottotitoli al fotogramma `f`. Il motore mette le battute una dopo l'altra, e se due coprono lo stesso fotogramma vince l'ultima:
 * a parole, ogni parola sta dal suo istante a quello della prossima (prima della prima non si vede niente); una parola in rilievo sta
 * sola, intera, e salta. */
export function sottotitoloAl(risolto: Risolto, stile: Stile, modo: ModoSottotitoli, f: number): SottotitoloVisibile | null {
  if (modo === "nessuno") return null
  const fps = risolto.formato.fps
  const r = stile.sottotitoli.rilievo
  const dentro = (da: number, a: number) => f >= primoFotogramma(da, fps) && f < primoFotogramma(a, fps)
  let trovato: Omit<SottotitoloVisibile, "spec"> | null = null
  let battutaTrovata: Battuta | null = null
  for (const b of risolto.battute) {
    let visto: Pick<SottotitoloVisibile, "dette" | "sopra"> | null = null
    if (b.rilievo) {
      const passi = Math.max(1, arrotonda(r.salto_durata * fps))
      for (let k = 0; k < passi; k++) if (dentro(b.da + k / fps, b.da + (k + 1) / fps)) visto = { dette: null, sopra: arrotonda(r.salto * Math.sin((Math.PI * (k + 0.5)) / passi)) }
      if (dentro(b.da + passi / fps, b.a)) visto = { dette: null, sopra: 0 }
    } else if (modo === "parola per parola") {
      b.istanti.forEach((da, n) => {
        if (dentro(da, b.istanti[n + 1] ?? b.a)) visto = { dette: n + 1, sopra: 0 }
      })
    } else if (dentro(b.da, b.a)) visto = { dette: null, sopra: 0 }
    if (visto) {
      trovato = { battuta: b, rilievo: b.rilievo === true, ...visto }
      battutaTrovata = b
    }
  }
  if (!trovato || !battutaTrovata) return null
  const quadro = stile.quadri[risolto.scene[scenaA(risolto, battutaTrovata.da)]?.quadro ?? ""]
  if (!quadro) return null
  const spec = trovato.rilievo ? { ...quadro.sottotitoli, corpo: r.corpo, colore: r.colore } : quadro.sottotitoli
  return { ...trovato, spec }
}

/** Il quadro della scena in cui il titolo si vede al fotogramma `f`: dal suo inizio alla sua fine, dentro la scena. */
export function titoloAl(risolto: Risolto, stile: Stile, f: number): Quadro | null {
  const titolo = risolto.titolo
  if (!titolo) return null
  const fps = risolto.formato.fps
  let quadro: Quadro | null = null
  for (const scena of risolto.scene) {
    const primo = Math.max(primoFotogramma(scena.inizio, fps), primoFotogramma(titolo.da, fps))
    const ultimo = Math.min(primoFotogramma(scena.inizio + scena.durata, fps), primoFotogramma(titolo.a, fps))
    if (f >= primo && f < ultimo) quadro = stile.quadri[scena.quadro] ?? null
  }
  return quadro
}

export interface CartelloDelTitolo {
  disposizione: Disposizione
  scheda: Scheda
  x: number
  y: number
}

/** Il titolo e, se c'è, la parte nel suo cartello staccato sotto; la `y` del quadro è il centro della prima riga, un titolo che va a capo cresce verso il basso. */
export function cartelliDelTitolo(stile: Stile, quadro: Quadro, titolo: NonNullable<Risolto["titolo"]>, misura: Misura): CartelloDelTitolo[] {
  const scheda = schedaCartello(stile, "titolo", quadro.titolo)
  const scritta = (testo: string) => (stile.titolo.maiuscolo ? testo.toUpperCase() : testo)
  const disposizione = disponi(scritta(titolo.testo), scheda, misura)
  const unaRiga = arrotonda(scheda.corpo * scheda.interlinea) + scheda.margine_alto + scheda.margine_basso
  const { x, y } = postoDelCartello(quadro.titolo, disposizione.largo, unaRiga)
  const fuori: CartelloDelTitolo[] = [{ disposizione, scheda, x, y }]
  if (titolo.parte) {
    const p = stile.titolo.parte
    const schedaParte = { ...scheda, colore: colore(stile, p.colore) }
    const sotto = disponi(scritta(titolo.parte), schedaParte, misura)
    fuori.push({ disposizione: sotto, scheda: schedaParte, x: postoDelCartello(quadro.titolo, sotto.largo, sotto.alto).x, y: y + disposizione.alto + p.stacco })
  }
  return fuori
}
