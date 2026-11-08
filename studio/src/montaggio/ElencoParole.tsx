// Il parlato del video come testo: un clic porta la testina lì, Maiusc estende la scelta, doppio clic corregge.
import { useEffect, useRef } from "react"
import { tempoLeggibile } from "../testo"
import { t } from "../lingua"
import type { Risolto } from "../tipi"
import type { Selezione } from "./selezione"
import { useDiscreto, type Trasporto } from "./trasporto"
import styles from "./ElencoParole.module.css"

export function ElencoParole({ risolto, trasporto, selezione, onSeleziona, onModifica }: { risolto: Risolto; trasporto: Trasporto; selezione: Selezione | null; onSeleziona: (s: Selezione) => void; onModifica: (indice: number) => void }) {
  const adesso = useDiscreto(trasporto, (t) => risolto.parole.findIndex((p) => t >= p.da && t < p.a))
  const contenitore = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (adesso < 0 || !trasporto.inRiproduzione()) return
    const el = contenitore.current?.querySelector<HTMLElement>(`[data-parola="${adesso}"]`)
    const area = contenitore.current
    if (!el || !area) return
    if (el.offsetTop < area.scrollTop || el.offsetTop + el.offsetHeight > area.scrollTop + area.clientHeight) area.scrollTop = Math.max(el.offsetTop - area.clientHeight / 3, 0)
  }, [adesso, trasporto])

  if (risolto.parole.length === 0 && risolto.tratti.every((t) => t.sorgente === null)) return <p className={styles.vuoto}>{t("Questo montaggio non ha voce: ci sono solo animazioni e suoni.", "This edit has no voice: there are only animations and sounds.")}</p>
  if (risolto.parole.length === 0) return <p className={styles.vuoto}>{t("In questo montaggio non c'è parlato trascritto: se il girato non è stato preparato, preparalo e le parole compaiono qui.", "This edit has no transcribed speech: if the footage has not been prepared, prepare it and the words appear here.")}</p>

  return (
    <div ref={contenitore} className={styles.elenco}>
      {risolto.parole.map((p, i) => {
        const scelta = selezione?.tipo === "parole" && i >= Math.min(selezione.da, selezione.a) && i <= Math.max(selezione.da, selezione.a)
        return (
          <button
            key={i}
            type="button"
            data-parola={i}
            className={`${styles.parola} ${scelta ? styles.scelta : ""} ${i === adesso ? styles.adesso : ""}`}
            title={`${tempoLeggibile(p.da)}${p.voto !== null && p.voto < 0.5 ? t(", la trascrizione non è sicura", ", the transcription is not sure") : ""}`}
            onClick={(e) => {
              const ancora = selezione?.tipo === "parole" ? selezione.da : i
              onSeleziona({ tipo: "parole", da: e.shiftKey ? ancora : i, a: i })
              trasporto.ferma()
              trasporto.vai(p.da)
            }}
            onDoubleClick={() => onModifica(i)}
          >
            {p.p}
          </button>
        )
      })}
    </div>
  )
}
