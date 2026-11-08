// L'andamento delle visualizzazioni nel tempo, una linea per canale. I colori sono i token dell'interfaccia.
import { t } from "../lingua"
import { istante, data, numero } from "../testo"
import type { Numeri } from "../tipi"
import styles from "./Andamento.module.css"

const LARGO = 560
const ALTO = 160
const MARGINE = { sopra: 12, destra: 14, sotto: 24, sinistra: 46 }
const COLORI = ["var(--inchiostro)", "var(--blu)", "var(--rosso)", "var(--verde)"]

export function Andamento({ numeri }: { numeri: Numeri[] }) {
  const punti = numeri.flatMap((n) => {
    const quando = istante(n.data)
    return quando !== null && n.visualizzazioni !== undefined ? [{ canale: n.canale, t: quando, v: n.visualizzazioni }] : []
  })
  if (punti.length < 2) return null
  const canali = [...new Set(punti.map((p) => p.canale))]
  const [t0, t1] = [Math.min(...punti.map((p) => p.t)), Math.max(...punti.map((p) => p.t))]
  const massimo = Math.max(...punti.map((p) => p.v), 1)
  const x = (t: number) => MARGINE.sinistra + (t1 === t0 ? 0.5 : (t - t0) / (t1 - t0)) * (LARGO - MARGINE.sinistra - MARGINE.destra)
  const y = (v: number) => MARGINE.sopra + (1 - v / massimo) * (ALTO - MARGINE.sopra - MARGINE.sotto)

  return (
    <figure className={styles.figura}>
      <svg viewBox={`0 0 ${LARGO} ${ALTO}`} role="img" aria-label={t("Andamento delle visualizzazioni nel tempo", "Views over time")}>
        <line x1={MARGINE.sinistra} x2={LARGO - MARGINE.destra} y1={y(0)} y2={y(0)} className={styles.asse} />
        <line x1={MARGINE.sinistra} x2={LARGO - MARGINE.destra} y1={y(massimo)} y2={y(massimo)} className={styles.guida} />
        <text x={MARGINE.sinistra - 6} y={y(massimo) + 4} textAnchor="end" className={styles.testo}>
          {numero(massimo)}
        </text>
        <text x={MARGINE.sinistra - 6} y={y(0) + 4} textAnchor="end" className={styles.testo}>
          0
        </text>
        <text x={MARGINE.sinistra} y={ALTO - 6} className={styles.testo}>
          {data(t0)}
        </text>
        <text x={LARGO - MARGINE.destra} y={ALTO - 6} textAnchor="end" className={styles.testo}>
          {data(t1)}
        </text>
        {canali.map((canale, i) => {
          const dei = punti.filter((p) => p.canale === canale).sort((a, b) => a.t - b.t)
          return (
            <g key={canale} stroke={COLORI[i % COLORI.length]} fill={COLORI[i % COLORI.length]}>
              <polyline points={dei.map((p) => `${x(p.t)},${y(p.v)}`).join(" ")} fill="none" strokeWidth="2" />
              {dei.map((p) => (
                <circle key={p.t} cx={x(p.t)} cy={y(p.v)} r="3" stroke="none" />
              ))}
            </g>
          )
        })}
      </svg>
      <figcaption className={styles.legenda}>
        {canali.map((canale, i) => (
          <span key={canale}>
            <span className={styles.segno} style={{ background: COLORI[i % COLORI.length] }} />
            {canale}
          </span>
        ))}
      </figcaption>
    </figure>
  )
}
