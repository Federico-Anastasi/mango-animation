import { useMemo, useState } from "react"
import { urlVersionato } from "../api"
import { GuardaDalTelefono } from "../comuni/GuardaDalTelefono"
import { Caricamento, Errore, Vuoto } from "../comuni/Stati"
import { elencoVideo, useCopia } from "../dati"
import { scriviIndirizzo } from "../indirizzo"
import { t } from "../lingua"
import { data, durata, istante, numero, pluralizza } from "../testo"
import type { Scheda, StatoVideo, VoceElenco } from "../tipi"
import styles from "./ElencoVideo.module.css"

const gruppi = (): Array<{ stato: StatoVideo; nome: string; vuoto: string }> => [
  { stato: "in lavorazione", nome: t("In lavorazione", "In progress"), vuoto: t("Nessun video in lavorazione.", "No videos in progress.") },
  { stato: "proposta", nome: t("Proposte", "Proposals"), vuoto: t("Nessuna proposta.", "No proposals.") },
  { stato: "pronto", nome: t("Pronti", "Ready"), vuoto: t("Nessun video pronto.", "No videos ready.") },
  { stato: "pubblicato", nome: t("Pubblicati", "Published"), vuoto: t("Nessun video pubblicato.", "No videos published.") },
  { stato: "scartato", nome: t("Scartati", "Discarded"), vuoto: t("Nessun video scartato.", "No videos discarded.") },
]

/** Per ogni canale, le visualizzazioni dell'ultima lettura. */
export function ultimiNumeri(scheda: Scheda): Array<{ visualizzazioni: number; canale: string }> {
  const perCanale = new Map<string, { visualizzazioni: number; t: number }>()
  for (const n of scheda.numeri ?? []) {
    const quando = istante(n.data)
    if (n.visualizzazioni === undefined || quando === null) continue
    if (quando >= (perCanale.get(n.canale)?.t ?? -Infinity)) perCanale.set(n.canale, { visualizzazioni: n.visualizzazioni, t: quando })
  }
  return [...perCanale.entries()].map(([canale, v]) => ({ canale, visualizzazioni: v.visualizzazioni }))
}

export function CartaVideo({ voce }: { voce: VoceElenco }) {
  const { scheda } = voce
  const numeri = ultimiNumeri(scheda)
  const senzaAnteprima = scheda.stato === "proposta" && voce.anteprima === null
  const pubblicata = [...(scheda.pubblicazioni ?? [])].sort((a, b) => (istante(a.data) ?? 0) - (istante(b.data) ?? 0)).at(0)
  return (
    <a className={styles.carta} href={scriviIndirizzo({ vista: "video", slug: voce.slug })}>
      <span className={styles.miniatura}>{voce.miniatura ? <img src={urlVersionato(voce.miniatura, voce.ultimo_cambio)} alt="" loading="lazy" /> : <span className={styles.senza}>{senzaAnteprima ? "" : t("senza immagine", "no image")}</span>}</span>
      <span className={styles.testo}>
        <span className={styles.titolo}>{scheda.titolo}</span>
        <span className={styles.meta}>
          {scheda.formato === "carosello" ? <span>{t("carosello", "carousel")}</span> : voce.durata !== null ? <span className="mono">{durata(voce.durata)}</span> : <span>{t("non ancora montato", "not edited yet")}</span>}
          {scheda.serie && <span>{t("serie {serie}", "series {serie}", { serie: scheda.serie })}</span>}
          {!voce.ha_finale && voce.ha_piano && <span>{t("da montare", "to edit")}</span>}
          {senzaAnteprima && <span className={styles.mancante}>{t("senza anteprima", "no preview")}</span>}
        </span>
        {scheda.stato === "pubblicato" && (
          <span className={styles.meta}>
            {pubblicata && <span>{t("uscito il {data}", "out on {data}", { data: data(pubblicata.data) })}</span>}
            {numeri.map((n) => (
              <span key={n.canale}>
                {n.visualizzazioni === 1 ? t("{n} visualizzazioni su {canale}", "{n} view on {canale}", { n: numero(n.visualizzazioni), canale: n.canale }) : t("{n} visualizzazioni su {canale}", "{n} views on {canale}", { n: numero(n.visualizzazioni), canale: n.canale })}
              </span>
            ))}
          </span>
        )}
      </span>
    </a>
  )
}

export function ElencoVideo() {
  const copia = useCopia(elencoVideo)
  const [cerca, setCerca] = useState("")
  const [serie, setSerie] = useState("")

  const voci = copia.dato
  const serieDisponibili = useMemo(() => [...new Set((voci ?? []).flatMap((v) => (v.scheda.serie ? [v.scheda.serie] : [])))].sort(), [voci])
  const filtrate = useMemo(() => {
    const ago = cerca.trim().toLowerCase()
    return (voci ?? [])
      .filter((v) => (ago === "" || v.scheda.titolo.toLowerCase().includes(ago)) && (serie === "" || v.scheda.serie === serie))
      .sort((a, b) => (a.scheda.priorita ?? Infinity) - (b.scheda.priorita ?? Infinity) || (istante(b.ultimo_cambio) ?? 0) - (istante(a.ultimo_cambio) ?? 0))
  }, [voci, cerca, serie])

  if (voci === null) return copia.errore ? <Errore messaggio={copia.errore} onRiprova={() => void elencoVideo.rileggi()} /> : <Caricamento />

  return (
    <div className={styles.pagina}>
      <div className={styles.testata}>
        <div>
          <h1>{t("Video", "Videos")}</h1>
          <p className={styles.suggerimento}>{t("Per un video nuovo, chiedilo nella chat.", "For a new video, ask in the chat.")}</p>
        </div>
        <div className={styles.strumenti}>
          <label className={styles.campo}>
            <span className={styles.nascosto}>{t("Cerca per titolo", "Search by title")}</span>
            <input type="search" placeholder={t("Cerca per titolo", "Search by title")} value={cerca} onChange={(e) => setCerca(e.target.value)} />
          </label>
          {serieDisponibili.length > 0 && (
            <label className={styles.campo}>
              <span className={styles.nascosto}>{t("Serie", "Series")}</span>
              <select value={serie} onChange={(e) => setSerie(e.target.value)}>
                <option value="">{t("Tutte le serie", "All series")}</option>
                {serieDisponibili.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          )}
          <GuardaDalTelefono />
        </div>
      </div>
      {copia.errore && <Errore messaggio={copia.errore} onRiprova={() => void elencoVideo.rileggi()} />}
      {voci.length === 0 && <Vuoto>{t("Non c'è ancora nessun video: si può partire anche da un file di Girato.", "There are no videos yet: you can also start from a file in Footage.")}</Vuoto>}
      {voci.length > 0 && filtrate.length === 0 && <Vuoto>{t("Nessun video corrisponde alla ricerca. Cambia le parole o togli il filtro sulla serie.", "No video matches the search. Change the words or remove the series filter.")}</Vuoto>}
      {filtrate.length > 0 &&
        gruppi().map((g) => {
          const delGruppo = filtrate.filter((v) => v.scheda.stato === g.stato)
          if (delGruppo.length === 0 && g.stato !== "in lavorazione") return null
          const corpo =
            delGruppo.length === 0 ? (
              <Vuoto>{g.vuoto}</Vuoto>
            ) : (
              <ul className={styles.griglia}>
                {delGruppo.map((v) => (
                  <li key={v.slug}>
                    <CartaVideo voce={v} />
                  </li>
                ))}
              </ul>
            )
          if (g.stato === "scartato")
            return (
              <details key={g.stato} className={styles.gruppo}>
                <summary>
                  <h2>{g.nome}</h2>
                  <span className={styles.conto}>{pluralizza(delGruppo.length, t("video", "video"), t("video", "videos"))}</span>
                </summary>
                {corpo}
              </details>
            )
          return (
            <section key={g.stato} className={styles.gruppo}>
              <div className={styles.titoloGruppo}>
                <h2>{g.nome}</h2>
                <span className={styles.conto}>{pluralizza(delGruppo.length, t("video", "video"), t("video", "videos"))}</span>
              </div>
              {corpo}
            </section>
          )
        })}
    </div>
  )
}
