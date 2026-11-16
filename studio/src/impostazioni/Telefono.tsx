// Collegare il telefono: mandare i video al computer e usare lo studio intero da lì. Cosa serve mentre un file arriva sta nel Girato.
import { t } from "../lingua"
import { RiquadroArrivi } from "./RiquadroArrivi"
import { RiquadroStudioDalTelefono } from "./RiquadroStudioDalTelefono"
import { Testata } from "./Testata"
import styles from "./Impostazioni.module.css"

export function Telefono() {
  return (
    <div className={styles.sezione}>
      <Testata titolo={t("Telefono", "Phone")} sotto={t("Mandare i video al computer e usare lo studio intero dal telefono.", "Send videos to the computer and use the whole studio from your phone.")} />
      <RiquadroArrivi />
      <RiquadroStudioDalTelefono />
    </div>
  )
}
