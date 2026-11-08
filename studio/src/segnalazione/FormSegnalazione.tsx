import { useEffect, useId, useState } from "react"
import { t } from "../lingua"
import { dopoIlDisegno, fraseDelRifiuto, ponteSegnalazione, type EsitoSegnalazione } from "./ponte"
import styles from "./FormSegnalazione.module.css"

type Invio = { fase: "scrivo" } | { fase: "invio" } | { fase: "fatto"; esito: EsitoSegnalazione } | { fase: "errore"; frase: string }

const fraseDelFatto = (esito: EsitoSegnalazione): string =>
  esito.inviata
    ? t("Inviato, grazie", "Sent, thank you")
    : t("Salvato in {file}. Si è aperta la pagina di GitHub per mandarlo.", "Saved to {file}. The GitHub page is open so you can send it.", { file: esito.file ?? "" })

/**
 * Il modulo di «Segnala un problema»: un campo facoltativo, l'interruttore della schermata e «Invia». Non parte niente senza il clic.
 * Con la schermata la finestra va ripresa senza il modulo, che coprirebbe la pagina di cui si parla: mentre l'app la riprende il modulo si nasconde
 * (`onNascosto` lo dice anche a chi lo contiene).
 */
export function FormSegnalazione({ errore, onNascosto }: { errore?: string; onNascosto?: (nascosto: boolean) => void }) {
  const idNota = useId()
  const [nota, setNota] = useState("")
  const [schermata, setSchermata] = useState(true)
  const [invio, setInvio] = useState<Invio>({ fase: "scrivo" })
  const [nascosto, setNascosto] = useState(false)
  // L'interruttore si vede solo se la schermata verrà presa: senza l'invio a Sentry non si prende.
  const [schermataPossibile, setSchermataPossibile] = useState(false)

  useEffect(() => {
    void ponteSegnalazione()
      ?.invioAttivo()
      .then(setSchermataPossibile, () => setSchermataPossibile(false))
  }, [])

  const invia = async () => {
    const ponte = ponteSegnalazione()
    if (!ponte) return
    const conSchermata = schermataPossibile && schermata
    setInvio({ fase: "invio" })
    if (conSchermata) {
      setNascosto(true)
      onNascosto?.(true)
      await dopoIlDisegno()
    }
    try {
      const esito = await ponte.invia({ errore, nota, schermata: conSchermata })
      setNota("")
      setInvio({ fase: "fatto", esito })
    } catch (e) {
      setInvio({ fase: "errore", frase: fraseDelRifiuto(e) })
    } finally {
      setNascosto(false)
      onNascosto?.(false)
    }
  }

  return (
    <div className={styles.modulo} style={nascosto ? { visibility: "hidden" } : undefined}>
      <label htmlFor={idNota} className={styles.etichetta}>
        {t("Cosa è successo?", "What happened?")}
      </label>
      <textarea id={idNota} className={styles.nota} rows={3} value={nota} placeholder={t("Facoltativo", "Optional")} onChange={(e) => setNota(e.target.value)} />
      {schermataPossibile && (
        <label className={styles.interruttore}>
          <input type="checkbox" role="switch" checked={schermata} onChange={(e) => setSchermata(e.target.checked)} />
          <span>
            <span className={styles.nome}>{t("Includi una schermata della finestra", "Include a screenshot of the window")}</span>
            <span className={styles.piccolo}>{t("La schermata può mostrare contenuti tuoi, come i titoli dei video o i nomi dei file.", "The screenshot may show your own content, such as video titles or file names.")}</span>
          </span>
        </label>
      )}
      <p className={styles.piccolo}>
        {t(
          "Con la segnalazione partono le ultime righe dei registri dell'app, che possono contenere i nomi dei tuoi video e dei tuoi file. Il tuo nome utente, il nome del computer, gli indirizzi email e di rete e le chiavi vengono tolti dal testo. Le trascrizioni, la chat e i file della cartella di lavoro non partono mai.",
          "The last lines of the app's logs are sent with the report, and they may contain the names of your videos and files. Your user name, the computer name, email and network addresses and keys are removed from the text. Transcripts, the chat and the files of your work folder are never sent.",
        )}
      </p>
      <div className={styles.azioni}>
        <button type="button" className={styles.invia} disabled={invio.fase === "invio"} onClick={() => void invia()}>
          {invio.fase === "invio" ? t("Invio…", "Sending…") : t("Invia", "Send")}
        </button>
        {invio.fase === "fatto" && (
          <span className={styles.esito} role="status">
            {fraseDelFatto(invio.esito)}
          </span>
        )}
      </div>
      {invio.fase === "errore" && (
        <p className={styles.errore} role="alert">
          {invio.frase}
        </p>
      )}
    </div>
  )
}
