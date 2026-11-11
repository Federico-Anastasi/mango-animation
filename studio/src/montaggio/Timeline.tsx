// La timeline del montaggio: righello, scene, tratti (miniatura, onda della voce, bordi che si trascinano e si
// agganciano ai confini delle parole come le conta il motore), parole, battute dei sottotitoli, titolo e suoni, e la testina che segue
// l'anteprima. Qui si disegna e si capisce il gesto; cosa scrive nel piano lo decide `ritocchi.ts`.
import { useEffect, useMemo, useRef, useState, type PointerEvent as EventoPuntatore, type RefObject } from "react"
import { urlMedia } from "../api"
import { t } from "../lingua"
import type { ParolaGrezzo, PianoCompleto, Piano, Risolto } from "../tipi"
import { centesimi, nomeFile, tempoLeggibile } from "../testo"
import { aggancia, gruppiDiPezzi, paroleDelMotore, MAX_PX_AL_SECONDO, MIN_PX_AL_SECONDO, passoRighello, posizioneDopoTrascinamento, posizioneInAltraScena, pxPerAdattare, scenaA } from "./geometria"
import { ereditata } from "./ritocchi"
import { indiceDelTratto, selezioneDelTratto, type Selezione } from "./selezione"
import { dellaSorgente, type InfoSorgente } from "./sorgenti"
import { useTempo, type Trasporto } from "./trasporto"
import styles from "./Timeline.module.css"

export interface PropsTimeline {
  risolto: Risolto
  piano: PianoCompleto
  proprio: Piano
  sorgenti: Record<string, InfoSorgente>
  trasporto: Trasporto
  selezione: Selezione | null
  onSeleziona: (selezione: Selezione | null) => void
  /** I gesti che scrivono il piano non si fanno finché il montaggio non è ricalcolato. */
  bloccata: boolean
  paroleSorgente: (file: string) => ParolaGrezzo[] | null
  onde: (file: string) => Uint8Array | null
  /** Il fotogramma d'inizio di ogni tratto (`DettaglioVideo.fotogrammi`); dove non c'è ancora, si vede l'immagine del file. */
  fotogrammi: ReadonlyArray<string | null>
  minimoTratto: number
  onBordo: (indiceTratto: number, lato: "inizio" | "fine", secondo: number) => void
  onSposta: (scena: number, pezzo: number, posizione: number) => void
  /** Il pezzo lasciato su un'altra scena: da quale scena e pezzo, in quale scena, a che posto fra i suoi pezzi. */
  onPortaInScena: (scena: number, pezzo: number, destinazione: number, posizione: number) => void
  onModificaParola: (indice: number) => void
}

const ALTEZZA_ONDA = 28
const SOGLIA_TRASCINAMENTO_PX = 5
/** Sotto questo ingrandimento le parole sono troppo strette per leggerle. */
const PX_AL_SECONDO_PER_LE_PAROLE = 8
const ONDE_AL_SECONDO = 100

type Gesto = { tipo: "inizio" | "fine" | "sposta"; tratto: number; x0: number; delta: number; mosso: boolean }

const senzaEstensione = (file: string) => nomeFile(file).replace(/\.[^.]+$/, "")

function Onda({ da, durata, larghezza, onda }: { da: number; durata: number; larghezza: number; onda: Uint8Array }) {
  const tela = useRef<HTMLCanvasElement>(null)
  const pixel = Math.max(1, Math.min(Math.round(larghezza), 4000))
  useEffect(() => {
    const ctx = tela.current?.getContext("2d")
    if (!ctx || !tela.current) return
    ctx.clearRect(0, 0, pixel, ALTEZZA_ONDA)
    ctx.fillStyle = getComputedStyle(tela.current).color
    const [i0, i1] = [da * ONDE_AL_SECONDO, (da + durata) * ONDE_AL_SECONDO]
    for (let x = 0; x < pixel; x++) {
      const a = Math.floor(i0 + ((i1 - i0) * x) / pixel)
      const b = Math.max(a + 1, Math.floor(i0 + ((i1 - i0) * (x + 1)) / pixel))
      let picco = 0
      for (let i = a; i < b && i < onda.length; i++) picco = Math.max(picco, onda[i]!)
      const h = Math.max((picco / 255) * (ALTEZZA_ONDA - 2), 1)
      ctx.fillRect(x, (ALTEZZA_ONDA - h) / 2, 1, h)
    }
  }, [da, durata, pixel, onda])
  return <canvas ref={tela} className={styles.onda} width={pixel} height={ALTEZZA_ONDA} style={{ width: larghezza }} aria-hidden="true" />
}

function Testina({ trasporto, pxAlSecondo, scorri }: { trasporto: Trasporto; pxAlSecondo: number; scorri: RefObject<HTMLDivElement | null> }) {
  const secondo = useTempo(trasporto)
  const x = secondo * pxAlSecondo
  useEffect(() => {
    const el = scorri.current
    if (!el || !trasporto.inRiproduzione()) return
    if (x > el.scrollLeft + el.clientWidth - 40 || x < el.scrollLeft) el.scrollLeft = Math.max(x - 40, 0)
  }, [x, scorri, trasporto])
  return <div className={styles.testina} style={{ transform: `translateX(${x}px)` }} aria-hidden="true" />
}

export function Timeline(p: PropsTimeline) {
  const { risolto, piano, proprio, sorgenti, trasporto, selezione, bloccata } = p
  const scorri = useRef<HTMLDivElement>(null)
  const [larghezzaVista, setLarghezzaVista] = useState(0)
  const [zoom, setZoom] = useState<number | null>(null)
  const [gesto, setGestoVisto] = useState<Gesto | null>(null)
  const gestoOra = useRef<Gesto | null>(null)
  const setGesto = (g: Gesto | null) => {
    gestoOra.current = g
    setGestoVisto(g)
  }
  const durata = risolto.durata

  useEffect(() => {
    const el = scorri.current
    if (!el) return
    setLarghezzaVista(el.clientWidth)
    const osserva = new ResizeObserver(() => setLarghezzaVista(el.clientWidth))
    osserva.observe(el)
    return () => osserva.disconnect()
  }, [])

  const adatta = pxPerAdattare(durata, larghezzaVista)
  const pxAlSecondo = zoom ?? adatta
  const larghezza = Math.max(durata * pxAlSecondo, larghezzaVista)
  const gruppi = useMemo(() => gruppiDiPezzi(risolto), [risolto])
  const scelto = indiceDelTratto(risolto, selezione)

  const tempoDa = (clientX: number) => {
    const el = scorri.current
    return el ? (clientX - el.getBoundingClientRect().left + el.scrollLeft) / pxAlSecondo : 0
  }

  const scorriCon = (e: EventoPuntatore<HTMLDivElement>) => {
    if (e.button !== 0) return
    trasporto.ferma()
    trasporto.vai(tempoDa(e.clientX))
    const bersaglio = e.currentTarget
    bersaglio.setPointerCapture?.(e.pointerId)
    const muovi = (ev: PointerEvent) => trasporto.vai(tempoDa(ev.clientX))
    const lascia = () => {
      bersaglio.removeEventListener("pointermove", muovi)
      bersaglio.removeEventListener("pointerup", lascia)
      bersaglio.removeEventListener("pointercancel", lascia)
    }
    bersaglio.addEventListener("pointermove", muovi)
    bersaglio.addEventListener("pointerup", lascia)
    bersaglio.addEventListener("pointercancel", lascia)
  }

  // I bordi si agganciano alle parole come le conta il motore (con lo sfasamento e i tempi allineati del risolto), non ai tempi grezzi della trascrizione.
  const { paroleSorgente } = p
  const paroleDelMotoreDi = useMemo(() => {
    const fatte = new Map<string, ParolaGrezzo[] | null>()
    return (nome: string): ParolaGrezzo[] | null => {
      if (!fatte.has(nome)) {
        const f = sorgenti[nome]
        fatte.set(nome, f ? paroleDelMotore(paroleSorgente(f.file), f.sfasamento, risolto, nome) : null)
      }
      return fatte.get(nome) ?? null
    }
  }, [risolto, sorgenti, paroleSorgente])

  /** Dove cadrebbe il bordo trascinato: in secondi della sorgente, agganciato e dentro i limiti del file. */
  const bordoProposto = (g: Gesto): number | null => {
    if (g.tipo === "sposta") return null
    const tr = risolto.tratti[g.tratto]
    if (!tr || tr.sorgente === null) return null
    const file = sorgenti[tr.sorgente]
    const parole = paroleDelMotoreDi(tr.sorgente)
    const d = g.delta / pxAlSecondo
    if (g.tipo === "inizio") return Math.min(Math.max(aggancia(tr.da + d, parole, "inizio"), 0), tr.da + tr.durata - p.minimoTratto)
    const massimo = file?.durata ?? Infinity
    return Math.max(Math.min(aggancia(tr.da + tr.durata + d, parole, "fine"), massimo), tr.da + p.minimoTratto)
  }

  const inizia = (e: EventoPuntatore<HTMLElement>, tipo: Gesto["tipo"], tratto: number) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setGesto({ tipo, tratto, x0: e.clientX, delta: 0, mosso: false })
  }
  const muovi = (e: EventoPuntatore<HTMLElement>) => {
    const g = gestoOra.current
    if (!g) return
    const delta = e.clientX - g.x0
    setGesto({ ...g, delta, mosso: g.mosso || Math.abs(delta) > SOGLIA_TRASCINAMENTO_PX })
  }
  const annulla = () => setGesto(null)
  const lascia = (e: EventoPuntatore<HTMLElement>) => {
    const g = gestoOra.current
    setGesto(null)
    if (!g) return
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    const tr = risolto.tratti[g.tratto]
    if (!tr) return
    if (!g.mosso) {
      p.onSeleziona(selezioneDelTratto(risolto, g.tratto))
      if (g.tipo === "sposta") {
        trasporto.ferma()
        trasporto.vai(tempoDa(e.clientX))
      }
      return
    }
    if (bloccata) return
    if (g.tipo === "sposta") {
      const gruppo = gruppi.find((x) => x.scena === tr.scena && x.pezzo === tr.pezzo)
      if (!gruppo) return
      const centro = (gruppo.da + gruppo.a) / 2 + g.delta / pxAlSecondo
      const destinazione = scenaA(risolto.scene, centro)
      if (destinazione !== tr.scena) {
        p.onPortaInScena(tr.scena, tr.pezzo, destinazione, posizioneInAltraScena(gruppi, destinazione, centro))
        return
      }
      const nuova = posizioneDopoTrascinamento(gruppi, tr.scena, tr.pezzo, centro)
      const attuale = gruppi.filter((x) => x.scena === tr.scena).findIndex((x) => x.pezzo === tr.pezzo)
      if (nuova !== attuale) p.onSposta(tr.scena, tr.pezzo, nuova)
      return
    }
    const nuovo = bordoProposto(g)
    if (nuovo !== null) p.onBordo(g.tratto, g.tipo, Math.round(nuovo * 100) / 100)
  }

  const passo = passoRighello(pxAlSecondo)
  const tacche = Array.from({ length: Math.floor(durata / passo) + 1 }, (_, i) => i * passo)

  return (
    <div className={styles.timeline} data-bloccata={bloccata ? "" : undefined}>
      <div className={styles.barra}>
        <span className={styles.durata}>{tempoLeggibile(durata)}</span>
        <label className={styles.zoom}>
          <span>{t("Ingrandimento", "Zoom")}</span>
          <input type="range" min={Math.log(MIN_PX_AL_SECONDO)} max={Math.log(MAX_PX_AL_SECONDO)} step={0.01} value={Math.log(pxAlSecondo)} onChange={(e) => setZoom(Math.exp(Number(e.target.value)))} aria-label={t("Quanto è larga la linea del tempo", "How wide the timeline is")} />
        </label>
        <button type="button" onClick={() => setZoom(null)} disabled={zoom === null}>
          {t("Tutto il video", "Whole video")}
        </button>
      </div>
      <div className={styles.corpo} title={t("Spazio: avvia o ferma · Frecce: un fotogramma avanti o indietro, con Maiusc mezzo secondo · S: dividi qui il pezzo · Canc: togli il pezzo o le parole scelte", "Space: play or pause · Arrows: one frame forward or back, with Shift half a second · S: split the clip here · Del: remove the clip or the chosen words")}>
        <div className={styles.etichette} aria-hidden="true">
          <span className={styles.rigaRighello} />
          <span className={styles.rigaScene}>{t("Scene", "Scenes")}</span>
          <span className={styles.rigaTratti}>{t("Pezzi", "Clips")}</span>
          <span className={styles.rigaParole}>{t("Parole", "Words")}</span>
          <span className={styles.rigaBattute}>{t("Battute", "Lines")}</span>
          <span className={styles.rigaExtra}>{t("Titolo e suoni", "Title and sounds")}</span>
        </div>
        <div className={styles.scorri} ref={scorri}>
          <div className={styles.pista} style={{ width: larghezza }}>
            <div className={`${styles.riga} ${styles.rigaRighello}`} onPointerDown={scorriCon} role="slider" aria-label={t("Scorri il video", "Scrub the video")} aria-valuemin={0} aria-valuemax={durata} aria-valuenow={trasporto.t()} tabIndex={0}>
              {tacche.map((s) => (
                <span key={s} className={styles.tacca} style={{ left: s * pxAlSecondo }}>
                  {tempoLeggibile(s, passo < 1)}
                </span>
              ))}
            </div>

            <div className={`${styles.riga} ${styles.rigaScene}`} onPointerDown={scorriCon}>
              {risolto.scene.map((s, i) => {
                const eredita = ereditata(proprio, piano, i)
                const attiva = selezione?.tipo === "scena" && selezione.scena === i
                return (
                  <button
                    key={`${s.nome}-${i}`}
                    type="button"
                    className={`${styles.scena} ${attiva ? styles.scelto : ""} ${eredita ? styles.ereditata : ""}`}
                    data-colore={i % 4}
                    style={{ left: s.inizio * pxAlSecondo, width: Math.max(s.durata * pxAlSecondo, 6) }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => {
                      p.onSeleziona({ tipo: "scena", scena: i })
                      trasporto.vai(s.inizio)
                    }}
                    title={eredita ? t("{nome}: viene dal video di base", "{nome}: comes from the base video", { nome: s.nome }) : s.nome}
                  >
                    {s.nome}
                  </button>
                )
              })}
            </div>

            <div className={`${styles.riga} ${styles.rigaTratti}`} onPointerDown={scorriCon}>
              {risolto.tratti.map((tr, i) => {
                const info = dellaSorgente(sorgenti, tr)
                const senzaVoce = tr.sorgente === null
                const g = gesto?.tratto === i ? gesto : null
                const vistoBordo = g?.mosso && g.tipo !== "sposta" ? bordoProposto(g) : null
                const dInizio = vistoBordo !== null && g?.tipo === "inizio" ? vistoBordo - tr.da : 0
                const dFine = vistoBordo !== null && g?.tipo === "fine" ? vistoBordo - (tr.da + tr.durata) : 0
                const sinistra = (tr.esce + dInizio) * pxAlSecondo
                const larga = Math.max((tr.durata - dInizio + dFine) * pxAlSecondo, 4)
                const spostando = g?.mosso && g.tipo === "sposta"
                const eredita = ereditata(proprio, piano, tr.scena)
                const onda = info ? p.onde(info.file) : null
                const fotogramma = p.fotogrammi[i] ? urlMedia(p.fotogrammi[i]) : info?.miniatura
                const nome = tr.sorgente === null ? t("Senza voce", "No voice") : info ? senzaEstensione(info.file) : tr.sorgente
                return (
                  <div
                    key={i}
                    className={`${styles.tratto} ${i === scelto ? styles.scelto : ""} ${eredita ? styles.ereditata : ""} ${spostando ? styles.spostando : ""}`}
                    data-tratto={i}
                    data-scena={tr.scena}
                    style={{ left: sinistra, width: larga, transform: spostando ? `translateX(${g.delta}px)` : undefined }}
                    onPointerDown={(e) => inizia(e, "sposta", i)}
                    onPointerMove={muovi}
                    onPointerUp={lascia}
                    onPointerCancel={annulla}
                    title={senzaVoce ? `${nome}: ${centesimi(tr.durata)} s` : t("{nome}: dal secondo {da} al {a} del girato", "{nome}: from second {da} to {a} of the footage", { nome, da: centesimi(tr.da), a: centesimi(tr.da + tr.durata) })}
                  >
                    <span className={`${styles.miniatura} ${senzaVoce ? styles.senzaVoce : ""}`} style={fotogramma ? { backgroundImage: `url("${fotogramma}")` } : undefined} aria-hidden="true" />
                    {onda && <Onda da={tr.da} durata={tr.durata} larghezza={larga} onda={onda} />}
                    <span className={styles.nome}>{nome}</span>
                    {tr.legato[0] !== null && <span className={`${styles.taglio} ${styles.taglioInizio}`} title={t("Il taglio d'inizio cade dentro una parola", "The start cut falls inside a word")} />}
                    {tr.legato[1] !== null && <span className={`${styles.taglio} ${styles.taglioFine}`} title={t("Il taglio di fine cade dentro una parola", "The end cut falls inside a word")} />}
                    {!senzaVoce && (
                      <>
                        <span
                          className={`${styles.maniglia} ${styles.manigliaInizio}`}
                          role="separator"
                          aria-label={t("Accorcia o allunga l'inizio del pezzo", "Shorten or lengthen the start of the clip")}
                          aria-disabled={bloccata}
                          onPointerDown={(e) => !bloccata && inizia(e, "inizio", i)}
                          onPointerMove={muovi}
                          onPointerUp={lascia}
                          onPointerCancel={annulla}
                        />
                        <span
                          className={`${styles.maniglia} ${styles.manigliaFine}`}
                          role="separator"
                          aria-label={t("Accorcia o allunga la fine del pezzo", "Shorten or lengthen the end of the clip")}
                          aria-disabled={bloccata}
                          onPointerDown={(e) => !bloccata && inizia(e, "fine", i)}
                          onPointerMove={muovi}
                          onPointerUp={lascia}
                          onPointerCancel={annulla}
                        />
                      </>
                    )}
                    {vistoBordo !== null && <span className={styles.guida}>{centesimi(vistoBordo)} s</span>}
                  </div>
                )
              })}
            </div>

            <div className={`${styles.riga} ${styles.rigaParole}`} onPointerDown={scorriCon}>
              {pxAlSecondo >= PX_AL_SECONDO_PER_LE_PAROLE &&
                risolto.parole.map((w, i) => {
                  const dentro = selezione?.tipo === "parole" && i >= Math.min(selezione.da, selezione.a) && i <= Math.max(selezione.da, selezione.a)
                  return (
                    <button
                      key={i}
                      type="button"
                      className={`${styles.parola} ${dentro ? styles.scelto : ""} ${w.voto !== null && w.voto < 0.5 ? styles.incerta : ""}`}
                      data-parola={i}
                      style={{ left: w.da * pxAlSecondo, width: Math.max((w.a - w.da) * pxAlSecondo, 3) }}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        const ancora = selezione?.tipo === "parole" ? selezione.da : i
                        p.onSeleziona({ tipo: "parole", da: e.shiftKey ? ancora : i, a: i })
                        trasporto.ferma()
                        trasporto.vai(w.da)
                      }}
                      onDoubleClick={() => p.onModificaParola(i)}
                      title={w.voto !== null && w.voto < 0.5 ? t("{parola} (la trascrizione non è sicura)", "{parola} (the transcription is not sure)", { parola: w.p }) : w.p}
                    >
                      {w.p}
                    </button>
                  )
                })}
            </div>

            <div className={`${styles.riga} ${styles.rigaBattute}`} onPointerDown={scorriCon}>
              {risolto.battute.map((b, i) => (
                <span key={i} className={styles.battuta} style={{ left: b.da * pxAlSecondo, width: Math.max((b.a - b.da) * pxAlSecondo, 4) }} title={b.testo}>
                  {b.testo}
                </span>
              ))}
            </div>

            <div className={`${styles.riga} ${styles.rigaExtra}`} onPointerDown={scorriCon}>
              {risolto.titolo && (
                <span className={styles.titolo} style={{ left: risolto.titolo.da * pxAlSecondo, width: Math.max((risolto.titolo.a - risolto.titolo.da) * pxAlSecondo, 4) }} title={t("Titolo: {testo}", "Title: {testo}", { testo: risolto.titolo.testo })}>
                  {risolto.titolo.testo}
                </span>
              )}
              {risolto.suoni.map((s, i) => (
                <span key={i} className={styles.suono} style={{ left: s.esce * pxAlSecondo }} title={`${senzaEstensione(s.file)}, ${s.guadagno} dB`}>
                  {senzaEstensione(s.file)}
                </span>
              ))}
            </div>

            <Testina trasporto={trasporto} pxAlSecondo={pxAlSecondo} scorri={scorri} />
          </div>
        </div>
      </div>
    </div>
  )
}
