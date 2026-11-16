import { BottoneCopia } from "../comuni/BottoneCopia"
import { Gruppo } from "../comuni/Gruppo"
import { CampoTesto } from "../comuni/CampoTesto"
import { Vuoto } from "../comuni/Stati"
import { t } from "../lingua"
import { data, istante, numero } from "../testo"
import type { PropsScheda } from "./PaginaVideo"
import { Andamento } from "./Andamento"
import { CanaliScheda } from "./CanaliScheda"
import { HashtagScheda } from "./HashtagScheda"
import { PubblicazioniScheda } from "./PubblicazioniScheda"
import { ScalettaScheda } from "./ScalettaScheda"
import styles from "./SchedaDelVideo.module.css"

const colonneNumeri = () =>
  [
    { chiave: "visualizzazioni", nome: t("Visualizzazioni", "Views") },
    { chiave: "mi_piace", nome: t("Mi piace", "Likes") },
    { chiave: "commenti", nome: t("Commenti", "Comments") },
    { chiave: "condivisioni", nome: t("Condivisioni", "Shares") },
    { chiave: "salvati", nome: t("Salvati", "Saves") },
  ] as const

export function SchedaDelVideo({ video, salvaScheda }: PropsScheda) {
  const { scheda } = video
  const proposta = scheda.proposta ?? {}
  const campoProposta = (chiave: "aggancio" | "centro" | "chiusa" | "note", etichetta: string, righe: number) => (
    <CampoTesto etichetta={etichetta} valore={proposta[chiave] ?? ""} righe={righe} onSalva={(v) => salvaScheda({ ...scheda, proposta: { ...proposta, [chiave]: v } })} />
  )
  const numeri = [...(scheda.numeri ?? [])].sort((a, b) => (istante(a.data) ?? 0) - (istante(b.data) ?? 0))
  const colonne = colonneNumeri()

  return (
    <div className={styles.pagina}>
      <Gruppo titolo={t("Il copione", "The script")}>
        <p className={styles.nota}>{t("Correggilo qui, anche a mano: la chat lo rilegge.", "Fix it here, even by hand: the chat reads it again.")}</p>
        <div className={styles.proposta}>
          {campoProposta("aggancio", t("Aggancio", "Hook"), 3)}
          {campoProposta("centro", t("Centro", "Center"), 3)}
          {campoProposta("chiusa", t("Chiusa", "Close"), 3)}
          {campoProposta("note", t("Note sulla proposta", "Notes on the proposal"), 3)}
        </div>
      </Gruppo>

      <ScalettaScheda video={video} salvaScheda={salvaScheda} />

      <Gruppo titolo={t("Didascalia e hashtag", "Caption and hashtags")}>
        <CampoTesto etichetta={t("Didascalia", "Caption")} valore={scheda.didascalia ?? ""} righe={4} onSalva={(v) => salvaScheda({ ...scheda, didascalia: v })} />
        <div className={styles.azioni}>
          <BottoneCopia testo={scheda.didascalia ?? ""} etichetta={t("Copia la didascalia", "Copy the caption")} />
        </div>
        <HashtagScheda video={video} salvaScheda={salvaScheda} />
      </Gruppo>

      <CanaliScheda video={video} salvaScheda={salvaScheda} />

      <Gruppo titolo={t("Dove è uscito", "Where it came out")}>
        <PubblicazioniScheda video={video} salvaScheda={salvaScheda} />
      </Gruppo>

      <Gruppo titolo={t("I numeri", "The numbers")}>
        {numeri.length === 0 ? (
          <Vuoto>{t("Nessun numero registrato: compaiono quando si legge il canale dopo l'uscita.", "No numbers recorded: they appear when the channel is read after release.")}</Vuoto>
        ) : (
          <>
            <div className="scorri-con-segno">
              <table className={styles.tabella}>
                <thead>
                  <tr>
                    <th scope="col">{t("Giorno", "Day")}</th>
                    <th scope="col">{t("Canale", "Channel")}</th>
                    {colonne.map((c) => (
                      <th key={c.chiave} scope="col" className={styles.num}>
                        {c.nome}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {numeri.map((n) => (
                    <tr key={`${n.data}-${n.canale}`}>
                      <td>{data(n.data)}</td>
                      <td>{n.canale}</td>
                      {colonne.map((c) => (
                        <td key={c.chiave} className={styles.num}>
                          {n[c.chiave] === undefined ? "–" : numero(n[c.chiave]!)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Andamento numeri={numeri} />
          </>
        )}
      </Gruppo>

      <Gruppo titolo={t("Note", "Notes")}>
        <CampoTesto etichetta={t("Note sul video", "Notes on the video")} valore={scheda.note ?? ""} righe={4} onSalva={(v) => salvaScheda({ ...scheda, note: v })} />
      </Gruppo>
    </div>
  )
}
