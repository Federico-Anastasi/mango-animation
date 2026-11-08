// «Cosa ho girato, e cosa ne ho fatto?»: i file del girato per giorno, e per ognuno il lettore, il parlato, le note.
import { useMemo, useState } from "react"
import { urlMedia } from "../api"
import { Colonne } from "../comuni/Colonne"
import { Caricamento, Errore, Vuoto } from "../comuni/Stati"
import { elencoVideo, grezzo, useCopia } from "../dati"
import { scriviIndirizzo, vai } from "../indirizzo"
import { t } from "../lingua"
import { durata, giorno, peso, pluralizza } from "../testo"
import type { FileGrezzo, TipoGrezzo } from "../tipi"
import { DettaglioFile } from "./DettaglioFile"
import { eFoto, nomeOrigine, nomeTipo } from "./nomi"
import { RiquadroArrivi } from "./RiquadroArrivi"
import { RiquadroStudioDalTelefono } from "./RiquadroStudioDalTelefono"
import styles from "./Girato.module.css"

const TIPI: TipoGrezzo[] = ["ripresa", "diretta", "schermo", "altro"]

/** Un file senza scheda non si sa ancora cos'è: si tratta come «altro». */
const tipoDi = (f: FileGrezzo): TipoGrezzo => f.scheda?.tipo ?? "altro"

export function Girato({ file: scelto }: { file: string | undefined }) {
  const copia = useCopia(grezzo)
  const titoli = useCopia(elencoVideo).dato
  const [soloMaiUsati, setSoloMaiUsati] = useState(false)
  const [tipo, setTipo] = useState<TipoGrezzo | "">("")

  const giorni = copia.dato
  const filtrati = useMemo(
    () =>
      (giorni ?? [])
        .map((g) => ({ ...g, file: g.file.filter((f) => (!soloMaiUsati || f.usato_in.length === 0) && (tipo === "" || tipoDi(f) === tipo)) }))
        .filter((g) => g.file.length > 0),
    [giorni, soloMaiUsati, tipo],
  )
  const tutti = useMemo(() => (giorni ?? []).flatMap((g) => g.file), [giorni])
  const aperto = tutti.find((f) => f.file === scelto) ?? null

  if (giorni === null) return copia.errore ? <Errore messaggio={copia.errore} onRiprova={() => void grezzo.rileggi()} /> : <Caricamento />

  const titoloDi = (slug: string) => titoli?.find((v) => v.slug === slug)?.scheda.titolo ?? t("un video", "a video")
  const apri = (f: FileGrezzo) => vai(scriviIndirizzo({ vista: "girato", parametri: { file: f.file } }))

  const elenco = (
    <div className={styles.elenco}>
      <div className={styles.filtri}>
        <label className={styles.spunta}>
          <input type="checkbox" checked={soloMaiUsati} onChange={(e) => setSoloMaiUsati(e.target.checked)} />
          {t("Solo quelli mai usati", "Only those never used")}
        </label>
        <label className={styles.tipo}>
          <span>{t("Tipo", "Type")}</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoGrezzo | "")}>
            <option value="">{t("Tutti", "All")}</option>
            {TIPI.map((tp) => (
              <option key={tp} value={tp}>
                {nomeTipo(tp)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {tutti.length === 0 && <Vuoto>{t("Nel girato non c'è ancora niente. I file arrivano dal telefono oppure si mettono nella cartella del girato.", "There is nothing in the footage yet. Files come from your phone or are put in the footage folder.")}</Vuoto>}
      {tutti.length > 0 && filtrati.length === 0 && <Vuoto>{t("Nessun file corrisponde ai filtri: toglili per vedere tutto il girato.", "No file matches the filters: remove them to see all the footage.")}</Vuoto>}
      {filtrati.map((g) => (
        <section key={g.giorno} className={styles.giorno}>
          <h2>{giorno(g.giorno)}</h2>
          <ul className={styles.file}>
            {g.file.map((f) => (
              <li key={f.file}>
                <button type="button" className={styles.riga} aria-current={f.file === scelto ? "true" : undefined} onClick={() => apri(f)}>
                  <span className={styles.miniatura}>{f.preparato.miniatura ? <img src={urlMedia(f.preparato.miniatura)} alt="" loading="lazy" /> : <span>{t("da preparare", "to prepare")}</span>}</span>
                  <span className={styles.testo}>
                    <span className={styles.nome}>{f.nome}</span>
                    <span className={styles.meta}>
                      {f.scheda ? (eFoto(f.nome) ? t("Foto", "Photo") : nomeTipo(f.scheda.tipo)) : f.scheda_problemi.length > 0 ? t("Scheda da correggere", "Card to fix") : t("Scheda in arrivo", "Card on its way")}
                      {f.scheda?.durata !== undefined && <> · {durata(f.scheda.durata)}</>}
                      <> · {peso(f.byte)}</>
                      {f.scheda && <> · {t("da {origine}", "from {origine}", { origine: nomeOrigine(f.scheda.origine).toLowerCase() })}</>}
                    </span>
                    <span className={f.usato_in.length === 0 ? styles.maiUsato : styles.meta}>{f.usato_in.length === 0 ? t("mai usato", "never used") : t("usato in {quanti}: {titoli}", "used in {quanti}: {titoli}", { quanti: pluralizza(f.usato_in.length, t("video", "video"), t("video", "videos")), titoli: f.usato_in.map(titoloDi).join(", ") })}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )

  return (
    <div className={styles.pagina}>
      <div className={styles.testata}>
        <h1>{t("Girato", "Footage")}</h1>
        <span className={styles.conto}>{pluralizza(tutti.length, t("file", "file"), t("file", "files"))}</span>
      </div>
      <RiquadroArrivi />
      <RiquadroStudioDalTelefono />
      {scelto && !aperto && <Vuoto>{t("Il file che cercavi non è nel girato: forse è stato spostato. Scegline un altro dall'elenco.", "The file you were looking for is not in the footage: it may have been moved. Pick another one from the list.")}</Vuoto>}
      <Colonne chiave="girato" fissa="seconda" iniziale={460} minimaFissa={300} minimaLibera={320} unaSolaSotto={900} sotto="impila" allinea="inizio" etichetta={t("Larghezza del dettaglio del file", "File detail width")} prima={elenco} seconda={aperto ? <DettaglioFile file={aperto} titoloDi={titoloDi} /> : <Vuoto>{t("Scegli un file dall'elenco per vederlo, leggerne il parlato e farne un video.", "Pick a file from the list to watch it, read its speech and make a video from it.")}</Vuoto>} />
    </div>
  )
}
