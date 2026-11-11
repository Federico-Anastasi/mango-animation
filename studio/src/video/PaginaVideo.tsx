import { lazy, Suspense, useState } from "react"
import { api } from "../api"
import { Bottone } from "../comuni/Bottone"
import { GuardaDalTelefono } from "../comuni/GuardaDalTelefono"
import { Icona } from "../comuni/icone"
import { Schede } from "../comuni/Schede"
import { Caricamento, Errore } from "../comuni/Stati"
import { copiaVideo, useCopia } from "../dati"
import { SCHEDE, SCHEDE_CAROSELLO, scriviIndirizzo, vai, type SchedaVideo } from "../indirizzo"
import { t } from "../lingua"
import { nomeFile, pluralizza } from "../testo"
import type { DettaglioVideo, Scheda, StatoVideo } from "../tipi"
import { FILE_FINITI, nonFallire, uscitaDi } from "./liste"
import { RigaDeiPassi } from "./RigaDeiPassi"
import styles from "./PaginaVideo.module.css"

const ProvaVideo = lazy(() => import("./ProvaVideo").then((m) => ({ default: m.ProvaVideo })))
const Montaggio = lazy(() => import("../montaggio/Montaggio").then((m) => ({ default: m.Montaggio })))
const SchedaDelVideo = lazy(() => import("./SchedaDelVideo").then((m) => ({ default: m.SchedaDelVideo })))
const ControlloVideo = lazy(() => import("./ControlloVideo").then((m) => ({ default: m.ControlloVideo })))
const CopertinaVideo = lazy(() => import("./CopertinaVideo").then((m) => ({ default: m.CopertinaVideo })))
const FileVideo = lazy(() => import("./FileVideo").then((m) => ({ default: m.FileVideo })))
const SlideCarosello = lazy(() => import("./SlideCarosello").then((m) => ({ default: m.SlideCarosello })))

const nomeScheda = (s: SchedaVideo): string => {
  const nomi: Record<SchedaVideo, string> = {
    prova: t("Prova", "Rehearsal"),
    montaggio: t("Montaggio", "Edit"),
    slide: t("Slide", "Slides"),
    scheda: t("Scheda", "Card"),
    controllo: t("Controllo", "Check"),
    copertina: t("Copertina", "Cover"),
    file: t("File", "Files"),
  }
  return nomi[s]
}
const STATI: StatoVideo[] = ["proposta", "in lavorazione", "pronto", "pubblicato", "scartato"]
const nomeStato = (s: StatoVideo): string => {
  const nomi: Record<StatoVideo, string> = {
    proposta: t("Proposta", "Proposal"),
    "in lavorazione": t("In lavorazione", "In progress"),
    pronto: t("Pronto", "Ready"),
    pubblicato: t("Pubblicato", "Published"),
    scartato: t("Scartato", "Discarded"),
  }
  return nomi[s]
}

export interface PropsScheda {
  video: DettaglioVideo
  /** Scrive la scheda intera; se il server la rifiuta, l'errore dice perché. */
  salvaScheda: (scheda: Scheda) => Promise<void>
}

export function PaginaVideo({ slug, scheda, parametri }: { slug: string; scheda: SchedaVideo | null; parametri: URLSearchParams }) {
  const copia = useCopia(copiaVideo(slug))
  const [errore, setErrore] = useState<string | null>(null)
  const [titolo, setTitolo] = useState<string | null>(null)
  const [confermaTogli, setConfermaTogli] = useState(false)
  const video = copia.dato

  if (video === null) return copia.errore ? <Errore messaggio={copia.errore} onRiprova={() => void copiaVideo(slug).rileggi()} /> : <Caricamento />

  const salvaScheda = async (nuova: Scheda) => {
    setErrore(null)
    try {
      await api.scriviScheda(slug, nuova)
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e)
      setErrore(motivo)
      throw e
    }
  }
  const dalTitolo = () => {
    const nuovo = (titolo ?? video.scheda.titolo).trim()
    setTitolo(null)
    if (nuovo === video.scheda.titolo) return
    if (nuovo === "") {
      setErrore(t("Il titolo non può restare vuoto.", "The title cannot be left empty."))
      return
    }
    nonFallire(salvaScheda({ ...video.scheda, titolo: nuovo }))
  }

  const proprieta: PropsScheda = { video, salvaScheda }
  const carosello = video.scheda.formato === "carosello"
  const prova = carosello ? undefined : uscitaDi(video, "prova.mp4")
  const schede: readonly SchedaVideo[] = carosello ? SCHEDE_CAROSELLO : prova ? ["prova", ...SCHEDE] : SCHEDE
  const senzaMontaggio = video.piano === null && !video.uscite.some((u) => FILE_FINITI.includes(nomeFile(u.file)))
  const diPartenza: SchedaVideo = carosello ? "slide" : prova && video.piano === null ? "prova" : senzaMontaggio ? "scheda" : "montaggio"
  const attiva = scheda !== null && schede.includes(scheda) ? scheda : diPartenza
  const sidaTogliere = video.scheda.stato === "proposta" && !uscitaDi(video, "finale.mp4")
  const nellaCartella = [
    video.materiali.length > 0 && t("{quanti} nei materiali", "{quanti} in the materials", { quanti: pluralizza(video.materiali.length, t("file", "file"), t("file", "files")) }) + (video.materiali.some((m) => /\/materiali\/anteprima\.[^/]+$/.test(m.file)) ? t(" (anche l'anteprima)", " (and the preview)") : ""),
    video.uscite.some((u) => u.stesso_file === null) && t("{quanti} nelle uscite", "{quanti} in the outputs", { quanti: pluralizza(video.uscite.filter((u) => u.stesso_file === null).length, t("file", "file"), t("file", "files")) }),
  ].filter((parte): parte is string => typeof parte === "string")
  const togli = () =>
    api.togliVideo(slug).then(
      () => vai("#/video"),
      (e: Error) => {
        setConfermaTogli(false)
        setErrore(e.message)
      },
    )

  return (
    <div className={attiva === "prova" ? `${styles.pagina} ${styles.piena}` : styles.pagina}>
      <div className={styles.testata}>
        <a href="#/video" className={styles.indietro}>
          <Icona nome="sinistra" />
          {t("Tutti i video", "All videos")}
        </a>
        <textarea
          className={styles.titolo}
          rows={1}
          aria-label={t("Titolo del video", "Video title")}
          value={titolo ?? video.scheda.titolo}
          onChange={(e) => setTitolo(e.target.value)}
          onBlur={dalTitolo}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              e.currentTarget.blur()
            }
            if (e.key === "Escape") setTitolo(null)
          }}
        />
        <div className={styles.riga}>
          <label className={styles.stato}>
            <span>{t("Stato", "Status")}</span>
            <select value={video.scheda.stato} onChange={(e) => nonFallire(salvaScheda({ ...video.scheda, stato: e.target.value as StatoVideo }))}>
              {STATI.map((s) => (
                <option key={s} value={s}>
                  {nomeStato(s)}
                </option>
              ))}
            </select>
          </label>
          <Bottone variante="vuoto" onClick={() => api.apri(`video/${slug}`).catch((e: Error) => setErrore(e.message))}>
            <Icona nome="cartella" />
            {t("Apri la cartella", "Open the folder")}
          </Bottone>
          <GuardaDalTelefono />
          {sidaTogliere && !confermaTogli && (
            <Bottone variante="vuoto" onClick={() => setConfermaTogli(true)}>
              <Icona nome="togli" />
              {t("Togli la proposta", "Remove the proposal")}
            </Bottone>
          )}
        </div>
        {confermaTogli && (
          <div className={styles.conferma} role="alertdialog" aria-label={t("Conferma", "Confirm")}>
            <span>
              {t("La proposta si toglie per sempre dall'archivio", "The proposal is removed from the archive for good")}
              {nellaCartella.length > 0 && t(", e con lei {cose}", ", and with it {cose}", { cose: nellaCartella.join(t(" e ", " and ")) })}
              {t(". Vuoi toglierla?", ". Do you want to remove it?")}
            </span>
            <Bottone onClick={() => void togli()}>{t("Sì, toglila", "Yes, remove it")}</Bottone>
            <Bottone variante="vuoto" onClick={() => setConfermaTogli(false)}>
              {t("No, tienila", "No, keep it")}
            </Bottone>
          </div>
        )}
        {video.fase && <RigaDeiPassi fase={video.fase} />}
        {errore && (
          <p className={styles.errore} role="alert">
            {errore}
          </p>
        )}
        {video.problemi.scheda.length > 0 && <Errore messaggio={t("La scheda di questo video ha un errore: chiedi nella chat di sistemarla. Qui vedi l'ultima scheda valida.", "This video's card has an error: ask in the chat to fix it. Here you see the last valid card.")} dettaglio={video.problemi.scheda} />}
        {video.problemi.piano.length > 0 && <Errore messaggio={t("Il piano di questo video ha un errore: chiedi nella chat di sistemarlo.", "This video's plan has an error: ask in the chat to fix it.")} dettaglio={video.problemi.piano} />}
      </div>
      <Schede etichetta={t("Schede del video", "Video tabs")} schede={schede.map((id) => ({ id, nome: nomeScheda(id) }))} attiva={attiva} indirizzo={(id) => scriviIndirizzo({ vista: "video", slug, scheda: id })} />
      <div className={styles.contenuto}>
        <Suspense fallback={<Caricamento />}>
          {attiva === "prova" && prova && <ProvaVideo prova={prova} />}
          {attiva === "montaggio" && <Montaggio video={video} tempoIniziale={parametri.get("t")} />}
          {attiva === "scheda" && <SchedaDelVideo {...proprieta} />}
          {attiva === "controllo" && <ControlloVideo {...proprieta} />}
          {attiva === "copertina" && <CopertinaVideo {...proprieta} />}
          {attiva === "slide" && <SlideCarosello {...proprieta} />}
          {attiva === "file" && <FileVideo {...proprieta} />}
        </Suspense>
      </div>
    </div>
  )
}
