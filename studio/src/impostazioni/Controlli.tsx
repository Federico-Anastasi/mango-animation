// I controlli che le impostazioni usano e `comuni/` non ha: il menu (una fra molte scelte) e il campo di testo.
import type { ReactNode } from "react"
import styles from "./Controlli.module.css"

export function Menu({ etichetta, valore, disabled = false, onCambia, children }: { etichetta: string; valore: string; disabled?: boolean; onCambia: (valore: string) => void; children: ReactNode }) {
  return (
    <span className={styles.menu}>
      <select aria-label={etichetta} value={valore} disabled={disabled} onChange={(e) => onCambia(e.target.value)}>
        {children}
      </select>
    </span>
  )
}

export function Campo({ etichetta, valore, segnaposto, onCambia }: { etichetta: string; valore: string; segnaposto?: string; onCambia: (valore: string) => void }) {
  return <input className={styles.campo} aria-label={etichetta} placeholder={segnaposto} value={valore} onChange={(e) => onCambia(e.target.value)} />
}

/** Un testo di più righe. */
export function AreaDiTesto({ etichetta, valore, righe, onCambia }: { etichetta: string; valore: string; righe: number; onCambia: (valore: string) => void }) {
  return <textarea className={styles.area} aria-label={etichetta} rows={righe} value={valore} onChange={(e) => onCambia(e.target.value)} />
}
