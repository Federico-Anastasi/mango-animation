// Due colonne con una maniglia in mezzo: si trascina il bordo (o si usano le frecce sulla maniglia
// a fuoco) per allargare una colonna, il doppio clic torna alla larghezza di partenza. Una sola
// colonna ha la larghezza scelta, in px; l'altra prende il resto. Ognuna ha un minimo, così niente
// esce dallo schermo. La scelta si ricorda per vista nel browser. Sotto `unaSolaSotto` px le colonne diventano una sola e la maniglia non c'è.
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react"
import { t } from "../lingua"
import styles from "./Colonne.module.css"

/** La larghezza della maniglia, che fa anche da spazio fra le due colonne. */
const MANIGLIA_PX = 16
const PASSO_PX = 24
const PASSO_GRANDE_PX = 96

export interface PropsColonne {
  /** Come si ricorda la larghezza: una parola per vista. */
  chiave: string
  /** Quale colonna ha la larghezza che si sceglie; l'altra prende il resto. */
  fissa?: "prima" | "seconda"
  /** La larghezza di partenza della colonna scelta, in px: anche quella a cui torna il doppio clic. */
  iniziale: number
  /** I minimi in px: della colonna scelta e di quella che prende il resto. */
  minimaFissa?: number
  minimaLibera?: number
  /** Sotto questa larghezza (px) di contenitore c'è una colonna sola e nessuna maniglia. */
  unaSolaSotto?: number
  /** Con una colonna sola: `impila` le mostra una sotto l'altra, `prima` o `seconda` ne mostra una. */
  sotto?: "impila" | "prima" | "seconda"
  /** Dice a chi chiama quando le colonne sono diventate una sola (e quando tornano due). */
  onStretta?: (stretta: boolean) => void
  /** Le colonne più basse del contenuto si allineano in alto (`inizio`) o si stirano (`stira`). */
  allinea?: "inizio" | "stira"
  /** Come si dice la maniglia a chi non la vede. */
  etichetta?: string
  prima: ReactNode
  seconda: ReactNode
}

const chiaveMemoria = (chiave: string) => `mango-animation.colonne.${chiave}`

function leggiLarghezza(memoria: string): number | null {
  try {
    const valore = Number(localStorage.getItem(memoria))
    return Number.isFinite(valore) && valore > 0 ? valore : null
  } catch {
    return null
  }
}

function ricordaLarghezza(memoria: string, px: number | null): void {
  try {
    if (px === null) localStorage.removeItem(memoria)
    else localStorage.setItem(memoria, String(Math.round(px)))
  } catch {
    // Senza memoria nel browser la larghezza vale per questa apertura e basta.
  }
}

export function Colonne({
  chiave,
  fissa = "seconda",
  iniziale,
  minimaFissa = 200,
  minimaLibera = 280,
  unaSolaSotto = 720,
  sotto = "impila",
  onStretta,
  allinea = "stira",
  etichetta = t("larghezza delle colonne", "column width"),
  prima,
  seconda,
}: PropsColonne) {
  const memoria = chiaveMemoria(chiave)
  const contenitore = useRef<HTMLDivElement>(null)
  const [scelta, setScelta] = useState<number | null>(() => leggiLarghezza(memoria))
  const [larghezza, setLarghezza] = useState(0)
  // Un trascinamento in corso: da dove è partito il puntatore e la larghezza che aveva la colonna.
  const trascinando = useRef<{ x: number; larghezza: number } | null>(null)
  const [inMovimento, setInMovimento] = useState(false)

  useEffect(() => {
    setScelta(leggiLarghezza(memoria))
  }, [memoria])

  useLayoutEffect(() => {
    const area = contenitore.current
    if (!area) return
    const misura = () => setLarghezza(area.clientWidth)
    misura()
    if (typeof ResizeObserver === "undefined") return
    const osservatore = new ResizeObserver(misura)
    osservatore.observe(area)
    return () => osservatore.disconnect()
  }, [])

  // Una colonna sola quando non ci stanno due colonne al loro minimo, anche se `unaSolaSotto` è più basso.
  const soglia = Math.max(unaSolaSotto, minimaFissa + minimaLibera + MANIGLIA_PX)
  const stretta = larghezza > 0 && larghezza < soglia
  useEffect(() => {
    onStretta?.(stretta)
  }, [stretta, onStretta])

  const massima = larghezza > 0 ? Math.max(minimaFissa, larghezza - minimaLibera - MANIGLIA_PX) : Infinity
  const dentro = (px: number) => Math.min(massima, Math.max(minimaFissa, px))
  const corrente = dentro(scelta ?? iniziale)

  const imposta = (px: number, ricorda: boolean) => {
    const nuova = dentro(px)
    setScelta(nuova)
    if (ricorda) ricordaLarghezza(memoria, nuova)
  }

  // Trascinare verso sinistra allarga la colonna di destra; verso destra, quella di sinistra.
  const verso = fissa === "seconda" ? -1 : 1

  const inizia = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    trascinando.current = { x: e.clientX, larghezza: corrente }
    setInMovimento(true)
  }
  const muovi = (e: PointerEvent<HTMLDivElement>) => {
    const da = trascinando.current
    if (da) imposta(da.larghezza + verso * (e.clientX - da.x), false)
  }
  const finisci = (e: PointerEvent<HTMLDivElement>) => {
    const da = trascinando.current
    if (!da) return
    trascinando.current = null
    setInMovimento(false)
    imposta(da.larghezza + verso * (e.clientX - da.x), true)
  }

  const tasto = (e: KeyboardEvent<HTMLDivElement>) => {
    const passo = e.shiftKey ? PASSO_GRANDE_PX : PASSO_PX
    const mosse: Record<string, number | undefined> = {
      ArrowLeft: -verso * passo,
      ArrowRight: verso * passo,
      Home: minimaFissa - corrente,
      End: massima === Infinity ? undefined : massima - corrente,
    }
    const delta = mosse[e.key]
    if (delta === undefined) return
    e.preventDefault()
    imposta(corrente + delta, true)
  }

  const ripristina = () => {
    setScelta(null)
    ricordaLarghezza(memoria, null)
  }

  const modello = fissa === "seconda" ? `minmax(0, 1fr) ${MANIGLIA_PX}px ${corrente}px` : `${corrente}px ${MANIGLIA_PX}px minmax(0, 1fr)`
  const nascosta = stretta && sotto !== "impila" ? (sotto === "prima" ? "seconda" : "prima") : null

  return (
    <div
      ref={contenitore}
      className={styles.colonne}
      data-una-sola={stretta}
      data-allinea={allinea}
      data-sotto={sotto}
      data-in-movimento={inMovimento}
      style={stretta ? undefined : { gridTemplateColumns: modello }}
    >
      <div className={styles.colonna} hidden={nascosta === "prima"}>
        {prima}
      </div>
      {!stretta && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={etichetta}
          aria-valuenow={Math.round(corrente)}
          aria-valuemin={minimaFissa}
          {...(massima === Infinity ? {} : { "aria-valuemax": Math.round(massima) })}
          tabIndex={0}
          className={styles.maniglia}
          onPointerDown={inizia}
          onPointerMove={muovi}
          onPointerUp={finisci}
          onPointerCancel={finisci}
          onKeyDown={tasto}
          onDoubleClick={ripristina}
        />
      )}
      <div className={styles.colonna} hidden={nascosta === "seconda"}>
        {seconda}
      </div>
    </div>
  )
}
