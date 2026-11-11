// I follower nel tempo: le letture vere, la strada dello scenario scelto e la fascia fra il prudente e l'ambizioso.
// Si disegna alla larghezza vera del contenitore, così le scritte restano leggibili anche sul telefono.
import { useEffect, useId, useRef, useState, type MouseEvent, type RefObject } from "react"
import { localeInUso, t } from "../lingua"
import { data, dataOra, GIORNO, numero } from "../testo"
import { inSecondi, interpola, type Punto } from "./calcoli"
import styles from "./Crescita.module.css"

export interface Linea {
  nome: string
  punti: Punto[]
  tipo: "vera" | "obiettivo"
}

export interface Etichetta {
  t: number
  follower: number
  testo: string
}

export interface Nota {
  t: number
  testo: string
}

interface Props {
  descrizione: string
  da: number
  a: number
  linee: Linea[]
  fascia?: { sotto: Punto[]; sopra: Punto[] }
  etichette?: Etichetta[]
  note?: Nota[]
}

const ALTO = 260
const MARGINE = { sopra: 16, destra: 16, sotto: 28, sinistra: 52 }
const MESE = 30 * GIORNO
/** Quanti pixel può essere lontano il mouse da una lettura per prenderla. */
const PRESA = 24
const GUIDE = 4

/** La larghezza di un carattere delle scritte del grafico (monospaziate, 11 px), per accorciare quelle che non entrano. */
const LARGHEZZA_CARATTERE = 6.7

const formatoMese = () => new Intl.DateTimeFormat(localeInUso(), { month: "short", year: "numeric" })
const formatoGiorno = () => new Intl.DateTimeFormat(localeInUso(), { day: "numeric", month: "short" })

/** Un massimo tondo sopra `v`: 1, 2 o 5 per una potenza di dieci. */
function tondo(v: number): number {
  const p = 10 ** Math.floor(Math.log10(Math.max(v, 1)))
  return [1, 2, 5, 10].map((m) => m * p).find((m) => m >= v) ?? 10 * p
}

/** I segni dell'asse del tempo: l'inizio dei mesi su un arco lungo, i lunedì su uno corto; al più `quanti`. */
function segniDelTempo(da: number, a: number, quanti: number): Array<{ t: number; testo: string }> {
  const lungo = a - da > 2 * MESE
  const segni: Array<{ t: number; testo: string }> = []
  const formato = lungo ? formatoMese() : formatoGiorno()
  const d = new Date(da)
  d.setHours(0, 0, 0, 0)
  if (lungo) d.setDate(1)
  while (d.getTime() <= a) {
    if (d.getTime() >= da) segni.push({ t: d.getTime(), testo: formato.format(d) })
    if (lungo) d.setMonth(d.getMonth() + 1)
    else d.setDate(d.getDate() + 7 - ((d.getDay() + 6) % 7))
  }
  const passo = Math.ceil(segni.length / quanti)
  return segni.filter((_, i) => i % passo === 0)
}

interface Valore {
  nome: string
  follower: number
}

interface Sotto {
  t: number
  esatta: boolean
  valori: Valore[]
  fascia: { sotto: number; sopra: number } | null
}

/** Cosa dice il grafico all'istante `t`: la lettura più vicina se sta a meno di `presa` ms (e allora tutto si legge in quel suo istante), lo scenario interpolato, la fascia. */
function sottoIlCursore(linee: Linea[], fascia: Props["fascia"], t: number, presa: number): Sotto {
  const lettura = linee
    .filter((l) => l.tipo === "vera")
    .flatMap((l) => l.punti.map((p) => ({ nome: l.nome, p })))
    .reduce<{ nome: string; p: Punto } | null>((meglio, c) => (Math.abs(c.p.t - t) <= presa && (!meglio || Math.abs(c.p.t - t) < Math.abs(meglio.p.t - t)) ? c : meglio), null)
  const quando = lettura?.p.t ?? t
  const valori = linee.flatMap<Valore>((l) => {
    if (l.tipo === "vera") return lettura && lettura.nome === l.nome ? [{ nome: l.nome, follower: lettura.p.follower }] : []
    const v = interpola(l.punti, quando)
    return v === null ? [] : [{ nome: l.nome, follower: v }]
  })
  const sotto = fascia ? interpola(fascia.sotto, quando) : null
  const sopra = fascia ? interpola(fascia.sopra, quando) : null
  return { t: quando, esatta: lettura !== null, valori, fascia: sotto !== null && sopra !== null ? { sotto, sopra } : null }
}

function useLarghezza(): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null)
  const [larghezza, setLarghezza] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setLarghezza(el.clientWidth)
    const osserva = new ResizeObserver(() => setLarghezza(el.clientWidth))
    osserva.observe(el)
    return () => osserva.disconnect()
  }, [])
  return [ref, larghezza]
}

export function Grafico({ descrizione, da, a, linee, fascia, etichette = [], note = [] }: Props) {
  const [ref, largo] = useLarghezza()
  const [cursore, setCursore] = useState<number | null>(null)
  const ritaglio = `ritaglio-${useId().replace(/[^a-zA-Z0-9]/g, "")}`
  const tutti = [...linee.flatMap((l) => l.punti), ...(fascia?.sopra ?? [])].filter((p) => p.t >= da && p.t <= a)
  const massimo = tondo(Math.max(...tutti.map((p) => p.follower), 1))
  const x = (t: number) => MARGINE.sinistra + ((t - da) / (a - da)) * (largo - MARGINE.sinistra - MARGINE.destra)
  const y = (v: number) => MARGINE.sopra + (1 - v / massimo) * (ALTO - MARGINE.sopra - MARGINE.sotto)
  const tracciato = (punti: Punto[]) => punti.map((p) => `${x(p.t)},${y(p.follower)}`).join(" ")
  const segni = largo > 0 ? segniDelTempo(da, a, Math.max(2, Math.floor(largo / 90))) : []
  const utile = largo - MARGINE.sinistra - MARGINE.destra
  const sotto = cursore === null ? null : sottoIlCursore(linee, fascia, da + ((cursore - MARGINE.sinistra) / utile) * (a - da), (PRESA / utile) * (a - da))
  const dove = sotto ? x(sotto.t) : 0
  const aSinistra = dove > largo / 2

  function muovi(e: MouseEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - r.left
    setCursore(px < MARGINE.sinistra || px > largo - MARGINE.destra ? null : px)
  }

  return (
    <div ref={ref} className={styles.grafico}>
      {largo > 0 && (
        <svg width={largo} height={ALTO} role="img" aria-label={descrizione} onMouseMove={muovi} onMouseLeave={() => setCursore(null)}>
          {Array.from({ length: GUIDE + 1 }, (_, i) => (massimo * i) / GUIDE).map((v) => (
            <g key={v}>
              <line x1={MARGINE.sinistra} x2={largo - MARGINE.destra} y1={y(v)} y2={y(v)} className={v === 0 ? styles.asse : styles.guida} />
              <text x={MARGINE.sinistra - 6} y={y(v) + 4} textAnchor="end" className={styles.scritta}>
                {numero(v)}
              </text>
            </g>
          ))}
          {segni.map((s) => (
            <text key={s.t} x={x(s.t)} y={ALTO - 8} textAnchor="middle" className={styles.scritta}>
              {s.testo}
            </text>
          ))}
          <clipPath id={ritaglio}>
            <rect x={MARGINE.sinistra - 6} y={0} width={Math.max(largo - MARGINE.sinistra - MARGINE.destra + 12, 0)} height={ALTO - MARGINE.sotto + 6} />
          </clipPath>
          {fascia && <polygon clipPath={`url(#${ritaglio})`} points={`${tracciato(fascia.sopra)} ${tracciato([...fascia.sotto].reverse())}`} className={styles.fascia} />}
          {note
            .filter((n) => n.t >= da && n.t <= a)
            .sort((p, q) => p.t - q.t)
            .map((n, riga) => {
              const qui = x(n.t)
              const aDestra = largo - MARGINE.destra - qui >= qui - MARGINE.sinistra
              const spazio = (aDestra ? largo - MARGINE.destra - qui : qui - MARGINE.sinistra) - 8
              const caratteri = Math.floor(spazio / LARGHEZZA_CARATTERE)
              return (
                <g key={n.t}>
                  <line x1={qui} x2={qui} y1={MARGINE.sopra} y2={y(0)} className={styles.guida} />
                  <text x={aDestra ? qui + 4 : qui - 4} y={y(0) - 6 - (riga % 2) * 14} textAnchor={aDestra ? "start" : "end"} className={styles.scritta}>
                    {n.testo.length > caratteri ? `${n.testo.slice(0, Math.max(caratteri - 1, 0))}…` : n.testo}
                    <title>{n.testo}</title>
                  </text>
                </g>
              )
            })}
          {linee.map((l) => (
            <g key={l.nome} className={l.tipo === "vera" ? styles.vera : styles.obiettivo} clipPath={`url(#${ritaglio})`}>
              <polyline points={tracciato(l.punti)} fill="none" />
              {l.punti.map((p) => (
                <circle key={p.t} cx={x(p.t)} cy={y(p.follower)} r={l.tipo === "vera" ? 4 : 3} />
              ))}
            </g>
          ))}
          {sotto && (
            <g className={styles.cursore} clipPath={`url(#${ritaglio})`}>
              <line x1={dove} x2={dove} y1={MARGINE.sopra} y2={y(0)} />
              {sotto.valori.map((v) => (
                <circle key={v.nome} cx={dove} cy={y(v.follower)} r={5} />
              ))}
            </g>
          )}
          {etichette.map((e) => (
            <text key={`${e.t}-${e.testo}`} x={x(e.t) - 8} y={y(e.follower) - 8} textAnchor="end" className={styles.etichetta}>
              {e.testo}
            </text>
          ))}
        </svg>
      )}
      {sotto && (
        <div role="tooltip" className={styles.suggerimento} style={{ top: MARGINE.sopra, ...(aSinistra ? { right: largo - dove + 12 } : { left: dove + 12 }) }}>
          <strong>{sotto.esatta ? dataOra(inSecondi(sotto.t)) : data(inSecondi(sotto.t))}</strong>
          {sotto.valori.map((v) => (
            <span key={v.nome}>
              {v.nome} {numero(Math.round(v.follower))}
            </span>
          ))}
          {sotto.fascia && (
            <span className={styles.fasciaSuggerimento}>
              {t("fascia", "band")} {numero(Math.round(sotto.fascia.sotto))}–{numero(Math.round(sotto.fascia.sopra))}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
