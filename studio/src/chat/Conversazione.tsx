import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { elencoVideo, useCopia } from "../dati"
import { istante } from "../testo"
import { creaCollegatore } from "./collegamenti"
import { Cronometro } from "./Cronometro"
import { IconaChat } from "./icone"
import { motoreDellaChat } from "./motore"
import { MessaggioDiClaude, MessaggioDelCreator } from "./Messaggio"
import { negozio, type StatoNegozio } from "./negozio"
import { Richieste } from "./Richieste"
import { SchedaTask } from "./SchedaTask"
import styles from "./Conversazione.module.css"
import { t } from "../lingua"

const MARGINE_FONDO_PX = 48

/** Cosa dice il messaggio mandato mentre si lavora. Ctrl+B vale per i lavori in primo piano, che ha solo il Claude Code installato sul computer. */
const notaInCoda = (chi: string | undefined, inPrimoPiano: boolean): string => {
  if (inPrimoPiano) {
    return chi
      ? t("In coda: {chi} lo legge quando finisce il lavoro in corso. Con Ctrl+B lo legge subito.", "Queued: {chi} will read it when the current job finishes. With Ctrl+B it reads it right away.", { chi })
      : t("In coda: sarà letto quando finisce il lavoro in corso. Con Ctrl+B si legge subito.", "Queued: it will be read when the current job finishes. With Ctrl+B it is read right away.")
  }
  return chi ? t("In coda: {chi} lo legge appena finisce.", "Queued: {chi} will read it as soon as it finishes.", { chi }) : t("In coda: sarà letto appena finisce.", "Queued: it will be read as soon as it finishes.")
}

function nomePasso(chi: string | undefined, strumento: boolean): string {
  if (chi) return strumento ? t("{chi} aspetta lo strumento", "{chi} is waiting for the tool", { chi }) : t("{chi} sta pensando", "{chi} is thinking", { chi })
  return strumento ? t("Aspetta lo strumento", "Waiting for the tool") : t("Sta pensando", "Thinking")
}

/**
 * Il passo che il motore sta facendo adesso, per la riga in fondo (il tempo del giro intero sta nella testata): uno strumento in
 * corso conta da quando è partito; altrimenti il motore pensa, da quando è finito l'ultimo strumento o è arrivato l'ultimo messaggio.
 */
function passoInCorso(chat: StatoNegozio): { strumento: boolean; da: number | null } {
  const ultimoDelCreator = chat.messaggi.map((m) => m.ruolo).lastIndexOf("utente")
  const parti = chat.messaggi.slice(ultimoDelCreator + 1).flatMap((m) => (m.ruolo === "claude" ? m.parti : []))
  const strumenti = parti.flatMap((p) => (p.tipo === "strumento" ? [p] : []))
  const istanti = [chat.lavoraDa, istante(chat.messaggi[ultimoDelCreator]?.quando ?? ""), ...strumenti.map((p) => (p.finito === undefined ? null : istante(p.finito)))]
  const ultimo = chat.lavoraDa === null ? null : Math.max(...istanti.filter((i): i is number => i !== null))
  const inCorso = strumenti.filter((p) => p.esito === undefined && p.errore === undefined).at(-1)
  if (!inCorso) return { strumento: false, da: ultimo }
  return { strumento: true, da: (inCorso.iniziato === undefined ? null : istante(inCorso.iniziato)) ?? ultimo }
}

/** I messaggi, in ordine. Segue il testo che arriva solo se chi legge è già in fondo; altrimenti lascia stare e offre di scendere. */
export function Conversazione({ chat }: { chat: StatoNegozio }) {
  const area = useRef<HTMLDivElement>(null)
  const contenuto = useRef<HTMLDivElement>(null)
  const inFondo = useRef(true)
  const [lontano, setLontano] = useState(false)
  const slugs = useCopia(elencoVideo).dato?.map((v) => v.slug)
  const collega = useMemo(() => creaCollegatore(slugs ?? []), [slugs])
  const lavora = chat.stato === "lavora" || chat.stato === "aspetta"
  const chi = motoreDellaChat(chat)?.corto ?? undefined
  const inPrimoPiano = chat.task.some((t) => !t.background)
  const passo = passoInCorso(chat)
  const [erroreBackground, setErroreBackground] = useState<string | null>(null)
  // Senza un lavoro in primo piano la riga d'errore non ha più niente di cui parlare.
  useEffect(() => {
    if (!inPrimoPiano) setErroreBackground(null)
  }, [inPrimoPiano])

  const mandaInBackground = () => {
    setErroreBackground(null)
    negozio.inBackground().catch((e: unknown) => setErroreBackground(e instanceof Error ? e.message : String(e)))
  }

  // Ctrl+B, come nel terminale: solo se c'è un lavoro da spostare; altrimenti il tasto resta al browser.
  useEffect(() => {
    if (!inPrimoPiano) return
    const alTasto = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== "b") return
      e.preventDefault()
      mandaInBackground()
    }
    document.addEventListener("keydown", alTasto)
    return () => document.removeEventListener("keydown", alTasto)
  }, [inPrimoPiano])

  const scendi = () => {
    const el = area.current
    if (el) el.scrollTop = el.scrollHeight
  }

  const alloScorrimento = () => {
    const el = area.current
    if (!el) return
    inFondo.current = el.scrollHeight - el.scrollTop - el.clientHeight < MARGINE_FONDO_PX
    setLontano(!inFondo.current)
  }

  // Chi manda un messaggio vuole vedere la risposta, e chi apre una conversazione arriva in fondo.
  useLayoutEffect(() => {
    inFondo.current = true
    scendi()
  }, [chat.id, chat.inviati.length, chat.inAttesa.length])

  useLayoutEffect(() => {
    if (inFondo.current) scendi()
  }, [chat.messaggi, chat.stato, chat.task.length])

  // Le immagini che si caricano e le schede che crescono allungano la conversazione senza che cambi nulla qui.
  useLayoutEffect(() => {
    const el = contenuto.current
    if (!el) return
    const osserva = new ResizeObserver(() => {
      if (inFondo.current) scendi()
    })
    osserva.observe(el)
    return () => osserva.disconnect()
  }, [])

  const ultimoDiClaude = chat.messaggi.findLastIndex((m) => m.ruolo === "claude")

  return (
    <div className={styles.corpo}>
      <div ref={area} className={styles.area} onScroll={alloScorrimento} role="log" aria-label={t("La conversazione", "The conversation")} aria-live="off">
        <div ref={contenuto} className={styles.contenuto}>
          {chat.messaggi.map((m, i) => (m.ruolo === "utente" ? <MessaggioDelCreator key={m.id} messaggio={m} /> : <MessaggioDiClaude key={m.id} autore={chi ?? t("Risposta", "Reply")} messaggio={m} lavora={lavora} ultimo={i === ultimoDiClaude} collega={collega} />))}
          {chat.inviati.map((i) => (
            <div key={i.chiave} className={styles.inviato}>
              <MessaggioDelCreator
                messaggio={{ id: `inviato-${i.chiave}`, ruolo: "utente", quando: new Date().toISOString(), parti: [...(i.messaggio.testo ? [{ tipo: "testo" as const, testo: i.messaggio.testo }] : []), ...(i.messaggio.allegati ?? []).map((a) => ({ tipo: "allegato" as const, percorso: a.percorso, immagine: /\.(png|jpe?g|gif|webp|bmp)$/i.test(a.percorso) }))] }}
                nota={i.errore ? undefined : lavora ? notaInCoda(chi, inPrimoPiano) : t("Lo sto mandando…", "Sending…")}
              />
              {i.errore && (
                <p className={styles.erroreInvio} role="alert">
                  <span>{t("Non è partito: {errore}", "It was not sent: {errore}", { errore: i.errore })}</span>
                  <button type="button" onClick={() => void negozio.riprova(i.chiave)}>
                    {t("Riprova", "Try again")}
                  </button>
                  <button type="button" onClick={() => negozio.togli(i.chiave)}>
                    {t("Togli", "Remove")}
                  </button>
                </p>
              )}
            </div>
          ))}
          {chat.task
            .filter((t) => t.background)
            .map((t) => (
              <SchedaTask key={t.id} task={t} />
            ))}
          {lavora && chat.inAttesa.length === 0 && (
            <div className={styles.rigaLavora}>
              <p className={styles.lavora} role="status">
                <span className={styles.punti} aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span>
                  {nomePasso(chi, passo.strumento)}
                  {passo.da === null ? (
                    "…"
                  ) : (
                    <>
                      {" · "}
                      <Cronometro da={passo.da} />
                    </>
                  )}
                </span>
              </p>
              {inPrimoPiano && (
                <button type="button" className={styles.inBackground} onClick={mandaInBackground} title="Ctrl+B">
                  {t("Manda in background", "Send to background")}
                </button>
              )}
            </div>
          )}
          {erroreBackground && (
            <p className={styles.erroreInvio} role="alert">
              <span>{erroreBackground}</span>
            </p>
          )}
          {chat.inAttesa.length > 0 && <Richieste chi={chi} richieste={chat.inAttesa} rispondi={(richiesta, scelta) => negozio.rispondi(richiesta, scelta)} />}
        </div>
      </div>
      {lontano && (
        <button
          type="button"
          className={styles.inFondo}
          onClick={() => {
            inFondo.current = true
            scendi()
            setLontano(false)
          }}
        >
          <IconaChat nome="giu" dimensione={15} />
          {t("Vai in fondo", "Jump to the bottom")}
        </button>
      )}
    </div>
  )
}
