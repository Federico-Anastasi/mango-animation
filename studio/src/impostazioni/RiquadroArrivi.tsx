import { useState } from "react"
import { api, chiedi } from "../api"
import { Bottone } from "../comuni/Bottone"
import { BottoneCopia } from "../comuni/BottoneCopia"
import { immagineQr } from "../comuni/GuardaDalTelefono"
import { arrivi, useCopia } from "../dati"
import { t } from "../lingua"
import { dataOra, nomeFile, peso } from "../testo"
import styles from "./RiquadroArrivi.module.css"

export function RiquadroArrivi() {
  const copia = useCopia(arrivi)
  const [errore, setErrore] = useState<string | null>(null)
  const [occupato, setOccupato] = useState(false)
  const stato = copia.dato
  if (!stato) return copia.errore ? <p className={styles.errore}>{copia.errore}</p> : null

  const imposta = (acceso: boolean) => {
    setErrore(null)
    setOccupato(true)
    chiedi("PUT", "/api/arrivi", { acceso })
      .then(() => arrivi.rileggi())
      .catch((e: Error) => setErrore(e.message))
      .finally(() => setOccupato(false))
  }

  if (!stato.acceso) {
    return (
      <section className={styles.riquadro} aria-label={t("Arrivi dal telefono", "Files from your phone")}>
        <div className={styles.testo}>
          <h2>{t("Arrivi dal telefono", "Files from your phone")}</h2>
          <p>{t("Spento: il computer non ascolta la rete, e nessun altro apparecchio può mandargli file.", "Off: the computer is not listening on the network, and no other device can send it files.")}</p>
          <p className={styles.tenue}>{t("Per mandare i video dal telefono, collegalo qui: compaiono i codici da inquadrare.", "To send videos from your phone, connect it here: the codes to scan appear.")}</p>
          <div className={styles.azioni}>
            <Bottone disabled={occupato} onClick={() => imposta(true)}>
              {t("Collega un telefono", "Connect a phone")}
            </Bottone>
          </div>
          {errore && <p className={styles.spento}>{errore}</p>}
        </div>
      </section>
    )
  }

  return (
    <section className={styles.riquadro} aria-label={t("Arrivi dal telefono", "Files from your phone")}>
      <div className={styles.testo}>
        <h2>{t("Arrivi dal telefono", "Files from your phone")}</h2>
        {stato.pronto ? (
          <>
            <p>{t("Il telefono può mandare i file: il computer è in ascolto.", "Your phone can send files: the computer is listening.")}</p>
            {stato.motivo && <p className={styles.tenue}>{stato.motivo}</p>}
            {stato.indirizzo && (
              <p className={styles.indirizzo}>
                <code>{stato.indirizzo}</code>
                <BottoneCopia testo={stato.indirizzo} etichetta={t("Copia l'indirizzo", "Copy the address")} />
              </p>
            )}
          </>
        ) : (
          <>
            <p className={styles.spento}>{stato.motivo ?? stato.errore ?? t("Gli arrivi dal telefono non sono pronti.", "Receiving files from your phone is not ready.")}</p>
            <Bottone
              variante="vuoto"
              onClick={() => {
                setErrore(null)
                api.controllaArrivi().then(
                  () => void arrivi.rileggi(),
                  (e: Error) => setErrore(e.message),
                )
              }}
            >
              {t("Controlla di nuovo", "Check again")}
            </Bottone>
            {errore && <p className={styles.spento}>{errore}</p>}
          </>
        )}
        <div className={styles.azioni}>
          <Bottone variante="vuoto" disabled={occupato} onClick={() => imposta(false)}>
            {t("Scollega i telefoni", "Disconnect the phones")}
          </Bottone>
        </div>
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
      </div>
      {stato.pronto && (
        <div className={styles.codici}>
          {stato.qr && (
            <figure className={styles.codice}>
              <img className={styles.qr} src={immagineQr(stato.qr)} alt={t("Il codice per installare la Scorciatoia sul telefono", "The code to install the Shortcut on your phone")} />
              <figcaption>{t("iPhone: la Scorciatoia", "iPhone: the Shortcut")}</figcaption>
            </figure>
          )}
          {stato.carica && stato.qr_carica && (
            <figure className={styles.codice}>
              <img className={styles.qr} src={immagineQr(stato.qr_carica)} alt={t("Il codice per aprire sul telefono la pagina che manda i video", "The code to open the page that sends videos on your phone")} />
              <figcaption>{t("Qualsiasi telefono: carica dalla pagina", "Any phone: upload from the page")}</figcaption>
              <BottoneCopia testo={stato.carica} etichetta={t("Copia l'indirizzo", "Copy the address")} />
            </figure>
          )}
        </div>
      )}
    </section>
  )
}
