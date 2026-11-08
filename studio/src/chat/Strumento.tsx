import { useState } from "react"
import { lavori, useCopia } from "../dati"
import { durataAlSecondo, istante, tempoLeggibile } from "../testo"
import type { Lavoro } from "../tipi"
import { Immagine } from "./Immagine"
import { IconaChat } from "./icone"
import { useAdesso } from "./orologio"
import { SchedaLavoro } from "./SchedaLavoro"
import { descriviStrumento, esitoComeTesto, ingressoComeTesto } from "./strumenti"
import type { ParteStrumento } from "./tipi"
import styles from "./Strumento.module.css"
import { t } from "../lingua"

const MASSIMO_ESITO = 6000
/** Prima di questi secondi un passo è troppo breve perché valga dirlo. */
const DA_QUANDO_SI_CONTA = 3
const DA_QUANDO_SI_DICE = 5

function taglia(testo: string): string {
  return testo.length > MASSIMO_ESITO ? `${testo.slice(0, MASSIMO_ESITO)}\n${t("… (il resto non si mostra)", "… (the rest is not shown)")}` : testo
}

/** L'id del lavoro che lo strumento `lavoro` ha messo in coda, dall'esito. */
function idDelLavoro(esito: unknown): string | null {
  if (typeof esito === "object" && esito !== null && "id" in esito) return String(esito.id)
  const testo = typeof esito === "string" ? esito : ""
  try {
    const dati: unknown = JSON.parse(testo)
    if (typeof dati === "object" && dati !== null && "id" in dati) return String(dati.id)
  } catch {
    // L'esito è una frase: l'id si cerca dentro.
  }
  return /\bid\W{1,3}([\w-]+)/i.exec(testo)?.[1] ?? null
}

function LavoroDelloStrumento({ parte }: { parte: ParteStrumento }) {
  const stato = useCopia(lavori).dato
  if (!stato) return null
  const id = idDelLavoro(parte.esito)
  const ingresso = typeof parte.ingresso === "object" && parte.ingresso !== null ? (parte.ingresso as Record<string, unknown>) : {}
  type Stato = "in corso" | "in coda" | "finito"
  const vivi: Array<[Lavoro, Stato]> = [...(stato.in_corso ? [[stato.in_corso, "in corso" as Stato] as [Lavoro, Stato]] : []), ...stato.in_coda.map((l): [Lavoro, Stato] => [l, "in coda"])]
  const tutti: Array<[Lavoro, Stato]> = [...vivi, ...stato.finiti.map((l): [Lavoro, Stato] => [l, "finito"])]
  const trovato = id !== null ? tutti.find(([l]) => String(l.id) === id) : vivi.find(([l]) => l.comando === ingresso.comando && l.slug === (ingresso.slug ?? null))
  return trovato ? <SchedaLavoro lavoro={trovato[0]} stato={trovato[1]} /> : null
}

export function Strumento({ parte, lavora }: { parte: ParteStrumento; lavora: boolean }) {
  const [aperto, setAperto] = useState(false)
  const { etichetta, icona } = descriviStrumento(parte.nome, parte.ingresso)
  const esito = esitoComeTesto(parte.esito)
  const fallito = Boolean(parte.errore)
  const inCorso = !fallito && parte.esito === undefined && lavora
  const motivo = typeof parte.errore === "string" ? parte.errore : ""
  const immagini = parte.immagini ?? []
  const inizio = parte.iniziato ? istante(parte.iniziato) : null
  const fine = parte.finito ? istante(parte.finito) : null
  const adesso = useAdesso(inCorso && inizio !== null)
  const trascorso = inizio === null ? null : inCorso ? Math.max(0, (adesso - inizio) / 1000) : fine === null ? null : Math.max(0, (fine - inizio) / 1000)
  const lungo = !inCorso && trascorso !== null && trascorso >= DA_QUANDO_SI_DICE

  return (
    <div className={styles.strumento} data-stato={fallito ? "errore" : inCorso ? "corso" : "fatto"}>
      <button type="button" className={styles.riga} aria-expanded={aperto} onClick={() => setAperto(!aperto)}>
        <span className={styles.icona}>
          <IconaChat nome={icona} dimensione={16} />
        </span>
        <span className={styles.etichetta}>{etichetta}</span>
        {inCorso && <span className={styles.stato}>{trascorso !== null && trascorso >= DA_QUANDO_SI_CONTA ? t("in corso · {tempo}", "in progress · {tempo}", { tempo: tempoLeggibile(trascorso, false) }) : t("in corso…", "in progress…")}</span>}
        {fallito && <span className={styles.stato}>{t("non riuscito", "failed")}{lungo && trascorso !== null ? ` · ${durataAlSecondo(trascorso)}` : ""}</span>}
        {lungo && !fallito && trascorso !== null && <span className={styles.durata}>{durataAlSecondo(trascorso)}</span>}
        <span className={styles.freccia}>
          <IconaChat nome={aperto ? "su" : "giu"} dimensione={14} />
        </span>
      </button>
      {aperto && (
        <div className={styles.dettaglio}>
          <p className={styles.titolo}>{t("Cosa ha chiesto", "What it asked")}</p>
          <pre>{taglia(ingressoComeTesto(parte.ingresso))}</pre>
          {(esito !== "" || motivo !== "") && (
            <>
              <p className={styles.titolo}>{fallito ? t("Cosa è andato storto", "What went wrong") : t("Cosa è tornato", "What came back")}</p>
              <pre className={fallito ? styles.errore : undefined}>{taglia(motivo || esito)}</pre>
            </>
          )}
          {esito === "" && motivo === "" && !inCorso && <p className={styles.titolo}>{t("Nessun esito scritto.", "No result written.")}</p>}
        </div>
      )}
      {immagini.length > 0 && (
        <div className={styles.immagini}>
          {immagini.map((im, i) => (
            <Immagine key={i} src={`data:${im.media_type};base64,${im.data}`} alt={t("Immagine {n} di {etichetta}", "Image {n} of {etichetta}", { n: i + 1, etichetta })} />
          ))}
        </div>
      )}
      {parte.nome === "mcp__video__lavoro" && <LavoroDelloStrumento parte={parte} />}
    </div>
  )
}
