import { urlMedia, urlUscita } from "../api"
import { Vuoto } from "../comuni/Stati"
import { t } from "../lingua"
import type { DettaglioVideo } from "../tipi"
import type { PropsScheda } from "./PaginaVideo"
import styles from "./CopertinaVideo.module.css"

const IMMAGINE = /\.(png|jpe?g|webp|gif|svg)$/i
const nomeDi = (percorso: string) => percorso.split("/").pop() ?? percorso

export const uscitaPer = (video: DettaglioVideo, nome: string) => video.uscite.find((u) => nomeDi(u.file) === nome)

export function CopertinaVideo({ video }: PropsScheda) {
  const copertina = uscitaPer(video, "copertina.png")
  const conCopertina = uscitaPer(video, "con-copertina.mp4")
  const delMontato = conCopertina !== undefined && video.montato?.file === conCopertina.file
  const copertinaNuova = delMontato && copertina !== undefined && Date.parse(copertina.cambiato) > Date.parse(conCopertina.cambiato)
  const materiali = video.materiali.map((m) => m.file)
  const immagini = materiali.filter((m) => IMMAGINE.test(m))
  const altri = materiali.filter((m) => !IMMAGINE.test(m))

  return (
    <div className={styles.pagina}>
      <section className={styles.coppia}>
        <div className={styles.blocco}>
          <h2>{t("La copertina", "The cover")}</h2>
          {copertina ? <img className={styles.copertina} src={urlUscita(copertina)} alt={t("La copertina del video", "The video's cover")} /> : <Vuoto>{t("Non c'è ancora una copertina: chiedila nella chat, e con il montaggio entra nel video.", "There is no cover yet: ask for it in the chat, and the edit puts it into the video.")}</Vuoto>}
        </div>
        <div className={styles.blocco}>
          <h2>{t("Il video con la copertina in testa", "The video with the cover at the start")}</h2>
          {delMontato ? <video className={styles.video} src={urlUscita(conCopertina)} controls preload="metadata" /> : <Vuoto>{conCopertina ? t("Il video con la copertina in testa è di un montaggio vecchio: rimontalo, chiedilo nella chat.", "The video with the cover at the start comes from an old edit: edit it again, ask in the chat.") : t("Il montaggio non ha ancora la copertina in testa: chiedila nella chat e rimonta.", "The edit does not have the cover at the start yet: ask for it in the chat and edit again.")}</Vuoto>}
          {copertinaNuova && <p className={styles.avviso}>{t("La copertina è cambiata dopo questo montaggio: il video non ce l'ha ancora. Chiedi nella chat di rimontarlo.", "The cover changed after this edit: the video does not have it yet. Ask in the chat to edit it again.")}</p>}
        </div>
      </section>
      <section className={styles.blocco}>
        <h2>{t("I disegni di questo video", "This video's drawings")}</h2>
        {materiali.length === 0 && <Vuoto>{t("Nessun disegno o immagine in questo video: ciò che serve alle scene sta nei materiali del video.", "No drawings or images in this video: what the scenes need lives in the video's materials.")}</Vuoto>}
        {immagini.length > 0 && (
          <ul className={styles.griglia}>
            {immagini.map((m) => (
              <li key={m}>
                <img src={urlMedia(m)} alt={nomeDi(m)} loading="lazy" />
                <span>{nomeDi(m)}</span>
              </li>
            ))}
          </ul>
        )}
        {altri.length > 0 && (
          <ul className={styles.altri}>
            {altri.map((m) => (
              <li key={m}>{nomeDi(m)}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
