// Cosa arriva dal telefono: spento di base; acceso e pronto dice l'indirizzo, i due codici (la Scorciatoia per iPhone, la pagina per ogni telefono) e gli ultimi arrivati; se non può arrivare dice perché.
import { useState } from "react"
import { api, chiedi } from "../api"
import { Bottone } from "../comuni/Bottone"
import { BottoneCopia } from "../comuni/BottoneCopia"
import { CardDiRighe, Riga } from "../comuni/CardDiRighe"
import { immagineQr } from "../comuni/GuardaDalTelefono"
import { Interruttore } from "../comuni/Interruttore"
import { arrivi, useCopia } from "../dati"
import { t } from "../lingua"
import { dataOra, nomeFile, peso } from "../testo"
import { testoDi } from "./righe"
import styles from "./RiquadroArrivi.module.css"

export function RiquadroArrivi() {
  const copia = useCopia(arrivi)
  const [errore, setErrore] = useState<string | null>(null)
  const [occupato, setOccupato] = useState(false)
  const stato = copia.dato
  if (!stato) return copia.errore ? <p className={styles.spento}>{copia.errore}</p> : null

  const imposta = (acceso: boolean) => {
    setErrore(null)
    setOccupato(true)
    chiedi("PUT", "/api/arrivi", { acceso })
      .then(() => arrivi.rileggi())
      .catch((e: Error) => setErrore(e.message))
      .finally(() => setOccupato(false))
  }
  const controllaDiNuovo = () => {
    setErrore(null)
    api.controllaArrivi().then(
      () => void arrivi.rileggi(),
      (e: Error) => setErrore(e.message),
    )
  }

  const riga = testoDi("telefono.arrivi")
  const spiegazione = !stato.acceso
    ? t("Spento: il computer non ascolta la rete, e nessun altro apparecchio può mandargli file. Accendilo per mandare i video dal telefono: compaiono i codici da inquadrare.", "Off: the computer is not listening on the network, and no other device can send it files. Turn it on to send videos from your phone: the codes to scan appear.")
    : stato.pronto
      ? t("Il telefono può mandare i file: il computer è in ascolto.", "Your phone can send files: the computer is listening.")
      : (stato.motivo ?? stato.errore ?? t("Gli arrivi dal telefono non sono pronti.", "Receiving files from your phone is not ready."))

  return (
    <>
      <CardDiRighe nome={t("Mandare i video", "Sending videos")}>
        <Riga nome={riga.nome} spiegazione={spiegazione}>
          {stato.acceso && !stato.pronto && <Bottone onClick={controllaDiNuovo}>{t("Controlla di nuovo", "Check again")}</Bottone>}
          <Interruttore etichetta={riga.nome} acceso={stato.acceso} disabled={occupato} onCambia={imposta} />
        </Riga>
        {stato.acceso && stato.pronto && stato.motivo && (
          <Riga nome={t("Da sapere", "Good to know")} spiegazione={stato.motivo}>
            {null}
          </Riga>
        )}
        {stato.acceso && stato.pronto && stato.indirizzo && (
          <Riga nome={t("Indirizzo", "Address")} spiegazione={stato.indirizzo}>
            <BottoneCopia testo={stato.indirizzo} etichetta={t("Copia l'indirizzo", "Copy the address")} />
          </Riga>
        )}
      </CardDiRighe>
      {errore && (
        <p className={styles.spento} role="alert">
          {errore}
        </p>
      )}
      {stato.acceso && stato.pronto && (stato.qr || (stato.carica && stato.qr_carica)) && (
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
      {stato.acceso && (
        <CardDiRighe nome={t("Ultimi arrivi", "Latest arrivals")}>
          {stato.ultimi.length > 0 ? (
            stato.ultimi.slice(0, 4).map((u) => (
              <Riga key={`${u.file}-${u.quando}`} nome={nomeFile(u.file)} spiegazione={`${peso(u.byte)} · ${dataOra(u.quando)}`}>
                {null}
              </Riga>
            ))
          ) : (
            <Riga nome={t("Ancora niente", "Nothing yet")} spiegazione={t("Dal telefono non è ancora arrivato niente.", "Nothing has arrived from your phone yet.")}>
              {null}
            </Riga>
          )}
        </CardDiRighe>
      )}
    </>
  )
}
