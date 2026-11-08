// La geometria dell'anteprima «Piano»: dove va ogni strato di un quadro sul palco 1080×1920, alle misure di
// `stile.json`. Funzioni pure: le usa il disegno sul palco (`motore.ts`) e i cartelli dei testi.
import type { CSSProperties } from "react"
import type { Formato, Quadro, Rettangolo, Risolto, ScenaRisolta, Strato, Stile, Tratto, Zoom } from "../tipi"

export interface Rett {
  x: number
  y: number
  w: number
  h: number
}

export interface Misure {
  larghezza: number
  altezza: number
}

export const comeRett = (r: Rettangolo): Rett => ({ x: r[0], y: r[1], w: r[2], h: r[3] })

/** Il formato di un quadro: quello nominato in `formati`, oppure il verticale di `formato`. */
export function formatoDelQuadro(stile: Stile, quadro: Quadro): Formato {
  if (quadro.formato === undefined) return stile.formato
  const f = stile.formati?.[quadro.formato]
  if (!f) throw new Error(`Il formato «${quadro.formato}» non è nello stile.`)
  return f
}

/** Lo strato `girato` tiene tutta la vista dentro l'area (`contieni`), o riempie l'area togliendo il di più
 * attorno al centro (`riempi`): senza scelta, con una vista si tiene tutto, senza si riempie. */
export const contieniLaVista = (strato: Extract<Strato, { tipo: "girato" }>, conVista: boolean): boolean => (strato.adatta === undefined ? conVista : strato.adatta === "contieni")

export function colore(stile: Stile, nome: string): string {
  const valore = stile.colori[nome]
  if (valore === undefined) throw new Error(`Il colore «${nome}» non è in stile.`)
  return valore
}

/** Come si vede un cartello dei sottotitoli, in scala `k`: il riquadro (o niente), il filo attorno al testo e il bordo. */
export function aspettoDelCartello(stile: Stile, k: number): CSSProperties {
  const b = stile.sottotitoli
  const contorno = b.contorno ?? 0
  return {
    color: colore(stile, b.colore),
    background: b.fondo === null ? "transparent" : colore(stile, b.fondo),
    border: `${b.bordo * k}px solid ${colore(stile, b.colore)}`,
    WebkitTextStroke: contorno > 0 && b.colore_contorno !== undefined ? `${contorno * k * 2}px ${colore(stile, b.colore_contorno)}` : undefined,
    paintOrder: "stroke fill",
  }
}

/** Il secondo della scena animata a `t` secondi dall'inizio della scena nel video. Fra due ancore
 * l'animazione scorre al suo passo e poi aspetta; prima della prima parte da zero, dopo l'ultima prosegue. */
export function tempoDiScena(ancore: ScenaRisolta["ancore"], t: number): number {
  if (ancore.length === 0) return t
  const ordinate = [...ancore].sort((a, b) => a[0] - b[0])
  const dopo = ordinate.findIndex((a) => a[0] > t)
  if (dopo < 0) {
    const ultima = ordinate[ordinate.length - 1]!
    return ultima[1] + (t - ultima[0])
  }
  const prima: [number, number] = dopo === 0 ? [0, 0] : ordinate[dopo - 1]!
  return prima[1] + Math.min(t - prima[0], ordinate[dopo]![1] - prima[1])
}

/** A che punto del pezzo (0-1) è il video a `t`: serve allo zoom che cresce. */
export function avanzamentoDelPezzo(risolto: Risolto, indiceTratto: number, t: number): number {
  const tratto = risolto.tratti[indiceTratto]
  if (!tratto) return 0
  const gruppo = risolto.tratti.filter((x) => x.scena === tratto.scena && x.pezzo === tratto.pezzo)
  const totale = gruppo.reduce((somma, x) => somma + x.durata, 0)
  if (totale <= 0) return 0
  const prima = gruppo.filter((x) => x.esce < tratto.esce).reduce((somma, x) => somma + x.durata, 0)
  return Math.min(Math.max((prima + (t - tratto.esce)) / totale, 0), 1)
}

export function scalaDelloZoom(zoom: Zoom | null, avanzamento: number): number {
  if (!zoom) return 1
  if (zoom.scala !== undefined) return zoom.scala
  if (zoom.da === undefined || zoom.a === undefined) return 1
  return zoom.da + (zoom.a - zoom.da) * avanzamento
}

const dentro = (valore: number, minimo: number, massimo: number) => Math.min(Math.max(valore, minimo), Math.max(minimo, massimo))

/** La parte del fotogramma della sorgente (in px della sorgente) che finisce nello strato: la vista se
 * c'è, altrimenti quanto basta a riempire l'area attorno al centro del quadro; poi lo zoom, attorno al
 * suo centro (frazioni del fotogramma), senza uscire dalla vista. */
export function finestraGirato(args: { sorgente: Misure; vista: Rettangolo | null; area: Rett; centro: [number, number]; zoom: Zoom | null; avanzamento: number; contieni: boolean }): Rett {
  const { sorgente, vista, area, centro, zoom, avanzamento, contieni } = args
  const base: Rett = vista ? comeRett(vista) : { x: 0, y: 0, w: sorgente.larghezza, h: sorgente.altezza }
  const aspetto = area.w / area.h
  let w = base.w
  let h = base.h
  if (!contieni) {
    if (base.w / base.h > aspetto) w = base.h * aspetto
    else h = base.w / aspetto
  }
  let cx = base.x + centro[0] * base.w
  let cy = base.y + centro[1] * base.h
  const scala = scalaDelloZoom(zoom, avanzamento)
  if (scala > 1) {
    w /= scala
    h /= scala
    if (zoom?.centro) {
      cx = zoom.centro[0] * sorgente.larghezza
      cy = zoom.centro[1] * sorgente.altezza
    }
  }
  return { x: dentro(cx - w / 2, base.x, base.x + base.w - w), y: dentro(cy - h / 2, base.y, base.y + base.h - h), w, h }
}

export interface Posa {
  /** Dove sul palco finisce la parte mostrata. */
  destinazione: Rett
  /** Quale parte della sorgente. */
  origine: Rett
}

/** La finestra nell'area: a riempimento, oppure intera e centrata (`contieni`). */
export function posaNellArea(area: Rett, finestra: Rett, contieni: boolean): Posa {
  if (!contieni) return { destinazione: area, origine: finestra }
  const k = Math.min(area.w / finestra.w, area.h / finestra.h)
  const [w, h] = [finestra.w * k, finestra.h * k]
  return { destinazione: { x: area.x + (area.w - w) / 2, y: area.y + (area.h - h) / 2, w, h }, origine: finestra }
}

/** Il secondo della ripresa da cui viene la sagoma di un tratto quando la sorgente è al secondo `s`: la sua stessa ripresa, o l'altra che il pezzo dichiara. */
export const secondoDellaSagoma = (tratto: Tratto, s: number): number => (tratto.sagoma ? tratto.sagoma.da + (s - tratto.da) : s)

/** Da quale sorgente e per quali secondi di quella ripresa viene la sagoma di un tratto. */
export function trattoDellaSagoma(tratto: Tratto): { sorgente: string | null; da: number; a: number } {
  const da = secondoDellaSagoma(tratto, tratto.da)
  return { sorgente: tratto.sagoma?.sorgente ?? tratto.sorgente, da, a: da + tratto.durata }
}

/** Come `round` di Python, che il motore usa per le misure della sagoma: a metà va al pari. */
export function arrotonda(v: number): number {
  const r = Math.round(v)
  return Math.abs(v % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r
}

/** Dove sta la testa di una ripresa nella sagoma: la riga più alta a cui arriva e la colonna del suo centro (`lavoro/teste.json`). */
export interface MisuraTesta {
  cima: number
  centro: number
}

type StratoSagoma = Extract<Strato, { tipo: "sagoma" }>

/** La scala della sagoma, una per video: la più piccola per cui il girato, da sopra la testa, arriva al fondo, e con `"testa"` abbastanza grande
 * da coprire ancora tutta la larghezza; come in `motore/quadri.py`. `teste` sono le misure delle riprese che il video mette in sagoma con questo strato. */
export function scalaDellaSagoma(strato: StratoSagoma, palco: Misure, teste: readonly MisuraTesta[]): number {
  const margine = strato.scala_margine ?? 0
  const scale = teste.map((t) => (palco.altezza - strato.testa) / (palco.altezza - Math.max(0, t.cima - strato.aria) - strato.aria) + margine)
  if (strato.x === "testa") scale.push(...teste.map((t) => palco.larghezza / (2 * Math.min(t.centro, palco.larghezza - t.centro)) + margine))
  return Math.max(strato.scala_minima, ...scale)
}

export interface PosaSagoma extends Posa {
  /** Quanti px a destra della sagoma svaniscono nel sotto: il bordo dritto del girato. */
  sfuma: number
}

/** Dove va la sagoma, come la compone il motore (`geometria_sagoma`): si taglia da `aria` sopra la testa, si scala di `scala` e la cima sta a `testa`
 * dal fondo; con `"testa"` il centro della testa sta al centro del palco. */
export function posaSagomaMisurata(strato: StratoSagoma, scala: number, testa: MisuraTesta, palco: Misure): PosaSagoma {
  const taglio = Math.max(0, testa.cima - strato.aria)
  const y = arrotonda(strato.testa - strato.aria * scala)
  const righe = Math.min(palco.altezza - taglio, arrotonda((palco.altezza - y) / scala) + 2)
  const x = strato.x === "testa" ? arrotonda(palco.larghezza / 2 - testa.centro * scala) : strato.x
  return {
    destinazione: { x, y, w: arrotonda((palco.larghezza * scala) / 2) * 2, h: arrotonda((righe * scala) / 2) * 2 },
    origine: { x: 0, y: taglio, w: palco.larghezza, h: righe },
    sfuma: strato.sfuma,
  }
}

/** Senza le misure della testa (il video non è ancora stato montato): la sagoma in basso a sinistra, alta `scala_minima` del palco, spostata di `x`; con `"testa"` sta al centro. */
export function posaSagoma(strato: Extract<Strato, { tipo: "sagoma" }>, sorgente: Misure, palco: Misure): Posa {
  const h = strato.scala_minima * palco.altezza
  const w = (h * sorgente.larghezza) / sorgente.altezza
  const x = strato.x === "testa" ? (palco.larghezza - w) / 2 : strato.x
  return { destinazione: { x, y: palco.altezza - h, w, h }, origine: { x: 0, y: 0, w: sorgente.larghezza, h: sorgente.altezza } }
}

/** Il riquadro con nome (la webcam di una diretta): ingrandito di `scala`, al centro in orizzontale e con
 * il bordo alto a `y`. */
export function posaRiquadro(strato: Extract<Strato, { tipo: "riquadro" }>, rettangolo: Rettangolo, palco: Misure): Posa {
  const origine = comeRett(rettangolo)
  const [w, h] = [origine.w * strato.scala, origine.h * strato.scala]
  return { destinazione: { x: (palco.larghezza - w) / 2, y: strato.y, w, h }, origine }
}

/** L'inserto della vista, largo `largo`, a `bordo` dall'angolo in alto a sinistra dell'area del girato. */
export function posaInserto(strato: Extract<Strato, { tipo: "inserto" }>, areaGirato: Rett, rettangolo: Rettangolo): Posa {
  const origine = comeRett(rettangolo)
  return { destinazione: { x: areaGirato.x + strato.bordo, y: areaGirato.y + strato.bordo, w: strato.largo, h: (strato.largo * origine.h) / origine.w }, origine }
}

const ANGOLI = { "alto-sinistra": [0, 0], "alto-destra": [1, 0], "basso-sinistra": [0, 1], "basso-destra": [1, 1] } as const

/** Il viso (la webcam di una diretta) in un angolo del palco, largo `largo`, a `margine` dai bordi. */
export function posaViso(strato: Extract<Strato, { tipo: "viso" }>, rettangolo: Rettangolo, palco: Misure): Posa {
  const origine = comeRett(rettangolo)
  const [w, h] = [strato.largo, (strato.largo * origine.h) / origine.w]
  const [destra, basso] = ANGOLI[strato.angolo]
  return { destinazione: { x: destra ? palco.larghezza - strato.margine - w : strato.margine, y: basso ? palco.altezza - strato.margine - h : strato.margine, w, h }, origine }
}

/** Se il quadro non mostra altro che l'animazione: solo lì sta un pezzo senza voce, che non ha girato. */
export const soloAnimazione = (stile: Stile, quadro: string): boolean => stile.quadri[quadro]?.strati.every((s) => s.tipo === "animazione") ?? true

export function stratoDi<T extends Strato["tipo"]>(quadro: Quadro, tipo: T): Extract<Strato, { tipo: T }> | undefined {
  return quadro.strati.find((s): s is Extract<Strato, { tipo: T }> => s.tipo === tipo)
}
