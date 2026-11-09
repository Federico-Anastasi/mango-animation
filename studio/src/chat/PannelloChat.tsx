import { useEffect, useRef, useState, useSyncExternalStore, type DragEvent, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react"
import { Caricamento, Errore } from "../comuni/Stati"
import { Compositore } from "./Compositore"
import { Conversazione } from "./Conversazione"
import { Cronometro } from "./Cronometro"
import { Elenco } from "./Elenco"
import { ContestoUsato } from "./ContestoUsato"
import { EtichettaMotore } from "./EtichettaMotore"
import { Impostazioni } from "./Impostazioni"
import { IconaChat } from "./icone"
import { motoreDellaChat, motoreDi, type MotoreChat } from "./motore"
import { negozio, useChat, type StatoNegozio } from "./negozio"
import { avviaPrimoGiro, saltaPrimoGiro, usePrimoGiroInCorso } from "./primoGiro"
import { chiudiChat, LARGHEZZA_MINIMA, ripristinaLarghezzaChat, scegliLarghezzaChat, SOGLIA_STRETTA, usePannelloChat } from "./pannello"
import { useAllegati } from "./useAllegati"
import styles from "./PannelloChat.module.css"
import { t } from "../lingua"

const PASSO_PX = 24
const PASSO_GRANDE_PX = 96
const LARGHEZZA_MASSIMA = 760
/** Alla pagina accanto resta almeno questo, perché la vista si legga ancora. */
const LARGHEZZA_PAGINA_MINIMA = 420

const ascoltaFinestra = (ascolta: () => void) => {
  window.addEventListener("resize", ascolta)
  return () => window.removeEventListener("resize", ascolta)
}

/** La finestra è stretta come un telefono: la chat prende tutto lo schermo. */
export const useStretta = (): boolean => useSyncExternalStore(ascoltaFinestra, () => window.innerWidth <= SOGLIA_STRETTA)

/** Nell'app i file lasciati sulla finestra arrivano col loro percorso (`app/src/trascinamento.rs`); nel browser il ponte non c'è e vale il `drop` della pagina. */
type EventoTrascinamento = { tipo: "esce" } | { tipo: "entra" | "sopra" | "lascia"; x: number; y: number; percorsi?: string[] }
type PonteTrascinamento = { su: (ascolta: (evento: EventoTrascinamento) => void) => () => void }
const ponteTrascinamento = () => (window.__MANGO_ANIMATION__ as { trascinamento?: PonteTrascinamento } | undefined)?.trascinamento ?? null

const massimaPer = (finestra: number) => Math.max(LARGHEZZA_MINIMA, Math.min(LARGHEZZA_MASSIMA, finestra - LARGHEZZA_PAGINA_MINIMA))

function nomeStato(chat: StatoNegozio): string {
  if (chat.id !== null && chat.caricato && !chat.attiva && chat.stato === "pronta") return t("Chiusa", "Closed")
  switch (chat.stato) {
    case "pronta":
      return t("Pronta", "Ready")
    case "lavora":
      return t("Sta lavorando", "Working")
    case "aspetta":
      return t("Aspetta una tua risposta", "Waiting for your reply")
    case "errore":
      return t("Si è interrotta", "Stopped")
  }
}

function Maniglia({ larghezza }: { larghezza: number }) {
  const da = useRef<{ x: number; larghezza: number } | null>(null)
  const massima = massimaPer(typeof window === "undefined" ? 1400 : window.innerWidth)
  const dentro = (px: number) => Math.min(massima, Math.max(LARGHEZZA_MINIMA, px))

  const inizia = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    da.current = { x: e.clientX, larghezza }
  }
  // Trascinare verso sinistra allarga la chat, che sta a destra.
  const muovi = (e: PointerEvent<HTMLDivElement>) => {
    if (da.current) scegliLarghezzaChat(dentro(da.current.larghezza - (e.clientX - da.current.x)), false)
  }
  const finisci = (e: PointerEvent<HTMLDivElement>) => {
    if (!da.current) return
    scegliLarghezzaChat(dentro(da.current.larghezza - (e.clientX - da.current.x)), true)
    da.current = null
  }
  const tasto = (e: KeyboardEvent<HTMLDivElement>) => {
    const passo = e.shiftKey ? PASSO_GRANDE_PX : PASSO_PX
    const mosse: Record<string, number | undefined> = { ArrowLeft: passo, ArrowRight: -passo, Home: massima - larghezza, End: LARGHEZZA_MINIMA - larghezza }
    const delta = mosse[e.key]
    if (delta === undefined) return
    e.preventDefault()
    scegliLarghezzaChat(dentro(larghezza + delta), true)
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t("Larghezza della chat", "Chat width")}
      aria-valuenow={Math.round(larghezza)}
      aria-valuemin={LARGHEZZA_MINIMA}
      aria-valuemax={Math.round(massima)}
      tabIndex={0}
      className={styles.maniglia}
      onPointerDown={inizia}
      onPointerMove={muovi}
      onPointerUp={finisci}
      onPointerCancel={finisci}
      onKeyDown={tasto}
      onDoubleClick={ripristinaLarghezzaChat}
    />
  )
}

function Vuota({ motore, onScelta }: { motore: MotoreChat; onScelta: () => void }) {
  const mango = motore.id === "mango-code"
  return (
    <div className={styles.vuota}>
      <h2>{mango ? t("Parla con Mango Code", "Talk to Mango Code") : t("Cosa facciamo?", "What shall we do?")}</h2>
      <p>
        {mango
          ? t("È Mango Code, coi modelli sul computer: lavora sui tuoi file e monta i video. Scrivi qui sotto.", "This is Mango Code, with the models on your computer: it works on your files and edits your videos. Write below.")
          : t("Lavora sui tuoi file e monta i video, con il Claude Code installato sul computer. Scrivi qui sotto.", "It works on your files and edits your videos, using the Claude Code installed on your computer. Write below.")}
      </p>
      <h3>{t("Riprendi una conversazione", "Pick up a conversation")}</h3>
      <Elenco corrente={null} massimo={5} onScelta={onScelta} />
      <button type="button" className={styles.ripeti} onClick={() => avviaPrimoGiro(true)}>
        {t("Rifai il primo giro", "Redo the first round")}
      </button>
    </div>
  )
}

export function PannelloChat() {
  const chat = useChat()
  const { larghezza } = usePannelloChat()
  const stretta = useStretta()
  const [lista, setLista] = useState(false)
  const [erroreChiusura, setErroreChiusura] = useState<string | null>(null)
  const [trascina, setTrascina] = useState(false)
  const dentroAlTrascinamento = useRef(0)
  const allegati = useAllegati()
  const pannello = useRef<HTMLElement>(null)

  useEffect(() => {
    pannello.current?.querySelector("textarea")?.focus()
  }, [])

  const aggiungiLocali = allegati.aggiungiLocali
  useEffect(
    () =>
      ponteTrascinamento()?.su((e) => {
        if (e.tipo === "esce") return setTrascina(false)
        const sopra = pannello.current?.contains(document.elementFromPoint(e.x, e.y)) ?? false
        setTrascina(sopra && e.tipo !== "lascia")
        if (e.tipo === "lascia" && sopra) aggiungiLocali(e.percorsi ?? [])
      }),
    [aggiungiLocali],
  )

  const nuova = () => {
    negozio.apri(null)
    setLista(false)
  }

  const chiudiConversazione = () => {
    setErroreChiusura(null)
    negozio.chiudi().catch((e: unknown) => setErroreChiusura(e instanceof Error ? e.message : String(e)))
  }

  // Su un telefono la chat copre la vista: un collegamento a un video la scopre.
  const alClic = (e: MouseEvent) => {
    if (stretta && e.target instanceof Element && e.target.closest('a[href^="#/"]')) chiudiChat()
  }

  const contieneFile = (e: DragEvent) => [...e.dataTransfer.types].includes("Files")
  const entra = (e: DragEvent) => {
    if (!contieneFile(e)) return
    e.preventDefault()
    dentroAlTrascinamento.current += 1
    setTrascina(true)
  }
  const esce = (e: DragEvent) => {
    if (!contieneFile(e)) return
    dentroAlTrascinamento.current = Math.max(0, dentroAlTrascinamento.current - 1)
    if (dentroAlTrascinamento.current === 0) setTrascina(false)
  }
  const lascia = (e: DragEvent) => {
    if (!contieneFile(e)) return
    e.preventDefault()
    dentroAlTrascinamento.current = 0
    setTrascina(false)
    allegati.aggiungi([...e.dataTransfer.files])
  }

  const primoGiro = usePrimoGiroInCorso()
  const motore = motoreDellaChat(chat)
  const vuota = chat.id === null && chat.messaggi.length === 0 && chat.inviati.length === 0
  const nonAperta = chat.id !== null && chat.messaggi.length === 0 && chat.inviati.length === 0 && (!chat.caricato || chat.errore !== null)
  const titolo = chat.id === null ? t("Nuova conversazione", "New conversation") : chat.titolo || t("Conversazione", "Conversation")

  return (
    <aside
      ref={pannello}
      className={styles.pannello}
      data-stretta={stretta}
      style={stretta ? undefined : { width: larghezza }}
      aria-label={t("Chat", "Chat")}
      onClick={alClic}
      onDragEnter={entra}
      onDragOver={(e) => contieneFile(e) && e.preventDefault()}
      onDragLeave={esce}
      onDrop={lascia}
    >
      {!stretta && <Maniglia larghezza={larghezza} />}
      <div className={styles.dentro}>
        <header className={styles.testata}>
          {stretta && (
            <button type="button" className={styles.indietro} onClick={chiudiChat}>
              <IconaChat nome="sinistra" />
              {t("Torna alla vista", "Back to the view")}
            </button>
          )}
          <div className={styles.titolo}>
            <strong title={titolo}>{titolo}</strong>
            <span className={styles.sotto}>
              {motore && <EtichettaMotore motore={motore} />}
              <span className={styles.stato} data-stato={chat.stato}>
                {nomeStato(chat)}
                {(chat.lavoro.ms > 0 || chat.lavoro.da !== null) && (
                  <span title={t("Il tempo di lavoro di Claude in tutta la conversazione, senza le attese", "Claude's working time across the whole conversation, without the waits")}>
                    {" · "}
                    <Cronometro da={chat.lavoro.da} prima={chat.lavoro.ms} />
                  </span>
                )}
              </span>
              {chat.contestoUsato && <ContestoUsato contesto={chat.contestoUsato} />}
            </span>
          </div>
          {chat.id !== null && chat.attiva && (
            <button type="button" className={styles.icona} onClick={chiudiConversazione} aria-label={t("Chiudi la conversazione", "Close the conversation")} title={t("Chiudi la conversazione: si ferma ciò che sta facendo e non resta niente acceso. Se scrivi di nuovo, si riapre.", "Close the conversation: whatever it is doing stops and nothing is left running. If you write again, it reopens.")}>
              <IconaChat nome="spegni" />
            </button>
          )}
          <button type="button" className={styles.icona} onClick={() => setLista(!lista)} aria-pressed={lista} aria-label={t("Le conversazioni", "Conversations")} title={t("Le conversazioni", "Conversations")}>
            <IconaChat nome="elenco" />
          </button>
          <button type="button" className={styles.icona} onClick={nuova} aria-label={t("Nuova conversazione", "New conversation")} title={t("Nuova conversazione", "New conversation")}>
            <IconaChat nome="nuova" />
          </button>
          {!stretta && (
            <button type="button" className={styles.icona} onClick={chiudiChat} aria-label={t("Chiudi la chat", "Close the chat")} title={t("Chiudi la chat (Ctrl+J)", "Close the chat (Ctrl+J)")}>
              <IconaChat nome="croce" />
            </button>
          )}
          <Impostazioni chat={chat} />
          {erroreChiusura && (
            <p className={styles.erroreTestata} role="alert">
              {erroreChiusura}
            </p>
          )}
        </header>
        {primoGiro && (
          <div className={styles.primoGiro}>
            <span>{t("Primo giro: Claude ti fa qualche domanda.", "First round: Claude asks you a few questions.")}</span>
            <button type="button" onClick={saltaPrimoGiro} aria-label={t("Salta il primo giro", "Skip the first round")}>
              {t("Salta", "Skip")}
            </button>
          </div>
        )}
        {lista ? (
          <div className={styles.scorri}>
            <Elenco corrente={chat.id} onScelta={() => setLista(false)} />
          </div>
        ) : vuota ? (
          <div className={styles.scorri}>
            <Vuota motore={motoreDi(chat.modello)} onScelta={() => setLista(false)} />
          </div>
        ) : nonAperta ? (
          <div className={styles.scorri}>{chat.errore ? <Errore messaggio={chat.errore} onRiprova={() => void negozio.carica()} /> : <Caricamento etichetta={t("Apro la conversazione…", "Opening the conversation…")} />}</div>
        ) : (
          <Conversazione chat={chat} />
        )}
        <Compositore chat={chat} allegati={allegati} onLista={setLista} />
        {trascina && (
          <div className={styles.rilascia} aria-hidden="true">
            {t("Rilascia i file per allegarli", "Drop the files to attach them")}
          </div>
        )}
      </div>
    </aside>
  )
}
