// La dettatura: il ponte che l'app Mango Animation mette nella pagina (`window.__MANGO_ANIMATION__.voce`) e il
// testo che ne arriva. Nel browser il ponte non c'è, e il microfono non compare.
import { useCallback, useEffect, useRef, useState } from "react"
import type { PonteCartella } from "../impostazioni/cartellaDati"
import type { PonteComputer } from "../motori/computer"
import type { PonteSegnalazione } from "../segnalazione/ponte"
import type { PonteAppunti } from "./appunti"
import type { PonteTrascinamento } from "./trascinamento"
import { lingua, t, type Lingua } from "../lingua"

/** Ogni evento porta l'`id` della dettatura a cui appartiene: quello che `avvia` restituisce. */
export type EventoVoce = { id: number } & (
  | { tipo: "ascolto" | "preparo" | "fine" }
  | { tipo: "livello"; valore: number }
  | { tipo: "parziale" | "definitiva"; testo: string }
  | { tipo: "errore"; messaggio: string }
)

export interface PonteVoce {
  /** Ogni comando dice la lingua dello studio: le frasi di errore dell'app e del suo motore escono in quella. */
  stato: (lingua: Lingua) => Promise<{ disponibile: boolean; in_ascolto: boolean }>
  avvia: (lingua: Lingua) => Promise<number>
  ferma: (lingua: Lingua) => Promise<void>
  su: (ascolta: (evento: EventoVoce) => void) => () => void
}

declare global {
  interface Window {
    __MANGO_ANIMATION__?: { voce?: PonteVoce; cartellaDati?: PonteCartella; appunti?: PonteAppunti; computer?: PonteComputer; segnalazione?: PonteSegnalazione; trascinamento?: PonteTrascinamento }
  }
}

const ponteVoce = (): PonteVoce | null => window.__MANGO_ANIMATION__?.voce ?? null

const codiceDi = (e: unknown): unknown => (typeof e === "object" && e !== null ? (e as { code?: unknown }).code : undefined)

/** Il testo di un rifiuto del ponte (`{ code, message }`). */
function messaggioDi(e: unknown): string {
  const m = typeof e === "object" && e !== null ? (e as { message?: unknown }).message : e
  return typeof m === "string" && m !== "" ? m : t("La dettatura non risponde.", "Dictation is not responding.")
}

export interface Posizione {
  da: number
  a: number
}

export interface Scritto {
  testo: string
  cursore: number
}

/** `frase` messa nel testo al posto della selezione `da`-`a`, con uno spazio dove si attaccherebbe alle parole accanto. Dà il testo nuovo, dove sta il cursore dopo e dove sta la frase. */
export function inserisciFrase(testo: string, da: number, a: number, frase: string): Scritto & { frase: Posizione } {
  const prima = testo.slice(0, da)
  const dopo = testo.slice(a)
  const davanti = prima !== "" && !/\s$/.test(prima) ? " " : ""
  const dietro = dopo !== "" && !/^\s/.test(dopo) ? " " : ""
  const dentro = frase.trim()
  const inizio = prima.length + davanti.length
  return { testo: prima + davanti + dentro + dietro + dopo, cursore: inizio + dentro.length, frase: { da: inizio, a: inizio + dentro.length } }
}

/**
 * Le parole che arrivano mentre il creator parla, dentro il campo: la frase in corso sta nel testo, nel punto del cursore, e si
 * sostituisce man mano che cresce; quando è finita si chiude e la successiva comincia dopo. Se il creator scrive mentre detta,
 * ciò che c'è nel campo è suo e la frase in corso riparte dal cursore di adesso, senza ripetere ciò che c'è già.
 */
export class Dettato {
  private regione: Posizione | null = null
  /** Il testo della frase in corso, come l'ha dato il servizio. */
  private servizio = ""
  /** Quanto di quel testo è già testo normale del campo. */
  private usato = 0

  /** Il creator ha scritto. */
  tocca(): void {
    this.usato = this.servizio.length
    this.regione = null
  }

  /** Una dettatura nuova: niente di quella di prima. */
  riparti(): void {
    this.servizio = ""
    this.usato = 0
    this.regione = null
  }

  /** La frase in corso è `testo` (tutta, dall'inizio). `cursore` è dove metterla se non ha ancora un posto. Niente da cambiare: `null`. */
  parziale(campo: string, cursore: Posizione, testo: string): Scritto | null {
    this.servizio = testo
    return this.metti(campo, cursore, testo.slice(this.usato).trim())
  }

  /** La frase è finita: `testo` è quella vera, e la prossima comincia da capo. */
  definitiva(campo: string, cursore: Posizione, testo: string): Scritto | null {
    const scritto = this.metti(campo, cursore, testo.slice(this.usato).trim())
    this.riparti()
    return scritto
  }

  private metti(campo: string, cursore: Posizione, resto: string): Scritto | null {
    if (this.regione) {
      const { da, a } = this.regione
      this.regione = { da, a: da + resto.length }
      return { testo: campo.slice(0, da) + resto + campo.slice(a), cursore: da + resto.length }
    }
    if (resto === "") return null
    const dentro = inserisciFrase(campo, cursore.da, cursore.a, resto)
    this.regione = dentro.frase
    return { testo: dentro.testo, cursore: dentro.cursore }
  }
}

/** Cosa la dettatura fa del testo: lo scrive nel campo. */
export interface ScriviDettato {
  parziale: (testo: string) => void
  definitiva: (testo: string) => void
  /** Una dettatura nuova comincia. */
  nuova: () => void
}

export type Fase = "ferma" | "avvio" | "ascolta"

export function useDettatura(scrivi: ScriviDettato) {
  const ponte = ponteVoce()
  const [fase, setFase] = useState<Fase>("ferma")
  const [secondi, setSecondi] = useState(0)
  const [livello, setLivello] = useState(0)
  const [errore, setErrore] = useState<string | null>(null)
  // Il motore sta caricando il modello: il microfono ascolta già, il testo arriva appena è pronto.
  const [prepara, setPrepara] = useState(false)
  const ultimo = useRef(scrivi)
  ultimo.current = scrivi
  const fasePronta = useRef(fase)
  fasePronta.current = fase
  // La dettatura di cui si ascoltano gli eventi: dopo lo stop le ultime parole arrivano ancora, una dettatura nuova le
  // sostituisce. Finché `avvia` non ha detto l'id della nuova, gli eventi aspettano in `inAttesa`.
  const attiva = useRef<number | null>(null)
  const inAttesa = useRef<EventoVoce[]>([])
  // Il messaggio è partito mentre il microfono si apriva: appena aperto si richiude.
  const daSpegnere = useRef(false)

  const tratta = useCallback((e: EventoVoce) => {
    if (e.tipo === "livello") setLivello(fasePronta.current === "ascolta" ? e.valore : 0)
    else if (e.tipo === "preparo") setPrepara(true)
    else if (e.tipo === "ascolto") setPrepara(false)
    else if (e.tipo === "parziale") ultimo.current.parziale(e.testo)
    else if (e.tipo === "definitiva") ultimo.current.definitiva(e.testo)
    else if (e.tipo === "errore") setErrore(e.messaggio)
    else if (e.tipo === "fine") {
      setPrepara(false)
      if (fasePronta.current === "ascolta") {
        // il motore si è chiuso da solo
        setFase("ferma")
        setLivello(0)
      }
    }
  }, [])

  useEffect(() => {
    if (!ponte) return
    const smetti = ponte.su((e) => {
      if (fasePronta.current === "avvio") return void inAttesa.current.push(e)
      // pagina ricaricata a dettatura accesa: si segue quella che c'è
      if (attiva.current === null && fasePronta.current === "ascolta") attiva.current = e.id
      if (e.id === attiva.current) tratta(e)
    })
    ponte.stato(lingua()).then((s) => s.in_ascolto && fasePronta.current === "ferma" && setFase("ascolta"), () => undefined)
    return () => {
      smetti()
      // Chiusa la chat il microfono non resta acceso, nemmeno se si sta ancora aprendo.
      if (fasePronta.current === "ascolta") ponte.ferma(lingua()).catch(() => undefined)
      else if (fasePronta.current === "avvio") daSpegnere.current = true
    }
  }, [ponte, tratta])

  useEffect(() => {
    if (fase !== "ascolta") return
    setSecondi(0)
    const inizio = Date.now()
    const orologio = setInterval(() => setSecondi(Math.floor((Date.now() - inizio) / 1000)), 250)
    return () => clearInterval(orologio)
  }, [fase])

  // Si torna subito a riposo: le ultime parole entrano nel campo quando arrivano, senza che niente le aspetti.
  const ferma = useCallback(async () => {
    if (!ponte) return
    fasePronta.current = "ferma"
    setFase("ferma")
    setLivello(0)
    setPrepara(false)
    await ponte.ferma(lingua()).catch((e: unknown) => {
      if (codiceDi(e) !== "non_in_ascolto") setErrore(messaggioDi(e))
    })
  }, [ponte])

  /** Il messaggio è partito: la dettatura finisce, e ciò che il servizio consegna dopo non entra più nel campo. */
  const spegni = useCallback(() => {
    if (fasePronta.current === "avvio") daSpegnere.current = true
    if (fasePronta.current !== "ascolta") return
    attiva.current = null
    void ferma()
  }, [ferma])

  const alterna = useCallback(async () => {
    if (!ponte || fasePronta.current === "avvio") return
    setErrore(null)
    if (fasePronta.current === "ascolta") return ferma()
    fasePronta.current = "avvio"
    setFase("avvio")
    inAttesa.current = []
    daSpegnere.current = false
    try {
      const id = await ponte.avvia(lingua())
      if (daSpegnere.current) return void ferma()
      attiva.current = id
      ultimo.current.nuova()
      fasePronta.current = "ascolta"
      setFase("ascolta")
      inAttesa.current.filter((e) => e.id === id).forEach(tratta)
    } catch (e) {
      if (codiceDi(e) === "gia_in_ascolto") {
        if (daSpegnere.current) return void ferma()
        attiva.current = null
        fasePronta.current = "ascolta"
        return setFase("ascolta")
      }
      setErrore(messaggioDi(e))
      fasePronta.current = "ferma"
      setFase("ferma")
    } finally {
      inAttesa.current = []
    }
  }, [ponte, tratta, ferma])

  return { disponibile: ponte !== null, fase, secondi, livello, errore, prepara, alterna, spegni }
}
