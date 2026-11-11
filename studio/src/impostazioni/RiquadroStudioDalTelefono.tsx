// Usare lo studio intero dal telefono: si accende qui, dal computer, e si entra una volta col link (o il codice) di casa o di fuori casa.
import { useState } from "react"
import { api } from "../api"
import { Bottone } from "../comuni/Bottone"
import { BottoneCopia } from "../comuni/BottoneCopia"
import { immagineQr } from "../comuni/GuardaDalTelefono"
import { accessoStudio, arrivi, useCopia } from "../dati"
import { t } from "../lingua"
import styles from "./RiquadroArrivi.module.css"

const dalComputer = (): boolean => ["127.0.0.1", "localhost"].includes(location.hostname)

function Strada({ titolo, dati, pronto, motivo, aiuto }: { titolo: string; dati: { indirizzo: string; link: string; qr: string } | null; pronto: boolean; motivo: string | null; aiuto: string }) {
  return (
    <figure className={`${styles.codice} ${styles.strada}`} aria-label={titolo}>
      <figcaption className={styles.titoloStrada}>{titolo}</figcaption>
      {dati && pronto ? (
        <>
          <img className={styles.qr} src={immagineQr(dati.qr)} alt={t("Il codice per aprire lo studio sul telefono ({strada})", "The code to open the studio on your phone ({strada})", { strada: titolo.toLowerCase() })} />
          <code>{dati.indirizzo}</code>
          <BottoneCopia testo={dati.link} etichetta={t("Copia il link", "Copy the link")} />
        </>
      ) : (
        <p className={dati ? styles.spento : styles.tenue}>{dati ? motivo : aiuto}</p>
      )}
    </figure>
  )
}

function Riquadro() {
  const copia = useCopia(accessoStudio)
  const [errore, setErrore] = useState<string | null>(null)
  const [occupato, setOccupato] = useState(false)
  const [chiaveRifatta, setChiaveRifatta] = useState(false)
  const stato = copia.dato
  if (!stato) return copia.errore ? <p className={styles.errore}>{copia.errore}</p> : null

  const fai = (azione: () => Promise<unknown>, dopo?: () => void) => {
    setErrore(null)
    setOccupato(true)
    azione()
      .then(() => accessoStudio.rileggi())
      .then(dopo, (e: Error) => setErrore(e.message))
      .finally(() => setOccupato(false))
  }
  const fuoriDaControllare = stato.fuori !== null && !stato.fuori.pronto

  return (
    <section className={styles.riquadro} aria-label={t("Lo studio dal telefono", "The studio on your phone")}>
      <div className={styles.testo}>
        <h2>{t("Lo studio dal telefono", "The studio on your phone")}</h2>
        {stato.acceso ? (
          <>
            <p>{t("Acceso: col telefono si usa lo studio intero, i video, il montaggio e la chat, in casa e fuori.", "On: with your phone you use the whole studio, the videos, the edit and the chat, at home and away.")}</p>
            <p className={styles.tenue}>
              {t("Chi apre il link entra nello studio e può far lavorare la chat sul tuo computer: non darlo a nessuno. Il telefono entra una volta sola, poi si ricorda.", "Anyone who opens the link gets into the studio and can make the chat work on your computer: do not give it to anyone. The phone gets in only once, then it remembers.")}
              {t(" In casa la connessione non è protetta da chi usa lo stesso Wi-Fi; fuori casa, con Tailscale, sì.", " At home the connection is not protected from others on the same Wi-Fi; away from home, with Tailscale, it is.")}
            </p>
            <div className={styles.azioni}>
              <Bottone variante="vuoto" disabled={occupato} onClick={() => fai(() => api.accendiStudioDalTelefono(false), () => setChiaveRifatta(false))}>
                {t("Spegni", "Turn off")}
              </Bottone>
              <Bottone variante="vuoto" disabled={occupato} onClick={() => fai(api.rifaiChiaveDelloStudio, () => setChiaveRifatta(true))}>
                {t("Rifai la chiave", "Make a new key")}
              </Bottone>
              {(fuoriDaControllare || !stato.pronto) && (
                <Bottone
                  variante="vuoto"
                  disabled={occupato}
                  onClick={() =>
                    fai(async () => {
                      await api.controllaArrivi()
                      await arrivi.rileggi()
                    })
                  }
                >
                  {t("Controlla di nuovo", "Check again")}
                </Bottone>
              )}
            </div>
            {chiaveRifatta && <p className={styles.tenue}>{t("Chiave rifatta: i telefoni già entrati devono rientrare col link nuovo.", "New key made: phones already signed in must sign in again with the new link.")}</p>}
          </>
        ) : (
          <>
            <p>{t("Spento. Accendilo per usare lo studio intero dal telefono: i video, il montaggio e la chat.", "Off. Turn it on to use the whole studio from your phone: the videos, the edit and the chat.")}</p>
            <div className={styles.azioni}>
              <Bottone disabled={occupato} onClick={() => fai(() => api.accendiStudioDalTelefono(true), () => setChiaveRifatta(false))}>
                {t("Accendi", "Turn on")}
              </Bottone>
            </div>
          </>
        )}
        {errore && <p className={styles.spento}>{errore}</p>}
      </div>
      {stato.acceso && (
        <div className={styles.codici}>
          <Strada titolo={t("In casa (stesso Wi-Fi)", "At home (same Wi-Fi)")} dati={stato.casa} pronto={stato.pronto} motivo={stato.motivo} aiuto={t("Il computer non è collegato a una rete.", "The computer is not connected to a network.")} />
          <Strada
            titolo={t("Fuori casa (Tailscale)", "Away from home (Tailscale)")}
            dati={stato.fuori}
            pronto={stato.fuori?.pronto ?? false}
            motivo={stato.fuori?.motivo ?? null}
            aiuto={t("Per usarlo fuori casa serve Tailscale acceso su questo computer e sul telefono.", "To use it away from home, Tailscale must be on, on this computer and on your phone.")}
          />
        </div>
      )}
    </section>
  )
}

export function RiquadroStudioDalTelefono() {
  return dalComputer() ? <Riquadro /> : null
}
