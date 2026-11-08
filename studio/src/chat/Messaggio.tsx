import { useEffect, useRef, useState } from "react"
import { durata, oraMinuti } from "../testo"
import { indirizzoImmagine, nomeDelFile } from "./allegati"
import type { Pezzo } from "./collegamenti"
import { Immagine } from "./Immagine"
import { IconaChat } from "./icone"
import { Markdown } from "./Markdown"
import { Strumento } from "./Strumento"
import type { Messaggio as MessaggioChat, Parte } from "./tipi"
import styles from "./Messaggio.module.css"
import { t } from "../lingua"

const menoMovimento = (): boolean => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

/** Il testo che arriva a pezzi si scrive un po' per volta, raggiungendo quello arrivato: niente scatti a ogni pezzo. */
export function useTestoFluido(testo: string, inCrescita: boolean): string {
  const [lunghezza, setLunghezza] = useState(testo.length)
  const corrente = useRef(testo.length)
  useEffect(() => {
    if (!inCrescita || menoMovimento()) {
      corrente.current = testo.length
      setLunghezza(testo.length)
      return
    }
    corrente.current = Math.min(corrente.current, testo.length)
    let fotogramma = 0
    const passo = () => {
      const mancano = testo.length - corrente.current
      if (mancano <= 0) return
      corrente.current += Math.max(1, Math.ceil(mancano / 6))
      setLunghezza(corrente.current)
      if (corrente.current < testo.length) fotogramma = requestAnimationFrame(passo)
    }
    fotogramma = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(fotogramma)
  }, [testo, inCrescita])
  const fino = Math.min(lunghezza, testo.length)
  // Non si taglia a metà di un carattere fatto di due unità.
  return /[\uDC00-\uDFFF]/.test(testo.charAt(fino)) ? testo.slice(0, fino + 1) : testo.slice(0, fino)
}

function TestoDiClaude({ testo, inCrescita, collega }: { testo: string; inCrescita: boolean; collega: (t: string) => Pezzo[] }) {
  const visibile = useTestoFluido(testo, inCrescita)
  return <Markdown testo={visibile} collega={collega} />
}

function Pensiero({ testo }: { testo: string }) {
  return (
    <details className={styles.pensiero}>
      <summary>
        <IconaChat nome="pensiero" dimensione={15} />
        {t("Ha ragionato", "Thought it through")}
      </summary>
      <p>{testo}</p>
    </details>
  )
}

export function Allegato({ percorso, immagine }: { percorso: string; immagine: boolean }) {
  const indirizzo = immagine ? indirizzoImmagine(percorso) : null
  if (indirizzo) return <Immagine src={indirizzo} alt={t("Allegato: {nome}", "Attachment: {nome}", { nome: nomeDelFile(percorso) })} />
  return (
    <span className={styles.file}>
      <IconaChat nome={immagine ? "foto" : "file"} dimensione={15} />
      {nomeDelFile(percorso)}
    </span>
  )
}

function Fine({ durata_ms, errore }: { durata_ms: number; errore?: string }) {
  return errore ? (
    <p className={styles.fineErrore} role="alert">
      <IconaChat nome="attenzione" dimensione={15} />
      <span>{t("Si è fermato: {errore}", "It stopped: {errore}", { errore })}</span>
    </p>
  ) : (
    <p className={styles.fine}>{t("Fatto in {durata}", "Done in {durata}", { durata: durata(durata_ms / 1000) })}</p>
  )
}

export function MessaggioDiClaude({ autore, messaggio, lavora, ultimo, collega }: { autore: string; messaggio: MessaggioChat; lavora: boolean; ultimo: boolean; collega: (t: string) => Pezzo[] }) {
  const parti = messaggio.parti
  return (
    <article className={styles.claude} aria-label={autore}>
      {parti.map((p: Parte, i) => {
        switch (p.tipo) {
          case "testo":
            return <TestoDiClaude key={i} testo={p.testo} inCrescita={lavora && ultimo && i === parti.length - 1} collega={collega} />
          case "pensiero":
            return <Pensiero key={i} testo={p.testo} />
          case "strumento":
            return <Strumento key={p.id} parte={p} lavora={lavora && ultimo} />
          case "allegato":
            return <Allegato key={i} percorso={p.percorso} immagine={p.immagine} />
          case "fine":
            return <Fine key={i} durata_ms={p.durata_ms} errore={p.errore} />
        }
      })}
    </article>
  )
}

export function MessaggioDelCreator({ messaggio, nota }: { messaggio: MessaggioChat; nota?: string }) {
  const testo = messaggio.parti.flatMap((p) => (p.tipo === "testo" ? [p.testo] : [])).join("\n")
  const allegati = messaggio.parti.flatMap((p) => (p.tipo === "allegato" ? [p] : []))
  return (
    <article className={styles.fa} aria-label={t("Tu", "You")} title={oraMinuti(messaggio.quando)}>
      {allegati.length > 0 && (
        <div className={styles.allegati}>
          {allegati.map((a, i) => (
            <Allegato key={i} percorso={a.percorso} immagine={a.immagine} />
          ))}
        </div>
      )}
      {testo !== "" && <p className={styles.testoFa}>{testo}</p>}
      {nota && <p className={styles.nota}>{nota}</p>}
    </article>
  )
}
