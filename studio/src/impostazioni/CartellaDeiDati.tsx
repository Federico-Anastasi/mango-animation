// Dove stanno i video e il girato; si sposta con l'app (il ponte `cartellaDati`, `app/src/dati.rs`). Nel browser il ponte non c'è e la sezione non compare.
import { useEffect, useState } from "react"
import { Bottone } from "../comuni/Bottone"
import { t } from "../lingua"
import { ponteCartella, type DatiCartella } from "./cartellaDati"
import styles from "./CartellaDeiDati.module.css"

const testoDi = (e: unknown): string => (typeof e === "string" && e !== "" ? e : e instanceof Error ? e.message : t("La cartella dei dati non risponde.", "The data folder is not answering."))

export function CartellaDeiDati() {
  const [dati, setDati] = useState<DatiCartella | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [occupato, setOccupato] = useState(false)

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

  if (!ponteCartella()) return null
  return (
    <section className={styles.sezione} aria-labelledby="cartella-dei-dati">
      <h2 id="cartella-dei-dati">{t("Cartella dei dati", "Data folder")}</h2>
      {errore && (
        <p className={styles.errore} role="alert">
          {errore}
        </p>
      )}
      {dati && (
        <>
          <p className={styles.percorso}>{dati.attuale}</p>
          <p className={styles.piccolo}>{t("Qui stanno i tuoi video e il girato.", "Your videos and footage are here.")}</p>
          {dati.forzata ? (
            <p className={styles.piccolo}>{t("Questa cartella è fissata all'avvio di Mango Animation e da qui non si cambia.", "This folder is set when Mango Animation starts and cannot be changed from here.")}</p>
          ) : (
            <>
              {dati.prossima && (
                <>
                  <p className={styles.piccolo}>{t("Dal prossimo avvio:", "From the next start:")}</p>
                  <p className={styles.percorso}>{dati.prossima}</p>
                  <p className={styles.piccolo}>{t("Alla prossima apertura sposto io i file, con l'avanzamento: chiudi e riapri l'app quando vuoi.", "Next time the app opens I move the files myself, showing the progress: close and reopen the app when you like.")}</p>
                </>
              )}
              <div>
                <Bottone variante="vuoto" disabled={occupato} onClick={sposta}>
                  {t("Sposta la cartella dei dati…", "Move the data folder…")}
                </Bottone>
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}
