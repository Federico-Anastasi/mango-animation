import { useEffect, useId, useRef, useState } from "react"
import { Bottone } from "../comuni/Bottone"
import { Interruttore } from "../comuni/Interruttore"
import { t } from "../lingua"
import { base64Di, dopoIlDisegno, fraseDelRifiuto, LIMITE_IMMAGINE, ponteSegnalazione, type EsitoSegnalazione } from "./ponte"
import styles from "./FormSegnalazione.module.css"

type Invio = { fase: "scrivo" } | { fase: "invio" } | { fase: "fatto"; esito: EsitoSegnalazione } | { fase: "errore"; frase: string }

const fraseDelFatto = (esito: EsitoSegnalazione): string =>
  esito.inviata
    ? t("Inviato, grazie", "Sent, thank you")
    : t("Salvato in {file}. Si è aperta la pagina di GitHub per mandarlo.", "Saved to {file}. The GitHub page is open so you can send it.", { file: esito.file ?? "" })

/**
 * Il modulo di «Segnala un problema»: un campo facoltativo, un'immagine da caricare (consigliata), l'interruttore della schermata (spento di base) e «Invia». Non parte niente senza il clic.
 * Con la schermata la finestra va ripresa senza il modulo, che coprirebbe la pagina di cui si parla: mentre l'app la riprende il modulo si nasconde
 * (`onNascosto` lo dice anche a chi lo contiene).
 */
export function FormSegnalazione({ errore, onNascosto }: { errore?: string; onNascosto?: (nascosto: boolean) => void }) {
  const idNota = useId()
  const [nota, setNota] = useState("")
  const [schermata, setSchermata] = useState(false)
  const [immagine, setImmagine] = useState<File | null>(null)
  const [immagineRifiutata, setImmagineRifiutata] = useState(false)
  const sceltaDelFile = useRef<HTMLInputElement>(null)
  const [invio, setInvio] = useState<Invio>({ fase: "scrivo" })
  const [nascosto, setNascosto] = useState(false)
  // Interruttore e immagine si vedono solo se partiranno: senza l'invio a Sentry non parte né l'una né l'altra.
  const [schermataPossibile, setSchermataPossibile] = useState(false)

  useEffect(() => {
    void ponteSegnalazione()
      ?.invioAttivo()
      .then(setSchermataPossibile, () => setSchermataPossibile(false))
  }, [])

  const scegliImmagine = (file: File | undefined) => {
    setImmagineRifiutata(false)
    if (!file) return
    const troppoGrande = file.size > LIMITE_IMMAGINE
    setImmagineRifiutata(troppoGrande)
    setImmagine(troppoGrande ? null : file)
  }

  const invia = async () => {
    const ponte = ponteSegnalazione()
    if (!ponte) return
    const conSchermata = schermataPossibile && schermata
    const conImmagine = schermataPossibile ? immagine : null
    setInvio({ fase: "invio" })
    let immagine64: string | undefined
    try {
      immagine64 = conImmagine ? await base64Di(conImmagine) : undefined
    } catch (e) {
      setInvio({ fase: "errore", frase: fraseDelRifiuto(e) })
      return
    }
    if (conSchermata) {
      setNascosto(true)
      onNascosto?.(true)
      await dopoIlDisegno()
    }
    try {
      const esito = await ponte.invia({ errore, nota, schermata: conSchermata, ...(immagine64 && { immagine: immagine64 }) })
      setNota("")
      setImmagine(null)
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
        <div className={styles.immagine}>
          <span className={styles.testo}>
            <span className={styles.nome}>{t("Aggiungi un'immagine dell'errore", "Add an image of the error")}</span>
            <span className={styles.piccolo}>{t("Te lo consigliamo: con l'immagine ci è più semplice capire il problema e risolverlo.", "We recommend it: with an image it is easier for us to understand the problem and fix it.")}</span>
            {immagineRifiutata && (
              <span className={styles.errore} role="alert">
                {t("L'immagine pesa più di 10 MB: scegline una più piccola.", "The image is larger than 10 MB: choose a smaller one.")}
              </span>
            )}
          </span>
          <input
            ref={sceltaDelFile}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            aria-label={t("Scegli un'immagine da allegare", "Choose an image to attach")}
            onChange={(e) => (scegliImmagine(e.target.files?.[0]), (e.target.value = ""))}
          />
          {immagine ? (
            <span className={styles.scelta}>
              <span className={styles.file}>{immagine.name}</span>
              <Bottone variante="distrugge" onClick={() => setImmagine(null)}>
                {t("Togli", "Remove")}
              </Bottone>
            </span>
          ) : (
            <Bottone onClick={() => sceltaDelFile.current?.click()}>{t("Scegli un'immagine", "Choose an image")}</Bottone>
          )}
        </div>
      )}
      {schermataPossibile && (
        <div className={styles.interruttore}>
          <span className={styles.testo}>
            <span className={styles.nome}>{t("Includi una schermata della finestra", "Include a screenshot of the window")}</span>
            <span className={styles.piccolo}>{t("La schermata può mostrare contenuti tuoi, come i titoli dei video o i nomi dei file.", "The screenshot may show your own content, such as video titles or file names.")}</span>
          </span>
          <Interruttore etichetta={t("Includi una schermata della finestra", "Include a screenshot of the window")} acceso={schermata} onCambia={setSchermata} />
        </div>
      )}
      <p className={styles.piccolo}>
        {t(
          "Con la segnalazione partono le ultime righe dei registri dell'app, che possono contenere i nomi dei tuoi video e dei tuoi file. Il tuo nome utente, il nome del computer, gli indirizzi email e di rete e le chiavi vengono tolti dal testo. Le trascrizioni, la chat e i file della cartella di lavoro non partono mai.",
          "The last lines of the app's logs are sent with the report, and they may contain the names of your videos and files. Your user name, the computer name, email and network addresses and keys are removed from the text. Transcripts, the chat and the files of your work folder are never sent.",
        )}
      </p>
      <div className={styles.azioni}>
        <Bottone variante="principale" disabled={invio.fase === "invio"} onClick={() => void invia()}>
          {invio.fase === "invio" ? t("Invio…", "Sending…") : t("Invia", "Send")}
        </Bottone>
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
