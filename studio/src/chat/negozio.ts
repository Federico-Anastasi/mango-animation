// Lo stato della chat: un solo proprietario in memoria, tenuto uguale al server dagli eventi `chat`
// (`docs/CHAT.md`). Finché nessuno lo guarda non ascolta niente; non rilegge mai su un timer.
import { useSyncExternalStore } from "react"
import { ErroreApi } from "../api"
import { ascoltaCanale } from "../canale"
import { creaCopia } from "../dati"
import { t } from "../lingua"
import { istante } from "../testo"
import { apiChat, type NuovoMessaggio } from "./api"
import { correggi, leggiPredefinite, MODELLO_PREDEFINITO, modelliChat, modelliLetti, opusPiuRecente, ricordaPredefinite } from "./modelli"
import { MOTORE_CHAT, motoreDi } from "./motore"
import type { ContestoUsato, DettaglioConversazione, EventoChat, ImpostazioniChat, Messaggio, Richiesta, SceltaRisposta, StatoConversazione, TaskChat, TempoDiLavoro, VoceConversazione } from "./tipi"

const lavoroDa = (l: TempoDiLavoro): StatoNegozio["lavoro"] => ({ ms: l.ms, da: l.da === null ? null : istante(l.da) })

/** Un messaggio mandato e non ancora tornato dal server: si vede subito, in coda. */
export interface Inviato {
  chiave: number
  messaggio: NuovoMessaggio
  /** Quanti messaggi del creator con lo stesso testo c'erano quando è partito: quando ce n'è uno in più, è tornato. */
  gia: number
  errore: string | null
  /** Solo Claude Code: per ciò che chiede il browser del creator, che Mango Code non ha. */
  soloClaudeCode?: boolean
  /** Una conversazione nuova parte con l'Opus più recente (o «Predefinito» se non c'è), a meno che il creator abbia scelto Mango Code. */
  modelloGrande?: boolean
}

export interface StatoNegozio extends ImpostazioniChat {
  id: string | null
  caricato: boolean
  errore: string | null
  titolo: string
  attiva: boolean
  stato: StatoConversazione
  /** L'istante (ms) in cui è cominciato il giro in cui Claude lavora; `null` se non lavora. */
  lavoraDa: number | null
  /** Il lavoro di tutta la conversazione: `ms` già fatti, più il tratto in corso dall'istante `da` (ms), `null` se Claude non lavora. */
  lavoro: { ms: number; da: number | null }
  messaggi: Messaggio[]
  inAttesa: Richiesta[]
  /** I lavori che Claude Code ha in corso, in primo piano e in background. */
  task: TaskChat[]
  contestoUsato: ContestoUsato | null
  inviati: Inviato[]
  /** Perché l'ultima scelta di modello o effort non è andata. */
  erroreImpostazioni: string | null
}

const CHIAVE_CORRENTE = "mango-animation.chat.corrente"

function leggiCorrente(): string | null {
  try {
    return localStorage.getItem(CHIAVE_CORRENTE)
  } catch {
    return null
  }
}

function ricordaCorrente(id: string | null): void {
  try {
    if (id === null) localStorage.removeItem(CHIAVE_CORRENTE)
    else localStorage.setItem(CHIAVE_CORRENTE, id)
  } catch {
    // Senza memoria nel browser la conversazione vale per questa apertura e basta.
  }
}

/** Una conversazione nuova parte con l'ultima scelta di modello ed effort; una già fatta ha la sua, che arriva dal server. */
const vuoto = (id: string | null): StatoNegozio => ({
  id,
  caricato: false,
  errore: null,
  titolo: "",
  attiva: false,
  stato: "pronta",
  lavoraDa: null,
  lavoro: { ms: 0, da: null },
  messaggi: [],
  inAttesa: [],
  task: [],
  contestoUsato: null,
  inviati: [],
  erroreImpostazioni: null,
  ...(id === null ? leggiPredefinite() : { modello: null, effort: null }),
})

const testoDelMessaggio = (m: Messaggio): string =>
  m.parti
    .flatMap((p) => (p.tipo === "testo" ? [p.testo] : []))
    .join("\n")
    .trim()

const quantiDelCreator = (messaggi: Messaggio[], testo: string): number => messaggi.filter((m) => m.ruolo === "utente" && testoDelMessaggio(m) === testo.trim()).length

class Negozio {
  private stato: StatoNegozio = vuoto(leggiCorrente())
  private ascoltatori = new Set<() => void>()
  private smetti: (() => void) | null = null
  private prossimaChiave = 1
  private ricaricaPresto: ReturnType<typeof setTimeout> | null = null
  private versione = 0

  leggi = (): StatoNegozio => this.stato

  iscriviti = (ascolta: () => void): (() => void) => {
    this.ascoltatori.add(ascolta)
    if (this.ascoltatori.size === 1) this.avvia()
    return () => {
      this.ascoltatori.delete(ascolta)
      if (this.ascoltatori.size > 0) return
      this.smetti?.()
      this.smetti = null
      if (this.ricaricaPresto) clearTimeout(this.ricaricaPresto)
      this.ricaricaPresto = null
    }
  }

  private imposta(nuovo: StatoNegozio): void {
    this.stato = nuovo
    this.ascoltatori.forEach((a) => a())
  }

  private avvia(): void {
    let caduto = false
    this.smetti = ascoltaCanale({
      evento: (e) => {
        if (e.tipo === "chat") this.applica(e)
      },
      errore: () => {
        caduto = true
      },
      aperta: () => {
        if (!caduto) return
        caduto = false
        void this.carica()
      },
    })
    if (this.stato.id !== null && !this.stato.caricato) void this.carica()
  }

  /** Si apre una conversazione (o, con `null`, una nuova, che nasce al primo messaggio). */
  apri(id: string | null): void {
    ricordaCorrente(id)
    this.versione += 1
    this.imposta(vuoto(id))
    if (id !== null && this.ascoltatori.size > 0) void this.carica()
  }

  async carica(): Promise<void> {
    const id = this.stato.id
    if (id === null) return
    const versione = this.versione
    try {
      const d = await apiChat.conversazione(id)
      if (versione !== this.versione) return
      this.imposta(this.dalDettaglio(d))
    } catch (e) {
      if (versione !== this.versione) return
      if (e instanceof ErroreApi && e.codice === 404) {
        // I messaggi non ancora tornati non spariscono: dicono perché non sono partiti, e «Riprova» ne comincia una nuova.
        const perso = t("Quella conversazione non c'è più sul computer. Riprova per cominciarne una nuova.", "That conversation is no longer on the computer. Try again to start a new one.")
        const inviati = this.stato.inviati.map((i) => ({ ...i, errore: i.errore ?? perso }))
        this.apri(null)
        this.imposta({ ...this.stato, inviati })
        return
      }
      this.imposta({ ...this.stato, caricato: true, errore: e instanceof Error ? e.message : String(e) })
    }
  }

  private dalDettaglio(d: DettaglioConversazione): StatoNegozio {
    return this.senzaRitornati({ ...this.stato, id: d.id, caricato: true, errore: null, titolo: d.titolo, attiva: d.attiva, stato: d.stato, lavoraDa: d.lavora_da ? istante(d.lavora_da) : null, lavoro: lavoroDa(d.lavoro), modello: d.modello, effort: d.effort, messaggi: d.messaggi, inAttesa: d.in_attesa, task: d.task, contestoUsato: d.contesto_usato })
  }

  /** Toglie dagli inviati quelli che il server ha già messo fra i messaggi. */
  private senzaRitornati(s: StatoNegozio): StatoNegozio {
    const inviati = s.inviati.filter((i) => quantiDelCreator(s.messaggi, i.messaggio.testo ?? "") <= i.gia)
    return inviati.length === s.inviati.length ? s : { ...s, inviati }
  }

  applica(e: EventoChat): void {
    if (e.evento === "elenco") return
    if (e.id !== this.stato.id) return
    if (e.evento === "stato") {
      const lavoraDa = e.stato === "pronta" || e.stato === "errore" ? null : e.da ? (istante(e.da) ?? this.stato.lavoraDa) : this.stato.lavoraDa
      this.imposta({ ...this.stato, attiva: this.stato.attiva || e.stato === "lavora" || e.stato === "aspetta", stato: e.stato, lavoraDa, lavoro: lavoroDa(e.lavoro), inAttesa: e.stato === "aspetta" ? this.stato.inAttesa : [] })
      return
    }
    if (e.evento === "titolo") {
      this.imposta({ ...this.stato, titolo: e.titolo })
      return
    }
    if (e.evento === "chiusa") {
      this.imposta(this.dopoLaChiusura(this.stato))
      return
    }
    if (e.evento === "impostazioni") {
      this.imposta({ ...this.stato, modello: e.modello, effort: e.effort })
      return
    }
    if (e.evento === "task") {
      this.imposta({ ...this.stato, task: e.task })
      return
    }
    if (e.evento === "contesto_usato") {
      this.imposta({ ...this.stato, contestoUsato: e.contesto_usato })
      return
    }
    if (e.evento === "richiesta") {
      const altre = this.stato.inAttesa.filter((r) => r.id !== e.richiesta.id)
      this.imposta({ ...this.stato, stato: "aspetta", inAttesa: [...altre, e.richiesta] })
      return
    }
    if (e.evento === "risposta") {
      this.imposta({ ...this.stato, inAttesa: this.stato.inAttesa.filter((r) => r.id !== e.richiesta) })
      return
    }
    if (e.evento === "messaggio") {
      const posto = this.stato.messaggi.findIndex((m) => m.id === e.messaggio.id)
      const messaggi = posto < 0 ? [...this.stato.messaggi, e.messaggio] : this.stato.messaggi.map((m, i) => (i === posto ? e.messaggio : m))
      this.imposta(this.senzaRitornati({ ...this.stato, messaggi }))
      return
    }
    const posto = this.stato.messaggi.findIndex((m) => m.id === e.messaggio)
    if (posto < 0) {
      this.ricarica()
      return
    }
    const messaggio = this.stato.messaggi[posto]!
    const parti = [...messaggio.parti]
    parti[Math.min(e.indice, parti.length)] = e.parte
    this.imposta(this.senzaRitornati({ ...this.stato, messaggi: this.stato.messaggi.map((m, i) => (i === posto ? { ...messaggio, parti } : m)) }))
  }

  /** Chiusa, la conversazione non fa più niente: niente richieste in attesa, niente lavori, e il tratto di lavoro in corso è finito. */
  private dopoLaChiusura(s: StatoNegozio): StatoNegozio {
    const ms = s.lavoro.ms + (s.lavoro.da === null ? 0 : Math.max(0, Date.now() - s.lavoro.da))
    return { ...s, attiva: false, stato: "pronta", lavoraDa: null, lavoro: { ms, da: null }, inAttesa: [], task: [] }
  }

  /** Una parte di un messaggio che non si conosce (un evento perso): si rilegge la conversazione, una volta sola per raffica. */
  private ricarica(): void {
    if (this.ricaricaPresto) return
    this.ricaricaPresto = setTimeout(() => {
      this.ricaricaPresto = null
      void this.carica()
    }, 120)
  }

  async invia(messaggio: NuovoMessaggio, opzioni: { soloClaudeCode?: boolean } = {}): Promise<void> {
    const inviato: Inviato = { chiave: this.prossimaChiave++, messaggio, gia: quantiDelCreator(this.stato.messaggi, messaggio.testo ?? ""), errore: null, ...opzioni }
    this.imposta({ ...this.stato, inviati: [...this.stato.inviati, inviato] })
    await this.spedisci(inviato)
  }

  async riprova(chiave: number): Promise<void> {
    const inviato = this.stato.inviati.find((i) => i.chiave === chiave)
    if (!inviato) return
    this.segna(chiave, null)
    await this.spedisci(inviato)
  }

  togli(chiave: number): void {
    this.imposta({ ...this.stato, inviati: this.stato.inviati.filter((i) => i.chiave !== chiave) })
  }

  private segna(chiave: number, errore: string | null): void {
    this.imposta({ ...this.stato, inviati: this.stato.inviati.map((i) => (i.chiave === chiave ? { ...i, errore } : i)) })
  }

  private async spedisci(inviato: Inviato): Promise<void> {
    const id = this.stato.id
    try {
      if (id === null) {
        const { modello, effort } = this.stato
        // Una scelta per questa conversazione sola: quella ricordata per le prossime resta com'è.
        const daClaude = motoreDi(modello).id === MOTORE_CHAT.id
        const scelta =
          inviato.modelloGrande && daClaude
            ? { modello: opusPiuRecente((await modelliLetti()) ?? [])?.id ?? MODELLO_PREDEFINITO }
            : inviato.soloClaudeCode && !daClaude
              ? { modello: MODELLO_PREDEFINITO }
              : { ...(modello === null ? {} : { modello }), ...(effort === null ? {} : { effort }) }
        const { id: nuovo } = await apiChat.nuova(inviato.messaggio, scelta)
        ricordaCorrente(nuovo)
        this.versione += 1
        this.imposta({ ...this.stato, id: nuovo, attiva: true, stato: "lavora", lavoraDa: this.stato.lavoraDa ?? Date.now(), lavoro: { ms: this.stato.lavoro.ms, da: this.stato.lavoro.da ?? Date.now() } })
        await this.carica()
      } else {
        // «Lavora» prima di mandare: un comando locale finisce prima che la POST torni, e il suo evento «pronta» deve venire dopo.
        const prima = this.stato
        if (prima.stato === "pronta") this.imposta({ ...prima, stato: "lavora", lavoraDa: Date.now(), lavoro: { ms: prima.lavoro.ms, da: Date.now() } })
        try {
          await apiChat.manda(id, inviato.messaggio)
        } catch (e) {
          if (this.stato.id === id && prima.stato === "pronta" && this.stato.stato === "lavora") this.imposta({ ...this.stato, stato: "pronta", lavoraDa: prima.lavoraDa, lavoro: prima.lavoro })
          throw e
        }
        if (this.stato.id === id && !this.stato.attiva) this.imposta({ ...this.stato, attiva: true })
      }
    } catch (e) {
      this.segna(inviato.chiave, e instanceof Error ? e.message : String(e))
    }
  }

  /** Cambia modello o effort: della conversazione aperta (il server dice come sono rimasti) e di quelle nuove. Torna `null` se la scelta è andata, altrimenti la frase che dice perché no (la stessa di `erroreImpostazioni`). */
  async scegli(scelta: Partial<ImpostazioniChat>): Promise<string | null> {
    const { id } = this.stato
    const versione = this.versione
    this.imposta({ ...this.stato, erroreImpostazioni: null })
    try {
      const nuove = id === null ? correggi(modelliChat.stato().dato ?? [], this.stato, scelta) : await apiChat.impostazioni(id, scelta)
      if (versione !== this.versione) return null
      this.imposta({ ...this.stato, ...nuove })
      ricordaPredefinite(nuove)
      return null
    } catch (e) {
      const frase = e instanceof Error ? e.message : String(e)
      if (versione === this.versione) this.imposta({ ...this.stato, erroreImpostazioni: frase })
      return frase
    }
  }

  /** Chiude la conversazione: Claude si ferma e il suo processo si spegne; un messaggio la riapre. */
  async chiudi(): Promise<void> {
    const { id } = this.stato
    if (id === null) return
    await apiChat.chiudi(id)
    if (this.stato.id === id) this.imposta(this.dopoLaChiusura(this.stato))
  }

  async ferma(): Promise<void> {
    if (this.stato.id === null) return
    await apiChat.ferma(this.stato.id)
  }

  async inBackground(): Promise<void> {
    if (this.stato.id !== null) await apiChat.inBackground(this.stato.id)
  }

  async fermaTask(task: string): Promise<void> {
    if (this.stato.id !== null) await apiChat.fermaTask(this.stato.id, task)
  }

  async rispondi(richiesta: string, risposta: SceltaRisposta): Promise<void> {
    if (this.stato.id === null) return
    try {
      await apiChat.rispondi(this.stato.id, richiesta, risposta)
    } catch (e) {
      // Una richiesta che il server non ha più (risposta altrove, o fermata): si rilegge, e sparisce da sé.
      if (e instanceof ErroreApi && e.codice === 404) await this.carica()
      throw e
    }
    const inAttesa = this.stato.inAttesa.filter((r) => r.id !== richiesta)
    this.imposta({ ...this.stato, inAttesa, stato: inAttesa.length === 0 && this.stato.stato === "aspetta" ? "lavora" : this.stato.stato })
  }
}

export const negozio = new Negozio()

export function useChat(): StatoNegozio {
  return useSyncExternalStore(negozio.iscriviti, negozio.leggi)
}

export const elencoChat = creaCopia<VoceConversazione[]>(apiChat.elenco, (e) => e.tipo === "chat" && e.evento === "elenco")
