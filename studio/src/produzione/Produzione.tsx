// «Quanti video faccio, quanto lavoro in chat costano e cosa rendono?»: i conti del lavoro in chat (`docs/api/consumi.md`) accanto ai numeri del canale.
import { Gruppo } from "../comuni/Gruppo"
import { useState } from "react"
import { IntestazioneOrdinabile } from "../comuni/IntestazioneOrdinabile"
import { ProduzioneVuota } from "../comuni/PaginaVuota"
import { Caricamento, DatiVecchi, Errore, Vuoto } from "../comuni/Stati"
import { motoriChat } from "../chat/motore"
import { canaleTiktok, consumi, elencoVideo, useCopia } from "../dati"
import { scriviIndirizzo } from "../indirizzo"
import { localeInUso, t } from "../lingua"
import { cifra, dataOra, durata, numero, quantitaGrossa } from "../testo"
import { medie, motoriConTokenInParte, motoriSenzaToken, negliUltimiGiorni, ordinaRighe, piuLunghiERapidi, righeDellaProduzione, videoFatti, type CampoOrdine, type Medie, type RigaProduzione } from "./calcoli"
import styles from "./Produzione.module.css"

const periodi = (): Array<{ nome: string; giorni: number | null }> => [
  { nome: t("Ultima settimana", "Last week"), giorni: 7 },
  { nome: t("Ultimo mese", "Last month"), giorni: 30 },
  { nome: t("Da sempre", "All time"), giorni: null },
]

const colonneOrdinabili = (): Array<{ campo: CampoOrdine; nome: string }> => [
  { campo: "tempo", nome: t("Lavoro in chat", "Work in chat") },
  { campo: "visualizzazioni", nome: t("Visualizzazioni", "Views") },
  { campo: "minutiOgniMille", nome: t("Minuti ogni 1000 visualizzazioni", "Minutes per 1,000 views") },
]

/** La parte di ogni motore, se i motori che hanno lavorato sono più d'uno. */
function Parti({ motori, ordine, nomi }: { motori: Record<string, number>; ordine: string[]; nomi: Map<string, string> }) {
  const presenti = ordine.filter((id) => id in motori)
  if (presenti.length < 2) return null
  return <small className={styles.parti}>{presenti.map((id) => `${nomi.get(id) ?? id} ${durata(motori[id] ?? 0)}`).join(" · ")}</small>
}

interface Motori {
  ordine: string[]
  nomi: Map<string, string>
}

function RigaMedie({ nome, fatti, m, motori }: { nome: string; fatti: number; m: Medie | null; motori: Motori }) {
  const token = (valore: number | null) => (m === null || valore === null ? "—" : quantitaGrossa(valore))
  return (
    <tr>
      <th scope="row">{nome}</th>
      <td className={styles.num} data-etichetta={t("Video fatti", "Videos made")}>
        {numero(fatti)}
        {m !== null && m.senzaConti > 0 && <small>{t(" ({n} senza conti)", " ({n} without counts)", { n: numero(m.senzaConti) })}</small>}
      </td>
      <td className={styles.num} data-etichetta={t("Lavoro in chat", "Work in chat")}>
        {m === null ? "—" : durata(m.tempo)}
        {m !== null && <Parti motori={m.motori} ordine={motori.ordine} nomi={motori.nomi} />}
      </td>
      <td className={styles.num} data-etichetta={t("Scritti", "Written")}>
        {token(m?.scritti ?? null)}
      </td>
      <td className={styles.num} data-etichetta={t("Letti per la prima volta", "Read for the first time")}>
        {token(m?.nuovi ?? null)}
      </td>
      <td className={styles.num} data-etichetta={t("Riletti", "Re-read")}>
        {token(m?.riletti ?? null)}
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
    <Gruppo id="estremi" className={styles.sezione} titolo={t("I più lunghi e i più rapidi", "The longest and the quickest")}>
      <div className={styles.dueColonne}>
        {elenco("piu-lunghi", t("I più lunghi", "The longest"), lunghi)}
        {elenco("piu-rapidi", t("I più rapidi", "The quickest"), rapidi)}
      </div>
    </Gruppo>
  )
}

function CostoEResa({ righe, canaleSenzaLettura, motori }: { righe: RigaProduzione[]; canaleSenzaLettura: boolean; motori: Motori }) {
  const [ordine, setOrdine] = useState<{ campo: CampoOrdine; rovescio: boolean }>({ campo: "minutiOgniMille", rovescio: false })
  const ordinate = ordinaRighe(righe, ordine.campo, ordine.rovescio)
  const piuTempo = Math.max(...righe.map((r) => r.tempo), 0)
  const piuVisite = Math.max(...righe.map((r) => r.visualizzazioni ?? 0), 0)
  return (
    <Gruppo id="costo-e-resa" className={styles.sezione} titolo={t("Quanto costa e quanto rende", "What it costs and what it returns")}>
      <p className={styles.sotto}>
        {t("I minuti di lavoro in chat ogni 1000 visualizzazioni: meno sono, più il video ha reso per quanto è costato. In cima chi costa di più rispetto a quanto rende; chi non ha i numeri del canale sta in fondo.", "The minutes of work in chat per 1,000 views: the fewer, the more the video returned for what it cost. At the top, the ones that cost the most compared to what they return; those without channel numbers sit at the bottom.")}
        {canaleSenzaLettura && t(" Il canale non ha ancora nessuna lettura: chiedilo nella chat: «aggiorna i dati di TikTok».", " The channel has no read yet: ask in the chat: \"update the TikTok data\".")}
        {t(" Tocca l'intestazione di una colonna per ordinare.", " Tap a column header to sort.")}
      </p>
      <div className="scorri-con-segno">
        <table className={styles.tabella} aria-label={t("Quanto costa e quanto rende ogni video", "What each video costs and what it returns")}>
          <thead>
            <tr>
              <th scope="col">{t("Video", "Video")}</th>
              {colonneOrdinabili().map((c) => {
                const scelta = ordine.campo === c.campo
                const rovescio = scelta && ordine.rovescio
                return <IntestazioneOrdinabile key={c.campo} nome={c.nome} scelta={scelta} rovescio={rovescio} className={styles.num} onOrdina={() => setOrdine({ campo: c.campo, rovescio: scelta ? !rovescio : false })} />
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
                  <Parti motori={r.motori} ordine={motori.ordine} nomi={motori.nomi} />
                </td>
                <td className={styles.num}>
                  <span className={styles.misura}>
                    <Asta valore={r.visualizzazioni} massimo={piuVisite} />
                    <span className={styles.valoreMisura}>{cifra(r.visualizzazioni)}</span>
                  </span>
                </td>
                <td className={styles.num}>{cifra(r.minutiOgniMille, 1)}</td>
                <td className={`${styles.num} ${styles.secondaria}`}>{cifra(r.mi_piace)}</td>
                <td className={`${styles.num} ${styles.secondaria}`}>{cifra(r.nuovi_follower)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Gruppo>
  )
}

export function Produzione() {
  const elenco = useCopia(elencoVideo)
  const conti = useCopia(consumi)
  const canale = useCopia(canaleTiktok)
  const motoriDelServer = useCopia(motoriChat)
  if (elenco.errore && !elenco.dato) return <Errore messaggio={elenco.errore} onRiprova={() => void elencoVideo.rileggi()} />
  if (!elenco.caricato || !conti.caricato || !elenco.dato) return <Caricamento />
  if (conti.errore && !conti.dato) return <Errore messaggio={conti.errore} onRiprova={() => void consumi.rileggi()} />

  const fatti = videoFatti(elenco.dato)
  if (fatti.length === 0) return <ProduzioneVuota titolo={t("Produzione", "Production")} />
  const adesso = Date.now()
  const consumoPerVideo = conti.dato?.video ?? {}
  const righe = righeDellaProduzione(fatti, consumoPerVideo, canale.dato?.video ?? [])

  // I nomi dei motori li dà il server: finché non sono arrivati la pagina non li nomina.
  const elencoMotori = motoriDelServer.dato ?? []
  const nomi = new Map(elencoMotori.map((m) => [m.id, m.nome]))
  const contati = conti.dato?.contati ?? []
  const elencaI = (nomiDei: string[]): string => new Intl.ListFormat(localeInUso(), { type: "conjunction" }).format(nomiDei)
  const chiNonContato = elencaI(elencoMotori.flatMap((m) => (m.nelle_frasi === null || contati.includes(m.id) ? [] : [m.nelle_frasi])))
  const contiDeiFatti = fatti.flatMap((f) => consumoPerVideo[f.slug] ?? [])
  const nomiDei = (ids: string[]): string => elencaI(ids.flatMap((id) => nomi.get(id) ?? []))
  const chiSenzaToken = nomiDei(motoriSenzaToken(contiDeiFatti))
  const chiConTokenInParte = nomiDei(motoriConTokenInParte(contiDeiFatti))
  const motori: Motori = { ordine: motoriDelServer.dato === null ? [] : contati, nomi }
  return (
    <div className={styles.pagina}>
      <DatiVecchi errore={canale.dato ? canale.errore : null} dal={canale.dato?.ultima ? dataOra(canale.dato.ultima.quando) : undefined} onRiprova={() => void canaleTiktok.rileggi()} />
      <header>
        <h1>{t("Produzione", "Production")}</h1>
        <p className={styles.sotto}>
          {t(
            "Quanti video fai, quanto lavoro in chat costano e cosa rendono. Un video conta come fatto quando è pronto o pubblicato: la data è quella della prima uscita, o dell'ultima modifica se non è ancora uscito. Il lavoro in chat è quello di tutte le conversazioni su quel video, anche quelle del terminale e, per Claude, dei suoi aiutanti; una richiesta che tocca più video conta per quello su cui si è lavorato di più.",
            "How many videos you make, how much work in chat they cost and what they return. A video counts as made when it is ready or published: the date is the first release, or the last change if it is not out yet. Work in chat is that of all conversations on that video, including those in the terminal and, for Claude, its helpers; a request that touches several videos counts for the one that was worked on the most.",
          )}
        </p>
        {conti.dato?.pronto === false && <p className={styles.avviso}>{t("Sto ancora leggendo le conversazioni in chat: i conti sono parziali e cresceranno.", "I am still reading the chat conversations: the counts are partial and will grow.")}</p>}
      </header>

      <>
        <Gruppo id="quanti" className={styles.sezione} titolo={t("Quanti video e quanto lavoro", "How many videos and how much work")}>
          <div className="scorri-con-segno">
            <table className={`${styles.tabella} ${styles.impilata}`} aria-label={t("La media di un video, per periodo", "The average of a video, by period")}>
              <thead>
                <tr>
                  <th scope="col">{t("Periodo", "Period")}</th>
                  <th scope="col" className={styles.num}>
                    {t("Video fatti", "Videos made")}
                  </th>
                  <th scope="col" className={styles.num}>
                    {t("Lavoro in chat", "Work in chat")}
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
                  return <RigaMedie key={p.nome} nome={p.nome} fatti={dentro.length} m={medie(dentro, consumoPerVideo)} motori={motori} />
                })}
              </tbody>
            </table>
          </div>
          <p className={styles.sotto}>
            {t("Lavoro e conteggi sono la media di un video, sui video di cui c'è un conto. I conteggi sono «token», pezzi di testo grosso modo come sillabe.", "Work and counts are the average of one video, over the videos that have a count. The counts are \"tokens\", pieces of text roughly like syllables.")}
            {chiSenzaToken !== "" && ` ${t("Per {chi} i token non si conoscono: i conteggi sono quelli degli altri motori.", "Tokens are not known for {chi}: the counts are those of the other engines.", { chi: chiSenzaToken })}`}
            {chiConTokenInParte !== "" && ` ${t("I token di {chi} sono quelli dei giri fatti con l'app accesa: dei giri fatti dal terminale non si conoscono.", "The tokens of {chi} are those of the turns made while the app was on: turns made from the terminal have none.", { chi: chiConTokenInParte })}`}
            {chiNonContato !== "" && ` ${t("Il lavoro fatto con {chi} non è contato.", "Work done with {chi} is not counted.", { chi: chiNonContato })}`}
          </p>
        </Gruppo>

        {righe.length === 0 ? <Vuoto>{t("Nessuna conversazione in chat ha lavorato sui video fatti: non ci sono ancora conti da confrontare.", "No chat conversation has worked on the videos made: there are no counts to compare yet.")}</Vuoto> : (
          <>
            <Estremi righe={righe} />
            <CostoEResa righe={righe} canaleSenzaLettura={canale.dato?.ultima === null} motori={motori} />
          </>
        )}
      </>
    </div>
  )
}
