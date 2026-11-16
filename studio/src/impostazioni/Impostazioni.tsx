// Le impostazioni in una pagina sola: a sinistra «Cerca» e le sezioni (quelle del mestiere, poi Generale e Aiuto), a destra la sezione aperta.
// Sotto i 640 px la prima schermata è l'elenco delle sezioni, e una sezione si apre a tutto schermo con «Indietro».
import { lazy, Suspense, useEffect, useState } from "react"
import { Icona } from "../comuni/icone"
import { Caricamento } from "../comuni/Stati"
import { scriviIndirizzo, SEZIONI_IMPOSTAZIONI, vai, type SezioneImpostazioni } from "../indirizzo"
import { t } from "../lingua"
import { Aiuto } from "./Aiuto"
import { ponteAiuto } from "./ponteAiuto"
import { Generale } from "./Generale"
import { Profilo } from "./Profilo"
import { cerca } from "./righe"
import { Telefono } from "./Telefono"
import styles from "./Impostazioni.module.css"

const PaginaStile = lazy(() => import("../stile/PaginaStile").then((m) => ({ default: m.PaginaStile })))
const Motori = lazy(() => import("../motori/Motori").then((m) => ({ default: m.Motori })))

const nomi = (): Record<SezioneImpostazioni, string> => ({
  profilo: t("Profilo", "Profile"),
  stile: t("Stile", "Style"),
  computer: t("Computer", "Computer"),
  telefono: t("Telefono", "Phone"),
  generale: t("Generale", "General"),
  aiuto: t("Aiuto", "Help"),
})

const COMUNI: readonly SezioneImpostazioni[] = ["generale", "aiuto"]
const DEL_MESTIERE = SEZIONI_IMPOSTAZIONI.filter((s) => !COMUNI.includes(s))
const indirizzoDi = (parte: SezioneImpostazioni) => scriviIndirizzo({ vista: "impostazioni", parte })

function Colonna({ attiva }: { attiva: SezioneImpostazioni }) {
  const [domanda, setDomanda] = useState("")
  const [versione, setVersione] = useState<string | null>(null)

  useEffect(() => {
    ponteAiuto()
      ?.leggi()
      .then(
        (dati) => setVersione(dati.versione),
        () => setVersione(null),
      )
  }, [])

  const trovate = cerca(domanda)
  const cercando = domanda.trim() !== ""
  const link = (parte: SezioneImpostazioni) => (
    <li key={parte}>
      <a href={indirizzoDi(parte)} className={styles.voce} aria-current={parte === attiva ? "page" : undefined}>
        {nomi()[parte]}
      </a>
    </li>
  )

  return (
    <nav className={styles.colonna} aria-label={t("Impostazioni", "Settings")}>
      <label className={styles.campoDiRicerca}>
        <span className={styles.lente}>
          <Icona nome="cerca" dimensione={16} />
        </span>
        <input
          type="search"
          className={styles.cerca}
          aria-label={t("Cerca", "Search")}
          placeholder={t("Cerca", "Search")}
          value={domanda}
          onChange={(e) => setDomanda(e.target.value)}
          onKeyDown={(e) => {
            const prima = trovate[0]
            if (e.key !== "Enter" || !prima) return
            vai(indirizzoDi(prima.sezione))
            setDomanda("")
          }}
        />
      </label>
      {cercando ? (
        trovate.length > 0 ? (
          <ul className={styles.elenco} aria-label={t("Risultati", "Results")}>
            {trovate.map((r) => (
              <li key={r.id}>
                <a href={indirizzoDi(r.sezione)} className={styles.voce} onClick={() => setDomanda("")}>
                  {r.nome}
                  <span className={styles.dove}>{nomi()[r.sezione]}</span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.nulla} role="status">
            {t("Non trovo niente con queste parole.", "Nothing matches these words.")}
          </p>
        )
      ) : (
        <>
          <ul className={styles.elenco}>{DEL_MESTIERE.map(link)}</ul>
          <hr className={styles.linea} />
          <ul className={styles.elenco}>{COMUNI.map(link)}</ul>
        </>
      )}
      {versione && <p className={styles.versione}>Mango Animation {versione}</p>}
    </nav>
  )
}

export function Impostazioni({ sezione, nominata }: { sezione: SezioneImpostazioni; nominata: boolean }) {
  return (
    <div className={styles.contenitore}>
      <div className={styles.pagina} data-aperta={nominata}>
        <Colonna attiva={sezione} />
        <div className={styles.area}>
          <a className={styles.indietro} href={scriviIndirizzo({ vista: "impostazioni" })}>
            <Icona nome="sinistra" dimensione={16} />
            {t("Indietro", "Back")}
          </a>
          <Suspense fallback={<Caricamento />}>
            {sezione === "profilo" && <Profilo />}
            {sezione === "stile" && <PaginaStile />}
            {sezione === "computer" && <Motori />}
            {sezione === "telefono" && <Telefono />}
            {sezione === "generale" && <Generale />}
            {sezione === "aiuto" && <Aiuto />}
          </Suspense>
        </div>
      </div>
    </div>
  )
}
