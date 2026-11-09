// «A che punto sono fra i profili con cui mi confronto?»: i profili della classifica in archivio, con quello del creator aggiornato all'ultima lettura.
import { useState } from "react"
import { api } from "../api"
import { PaginaDiCanaleVuota } from "../comuni/PaginaVuota"
import { Caricamento, Errore } from "../comuni/Stati"
import { creaCopia, useCopia } from "../dati"
import { t } from "../lingua"
import { data, dataOra, numero } from "../testo"
import type { ClassificaCanale, RigaClassifica } from "../tipi"
import styles from "./Classifica.module.css"

const CANALE = "tiktok"
const stato = creaCopia<ClassificaCanale>(
  () => api.classificaCanale(CANALE),
  (e) => e.tipo === "canale",
)

type Misura = "punteggio" | "follower" | "mi_piace" | "visualizzazioni"
const numeri = (): Array<{ misura: Misura; nome: string }> => [
  { misura: "follower", nome: t("follower", "followers") },
  { misura: "mi_piace", nome: t("mi piace", "likes") },
  { misura: "visualizzazioni", nome: t("visualizzazioni", "views") },
]
const punteggio = (): { misura: Misura; nome: string } => ({ misura: "punteggio", nome: t("punteggio", "score") })

/** Nel punteggio vince il più basso, negli altri numeri il più alto. */
const meglio = (misura: Misura, a: RigaClassifica, b: RigaClassifica): number => (misura === "punteggio" ? a.punteggio - b.punteggio : b[misura] - a[misura])
const quandoLetto = (quando: string): string => (quando.includes("T") ? dataOra(quando) : data(quando))

function LaMiaPosizione({ righe, io, scelta }: { righe: RigaClassifica[]; io: RigaClassifica; scelta: Misura }) {
  return (
    <aside className={styles.mio} aria-label={t("La tua posizione", "Your position")}>
      <span className={styles.mioNome}>@{io.nome}</span>
      <dl className={styles.mioNumeri}>
        {[punteggio(), ...numeri()].map(({ misura, nome }) => (
          <div key={misura} className={misura === scelta ? styles.accesa : undefined}>
            <dt>{nome}</dt>
            <dd>
              {t("{n}°", "#{n}", { n: righe.filter((r) => meglio(misura, r, io) < 0).length + 1 })} <small>{t("su {n}", "of {n}", { n: numero(righe.length) })}</small>
            </dd>
          </div>
        ))}
      </dl>
    </aside>
  )
}

export function Classifica() {
  const { dato, errore, caricato } = useCopia(stato)
  const [ordine, setOrdine] = useState<{ misura: Misura; rovescio: boolean }>({ misura: "punteggio", rovescio: false })
  if (errore && !dato) return <Errore messaggio={errore} onRiprova={() => void stato.rileggi()} />
  if (!caricato || !dato) return <Caricamento />
  if (dato.quando === null || dato.righe.length === 0) return <PaginaDiCanaleVuota pagina="classifica" titolo={t("Classifica", "Ranking")} />

  const io = dato.righe.find((r) => r.nome === dato.io) ?? null
  const verso = ordine.rovescio ? -1 : 1
  const ordinate = [...dato.righe].sort((a, b) => verso * meglio(ordine.misura, a, b))
  return (
    <div className={styles.pagina}>
      <header>
        <h1>{t("Classifica", "Ranking")}</h1>
        <p className={styles.sotto}>
          {t("I profili TikTok con cui ti confronti. Il punteggio è la somma delle tre posizioni (per follower, per mi piace, per visualizzazioni mediane degli ultimi video): più è basso, più il profilo è in alto. Numeri letti il {quando}", "The TikTok profiles you compare yourself with. The score is the sum of the three positions (by followers, by likes, by median views of recent videos): the lower it is, the higher the profile ranks. Numbers read on {quando}", { quando: quandoLetto(dato.quando) })}
          {io && dato.quando_io && dato.quando_io !== dato.quando
            ? t("; i tuoi il {quando}, e si aggiornano a ogni lettura di TikTok.", "; yours on {quando}, and they update with every TikTok read.", { quando: quandoLetto(dato.quando_io) })
            : "."}
        </p>
      </header>

      {io && <LaMiaPosizione righe={dato.righe} io={io} scelta={ordine.misura} />}

      <div className={styles.ordina}>
        <span>{t("Ordina per", "Sort by")}</span>
        {[punteggio(), ...numeri()].map(({ misura, nome }) => {
          const scelta = misura === ordine.misura
          return (
            <button key={misura} type="button" aria-pressed={scelta} onClick={() => setOrdine({ misura, rovescio: scelta && !ordine.rovescio })}>
              {nome}
              {scelta && <span aria-hidden="true"> {(misura === "punteggio") !== ordine.rovescio ? "↑" : "↓"}</span>}
            </button>
          )
        })}
      </div>

      <ol className={styles.lista}>
        {ordinate.map((r, i) => (
          <li key={r.nome} className={r.nome === dato.io ? styles.io : undefined} aria-current={r.nome === dato.io ? "true" : undefined}>
            <span className={styles.posto}>{i + 1}</span>
            <div className={styles.chi}>
              <a href={`https://www.tiktok.com/@${encodeURIComponent(r.nome)}`} target="_blank" rel="noreferrer">
                @{r.nome}
              </a>
              <p>{r.cosa_fa}</p>
            </div>
            <dl className={styles.numeri}>
              {[...numeri(), punteggio()].map(({ misura, nome }) => (
                <div key={misura}>
                  <dt>{nome}</dt>
                  <dd>{numero(r[misura])}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ol>

      {dato.come.length > 0 && (
        <section className={styles.come}>
          <h2>{t("Come leggerla", "How to read it")}</h2>
          {dato.come.map((frase) => (
            <p key={frase}>{frase}</p>
          ))}
        </section>
      )}
    </div>
  )
}
