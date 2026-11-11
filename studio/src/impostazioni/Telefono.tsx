// Collegare il telefono: mandare i video al computer e usare lo studio intero da lì. Cosa serve mentre un file arriva sta nel Girato.
import { t } from "../lingua"
import { RiquadroArrivi } from "./RiquadroArrivi"
import { RiquadroStudioDalTelefono } from "./RiquadroStudioDalTelefono"
import styles from "./Impostazioni.module.css"

export function Telefono() {
  return (
    <div className={styles.contenuto}>
      <h1>{t("Telefono", "Phone")}</h1>
      <RiquadroArrivi />
      <RiquadroStudioDalTelefono />
    </div>
  )
}
