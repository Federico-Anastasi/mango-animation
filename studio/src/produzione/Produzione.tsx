// «Quanti video faccio, quanto lavoro di Claude costano e cosa rendono?»: i conti di Claude (`docs/API.md`, «Consumi») accanto ai numeri del canale.
import { useState } from "react"
import { ProduzioneVuota } from "../comuni/PaginaVuota"
import { Caricamento, Errore, Vuoto } from "../comuni/Stati"
import { canaleTiktok, consumi, elencoVideo, useCopia } from "../dati"
import { scriviIndirizzo } from "../indirizzo"
import { t } from "../lingua"
import { durata, numero, quantitaGrossa } from "../testo"
import { medie, negliUltimiGiorni, ordinaRighe, piuLunghiERapidi, righeDellaProduzione, videoFatti, type CampoOrdine, type Medie, type RigaProduzione } from "./calcoli"
import styles from "./Produzione.module.css"

const periodi = (): Array<{ nome: string; giorni: number | null }> => [
  { nome: t("Ultima settimana", "Last week"), giorni: 7 },
  { nome: t("Ultimo mese", "Last month"), giorni: 30 },
  { nome: t("Da sempre", "All time"), giorni: null },
]

const colonneOrdinabili = (): Array<{ campo: CampoOrdine; nome: string }> => [
  { campo: "tempo", nome: t("Lavoro di Claude", "Claude's work") },
  { campo: "visualizzazioni", nome: t("Visite", "Views") },
  { campo: "minutiOgniMille", nome: t("Minuti ogni 1000 visite", "Minutes per 1,000 views") },
]

const mille = (n: number | null) => (n === null ? "—" : numero(n, 1))
const cifra = (n: number | null) => (n === null ? "—" : numero(n))

function RigaMedie({ nome, fatti, m }: { nome: string; fatti: number; m: Medie | null }) {
  return (
    <tr>
      <th scope="row">{nome}</th>
      <td className={styles.num} data-etichetta={t("Video fatti", "Videos made")}>
        {numero(fatti)}
        {m !== null && m.senzaConti > 0 && <small>{t(" ({n} senza conti)", " ({n} without counts)", { n: numero(m.senzaConti) })}</small>}
      </td>
      <td className={styles.num} data-etichetta={t("Lavoro di Claude", "Claude's work")}>
        {m === null ? "—" : durata(m.tempo)}
      </td>
      <td className={styles.num} data-etichetta={t("Scritti", "Written")}>
        {m === null ? "—" : quantitaGrossa(m.scritti)}
      </td>
      <td className={styles.num} data-etichetta={t("Letti per la prima volta", "Read for the first time")}>
        {m === null ? "—" : quantitaGrossa(m.nuovi)}
      </td>
      <td className={styles.num} data-etichetta={t("Riletti", "Re-read")}>
        {m === null ? "—" : quantitaGrossa(m.riletti)}
      </td>
    </tr>
  )
}

function Asta({ valore, massimo }: { valore: number | null; massimo: number }) {
  return (
    <span className={styles.pista} aria-hidden="true">
      <span className={styles.asta} style={{ width: `${massimo > 0 && valore !== null ? (valore / massimo) * 100 : 0}%` }} />
    </span>
  )
}

const collegamento = (r: RigaProduzione) => (
  <a href={scriviIndirizzo({ vista: "video", slug: r.slug, scheda: "scheda" })}>{r.titolo}</a>
)

function Estremi({ righe }: { righe: RigaProduzione[] }) {
  const quanti = Math.min(3, Math.floor(righe.length / 2))
  if (quanti === 0) return null
  const { lunghi, rapidi } = piuLunghiERapidi(righe, quanti)
  const elenco = (id: string, nome: string, voci: RigaProduzione[]) => (
    <div>
      <h3 id={id}>{nome}</h3>
      <ol className={styles.estremi} aria-labelledby={id}>
        {voci.map((r) => (
          <li key={r.slug}>
            {collegamento(r)}
            <span className={styles.tempo}>{durata(r.tempo)}</span>
          </li>
        ))}
      </ol>
    </div>
  )
  return (
    <section className={styles.sezione} aria-labelledby="estremi">
      <h2 id="estremi">{t("I più lunghi e i più rapidi", "The longest and the quickest")}</h2>
      <div className={styles.dueColonne}>
        {elenco("piu-lunghi", t("I più lunghi", "The longest"), lunghi)}
        {elenco("piu-rapidi", t("I più rapidi", "The quickest"), rapidi)}
      </div>
    </section>
  )
}

function CostoEResa({ righe, canaleLetto }: { righe: RigaProduzione[]; canaleLetto: boolean }) {
  const [ordine, setOrdine] = useState<{ campo: CampoOrdine; rovescio: boolean }>({ campo: "minutiOgniMille", rovescio: false })
  const ordinate = ordinaRighe(righe, ordine.campo, ordine.rovescio)
  const piuTempo = Math.max(...righe.map((r) => r.tempo), 0)
  const piuVisite = Math.max(...righe.map((r) => r.visualizzazioni ?? 0), 0)
  return (
    <section className={styles.sezione} aria-labelledby="costo-e-resa">
      <h2 id="costo-e-resa">{t("Quanto costa e quanto rende", "What it costs and what it returns")}</h2>
      <p className={styles.sotto}>
        {t("I minuti di lavoro di Claude ogni 1000 visualizzazioni: meno sono, più il video ha reso per quanto è costato. In cima chi costa di più rispetto a quanto rende; chi non ha i numeri del canale sta in fondo.", "The minutes of Claude's work per 1,000 views: the fewer, the more the video returned for what it cost. At the top, the ones that cost the most compared to what they return; those without channel numbers sit at the bottom.")}
        {!canaleLetto && t(" Il canale non ha ancora nessuna lettura: chiedilo nella chat: «aggiorna i dati di TikTok».", " The channel has no read yet: ask in the chat: \"update the TikTok data\".")}
        {t(" Tocca l'intestazione di una colonna per ordinare.", " Tap a column header to sort.")}
      </p>
      <div className={styles.scorri}>
        <table className={styles.tabella} aria-label={t("Quanto costa e quanto rende ogni video", "What each video costs and what it returns")}>
          <thead>
            <tr>
              <th scope="col">{t("Video", "Video")}</th>
              {colonneOrdinabili().map((c) => {
                const scelta = ordine.campo === c.campo
                const rovescio = scelta && ordine.rovescio
                return (
                  <th key={c.campo} scope="col" className={styles.num} aria-sort={scelta ? (rovescio ? "ascending" : "descending") : "none"}>
                    <button type="button" className={styles.ordinaColonna} onClick={() => setOrdine({ campo: c.campo, rovescio: scelta ? !rovescio : false })}>
                      {c.nome}
                      {scelta && <span aria-hidden="true"> {rovescio ? "↑" : "↓"}</span>}
                    </button>
                  </th>
                )
              })}
              <th scope="col" className={`${styles.num} ${styles.secondaria}`}>
                {t("Mi piace", "Likes")}
              </th>
              <th scope="col" className={`${styles.num} ${styles.secondaria}`}>
                {t("Nuovi follower", "New followers")}
              </th>
            </tr>
          </thead>
          <tbody>
            {ordinate.map((r) => (
              <tr key={r.slug}>
                <td className={styles.titolo}>{collegamento(r)}</td>
                <td className={styles.num}>
                  <span className={styles.misura}>
                    <Asta valore={r.tempo} massimo={piuTempo} />
                    <span className={styles.valoreMisura}>{durata(r.tempo)}</span>
                  </span>
                </td>
                <td className={styles.num}>
                  <span className={styles.misura}>
                    <Asta valore={r.visualizzazioni} massimo={piuVisite} />
                    <span className={styles.valoreMisura}>{cifra(r.visualizzazioni)}</span>
                  </span>
                </td>
                <td className={styles.num}>{mille(r.minutiOgniMille)}</td>
                <td className={`${styles.num} ${styles.secondaria}`}>{cifra(r.mi_piace)}</td>
                <td className={`${styles.num} ${styles.secondaria}`}>{cifra(r.nuovi_follower)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function Produzione() {
  const elenco = useCopia(elencoVideo)
  const conti = useCopia(consumi)
  const canale = useCopia(canaleTiktok)
  if (elenco.errore && !elenco.dato) return <Errore messaggio={elenco.errore} onRiprova={() => void elencoVideo.rileggi()} />
  if (!elenco.caricato || !conti.caricato || !elenco.dato) return <Caricamento />
  if (conti.errore && !conti.dato) return <Errore messaggio={conti.errore} onRiprova={() => void consumi.rileggi()} />

  const fatti = videoFatti(elenco.dato)
  if (fatti.length === 0) return <ProduzioneVuota titolo={t("Produzione", "Production")} />
  const adesso = Date.now()
  const consumoPerVideo = conti.dato?.video ?? {}
  const righe = righeDellaProduzione(fatti, consumoPerVideo, canale.dato?.video ?? [])
  return (
    <div className={styles.pagina}>
      <header>
        <h1>{t("Produzione", "Production")}</h1>
        <p className={styles.sotto}>
          {t("Quanti video fai, quanto lavoro di Claude costano e cosa rendono. Un video conta come fatto quando è pronto o pubblicato: la data è quella della prima uscita, o dell'ultima modifica se non è ancora uscito. Il lavoro di Claude è quello di tutte le sue conversazioni su quel video (come si conta è scritto nella scheda di ogni video).", "How many videos you make, how much of Claude's work they cost and what they return. A video counts as made when it is ready or published: the date is the first release, or the last change if it is not out yet. Claude's work is that of all its conversations on that video (how it is counted is written in each video's card).")}
        </p>
        {conti.dato?.pronto === false && <p className={styles.avviso}>{t("Sto ancora leggendo le conversazioni di Claude: i conti sono parziali e cresceranno.", "I am still reading Claude's conversations: the counts are partial and will grow.")}</p>}
      </header>

      <>
        <section className={styles.sezione} aria-labelledby="quanti">
          <h2 id="quanti">{t("Quanti video e quanto lavoro", "How many videos and how much work")}</h2>
          <div className={styles.scorri}>
            <table className={`${styles.tabella} ${styles.impilata}`} aria-label={t("La media di un video, per periodo", "The average of a video, by period")}>
              <thead>
                <tr>
                  <th scope="col">{t("Periodo", "Period")}</th>
                  <th scope="col" className={styles.num}>
                    {t("Video fatti", "Videos made")}
                  </th>
                  <th scope="col" className={styles.num}>
                    {t("Lavoro di Claude", "Claude's work")}
                  </th>
                  <th scope="col" className={styles.num}>
                    {t("Scritti", "Written")}
                  </th>
                  <th scope="col" className={styles.num}>
                    {t("Letti per la prima volta", "Read for the first time")}
                  </th>
                  <th scope="col" className={styles.num}>
                    {t("Riletti", "Re-read")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {periodi().map((p) => {
                  const dentro = p.giorni === null ? fatti : negliUltimiGiorni(fatti, p.giorni, adesso)
                  return <RigaMedie key={p.nome} nome={p.nome} fatti={dentro.length} m={medie(dentro, consumoPerVideo)} />
                })}
              </tbody>
            </table>
          </div>
          <p className={styles.sotto}>{t("Lavoro e conteggi sono la media di un video, sui video di cui Claude ha un conto. I conteggi sono «token», pezzi di testo grosso modo come sillabe. Il lavoro fatto con Mango Code non è contato.", "Work and counts are the average of one video, over the videos Claude has a count for. The counts are \"tokens\", pieces of text roughly like syllables. Work done with Mango Code is not counted.")}</p>
        </section>

        {righe.length === 0 ? <Vuoto>{t("Nessuna conversazione di Claude ha lavorato sui video fatti: non ci sono ancora conti da confrontare.", "No Claude conversation has worked on the videos made: there are no counts to compare yet.")}</Vuoto> : (
          <>
            <Estremi righe={righe} />
            <CostoEResa righe={righe} canaleLetto={canale.dato?.ultima != null} />
          </>
        )}
      </>
    </div>
  )
}
