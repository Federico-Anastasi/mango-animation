// «Dove sono, dove devo arrivare, e come?»: la strategia del canale scritta in archivio, messa accanto alle letture vere.
import { api } from "../api"
import { PaginaDiCanaleVuota } from "../comuni/PaginaVuota"
import { Caricamento, Errore } from "../comuni/Stati"
import { Tessera, Tessere } from "../comuni/Tessere"
import { canaleTiktok, creaCopia, elencoVideo, useCopia } from "../dati"
import { t } from "../lingua"
import { data, dataOra, numero } from "../testo"
import type { Crescita as DatiCrescita, CrescitaCanale, PuntoAndamento, StatoCanale } from "../tipi"
import { GIORNO, inSecondi, nomeGiorno, percorso, perTipo, serie, settimana, ultimiGiorni, type Punto } from "./calcoli"
import { Grafico, type Etichetta } from "./Grafico"
import styles from "./Crescita.module.css"

const CANALE = "tiktok"
const delCanale = (e: { tipo: string }) => e.tipo === "canale"
const crescita = creaCopia<CrescitaCanale>(() => api.crescitaCanale(CANALE), delCanale)
const andamento = creaCopia<PuntoAndamento[]>(() => api.andamentoCanale(CANALE), delCanale)

/** Le tappe si chiamano per distanza dalla partenza: «3 mesi», «1 anno». */
function distanza(da: number, a: number): string {
  const mesi = Math.round((a - da) / (30.44 * GIORNO))
  if (mesi % 12 !== 0) return t("{n} mesi", "{n} months", { n: mesi })
  return mesi === 12 ? t("1 anno", "1 year") : t("{n} anni", "{n} years", { n: mesi / 12 })
}

const conSegno = (n: number) => `${n >= 0 ? "+" : "−"}${numero(Math.abs(n))}`
const percento = (quota: number) => (quota > 0 && quota < 0.01 ? t("meno dell'1%", "less than 1%") : `${numero(Math.round(quota * 100))}%`)

function Settimana({ piano, punti }: { piano: DatiCrescita; punti: PuntoAndamento[] }) {
  const s = settimana(punti, piano, Date.now())
  const avanzamento = s.fatti !== null && s.obiettivo ? Math.min(Math.max(s.fatti / s.obiettivo, 0), 1) : null
  return (
    <section className={styles.sezione} aria-labelledby="settimana">
      <h2 id="settimana">{t("Questa settimana", "This week")}</h2>
      <p className={styles.sotto}>
        {t("Dal lunedì {inizio}. Ultima lettura del canale: {ultima}.", "Since Monday {inizio}. Last channel read: {ultima}.", {
          inizio: data(inSecondi(s.inizio)),
          ultima: s.ultimaLettura === null ? t("nessuna", "none") : dataOra(inSecondi(s.ultimaLettura)),
        })}
      </p>
      <Tessere>
        <Tessera valore={s.obiettivo === null ? "—" : `+${numero(s.obiettivo)}`} nome={t("follower da guadagnare", "followers to gain")} nota={t("scenario {nome}", "scenario {nome}", { nome: piano.obiettivo })} />
        <Tessera valore={s.alControllo ? `+${numero(s.alControllo.follower)}` : "—"} nome={s.alControllo ? t("entro {giorno} sera", "by {giorno} evening", { giorno: nomeGiorno(s.alControllo.giorno) }) : t("nessun controllo a metà settimana", "no mid-week check")} nota={t("il controllo a metà settimana", "the mid-week check")} />
        <Tessera valore={s.fatti === null ? "—" : conSegno(s.fatti)} nome={t("guadagnati finora", "gained so far")} nota={s.fatti === null ? t("nessuna lettura copre il lunedì: lo dirà la prossima", "no read covers Monday: the next one will tell") : undefined} />
      </Tessere>
      {avanzamento !== null && (
        <div className={styles.barra} role="meter" aria-valuemin={0} aria-valuemax={s.obiettivo ?? 0} aria-valuenow={s.fatti ?? 0} aria-label={t("Follower della settimana rispetto all'obiettivo", "This week's followers against the goal")}>
          <span style={{ width: `${avanzamento * 100}%` }} />
        </div>
      )}
      <ol className={styles.giorni}>
        {piano.settimana.map((g) => (
          <li key={g.giorno} className={g.controllo ? styles.controllo : undefined}>
            <span className={styles.giorno}>{nomeGiorno(g.giorno)}</span>
            <span>{g.cosa}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function DoveAndare({ piano, vere }: { piano: DatiCrescita; vere: Punto[] }) {
  const strade = piano.scenari.map((s) => ({ nome: s.nome, punti: percorso(piano, s.nome) }))
  const scelta = strade.find((s) => s.nome === piano.obiettivo)!
  const altre = strade.filter((s) => s !== scelta)
  const fine = Math.max(...strade.flatMap((s) => s.punti.map((p) => p.t)))
  const inizio = vere[0]?.t ?? scelta.punti[0]!.t
  const partenza = scelta.punti[0]!.t
  const piuBassa = altre.reduce((a, b) => (a.punti[a.punti.length - 1]!.follower <= b.punti[b.punti.length - 1]!.follower ? a : b), scelta)
  const piuAlta = altre.reduce((a, b) => (a.punti[a.punti.length - 1]!.follower >= b.punti[b.punti.length - 1]!.follower ? a : b), scelta)
  const finali: Etichetta[] = strade.map((s) => {
    const ultima = s.punti[s.punti.length - 1]!
    return { t: ultima.t, follower: ultima.follower, testo: `${s.nome} ${numero(ultima.follower)}` }
  })
  const tappe: Etichetta[] = scelta.punti.slice(1, -1).map((p) => ({ t: p.t, follower: p.follower, testo: `${distanza(partenza, p.t)}: ${numero(p.follower)}` }))
  const date = scelta.punti.slice(1).map((p) => p.t)

  return (
    <section className={styles.sezione} aria-labelledby="dove-andare">
      <h2 id="dove-andare">{t("Dove andare", "Where to go")}</h2>
      <p className={styles.sotto}>
        {t("La linea blu è lo scenario {obiettivo}, quello su cui si misurano le settimane; la fascia va dal {basso} all'{alto}.", "The blue line is the {obiettivo} scenario, the one the weeks are measured against; the band runs from the {basso} to the {alto}.", {
          obiettivo: piano.obiettivo,
          basso: piuBassa.nome,
          alto: piuAlta.nome,
        })}
      </p>
      <Grafico
        descrizione={t("Follower: le letture vere e i tre scenari fino al {data}", "Followers: the real reads and the three scenarios up to {data}", { data: data(inSecondi(fine)) })}
        da={inizio}
        a={fine}
        fascia={{ sotto: piuBassa.punti, sopra: piuAlta.punti }}
        linee={[
          { nome: t("scenario {nome}", "scenario {nome}", { nome: scelta.nome }), punti: scelta.punti, tipo: "obiettivo" },
          { nome: t("letture", "reads"), punti: vere, tipo: "vera" },
        ]}
        etichette={[...tappe, ...finali]}
      />
      <table className={styles.tabella}>
        <caption>{t("Le tappe, in follower", "The milestones, in followers")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("scenario", "scenario")}</th>
            {date.map((quando) => (
              <th key={quando} scope="col">
                {distanza(partenza, quando)}
                <small>{data(inSecondi(quando))}</small>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {strade.map((s) => (
            <tr key={s.nome} className={s === scelta ? styles.scelta : undefined}>
              <th scope="row">{s.nome}</th>
              {date.map((quando) => {
                const tappa = s.punti.find((p) => p.t === quando)
                return <td key={quando}>{tappa ? numero(tappa.follower) : "—"}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function DaDoveVieni({ piano, vere, punti, stato }: { piano: DatiCrescita; vere: Punto[]; punti: PuntoAndamento[]; stato: StatoCanale | null }) {
  const titoli = useCopia(elencoVideo).dato
  const scelta = percorso(piano, piano.obiettivo)
  const ultima = vere[vere.length - 1]
  if (!ultima || vere.length < 2) return null
  const fine = ultima.t + 28 * GIORNO
  const settimanaFa = ultimiGiorni(punti, 7)
  const piuVisti = [...(stato?.video ?? [])]
    .filter((v) => v.pubblicato && v.visualizzazioni !== undefined)
    .sort((a, b) => b.visualizzazioni! - a.visualizzazioni!)
    .slice(0, 2)
    .map((v) => ({ t: new Date(v.pubblicato!).getTime(), testo: titoli?.find((x) => x.slug === v.slug)?.scheda.titolo ?? t("video del {data}", "video of {data}", { data: data(v.pubblicato!) }) }))

  return (
    <section className={styles.sezione} aria-labelledby="da-dove-vieni">
      <h2 id="da-dove-vieni">{t("Da dove vieni", "Where you come from")}</h2>
      <Tessere>
        <Tessera valore={numero(ultima.follower)} nome={t("follower", "followers")} nota={t("lettura del {quando}", "read on {quando}", { quando: dataOra(inSecondi(ultima.t)) })} />
        <Tessera valore={settimanaFa === null ? "—" : conSegno(Math.round(settimanaFa))} nome={t("negli ultimi 7 giorni", "in the last 7 days")} />
        <Tessera valore={numero(Math.round(((ultima.follower - vere[0]!.follower) * 7 * GIORNO) / (ultima.t - vere[0]!.t)))} nome={t("follower a settimana", "followers per week")} nota={t("in media dal {data}", "on average since {data}", { data: data(inSecondi(vere[0]!.t)) })} />
      </Tessere>
      <p className={styles.sotto}>{t("Le letture vere, e la strada dello scenario {obiettivo} per le prossime quattro settimane. Una riga verticale segna l'uscita di uno dei due video più visti.", "The real reads, and the path of the {obiettivo} scenario for the next four weeks. A vertical line marks the release of one of the two most watched videos.", { obiettivo: piano.obiettivo })}</p>
      <Grafico
        descrizione={t("Follower letti nel tempo, con lo scenario scelto per le prossime quattro settimane", "Followers read over time, with the chosen scenario for the next four weeks")}
        da={vere[0]!.t}
        a={fine}
        linee={[
          { nome: t("letture", "reads"), punti: vere, tipo: "vera" },
          { nome: t("scenario {nome}", "scenario {nome}", { nome: piano.obiettivo }), punti: scelta, tipo: "obiettivo" },
        ]}
        note={piuVisti}
        etichette={[{ t: ultima.t, follower: ultima.follower, testo: t("oggi {n}", "today {n}", { n: numero(ultima.follower) }) }]}
      />
    </section>
  )
}

function CosaPortaFollower({ piano, stato }: { piano: DatiCrescita; stato: StatoCanale | null }) {
  const righe = perTipo(stato?.video ?? [], piano.tipi)
  const massimo = Math.max(...righe.map((r) => r.perMille ?? 0), 1)
  return (
    <section className={styles.sezione} aria-labelledby="cosa-porta">
      <h2 id="cosa-porta">{t("Cosa porta follower", "What brings followers")}</h2>
      <p className={styles.sotto}>{t("Per ogni tipo di video: quanti follower nuovi ogni mille visualizzazioni, e che parte di tutti i follower nuovi ha portato.", "For each kind of video: how many new followers per thousand views, and what share of all the new followers it brought.")}</p>
      <table className={styles.tipi}>
        <thead>
          <tr>
            <th scope="col">{t("tipo", "kind")}</th>
            <th scope="col">{t("follower ogni mille visualizzazioni", "followers per thousand views")}</th>
            <th scope="col">{t("parte dei follower", "share of followers")}</th>
            <th scope="col">{t("visualizzazioni (mediana)", "views (median)")}</th>
          </tr>
        </thead>
        <tbody>
          {righe.map((r) => (
            <tr key={r.nome}>
              <th scope="row">
                {r.nome}
                <small>
                  {r.spiega} · {r.video === 1 ? t("1 video", "1 video") : t("{n} video", "{n} videos", { n: numero(r.video) })}
                </small>
              </th>
              <td>
                <span
                  className={styles.misura}
                  title={r.viste > 0 ? t("{follower} nuovi follower su {viste} visualizzazioni", "{follower} new followers out of {viste} views", { follower: numero(r.follower), viste: numero(r.viste) }) : undefined}
                >
                  <span className={styles.pista}>
                    <span className={styles.asta} style={{ width: `${((r.perMille ?? 0) / massimo) * 100}%` }} />
                  </span>
                  <span>
                    {r.perMille === null ? "—" : numero(r.perMille, 1)}
                    <small className={styles.soloStretto}>{t(" ogni mille", " per thousand")}</small>
                  </span>
                </span>
              </td>
              <td>
                {r.quota === null ? "—" : percento(r.quota)}
                <small className={styles.soloStretto}>{t(" dei follower", " of followers")}</small>
              </td>
              <td>
                {r.mediana === null ? "—" : numero(Math.round(r.mediana))}
                <small className={styles.soloStretto}>{t(" visualizzazioni", " views")}</small>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

const giudizi = (): Array<{ giudizio: DatiCrescita["novita"][number]["giudizio"]; titolo: string }> => [
  { giudizio: "sì", titolo: t("Da usare adesso", "Use now") },
  { giudizio: "più avanti", titolo: t("Più avanti", "Later") },
  { giudizio: "no", titolo: t("Non per te", "Not for you") },
]

export function Crescita() {
  const { dato, errore, caricato } = useCopia(crescita)
  const punti = useCopia(andamento).dato ?? []
  const stato = useCopia(canaleTiktok).dato
  if (errore && !dato) return <Errore messaggio={errore} onRiprova={() => void crescita.rileggi()} />
  if (!caricato || !dato) return <Caricamento />
  if (dato.quando === null) return <PaginaDiCanaleVuota pagina="crescita" titolo={t("Crescita", "Growth")} />

  const vere = serie(punti)
  return (
    <div className={styles.pagina}>
      <header>
        <h1>{t("Crescita", "Growth")}</h1>
        <p className={styles.sotto}>
          {t("Dove sei su TikTok, dove andare fra tre mesi, sei mesi e un anno, e come. Piano scritto il {quando}; i numeri veri si aggiornano a ogni lettura del canale.", "Where you are on TikTok, where to go in three months, six months and a year, and how. Plan written on {quando}; the real numbers update with every channel read.", { quando: data(dato.quando) })}
        </p>
      </header>

      <DaDoveVieni piano={dato} vere={vere} punti={punti} stato={stato} />
      <DoveAndare piano={dato} vere={vere} />
      <Settimana piano={dato} punti={punti} />
      <CosaPortaFollower piano={dato} stato={stato} />

      <section className={styles.sezione} aria-labelledby="mix">
        <h2 id="mix">{t("Il mix dei video", "The video mix")}</h2>
        {dato.mix.map((frase) => (
          <p key={frase} className={styles.paragrafo}>
            {frase}
          </p>
        ))}
      </section>

      <section className={styles.sezione} aria-labelledby="consigli">
        <h2 id="consigli">{t("Come crescere", "How to grow")}</h2>
        <div className={styles.consigli}>
          {dato.consigli.map((c) => (
            <article key={c.titolo}>
              <h3>{c.titolo}</h3>
              <p>{c.testo}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.sezione} aria-labelledby="novita">
        <h2 id="novita">{t("Le novità di TikTok", "What's new on TikTok")}</h2>
        {giudizi().map(({ giudizio, titolo }) => {
          const cose = dato.novita.filter((n) => n.giudizio === giudizio)
          if (cose.length === 0) return null
          return (
            <div key={giudizio} className={styles.gruppo}>
              <h3>{titolo}</h3>
              <ul className={styles.novita}>
                {cose.map((n) => (
                  <li key={n.nome}>
                    <span className={styles.nomeNovita}>{n.nome}</span>
                    <span className={styles.cosa}>{n.cosa}</span>
                    <span>{n.per_te}</span>
                    {n.fonte && (
                      <a href={n.fonte} target="_blank" rel="noreferrer">
                        {t("fonte", "source")}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </section>

      {dato.come.length > 0 && (
        <section className={styles.come}>
          <h2>{t("Come è fatta", "How it is made")}</h2>
          {dato.come.map((frase) => (
            <p key={frase}>{frase}</p>
          ))}
        </section>
      )}
    </div>
  )
}
