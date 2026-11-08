import { useState } from "react"
import { api } from "../api"
import { Bottone } from "../comuni/Bottone"
import { BottoneCopia } from "../comuni/BottoneCopia"
import { Vuoto } from "../comuni/Stati"
import { scriviIndirizzo } from "../indirizzo"
import { t } from "../lingua"
import { dataOra, giorno, peso } from "../testo"
import type { PropsScheda } from "./PaginaVideo"
import styles from "./FileVideo.module.css"

const nomeDi = (percorso: string) => percorso.split("/").pop() ?? percorso

/** Il percorso intero di un'uscita sul computer, scritto con gli stessi separatori della cartella del video. */
export function percorsoDellUscita(cartella: string, file: string): string {
  const separatore = cartella.includes("\\") ? "\\" : "/"
  return [cartella.replace(/[\\/]+$/, ""), "uscite", nomeDi(file)].join(separatore)
}

export function FileVideo({ video }: PropsScheda) {
  const [errore, setErrore] = useState<string | null>(null)
  const sorgenti = Object.entries((video.piano_risolto_da_base ?? video.piano)?.sorgenti ?? {})

  return (
    <div className={styles.pagina}>
      <section>
        <h2>{t("I file che escono", "The output files")}</h2>
        {errore && (
          <p className={styles.errore} role="alert">
            {errore}
          </p>
        )}
        {video.uscite.length === 0 ? (
          <Vuoto>{t("Non è uscito ancora nessun file: compaiono qui appena il video è montato.", "No file has come out yet: they appear here as soon as the video is edited.")}</Vuoto>
        ) : (
          <ul className={styles.righe}>
            {video.uscite
              .filter((u) => u.stesso_file === null)
              .map((u) => (
                <li key={u.file}>
                  <div className={styles.nome}>
                    <strong>{nomeDi(u.file)}</strong>
                    <span className={styles.tenue}>
                      {peso(u.byte)} · {dataOra(u.cambiato)}
                      {video.uscite.filter((altro) => altro.stesso_file === u.file).map((altro) => ` · ${t("è anche {nome}", "it is also {nome}", { nome: nomeDi(altro.file) })}`)}
                    </span>
                  </div>
                  <div className={styles.azioni}>
                    <Bottone variante="vuoto" onClick={() => api.apri(u.file).catch((e: Error) => setErrore(e.message))}>
                      {t("Mostra nella cartella", "Show in folder")}
                    </Bottone>
                    <BottoneCopia testo={percorsoDellUscita(video.cartella, u.file)} etichetta={t("Copia il percorso", "Copy the path")} />
                  </div>
                </li>
              ))}
          </ul>
        )}
      </section>
      <section>
        <h2>{t("Il girato usato", "The footage used")}</h2>
        {sorgenti.length === 0 ? (
          <Vuoto>{t("Questo video non usa ancora nessun file del girato.", "This video does not use any footage file yet.")}</Vuoto>
        ) : (
          <ul className={styles.righe}>
            {sorgenti.map(([nome, s]) => (
              <li key={nome}>
                <div className={styles.nome}>
                  <strong>{nomeDi(s.file)}</strong>
                  <span className={styles.tenue}>{t("girato il {data}", "filmed on {data}", { data: giorno(s.file.split("/")[0] ?? "") })}</span>
                </div>
                <a href={scriviIndirizzo({ vista: "girato", parametri: { file: s.file } })}>{t("Vedilo in Girato", "See it in Footage")}</a>
              </li>
              ))}
          </ul>
        )}
      </section>
    </div>
  )
}
