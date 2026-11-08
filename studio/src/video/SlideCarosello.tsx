import { useEffect, useRef, useState } from "react"
import { urlUscita } from "../api"
import { Bottone } from "../comuni/Bottone"
import { Icona } from "../comuni/icone"
import { Vuoto } from "../comuni/Stati"
import { lavori, useCopia } from "../dati"
import { t } from "../lingua"
import { dataOra } from "../testo"
import type { Lavoro, Uscita } from "../tipi"
import type { PropsScheda } from "./PaginaVideo"
import styles from "./SlideCarosello.module.css"

/** Le slide di un carosello, `uscite/slide-<n>.png`, in ordine di numero. */
export function slideDelCarosello(uscite: Uscita[]): Array<Uscita & { numero: number }> {
  return uscite
    .flatMap((u) => {
      const trovato = /\/uscite\/slide-(\d+)\.png$/.exec(u.file)
      return trovato ? [{ ...u, numero: Number(trovato[1]) }] : []
    })
    .sort((a, b) => a.numero - b.numero)
}

export interface AvvisoSlide {
  testo: string
  /** La slide a cui si riferisce; `null` se riguarda la pagina intera. */
  slide: number | null
}

/** Le righe «attenzione: …» che il lavoro `carosello` ha scritto, senza la parola d'ordine e con la maiuscola. */
export function avvisiDelLavoro(righe: string[] = []): AvvisoSlide[] {
  return righe.flatMap((riga) => {
    const trovato = /^attenzione: (.+)$/.exec(riga)
    if (!trovato) return []
    const testo = trovato[1]!
    const slide = /^slide (\d+):/.exec(testo)?.[1]
    return [{ testo: testo.charAt(0).toUpperCase() + testo.slice(1), slide: slide === undefined ? null : Number(slide) }]
  })
}

const eDelCarosello = (l: Lavoro, slug: string) => l.slug === slug && l.comando === "carosello"
const eUnCampoDiTesto = (bersaglio: EventTarget | null) => bersaglio instanceof HTMLElement && (bersaglio.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(bersaglio.tagName))

export function SlideCarosello({ video }: PropsScheda) {
  const slide = slideDelCarosello(video.uscite)
  const stato = useCopia(lavori).dato
  const [scelta, setScelta] = useState(0)
  const lettore = useRef<HTMLDivElement>(null)
  const indice = Math.min(scelta, Math.max(slide.length - 1, 0))
  const attuale = slide[indice]

  const vaiA = (i: number) => setScelta(Math.max(0, Math.min(slide.length - 1, i)))
  const mostra = (i: number) => {
    vaiA(i)
    lettore.current?.scrollIntoView?.({ block: "nearest" })
  }

  useEffect(() => {
    const premuto = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || eUnCampoDiTesto(e.target)) return
      if (e.key === "ArrowRight") setScelta(Math.min(indice + 1, slide.length - 1))
      if (e.key === "ArrowLeft") setScelta(Math.max(indice - 1, 0))
    }
    window.addEventListener("keydown", premuto)
    return () => window.removeEventListener("keydown", premuto)
  }, [indice, slide.length])

  const inCorso = stato?.in_corso && eDelCarosello(stato.in_corso, video.slug) ? stato.in_corso : null
  const inCoda = stato?.in_coda.find((l) => eDelCarosello(l, video.slug)) ?? null
  const ultimo = stato?.finiti.find((l) => eDelCarosello(l, video.slug)) ?? null
  const occupato = inCorso !== null || inCoda !== null

  const comandi = (
    <div className={styles.rendi}>
      {!occupato && slide.length > 0 && <p className={styles.stato}>{t("Per rendere di nuovo le slide, chiedilo nella chat.", "To render the slides again, ask in the chat.")}</p>}
      {inCorso && (
        <p className={styles.stato} role="status">
          {t("Sto rendendo le slide…", "Rendering the slides…")}
        </p>
      )}
      {!inCorso && inCoda && (
        <p className={styles.stato} role="status">
          {t("Le slide sono in attesa di essere rese.", "The slides are waiting to be rendered.")}
        </p>
      )}
    </div>
  )

  const avvisi = !occupato && ultimo !== null && <AvvisiDelLavoro lavoro={ultimo} onSlide={(n) => mostra(n - 1)} />

  if (attuale === undefined) {
    return (
      <section className={styles.vuoto} aria-label={t("Le slide", "The slides")}>
        <Vuoto>{t("Le slide non ci sono ancora. Per scriverle e renderle, chiedilo nella chat: compaiono qui.", "The slides are not there yet. To write and render them, ask in the chat: they appear here.")}</Vuoto>
        {comandi}
        {avvisi}
      </section>
    )
  }

  return (
    <section className={styles.pagina} aria-label={t("Le slide", "The slides")}>
      {comandi}
      <div className={styles.corpo}>
        <div className={styles.lettore} ref={lettore}>
          <img className={styles.grande} src={urlUscita(attuale)} alt={t("Slide {n} di {tot}", "Slide {n} of {tot}", { n: indice + 1, tot: slide.length })} />
          <div className={styles.comandi}>
            <Bottone variante="vuoto" etichetta={t("Slide precedente", "Previous slide")} disabled={indice === 0} onClick={() => vaiA(indice - 1)}>
              <Icona nome="sinistra" />
            </Bottone>
            <span className="mono">
              {indice + 1} / {slide.length}
            </span>
            <Bottone variante="vuoto" etichetta={t("Slide successiva", "Next slide")} disabled={indice === slide.length - 1} onClick={() => vaiA(indice + 1)}>
              <Icona nome="destra" />
            </Bottone>
          </div>
        </div>
        <div className={styles.lato}>
          {avvisi}
          <ul className={styles.miniature} aria-label={t("Tutte le slide", "All the slides")}>
            {slide.map((s, i) => (
              <li key={s.file}>
                <button type="button" className={styles.miniatura} aria-label={t("Slide {n}", "Slide {n}", { n: s.numero })} aria-current={i === indice ? "true" : undefined} onClick={() => mostra(i)}>
                  <img src={urlUscita(s)} alt="" loading="lazy" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

function AvvisiDelLavoro({ lavoro, onSlide }: { lavoro: Lavoro; onSlide: (numero: number) => void }) {
  if (lavoro.esito === "fallito") {
    return (
      <p className={styles.errore} role="alert">
        {t("Le slide non sono state rese: ", "The slides were not rendered: ")}
        {lavoro.errore ?? t("guarda l'ultimo lavoro nella barra in alto", "see the last job in the top bar")}
      </p>
    )
  }
  if (lavoro.esito === "fermato") return <p className={styles.stato}>{t("L'ultima resa è stata fermata: le slide possono essere quelle di prima.", "The last render was stopped: the slides may be the previous ones.")}</p>
  const avvisi = avvisiDelLavoro(lavoro.righe)
  return (
    <div className={styles.avvisi}>
      <h3>
        {t("Avvisi", "Warnings")}
        {lavoro.finito ? <span className={styles.quando}>{t(" · resa del {data}", " · rendered on {data}", { data: dataOra(lavoro.finito) })}</span> : null}
      </h3>
      {avvisi.length === 0 ? (
        <p className={styles.stato}>{t("Nessun avviso", "No warnings")}</p>
      ) : (
        <ul aria-label={t("Avvisi delle slide", "Slide warnings")}>
          {avvisi.map(({ testo, slide }, i) => (
            <li key={`${i}-${testo}`}>
              {slide === null ? (
                testo
              ) : (
                <button type="button" className={styles.avviso} onClick={() => onSlide(slide)}>
                  {testo}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
