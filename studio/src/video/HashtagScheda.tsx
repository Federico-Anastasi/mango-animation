import { useState } from "react"
import { BottoneCopia } from "../comuni/BottoneCopia"
import { Bottone } from "../comuni/Bottone"
import { Icona } from "../comuni/icone"
import { Vuoto } from "../comuni/Stati"
import { t } from "../lingua"
import type { PropsScheda } from "./PaginaVideo"
import { conLista, nonFallire } from "./liste"
import styles from "./SchedaDelVideo.module.css"

const senzaCancelletto = (h: string): string => h.replace(/^#+/, "")

export function HashtagScheda({ video, salvaScheda }: PropsScheda) {
  const { scheda } = video
  const hashtag = scheda.hashtag ?? []
  const [testo, setTesto] = useState("")
  const [errore, setErrore] = useState<string | null>(null)

  const aggiungi = () => {
    const presenti = new Set(hashtag.map((h) => senzaCancelletto(h).toLowerCase()))
    const nuovi: string[] = []
    for (const h of testo.split(/[\s,]+/).map(senzaCancelletto)) {
      if (h === "" || presenti.has(h.toLowerCase())) continue
      presenti.add(h.toLowerCase())
      nuovi.push(h)
    }
    if (nuovi.length === 0) {
      setTesto("")
      return
    }
    setErrore(null)
    salvaScheda(conLista(scheda, "hashtag", [...hashtag, ...nuovi])).then(
      () => setTesto(""),
      (e: Error) => setErrore(e.message),
    )
  }

  return (
    <>
      {hashtag.length === 0 ? (
        <Vuoto>{t("Nessun hashtag per questo video.", "No hashtags for this video.")}</Vuoto>
      ) : (
        <div className={styles.hashtag}>
          <ul className={styles.etichette}>
            {hashtag.map((h) => (
              <li key={h}>
                <span>#{senzaCancelletto(h)}</span>
                <button type="button" className={styles.togli} aria-label={t("Togli #{h}", "Remove #{h}", { h: senzaCancelletto(h) })} onClick={() => nonFallire(salvaScheda(conLista(scheda, "hashtag", hashtag.filter((altro) => altro !== h))))}>
                  <Icona nome="croce" dimensione={14} />
                </button>
              </li>
            ))}
          </ul>
          <BottoneCopia testo={hashtag.map((h) => `#${senzaCancelletto(h)}`).join(" ")} etichetta={t("Copia gli hashtag", "Copy the hashtags")} />
        </div>
      )}
      <div className={styles.aggiungi}>
        <input type="text" aria-label={t("Nuovo hashtag", "New hashtag")} placeholder={t("Un hashtag nuovo", "A new hashtag")} value={testo} onChange={(e) => setTesto(e.target.value)} onKeyDown={(e) => e.key === "Enter" && aggiungi()} />
        <Bottone variante="vuoto" onClick={aggiungi} etichetta={t("Aggiungi hashtag", "Add hashtag")}>
          <Icona nome="piu" />
          {t("Aggiungi", "Add")}
        </Bottone>
        {errore && (
          <span className={styles.errore} role="alert">
            {errore}
          </span>
        )}
      </div>
    </>
  )
}
