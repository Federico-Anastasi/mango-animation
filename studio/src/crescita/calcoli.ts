// I conti della pagina della crescita: dove sono i follower, dove dovrebbero essere secondo lo scenario scelto,
// e quanto rende ogni tipo di video. Le date sono istanti in millisecondi.
import { t } from "../lingua"
import { istante } from "../testo"
import type { Crescita, PuntoAndamento, VideoDelCanale } from "../tipi"

export const GIORNO = 86_400_000

/** Le date di `testo.ts` leggono un numero come secondi; qui gli istanti sono in millisecondi. */
export const inSecondi = (ms: number): number => ms / 1000

export interface Punto {
  t: number
  follower: number
}

const GIORNI = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"]

/** Il nome di un giorno della settimana nella lingua in uso; un nome che non è fra i sette resta com'è. */
export function nomeGiorno(giorno: string): string {
  switch (giorno) {
    case "lunedì":
      return t("lunedì", "Monday")
    case "martedì":
      return t("martedì", "Tuesday")
    case "mercoledì":
      return t("mercoledì", "Wednesday")
    case "giovedì":
      return t("giovedì", "Thursday")
    case "venerdì":
      return t("venerdì", "Friday")
    case "sabato":
      return t("sabato", "Saturday")
    case "domenica":
      return t("domenica", "Sunday")
    default:
      return giorno
  }
}

/** Il valore sulla spezzata all'istante `t`; `null` fuori dalla serie. */
export function interpola(punti: Punto[], t: number): number | null {
  if (punti.length === 0 || t < punti[0]!.t || t > punti[punti.length - 1]!.t) return null
  const dopo = punti.findIndex((p) => p.t >= t)
  const b = punti[dopo]!
  if (b.t === t || dopo === 0) return b.follower
  const a = punti[dopo - 1]!
  return a.follower + ((b.follower - a.follower) * (t - a.t)) / (b.t - a.t)
}

/** Le letture che hanno i follower, in ordine di tempo. */
export function serie(andamento: PuntoAndamento[]): Punto[] {
  return andamento.flatMap((p) => {
    const t = istante(p.quando)
    return t !== null && p.follower !== null ? [{ t, follower: p.follower }] : []
  })
}

/** La strada di uno scenario: la partenza e poi le sue tappe. Vuota se lo scenario non c'è. */
export function percorso(crescita: Crescita, nome: string): Punto[] {
  const scenario = crescita.scenari.find((s) => s.nome === nome)
  if (!scenario) return []
  return [crescita.partenza, ...scenario.tappe].flatMap((p) => {
    const t = istante(p.data)
    return t !== null ? [{ t, follower: p.follower }] : []
  })
}

/** Follower al giorno del tratto in cui cade `t`; prima della partenza vale il primo tratto, dopo l'ultima tappa l'ultimo. */
export function ritmoAlGiorno(punti: Punto[], t: number): number | null {
  if (punti.length < 2) return null
  const dopo = punti.findIndex((p) => p.t > t)
  const indice = dopo === -1 ? punti.length - 1 : Math.max(dopo, 1)
  const a = punti[indice - 1]!
  const b = punti[indice]!
  return ((b.follower - a.follower) * GIORNO) / (b.t - a.t)
}

/** Il lunedì a mezzanotte (ora locale) della settimana di `t`. */
export function inizioSettimana(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.getTime()
}

/** I follower guadagnati nei `giorni` prima dell'ultima lettura; `null` se le letture non arrivano così indietro. */
export function ultimiGiorni(andamento: PuntoAndamento[], giorni: number): number | null {
  const punti = serie(andamento)
  const ultimo = punti[punti.length - 1]
  if (!ultimo) return null
  const prima = interpola(punti, ultimo.t - giorni * GIORNO)
  return prima === null ? null : ultimo.follower - prima
}

export interface Settimana {
  inizio: number
  /** I follower da guadagnare in questa settimana secondo lo scenario scelto. */
  obiettivo: number | null
  /** I follower guadagnati dal lunedì all'ultima lettura; `null` se nessuna lettura copre il lunedì. */
  fatti: number | null
  /** Dove essere alla fine del giorno del controllo, in follower guadagnati dal lunedì. */
  alControllo: { giorno: string; follower: number } | null
  ultimaLettura: number | null
}

export function settimana(andamento: PuntoAndamento[], crescita: Crescita, ora: number): Settimana {
  const inizio = inizioSettimana(ora)
  const ritmo = ritmoAlGiorno(percorso(crescita, crescita.obiettivo), inizio + 3.5 * GIORNO)
  const obiettivo = ritmo === null ? null : Math.round(ritmo * 7)
  const punti = serie(andamento)
  const ultimo = punti[punti.length - 1]
  const alLunedi = interpola(punti, inizio)
  const fatti = ultimo && ultimo.t >= inizio && alLunedi !== null ? Math.round(ultimo.follower - alLunedi) : null
  const controllo = crescita.settimana.find((g) => g.controllo)
  const giorniAlControllo = controllo ? GIORNI.indexOf(controllo.giorno) + 1 : 0
  return {
    inizio,
    obiettivo,
    fatti,
    alControllo: controllo && giorniAlControllo > 0 && ritmo !== null ? { giorno: controllo.giorno, follower: Math.round(ritmo * giorniAlControllo) } : null,
    ultimaLettura: ultimo?.t ?? null,
  }
}

export interface RigaTipo {
  nome: string
  spiega: string
  video: number
  mediana: number | null
  /** I nuovi follower e le visualizzazioni dei video che hanno il numero dei nuovi follower: da qui viene `perMille`. */
  follower: number
  viste: number
  /** Follower nuovi ogni mille visualizzazioni, sui video che hanno il numero dei nuovi follower. */
  perMille: number | null
  /** La parte dei nuovi follower di tutti i video che viene da questo tipo. */
  quota: number | null
}

const mediana = (valori: number[]): number | null => {
  if (valori.length === 0) return null
  const s = [...valori].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

export function perTipo(video: VideoDelCanale[], tipi: Crescita["tipi"]): RigaTipo[] {
  const conFollower = video.filter((v) => v.nuovi_follower !== undefined && v.visualizzazioni !== undefined)
  const tuttiIFollower = conFollower.reduce((s, v) => s + v.nuovi_follower!, 0)
  return tipi.map((tipo) => {
    const dei = video.filter((v) => v.slug !== null && tipo.video.includes(v.slug) && v.visualizzazioni !== undefined)
    const misurati = dei.filter((v) => v.nuovi_follower !== undefined)
    const follower = misurati.reduce((s, v) => s + v.nuovi_follower!, 0)
    const viste = misurati.reduce((s, v) => s + v.visualizzazioni!, 0)
    return {
      nome: tipo.nome,
      spiega: tipo.spiega,
      video: dei.length,
      mediana: mediana(dei.map((v) => v.visualizzazioni!)),
      follower,
      viste,
      perMille: viste > 0 ? (follower * 1000) / viste : null,
      quota: dei.length > 0 && tuttiIFollower > 0 ? follower / tuttiIFollower : null,
    }
  })
}
