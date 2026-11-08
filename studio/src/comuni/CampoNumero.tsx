import { useState } from "react"
import { t } from "../lingua"
import { numero } from "../testo"
import styles from "./CampoNumero.module.css"

export function leggiNumero(testo: string): number | null {
  const pulito = testo.trim().replace(/\s/g, "").replace(",", ".")
  if (pulito === "") return null
  const n = Number(pulito)
  return Number.isFinite(n) ? n : null
}

/** Un numero all'italiana (con la virgola) che si conferma uscendo dal campo o con Invio. */
export function CampoNumero({ etichetta, valore, cifre = 2, unita, disabled = false, onConferma }: { etichetta: string; valore: number; cifre?: number; unita?: string; disabled?: boolean; onConferma: (n: number) => void }) {
  const [bozza, setBozza] = useState<string | null>(null)
  const [errore, setErrore] = useState(false)

  const conferma = () => {
    if (bozza === null) return
    const n = leggiNumero(bozza)
    if (n === null) {
      setErrore(true)
      return
    }
    setBozza(null)
    setErrore(false)
    if (n !== valore) onConferma(n)
  }

  return (
    <label className={styles.campo}>
      <span className={styles.etichetta}>{etichetta}</span>
      <span className={styles.riga}>
        <input
          className="mono"
          inputMode="decimal"
          value={bozza ?? numero(valore, cifre)}
          disabled={disabled}
          aria-invalid={errore}
          onChange={(e) => {
            setBozza(e.target.value)
            setErrore(false)
          }}
          onBlur={conferma}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur()
            if (e.key === "Escape") {
              setBozza(null)
              setErrore(false)
            }
          }}
        />
        {unita && <span className={styles.unita}>{unita}</span>}
      </span>
      {errore && (
        <span className={styles.errore} role="alert">
          {t("Scrivi un numero, per esempio {esempio}.", "Write a number, for example {esempio}.", { esempio: numero(1.5, 1) })}
        </span>
      )}
    </label>
  )
}
