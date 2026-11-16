// Dove stanno i video e il girato; si sposta con l'app (il ponte `cartellaDati`, `app/src/dati.rs`). Nel browser il ponte non c'è e il gruppo non compare.
import { useEffect, useState } from "react"
import { Bottone } from "../comuni/Bottone"
import { CardDiRighe, Riga } from "../comuni/CardDiRighe"
import { EtichettaDiStato } from "../comuni/EtichettaDiStato"
import { t } from "../lingua"
import { ponteCartella, type DatiCartella } from "./cartellaDati"
import { fraseDi } from "./rifiuto"
import { testoDi } from "./righe"
import styles from "./Impostazioni.module.css"

const scorta = () => t("La cartella dei dati non risponde.", "The data folder is not answering.")

export function CartellaDeiDati() {
  const [dati, setDati] = useState<DatiCartella | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [occupato, setOccupato] = useState(false)

  useEffect(() => {
    ponteCartella()
      ?.leggi()
      .then(setDati)
      .catch((e: unknown) => setErrore(fraseDi(e, scorta())))
  }, [])

  const sposta = () => {
    setErrore(null)
    setOccupato(true)
    ponteCartella()
      ?.sposta()
      .then((nuovi) => nuovi && setDati(nuovi))
      .catch((e: unknown) => setErrore(fraseDi(e, scorta())))
      .finally(() => setOccupato(false))
  }

  if (!ponteCartella()) return null
  const cartella = testoDi("generale.cartella")
  return (
    <>
      <CardDiRighe nome={t("Solo di Mango Animation", "Only in Mango Animation")}>
        <Riga nome={cartella.nome} spiegazione={cartella.spiegazione}>
          {dati?.forzata ? (
            <EtichettaDiStato>{t("Fissata all'avvio", "Set at start")}</EtichettaDiStato>
          ) : (
            dati && (
              <Bottone disabled={occupato} onClick={sposta}>
                {t("Sposta la cartella dei dati…", "Move the data folder…")}
              </Bottone>
            )
          )}
        </Riga>
        {dati && <Riga nome={t("Dove sta ora", "Where it is now")} spiegazione={dati.attuale}>{null}</Riga>}
        {dati?.prossima && !dati.forzata && <Riga nome={t("Dal prossimo avvio", "From the next start")} spiegazione={dati.prossima}>{null}</Riga>}
      </CardDiRighe>
      {dati?.forzata && <p className={styles.nota}>{t("Questa cartella è fissata all'avvio di Mango Animation e da qui non si cambia.", "This folder is set when Mango Animation starts and cannot be changed from here.")}</p>}
      {dati?.prossima && !dati.forzata && <p className={styles.nota}>{t("Alla prossima apertura sposto io i file, con l'avanzamento: chiudi e riapri l'app quando vuoi.", "Next time the app opens I move the files myself, showing the progress: close and reopen the app when you like.")}</p>}
      {errore && (
        <p className={styles.errore} role="alert">
          {errore}
        </p>
      )}
    </>
  )
}
