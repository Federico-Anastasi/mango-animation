// Gli stati che ogni vista deve disegnare, non lasciare al caso.
import { useState, type ReactNode } from "react"
import { t } from "../lingua"
import { FormSegnalazione } from "../segnalazione/FormSegnalazione"
import { ponteSegnalazione } from "../segnalazione/ponte"
import styles from "./Stati.module.css"

// `data-caricamento` è il segnale con cui `verifica/fotografa.mjs` aspetta la fine del caricamento.
export function Caricamento({ etichetta = t("carico…", "loading…") }: { etichetta?: string }) {
  return (
    <p className={styles.muto} role="status" aria-live="polite" data-caricamento="">
      {etichetta}
    </p>
  )
}

/**
 * La prima riga di `messaggio` è la frase per il creator; le altre righe, e `dettaglio`, sono per chi sistema l'errore e stanno
 * in un riquadro chiuso, che si apre a richiesta.
 */
export function Errore({ messaggio, dettaglio = [], onRiprova, etichettaRiprova = t("Riprova", "Try again") }: { messaggio: string; dettaglio?: readonly string[]; onRiprova?: () => void; etichettaRiprova?: string }) {
  const [frase, ...altreRighe] = messaggio.split("\n")
  const righe = [...altreRighe, ...dettaglio].filter((r) => r !== "")
  const [segnala, setSegnala] = useState(false)
  return (
    <div className={styles.errore} role="alert">
      <p>{frase}</p>
      {righe.length > 0 && (
        <details className={styles.dettaglio}>
          <summary>{t("Dettaglio per chi sistema l'errore", "Details for whoever fixes the error")}</summary>
          <ul>
            {righe.map((riga, i) => (
              <li key={i}>{riga}</li>
            ))}
          </ul>
        </details>
      )}
      {onRiprova && (
        <button type="button" onClick={onRiprova} className={styles.riprova}>
          {etichettaRiprova}
        </button>
      )}
      {ponteSegnalazione() && (
        <>
          <button type="button" onClick={() => setSegnala(!segnala)} aria-expanded={segnala} className={styles.riprova}>
            {t("Segnala il problema", "Report the problem")}
          </button>
          {segnala && <FormSegnalazione errore={[messaggio, ...dettaglio].filter((r) => r !== "").join("\n")} />}
        </>
      )}
    </div>
  )
}

/** La rilettura è fallita ma restano i dati di prima: la pagina lo dice, con la data dei dati se la sa. `errore` è quello della copia: senza, non scrive niente. */
export function DatiVecchi({ errore, dal, onRiprova }: { errore: string | null; dal?: string; onRiprova: () => void }) {
  if (errore === null) return null
  return (
    <p className={styles.vecchi} role="status">
      <span>{dal ? t("Dati del {quando}: l'ultima rilettura non è riuscita.", "Data from {quando}: the last refresh failed.", { quando: dal }) : t("L'ultima rilettura non è riuscita: questi dati possono essere vecchi.", "The last refresh failed: this data may be out of date.")}</span>
      <button type="button" onClick={onRiprova} className={styles.riprova}>
        {t("Riprova", "Try again")}
      </button>
    </p>
  )
}

export function Vuoto({ children }: { children: ReactNode }) {
  return <p className={styles.muto}>{children}</p>
}
