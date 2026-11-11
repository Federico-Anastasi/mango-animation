// L'anteprima «Piano»: il palco 1080×1920 scalato, con gli strati e i testi (sottotitoli, titolo) disegnati dal motore
// sulla stessa tela, con lo stesso carattere, corpo, bordo e colori di `stile.json`.
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react"
import type { Zoom } from "../tipi"
import { t } from "../lingua"
import { avanzamentoDelPezzo, comeRett, finestraGirato, stratoDi } from "./composizione"
import { MotorePiano, problemiDelTratto, type DatiPiano, type Slot, type ZoomProvvisorio } from "./motore"
import { trattoA } from "./ritocchi"
import { dellaSorgente } from "./sorgenti"
import { useDiscreto, type Trasporto } from "./trasporto"
import styles from "./AnteprimaPiano.module.css"

/** La tela interna: metà del lato corto di un fotogramma di 1080 (e 960 di larghezza per uno orizzontale). */
const RISOLUZIONE_VERTICALE = 540
const RISOLUZIONE_ORIZZONTALE = 960

export interface ModificaZoom {
  /** Il tratto il cui ingrandimento si trascina sull'anteprima. */
  tratto: number
  onProvvisorio: (zoom: Zoom) => void
  onFinale: (zoom: Zoom) => void
}

export interface PropsAnteprimaPiano {
  dati: DatiPiano
  trasporto: Trasporto
  zoomProvvisorio: ZoomProvvisorio | null
  modificaZoom: ModificaZoom | null
}

export function AnteprimaPiano({ dati, trasporto, zoomProvvisorio, modificaZoom }: PropsAnteprimaPiano) {
  const palco = useRef<HTMLDivElement>(null)
  const tela = useRef<HTMLCanvasElement>(null)
  const video = useRef<Array<HTMLVideoElement | null>>([])
  const motore = useRef<MotorePiano | null>(null)
  const [larghezza, setLarghezza] = useState(0)
  const [erroreDisegno, setErroreDisegno] = useState<string | null>(null)
  const pan = useRef<{ x: number; y: number; centro: [number, number]; scala: number } | null>(null)

  useEffect(() => {
    const el = palco.current
    if (!el) return
    setLarghezza(el.clientWidth)
    const osserva = new ResizeObserver(() => setLarghezza(el.clientWidth))
    osserva.observe(el)
    return () => osserva.disconnect()
  }, [])

  useEffect(() => {
    const el = video.current
    if (!tela.current || el.some((v) => !v)) return
    const slot = [0, 1].map((i): Slot => ({ girato: el[i * 3]!, sagoma: el[i * 3 + 1]!, anim: el[i * 3 + 2]! })) as [Slot, Slot]
    const m = new MotorePiano(tela.current, slot, trasporto, setErroreDisegno)
    motore.current = m
    const ferma = m.avvia()
    return () => {
      ferma()
      motore.current = null
    }
  }, [trasporto])

  useEffect(() => {
    motore.current?.imposta(dati)
  }, [dati])

  useEffect(() => {
    if (!motore.current) return
    motore.current.zoomProvvisorio = zoomProvvisorio
    motore.current.ridisegna()
  }, [zoomProvvisorio])

  const { risolto, stile, piano } = dati
  const k = useDiscreto(trasporto, (t) => trattoA(risolto, t))
  const problemi = useMemo(() => problemiDelTratto(dati, k), [dati, k])

  const tratto = risolto.tratti[k]
  const scena = tratto ? risolto.scene[tratto.scena] : undefined
  const quadro = scena ? stile.quadri[scena.quadro] : undefined
  const formato = risolto.formato
  const fattore = larghezza / formato.largo
  const larghezzaTela = formato.largo >= formato.alto ? RISOLUZIONE_ORIZZONTALE : RISOLUZIONE_VERTICALE

  const dentroGirato = (x: number, y: number) => {
    const area = quadro && stratoDi(quadro, "girato")?.area
    if (!area) return false
    const r = comeRett(area)
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
  }
  const dalPuntatore = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: (e.clientX - r.left) / fattore, y: (e.clientY - r.top) / fattore }
  }

  const iniziaPan = (e: PointerEvent<HTMLDivElement>) => {
    if (!modificaZoom || modificaZoom.tratto !== k || !tratto || !quadro) return
    const p = dalPuntatore(e)
    const strato = stratoDi(quadro, "girato")
    const info = dellaSorgente(dati.sorgenti, tratto)
    if (!strato || !info?.larghezza || !info.altezza || !dentroGirato(p.x, p.y)) return
    const vista = tratto.vista ? dellaSorgente(piano.sorgenti, tratto)?.viste?.[tratto.vista] : undefined
    const f = finestraGirato({
      sorgente: { larghezza: info.larghezza, altezza: info.altezza },
      vista: vista?.taglio ?? null,
      area: comeRett(strato.area),
      zoom: zoomProvvisorio?.tratto === k ? zoomProvvisorio.zoom : tratto.zoom,
      avanzamento: avanzamentoDelPezzo(risolto, k, trasporto.t()),
      contieni: strato.adatta === "contieni",
    })
    const scalaAttuale = (zoomProvvisorio?.tratto === k ? zoomProvvisorio.zoom : tratto.zoom)?.scala ?? 1
    pan.current = { x: p.x, y: p.y, centro: [(f.x + f.w / 2) / info.larghezza, (f.y + f.h / 2) / info.altezza], scala: scalaAttuale }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  const spostaPan = (e: PointerEvent<HTMLDivElement>): Zoom | null => {
    const da = pan.current
    if (!da || !tratto || !quadro) return null
    const strato = stratoDi(quadro, "girato")
    const info = dellaSorgente(dati.sorgenti, tratto)
    if (!strato || !info?.larghezza || !info.altezza) return null
    const p = dalPuntatore(e)
    const area = comeRett(strato.area)
    const vista = tratto.vista ? dellaSorgente(piano.sorgenti, tratto)?.viste?.[tratto.vista] : undefined
    const base = vista ? comeRett(vista.taglio) : { x: 0, y: 0, w: info.larghezza, h: info.altezza }
    const finestraLarga = Math.min(base.w, (base.h * area.w) / area.h) / da.scala
    const kx = finestraLarga / area.w
    const cx = da.centro[0] - ((p.x - da.x) * kx) / info.larghezza
    const cy = da.centro[1] - ((p.y - da.y) * kx) / info.altezza
    const dentro = (v: number) => Math.round(Math.min(Math.max(v, 0), 1) * 1000) / 1000
    return { scala: da.scala, centro: [dentro(cx), dentro(cy)] }
  }

  return (
    <div className={styles.contenitore}>
      <div
        ref={palco}
        className={styles.palco}
        data-tratto-attuale={k}
        data-testid="palco"
        style={{ aspectRatio: `${formato.largo} / ${formato.alto}`, maxWidth: formato.largo >= formato.alto ? "100%" : undefined }}
        onPointerDown={iniziaPan}
        onPointerMove={(e) => {
          if (!pan.current) return
          const zoom = spostaPan(e)
          if (zoom) modificaZoom?.onProvvisorio(zoom)
        }}
        onPointerUp={(e) => {
          if (pan.current) {
            const zoom = spostaPan(e)
            pan.current = null
            if (zoom) modificaZoom?.onFinale(zoom)
            return
          }
          trasporto.alterna()
        }}
        onPointerCancel={() => {
          pan.current = null
        }}
        role="button"
        tabIndex={-1}
        aria-label={t("Anteprima del montaggio", "Edit preview")} title={t("Tocca per avviare o fermare", "Tap to play or pause")}
        data-pan={modificaZoom?.tratto === k ? "" : undefined}
      >
        <canvas ref={tela} className={styles.tela} width={larghezzaTela} height={Math.round((larghezzaTela * formato.alto) / formato.largo)} />
        {(["girato", "sagoma", "anim"] as const).flatMap((tipo, j) =>
          [0, 1].map((i) => (
            <video
              key={`${i}-${tipo}`}
              ref={(el) => {
                video.current[i * 3 + j] = el
              }}
              className={styles.nascosto}
              playsInline
              preload="auto"
              muted={tipo !== "girato"}
              data-slot={`${i}-${tipo}`}
            />
          )),
        )}
      </div>
      {(problemi.length > 0 || erroreDisegno !== null) && (
        <ul className={styles.problemi}>
          {erroreDisegno !== null && <li>{erroreDisegno}</li>}
          {problemi.map((p) => (
            <li key={p.testo}>{p.testo}</li>
          ))}
          {problemi.some((p) => p.daPreparare) && <li>{t("Per prepararlo, chiedilo nella chat.", "To prepare it, ask in the chat.")}</li>}
        </ul>
      )}
    </div>
  )
}
