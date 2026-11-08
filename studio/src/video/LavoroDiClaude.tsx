// «Quanto è costato a Claude questo video?»: il suo tempo di lavoro e ciò che ha scritto e letto, sommati da tutte le conversazioni
// (`docs/API.md`, «Consumi»).
import { Caricamento, Vuoto } from "../comuni/Stati"
import { Tessera, Tessere } from "../comuni/Tessere"
import { consumi, useCopia } from "../dati"
import { t } from "../lingua"
import { data, durata, pluralizza, quantitaGrossa } from "../testo"
import type { ConsumoDiUnVideo } from "../tipi"
import styles from "./LavoroDiClaude.module.css"

const quando = (c: ConsumoDiUnVideo): string => {
  const dal = data(c.dal)
  const al = data(c.al)
  return dal === al ? t("il {data}", "on {data}", { data: dal }) : t("dal {dal} al {al}", "from {dal} to {al}", { dal, al })
}

export function LavoroDiClaude({ slug }: { slug: string }) {
  const { dato, errore, caricato } = useCopia(consumi)
  const conto = dato?.video[slug]
  return (
    <section className={styles.blocco} aria-labelledby="titolo-lavoro-di-claude">
      <h2 id="titolo-lavoro-di-claude">{t("Il lavoro di Claude", "Claude's work")}</h2>
      {!caricato ? (
        <Caricamento />
      ) : dato === null ? (
        <Vuoto>{errore ? t("Non riesco a leggere il lavoro di Claude adesso.", "I cannot read Claude's work right now.") : t("Il lavoro di Claude non c'è ancora.", "There is no work by Claude yet.")}</Vuoto>
      ) : conto === undefined ? (
        <Vuoto>{dato.pronto ? t("Nessuna conversazione di Claude ha lavorato su questo video.", "No conversation of Claude has worked on this video.") : t("Sto ancora leggendo le conversazioni di Claude: i numeri arrivano fra poco.", "I am still reading Claude's conversations: the numbers will arrive shortly.")}</Vuoto>
      ) : (
        <>
          <Tessere>
            <Tessera valore={durata(conto.tempo)} nome={t("di lavoro di Claude", "of Claude's work")} nota={`${pluralizza(conto.giri, t("richiesta", "request"), t("richieste", "requests"))}, ${quando(conto)}`} />
            <Tessera valore={quantitaGrossa(conto.token.scritti)} nome={t("scritti da Claude", "written by Claude")} nota={t("pezzi di testo («token»)", "pieces of text («tokens»)")} />
            <Tessera valore={quantitaGrossa(conto.token.nuovi)} nome={t("letti per la prima volta", "read for the first time")} nota={t("file, risultati e messaggi nuovi", "new files, results and messages")} />
            <Tessera valore={quantitaGrossa(conto.token.riletti)} nome={t("riletti dalla conversazione", "re-read from the conversation")} nota={t("ciò che Claude ha già in testa e rilegge a ogni passo", "what Claude already has in mind and re-reads at every step")} />
          </Tessere>
          <p className={styles.nota}>
            {!dato.pronto && t("Sto ancora leggendo le conversazioni di Claude: questi conti sono parziali. ", "I am still reading Claude's conversations: these counts are partial. ")}
            {t("Sono sommati da tutte le conversazioni di Claude che hanno lavorato su questo video, anche quelle del terminale e dei suoi aiutanti. Il tempo è quello in cui Claude lavorava, non quello in cui la conversazione era aperta. Un «token» è un pezzo di testo, più o meno una sillaba: è con quelli che Claude conta quanto scrive e quanto legge. Se una richiesta tocca più video, conta per quello su cui Claude ha lavorato di più. Il lavoro fatto con Mango Code non è contato.", "They are added up from all of Claude's conversations that worked on this video, including those in the terminal and its helpers. The time is the time Claude was working, not the time the conversation was open. A «token» is a piece of text, roughly a syllable: it is how Claude counts how much it writes and reads. If a request touches several videos, it counts for the one Claude worked on the most. Work done with Mango Code is not counted.")}
          </p>
        </>
      )}
    </section>
  )
}
