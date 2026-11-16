// Sì o no: acceso è ambra.
import styles from "./Interruttore.module.css"

export function Interruttore({ etichetta, acceso, disabled = false, onCambia }: { etichetta: string; acceso: boolean; disabled?: boolean; onCambia: (acceso: boolean) => void }) {
  return <button type="button" role="switch" className={styles.interruttore} aria-label={etichetta} aria-checked={acceso} disabled={disabled} onClick={() => onCambia(!acceso)} />
}
