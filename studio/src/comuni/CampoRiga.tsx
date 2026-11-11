import styles from "./CampoTesto.module.css"
import { useBozza } from "./useBozza"

/** Una riga che si scrive e si salva uscendo dal campo o con Invio; se il salvataggio non riesce il testo resta com'è scritto. */
export function CampoRiga({ etichetta, valore, tipo = "text", onSalva }: { etichetta: string; valore: string; tipo?: "text" | "datetime-local"; onSalva: (nuovo: string) => Promise<void> }) {
  const { testo, scrivi, errore, salva } = useBozza(valore, onSalva)

  return (
    <label className={styles.campo}>
      <span className={styles.etichetta}>{etichetta}</span>
      <input className={styles.riga} type={tipo} value={testo} onChange={(e) => scrivi(e.target.value)} onBlur={salva} onKeyDown={(e) => e.key === "Enter" && salva()} />
      {errore && (
        <span className={styles.errore} role="alert">
          {errore}
        </span>
      )}
    </label>
  )
}
