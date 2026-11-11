import { useEffect, useRef, useState } from "react"
import { api, urlMedia } from "../api"
import { CampoTesto } from "../comuni/CampoTesto"
import { Caricamento, Errore, Vuoto } from "../comuni/Stati"
import { scriviIndirizzo } from "../indirizzo"
import { t } from "../lingua"
import { dataOra, durata, giorno, peso, tempoLeggibile } from "../testo"
import type { FileGrezzo, OrigineGrezzo, ParolaGrezzo, SchedaGrezzo, TipoGrezzo } from "../tipi"
import { eFoto, nomeOrigine, nomeTipo, ORIGINI, siApreNelBrowser, TIPI } from "./nomi"
import styles from "./DettaglioFile.module.css"

/** Le parole in righe: una riga nuova dove il parlato si ferma per più di un secondo. */
function inRighe(parole: ParolaGrezzo[]): ParolaGrezzo[][] {
  return parole.reduce<ParolaGrezzo[][]>((righe, p) => {
    const ultima = righe[righe.length - 1]
    const precedente = ultima?.[ultima.length - 1]
    if (!ultima || !precedente || p.da - precedente.a > 1) righe.push([p])
    else ultima.push(p)
    return righe
  }, [])
}

export function DettaglioFile({ file, titoloDi, tempoIniziale = null }: { file: FileGrezzo; titoloDi: (slug: string) => string; tempoIniziale?: number | null }) {
  const radice = useRef<HTMLDivElement>(null)
  const lettore = useRef<HTMLVideoElement>(null)
  const [parole, setParole] = useState<ParolaGrezzo[] | null>(null)
  const [erroreParole, setErroreParole] = useState<string | null>(null)
  const [erroreScheda, setErroreScheda] = useState<string | null>(null)
  const [illeggibile, setIlleggibile] = useState(false)
  const nome = file.nome
  const preparato = file.preparato
  const scheda = file.scheda ?? { tipo: "altro" as const, origine: "altro" as const }
  const eUnaFoto = eFoto(nome)
  const immagine = preparato.foto ?? (siApreNelBrowser(nome) ? `grezzo/${file.file}` : preparato.miniatura)
  // Un file senza traccia audio non ha livello della voce né parole: la sua preparazione finisce con la copia leggera, e `onda` non c'è mai.
  const senzaAudio = preparato.onda === null && preparato.leggero !== null
  const completo = Boolean(preparato.leggero && preparato.miniatura && (senzaAudio || (preparato.parole && preparato.onda)))

  useEffect(() => {
    setParole(null)
    setErroreParole(null)
    setErroreScheda(null)
    setIlleggibile(false)
    if (preparato.parole === null) return
    let vivo = true
    api.paroleGrezzo(file.file).then(
      (p) => vivo && setParole(p),
      (e: Error) => vivo && setErroreParole(e.message),
    )
    return () => {
      vivo = false
    }
  }, [file.file, preparato.parole, preparato.leggero])

  // Aperto da un risultato della ricerca nel parlato: il lettore va a quel secondo e il dettaglio torna in vista.
  useEffect(() => {
    const el = lettore.current
    if (tempoIniziale === null || !el) return
    radice.current?.scrollIntoView?.({ block: "start" })
    const vaiA = () => void (el.currentTime = tempoIniziale)
    if (el.readyState >= 1) vaiA()
    else el.addEventListener("loadedmetadata", vaiA, { once: true })
    return () => el.removeEventListener("loadedmetadata", vaiA)
  }, [file.file, tempoIniziale])

  const salvaScheda = (nuova: SchedaGrezzo) => api.scriviSchedaGrezzo(file.file, nuova).then(() => undefined)
  const vaiA = (secondi: number) => {
    if (lettore.current) lettore.current.currentTime = secondi
  }
  const cambia = (nuova: SchedaGrezzo) => {
    setErroreScheda(null)
    salvaScheda(nuova).catch((e: Error) => setErroreScheda(e.message))
  }

  return (
    <div className={styles.dettaglio} ref={radice}>
      <h2 className={styles.nome}>{nome}</h2>
      <p className={styles.meta}>
        {t("Girato il {data}", "Filmed on {data}", { data: giorno(file.file.split("/")[0] ?? "") })} · {peso(file.byte)}
        {file.scheda?.durata !== undefined && <> · {durata(file.scheda.durata)}</>}
        {file.scheda?.largo && file.scheda.alto && <> · {file.scheda.largo}×{file.scheda.alto}</>}
        {file.scheda?.arrivato && <> · {t("arrivato il {data}", "arrived on {data}", { data: dataOra(file.scheda.arrivato) })}</>}
        {!file.scheda && file.scheda_problemi.length === 0 && <> · {t("sto ancora leggendo il file", "still reading the file")}</>}
      </p>
      {file.scheda_problemi.length > 0 && <Errore messaggio={t("La scheda di questo file ha un errore: chiedi nella chat di sistemarla.", "This file's card has an error: ask in the chat to fix it.") + (file.scheda ? t(" Qui vedi l'ultima scheda valida.", " Here you see the last valid card.") : "")} dettaglio={file.scheda_problemi} />}

      {eUnaFoto ? (
        immagine && !illeggibile ? (
          <img key={immagine} className={styles.foto} src={urlMedia(immagine)} alt={nome} onError={() => setIlleggibile(true)} />
        ) : (
          <Vuoto>{t("La foto non è ancora pronta. Se non compare, chiedi nella chat di prepararla.", "The photo is not ready yet. If it does not appear, ask in the chat to prepare it.")}</Vuoto>
        )
      ) : illeggibile ? (
        <Vuoto>{t("Questo file non si apre qui così com'è: preparato, ne viene una copia che si guarda qui.", "This file cannot be opened here as it is: once prepared, a copy is made that can be watched here.")}</Vuoto>
      ) : (
        <video
          ref={lettore}
          key={`${file.file}|${preparato.leggero}`}
          className={styles.lettore}
          src={urlMedia(preparato.leggero ?? `grezzo/${file.file}`)}
          controls
          preload="metadata"
          onError={() => setIlleggibile(true)}
        />
      )}

      <div className={styles.azioni}>
        {eUnaFoto ? (
          <span className={styles.meta}>{t("Per usarla in un video o in un carosello, chiedilo nella chat.", "To use it in a video or a carousel, ask in the chat.")}</span>
        ) : (
          <>
            {!completo && <span className={styles.meta}>{t("Non ancora preparato.", "Not prepared yet.")}</span>}
            {completo ? <span className={styles.meta}>{t("Per farne un video nuovo, chiedilo nella chat.", "To make a new video from it, ask in the chat.")}</span> : <span className={styles.meta}>{t("Per preparare questo file o farne un video nuovo, chiedilo nella chat.", "To prepare this file or make a new video from it, ask in the chat.")}</span>}
          </>
        )}
      </div>
      {erroreScheda && (
        <p className={styles.errore} role="alert">
          {erroreScheda}
        </p>
      )}

      <div className={styles.coppia}>
        {!eUnaFoto && (
          <label className={styles.campoSelect}>
            <span>{t("Tipo", "Type")}</span>
            <select value={scheda.tipo} onChange={(e) => cambia({ ...scheda, tipo: e.target.value as TipoGrezzo })}>
              {TIPI.map((tp) => (
                <option key={tp} value={tp}>
                  {nomeTipo(tp)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className={styles.campoSelect}>
          <span>{t("Da dove viene", "Where it comes from")}</span>
          <select value={scheda.origine} onChange={(e) => cambia({ ...scheda, origine: e.target.value as OrigineGrezzo })}>
            {ORIGINI.map((o) => (
              <option key={o} value={o}>
                {nomeOrigine(o)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <CampoTesto etichetta={t("Note su questo file", "Notes on this file")} valore={scheda.note ?? ""} onSalva={(n) => salvaScheda({ ...scheda, note: n })} />

      <section>
        <h3>{t("Dove è usato", "Where it is used")}</h3>
        {file.usato_in.length === 0 ? (
          <p className={styles.meta}>{t("Non è usato in nessun video.", "It is not used in any video.")}</p>
        ) : (
          <ul className={styles.usi}>
            {file.usato_in.map((slug) => (
              <li key={slug}>
                <a href={scriviIndirizzo({ vista: "video", slug })}>{titoloDi(slug)}</a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!eUnaFoto && (
        <section>
          <h3>{t("Il parlato", "The speech")}</h3>
          {senzaAudio && <p className={styles.meta}>{t("Il file non ha audio: non c'è parlato da trascrivere.", "This file has no audio, so there is no speech to transcribe.")}</p>}
          {preparato.parole === null && !senzaAudio && <p className={styles.meta}>{t("Il parlato non è stato ancora trascritto: preparando il file compare qui, con i tempi.", "The speech has not been transcribed yet: once the file is prepared it appears here, with timings.")}</p>}
          {preparato.parole !== null && erroreParole && <p className={styles.errore}>{erroreParole}</p>}
          {preparato.parole !== null && !erroreParole && parole === null && <Caricamento />}
          {parole && parole.length === 0 && <p className={styles.meta}>{t("In questo file non c'è parlato.", "There is no speech in this file.")}</p>}
          {parole && parole.length > 0 && (
            <ol className={styles.parlato}>
              {inRighe(parole).map((riga) => (
                <li key={riga[0]!.da}>
                  <button
                    type="button"
                    className={styles.tempo}
                    disabled={illeggibile}
                    onClick={() => vaiA(riga[0]!.da)}
                  >
                    {tempoLeggibile(riga[0]!.da)}
                  </button>
                  <span>
                    {riga.map((p, i) => (
                      <button
                        key={i}
                        type="button"
                        className={styles.parola}
                        disabled={illeggibile}
                        onClick={() => vaiA(p.da)}
                      >
                        {p.p}
                      </button>
                    ))}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </div>
  )
}
