import { useState } from "react"
import styles from "./CampoTesto.module.css"

/** Una riga che si scrive e si salva uscendo dal campo o con Invio; se il salvataggio non riesce il testo resta com'è scritto. */
export function CampoRiga({ etichetta, valore, tipo = "text", onSalva }: { etichetta: string; valore: string; tipo?: "text" | "datetime-local"; onSalva: (nuovo: string) => Promise<void> }) {
  const [bozza, setBozza] = useState<string | null>(null)
  const [errore, setErrore] = useState<string | null>(null)

  const salva = () => {
    if (bozza === null || bozza === valore) {
      setBozza(null)
      return
    }
    setErrore(null)
    onSalva(bozza).then(
      () => setBozza(null),
      (e: Error) => setErrore(e.message),
    )
  }

  return (
    <label className={styles.campo}>
      <span className={styles.etichetta}>{etichetta}</span>
      <input className={styles.riga} type={tipo} value={bozza ?? valore} onChange={(e) => setBozza(e.target.value)} onBlur={salva} onKeyDown={(e) => e.key === "Enter" && salva()} />
      {errore && (
        <span className={styles.errore} role="alert">
          {errore}
        </span>
      )}
    </label>
  )
}
