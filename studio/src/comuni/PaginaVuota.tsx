// Una pagina che vive dei dati di un canale, quando i dati non ci sono: cosa fa in due righe e un pulsante che porta il creator da Claude.
import { chiediAClaude } from "../chat/primoGiro"
import { profilo, useCopia } from "../dati"
import { t } from "../lingua"
import { CANALI } from "../video/liste"
import { Bottone } from "./Bottone"
import styles from "./PaginaVuota.module.css"

export type PaginaDiCanale = "pubblico" | "classifica" | "crescita"

const COSA_FA: Record<PaginaDiCanale, () => string> = {
  pubblico: () => t("Qui vedi come vanno i tuoi video usciti e cosa scrive chi li guarda: visite, mi piace, commenti e messaggi.", "Here you see how your released videos are doing and what the people watching write: views, likes, comments and messages."),
  classifica: () => t("Qui ti confronti con altri profili simili al tuo: chi sta davanti, di quanto, e cosa fa.", "Here you compare yourself with profiles like yours: who is ahead, by how much, and what they do."),
  crescita: () => t("Qui trovi il piano per far crescere il canale: cosa funziona, cosa provare, e quanto aspettarsi.", "Here you find the plan to grow the channel: what works, what to try, and what to expect."),
}

/** Cosa chiedere a Claude quando il canale c'è ed è TikTok, la sola lettura automatica di oggi. */
const LETTURA_TIKTOK: Record<PaginaDiCanale, () => string> = {
  pubblico: () => t("Aggiorna i dati di TikTok.", "Update the TikTok data."),
  classifica: () => t("Rifai la classifica dei profili di TikTok.", "Redo the ranking of TikTok profiles."),
  crescita: () => t("Fammi il piano di crescita di TikTok.", "Make me the TikTok growth plan."),
}

function Vuota({ titolo, righe, pulsante, richiesta }: { titolo: string; righe: string[]; pulsante: string; richiesta: string }) {
  return (
    <section className={styles.vuota} aria-labelledby="pagina-vuota">
      <h1 id="pagina-vuota">{titolo}</h1>
      {righe.map((r) => (
        <p key={r}>{r}</p>
      ))}
      <Bottone onClick={() => chiediAClaude(richiesta)}>{pulsante}</Bottone>
    </section>
  )
}

/** La pagina di `pagina` senza dati: dice cosa manca a seconda dei canali del profilo (nessuno, TikTok, solo altri). */
export function PaginaDiCanaleVuota({ pagina, titolo }: { pagina: PaginaDiCanale; titolo: string }) {
  const canali = useCopia(profilo).dato?.canali ?? []
  const cosaFa = COSA_FA[pagina]()
  if (canali.length === 0)
    return (
      <Vuota
        titolo={titolo}
        righe={[cosaFa, t("Non c'è ancora un canale: dimmi dove pubblichi e lo preparo con te.", "There is no channel yet: tell me where you publish and I will set it up with you.")]}
        pulsante={t("Collega un canale", "Connect a channel")}
        richiesta={t("Vorrei collegare il mio canale: chiedimi dove pubblico e aggiorna il mio profilo.", "I'd like to connect my channel: ask me where I publish and update my profile.")}
      />
    )
  if (canali.some((c) => c.piattaforma === "tiktok"))
    return (
      <Vuota
        titolo={titolo}
        righe={[cosaFa, t("Non ci sono ancora dati del tuo TikTok: la chat li legge dal tuo profilo, quando glielo chiedi.", "There is no data from your TikTok yet: the chat reads it from your profile, when you ask.")]}
        pulsante={t("Leggi i dati di TikTok", "Read the TikTok data")}
        richiesta={LETTURA_TIKTOK[pagina]()}
      />
    )
  const canale = canali[0]!
  const nome = CANALI.find((c) => c.id === canale.piattaforma)?.nome ?? canale.piattaforma
  return (
    <Vuota
      titolo={titolo}
      righe={[
        cosaFa,
        t(
          "Di {nome} non c'è ancora la lettura automatica, arriverà dopo. Intanto la chat può guardare il tuo profilo pubblico, se glielo permetti, e raccogliere i numeri.",
          "{nome} has no automatic reading yet, it will come later. Meanwhile the chat can look at your public profile, if you allow it, and gather the numbers.",
          { nome },
        ),
      ]}
      pulsante={t("Chiedi alla chat di guardare il mio profilo", "Ask the chat to look at my profile")}
      richiesta={t(
        "Guarda il mio profilo {nome} pubblico{canale} e dimmi cosa vedi: i numeri e cosa piace a chi mi guarda.",
        "Look at my public {nome} profile{canale} and tell me what you see: the numbers and what the people watching like.",
        { nome, canale: canale.nome ? ` (${canale.nome})` : "" },
      )}
    />
  )
}

/** Produzione senza video pronti: i conti arrivano col primo. */
export function ProduzioneVuota({ titolo }: { titolo: string }) {
  return (
    <Vuota
      titolo={titolo}
      righe={[
        t("Qui vedi quanti video fai e quanto lavoro c'è dietro a ognuno.", "Here you see how many videos you make and how much work is behind each one."),
        t("Quando ci sarà un video pronto, compaiono i suoi conti.", "When there is a finished video, its counts show up."),
      ]}
      pulsante={t("Facciamo il primo video", "Let's make the first video")}
      richiesta={t("Vorrei fare il mio primo video: da dove cominciamo?", "I'd like to make my first video: where do we start?")}
    />
  )
}
