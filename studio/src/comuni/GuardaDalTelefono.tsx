// Il codice da inquadrare col telefono per guardare i video montati, nel Wi-Fi di casa.
import { useState } from "react"
import { arrivi, useCopia } from "../dati"
import { t } from "../lingua"
import { Bottone } from "./Bottone"
import { BottoneCopia } from "./BottoneCopia"
import styles from "./GuardaDalTelefono.module.css"

/** Il codice QR (un SVG scritto dal server) come indirizzo per un'immagine. */
export const immagineQr = (svg: string): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

export function GuardaDalTelefono() {
  const stato = useCopia(arrivi).dato
  const [aperto, setAperto] = useState(false)
  if (!stato?.guarda || !stato.qr_guarda) return null

  return (
    <div className={styles.contenitore}>
      <Bottone variante="vuoto" onClick={() => setAperto(!aperto)}>
        {aperto ? t("Chiudi", "Close") : t("Dal telefono", "From your phone")}
      </Bottone>
      {aperto && (
        <div className={styles.riquadro} role="dialog" aria-label={t("Guardare i video dal telefono", "Watch the videos on your phone")}>
          <img className={styles.qr} src={immagineQr(stato.qr_guarda)} alt={t("Il codice da inquadrare con il telefono", "The code to scan with your phone")} />
          <p>{t("Inquadra il codice col telefono collegato al Wi-Fi di casa: si apre la pagina coi video montati, ognuno nella versione completa.", "Scan the code with your phone connected to your home Wi-Fi: the page with the edited videos opens, each in its full version.")}</p>
          <p className={styles.tenue}>{t("Salvala nella schermata Home e la ritrovi sempre lì.", "Save it to your Home screen and you will always find it there.")}</p>
          <BottoneCopia testo={stato.guarda} etichetta={t("Copia l'indirizzo", "Copy the address")} />
        </div>
      )}
    </div>
  )
}
