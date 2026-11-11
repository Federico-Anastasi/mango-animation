// I tre stili di partenza come cartoline di prova: un cartello con titolo e sottotitolo di esempio, disegnato con gli stessi calcoli e lo stesso carattere
// dell'anteprima del montaggio (`montaggio/cartelli.ts`, `montaggio/testi.ts`), così si sceglie vedendo com'è.
import { useEffect, useMemo, useRef, useState } from "react"
import { Bottone } from "../comuni/Bottone"
import { lingua, t } from "../lingua"
import { colore, formatoDelQuadro } from "../montaggio/composizione"
import { cartelliDelTitolo, disponi, postoDelCartello, schedaCartello } from "../montaggio/cartelli"
import { disegnaCartello, misuraCon, Testi } from "../montaggio/testi"
import { uguali } from "../montaggio/uguali"
import type { Quadro, Stile, StileDiPartenza } from "../tipi"
import styles from "./CartolineDiStile.module.css"

/** Le sezioni dello stile che una cartolina cambia: tutto il resto (quadri, voce, tagli, formati) resta quello del creator. */
export const ASPETTO = ["colori", "caratteri", "sottotitoli", "titolo"] as const

/** Lo stile col solo aspetto di `partenza`: è ciò che la cartolina disegna e ciò che «Usa questo» scrive. */
export const conAspetto = (stile: Stile, partenza: StileDiPartenza): Stile => ({ ...stile, ...partenza.stile })

/** `true`: i colori, i sottotitoli, il titolo e i due caratteri di `stile` sono quelli di `partenza`. */
export const eInUso = (stile: Stile, partenza: StileDiPartenza): boolean =>
  ASPETTO.every((sezione) => (sezione === "caratteri" ? uguali({ titoli: stile.caratteri["titoli"], titolo: stile.caratteri["titolo"] }, { titoli: partenza.stile.caratteri["titoli"], titolo: partenza.stile.caratteri["titolo"] }) : uguali(stile[sezione], partenza.stile[sezione])))

/** Il quadro che dà il posto al titolo e ai sottotitoli: il primo in verticale (`sagoma-al-centro` nello stile di serie). */
const quadroDiProva = (stile: Stile): Quadro | undefined => stile.quadri["sagoma-al-centro"] ?? Object.values(stile.quadri).find((q) => (q.formato ?? "verticale") === "verticale")

/** Titolo e sottotitolo di esempio: l'asterisco davanti a una parola la segna nel colore delle correzioni. */
const frasi = () => ({ titolo: t("Il tuo titolo", "Your title"), sottotitolo: t("Ecco il *tuo stile", "Here is *your style") })

/** Il cartello di prova: il titolo e i sottotitoli nei colori, nel carattere e nelle misure dello stile, sul fondo del quadro. */
export function AnteprimaDelCartello({ stile }: { stile: Stile }) {
  const tela = useRef<HTMLCanvasElement>(null)
  const [arrivati, setArrivati] = useState(0)
  // Il carattere arriva dal server dopo il primo disegno: quando c'è, si ridisegna.
  const testi = useMemo(() => new Testi(() => setArrivati((n) => n + 1)), [])
  const quadro = quadroDiProva(stile)
  useEffect(() => {
    const ctx = tela.current?.getContext("2d")
    if (!ctx || !tela.current || !quadro) return
    const { largo } = formatoDelQuadro(stile, quadro)
    const da = Math.max(0, Math.min(quadro.titolo.y, quadro.sottotitoli.y) - 150)
    const a = Math.max(quadro.titolo.y, quadro.sottotitoli.y) + 230
    tela.current.width = largo
    tela.current.height = a - da
    ctx.fillStyle = colore(stile, quadro.fondo)
    ctx.fillRect(0, 0, largo, a - da)
    ctx.translate(0, -da)

    const f = frasi()
    const sott = stile.sottotitoli
    const famiglia = testi.famiglia(stile, sott.carattere)
    const scheda = schedaCartello(stile, "sottotitoli", quadro.sottotitoli)
    const frase = sott.scrittura === "minuscola" ? f.sottotitolo.toLowerCase() : f.sottotitolo
    const d = disponi(frase, scheda, misuraCon(ctx, famiglia))
    const { x, y } = postoDelCartello(quadro.sottotitoli, d.largo, d.alto)
    // A parola per parola il cartello cresce con le parole dette: qui ce n'è una in meno di tutte.
    disegnaCartello(ctx, famiglia, d, scheda, x, y, sott.modo === "parola per parola" ? d.parole.length - 1 : null)

    const famigliaTitolo = testi.famiglia(stile, stile.titolo.carattere)
    for (const c of cartelliDelTitolo(stile, quadro, { testo: f.titolo, da: 0, a: 2 }, misuraCon(ctx, famigliaTitolo))) disegnaCartello(ctx, famigliaTitolo, c.disposizione, c.scheda, c.x, c.y, null)
  }, [stile, quadro, testi, arrivati])
  return <canvas ref={tela} className={styles.anteprima} role="img" aria-label={t("Titolo e sottotitolo di esempio", "Sample title and subtitle")} />
}

export function CartolineDiStile({ stile, partenze, onUsa }: { stile: Stile; partenze: StileDiPartenza[]; onUsa: (partenza: StileDiPartenza) => void }) {
  return (
    <ul className={styles.cartoline}>
      {partenze.map((p) => {
        const inUso = eInUso(stile, p)
        return (
          <li key={p.id} className={styles.cartolina}>
            <AnteprimaDelCartello stile={conAspetto(stile, p)} />
            <h3>{p.nome[lingua()]}</h3>
            <p>{p.descrizione[lingua()]}</p>
            <Bottone variante={inUso ? "vuoto" : "pieno"} disabled={inUso} onClick={() => onUsa(p)} etichetta={t("Usa lo stile {nome}", "Use the {nome} style", { nome: p.nome[lingua()] })}>
              {inUso ? t("In uso", "In use") : t("Usa questo", "Use this one")}
            </Bottone>
          </li>
        )
      })}
    </ul>
  )
}
