// Un numero che si cambia a passi, fra un minimo e un massimo.
import { t } from "../lingua"
import styles from "./PiuMeno.module.css"

export function PiuMeno({ etichetta, valore, minimo, massimo, passo = 1, mostra = String, onCambia }: { etichetta: string; valore: number; minimo: number; massimo: number; passo?: number; mostra?: (valore: number) => string; onCambia: (valore: number) => void }) {
  return (
    <div role="group" aria-label={etichetta} className={styles.piuMeno}>
      <button type="button" aria-label={t("Meno", "Less")} disabled={valore - passo < minimo} onClick={() => onCambia(valore - passo)}>
        −
      </button>
      <output>{mostra(valore)}</output>
      <button type="button" aria-label={t("Più", "More")} disabled={valore + passo > massimo} onClick={() => onCambia(valore + passo)}>
        +
      </button>
    </div>
  )
}
