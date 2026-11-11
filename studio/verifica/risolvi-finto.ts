// Un «risolvi» semplice per il finto server: dal piano e dalle parole dei file, i tratti, le parole e le battute
// con le forme di `docs/PIANO.md`, «Il risolto». Non è il motore: serve a provare l'interfaccia.
import type { Battuta, ParolaGrezzo, ParolaRisolta, Piano, PianoCompleto, Pezzo, Risolto, Scena, ScenaRisolta, Stile, Tratto } from "../src/tipi"

export interface Ingredienti {
  stile: Stile
  parole: (file: string) => ParolaGrezzo[]
  durata: (file: string) => number
}

const arrotonda = (n: number) => Math.round(n * 1000) / 1000

export function applicaBase(base: PianoCompleto, proprio: Piano): PianoCompleto {
  const sorgenti = { ...base.sorgenti }
  for (const [nome, s] of Object.entries(proprio.sorgenti ?? {})) sorgenti[nome] = { ...sorgenti[nome], ...s, viste: { ...sorgenti[nome]?.viste, ...s.viste } }
  const propriScene = proprio.scene ?? []
  const scene = base.scene.map((s) => propriScene.find((p) => p.nome === s.nome) ?? s)
  scene.push(...propriScene.filter((p) => !base.scene.some((s) => s.nome === p.nome)))
  return {
    quadro: proprio.quadro ?? base.quadro,
    sorgenti,
    scene,
    sottotitoli: {
      modo: proprio.sottotitoli?.modo ?? base.sottotitoli?.modo,
      nomi: [...(base.sottotitoli?.nomi ?? []), ...(proprio.sottotitoli?.nomi ?? [])],
      correzioni: [...(base.sottotitoli?.correzioni ?? []), ...(proprio.sottotitoli?.correzioni ?? [])],
      ritocchi: [...(base.sottotitoli?.ritocchi ?? []), ...(proprio.sottotitoli?.ritocchi ?? [])],
    },
    titolo: proprio.titolo ?? base.titolo,
    suoni: proprio.suoni ?? base.suoni,
    coda: proprio.coda ?? base.coda,
  }
}

function minutoInSecondi(minuto: string): number {
  const [m, s] = minuto.split(":").map(Number)
  return (m ?? 0) * 60 + (s ?? 0)
}

/** Gli intervalli [da, a] del pezzo nella sorgente, già tagliati dei silenzi lunghi, e le parole che contiene. */
function tagliaPezzo(pezzo: Pezzo, parole: ParolaGrezzo[], durataFile: number, stile: Stile, indice: string): { intervalli: Array<[number, number]>; paroleDelPezzo: ParolaGrezzo[] } {
  const t = stile.taglio.a_tempo
  let lo: number
  let hi: number
  let dentro: ParolaGrezzo[]
  if (pezzo.dice !== undefined) {
    const cercate = pezzo.dice.toLowerCase().split(/\s+/)
    const da = minutoInSecondi(pezzo.minuto ?? "0:00")
    const inizio = parole.findIndex((w, i) => w.da >= da - 0.01 && cercate.every((c, j) => parole[i + j]?.p.toLowerCase() === c))
    if (inizio < 0) throw new Error(`Nel pezzo ${indice} le parole «${pezzo.dice}» non si trovano dal minuto ${pezzo.minuto}.`)
    dentro = parole.slice(inizio, inizio + cercate.length)
    lo = Math.max(dentro[0]!.da - t.prima + (pezzo.rifila?.[0] ?? 0), 0)
    hi = Math.min(dentro[dentro.length - 1]!.a + t.dopo + (pezzo.rifila?.[1] ?? 0), durataFile)
  } else {
    lo = pezzo.da ?? Math.max((parole[0]?.da ?? 0) - t.prima, 0)
    hi = pezzo.a ?? Math.min((parole[parole.length - 1]?.a ?? durataFile) + t.dopo, durataFile)
    dentro = parole.filter((w) => w.a > lo && w.da < hi)
  }
  if (hi <= lo) throw new Error(`Il pezzo ${indice} finisce prima di cominciare.`)
  const pausa = pezzo.pausa ?? t.pausa
  const tagli: Array<[number, number]> = [...(pezzo.via ?? [])]
  for (let i = 0; i + 1 < dentro.length; i++) {
    const [uno, due] = [dentro[i]!, dentro[i + 1]!]
    if (due.da - uno.a > pausa) tagli.push([uno.a + t.dopo, due.da - t.prima])
  }
  const intervalli: Array<[number, number]> = []
  let corrente = lo
  for (const [a, b] of tagli.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0])) {
    if (a > corrente) intervalli.push([corrente, Math.min(a, hi)])
    corrente = Math.max(corrente, b)
  }
  if (corrente < hi) intervalli.push([corrente, hi])
  return { intervalli: intervalli.filter(([a, b]) => b - a >= 0.05).map(([a, b]) => [arrotonda(a), arrotonda(b)]), paroleDelPezzo: dentro }
}

export function risolvi(proprio: Piano, base: PianoCompleto | null, ing: Ingredienti): { effettivo: PianoCompleto; risolto: Risolto } {
  const effettivo = base ? applicaBase(base, proprio) : (proprio as PianoCompleto)
  if (!effettivo.scene || !effettivo.sorgenti || !effettivo.quadro) throw new Error("Il piano non ha quadro, sorgenti e scene.")
  for (const [nome, q] of [["", effettivo.quadro] as const, ...effettivo.scene.flatMap((s) => (s.quadro ? [[s.nome, s.quadro] as const] : []))]) {
    if (!ing.stile.quadri[q]) throw new Error(`Il quadro «${q}»${nome ? ` della scena «${nome}»` : ""} non è nello stile.`)
  }

  const tratti: Tratto[] = []
  const parole: ParolaRisolta[] = []
  const scene: ScenaRisolta[] = []
  let t = 0

  effettivo.scene.forEach((scena: Scena, s) => {
    const inizio = t
    const trattiScena: number[] = []
    scena.pezzi.forEach((pezzo, p) => {
      if (pezzo.sorgente === undefined) {
        if (pezzo.durata === undefined) throw new Error(`Il pezzo ${p + 1} della scena «${scena.nome}» non ha né sorgente né durata.`)
        trattiScena.push(tratti.length)
        tratti.push({ scena: s, pezzo: p, sorgente: null, da: 0, durata: arrotonda(pezzo.durata), esce: arrotonda(t), vista: null, zoom: null, legato: [null, null], sagoma: null })
        t += pezzo.durata
        return
      }
      const sorg = effettivo.sorgenti[pezzo.sorgente]
      if (!sorg) throw new Error(`Il pezzo ${p + 1} della scena «${scena.nome}» usa una sorgente («${pezzo.sorgente}») che il piano non dichiara.`)
      const paroleFile = ing.parole(sorg.file)
      const { intervalli, paroleDelPezzo } = tagliaPezzo(pezzo, paroleFile, ing.durata(sorg.file), ing.stile, `${p + 1} di «${scena.nome}»`)
      for (const [da, a] of intervalli) {
        const indice = tratti.length
        const dentroBordo = (x: number) => paroleFile.some((w) => w.da + 0.05 < x && x < w.a - 0.05)
        tratti.push({
          scena: s,
          pezzo: p,
          sorgente: pezzo.sorgente,
          da,
          durata: arrotonda(a - da),
          esce: arrotonda(t),
          vista: pezzo.vista ?? scena.vista ?? null,
          zoom: pezzo.zoom ?? null,
          legato: [dentroBordo(da) ? -31 : null, dentroBordo(a) ? -28 : null],
          sagoma: null,
        })
        trattiScena.push(indice)
        for (const w of paroleDelPezzo) {
          const [x0, x1] = [Math.max(w.da, da), Math.min(w.a, a)]
          if (x1 - x0 < 0.05) continue
          const correzione = (effettivo.sottotitoli?.correzioni ?? []).find((c) => (c.sorgente === undefined || c.sorgente === pezzo.sorgente) && c.sentite.map((x) => x.toLowerCase()).includes(w.p.toLowerCase()))
          const giusta = correzione ? (typeof correzione.giuste === "string" ? correzione.giuste : (correzione.giuste[correzione.sentite.findIndex((x) => x.toLowerCase() === w.p.toLowerCase())] ?? w.p)) : w.p
          parole.push({ p: giusta, tratto: indice, nella_sorgente: arrotonda(x0), da: arrotonda(t + (x0 - da)), a: arrotonda(t + (x1 - da)), voto: pezzo.dice === undefined ? null : w.p.length < 3 ? 0.4 : 0.92 })
        }
        t += a - da
      }
    })
    const ancore = (scena.ancore ?? []).flatMap(([sorgente, secondo, secondoScena]): Array<[number, number]> => {
      const k = trattiScena.find((i) => tratti[i]!.sorgente === sorgente && tratti[i]!.da <= secondo && secondo <= tratti[i]!.da + tratti[i]!.durata)
      return k === undefined ? [] : [[arrotonda(tratti[k]!.esce + (secondo - tratti[k]!.da) - inizio), secondoScena]]
    })
    const tempi = Object.fromEntries(
      Object.entries(scena.parole ?? {}).flatMap(([nome, [sorgente, secondo]]) => {
        const k = trattiScena.find((i) => tratti[i]!.sorgente === sorgente && tratti[i]!.da <= secondo && secondo <= tratti[i]!.da + tratti[i]!.durata)
        return k === undefined ? [] : [[nome, arrotonda(tratti[k]!.esce + (secondo - tratti[k]!.da) - inizio)] as const]
      }),
    )
    scene.push({ nome: scena.nome, quadro: scena.quadro ?? effettivo.quadro, inizio: arrotonda(inizio), durata: arrotonda(t - inizio), animazione: scena.animazione ?? null, ancore, tempi })
  })

  const durata = arrotonda(t)
  const battute: Battuta[] = []
  const massimo = ing.stile.sottotitoli.caratteri_per_battuta
  for (const w of parole) {
    const ultima = battute[battute.length - 1]
    if (ultima && (ultima.testo + " " + w.p).length <= massimo && w.da - ultima.a < ing.stile.sottotitoli.stacco + 0.3) {
      ultima.testo += ` ${w.p}`
      ultima.a = w.a
      ultima.istanti.push(w.da)
    } else battute.push({ da: w.da, a: w.a, testo: w.p, istanti: [w.da] })
  }
  const suoni = (effettivo.suoni ?? []).flatMap((s) => {
    if (s.scena !== undefined) {
      const scenaDelSuono = scene.find((x) => x.nome === s.scena)
      return scenaDelSuono ? [{ file: s.file, esce: arrotonda(scenaDelSuono.inizio + s.t), guadagno: s.picco }] : []
    }
    const k = tratti.find((x) => x.sorgente === s.sorgente && x.da <= s.t && s.t <= x.da + x.durata)
    return k ? [{ file: s.file, esce: arrotonda(k.esce + (s.t - k.da)), guadagno: s.picco }] : []
  })
  const avvisi = tratti.flatMap((tr, i) => [
    ...(tr.legato[0] !== null ? [{ tratto: i, cosa: `Il taglio d'inizio cade nel parlato, a ${tr.legato[0]} dB.`, cosa_en: `The start cut falls inside speech, at ${tr.legato[0]} dB.` }] : []),
    ...(tr.legato[1] !== null ? [{ tratto: i, cosa: `Il taglio di fine cade nel parlato, a ${tr.legato[1]} dB.`, cosa_en: `The end cut falls inside speech, at ${tr.legato[1]} dB.` }] : []),
  ])

  const risolto: Risolto = {
    impronta: Bun.hash(JSON.stringify([effettivo, ing.stile])).toString(16),
    formato: formatoDelQuadro(ing.stile, effettivo.quadro),
    durata,
    scene,
    tratti,
    parole,
    battute,
    titolo: effettivo.titolo ? { testo: effettivo.titolo.testo, parte: effettivo.titolo.parte ?? null, da: effettivo.titolo.da ?? 0, a: effettivo.titolo.a ?? durata } : null,
    suoni,
    avvisi,
  }
  return { effettivo, risolto }
}

// Il finto server gira con Bun, senza la pagina: non può importare i moduli dell'interfaccia che usano la lingua.
function formatoDelQuadro(stile: Stile, nomeQuadro: string): Stile["formati"][string] {
  const nome = stile.quadri[nomeQuadro]!.formato ?? "verticale"
  const formato = stile.formati[nome]
  if (!formato) throw new Error(`Il formato «${nome}» non è nello stile.`)
  return formato
}
