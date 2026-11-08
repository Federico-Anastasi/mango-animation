import { useId, useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react"
import { useCopia } from "../dati"
import { leggiBozza, ricordaBozza } from "./bozza"
import { comandoDelloStudio, elencoComandi, filtra, nomeInScrittura, type ComandoDelloStudio, type VoceComando } from "./comandi"
import { contestoDa, useSguardo } from "./contesto"
import { fraseDelRifiuto, ponteAppunti } from "./appunti"
import { Dettato, type Posizione, type Scritto } from "./dettatura"
import { IconaChat } from "./icone"
import { apriMenu } from "./Impostazioni"
import { comandiChat, livelloScritto, modelliChat, modelliOfferti, modelloScelto, nomeEffort } from "./modelli"
import { MOTORE_CHAT, motoreDellaChat } from "./motore"
import { useMicrofono } from "./Microfono"
import { negozio, type StatoNegozio } from "./negozio"
import { idOpzione, Tendina } from "./Tendina"
import type { useAllegati } from "./useAllegati"
import styles from "./Compositore.module.css"
import { t } from "../lingua"

type Allegati = ReturnType<typeof useAllegati>

const come = (testo: string) => testo.trim().toLowerCase().replace(/\s+/g, " ")
const messaggioDi = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function Compositore({ chat, allegati, onLista }: { chat: StatoNegozio; allegati: Allegati; onLista: (aperta: boolean) => void }) {
  const [testo, scriviTesto] = useState(leggiBozza)
  // Il testo di adesso anche prima che React lo mostri: due frasi dettate di fila non si calpestano.
  const attuale = useRef(testo)
  // Dove mettere il cursore appena il campo mostra il testo dettato.
  const cursore = useRef<number | null>(null)
  const setTesto = (nuovo: string | ((prima: string) => string)) => {
    const valore = typeof nuovo === "function" ? nuovo(attuale.current) : nuovo
    attuale.current = valore
    ricordaBozza(valore)
    scriviTesto(valore)
  }
  const [errore, setErrore] = useState<string | null>(null)
  const campo = useRef<HTMLTextAreaElement>(null)
  const idTendina = useId()
  const [sceltaTendina, setSceltaTendina] = useState<{ nome: string; indice: number } | null>(null)
  // Il testo per cui il creator ha chiuso la tendina con Esc: finché non cambia resta chiusa.
  const [serrata, setSerrata] = useState<string | null>(null)
  const modelli = useCopia(modelliChat).dato
  const comandi = useCopia(comandiChat)

  const scelta = useRef<HTMLInputElement>(null)
  const sguardo = useSguardo()
  const lavora = chat.stato === "lavora" || chat.stato === "aspetta"
  const motore = motoreDellaChat(chat)
  const chi = motore?.corto ?? undefined
  const segnaposto =
    chat.stato === "lavora"
      ? chi
        ? t("{chi} sta lavorando: scrivi pure, il messaggio va in coda", "{chi} is working: go ahead and write, your message will be queued", { chi })
        : t("Scrivi pure: il messaggio va in coda", "Go ahead and write: your message will be queued")
      : chat.stato === "aspetta"
        ? chi
          ? t("{chi} aspetta una tua risposta qui sopra", "{chi} is waiting for your reply above", { chi })
          : t("Aspetta una tua risposta qui sopra", "Waiting for your reply above")
        : chi
          ? t("Scrivi a {chi}", "Write to {chi}", { chi })
          : t("Scrivi un messaggio", "Write a message")
  const pronti = allegati.allegati.flatMap((a) => (a.percorso ? [{ percorso: a.percorso }] : []))
  const puoMandare = (daMandare: string) => (daMandare.trim() !== "" || pronti.length > 0) && !allegati.staSalendo
  const conServer = motore?.id === MOTORE_CHAT.id
  const nomeScritto = nomeInScrittura(testo)
  const voci = nomeScritto === null ? [] : filtra(elencoComandi(comandi.dato, conServer), nomeScritto)
  const tendina = nomeScritto !== null && voci.length > 0 && serrata !== testo ? { nome: nomeScritto, voci, attiva: sceltaTendina?.nome === nomeScritto ? Math.min(sceltaTendina.indice, voci.length - 1) : 0 } : null
  const notaTendina = conServer && comandi.errore !== null ? t("Gli altri comandi non si leggono: {errore}", "The other commands cannot be read: {errore}", { errore: comandi.errore }) : null

  useLayoutEffect(() => {
    const el = campo.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`
    if (cursore.current !== null) el.setSelectionRange(cursore.current, cursore.current)
    cursore.current = null
  }, [testo])

  // Le parole dettate entrano nel campo mentre il creator parla, dove sta il cursore (o al posto di ciò che è selezionato); il creator le rilegge e manda lui, e mandando la dettatura finisce.
  const dettato = useRef(new Dettato())
  const selezione = (): Posizione => {
    const el = campo.current
    const fine = attuale.current.length
    const da = cursore.current ?? el?.selectionStart ?? fine
    return { da: Math.min(da, fine), a: Math.min(cursore.current ?? el?.selectionEnd ?? fine, fine) }
  }
  const scriviDettato = (scritto: Scritto | null) => {
    if (!scritto) return
    cursore.current = scritto.cursore
    setTesto(scritto.testo)
  }
  const microfono = useMicrofono({
    parziale: (t) => scriviDettato(dettato.current.parziale(attuale.current, selezione(), t)),
    definitiva: (t) => (scriviDettato(dettato.current.definitiva(attuale.current, selezione(), t)), campo.current?.focus()),
    nuova: () => dettato.current.riparti(),
  })

  const modelliNonLetti = () => t("I modelli non sono ancora stati letti: riprova fra un attimo.", "The models have not been read yet: try again in a moment.")

  const scegliModello = async (argomento: string): Promise<string | null> => {
    if (argomento === "") return apriMenu("modello") ? null : modelliNonLetti()
    if (!modelli) return modelliNonLetti()
    const offerti = modelliOfferti(modelli, chat)
    const cercato = come(argomento)
    const trovato = offerti.find((m) => come(m.id) === cercato || come(m.nome) === cercato)
    if (!trovato) return t("Non trovo il modello «{nome}». Quelli che ci sono: {elenco}.", "I can't find the model “{nome}”. The ones available are: {elenco}.", { nome: argomento, elenco: offerti.map((m) => m.nome).join(", ") })
    return negozio.scegli({ modello: trovato.id })
  }

  const scegliEffort = async (argomento: string): Promise<string | null> => {
    if (!modelli) return modelliNonLetti()
    const livelli = modelloScelto(modelliOfferti(modelli, chat), chat.modello)?.effort ?? []
    if (livelli.length === 0) return t("Questo modello non ha l'effort.", "This model has no effort setting.")
    if (argomento === "") return apriMenu("effort") ? null : modelliNonLetti()
    const livello = livelloScritto(argomento)
    if (livello === undefined || (livello !== null && !livelli.includes(livello))) {
      return t("Non conosco il livello «{nome}». Quelli che ci sono: {elenco}.", "I don't know the level “{nome}”. The ones available are: {elenco}.", { nome: argomento, elenco: livelli.map((l) => nomeEffort(l)).join(", ") })
    }
    return negozio.scegli({ effort: livello })
  }

  /** Un comando dello studio non arriva a Claude: si fa. Torna `null` se è andato, altrimenti la frase che dice perché no. */
  const eseguiComando = async (comando: ComandoDelloStudio): Promise<string | null> => {
    try {
      switch (comando.nome) {
        case "clear":
          await negozio.chiudi()
          negozio.apri(null)
          onLista(false)
          return null
        case "exit":
          await negozio.chiudi()
          return null
        case "resume":
          onLista(true)
          return null
        case "model":
          return await scegliModello(comando.argomento)
        case "effort":
          return await scegliEffort(comando.argomento)
      }
    } catch (e) {
      return messaggioDi(e)
    }
  }

  const invia = (daMandare = testo) => {
    if (!puoMandare(daMandare)) return
    microfono.spegni()
    dettato.current.riparti()
    setErrore(null)
    const comando = comandoDelloStudio(daMandare)
    if (comando) {
      setTesto(daMandare)
      void eseguiComando(comando).then((frase) => {
        if (frase !== null) return setErrore(frase)
        if (attuale.current === daMandare) setTesto("")
      })
      return
    }
    void negozio.invia({ ...(daMandare.trim() === "" ? {} : { testo: daMandare.trim() }), ...(pronti.length > 0 ? { allegati: pronti } : {}), contesto: contestoDa(sguardo) })
    setTesto("")
    allegati.svuota()
  }

  const completa = (voce: VoceComando) => {
    dettato.current.tocca()
    cursore.current = voce.nome.length + 2
    setTesto(`/${voce.nome} `)
    campo.current?.focus()
  }

  // Come nel terminale: Invio esegue la riga scelta, Tab la completa per scrivere gli argomenti.
  const scegliComando = (voce: VoceComando) => invia(`/${voce.nome}`)

  const tasto = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return
    if (tendina) {
      const su = e.key === "ArrowUp"
      if (su || e.key === "ArrowDown") {
        e.preventDefault()
        setSceltaTendina({ nome: tendina.nome, indice: (tendina.attiva + (su ? -1 : 1) + tendina.voci.length) % tendina.voci.length })
        return
      }
      if (e.key === "Tab" && !e.shiftKey) {
        e.preventDefault()
        completa(tendina.voci[tendina.attiva]!)
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        setSerrata(testo)
        return
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        scegliComando(tendina.voci[tendina.attiva]!)
        return
      }
    }
    if (e.key !== "Enter" || e.shiftKey) return
    e.preventDefault()
    invia()
  }

  const incolla = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = [...e.clipboardData.files]
    if (files.length > 0) {
      e.preventDefault()
      allegati.aggiungi(files)
      return
    }
    // Un file copiato in Esplora risorse non arriva alla pagina come file: nell'app lo legge l'app dagli appunti.
    const ponte = ponteAppunti()
    if (!ponte || e.clipboardData.types.some((t) => t === "text/plain" || t === "text/html")) return
    e.preventDefault()
    setErrore(null)
    ponte.percorsi().then(allegati.aggiungiLocali, (err: unknown) => setErrore(fraseDelRifiuto(err)))
  }

  const ferma = () => {
    setErrore(null)
    negozio.ferma().catch((e: unknown) => setErrore(e instanceof Error ? e.message : String(e)))
  }

  return (
    <div className={styles.compositore}>
      {tendina && <Tendina voci={tendina.voci} attiva={tendina.attiva} id={idTendina} nota={notaTendina} onScegli={completa} onRiprova={() => void comandiChat.rileggi()} />}
      {allegati.allegati.length > 0 && (
        <ul className={styles.allegati} aria-label={t("Allegati", "Attachments")}>
          {allegati.allegati.map((a) => (
            <li key={a.chiave} className={styles.allegato} data-stato={a.errore ? "errore" : a.percorso ? "pronto" : "sale"} title={a.errore ?? a.nome}>
              {a.anteprima ? <img src={a.anteprima} alt={a.nome} /> : <IconaChat nome="file" dimensione={22} />}
              <span className={styles.nomeAllegato}>{a.errore ? t("Non caricato: {errore}", "Not uploaded: {errore}", { errore: a.errore }) : a.percorso ? a.nome : `${a.nome}…`}</span>
              <button type="button" onClick={() => allegati.togli(a.chiave)} aria-label={t("Togli l'allegato {nome}", "Remove attachment {nome}", { nome: a.nome })}>
                <IconaChat nome="croce" dimensione={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.riga}>
        <textarea
          ref={campo}
          className={styles.campo}
          rows={2}
          value={testo}
          onChange={(e) => (dettato.current.tocca(), setTesto(e.target.value))}
          onKeyDown={tasto}
          onPaste={incolla}
          placeholder={segnaposto}
          aria-label={chi ? t("Messaggio per {chi}", "Message to {chi}", { chi }) : t("Messaggio", "Message")}
          aria-autocomplete={tendina ? "list" : undefined}
          aria-controls={tendina ? idTendina : undefined}
          aria-activedescendant={tendina ? idOpzione(idTendina, tendina.attiva) : undefined}
        />
      </div>
      {microfono.striscia}
      <div className={styles.barra}>
        <input ref={scelta} type="file" multiple hidden onChange={(e) => (allegati.aggiungi([...(e.target.files ?? [])]), (e.target.value = ""))} aria-label={t("Scegli i file da allegare", "Choose files to attach")} />
        <button type="button" className={styles.icona} onClick={() => scelta.current?.click()} aria-label={t("Allega un file", "Attach a file")} title={t("Allega un file (o incollalo, o trascinalo qui)", "Attach a file (or paste it, or drag it here)")}>
          <IconaChat nome="allegato" />
        </button>
        {microfono.bottone}
        <span className={styles.aiuto}>{allegati.staSalendo ? t("Sto caricando i file…", "Uploading files…") : t("Invio manda, Maiusc+Invio va a capo", "Enter sends, Shift+Enter adds a line")}</span>
        {lavora && (
          <button type="button" className={styles.ferma} onClick={ferma}>
            <IconaChat nome="ferma" dimensione={16} />
            {t("Ferma", "Stop")}
          </button>
        )}
        <button type="button" className={styles.invia} onClick={() => invia()} disabled={!puoMandare(testo)} aria-label={t("Manda", "Send")} title={lavora ? t("Va in coda", "It will be queued") : t("Manda", "Send")}>
          <IconaChat nome="invio" />
        </button>
      </div>
      {errore && (
        <p className={styles.errore} role="alert">
          {errore}
        </p>
      )}
    </div>
  )
}
