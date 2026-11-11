// «Cosa ho girato, e cosa ne ho fatto?»: i file del girato per giorno, e per ognuno il lettore, il parlato, le note.
import { useMemo, useRef, useState } from "react"
import { api, urlMedia } from "../api"
import { Bottone } from "../comuni/Bottone"
import { Colonne } from "../comuni/Colonne"
import { Icona } from "../comuni/icone"
import { Caricamento, Errore, Vuoto } from "../comuni/Stati"
import { elencoVideo, grezzo, useCopia } from "../dati"
import { scriviIndirizzo, useIndirizzo, vai } from "../indirizzo"
import { t } from "../lingua"
import { durata, giorno, peso, pluralizza } from "../testo"
import type { FileGrezzo, TipoGrezzo } from "../tipi"
import { useAggiunte, useRilascio } from "./aggiungi"
import { ElencoAggiunte, ZonaDiRilascio } from "./Aggiunte"
import { ArriviDalTelefono } from "./ArriviDalTelefono"
import { CampoCerca, RisultatiDelParlato, staCercando } from "./CercaNelParlato"
import { DettaglioFile } from "./DettaglioFile"
import { eFoto, nomeOrigine, nomeTipo, TIPI } from "./nomi"
import styles from "./Girato.module.css"

/** Un file senza scheda non si sa ancora cos'è: si tratta come «altro». */
const tipoDi = (f: FileGrezzo): TipoGrezzo => f.scheda?.tipo ?? "altro"

export function Girato({ file: scelto }: { file: string | undefined }) {
  const copia = useCopia(grezzo)
  const titoli = useCopia(elencoVideo).dato
  const [soloMaiUsati, setSoloMaiUsati] = useState(false)
  const [tipo, setTipo] = useState<TipoGrezzo | "">("")
  const [cerca, setCerca] = useState("")
  const istanteScritto = useIndirizzo().parametri.get("t")
  const secondi = istanteScritto === null ? NaN : Number(istanteScritto)
  const [erroreCartella, setErroreCartella] = useState<string | null>(null)
  const { voci, aggiungi, chiudi } = useAggiunte()
  // Come elemento nello stato: la pagina compare quando i dati arrivano, e la zona di rilascio deve agganciarsi allora.
  const [pagina, setPagina] = useState<HTMLDivElement | null>(null)
  const scelta = useRef<HTMLInputElement>(null)
  const areaDiRilascio = useRilascio(pagina, aggiungi)

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

  const bottoneAggiungi = (
    <Bottone onClick={() => scelta.current?.click()}>
      <Icona nome="piu" />
      {t("Aggiungi video", "Add video")}
    </Bottone>
  )
  const titoloDi = (slug: string) => titoli?.find((v) => v.slug === slug)?.scheda.titolo ?? t("un video", "a video")
  const apri = (f: FileGrezzo) => vai(scriviIndirizzo({ vista: "girato", parametri: { file: f.file } }))

  const cercando = staCercando(cerca)
  const elenco = (
    <div className={styles.elenco}>
      <RisultatiDelParlato valore={cerca} />
      {!cercando && (
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
      )}
      {tutti.length === 0 && (
        <>
          <Vuoto>{t("Nel girato non c'è ancora niente. Aggiungi un video dal computer, anche trascinandolo qui, oppure mandalo dal telefono.", "There is nothing in the footage yet. Add a video from your computer, even by dropping it here, or send it from your phone.")}</Vuoto>
          <div className={styles.azioni}>
            {bottoneAggiungi}
            <Bottone variante="vuoto" onClick={() => api.apri("grezzo").then(() => setErroreCartella(null), (e: Error) => setErroreCartella(e.message))}>
              <Icona nome="cartella" />
              {t("Apri la cartella del girato", "Open the footage folder")}
            </Bottone>
          </div>
          {erroreCartella && <Errore messaggio={erroreCartella} />}
        </>
      )}
      {!cercando && tutti.length > 0 && filtrati.length === 0 && <Vuoto>{t("Nessun file corrisponde ai filtri: toglili per vedere tutto il girato.", "No file matches the filters: remove them to see all the footage.")}</Vuoto>}
      {!cercando && filtrati.map((g) => (
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
                      {f.scheda && f.scheda.origine !== "altro" && <> · {t("da {origine}", "from {origine}", { origine: nomeOrigine(f.scheda.origine).toLowerCase() })}</>}
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
    <div className={styles.pagina} ref={setPagina}>
      <div className={styles.testata}>
        <h1>{t("Girato", "Footage")}</h1>
        <span className={styles.conto}>{pluralizza(tutti.length, t("file", "file"), t("file", "files"))}</span>
        {tutti.length > 0 && (
          <span className={styles.cerca}>
            <CampoCerca valore={cerca} onCambia={setCerca} />
          </span>
        )}
        {tutti.length > 0 && <span className={styles.aggiungi}>{bottoneAggiungi}</span>}
      </div>
      <input
        ref={scelta}
        type="file"
        multiple
        hidden
        accept="video/*,image/*,audio/*"
        aria-label={t("Scegli i video da aggiungere", "Choose the videos to add")}
        onChange={(e) => {
          aggiungi([...(e.target.files ?? [])])
          e.target.value = ""
        }}
      />
      <ElencoAggiunte voci={voci} onChiudi={chiudi} />
      <ZonaDiRilascio area={areaDiRilascio} />
      {!cercando && <ArriviDalTelefono />}
      {scelto && !aperto && <Vuoto>{t("Il file che cercavi non è nel girato: forse è stato spostato. Scegline un altro dall'elenco.", "The file you were looking for is not in the footage: it may have been moved. Pick another one from the list.")}</Vuoto>}
      <Colonne chiave="girato" fissa="seconda" iniziale={460} minimaFissa={300} minimaLibera={320} unaSolaSotto={900} sotto="impila" allinea="inizio" etichetta={t("Larghezza del dettaglio del file", "File detail width")} prima={elenco} seconda={aperto ? <DettaglioFile file={aperto} titoloDi={titoloDi} tempoIniziale={Number.isFinite(secondi) ? secondi : null} /> : <Vuoto>{t("Scegli un file dall'elenco per vederlo, leggerne il parlato e farne un video.", "Pick a file from the list to watch it, read its speech and make a video from it.")}</Vuoto>} />
    </div>
  )
}
