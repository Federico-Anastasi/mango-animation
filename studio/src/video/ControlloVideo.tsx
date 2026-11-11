import { useState, type ReactNode } from "react"
import { Vuoto } from "../comuni/Stati"
import { t } from "../lingua"
import { dataOra, istante, numero, tempoLeggibile } from "../testo"
import { scriviIndirizzo } from "../indirizzo"
import type { PropsScheda } from "./PaginaVideo"
import { uscitaDi } from "./liste"
import styles from "./ControlloVideo.module.css"

function VaA({ slug, secondi }: { slug: string; secondi: number }) {
  return (
    <a className={styles.vai} href={scriviIndirizzo({ vista: "video", slug, scheda: "montaggio", parametri: { t: String(secondi) } })}>
      {t("Vai a {tempo}", "Go to {tempo}", { tempo: tempoLeggibile(secondi) })}
    </a>
  )
}

/** Una sezione del controllo: il titolo col conto, e le voci in elenco o la frase che dice che non ce ne sono. */
function Elenco({ titolo, vuoto, voci }: { titolo: string; vuoto: string; voci: ReactNode[] }) {
  return (
    <section className={styles.sezione}>
      <h3>{titolo}</h3>
      {voci.length === 0 ? <Vuoto>{vuoto}</Vuoto> : <ul className={styles.righe}>{voci}</ul>}
    </section>
  )
}

export function ControlloVideo({ video, salvaScheda }: PropsScheda) {
  const { controllo, slug, scheda } = video
  const [errore, setErrore] = useState<string | null>(null)
  const finale = uscitaDi(video, "finale.mp4")
  const delFinale = controllo ? istante(controllo.del_finale) : null
  const delMontato = finale ? istante(finale.cambiato) : null
  const vecchio = delFinale !== null && delMontato !== null && delMontato > delFinale + 1000

  const verificare = scheda.da_verificare ?? []
  const spunta = (indice: number) => {
    const nuovo = verificare.map((v, i) => (i === indice ? { ...v, stato: v.stato === "aperto" ? ("a posto" as const) : ("aperto" as const) } : v))
    setErrore(null)
    salvaScheda({ ...scheda, da_verificare: nuovo }).catch((e: Error) => setErrore(e.message))
  }

  return (
    <div className={styles.pagina}>
      <div className={styles.testata}>
        <div>
          <h2>{t("Il controllo del montato", "Check of the edited video")}</h2>
          {controllo ? <p className={styles.tenue}>{t("Fatto il {data} su un video di {durata} s.", "Done on {data} on a video of {durata} s.", { data: dataOra(controllo.quando), durata: numero(controllo.durata, 1) })}</p> : <p className={styles.tenue}>{t("Il montato non è ancora stato controllato.", "The edited video has not been checked yet.")}</p>}
          {finale && <p className={styles.tenue}>{t("Per controllare di nuovo il montato, chiedilo nella chat.", "To check the edited video again, ask in the chat.")}</p>}
        </div>
      </div>
      {errore && (
        <p className={styles.errore} role="alert">
          {errore}
        </p>
      )}
      {!finale && <Vuoto>{t("Non c'è ancora un video montato da controllare: appena è montato, si controlla.", "There is no edited video to check yet: as soon as it is edited, it gets checked.")}</Vuoto>}
      {vecchio && <p className={styles.avviso}>{t("Il video montato è più nuovo di questo controllo: va riascoltato.", "The edited video is newer than this check: it needs listening to again.")}</p>}

      {controllo && (
        <>
          <Elenco
            titolo={t("Silenzi rimasti ({n})", "Silences left ({n})", { n: controllo.silenzi.length })}
            vuoto={t("Nessun silenzio oltre la pausa dello stile.", "No silence beyond the style's pause.")}
            voci={controllo.silenzi.map((s) => (
              <li key={s.a}>
                <span>{t("Silenzio di {durata} s", "Silence of {durata} s", { durata: numero(s.dura, 2) })}</span>
                <VaA slug={slug} secondi={s.a} />
              </li>
            ))}
          />
          <Elenco
            titolo={t("Parole fuori posto ({n})", "Misplaced words ({n})", { n: controllo.parole_fuori_posto.length })}
            vuoto={t("Tutte le parole stanno dove devono.", "All the words are where they should be.")}
            voci={controllo.parole_fuori_posto.map((p) => (
              <li key={`${p.parola}-${p.attesa[0]}`}>
                <span>
                  {t("«{parola}»: attesa a {attesa}, trovata a {trovata}", "«{parola}»: expected at {attesa}, found at {trovata}", { parola: p.parola, attesa: tempoLeggibile(p.attesa[0]), trovata: tempoLeggibile(p.trovata[0]) })}
                  <span className={styles.tenue}>{t(" (sicurezza {voto}%)", " (confidence {voto}%)", { voto: numero(p.voto * 100, 0) })}</span>
                </span>
                <VaA slug={slug} secondi={p.attesa[0]} />
              </li>
            ))}
          />
          <Elenco
            titolo={t("Tagli nel parlato ({n})", "Cuts in the speech ({n})", { n: controllo.tagli_nel_parlato.length })}
            vuoto={t("Nessun taglio cade dentro una parola.", "No cut falls inside a word.")}
            voci={controllo.tagli_nel_parlato.map((taglio) => (
              <li key={taglio.a}>
                <span>{t("Un taglio cade dentro una parola", "A cut falls inside a word")}</span>
                <VaA slug={slug} secondi={taglio.a} />
              </li>
            ))}
          />
          <Elenco
            titolo={t("Differenze fra voluto e sentito ({n})", "Differences between wanted and heard ({n})", { n: controllo.differenze.length })}
            vuoto={t("Ciò che si sente è ciò che era nel montaggio.", "What you hear is what was in the edit.")}
            voci={controllo.differenze.map((d) => (
              <li key={d.a}>
                <span className={styles.confronto}>
                  <span>
                    <span className={styles.tenue}>{t("Voluto ", "Wanted ")}</span>
                    {d.voluto}
                  </span>
                  <span>
                    <span className={styles.tenue}>{t("Sentito ", "Heard ")}</span>
                    {d.sentito}
                  </span>
                </span>
                <VaA slug={slug} secondi={d.a} />
              </li>
            ))}
          />

          {controllo.sentito && (
            <details className={styles.sezione}>
              <summary>{t("Tutto ciò che il controllo ha sentito", "Everything the check heard")}</summary>
              <p className={styles.sentito}>{controllo.sentito}</p>
            </details>
          )}
        </>
      )}

      <Elenco
        titolo={t("Da verificare ({n} aperte)", "To verify ({n} open)", { n: verificare.filter((v) => v.stato === "aperto").length })}
        vuoto={t("Il controllo dei contenuti non ha segnato niente da verificare.", "The content check has not marked anything to verify.")}
        voci={verificare.map((v, i) => (
          <li key={v.cosa}>
            <label className={styles.spunta}>
              <input type="checkbox" checked={v.stato === "a posto"} onChange={() => spunta(i)} />
              <span>
                <span className={v.stato === "a posto" ? styles.fatto : undefined}>{v.cosa}</span>
                {v.perche && <span className={styles.tenue}> {v.perche}</span>}
              </span>
            </label>
          </li>
        ))}
      />
    </div>
  )
}
