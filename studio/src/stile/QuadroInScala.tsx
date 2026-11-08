// Un quadro disegnato in scala sul fotogramma: le aree degli strati, dei sottotitoli e del titolo.
import { t } from "../lingua"
import { colore, comeRett, formatoDelQuadro, posaViso } from "../montaggio/composizione"
import { nomeQuadro } from "../testo"
import type { Quadro, Stile } from "../tipi"
import { nomeStrato } from "./nomeStrato"
import styles from "./QuadroInScala.module.css"

export function QuadroInScala({ nome, quadro, stile }: { nome: string; quadro: Quadro; stile: Stile }) {
  const { largo, alto } = formatoDelQuadro(stile, quadro)
  const girato = quadro.strati.find((s) => s.tipo === "girato")
  const sott = quadro.sottotitoli
  const alt = { sott: 90, tit: Math.round(stile.titolo.corpo * 1.9) }
  const largoTitolo = quadro.titolo.largo ?? stile.titolo.largo
  const sx = sott.ancora === "sinistra" ? sott.x : sott.x - sott.largo / 2
  const tx = quadro.titolo.ancora === "sinistra" ? quadro.titolo.x : quadro.titolo.x - largoTitolo / 2

  return (
    <figure className={styles.figura}>
      <svg viewBox={`0 0 ${largo} ${alto}`} role="img" aria-label={t("Il quadro {nome} disegnato in scala", "The {nome} layout drawn to scale", { nome: nomeQuadro(nome) })}>
        <rect x={0} y={0} width={largo} height={alto} fill={colore(stile, quadro.fondo)} className={styles.fondo} />
        {quadro.strati.map((s, i) => {
          if (s.tipo === "animazione" || s.tipo === "girato") {
            const r = comeRett(s.area)
            return (
              <g key={i} className={styles[s.tipo]}>
                <rect x={r.x} y={r.y} width={r.w} height={r.h} />
                <text x={r.x + r.w / 2} y={r.y + r.h / 2}>
                  {nomeStrato(s.tipo)}
                </text>
              </g>
            )
          }
          if (s.tipo === "sagoma") {
            const h = s.scala_minima * alto
            const w = (h * 9) / 16
            const x = s.x === "testa" ? (largo - w) / 2 : s.x
            return (
              <g key={i} className={styles.sagoma}>
                <rect x={x} y={alto - h} width={w} height={h} rx={w / 2} />
                <text x={x + w / 2} y={alto - h / 2}>
                  {nomeStrato("sagoma")}
                </text>
              </g>
            )
          }
          if (s.tipo === "riquadro") {
            const [w, h] = [432 * s.scala, 246 * s.scala]
            return (
              <g key={i} className={styles.riquadro}>
                <rect x={(largo - w) / 2} y={s.y} width={w} height={h} rx={s.raggio} />
                <text x={largo / 2} y={s.y + h / 2}>
                  {s.nome}
                </text>
              </g>
            )
          }
          if (s.tipo === "viso") {
            const d = posaViso(s, [0, 0, 16, 9], { larghezza: largo, altezza: alto }).destinazione
            return (
              <g key={i} className={styles.riquadro}>
                <rect x={d.x} y={d.y} width={d.w} height={d.h} rx={s.raggio} />
                <text x={d.x + d.w / 2} y={d.y + d.h / 2}>
                  {s.nome}
                </text>
              </g>
            )
          }
          const area = girato ? comeRett(girato.area) : { x: 0, y: 0, w: largo, h: alto }
          return (
            <g key={i} className={styles.inserto}>
              <rect x={area.x + s.bordo} y={area.y + s.bordo} width={s.largo} height={s.largo * 0.52} />
              <text x={area.x + s.bordo + s.largo / 2} y={area.y + s.bordo + s.largo * 0.26}>
                {nomeStrato("inserto")}
              </text>
            </g>
          )
        })}
        <g className={styles.testo}>
          <rect x={sx} y={sott.y - alt.sott / 2} width={sott.largo} height={alt.sott} />
          <text x={sx + sott.largo / 2} y={sott.y}>
            {t("sottotitoli", "subtitles")}
          </text>
        </g>
        <g className={styles.testo}>
          <rect x={tx} y={quadro.titolo.y - alt.tit / 2} width={largoTitolo} height={alt.tit} />
          <text x={tx + largoTitolo / 2} y={quadro.titolo.y}>
            {t("titolo", "title")}
          </text>
        </g>
      </svg>
      <figcaption>{nomeQuadro(nome)}</figcaption>
    </figure>
  )
}
