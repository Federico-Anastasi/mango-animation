// Le conversazioni coi motori della chat: l'unico proprietario in memoria di quelle aperte e dell'elenco di quelle sul disco.
import { randomUUID } from "node:crypto"
import type { Eventi } from "../eventi"
import { frase, type Lingua, type Testo } from "../lingua"
import { collegaAllegato, leggiContesto, messaggioPerIlMotore, partiDelCreator, rigaDiContesto, risolviAllegati, salvaAllegato, testoVisibile } from "./allegati"
import { eComando, ElencoComandi, type ComandoChat } from "./comandi"
import { CONVERSAZIONE_CHIUSA, Conversazione } from "./conversazione"
import { leggiLeDomande } from "./domande"
import { ElencoModelli } from "./modelli"
import { manca, type Motore } from "./motore"
import { eAvvio, ingressoDiAvvio, leggiAvvio, TITOLO_PRIMO_GIRO } from "./primoGiro"
import { abbrevia, type Oggetto } from "./traduzione"
import { lavoroDeiGiri } from "./trascrizione"
import { ErroreChat, type ContestoUsato, type DatiEventoChat, type DettaglioChat, type ImpostazioniChat, type MessaggioChat, type ModelloChat, type OpzioniChat, type VoceElenco, type VoceMotore, type VoceSessione } from "./tipi"

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NON_TROVATA = frase("Non c'è una conversazione con questo id: guarda l'elenco delle conversazioni.", "There is no conversation with this id: look at the list of conversations.")
const NON_APERTA = frase("Questa conversazione non è aperta: le domande si fanno mentre il motore ci lavora.", "This conversation is not open: questions are asked while the engine is working on it.")
const SENZA_TITOLO = frase("Conversazione senza titolo", "Untitled conversation")
const TITOLO_NUOVA = frase("Nuova conversazione", "New conversation")

export interface DipendenzeChat {
  /** La cartella del prodotto: ne arrivano il metodo e lo strumento «video». */
  codice: string
  /** La cartella in cui lavora il motore. */
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
  private elencoDisco: (VoceSessione & { motore: Motore })[] = []
  private elencoVecchio = true
  private lettura: Promise<void> | null = null
  private osservatore: Promise<{ chiudi: () => void }> | null = null
  private readonly elencoModelli: ElencoModelli
  private readonly elenchiDeiComandi = new Map<Motore, ElencoComandi>()
  /** Le chiusure in corso: chi apre la stessa conversazione aspetta che finiscano. */
  private readonly chiusure = new Map<string, Promise<void>>()

  private readonly motori: Motore[]
  /** Il motore dei modelli senza prefisso: è quello delle conversazioni che nessun altro motore dice sue. */
  private readonly predefinito: Motore
  /** Il motore di ogni conversazione aperta, creata o riconosciuta; le altre sono del predefinito. */
  private readonly motoreDi = new Map<string, Motore>()

  /** Un motore che si accende o si spegne cambia i modelli offerti: lo studio rilegge l'elenco all'evento `modelli`. */
  private readonly accensioni: { chiudi: () => void }[]

  constructor(private readonly d: DipendenzeChat) {
    this.motori = d.opzioni.motori
    const senzaPrefisso = this.motori.filter((m) => m.prefisso === null)
    const predefinito = senzaPrefisso[0]
    if (senzaPrefisso.length !== 1 || !predefinito) throw new Error(`La chat vuole un solo motore con i modelli senza prefisso, e ne ha ${senzaPrefisso.length}.`)
    this.predefinito = predefinito
    this.elencoModelli = new ElencoModelli(this.motori, d.lavoro)
    this.accensioni = this.motori.flatMap((m) => m.osservaAccensione?.(() => d.eventi.emetti({ tipo: "modelli" })) ?? [])
  }

  private emetti(id: string, dati: DatiEventoChat): void {
    this.d.eventi.emetti({ tipo: "chat", id, ...dati })
  }

  // --- L'elenco -------------------------------------------------------------------------------

  /** Chi guarda l'elenco ne segue anche i cambi: il file di una conversazione che cambia (anche da terminale) lo rende da rileggere. */
  private async seguiLeConversazioni(): Promise<void> {
    this.osservatore ??= this.osservaLeConversazioni()
    try {
      await this.osservatore
    } catch (errore) {
      this.osservatore = null
      throw errore
    }
  }

  private async osservaLeConversazioni(): Promise<{ chiudi: () => void }> {
    const alCambio = (id: string) => {
      this.elencoVecchio = true
      // Una conversazione aperta qui annuncia da sola i suoi cambi.
      if (!this.attive.has(id)) this.emetti(id, { evento: "elenco" })
    }
    const tentativi = await Promise.allSettled(this.motori.flatMap((m) => m.osservaConversazioni?.(alCambio) ?? []))
    const osservatori = tentativi.flatMap((t) => (t.status === "fulfilled" ? [t.value] : []))
    const fallito = tentativi.find((t) => t.status === "rejected")
    if (fallito) {
      osservatori.forEach((o) => o.chiudi())
      throw fallito.reason
    }
    return { chiudi: () => osservatori.forEach((o) => o.chiudi()) }
  }

  private async aggiornaElenco(): Promise<void> {
    await this.seguiLeConversazioni()
    if (!this.elencoVecchio) return this.lettura ?? Promise.resolve()
    this.lettura ??= (async () => {
      this.elencoVecchio = false
      try {
        const letture = await Promise.all(this.motori.map(async (m) => (await m.elenca()).map((s) => ({ ...s, motore: m }))))
        this.elencoDisco = letture.flat()
        this.elencoDisco.forEach((s) => this.motoreDi.set(s.id, s.motore))
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
    for (const s of this.elencoDisco) voci.set(s.id, { voce: { id: s.id, motore: s.motore.id, titolo: titoloDa(s.titolo), aggiornata: new Date(s.aggiornata).toISOString(), attiva: false }, ms: s.aggiornata })
    for (const c of this.attive.values()) {
      const sulDisco = voci.get(c.id)
      const ms = Math.max(c.aggiornata, sulDisco?.ms ?? 0)
      voci.set(c.id, { voce: { id: c.id, motore: c.motore.id, titolo: (c.rinominata ? c.titolo : sulDisco?.voce.titolo || c.titolo) || TITOLO_NUOVA, aggiornata: new Date(ms).toISOString(), attiva: c.attiva }, ms })
    }
    return [...voci.values()].sort((a, b) => b.ms - a.ms).map(({ voce }) => voce)
  }

  // --- I motori -------------------------------------------------------------------------------

  /** Il motore di una conversazione: quello che la dice sua, e se nessuno la dice sua il predefinito. */
  private async motoreDellaConversazione(id: string): Promise<Motore> {
    const noto = this.motoreDi.get(id)
    if (noto) return noto
    for (const motore of this.motori) {
      if (motore.eSua && (await motore.eSua(id))) {
        this.motoreDi.set(id, motore)
        return motore
      }
    }
    return this.predefinito
  }

  /** Il motore di un modello: quello col prefisso con cui comincia, e se nessuno lo ha il predefinito. */
  private motoreDelModello(modello: string | null | undefined): Motore {
    return this.motori.find((m) => m.prefisso !== null && typeof modello === "string" && modello.startsWith(m.prefisso)) ?? this.predefinito
  }

  private elencoDeiComandi(motore: Motore): ElencoComandi {
    let elenco = this.elenchiDeiComandi.get(motore)
    if (!elenco) {
      elenco = new ElencoComandi(motore, this.d.lavoro)
      this.elenchiDeiComandi.set(motore, elenco)
    }
    return elenco
  }

  /** Un messaggio con la barra va solo a un motore che li ha, e a lui non arriva se è uno di quelli che non vuole dalla chat. */
  private controllaIlComando(motore: Motore, testo: string): void {
    if (!motore.capacita.comandi) throw manca(motore.nomi, "comandi")
    motore.controllaIlComando?.(testo)
  }

  /** I motori nell'ordine in cui lo studio li mostra, con ciò che ciascuno sa fare adesso. */
  motoriOfferti(): Promise<VoceMotore[]> {
    return Promise.all(
      this.motori.map(async (m) => {
        const pronto = await m.pronto(this.d.lavoro)
        const c = m.capacita
        return {
          id: m.id,
          nome: m.nomi.menu,
          nelle_frasi: m.nomi.nelleFrasi,
          prefisso: m.prefisso,
          pronto,
          modello_grande: pronto ? m.modelloGrande(await m.modelli(this.d.lavoro)) : null,
          capacita: {
            effort: c.effort,
            comandi: c.comandi,
            ferma_lavoro: c.fermaLavoro,
            in_background: c.inBackground,
            immagini_negli_esiti: c.immaginiNegliEsiti,
            controllo_remoto: c.controlloRemoto,
            sottoagenti: c.sottoagenti,
            browser: c.browser,
          },
        }
      }),
    )
  }

  // --- Le conversazioni -----------------------------------------------------------------------

  private async leggiDalFile(id: string): Promise<{ motore: Motore; messaggi: MessaggioChat[]; titolo: string; aggiornata: number; contestoUsato: ContestoUsato | null; primoGiro: boolean }> {
    const motore = await this.motoreDellaConversazione(id)
    const letta = await motore.leggi(id, { lavoro: this.d.lavoro, archivio: this.d.archivio, lingua: this.d.lingua() })
    if (letta === null) throw new ErroreChat(404, NON_TROVATA)
    const { messaggi, contestoUsato, primoGiro } = letta
    const primo = messaggi.find((m) => m.ruolo === "utente")?.parti.find((p) => p.tipo === "testo")
    const ultimo = Date.parse(messaggi.at(-1)?.quando ?? "")
    const titolo = primoGiro ? TITOLO_PRIMO_GIRO.in(this.d.lingua()) : primo?.tipo === "testo" ? abbrevia(primo.testo) : ""
    return { motore, messaggi, titolo, aggiornata: Number.isNaN(ultimo) ? this.d.adesso().getTime() : ultimo, contestoUsato, primoGiro }
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
      const { motore, messaggi, titolo, aggiornata, contestoUsato, primoGiro } = await this.leggiDalFile(id)
      const conversazione = this.nuova(id, motore, messaggi, true, titolo, aggiornata, contestoUsato, primoGiro)
      const ricordato = motore.modelloDi ? await motore.modelloDi(id) : null
      if (ricordato) conversazione.preimposta({ modello: ricordato })
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

  private nuova(id: string, motore: Motore, messaggi: MessaggioChat[], esiste: boolean, titolo: string, aggiornata: number, contestoUsato: ContestoUsato | null, primoGiro: boolean): Conversazione {
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
      motore,
      emetti: (chi, dati) => this.emetti(chi, dati),
      adesso: this.d.adesso,
      lingua: this.d.lingua,
      elencoCambiato: (chi) => {
        // Non tutti i motori tengono le conversazioni in file che si possono osservare: ciò che cambia qui rende vecchio l'elenco letto.
        this.elencoVecchio = true
        this.emetti(chi, { evento: "elenco" })
      },
      comandiCambiati: (comandi) => {
        if (this.elencoDeiComandi(motore).sostituisci(comandi)) this.d.eventi.emetti({ tipo: "comandi" })
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
      ingresso: await messaggioPerIlMotore(testo, riga, allegati),
      titolo: abbrevia(testo) || `Allegato: ${allegati[0]?.percorso.split("/").pop() ?? ""}`,
    }
  }

  async crea(corpo: Oggetto): Promise<string> {
    const { modello, effort, ...messaggio } = corpo
    const scelta = modello === undefined && effort === undefined ? {} : await this.elencoModelli.verifica({ ...(modello === undefined ? {} : { modello }), ...(effort === undefined ? {} : { effort }) }, { modello: null, effort: null })
    const avvio = leggiAvvio(messaggio)
    const { testo, parti, ingresso, titolo } = avvio
      ? { testo: "", parti: [], ingresso: { testo: ingressoDiAvvio(avvio, this.d.lingua()), immagini: [] }, titolo: TITOLO_PRIMO_GIRO.in(this.d.lingua()) }
      : await this.preparaMessaggio(messaggio)
    const motore = this.motoreDelModello(scelta.modello)
    if (eComando(testo)) this.controllaIlComando(motore, testo)
    const id = randomUUID()
    this.motoreDi.set(id, motore)
    const conversazione = this.nuova(id, motore, [], false, "", this.d.adesso().getTime(), null, avvio !== undefined)
    conversazione.preimposta(scelta)
    this.attive.set(id, conversazione)
    conversazione.scrivi(parti, ingresso, titolo)
    return id
  }

  async scrivi(id: string, corpo: Oggetto): Promise<void> {
    if (!ID.test(id)) throw new ErroreChat(404, NON_TROVATA)
    const { testo, parti, ingresso, titolo } = await this.preparaMessaggio(corpo)
    if (eComando(testo)) this.controllaIlComando(await this.motoreDellaConversazione(id), testo)
    await this.conAperta(id, (conversazione) => conversazione.scrivi(parti, ingresso, titolo))
  }

  async leggi(id: string): Promise<DettaglioChat> {
    if (!ID.test(id)) throw new ErroreChat(404, NON_TROVATA)
    await this.aggiornaElenco()
    const sulDisco = this.elencoDisco.find((s) => s.id === id)
    const titoloDi = (proprio: string): Testo => (sulDisco ? titoloDa(sulDisco.titolo) : proprio)
    await this.chiusure.get(id)
    const aperta = this.attive.get(id)
    if (aperta) return { id, motore: aperta.motore.id, titolo: aperta.rinominata ? aperta.titolo : titoloDi(aperta.titolo), attiva: aperta.attiva, stato: aperta.stato, lavora_da: aperta.lavoraDa, lavoro: aperta.lavoro, ...aperta.impostazioni, messaggi: aperta.messaggi, in_attesa: aperta.inAttesa, task: aperta.task.elenco, contesto_usato: aperta.contestoUsato, primo_giro: aperta.primoGiro }
    const { motore, messaggi, titolo, contestoUsato, primoGiro } = await this.leggiDalFile(id)
    return {
      id,
      motore: motore.id,
      titolo: titoloDi(titolo),
      attiva: false,
      stato: "pronta",
      lavora_da: null,
      lavoro: { ms: lavoroDeiGiri(messaggi, false), da: null },
      modello: motore.modelloDi ? await motore.modelloDi(id) : null,
      effort: null,
      messaggi,
      in_attesa: [],
      task: [],
      contesto_usato: contestoUsato,
      primo_giro: primoGiro,
    }
  }

  modelli(): Promise<ModelloChat[]> {
    return this.elencoModelli.elenca()
  }

  /** I comandi con la barra del motore indicato; senza, quelli del motore dei modelli senza prefisso. */
  comandi(motore?: string): Promise<ComandoChat[]> {
    const scelto = motore === undefined ? this.predefinito : this.motori.find((m) => m.id === motore)
    if (!scelto) throw new ErroreChat(404, frase(`Non c'è un motore con id «${motore}»: guarda GET /api/chat/motori.`, `There is no engine with id «${motore}»: see GET /api/chat/motori.`))
    return this.elencoDeiComandi(scelto).elenca()
  }

  /** Modello ed effort di una conversazione, anche se è chiusa o solo nel suo file: valgono dal prossimo avvio. */
  async impostazioni(id: string, corpo: Oggetto): Promise<ImpostazioniChat> {
    if (!ID.test(id)) throw new ErroreChat(404, NON_TROVATA)
    const conversazione = await this.apri(id)
    const cambi = await this.elencoModelli.verifica(corpo, conversazione.impostazioni)
    const suo = conversazione.motore
    const delModello = cambi.modello === undefined ? suo : this.motoreDelModello(cambi.modello)
    if (delModello !== suo) {
      throw new ErroreChat(
        400,
        frase(`Questa conversazione è di ${suo.nomi.programma}: per un modello di ${delModello.nomi.servizio} aprine una nuova.`, `This conversation is with ${suo.nomi.programma}: to use a ${delModello.nomi.servizio} model, start a new one.`),
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

  /**
   * Le domande di uno strumento del server al creator, nella conversazione aperta: aspetta le risposte, senza scadenza. Se il creator
   * ferma o la conversazione si chiude, o se `annullata` scatta (chi chiede ha chiuso la connessione), la richiesta si ritira.
   */
  async domande(id: string, corpo: Oggetto, annullata: AbortSignal): Promise<{ risposte: Record<string, string> } | { rifiutata: string }> {
    const conversazione = ID.test(id) ? this.attive.get(id) : undefined
    if (!conversazione) throw new ErroreChat(404, NON_APERTA)
    const risposta = await conversazione.chiedi({ tipo: "domanda", id: randomUUID(), domande: leggiLeDomande(corpo) }, annullata)
    return risposta.consente ? { risposte: risposta.risposte ?? {} } : { rifiutata: risposta.motivo }
  }

  /** Risponde quando il creator ha scritto nella conversazione aperta un messaggio che il motore non ha ancora letto: chi aspetta un lavoro per lui smette di aspettare. */
  async inCoda(id: string, annullata: AbortSignal): Promise<boolean> {
    const conversazione = ID.test(id) ? this.attive.get(id) : undefined
    if (!conversazione) throw new ErroreChat(404, NON_APERTA)
    return conversazione.quandoIlCreatorScrive(annullata)
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
      this.elencoVecchio = true
      this.emetti(id, { evento: "chiusa" })
      this.emetti(id, { evento: "elenco" })
    })().finally(() => this.chiusure.delete(id))
    this.chiusure.set(id, chiusura)
    return chiusura
  }

  async chiudi(): Promise<void> {
    this.accensioni.forEach((a) => a.chiudi())
    ;(await this.osservatore?.catch(() => null))?.chiudi()
    await Promise.all([...[...this.attive.values()].map((c) => c.chiudi()), ...this.chiusure.values()])
  }
}
