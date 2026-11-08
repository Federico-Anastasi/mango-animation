// Dal gesto al piano (`docs/PIANO.md`, «I ritocchi a mano»). Ogni funzione prende il piano del video, il
// piano con la base già applicata e il risolto che si vede, e ridà il piano nuovo da mandare con `PUT`, o
// il motivo per cui il gesto non si può fare. Non tocca mai l'argomento: lavora su una copia.
import { t } from "../lingua"
import type { Correzione, Pezzo, Piano, PianoCompleto, Risolto, Scena, Tratto, ParolaRisolta, Zoom } from "../tipi"

export interface Contesto {
  proprio: Piano
  effettivo: PianoCompleto
  risolto: Risolto
}

export type Esito = { ok: true; piano: Piano } | { ok: false; motivo: string }

const EPSILON = 0.005
const SCHEMA_ZOOM_MAX = 4

const ok = (piano: Piano): Esito => ({ ok: true, piano })
const no = (motivo: string): Esito => ({ ok: false, motivo })

const arrotonda = (n: number, passo = 1000): number => Math.round(n * passo) / passo

const copia = <T>(valore: T): T => structuredClone(valore)

export function mmss(secondi: number): string {
  const s = Math.max(0, Math.floor(secondi))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

const fineTratto = (t: Tratto): number => t.da + t.durata

export const aTempo = (pezzo: Pezzo): boolean => pezzo.dice === undefined

/** I tratti di un pezzo, in ordine, come indici del risolto. */
export function trattiDelPezzo(risolto: Risolto, scena: number, pezzo: number): number[] {
  return risolto.tratti.flatMap((t, i) => (t.scena === scena && t.pezzo === pezzo ? [i] : []))
}

export function paroleDelPezzo(risolto: Risolto, scena: number, pezzo: number): Array<{ indice: number; parola: ParolaRisolta }> {
  return risolto.parole.flatMap((parola, indice) => {
    const t = risolto.tratti[parola.tratto]
    return t && t.scena === scena && t.pezzo === pezzo ? [{ indice, parola }] : []
  })
}

/** Il tratto sotto il secondo `t` del video, o `-1`. */
export function trattoA(risolto: Risolto, t: number): number {
  const i = risolto.tratti.findIndex((x) => t >= x.esce - 1e-6 && t < x.esce + x.durata - 1e-6)
  if (i >= 0) return i
  const ultimo = risolto.tratti.length - 1
  return ultimo >= 0 && t >= risolto.tratti[ultimo]!.esce && t <= risolto.tratti[ultimo]!.esce + risolto.tratti[ultimo]!.durata + 1e-6 ? ultimo : -1
}

/** Se la scena viene dalla base e il video non la dichiara: non si ritocca, si stacca. */
export function ereditata(proprio: Piano, effettivo: PianoCompleto, indiceScena: number): boolean {
  if (proprio.base === undefined) return false
  const nome = effettivo.scene[indiceScena]?.nome
  return nome === undefined || !(proprio.scene ?? []).some((s) => s.nome === nome)
}

const motivoSenzaVoce = (): string => t("Un pezzo senza voce non ha girato: dura quanto dice il piano, e qui non si taglia, non si divide e non si ingrandisce.", "A clip without a voice has no footage: it lasts as long as the plan says, and here it cannot be cut, split or zoomed.")

const motivoEreditato = (base: string): string => t("Questo pezzo viene dal video «{base}». Per ritoccarlo stacca il video dalla base: le scene si copiano qui e restano tue.", "This clip comes from the video «{base}». To edit it, detach the video from its base: the scenes are copied here and become yours.", { base })

interface Bersaglio {
  piano: Piano
  scena: Scena
  indiceScena: number
  pezzo: Pezzo
  indicePezzo: number
}

function bersaglio(ctx: Contesto, indiceScena: number, indicePezzo: number): Bersaglio | string {
  const nome = ctx.effettivo.scene[indiceScena]?.nome
  if (nome === undefined) return t("Questa scena non c'è più: aspetta il montaggio aggiornato.", "This scene is gone: wait for the edit to update.")
  if (ereditata(ctx.proprio, ctx.effettivo, indiceScena)) return motivoEreditato(ctx.proprio.base ?? "")
  const piano = copia(ctx.proprio)
  const indice = ctx.proprio.base === undefined ? indiceScena : (piano.scene ?? []).findIndex((s) => s.nome === nome)
  const scena = piano.scene?.[indice]
  const pezzo = scena?.pezzi[indicePezzo]
  if (!scena || !pezzo) return t("Questo pezzo non c'è più: aspetta il montaggio aggiornato.", "This clip is gone: wait for the edit to update.")
  return { piano, scena, indiceScena: indice, pezzo, indicePezzo }
}

function unisciVia(via: Array<[number, number]>): Array<[number, number]> {
  const ordinate = via.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0])
  const risultato: Array<[number, number]> = []
  for (const [a, b] of ordinate) {
    const ultimo = risultato[risultato.length - 1]
    if (ultimo && a <= ultimo[1] + EPSILON) ultimo[1] = Math.max(ultimo[1], b)
    else risultato.push([a, b])
  }
  return risultato
}

function impostaVia(pezzo: Pezzo, via: Array<[number, number]>): void {
  const unite = unisciVia(via).map(([a, b]): [number, number] => [arrotonda(a), arrotonda(b)])
  if (unite.length === 0) delete pezzo.via
  else pezzo.via = unite
}

const sovrappone = (v: [number, number], a: number, b: number): boolean => v[0] < b - EPSILON && v[1] > a + EPSILON

/** Il piano senza il pezzo; la scena resta senza pezzi solo se si toglie anche lei. */
function senzaPezzo(b: Bersaglio): Esito {
  b.scena.pezzi.splice(b.indicePezzo, 1)
  if (b.scena.pezzi.length > 0) return ok(b.piano)
  if ((b.piano.scene ?? []).length <= 1) return no(t("È l'unico pezzo del video: non si può togliere, il video resterebbe vuoto.", "It is the only clip in the video: it cannot be removed, the video would be empty."))
  b.piano.scene!.splice(b.indiceScena, 1)
  return ok(b.piano)
}

export function togliPezzo(ctx: Contesto, indiceScena: number, indicePezzo: number): Esito {
  const b = bersaglio(ctx, indiceScena, indicePezzo)
  if (typeof b === "string") return no(b)
  return senzaPezzo(b)
}

/** Un bordo fra due tratti di un pezzo a parole: il pezzo si divide in quel vuoto e il bordo che si è spostato lo dice con `rifila`. */
function bordoFraParole(ctx: Contesto, b: Bersaglio, tratto: Tratto, lato: "inizio" | "fine", indiceUltimoDelPrimo: number, valore: number): Esito {
  const delta = arrotonda(valore - (lato === "fine" ? fineTratto(tratto) : tratto.da))
  if (delta === 0) return ok(b.piano)
  const tutte = paroleDelPezzo(ctx.risolto, tratto.scena, tratto.pezzo)
  const prime = tutte.filter((x) => x.parola.tratto <= indiceUltimoDelPrimo)
  const seconde = tutte.filter((x) => x.parola.tratto > indiceUltimoDelPrimo)
  if (prime.length === 0 || seconde.length === 0) return no(t("Da una parte di questo bordo non c'è nessuna parola: il bordo non si sposta.", "There is no word on one side of this edge: the edge cannot be moved."))
  const [r0, r1] = b.pezzo.rifila ?? [0, 0]
  const uno: Pezzo = { ...copia(b.pezzo), dice: dicePerParole(prime) }
  const due: Pezzo = { ...copia(b.pezzo), dice: dicePerParole(seconde), minuto: mmss(seconde[0]!.parola.nella_sorgente) }
  conRifila(uno, [r0, lato === "fine" ? delta : 0])
  conRifila(due, [lato === "inizio" ? delta : 0, r1])
  conZoomDiviso(uno, due, b.pezzo.zoom, prime.length / tutte.length)
  b.scena.pezzi.splice(b.indicePezzo, 1, uno, due)
  return ok(b.piano)
}

/** Trascinare un bordo di un tratto al secondo `nuovo` della sorgente. */
export function bordo(ctx: Contesto, indiceTratto: number, lato: "inizio" | "fine", nuovo: number, opzioni: { durataSorgente?: number; minimo?: number } = {}): Esito {
  const tratto = ctx.risolto.tratti[indiceTratto]
  if (!tratto) return no(t("Questo tratto non c'è più: aspetta il montaggio aggiornato.", "This segment is gone: wait for the edit to update."))
  if (tratto.sorgente === null) return no(motivoSenzaVoce())
  const b = bersaglio(ctx, tratto.scena, tratto.pezzo)
  if (typeof b === "string") return no(b)
  const minimo = opzioni.minimo ?? 0.1
  const tetto = opzioni.durataSorgente ?? Infinity
  const gruppo = trattiDelPezzo(ctx.risolto, tratto.scena, tratto.pezzo)
  const posizione = gruppo.indexOf(indiceTratto)
  const ultimo = posizione === gruppo.length - 1
  const prossimo = ultimo ? undefined : ctx.risolto.tratti[gruppo[posizione + 1]!]
  const precedente = posizione === 0 ? undefined : ctx.risolto.tratti[gruppo[posizione - 1]!]
  const fine = fineTratto(tratto)

  if (lato === "inizio") {
    const valore = arrotonda(Math.min(Math.max(nuovo, precedente ? fineTratto(precedente) : 0), fine - minimo))
    if (!aTempo(b.pezzo)) {
      if (posizione !== 0) return bordoFraParole(ctx, b, tratto, "inizio", gruppo[posizione - 1]!, valore)
      const [r0, r1] = b.pezzo.rifila ?? [0, 0]
      b.pezzo.rifila = [arrotonda(r0 + valore - tratto.da), r1]
      return ok(b.piano)
    }
    if (precedente) {
      const vuoto: [number, number] = [fineTratto(precedente), tratto.da]
      impostaVia(b.pezzo, [...(b.pezzo.via ?? []).filter((v) => !sovrappone(v, vuoto[0], vuoto[1])), [vuoto[0], valore]])
      return ok(b.piano)
    }
    b.pezzo.da = valore
    return ok(b.piano)
  }

  const valore = arrotonda(Math.max(Math.min(nuovo, prossimo ? prossimo.da : tetto), tratto.da + minimo))
  if (!aTempo(b.pezzo)) {
    if (!ultimo) return bordoFraParole(ctx, b, tratto, "fine", indiceTratto, valore)
    const [r0, r1] = b.pezzo.rifila ?? [0, 0]
    b.pezzo.rifila = [r0, arrotonda(r1 + valore - fine)]
    return ok(b.piano)
  }
  if (prossimo) {
    const vuoto: [number, number] = [fine, prossimo.da]
    impostaVia(b.pezzo, [...(b.pezzo.via ?? []).filter((v) => !sovrappone(v, vuoto[0], vuoto[1])), [valore, vuoto[1]]])
    return ok(b.piano)
  }
  b.pezzo.a = valore
  return ok(b.piano)
}

function dividiZoom(zoom: Zoom | undefined, frazione: number): [Zoom | undefined, Zoom | undefined] {
  if (!zoom) return [undefined, undefined]
  if (zoom.scala !== undefined || zoom.da === undefined || zoom.a === undefined) return [copia(zoom), copia(zoom)]
  const meta = arrotonda(zoom.da + (zoom.a - zoom.da) * frazione)
  return [{ ...zoom, da: zoom.da, a: meta }, { ...zoom, da: meta, a: zoom.a }]
}

function conRifila(pezzo: Pezzo, rifila: [number, number]): void {
  if (rifila[0] === 0 && rifila[1] === 0) delete pezzo.rifila
  else pezzo.rifila = rifila
}

function conZoomDiviso(uno: Pezzo, due: Pezzo, zoom: Zoom | undefined, frazione: number): void {
  const [primo, secondo] = dividiZoom(zoom, frazione)
  if (primo) uno.zoom = primo
  else delete uno.zoom
  if (secondo) due.zoom = secondo
  else delete due.zoom
}

const dicePerParole = (parole: Array<{ parola: ParolaRisolta }>): string => parole.map((x) => x.parola.p).join(" ")

/** Dividere il pezzo sotto la linea rossa al secondo `t` del video. */
export function dividi(ctx: Contesto, secondo: number): Esito {
  const indice = trattoA(ctx.risolto, secondo)
  const tratto = ctx.risolto.tratti[indice]
  if (!tratto) return no(t("La linea rossa non è su un tratto: portala su un pezzo del montaggio e riprova.", "The red line is not on a segment: move it onto a clip of the edit and try again."))
  if (tratto.sorgente === null) return no(motivoSenzaVoce())
  const b = bersaglio(ctx, tratto.scena, tratto.pezzo)
  if (typeof b === "string") return no(b)
  const gruppo = trattiDelPezzo(ctx.risolto, tratto.scena, tratto.pezzo)
  const durataTotale = gruppo.reduce((somma, i) => somma + ctx.risolto.tratti[i]!.durata, 0)
  const prima = gruppo.slice(0, gruppo.indexOf(indice)).reduce((somma, i) => somma + ctx.risolto.tratti[i]!.durata, 0)
  const frazione = durataTotale > 0 ? (prima + (secondo - tratto.esce)) / durataTotale : 0.5

  if (aTempo(b.pezzo)) {
    const s = arrotonda(tratto.da + (secondo - tratto.esce), 100)
    if (s - tratto.da < 0.05 || fineTratto(tratto) - s < 0.05) return no(t("La linea rossa è troppo vicina al bordo del tratto: spostala un po' e riprova.", "The red line is too close to the edge of the segment: move it a little and try again."))
    const uno: Pezzo = { ...copia(b.pezzo), a: s }
    const due: Pezzo = { ...copia(b.pezzo), da: s }
    const via = b.pezzo.via ?? []
    impostaVia(uno, via.flatMap(([x, y]): Array<[number, number]> => (x < s ? [[x, Math.min(y, s)]] : [])))
    impostaVia(due, via.flatMap(([x, y]): Array<[number, number]> => (y > s ? [[Math.max(x, s), y]] : [])))
    conZoomDiviso(uno, due, b.pezzo.zoom, frazione)
    b.scena.pezzi.splice(b.indicePezzo, 1, uno, due)
    return ok(b.piano)
  }

  const parole = paroleDelPezzo(ctx.risolto, tratto.scena, tratto.pezzo)
  const prime = parole.filter((x) => (x.parola.da + x.parola.a) / 2 < secondo)
  const seconde = parole.filter((x) => (x.parola.da + x.parola.a) / 2 >= secondo)
  if (prime.length === 0 || seconde.length === 0) return no(t("Dividi fra due parole: da una parte del punto scelto non resterebbe nessuna parola.", "Split between two words: no word would be left on one side of the chosen point."))
  const uno: Pezzo = { ...copia(b.pezzo), dice: dicePerParole(prime) }
  const due: Pezzo = { ...copia(b.pezzo), dice: dicePerParole(seconde), minuto: mmss(seconde[0]!.parola.nella_sorgente) }
  const [r0, r1] = b.pezzo.rifila ?? [0, 0]
  conRifila(uno, [r0, 0])
  conRifila(due, [0, r1])
  conZoomDiviso(uno, due, b.pezzo.zoom, frazione)
  b.scena.pezzi.splice(b.indicePezzo, 1, uno, due)
  return ok(b.piano)
}

/** Togliere dal montaggio i secondi della sorgente `[da, a]` di un pezzo a tempo. */
function togliIntervallo(b: Bersaglio, tratti: Tratto[], da: number, a: number): Esito {
  const coperto = tratti.every((x) => da <= x.da + EPSILON && a >= fineTratto(x) - EPSILON)
  if (coperto) return senzaPezzo(b)
  const via = unisciVia([...(b.pezzo.via ?? []), [da, a]])
  const primo = tratti[0]!
  const ultimo = tratti[tratti.length - 1]!
  if (da <= primo.da + EPSILON) {
    const nuovoDa = arrotonda(Math.max(a, b.pezzo.da ?? 0))
    b.pezzo.da = nuovoDa
    impostaVia(b.pezzo, via.flatMap(([x, y]): Array<[number, number]> => (y > nuovoDa ? [[Math.max(x, nuovoDa), y]] : [])))
    return ok(b.piano)
  }
  if (a >= fineTratto(ultimo) - EPSILON) {
    const nuovoA = arrotonda(Math.min(da, b.pezzo.a ?? Infinity))
    b.pezzo.a = nuovoA
    impostaVia(b.pezzo, via.flatMap(([x, y]): Array<[number, number]> => (x < nuovoA ? [[x, Math.min(y, nuovoA)]] : [])))
    return ok(b.piano)
  }
  impostaVia(b.pezzo, via)
  return ok(b.piano)
}

/** Togliere dal montaggio le parole `da..a` (indici del risolto, estremi compresi). */
export function togliParole(ctx: Contesto, da: number, a: number): Esito {
  const scelte = ctx.risolto.parole.slice(Math.min(da, a), Math.max(da, a) + 1)
  if (scelte.length === 0) return no(t("Scegli prima le parole da togliere.", "First choose the words to remove."))
  const perPezzo = new Map<string, { scena: number; pezzo: number; indici: number[] }>()
  for (let i = Math.min(da, a); i <= Math.max(da, a); i++) {
    const t = ctx.risolto.tratti[ctx.risolto.parole[i]!.tratto]
    if (!t) continue
    const chiave = `${t.scena}/${t.pezzo}`
    const voce = perPezzo.get(chiave) ?? { scena: t.scena, pezzo: t.pezzo, indici: [] }
    voce.indici.push(i)
    perPezzo.set(chiave, voce)
  }
  // Dal fondo, così dividere un pezzo non sposta quelli che restano da trattare.
  const gruppi = [...perPezzo.values()].sort((x, y) => (x.scena === y.scena ? y.pezzo - x.pezzo : y.scena - x.scena))
  let corrente = ctx.proprio
  for (const g of gruppi) {
    const esito = togliParoleDelPezzo({ ...ctx, proprio: corrente }, g.scena, g.pezzo, g.indici)
    if (!esito.ok) return esito
    corrente = esito.piano
  }
  return ok(corrente)
}

function togliParoleDelPezzo(ctx: Contesto, indiceScena: number, indicePezzo: number, indiciScelti: number[]): Esito {
  const b = bersaglio(ctx, indiceScena, indicePezzo)
  if (typeof b === "string") return no(b)
  const gruppo = trattiDelPezzo(ctx.risolto, indiceScena, indicePezzo).map((i) => ctx.risolto.tratti[i]!)
  const scelte = indiciScelti.map((i) => ctx.risolto.parole[i]!)

  if (aTempo(b.pezzo)) {
    const inizio = Math.min(...scelte.map((p) => p.nella_sorgente))
    const fine = Math.max(...scelte.map((p) => p.nella_sorgente + (p.a - p.da)))
    return togliIntervallo(b, gruppo, arrotonda(inizio), arrotonda(fine))
  }

  const tutte = paroleDelPezzo(ctx.risolto, indiceScena, indicePezzo)
  const [minimo, massimo] = [Math.min(...indiciScelti), Math.max(...indiciScelti)]
  const prima = tutte.filter((x) => x.indice < minimo)
  const dopo = tutte.filter((x) => x.indice > massimo)
  if (prima.length === 0 && dopo.length === 0) return senzaPezzo(b)
  const [r0, r1] = b.pezzo.rifila ?? [0, 0]
  const pezzi: Pezzo[] = []
  if (prima.length > 0) {
    const uno: Pezzo = { ...copia(b.pezzo), dice: dicePerParole(prima) }
    conRifila(uno, [r0, 0])
    pezzi.push(uno)
  }
  if (dopo.length > 0) {
    const due: Pezzo = { ...copia(b.pezzo), dice: dicePerParole(dopo), minuto: mmss(dopo[0]!.parola.nella_sorgente) }
    conRifila(due, [0, r1])
    pezzi.push(due)
  }
  if (pezzi.length === 2) conZoomDiviso(pezzi[0]!, pezzi[1]!, b.pezzo.zoom, prima.length / tutte.length)
  b.scena.pezzi.splice(b.indicePezzo, 1, ...pezzi)
  return ok(b.piano)
}

/** Togliere un tratto: i suoi secondi (pezzo a tempo) o le sue parole (pezzo a parole). */
export function togliTratto(ctx: Contesto, indiceTratto: number): Esito {
  const tratto = ctx.risolto.tratti[indiceTratto]
  if (!tratto) return no(t("Questo tratto non c'è più: aspetta il montaggio aggiornato.", "This segment is gone: wait for the edit to update."))
  const b = bersaglio(ctx, tratto.scena, tratto.pezzo)
  if (typeof b === "string") return no(b)
  if (tratto.sorgente === null) return senzaPezzo(b)
  if (aTempo(b.pezzo)) {
    const gruppo = trattiDelPezzo(ctx.risolto, tratto.scena, tratto.pezzo).map((i) => ctx.risolto.tratti[i]!)
    return togliIntervallo(b, gruppo, tratto.da, fineTratto(tratto))
  }
  const indici = ctx.risolto.parole.flatMap((p, i) => (p.tratto === indiceTratto ? [i] : []))
  if (indici.length === 0) return togliPezzo(ctx, tratto.scena, tratto.pezzo)
  return togliParole(ctx, Math.min(...indici), Math.max(...indici))
}

/** Portare il pezzo alla posizione `nuova` fra i pezzi della sua scena. */
export function muoviPezzo(ctx: Contesto, indiceScena: number, indicePezzo: number, nuova: number): Esito {
  const b = bersaglio(ctx, indiceScena, indicePezzo)
  if (typeof b === "string") return no(b)
  const ultimo = b.scena.pezzi.length - 1
  if (nuova < 0) return no(t("È già il primo pezzo della scena.", "It is already the first clip of the scene."))
  if (nuova > ultimo) return no(t("È già l'ultimo pezzo della scena.", "It is already the last clip of the scene."))
  if (nuova === indicePezzo) return no(t("Il pezzo è già lì.", "The clip is already there."))
  const [pezzo] = b.scena.pezzi.splice(indicePezzo, 1)
  b.scena.pezzi.splice(nuova, 0, pezzo!)
  return ok(b.piano)
}

const motivoAncora = (): string => t("Questo pezzo ha un punto dell'animazione della sua scena (un'ancora o una parola): spostarlo lo sfaserebbe. Chiedi nella chat di spostarlo insieme all'animazione.", "This clip has a point of its scene's animation (an anchor or a word): moving it would throw it out of sync. Ask in the chat to move it together with the animation.")

/** Portare il pezzo in un'altra scena, alla posizione `posizione` fra i suoi pezzi; senza, in testa se la scena viene dopo e in fondo se viene prima,
 * così nel video resta dov'era. Il pezzo tiene la vista che aveva. `soloAnimazione` dice se il quadro di una scena non mostra altro che l'animazione. */
export function portaPezzoInScena(ctx: Contesto, indiceScena: number, indicePezzo: number, destinazione: number, opzioni: { posizione?: number; soloAnimazione: (quadro: string) => boolean }): Esito {
  if (destinazione === indiceScena) return no(t("Il pezzo è già in questa scena.", "The clip is already in this scene."))
  const scenaDestinazione = ctx.effettivo.scene[destinazione]
  if (!scenaDestinazione) return no(t("Questa scena non c'è più: aspetta il montaggio aggiornato.", "This scene is gone: wait for the edit to update."))
  if (ereditata(ctx.proprio, ctx.effettivo, destinazione)) return no(motivoEreditato(ctx.proprio.base ?? ""))
  const b = bersaglio(ctx, indiceScena, indicePezzo)
  if (typeof b === "string") return no(b)
  if (b.scena.pezzi.length === 1) return no(t("È l'unico pezzo della sua scena: spostandolo la scena resterebbe vuota.", "It is the only clip in its scene: moving it would leave the scene empty."))
  const sorgente = b.pezzo.sorgente
  if (sorgente === undefined && !opzioni.soloAnimazione(scenaDestinazione.quadro ?? ctx.effettivo.quadro)) return no(t("Un pezzo senza voce non ha girato: può stare solo in una scena che mostra la sola animazione.", "A clip without a voice has no footage: it can only go in a scene that shows just the animation."))
  if (sorgente !== undefined) {
    const suoi = trattiDelPezzo(ctx.risolto, indiceScena, indicePezzo).map((i) => ctx.risolto.tratti[i]!)
    const dentro = (secondo: number) => suoi.some((t) => secondo >= t.da - EPSILON && secondo <= fineTratto(t) + EPSILON)
    const scenaOrigine = ctx.effettivo.scene[indiceScena]
    const puntiDellAnimazione = [...(scenaOrigine?.ancore ?? []).map(([nome, secondo]) => [nome, secondo] as const), ...Object.values(scenaOrigine?.parole ?? {})]
    if (puntiDellAnimazione.some(([nome, secondo]) => nome === sorgente && dentro(secondo))) return no(motivoAncora())
  }
  const nomeDestinazione = scenaDestinazione.nome
  const dove = b.piano.scene?.find((s) => s.nome === nomeDestinazione)
  if (!dove) return no(t("Questa scena non c'è più: aspetta il montaggio aggiornato.", "This scene is gone: wait for the edit to update."))
  const [pezzo] = b.scena.pezzi.splice(b.indicePezzo, 1)
  const vistaDellOrigine = ctx.effettivo.scene[indiceScena]?.vista
  if (pezzo!.sorgente !== undefined && pezzo!.vista === undefined && vistaDellOrigine !== undefined && vistaDellOrigine !== scenaDestinazione.vista) pezzo!.vista = vistaDellOrigine
  const posizione = Math.min(Math.max(opzioni.posizione ?? (destinazione > indiceScena ? 0 : dove.pezzi.length), 0), dove.pezzi.length)
  dove.pezzi.splice(posizione, 0, pezzo!)
  return ok(b.piano)
}

/** Scambiare la scena con la vicina (`verso` -1 prima, 1 dopo). */
export function spostaScena(ctx: Contesto, indiceScena: number, verso: -1 | 1): Esito {
  if (ctx.proprio.base !== undefined) return no(motivoEreditato(ctx.proprio.base))
  const piano = copia(ctx.proprio)
  const scene = piano.scene ?? []
  const altra = indiceScena + verso
  if (altra < 0) return no(t("È già la prima scena.", "It is already the first scene."))
  if (altra >= scene.length) return no(t("È già l'ultima scena.", "It is already the last scene."))
  const [scena] = scene.splice(indiceScena, 1)
  scene.splice(altra, 0, scena!)
  return ok(piano)
}

/** Lo zoom del pezzo; `null` lo toglie. */
export function zoomPezzo(ctx: Contesto, indiceScena: number, indicePezzo: number, zoom: Zoom | null): Esito {
  const b = bersaglio(ctx, indiceScena, indicePezzo)
  if (typeof b === "string") return no(b)
  if (b.pezzo.sorgente === undefined) return no(motivoSenzaVoce())
  if (zoom === null) {
    delete b.pezzo.zoom
    return ok(b.piano)
  }
  const valori = [zoom.scala, zoom.da, zoom.a].filter((v): v is number => v !== undefined)
  if (valori.length === 0 || valori.some((v) => !Number.isFinite(v) || v < 1 || v > SCHEMA_ZOOM_MAX)) return no(t("Lo zoom va da 1 a {max}.", "Zoom goes from 1 to {max}.", { max: SCHEMA_ZOOM_MAX }))
  if (zoom.centro && zoom.centro.some((c) => c < 0 || c > 1)) return no(t("Il centro dello zoom sta dentro il fotogramma: valori fra 0 e 1.", "The zoom center is inside the frame: values between 0 and 1."))
  const scritto: Zoom = zoom.scala !== undefined ? { scala: arrotonda(zoom.scala, 100) } : { da: arrotonda(zoom.da!, 100), a: arrotonda(zoom.a!, 100) }
  if (zoom.centro) scritto.centro = [arrotonda(zoom.centro[0]), arrotonda(zoom.centro[1])]
  b.pezzo.zoom = scritto
  return ok(b.piano)
}

/** La vista del pezzo (il taglio del fotogramma da mostrare); `null` torna a quella della scena. */
export function vistaDelPezzo(ctx: Contesto, indiceScena: number, indicePezzo: number, vista: string | null): Esito {
  const b = bersaglio(ctx, indiceScena, indicePezzo)
  if (typeof b === "string") return no(b)
  if (b.pezzo.sorgente === undefined) return no(motivoSenzaVoce())
  if (vista === null) {
    delete b.pezzo.vista
    return ok(b.piano)
  }
  if (!ctx.effettivo.sorgenti[b.pezzo.sorgente]?.viste?.[vista]) return no(t("Questo file non ha una vista con questo nome.", "This file has no view with this name."))
  b.pezzo.vista = vista
  return ok(b.piano)
}

/** Correggere come si scrive la parola `indice` del risolto: una voce in `sottotitoli.correzioni`. */
export function correggiParola(ctx: Contesto, indice: number, testo: string, inRosso: boolean): Esito {
  const parola = ctx.risolto.parole[indice]
  const tratto = parola ? ctx.risolto.tratti[parola.tratto] : undefined
  if (!parola || !tratto) return no(t("Questa parola non c'è più: aspetta il montaggio aggiornato.", "This word is gone: wait for the edit to update."))
  if (tratto.sorgente === null) return no(t("Un pezzo senza voce non ha parole.", "A clip without a voice has no words."))
  const pulito = testo.trim().replace(/\s+/g, " ")
  if (pulito === "") return no(t("Scrivi come va scritta la parola.", "Write how the word should be spelled."))
  const piano = copia(ctx.proprio)
  const sottotitoli = (piano.sottotitoli ??= {})
  const correzioni = (sottotitoli.correzioni ??= [])
  const sentita = parola.p.replace(/^\*/, "")
  const giusta = `${inRosso ? "*" : ""}${pulito}`
  const esistente = correzioni.findIndex((c) => (c.sorgente === undefined || c.sorgente === tratto.sorgente) && (c.sentite.includes(sentita) || (typeof c.giuste === "string" && c.giuste.replace(/^\*/, "") === sentita)))
  if (pulito === sentita && !inRosso) return no(t("La parola è già scritta così.", "The word is already spelled like this."))
  const voce: Correzione = { sorgente: tratto.sorgente, sentite: esistente >= 0 && correzioni[esistente]!.sentite.length > 0 ? correzioni[esistente]!.sentite : [sentita], giuste: giusta }
  if (esistente >= 0) correzioni[esistente] = voce
  else correzioni.push(voce)
  return ok(piano)
}

/** Copia nel piano del video le scene che vengono dalla base e toglie il rimando. */
export function staccaDallaBase(ctx: Contesto): Esito {
  if (ctx.proprio.base === undefined) return no(t("Questo video non dipende da nessuna base.", "This video does not depend on any base."))
  const piano = copia(ctx.effettivo) as Piano
  delete piano.base
  return ok(piano)
}

export function cambiaAnimazione(ctx: Contesto, indiceScena: number, sigla: string | null): Esito {
  const b = bersaglio(ctx, indiceScena, 0)
  if (typeof b === "string") return no(b)
  if (sigla === null) delete b.scena.animazione
  else b.scena.animazione = sigla
  return ok(b.piano)
}

export function quadroDellaScena(ctx: Contesto, indiceScena: number, quadro: string | null): Esito {
  const b = bersaglio(ctx, indiceScena, 0)
  if (typeof b === "string") return no(b)
  if (quadro === null) delete b.scena.quadro
  else b.scena.quadro = quadro
  return ok(b.piano)
}

export function quadroDelVideo(ctx: Contesto, quadro: string): Esito {
  const piano = copia(ctx.proprio)
  piano.quadro = quadro
  return ok(piano)
}

export function modoSottotitoli(ctx: Contesto, modo: "parola per parola" | "a battute" | "nessuno"): Esito {
  const piano = copia(ctx.proprio)
  piano.sottotitoli = { ...piano.sottotitoli, modo }
  return ok(piano)
}

/** Il testo del titolo; vuoto lo toglie. `da` e `a` restano se c'erano. */
export function testoTitolo(ctx: Contesto, testo: string): Esito {
  const piano = copia(ctx.proprio)
  const pulito = testo.trim()
  if (pulito === "") delete piano.titolo
  else piano.titolo = { ...piano.titolo, testo: pulito }
  return ok(piano)
}

export function codaDelVideo(ctx: Contesto, secondi: number): Esito {
  if (!Number.isFinite(secondi) || secondi < 0) return no(t("La coda è un numero di secondi, zero o più.", "The tail is a number of seconds, zero or more."))
  const piano = copia(ctx.proprio)
  piano.coda = arrotonda(secondi, 100)
  return ok(piano)
}
