// Un quadro disegnato in scala sul fotogramma: le aree degli strati, dei sottotitoli e del titolo.
import type { ReactNode } from "react"
import { t } from "../lingua"
import { colore, comeRett, formatoDelQuadro, posaViso } from "../montaggio/composizione"
import { nomeQuadro } from "../testo"
import type { Quadro, Stile } from "../tipi"
import { disponiEtichette, type Etichetta } from "./etichette"
import { nomeStrato } from "./nomeStrato"
import styles from "./QuadroInScala.module.css"

/** Il corpo delle scritte, in unità del quadro (che è largo 1080 o 1920). */
const CORPO_DELLE_ETICHETTE = 68

export function QuadroInScala({ nome, quadro, stile }: { nome: string; quadro: Quadro; stile: Stile }) {
  const { largo, alto } = formatoDelQuadro(stile, quadro)
  const girato = quadro.strati.find((s) => s.tipo === "girato")
  const sott = quadro.sottotitoli
  const alt = { sott: 90, tit: Math.round(stile.titolo.corpo * 1.9) }
  const largoTitolo = quadro.titolo.largo ?? stile.titolo.largo
  const sx = sott.ancora === "sinistra" ? sott.x : sott.x - sott.largo / 2
  const tx = quadro.titolo.ancora === "sinistra" ? quadro.titolo.x : quadro.titolo.x - largoTitolo / 2

  // Il disegno delle aree e, a parte, le loro etichette: dove due aree coincidono le etichette si mettono una sotto l'altra.
  // Titolo e sottotitoli per primi: la loro area è stretta, e quelle degli strati sono grandi abbastanza da fare posto.
  const aree: ReactNode[] = []
  const etichette: Etichetta[] = [
    { x: tx + largoTitolo / 2, y: quadro.titolo.y, testo: t("titolo", "title"), sopra: quadro.titolo.y - alt.tit / 2, sotto: quadro.titolo.y + alt.tit / 2 },
    { x: sx + sott.largo / 2, y: sott.y, testo: t("sottotitoli", "subtitles"), sopra: sott.y - alt.sott / 2, sotto: sott.y + alt.sott / 2 },
  ]
  quadro.strati.forEach((s, i) => {
    if (s.tipo === "animazione" || s.tipo === "girato") {
      const r = comeRett(s.area)
      aree.push(
        <g key={i} className={styles[s.tipo]}>
          <rect x={r.x} y={r.y} width={r.w} height={r.h} />
        </g>,
      )
      etichette.push({ x: r.x + r.w / 2, y: r.y + r.h / 2, testo: nomeStrato(s.tipo), sopra: r.y, sotto: r.y + r.h })
    } else if (s.tipo === "sagoma") {
      const h = s.scala_minima * alto
      const w = (h * 9) / 16
      const x = s.x === "testa" ? (largo - w) / 2 : s.x
      aree.push(
        <g key={i} className={styles.sagoma}>
          <rect x={x} y={alto - h} width={w} height={h} rx={w / 2} />
        </g>,
      )
      etichette.push({ x: x + w / 2, y: alto - h / 2, testo: nomeStrato("sagoma"), sopra: alto - h, sotto: alto })
    } else if (s.tipo === "riquadro") {
      const [w, h] = [432 * s.scala, 246 * s.scala]
      aree.push(
        <g key={i} className={styles.riquadro}>
          <rect x={(largo - w) / 2} y={s.y} width={w} height={h} rx={s.raggio} />
        </g>,
      )
      etichette.push({ x: largo / 2, y: s.y + h / 2, testo: s.nome, sopra: s.y, sotto: s.y + h })
    } else if (s.tipo === "viso") {
      const d = posaViso(s, [0, 0, 16, 9], { larghezza: largo, altezza: alto }).destinazione
      aree.push(
        <g key={i} className={styles.riquadro}>
          <rect x={d.x} y={d.y} width={d.w} height={d.h} rx={s.raggio} />
        </g>,
      )
      etichette.push({ x: d.x + d.w / 2, y: d.y + d.h / 2, testo: s.nome, sopra: d.y, sotto: d.y + d.h })
    } else {
      const area = girato ? comeRett(girato.area) : { x: 0, y: 0, w: largo, h: alto }
      const h = s.largo * 0.52
      aree.push(
        <g key={i} className={styles.inserto}>
          <rect x={area.x + s.bordo} y={area.y + s.bordo} width={s.largo} height={h} />
        </g>,
      )
      etichette.push({ x: area.x + s.bordo + s.largo / 2, y: area.y + s.bordo + h / 2, testo: nomeStrato("inserto"), sopra: area.y + s.bordo, sotto: area.y + s.bordo + h })
    }
  })
  const poste = disponiEtichette(etichette, CORPO_DELLE_ETICHETTE, { largo, alto })

  return (
    <figure className={styles.figura}>
      <svg viewBox={`0 0 ${largo} ${alto}`} fontSize={CORPO_DELLE_ETICHETTE} role="img" aria-label={t("Il quadro {nome} disegnato in scala", "The {nome} layout drawn to scale", { nome: nomeQuadro(nome) })}>
        <rect x={0} y={0} width={largo} height={alto} fill={colore(stile, quadro.fondo)} className={styles.fondo} />
        {aree}
        <g className={styles.testo}>
          <rect x={sx} y={sott.y - alt.sott / 2} width={sott.largo} height={alt.sott} />
          <rect x={tx} y={quadro.titolo.y - alt.tit / 2} width={largoTitolo} height={alt.tit} />
        </g>
        {poste.map((e, i) => (
          <text key={i} x={e.x} y={e.y}>
            {e.testo}
          </text>
        ))}
      </svg>
      <figcaption>{nomeQuadro(nome)}</figcaption>
    </figure>
  )
}
