// «Cosa dice il pubblico, e come vanno i video usciti?»: ciò che l'ultima lettura del canale ha portato in archivio.
import { useEffect, useState } from "react"
import { api, ErroreApi, urlMedia } from "../api"
import { ascoltaCanale } from "../canale"
import { IntestazioneOrdinabile } from "../comuni/IntestazioneOrdinabile"
import { Caricamento, DatiVecchi, Errore, Vuoto } from "../comuni/Stati"
import { canaleTiktok, creaCopia, elencoVideo, useCopia } from "../dati"
import { scriviIndirizzo, vai } from "../indirizzo"
import { t } from "../lingua"
import { cifra, dataOra, durata, numero } from "../testo"
import type { Commento, CommentiDelVideo, MessaggiDelCanale, VideoDelCanale } from "../tipi"
import { ordina, rapporti, totali, type CampoOrdine } from "./rapporti"
import styles from "./Pubblico.module.css"

const CANALE = "tiktok"

/** Le colonne numeriche della tabella dei rapporti, nell'ordine in cui si mostrano. */
const colonne = (): Array<{ campo: CampoOrdine; nome: string }> => [
  { campo: "visualizzazioni", nome: t("Visualizzazioni", "Views") },
  { campo: "mi_piace", nome: t("Mi piace", "Likes") },
  { campo: "commenti", nome: t("Commenti", "Comments") },
  { campo: "condivisioni", nome: t("Condivisioni", "Shares") },
  { campo: "salvati", nome: t("Salvati", "Saves") },
  { campo: "nuovi_follower", nome: t("Nuovi follower", "New followers") },
]
const titoloDi = (video: VideoDelCanale): string => video.titolo ?? video.didascalia ?? t("Video senza titolo", "Untitled video")

/** `null`: il server non ha nessuna lettura dei messaggi (404); ogni altro errore resta un errore. */
const messaggi = creaCopia<MessaggiDelCanale | null>(
  () =>
    api.messaggiCanale(CANALE).catch((e: unknown) => {
      if (e instanceof ErroreApi && e.codice === 404) return null
      throw e
    }),
  (e) => e.tipo === "canale",
)

const crescita = (n: number | null | undefined) => (n ? `+${numero(n)}` : "")

function Numero({ nome, valore }: { nome: string; valore: number | undefined }) {
  return (
    <div className={styles.numero}>
      <span className={styles.valore}>{cifra(valore)}</span>
      <span className={styles.nome}>{nome}</span>
    </div>
  )
}

const sceglie = (video: VideoDelCanale) => vai(scriviIndirizzo({ vista: "canale", parte: "pubblico", parametri: { video: video.id } }))

/** La miniatura e il titolo di un video: il titolo porta alla sua scheda, il resto della riga sceglie il video. */
function CelleVideo({ video, miniatura }: { video: VideoDelCanale; miniatura: string | null }) {
  const titolo = titoloDi(video)
  return (
    <>
      <td className={styles.immagine}>{miniatura ? <img src={urlMedia(miniatura)} alt="" loading="lazy" /> : <span />}</td>
      <td className={styles.titolo}>
        {video.slug ? (
          <a href={scriviIndirizzo({ vista: "video", slug: video.slug, scheda: "scheda" })} onClick={(e) => e.stopPropagation()}>
            {titolo}
          </a>
        ) : (
          titolo
        )}
      </td>
    </>
  )
}

function RigaVideo({ video, scelto, miniatura }: { video: VideoDelCanale; scelto: boolean; miniatura: string | null }) {
  return (
    <tr className={scelto ? styles.scelta : undefined} onClick={() => sceglie(video)}>
      <CelleVideo video={video} miniatura={miniatura} />
      <td>{video.pubblicato ? dataOra(video.pubblicato) : "—"}</td>
      <td className={styles.num}>
        {cifra(video.visualizzazioni)} <span className={styles.piu}>{crescita(video.variazione?.visualizzazioni)}</span>
      </td>
      <td className={styles.num}>
        {cifra(video.mi_piace)} <span className={styles.piu}>{crescita(video.variazione?.mi_piace)}</span>
      </td>
      <td className={styles.num}>
        {cifra(video.commenti)} <span className={styles.piu}>{crescita(video.variazione?.commenti)}</span>
      </td>
      <td className={styles.num}>{cifra(video.salvati)}</td>
      <td className={styles.num}>{cifra(video.condivisioni)}</td>
      <td className={styles.num}>{cifra(video.nuovi_follower)}</td>
      <td className={styles.num}>{video.visti_fino_in_fondo === undefined ? "—" : `${numero(video.visti_fino_in_fondo, 1)} %`}</td>
    </tr>
  )
}

function RigaRapporti({ video, miniatura }: { video: VideoDelCanale; miniatura: string | null }) {
  const r = rapporti(video)
  return (
    <tr onClick={() => sceglie(video)}>
      <CelleVideo video={video} miniatura={miniatura} />
      <td className={styles.num}>{cifra(video.visualizzazioni)}</td>
      <td className={styles.num}>{cifra(r.mi_piace, 1)}</td>
      <td className={styles.num}>{cifra(r.commenti, 1)}</td>
      <td className={styles.num}>{cifra(r.condivisioni, 1)}</td>
      <td className={styles.num}>{cifra(r.salvati, 1)}</td>
      <td className={styles.num}>{cifra(r.nuovi_follower, 1)}</td>
    </tr>
  )
}

function UnCommento({ commento, nuovo }: { commento: Commento; nuovo: boolean }) {
  return (
    <li className={[styles.commento, commento.risposta_a ? styles.risposta : "", commento.del_creator ? styles.mio : ""].join(" ")}>
      <span className={styles.autore}>
        {commento.autore}
        {nuovo && <span className={styles.nuovo}>{t("nuovo", "new")}</span>}
        {commento.tempo_fa && <span className={styles.quando}>{t("{tempo} fa", "{tempo} ago", { tempo: commento.tempo_fa })}</span>}
        {commento.mi_piace !== undefined && <span className={styles.quando}>{t("{n} mi piace", "{n} likes", { n: numero(commento.mi_piace) })}</span>}
      </span>
      {commento.testo ? <span>{commento.testo}</span> : <span className={styles.nota}>{commento.note ?? t("Il testo non è stato letto.", "The text could not be read.")}</span>}
    </li>
  )
}

function CommentiDi({ video }: { video: VideoDelCanale }) {
  const [dati, setDati] = useState<CommentiDelVideo | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [tentativo, setTentativo] = useState(0)
  useEffect(() => {
    // La risposta di un video che non è più quello scelto si butta.
    let vivo = true
    const leggi = () =>
      api.commentiCanale(CANALE, video.id).then(
        (c) => {
          if (!vivo) return
          setDati(c)
          setErrore(null)
        },
        (e: Error) => vivo && setErrore(e.message),
      )
    setDati(null)
    setErrore(null)
    void leggi()
    const smetti = ascoltaCanale({ evento: (e) => e.tipo === "canale" && void leggi() })
    return () => {
      vivo = false
      smetti()
    }
  }, [video.id, tentativo])

  if (errore) return <Errore messaggio={errore} onRiprova={() => setTentativo(tentativo + 1)} />
  if (!dati) return <Caricamento />
  if (dati.commenti.length === 0) return <Vuoto>{t("Di questo video non è stato letto nessun commento. Chiedilo nella chat: «aggiorna i dati di TikTok».", "No comments have been read for this video. Ask in the chat: \"update the TikTok data\".")}</Vuoto>
  const dichiarati = video.commenti ?? 0
  return (
    <>
      {dichiarati > dati.commenti.length && (
        <p className={styles.avviso}>
          {t("Letti {letti} commenti su {tutti}: gli altri arrivano con la prossima lettura completa.", "Read {letti} comments out of {tutti}: the rest arrive with the next full read.", { letti: numero(dati.commenti.length), tutti: numero(dichiarati) })}
        </p>
      )}
      <ul className={styles.commenti}>
        {dati.commenti.map((c) => (
          <UnCommento key={c.id} commento={c} nuovo={dati.nuovi.includes(c.id)} />
        ))}
      </ul>
    </>
  )
}

function Messaggi() {
  const { dato, errore, caricato } = useCopia(messaggi)
  if (errore && !dato) return <Errore messaggio={errore} onRiprova={() => void messaggi.rileggi()} />
  if (!caricato) return <Caricamento />
  if (!dato) return <Vuoto>{t("Nessun messaggio privato in archivio.", "No private messages in the archive.")}</Vuoto>
  if (dato.conversazioni.length === 0) return <Vuoto>{t("Nessun messaggio privato nell'ultima lettura.", "No private messages in the last read.")}</Vuoto>
  return (
    <ul className={styles.conversazioni}>
      {dato.conversazioni.map((c) => (
        <li key={c.con} className={styles.conversazione}>
          <span className={styles.autore}>
            {c.con}
            {c.giorni && <span className={styles.quando}>{c.giorni}</span>}
          </span>
          {c.messaggi?.map((m, n) => (
            <span key={n} className={m.da === "creator" ? styles.mioMessaggio : styles.suoMessaggio}>
              {m.testo}
            </span>
          ))}
          {!c.messaggi && c.riassunto && <span className={styles.riassunto}>{c.riassunto}</span>}
        </li>
      ))}
    </ul>
  )
}

export function Pubblico({ video }: { video?: string }) {
  const { dato, errore, caricato } = useCopia(canaleTiktok)
  const archivio = useCopia(elencoVideo).dato
  const [ordine, setOrdine] = useState<{ campo: CampoOrdine; rovescio: boolean } | null>(null)
  if (errore && !dato) return <Errore messaggio={errore} onRiprova={() => void canaleTiktok.rileggi()} />
  if (!caricato || !dato) return <Caricamento />
  if (!dato.ultima) return null // la pagina «Canale» che ci ospita dice già come avere la prima lettura

  const ultima = dato.letture.find((l) => l.lettura === dato.ultima?.lettura)
  const scelto = dato.video.find((v) => v.id === video) ?? null
  const ordinati = [...dato.video].sort((a, b) => (b.pubblicato ?? "").localeCompare(a.pubblicato ?? ""))
  const somme = totali(dato.video)
  const conNumeri = ordinati.filter((v) => v.visualizzazioni !== undefined)
  const righe = ordine ? ordina(conNumeri, ordine.campo, ordine.rovescio) : conNumeri
  return (
    <div className={styles.pagina}>
      <DatiVecchi errore={errore} dal={dataOra(dato.ultima.quando)} onRiprova={() => void canaleTiktok.rileggi()} />
      <header className={styles.testata}>
        <div>
          <p className={styles.sotto}>
            {dato.profilo?.nome ?? "TikTok"} · {t("letto il {quando}. Per dati freschi chiedilo nella chat: «aggiorna i dati di TikTok».", "read on {quando}. For fresh data ask in the chat: \"update the TikTok data\".", { quando: dataOra(dato.ultima.quando) })}
          </p>
        </div>
        <div className={styles.numeri}>
          <Numero nome={t("follower", "followers")} valore={dato.profilo?.follower} />
          <Numero nome={t("mi piace", "likes")} valore={dato.profilo?.mi_piace} />
          <Numero nome={t("video usciti", "videos out")} valore={dato.profilo?.video ?? dato.video.length} />
        </div>
      </header>

      {ultima && !ultima.completa && (
        <details className={styles.avviso}>
          <summary>{t("L'ultima lettura non è completa: mancano {n} cose", "The last read is not complete: {n} things are missing", { n: numero(ultima.mancano.length) })}</summary>
          <ul>
            {ultima.mancano.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </details>
      )}

      <section>
        <h2>{t("I video usciti", "Videos out")}</h2>
        <div className="scorri-con-segno">
          <table className={styles.tabella}>
            <thead>
              <tr>
                <th colSpan={2}>{t("Video", "Video")}</th>
                <th>{t("Uscito", "Released")}</th>
                <th className={styles.num}>{t("Visualizzazioni", "Views")}</th>
                <th className={styles.num}>{t("Mi piace", "Likes")}</th>
                <th className={styles.num}>{t("Commenti", "Comments")}</th>
                <th className={styles.num}>{t("Salvati", "Saves")}</th>
                <th className={styles.num}>{t("Condivisioni", "Shares")}</th>
                <th className={styles.num}>{t("Nuovi follower", "New followers")}</th>
                <th className={styles.num}>{t("Visti fino in fondo", "Watched to the end")}</th>
              </tr>
            </thead>
            <tbody>
              {ordinati.map((v) => (
                <RigaVideo key={v.id} video={v} scelto={v.id === scelto?.id} miniatura={archivio?.find((a) => a.slug === v.slug)?.miniatura ?? null} />
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.sotto}>{t("In blu, quanto è cresciuto dalla lettura precedente. Tocca una riga per leggere i commenti.", "In blue, how much it grew since the previous read. Tap a row to read the comments.")}</p>
      </section>

      <section>
        <h2>{t("I rapporti", "The ratios")}</h2>
        <p className={styles.sotto}>
          {t("Quante volte ogni cosa è successa ogni 1000 visualizzazioni. La riga in alto è su tutti i video con i numeri", "How many times each thing happened per 1,000 views. The top row covers all videos with numbers")}
          {somme.secondi_per_visualizzazione !== null &&
            t(": {ore} ore viste in tutto, {tempo} per visualizzazione", ": {ore} hours watched in total, {tempo} per view", { ore: numero(somme.ore, 0), tempo: durata(somme.secondi_per_visualizzazione) })}
          {t(". Tocca l'intestazione di una colonna per ordinare.", ". Tap a column header to sort.")}
        </p>
        <div className="scorri-con-segno">
          <table className={styles.tabella}>
            <thead>
              <tr>
                <th colSpan={2}>{t("Video", "Video")}</th>
                {colonne().map((c) => {
                  const scelta = ordine?.campo === c.campo
                  const rovescio = scelta && (ordine?.rovescio ?? false)
                  return <IntestazioneOrdinabile key={c.campo} nome={c.nome} scelta={scelta} rovescio={rovescio} className={styles.num} onOrdina={() => setOrdine({ campo: c.campo, rovescio: scelta ? !rovescio : false })} />
                })}
              </tr>
            </thead>
            <tbody>
              <tr className={styles.medie}>
                <td colSpan={2}>{t("Tutti i video con i numeri ({n})", "All videos with numbers ({n})", { n: numero(somme.video) })}</td>
                <td className={styles.num}>{cifra(somme.visualizzazioni)}</td>
                <td className={styles.num}>{cifra(somme.rapporti.mi_piace, 1)}</td>
                <td className={styles.num}>{cifra(somme.rapporti.commenti, 1)}</td>
                <td className={styles.num}>{cifra(somme.rapporti.condivisioni, 1)}</td>
                <td className={styles.num}>{cifra(somme.rapporti.salvati, 1)}</td>
                <td className={styles.num}>{cifra(somme.rapporti.nuovi_follower, 1)}</td>
              </tr>
              {righe.map((v) => (
                <RigaRapporti key={v.id} video={v} miniatura={archivio?.find((a) => a.slug === v.slug)?.miniatura ?? null} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className={styles.dueColonne}>
        <section>
          <h2>{scelto ? t("Commenti: {titolo}", "Comments: {titolo}", { titolo: scelto.titolo ?? t("video scelto", "selected video") }) : t("Commenti", "Comments")}</h2>
          {scelto ? <CommentiDi video={scelto} /> : <Vuoto>{t("Scegli un video dalla tabella per leggere i suoi commenti.", "Pick a video from the table to read its comments.")}</Vuoto>}
        </section>
        <section>
          <h2>{t("Messaggi privati", "Private messages")}</h2>
          <Messaggi />
        </section>
      </div>
    </div>
  )
}
