// «Dove ho detto questa cosa?»: il campo che cerca nel parlato di tutti i file già trascritti, e i risultati con il file, il secondo e la frase intorno.
// Un clic apre il file a quel punto. La ricerca la fa il server (`GET /api/grezzo/cerca`).
import { useEffect, useState } from "react"
import { api } from "../api"
import { scriviIndirizzo, vai } from "../indirizzo"
import { t } from "../lingua"
import { giorno, pluralizza, tempoLeggibile } from "../testo"
import type { RicercaParlato, RisultatoParlato } from "../tipi"
import styles from "./CercaNelParlato.module.css"

/** Sotto queste lettere non si cerca: quasi ogni parola le contiene. */
const LETTERE_MINIME = 2
const ATTESA_MS = 300

export const staCercando = (valore: string): boolean => valore.trim().length >= LETTERE_MINIME

function perFile(risultati: RisultatoParlato[]): Array<{ file: string; trovati: RisultatoParlato[] }> {
  const gruppi: Array<{ file: string; trovati: RisultatoParlato[] }> = []
  for (const r of risultati) {
    const ultimo = gruppi[gruppi.length - 1]
    if (ultimo?.file === r.file) ultimo.trovati.push(r)
    else gruppi.push({ file: r.file, trovati: [r] })
  }
  return gruppi
}

function Risultati({ ricerca, domanda }: { ricerca: RicercaParlato; domanda: string }) {
  if (ricerca.risultati.length === 0) {
    return (
      <p className={styles.nessuno} role="status">
        {ricerca.cercati === 0
          ? t("Nessun file ha ancora il parlato trascritto: appena i file sono preparati, qui si può cercare.", "No file has its speech transcribed yet: once the files are prepared, you can search here.")
          : t("Nessun file dice «{domanda}». Prova con meno parole, o con l'inizio di una parola.", "No file says “{domanda}”. Try fewer words, or the start of a word.", { domanda })}
      </p>
    )
  }
  const gruppi = perFile(ricerca.risultati)
  return (
    <div className={styles.risultati}>
      <p className={styles.conto} role="status">
        {t("{quanti} in {file}", "{quanti} in {file}", {
          quanti: pluralizza(ricerca.totale, t("risultato", "result"), t("risultati", "results")),
          file: pluralizza(new Set(ricerca.risultati.map((r) => r.file)).size, t("file", "file"), t("file", "files")),
        })}
        {ricerca.totale > ricerca.risultati.length && <> · {t("ecco i primi {quanti}: aggiungi qualche parola per restringere.", "here are the first {quanti}: add a few words to narrow it down.", { quanti: ricerca.risultati.length })}</>}
      </p>
      {ricerca.non_letti > 0 && <p className={styles.nessuno}>{t("Di {quanti} il parlato non si legge: chiedi nella chat di trascriverlo di nuovo.", "The speech of {quanti} cannot be read: ask in the chat to transcribe it again.", { quanti: pluralizza(ricerca.non_letti, t("file", "file"), t("file", "files")) })}</p>}
      {gruppi.map(({ file, trovati }) => {
        const [giornata = "", ...nome] = file.split("/")
        return (
          <section key={file} className={styles.file}>
            <h3>
              {nome.join("/")} <span className={styles.giorno}>· {giorno(giornata)}</span>
            </h3>
            <ul>
              {trovati.map((r) => (
                <li key={r.da}>
                  <button type="button" className={styles.risultato} onClick={() => vai(scriviIndirizzo({ vista: "girato", parametri: { file: r.file, t: String(r.da) } }))} title={t("Apre il file a questo punto", "Opens the file at this point")}>
                    <span className={styles.tempo}>{tempoLeggibile(r.da, false)}</span>
                    <span className={styles.frase}>
                      {r.prima && <>…{r.prima} </>}
                      <mark>{r.trovato}</mark>
                      {r.dopo && <> {r.dopo}…</>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

/** Il campo, in testa alla pagina. */
export function CampoCerca({ valore, onCambia }: { valore: string; onCambia: (valore: string) => void }) {
  return (
    <label className={styles.campo}>
      <span className={styles.nascosto}>{t("Cerca nel parlato", "Search the speech")}</span>
      <input type="search" placeholder={t("Cerca nel parlato", "Search the speech")} value={valore} onChange={(e) => onCambia(e.target.value)} />
    </label>
  )
}

/** I risultati di ciò che è scritto nel campo, al posto dell'elenco dei giorni. */
export function RisultatiDelParlato({ valore }: { valore: string }) {
  const domanda = valore.trim()
  const attiva = staCercando(valore)
  const [ricerca, setRicerca] = useState<{ domanda: string; esito: RicercaParlato | string } | null>(null)

  useEffect(() => {
    if (!attiva) return
    let vivo = true
    const attesa = setTimeout(() => {
      api.cercaNelParlato(domanda).then(
        (esito) => vivo && setRicerca({ domanda, esito }),
        (e: Error) => vivo && setRicerca({ domanda, esito: e.message }),
      )
    }, ATTESA_MS)
    return () => {
      vivo = false
      clearTimeout(attesa)
    }
  }, [attiva, domanda])

  const pronta = attiva && ricerca?.domanda === domanda ? ricerca.esito : null
  if (!attiva) return null
  if (pronta === null) {
    return (
      <p className={styles.nessuno} role="status">
        {t("Cerco…", "Searching…")}
      </p>
    )
  }
  if (typeof pronta === "string") {
    return (
      <p className={styles.errore} role="alert">
        {pronta}
      </p>
    )
  }
  return <Risultati ricerca={pronta} domanda={domanda} />
}
