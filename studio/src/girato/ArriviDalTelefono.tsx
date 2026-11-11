// Nel Girato, di ciò che arriva dal telefono resta quello che serve mentre si riceve un file: se può mandare e cosa è arrivato. Collegarlo sta nelle impostazioni.
import { arrivi, useCopia } from "../dati"
import { scriviIndirizzo } from "../indirizzo"
import { t } from "../lingua"
import { dataOra, nomeFile, peso } from "../testo"
import styles from "./ArriviDalTelefono.module.css"

export function ArriviDalTelefono() {
  const stato = useCopia(arrivi).dato
  if (!stato) return null
  const impostazioni = scriviIndirizzo({ vista: "impostazioni", parte: "telefono" })
  if (!stato.acceso) {
    return (
      <p className={styles.riquadro}>
        {t("Dal telefono non può arrivare niente: ", "Nothing can arrive from your phone: ")}
        <a href={impostazioni}>{t("collega un telefono", "connect a phone")}</a>.
      </p>
    )
  }
  if (!stato.pronto) {
    return (
      <p className={`${styles.riquadro} ${styles.spento}`}>
        {stato.motivo ?? stato.errore ?? t("Gli arrivi dal telefono non sono pronti.", "Receiving files from your phone is not ready.")} <a href={impostazioni}>{t("Impostazioni del telefono", "Phone settings")}</a>
      </p>
    )
  }
  return (
    <section className={styles.riquadro} aria-label={t("Arrivi dal telefono", "Files from your phone")}>
      <p>
        {t("Il telefono può mandare i file: il computer è in ascolto.", "Your phone can send files: the computer is listening.")} <a href={impostazioni}>{t("Impostazioni del telefono", "Phone settings")}</a>
      </p>
      {stato.ultimi.length > 0 ? (
        <ul className={styles.ultimi}>
          {stato.ultimi.slice(0, 4).map((u) => (
            <li key={`${u.file}-${u.quando}`}>
              <span>{nomeFile(u.file)}</span>
              <span className={styles.tenue}>
                {peso(u.byte)} · {dataOra(u.quando)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.tenue}>{t("Dal telefono non è ancora arrivato niente.", "Nothing has arrived from your phone yet.")}</p>
      )}
    </section>
  )
}
