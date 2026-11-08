import { useEffect, useRef, useState } from "react"
import { useChiudiFuori } from "../comuni/useChiudiFuori"
import { t } from "../lingua"
import { ponteCartella, type DatiCartella } from "./cartellaDati"
import base from "./PannelloLavori.module.css"
import styles from "./PannelloDati.module.css"

const testoDi = (e: unknown): string => (typeof e === "string" && e !== "" ? e : e instanceof Error ? e.message : t("La cartella dei dati non risponde.", "The data folder is not answering."))

export function PannelloDati({ onChiudi }: { onChiudi: () => void }) {
  const [dati, setDati] = useState<DatiCartella | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [occupato, setOccupato] = useState(false)
  const riquadro = useRef<HTMLDivElement>(null)
  useChiudiFuori(riquadro, onChiudi)

  useEffect(() => {
    ponteCartella()
      ?.leggi()
      .then(setDati)
      .catch((e: unknown) => setErrore(testoDi(e)))
  }, [])

  const sposta = () => {
    setErrore(null)
    setOccupato(true)
    ponteCartella()
      ?.sposta()
      .then((nuovi) => nuovi && setDati(nuovi))
      .catch((e: unknown) => setErrore(testoDi(e)))
      .finally(() => setOccupato(false))
  }

  return (
    <div ref={riquadro} className={base.pannello} role="dialog" aria-label={t("Cartella dei dati", "Data folder")}>
      <h2>{t("Cartella dei dati", "Data folder")}</h2>
      {errore && (
        <p className={base.errore} role="alert">
          {errore}
        </p>
      )}
      {dati && (
        <div className={styles.blocco}>
          <p className={styles.percorso}>{dati.attuale}</p>
          <p className={base.piccolo}>{t("Qui stanno i tuoi video e il girato.", "Your videos and footage are here.")}</p>
          {dati.forzata ? (
            <p className={base.piccolo}>{t("Questa cartella è fissata all'avvio di Mango Animation e da qui non si cambia.", "This folder is set when Mango Animation starts and cannot be changed from here.")}</p>
          ) : (
            <>
              {dati.prossima && (
                <>
                  <p className={base.piccolo}>{t("Dal prossimo avvio:", "From the next start:")}</p>
                  <p className={styles.percorso}>{dati.prossima}</p>
                  <p className={base.piccolo}>{t("I file non si spostano da soli: se ti servono lì, copiali tu.", "Files do not move by themselves: if you need them there, copy them yourself.")}</p>
                </>
              )}
              <div>
                <button type="button" className={base.azione} disabled={occupato} onClick={sposta}>
                  {t("Sposta la cartella dei dati…", "Move the data folder…")}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
