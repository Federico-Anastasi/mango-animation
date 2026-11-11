// Le conversazioni con Claude Code: l'unico proprietario in memoria di quelle aperte e dell'elenco di quelle sul disco.
import { randomUUID } from "node:crypto"
import type { Eventi } from "../eventi"
import { frase, type Lingua, type Testo } from "../lingua"
import { collegaAllegato, ingressoPerClaude, leggiContesto, partiDelCreator, rigaDiContesto, risolviAllegati, salvaAllegato, testoVisibile } from "./allegati"
import { eComando, ElencoComandi, rifiutaIlComandoDelloStudio, type ComandoChat } from "./comandi"
import { CONVERSAZIONE_CHIUSA, Conversazione } from "./conversazione"
import { LetturaDiClaudeCode } from "./lettura"
import { ElencoModelli } from "./modelli"
import { eAvvio, ingressoDiAvvio, leggiAvvio, TITOLO_PRIMO_GIRO } from "./primoGiro"
import { contestoDaSessione, eDelPrimoGiro, messaggiDaSessione } from "./storico"
import { abbrevia, type Oggetto } from "./traduzione"
import { lavoroDeiGiri } from "./trascrizione"
import { eDiMangoCode } from "./mangocode"
import { ErroreChat, type ContestoUsato, type DatiEventoChat, type DettaglioChat, type ImpostazioniChat, type MessaggioChat, type ModelloChat, type OpzioniChat, type VoceElenco, type VoceSessione } from "./tipi"

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NON_TROVATA = frase("Non c'è una conversazione con questo id: guarda l'elenco delle conversazioni.", "There is no conversation with this id: look at the list of conversations.")
const SENZA_TITOLO = frase("Conversazione senza titolo", "Untitled conversation")
const TITOLO_NUOVA = frase("Nuova conversazione", "New conversation")

export interface DipendenzeChat {
  /** La cartella del prodotto: ne arrivano il metodo e lo strumento «video». */
  codice: string
  /** La cartella in cui lavora Claude. */
  lavoro: string
  archivio: string
  eventi: Eventi
  opzioni: OpzioniChat
  titoloDelVideo: (slug: string) => string | undefined
  adesso: () => Date
  /** La lingua dello studio, per le frasi che nascono fuori da una richiesta (l'errore di un giro, la richiesta di un permesso). */
  lingua: () => Lingua
}

const titoloDa = (testo: string): Testo => (eAvvio(testo) ? TITOLO_PRIMO_GIRO : abbrevia(testoVisibile(testo)) || SENZA_TITOLO)

export class Chat {
  private readonly attive = new Map<string, Conversazione>()
  private readonly aperture = new Map<string, Promise<Conversazione>>()
  private elencoDisco: VoceSessione[] = []
  private elencoVecchio = true
  private lettura: Promise<void> | null = null
  private osservatore: Promise<{ chiudi: () => void }> | null = null
  private readonly elencoModelli: ElencoModelli
  private readonly elencoComandi: ElencoComandi
  /** Le chiusure in corso: chi apre la stessa conversazione aspetta che finiscano. */
  private readonly chiusure = new Map<string, Promise<void>>()

  /** Le conversazioni di Mango Code fra quelle aperte o lette: le altre sono di Claude Code. */
  private readonly diMangoCode = new Set<string>()

  /** Mango Code che si accende o si spegne cambia i modelli offerti: lo studio rilegge l'elenco all'evento `modelli`. */
  private readonly accensioniDiMangoCode: { chiudi: () => void } | null

  constructor(private readonly d: DipendenzeChat) {
    const lettura = new LetturaDiClaudeCode(d.opzioni.query, d.lavoro)
    this.elencoModelli = new ElencoModelli(lettura, () => d.opzioni.mangoCode.modelli(d.lavoro))
    this.elencoComandi = new ElencoComandi(lettura)
    this.accensioniDiMangoCode = d.opzioni.mangoCode.osserva(() => d.eventi.emetti({ tipo: "modelli" }))
  }

  private emetti(id: string, dati: DatiEventoChat): void {
    this.d.eventi.emetti({ tipo: "chat", id, ...dati })
  }

  // --- L'elenco -------------------------------------------------------------------------------

  /** Chi guarda l'elenco ne segue anche i cambi: il file di una conversazione che cambia (anche da terminale) lo rende da rileggere. */
  private async seguiLeConversazioni(): Promise<void> {
    this.osservatore ??= this.d.opzioni.sessioni.osserva((id) => {
      this.elencoVecchio = true
      // Una conversazione aperta qui annuncia da sola i suoi cambi.
      if (!this.attive.has(id)) this.emetti(id, { evento: "elenco" })
    })
    try {
      await this.osservatore
    } catch (errore) {
      this.osservatore = null
      throw errore
    }
  }

  private async aggiornaElenco(): Promise<void> {
    await this.seguiLeConversazioni()
    if (!this.elencoVecchio) return this.lettura ?? Promise.resolve()
    this.lettura ??= (async () => {
      this.elencoVecchio = false
      try {
        const [diClaude, diMango] = await Promise.all([this.d.opzioni.sessioni.elenca(), this.d.opzioni.mangoCode.elenca()])
        diMango.forEach((s) => this.diMangoCode.add(s.id))
        this.elencoDisco = [...diClaude, ...diMango]
      } catch (errore) {
        this.elencoVecchio = true
        throw errore
      } finally {
        this.lettura = null
      }
    })()
    return this.lettura
  }

  async elenco(): Promise<VoceElenco[]> {
    await this.aggiornaElenco()
    const voci = new Map<string, { voce: VoceElenco; ms: number }>()
    for (const s of this.elencoDisco) voci.set(s.id, { voce: { id: s.id, titolo: titoloDa(s.titolo), aggiornata: new Date(s.aggiornata).toISOString(), attiva: false }, ms: s.aggiornata })
    for (const c of this.attive.values()) {
      const sulDisco = voci.get(c.id)
      const ms = Math.max(c.aggiornata, sulDisco?.ms ?? 0)
      voci.set(c.id, { voce: { id: c.id, titolo: (c.rinominata ? c.titolo : sulDisco?.voce.titolo || c.titolo) || TITOLO_NUOVA, aggiornata: new Date(ms).toISOString(), attiva: c.attiva }, ms })
    }
    return [...voci.values()].sort((a, b) => b.ms - a.ms).map(({ voce }) => voce)
  }

  // --- Le conversazioni -----------------------------------------------------------------------

  private async diMango(id: string): Promise<boolean> {
    if (this.diMangoCode.has(id)) return true
    const sua = await this.d.opzioni.mangoCode.eSua(id)
    if (sua) this.diMangoCode.add(id)
    return sua
  }

  private async leggiDalFile(id: string): Promise<{ messaggi: MessaggioChat[]; titolo: string; aggiornata: number; contestoUsato: ContestoUsato | null; primoGiro: boolean }> {
    const diMango = await this.diMango(id)
    const righe = diMango ? await this.d.opzioni.mangoCode.leggi(id, this.d.lavoro) : await this.d.opzioni.sessioni.leggi(id)
    if (righe === null) throw new ErroreChat(404, NON_TROVATA)
    const messaggi = messaggiDaSessione(righe, this.d.archivio, this.d.lingua())
    const primo = messaggi.find((m) => m.ruolo === "utente")?.parti.find((p) => p.tipo === "testo")
    const ultimo = Date.parse(messaggi.at(-1)?.quando ?? "")
    const usati = contestoDaSessione(righe)
    // La finestra di Claude Code la dà solo Claude Code acceso, a fine giro; quella di Mango Code è scritta nei suoi modelli.
    const totale = usati !== null && diMango ? await this.d.opzioni.mangoCode.contestoDi(id, this.d.lavoro) : null
    const primoGiro = eDelPrimoGiro(righe)
    const titolo = primoGiro ? TITOLO_PRIMO_GIRO.in(this.d.lingua()) : primo?.tipo === "testo" ? abbrevia(primo.testo) : ""
    return { messaggi, titolo, aggiornata: Number.isNaN(ultimo) ? this.d.adesso().getTime() : ultimo, contestoUsato: usati === null ? null : { usati, totale }, primoGiro }
  }

  /** La conversazione aperta con questo id; se è chiusa si legge dal suo file e si prepara a riprendere. Una chiusura in corso si aspetta. */
  private async apri(id: string): Promise<Conversazione> {
    if (!ID.test(id)) throw new ErroreChat(404, NON_TROVATA)
    for (;;) {
      const chiusura = this.chiusure.get(id)
      if (chiusura) {
        await chiusura
        continue
      }
      const aperta = this.attive.get(id)
      if (aperta) return aperta
      const conversazione = await (this.aperture.get(id) ?? this.iniziaApertura(id))
      if (this.attive.get(id) === conversazione) return conversazione
    }
  }

  private iniziaApertura(id: string): Promise<Conversazione> {
    const apertura = (async () => {
      const { messaggi, titolo, aggiornata, contestoUsato, primoGiro } = await this.leggiDalFile(id)
      const conversazione = this.nuova(id, messaggi, true, titolo, aggiornata, contestoUsato, primoGiro)
      const diMango = await this.d.opzioni.mangoCode.modelloDi(id)
      if (diMango) conversazione.preimposta({ modello: diMango })
      this.attive.set(id, conversazione)
      return conversazione
    })().finally(() => this.aperture.delete(id))
    this.aperture.set(id, apertura)
    return apertura
  }

  /** Usa la conversazione aperta subito dopo averne controllato l'apertura: una chiusa nel frattempo non si usa, si riapre. */
  private async conAperta<T>(id: string, usa: (conversazione: Conversazione) => T): Promise<T> {
    for (;;) {
      const conversazione = await this.apri(id)
      if (this.attive.get(id) === conversazione) return usa(conversazione)
    }
  }

  private nuova(id: string, messaggi: MessaggioChat[], esiste: boolean, titolo: string, aggiornata: number, contestoUsato: ContestoUsato | null, primoGiro: boolean): Conversazione {
    const mango = this.diMangoCode.has(id)
    return new Conversazione({
      id,
      codice: this.d.codice,
      lavoro: this.d.lavoro,
      messaggi,
      contestoUsato,
      primoGiro,
      esiste,
      titolo,
      aggiornata,
      query: mango ? this.d.opzioni.mangoCode.query : this.d.opzioni.query,
      motore: mango ? "Mango Code" : "Claude Code",
      emetti: (chi, dati) => this.emetti(chi, dati),
      adesso: this.d.adesso,
      lingua: this.d.lingua,
      elencoCambiato: (chi) => this.emetti(chi, { evento: "elenco" }),
      comandiCambiati: (comandi) => {
        if (this.elencoComandi.sostituisci(comandi)) this.d.eventi.emetti({ tipo: "comandi" })
      },
    })
  }

  /** Controlla la richiesta di un messaggio e prepara ciò che serve a mostrarlo e a mandarlo. */
  private async preparaMessaggio(corpo: Oggetto) {
    for (const campo of Object.keys(corpo)) {
      if (campo !== "testo" && campo !== "allegati" && campo !== "contesto") {
        throw new ErroreChat(400, frase(`«${campo}» non è un campo del messaggio: ci sono «testo», «allegati» e «contesto».`, `«${campo}» is not a field of the message: the fields are «testo», «allegati» and «contesto».`))
      }
    }
    if (corpo["testo"] !== undefined && typeof corpo["testo"] !== "string") throw new ErroreChat(400, frase("Il «testo» del messaggio dev'essere un testo.", "The «testo» of the message must be text."))
    const testo = (corpo["testo"] ?? "").trim()
    const allegati = await risolviAllegati(this.d.archivio, corpo["allegati"])
    if (testo === "" && allegati.length === 0) throw new ErroreChat(400, frase("Il messaggio è vuoto: scrivi qualcosa o allega un file.", "The message is empty: write something or attach a file."))
    const riga = rigaDiContesto(leggiContesto(corpo["contesto"]), this.d.titoloDelVideo)
    return {
      testo,
      parti: partiDelCreator(testo, allegati),
      ingresso: await ingressoPerClaude(testo, riga, allegati),
      titolo: abbrevia(testo) || `Allegato: ${allegati[0]?.percorso.split("/").pop() ?? ""}`,
    }
  }

  async crea(corpo: Oggetto): Promise<string> {
    const { modello, effort, ...messaggio } = corpo
    const scelta = modello === undefined && effort === undefined ? {} : await this.elencoModelli.verifica({ ...(modello === undefined ? {} : { modello }), ...(effort === undefined ? {} : { effort }) }, { modello: null, effort: null })
    const avvio = leggiAvvio(messaggio)
    const { testo, parti, ingresso, titolo } = avvio
      ? { testo: "", parti: [], ingresso: ingressoDiAvvio(avvio, this.d.lingua()), titolo: TITOLO_PRIMO_GIRO.in(this.d.lingua()) }
      : await this.preparaMessaggio(messaggio)
    if (eComando(testo) && !eDiMangoCode(scelta.modello)) rifiutaIlComandoDelloStudio(testo)
    const id = randomUUID()
    if (eDiMangoCode(scelta.modello)) this.diMangoCode.add(id)
    const conversazione = this.nuova(id, [], false, "", this.d.adesso().getTime(), null, avvio !== undefined)
    conversazione.preimposta(scelta)
    this.attive.set(id, conversazione)
    conversazione.scrivi(parti, ingresso, titolo)
    return id
  }

  async scrivi(id: string, corpo: Oggetto): Promise<void> {
    if (!ID.test(id)) throw new ErroreChat(404, NON_TROVATA)
    const { testo, parti, ingresso, titolo } = await this.preparaMessaggio(corpo)
    if (eComando(testo) && !(await this.diMango(id))) rifiutaIlComandoDelloStudio(testo)
    await this.conAperta(id, (conversazione) => conversazione.scrivi(parti, ingresso, titolo))
  }

  async leggi(id: string): Promise<DettaglioChat> {
    if (!ID.test(id)) throw new ErroreChat(404, NON_TROVATA)
    await this.aggiornaElenco()
    const sulDisco = this.elencoDisco.find((s) => s.id === id)
    const titoloDi = (proprio: string): Testo => (sulDisco ? titoloDa(sulDisco.titolo) : proprio)
    await this.chiusure.get(id)
    const aperta = this.attive.get(id)
    if (aperta) return { id, titolo: aperta.rinominata ? aperta.titolo : titoloDi(aperta.titolo), attiva: aperta.attiva, stato: aperta.stato, lavora_da: aperta.lavoraDa, lavoro: aperta.lavoro, ...aperta.impostazioni, messaggi: aperta.messaggi, in_attesa: aperta.inAttesa, task: aperta.task.elenco, contesto_usato: aperta.contestoUsato, primo_giro: aperta.primoGiro }
    const { messaggi, titolo, contestoUsato, primoGiro } = await this.leggiDalFile(id)
    return { id, titolo: titoloDi(titolo), attiva: false, stato: "pronta", lavora_da: null, lavoro: { ms: lavoroDeiGiri(messaggi, false), da: null }, modello: await this.d.opzioni.mangoCode.modelloDi(id), effort: null, messaggi, in_attesa: [], task: [], contesto_usato: contestoUsato, primo_giro: primoGiro }
  }

  modelli(): Promise<ModelloChat[]> {
    return this.elencoModelli.elenca()
  }

  comandi(): Promise<ComandoChat[]> {
    return this.elencoComandi.elenca()
  }

  /** Modello ed effort di una conversazione, anche se è chiusa o solo nel suo file: valgono dal prossimo avvio. */
  async impostazioni(id: string, corpo: Oggetto): Promise<ImpostazioniChat> {
    if (!ID.test(id)) throw new ErroreChat(404, NON_TROVATA)
    const conversazione = await this.apri(id)
    const cambi = await this.elencoModelli.verifica(corpo, conversazione.impostazioni)
    if (cambi.modello !== undefined && eDiMangoCode(cambi.modello) !== this.diMangoCode.has(id)) {
      throw new ErroreChat(
        400,
        this.diMangoCode.has(id)
          ? frase("Questa conversazione è di Mango Code: per un modello di Claude aprine una nuova.", "This conversation is with Mango Code: to use a Claude model, start a new one.")
          : frase("Questa conversazione è di Claude Code: per un modello di Mango Code aprine una nuova.", "This conversation is with Claude Code: to use a Mango Code model, start a new one."),
      )
    }
    return this.conAperta(id, (corrente) => corrente.cambia(cambi))
  }

  /** La conversazione aperta con questo id, o `null` se esiste solo come file; 404 se non c'è affatto. */
  private async seAperta(id: string): Promise<Conversazione | null> {
    if (!ID.test(id)) throw new ErroreChat(404, NON_TROVATA)
    const aperta = this.attive.get(id)
    if (aperta) return aperta
    await this.aggiornaElenco()
    if (!this.elencoDisco.some((s) => s.id === id)) throw new ErroreChat(404, NON_TROVATA)
    return null
  }

  /** La conversazione aperta su cui agire (fermarla, mandarla in background…): una chiusa non ha niente in corso. */
  private async inCorso(id: string): Promise<Conversazione> {
    const conversazione = await this.seAperta(id)
    if (!conversazione) throw new ErroreChat(409, CONVERSAZIONE_CHIUSA)
    return conversazione
  }

  async ferma(id: string): Promise<void> {
    await (await this.inCorso(id)).ferma()
  }

  async inBackground(id: string): Promise<void> {
    await (await this.inCorso(id)).inBackground()
  }

  async fermaTask(id: string, task: string): Promise<void> {
    await (await this.inCorso(id)).fermaTask(task)
  }

  async rispondi(id: string, richiesta: string, corpo: Oggetto): Promise<void> {
    const conversazione = await this.seAperta(id)
    if (!conversazione) throw new ErroreChat(404, frase("Questa richiesta non c'è più: la conversazione è chiusa.", "This request is gone: the conversation is closed."))
    conversazione.rispondi(richiesta, corpo)
  }

  salvaAllegato(nome: string, contenuto: Uint8Array): Promise<string> {
    return salvaAllegato(this.d.archivio, nome, contenuto)
  }

  collegaAllegato(originale: string): Promise<string> {
    return collegaAllegato(this.d.archivio, originale)
  }

  /**
   * Chiude la conversazione su richiesta del creator: ferma, nega le richieste in attesa e spegne il processo. Resta nel suo file e un
   * messaggio la riapre. Già chiusa (solo nel file) non cambia niente; 404 se non c'è.
   */
  async chiudiConversazione(id: string): Promise<void> {
    if (!ID.test(id)) throw new ErroreChat(404, NON_TROVATA)
    const inCorso = this.chiusure.get(id)
    if (inCorso) return inCorso
    if (this.attive.has(id) || this.aperture.has(id)) return this.spegni(id)
    await this.seAperta(id)
    // Mentre si controllava il file un messaggio può averla aperta.
    if (this.attive.has(id) || this.aperture.has(id) || this.chiusure.has(id)) return this.chiudiConversazione(id)
  }

  /** Toglie la conversazione da quelle aperte subito, prima di ogni attesa: chi scrive dopo la trova chiusa e la riapre dal file. */
  private spegni(id: string): Promise<void> {
    const aperta = this.attive.get(id)
    this.attive.delete(id)
    const inApertura = aperta ? undefined : this.aperture.get(id)
    const chiusura = (async () => {
      // Se l'apertura è fallita l'errore lo dà chi la chiedeva: qui non c'è niente da chiudere.
      const conversazione = aperta ?? (await inApertura?.catch(() => undefined))
      if (!conversazione) return
      if (this.attive.get(id) === conversazione) this.attive.delete(id)
      await conversazione.chiudiSuRichiesta()
      this.emetti(id, { evento: "chiusa" })
      this.emetti(id, { evento: "elenco" })
    })().finally(() => this.chiusure.delete(id))
    this.chiusure.set(id, chiusura)
    return chiusura
  }

  async chiudi(): Promise<void> {
    this.accensioniDiMangoCode?.chiudi()
    ;(await this.osservatore?.catch(() => null))?.chiudi()
    await Promise.all([...[...this.attive.values()].map((c) => c.chiudi()), ...this.chiusure.values()])
  }
}
