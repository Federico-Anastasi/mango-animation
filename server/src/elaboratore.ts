// Dal disco all'indice: legge ciò che è cambiato, aggiorna lo stato in memoria, annuncia il cambio
// e, quando cambia un piano o lo stile, mette in coda `risolvi`. Lo usano l'osservatore (per ciò che
// scrive chiunque, anche Claude dal terminale) e le rotte di scrittura (per ciò che scrive il server):
// dopo una scrittura del server l'osservatore trova lo stato già uguale e non annuncia due volte.
import { join } from "node:path"
import { unisciStile } from "../../strumenti/stile.mjs"
import type { CaricatoreCanali } from "./caricatoreCanali"
import type { Coda, RichiestaLavoro } from "./coda"
import type { Opzioni, Percorsi } from "./configurazione"
import { elenca, jsonDaTesto, leggiTesto, NON_SI_LEGGE, scrivi, statistica, statisticaEsatta, testoJson } from "./disco"
import type { CosaDelVideo, Eventi } from "./eventi"
import { PREPARATO_VUOTO, trattiDelRisolto, voceVuota, type Indice, type Preparato, type Scheda, type SchedaGrezzo, type Uscita, type VoceVideo } from "./indice"
import { percorsoSicuro } from "./media"
import { applicaBase, controllaCompleto, controllaRiferimenti, fileDelPiano, type Piano } from "./piano"
import { giudicaProfilo } from "./profilo"
import type { NomeSchema, Schemi } from "./schemi"
import type { Miniature, MisureMiniatura } from "./miniature"
import { idDelFile, segnaGliStessiFile } from "./montato"
import { pezziDichiarati } from "./sagoma"
import { eHeic, type Sonda } from "./sonda"
import { descriviVersioni, leggiPosizione, leggiVersione, leggiVersioni, muovi, registraNuovaVersione, ripristina, type VersioneDelPiano } from "./storia"
import { frase, Frase, type Testo } from "./lingua"

const FILE_PREPARATI: Record<string, Exclude<keyof Preparato, "sagoma_pezzi">> = {
  "parole.json": "parole",
  "sagoma.webm": "sagoma",
  "leggero.mp4": "leggero",
  "onda.bin": "onda",
  "miniatura.jpg": "miniatura",
  "foto.jpg": "foto",
  "trascrizione.txt": "trascrizione",
}

const ESTENSIONI_ANTEPRIMA = ["png", "jpg", "jpeg", "webp"]
const eFileDelGirato = (nome: string): boolean => !nome.startsWith(".") && !nome.endsWith(".scheda.json") && !nome.includes(".tmp-")

export class Elaboratore {
  private readonly blocchi = new Map<string, Promise<unknown>>()
  private avviato = false
  private readonly fotogrammiCambiati = new Set<string>()
  private readonly fotoRichieste = new Set<string>()

  constructor(
    private readonly opzioni: Opzioni,
    private readonly percorsi: Percorsi,
    readonly indice: Indice,
    private readonly eventi: Eventi,
    private readonly schemi: Schemi,
    private readonly coda: Coda,
    private readonly sonda: Sonda,
    private readonly miniature: Miniature,
    private readonly canali: CaricatoreCanali,
  ) {}

  /** Una cosa alla volta per chiave: le scritture del server e le notizie dall'osservatore sullo stesso video non si accavallano. */
  conBlocco<T>(chiave: string, lavoro: () => Promise<T>): Promise<T> {
    const questo = (this.blocchi.get(chiave) ?? Promise.resolve()).then(lavoro)
    const dopo = questo.then(
      () => undefined,
      () => undefined,
    )
    this.blocchi.set(chiave, dopo)
    void dopo.then(() => {
      if (this.blocchi.get(chiave) === dopo) this.blocchi.delete(chiave)
    })
    return questo
  }

  // --- All'avvio ------------------------------------------------------------------------------

  async costruisci(): Promise<void> {
    await this.leggiStile()
    const cartelleVideo = (await elenca(join(this.percorsi.archivio, "video"))).filter((d) => d.isDirectory())
    await Promise.all(cartelleVideo.map((d) => this.elaboraVideo(d.name, new Set())))
    const giorni = (await elenca(join(this.percorsi.archivio, "grezzo"))).filter((d) => d.isDirectory() && !d.name.startsWith("."))
    for (const giorno of giorni) await this.aggiornaGiorno(giorno.name)
    const preparati = (await elenca(join(this.percorsi.archivio, "preparati"))).filter((d) => d.isDirectory())
    for (const giorno of preparati) await this.aggiornaPreparatiDelGiorno(giorno.name)
    await this.canali.costruisci()
    this.indice.ricalcolaUsi()
    this.avviato = true
    // I riferimenti di un piano (base, sorgenti) si controllano a piani tutti letti: nella prima passata un piano può nominarne uno non ancora caricato.
    await Promise.all([...this.indice.video.values()].filter((voce) => voce.pianoTesto !== null).map((voce) => this.conBlocco(voce.slug, () => this.pianoDaDisco(voce, undefined, true))))
    this.indice.video.forEach((voce) => this.programmaFotogrammi(voce))
    this.accodaRisolviIndietro()
  }

  /**
   * Il server può essere stato spento mentre un piano cambiava: un video con un piano valido il cui risolto manca o è più vecchio del
   * piano (o di quello di una base) si risolve ora. Lo stile no: un suo cambio non deve rifare tutto l'archivio a ogni avvio.
   */
  private accodaRisolviIndietro(): void {
    this.indice.video.forEach((voce) => {
      if (voce.scheda === null || voce.pianoValido === null) return
      if (voce.risoltoMtime === null || voce.risoltoMtime < this.indice.ultimoPiano(voce.slug)) this.accodaRisolvi(voce.slug, false)
    })
  }

  // --- Le notizie dall'osservatore ------------------------------------------------------------

  /** `relativi` sono percorsi dentro `archivio/`, con `/`. */
  async cambiati(relativi: string[]): Promise<void> {
    const perVideo = new Map<string, Set<string>>()
    const grezzi = new Set<string>()
    const giorniGrezzi = new Set<string>()
    const preparati = new Set<string>()
    const giorniPreparati = new Set<string>()
    const delCanale: string[] = []

    for (const relativo of relativi) {
      const [radice, secondo, terzo, ...resto] = relativo.split("/")
      if (radice === "canali" && secondo) {
        delCanale.push(relativo.slice("canali/".length))
      } else if (radice === "video" && secondo) {
        const aspetti = perVideo.get(secondo) ?? new Set<string>()
        perVideo.set(secondo, aspetti)
        const sotto = [terzo, ...resto].join("/")
        if (sotto === "scheda.json") aspetti.add("scheda")
        else if (sotto === "piano.json") aspetti.add("piano")
        else if (sotto === "lavoro/risolto.json") aspetti.add("risolto")
        else if (sotto === "lavoro/controllo.json") aspetti.add("controllo")
        else if (terzo === "uscite") aspetti.add("uscite")
        else if (terzo === "materiali") aspetti.add("materiali")
      } else if (radice === "grezzo" && secondo && terzo && resto.length === 0) {
        grezzi.add(`${secondo}/${terzo.endsWith(".scheda.json") ? terzo.slice(0, -".scheda.json".length) : terzo}`)
      } else if (radice === "grezzo" && secondo && !terzo) {
        giorniGrezzi.add(secondo)
      } else if (radice === "preparati" && secondo && terzo) {
        preparati.add(`${secondo}/${terzo}`)
      } else if (radice === "preparati" && secondo) {
        giorniPreparati.add(secondo)
      }
    }

    let grezzoCambiato = false
    for (const [slug, aspetti] of perVideo) await this.conBlocco(slug, () => this.elaboraVideo(slug, aspetti))
    for (const giorno of giorniGrezzi) grezzoCambiato = (await this.aggiornaGiorno(giorno)) || grezzoCambiato
    for (const chiave of grezzi) {
      const [giorno = "", nome = ""] = chiave.split("/")
      grezzoCambiato = (await this.aggiornaGrezzo(giorno, nome)) || grezzoCambiato
    }
    for (const giorno of giorniPreparati) grezzoCambiato = (await this.aggiornaPreparatiDelGiorno(giorno)) || grezzoCambiato
    for (const chiave of preparati) {
      const [giorno = "", nome = ""] = chiave.split("/")
      grezzoCambiato = (await this.aggiornaPreparato(giorno, nome)) || grezzoCambiato
    }
    if (grezzoCambiato) {
      this.eventi.emetti({ tipo: "grezzo" })
      await this.rivalutaIPianiConProblemi()
    }
    this.fotogrammiCambiati.forEach((file) => this.indice.usatoIn(file).forEach((slug) => this.annuncia(slug, "fotogrammi")))
    this.fotogrammiCambiati.clear()
    if (delCanale.length > 0) (await this.canali.cambiati(delCanale)).forEach((canale) => this.eventi.emetti({ tipo: "canale", canale }))
  }

  /**
   * Un lavoro del motore è finito: si rilegge subito ciò che può aver scritto (risolto, controllo e uscite del video, i preparati
   * dei file del suo piano o del file che ha preparato), senza aspettare l'osservatore, che arriva dopo il rimbalzo e trova lo
   * stato già uguale. Ciò che non è cambiato non si annuncia.
   */
  async dopoIlLavoro({ slug, file }: RichiestaLavoro): Promise<void> {
    const piano = slug === null ? null : (this.indice.video.get(slug)?.pianoConBase ?? null)
    const preparati = (slug === null ? [file] : piano ? fileDelPiano(piano) : []).flatMap((f) => (f === null ? [] : [`preparati/${f}`]))
    const delVideo = slug === null ? [] : ["lavoro/risolto.json", "lavoro/controllo.json", "uscite"].map((f) => `video/${slug}/${f}`)
    await this.cambiati([...delVideo, ...preparati])
  }

  // --- Lo stile -------------------------------------------------------------------------------

  private async leggiStile(): Promise<boolean> {
    const [testoSerie, testoCreator] = await Promise.all([leggiTesto(this.opzioni.stile), leggiTesto(this.opzioni.stileCreator)])
    const testo = testoSerie === null ? null : `${testoSerie}\0${testoCreator ?? ""}`
    if (testo === this.indice.stile.testo) return false
    const serie = testoSerie === null ? null : jsonDaTesto(testoSerie)
    const creator = testoCreator === null ? null : jsonDaTesto(testoCreator)
    if (testoSerie !== null && !serie) {
      console.error("stile.json non è un JSON valido: tengo quello di prima finché non lo sistemi.")
      return false
    }
    if (testoCreator !== null && !(creator && typeof creator.valore === "object" && creator.valore !== null && !Array.isArray(creator.valore))) {
      console.error("Lo stile del creator (stile.json nella cartella di lavoro) non è un oggetto JSON valido: tengo quello di prima finché non lo sistemi.")
      return false
    }
    const valore = serie === null ? null : creator === null ? serie.valore : unisciStile(serie.valore, creator.valore)
    const quadri = (valore as { quadri?: object } | null)?.quadri
    const mtime = Math.max(...(await Promise.all([this.opzioni.stile, this.opzioni.stileCreator].map(async (f) => (await statistica(f))?.mtimeMs ?? 0))))
    this.indice.stile = { testo, serie: serie?.valore ?? null, valore, mtime, quadri: new Set(quadri ? Object.keys(quadri) : []) }
    return true
  }

  /** Le misure della miniatura scritte nello stile, o `null` se lo stile non le ha. */
  misureMiniatura(): MisureMiniatura | null {
    const preparati = (this.indice.stile.valore as { preparati?: { lato_miniatura?: unknown; miniatura_al?: unknown } } | null)?.preparati
    const lato = preparati?.lato_miniatura
    const al = preparati?.miniatura_al
    return typeof lato === "number" && typeof al === "number" ? { lato, al } : null
  }

  /** Lo stile è cambiato (scritto dal server o da fuori): ogni video con un piano va risolto di nuovo. */
  async stileCambiato(): Promise<void> {
    if (!(await this.leggiStile())) return
    this.eventi.emetti({ tipo: "stile" })
    this.indice.video.forEach((voce) => this.accodaRisolvi(voce.slug, false))
  }

  // --- Il profilo e gli schemi ----------------------------------------------------------------

  /**
   * `profilo.json` è cambiato (o il server parte): se passa lo schema è il nuovo profilo, altrimenti resta l'ultimo buono, e senza
   * un profilo buono il profilo vuoto. Il motivo si legge da `GET /api/profilo` e nel terminale: il server parte e lavora lo stesso.
   */
  async profiloCambiato(): Promise<void> {
    const testo = await leggiTesto(join(this.opzioni.lavoro, "profilo.json"))
    const esito = giudicaProfilo(testo, this.schemi)
    const problemi = "problemi" in esito ? esito.problemi : []
    if (testo === this.indice.profilo.testo && problemi.length === 0 && this.indice.profiloProblemi.length === 0) return
    if ("problemi" in esito) {
      const comeSiVa = this.indice.profilo.testo === null ? "parto senza profilo" : "tengo quello di prima"
      console.error(`profilo.json non è valido (${esito.problemi.join("; ")}): ${comeSiVa} finché non lo sistemi.`)
    } else {
      this.indice.profilo = esito.profilo
    }
    this.indice.profiloProblemi = problemi
    this.eventi.emetti({ tipo: "profilo" })
  }

  /**
   * Un file di `motore/schemi/` è cambiato: gli schemi si ricompilano e ciò che dipende da quelli nuovi (schede, piani, schede del
   * girato, profilo) si giudica di nuovo. Uno schema che non si legge o non compila lascia in uso l'ultimo buono.
   */
  async schemiCambiati(): Promise<void> {
    const cambiati = await this.rileggiSchemi()
    if (cambiati.length > 0) await this.rivaluta(cambiati)
  }

  private async rileggiSchemi(): Promise<NomeSchema[]> {
    const { cambiati, rotti } = await this.schemi.ricarica()
    rotti.forEach((motivo) => console.error(`schema non valido (${motivo}): tengo l'ultimo buono.`))
    return cambiati
  }

  /**
   * I problemi di `dato` contro lo schema `nome`. Prima di dire di no si guarda se lo schema è cambiato sul disco da quando è stato
   * letto: chi scrive subito dopo aver cambiato lo schema non deve scontrarsi con la versione di prima.
   */
  async problemiDi(nome: "piano" | "scheda" | "grezzo", dato: unknown): Promise<Testo[]> {
    const problemi: Testo[] = this.schemi[nome](dato)
    if (problemi.length === 0) return problemi
    const cambiati = await this.rileggiSchemi()
    if (cambiati.length === 0) return problemi
    void this.rivaluta(cambiati).catch((errore) => console.error(`rivalutazione dopo il cambio degli schemi: ${errore instanceof Error ? errore.message : String(errore)}`))
    return this.schemi[nome](dato)
  }

  /** Schema, base, quadri, viste e sorgenti: tutto ciò che si può controllare senza il motore. Lista vuota se va bene. */
  async problemiDelPiano(slug: string, dato: unknown): Promise<Testo[]> {
    const dellaForma = await this.problemiDi("piano", dato)
    if (dellaForma.length > 0) return dellaForma
    const piano = dato as Piano
    const unito = applicaBase(slug, (altro) => (altro === slug ? piano : this.indice.pianoDi(altro)))
    if (unito instanceof Frase) return [unito]
    const problemi: Testo[] = [...controllaCompleto(unito), ...controllaRiferimenti(unito, this.indice.stile.quadri)]
    const dellaCartella = join(this.percorsi.archivio, "grezzo")
    for (const [nome, sorgente] of Object.entries(piano.sorgenti ?? {})) {
      const percorso = percorsoSicuro(dellaCartella, sorgente.file.replaceAll("\\", "/"))
      const esiste = percorso !== null && (await statistica(percorso))?.isFile()
      if (!esiste) {
        problemi.push(
          frase(
            `sorgenti.${nome}: il file «${sorgente.file}» non c'è in archivio/grezzo/. Controlla il nome (giorno/file) nella pagina Girato.`,
            `sorgenti.${nome}: the file «${sorgente.file}» is not in archivio/grezzo/. Check the name (day/file) on the Footage page.`,
          ),
        )
      }
    }
    return problemi
  }

  /** Un file è entrato nel girato: un piano che lo nominava senza trovarlo può tornare buono. */
  private rivalutaIPianiConProblemi(): Promise<unknown> {
    const daRivedere = [...this.indice.video.values()].filter((voce) => voce.pianoProblemi.length > 0)
    return Promise.all(daRivedere.map((voce) => this.conBlocco(voce.slug, () => this.pianoDaDisco(voce, undefined, true))))
  }

  private async rivaluta(schemi: NomeSchema[]): Promise<void> {
    const delVideo = (giudica: (voce: VoceVideo) => Promise<void> | void): Promise<void[]> =>
      Promise.all([...this.indice.video.values()].map((voce) => this.conBlocco(voce.slug, async () => (this.indice.video.get(voce.slug) === voce ? giudica(voce) : undefined))))
    if (schemi.includes("scheda")) await delVideo((voce) => this.giudicaScheda(voce, false))
    if (schemi.includes("piano")) await delVideo((voce) => this.pianoDaDisco(voce, undefined, true))
    if (schemi.includes("grezzo")) {
      let cambiato = false
      for (const [giorno, files] of [...this.indice.grezzo]) for (const nome of [...files.keys()]) cambiato = (await this.aggiornaGrezzo(giorno, nome)) || cambiato
      if (cambiato) this.eventi.emetti({ tipo: "grezzo" })
    }
    if (schemi.includes("profilo")) await this.profiloCambiato()
  }

  // --- Un video -------------------------------------------------------------------------------

  private async elaboraVideo(slug: string, aspetti: Set<string>): Promise<void> {
    const cartella = await statistica(this.percorsi.video(slug))
    if (!cartella?.isDirectory()) {
      this.togliVideo(slug)
      return
    }
    let voce = this.indice.video.get(slug)
    if (!voce) {
      voce = voceVuota(slug)
      voce.storia = await leggiPosizione(this.percorsi.storia(slug))
      this.indice.video.set(slug, voce)
      ;["scheda", "piano", "risolto", "controllo", "uscite", "materiali"].forEach((a) => aspetti.add(a))
    }
    if (aspetti.has("scheda")) await this.ricaricaScheda(voce)
    if (aspetti.has("piano")) await this.pianoDaDisco(voce)
    if (aspetti.has("risolto")) await this.ricaricaRisolto(voce)
    if (aspetti.has("uscite")) await this.ricaricaUscite(voce)
    if (aspetti.has("controllo")) await this.ricaricaControllo(voce)
    if (aspetti.has("materiali")) {
      await this.ricaricaMateriali(voce)
      this.annuncia(slug, "materiali")
    }
  }

  private annuncia(slug: string, cosa: CosaDelVideo): void {
    this.eventi.emetti({ tipo: "video", slug, cosa })
  }

  private togliVideo(slug: string): void {
    const voce = this.indice.video.get(slug)
    if (!voce) return
    this.indice.video.delete(slug)
    if (this.indice.ricalcolaUsi()) this.eventi.emetti({ tipo: "grezzo" })
    if (voce.scheda) this.annuncia(slug, "tolto")
  }

  private async ricaricaScheda(voce: VoceVideo): Promise<void> {
    const testo = await leggiTesto(this.percorsi.scheda(voce.slug))
    if (testo === voce.schedaTesto) return
    voce.schedaTesto = testo
    await this.giudicaScheda(voce, true)
  }

  /**
   * Giudica `schedaTesto` sullo schema di adesso. Se passa è la scheda del video; se no resta l'ultima valida, con i problemi a
   * disposizione di chi la mostra. `daDisco`: il testo è appena cambiato, quindi si annuncia comunque; altrimenti solo se il giudizio cambia.
   */
  private async giudicaScheda(voce: VoceVideo, daDisco: boolean): Promise<void> {
    const testo = voce.schedaTesto
    const letto = testo === null ? null : jsonDaTesto(testo)
    const problemi = testo === null ? [] : letto ? this.schemi.scheda(letto.valore) : [NON_SI_LEGGE]
    const problemiPrima = voce.schedaProblemi
    voce.schedaProblemi = problemi
    if (problemi.length > 0) {
      console.error(`scheda di «${voce.slug}» non valida (${problemi.join("; ")}): tengo quella di prima.`)
      if (JSON.stringify(problemi) !== JSON.stringify(problemiPrima)) this.annuncia(voce.slug, "scheda")
      return
    }
    const prima = voce.scheda
    const eraVisibile = prima !== null
    voce.scheda = letto ? (letto.valore as Scheda) : null
    if (!daDisco && eraVisibile === (voce.scheda !== null) && JSON.stringify(prima) === JSON.stringify(voce.scheda) && problemiPrima.length === 0) return
    this.segna(voce, (await statistica(this.percorsi.scheda(voce.slug)))?.mtimeMs)
    this.annuncia(voce.slug, eraVisibile === (voce.scheda !== null) ? "scheda" : voce.scheda ? "nuovo" : "tolto")
  }

  /**
   * Sostituisce la scheda con ciò che `cambia` fa di quella sul disco (`null` se non si legge), validata sullo schema, e la
   * rilegge nell'indice. `cambia` che dà `null` lascia tutto com'è. Dà i problemi, vuoto se è andata.
   */
  cambiaScheda(slug: string, cambia: (suDisco: unknown) => unknown): Promise<Testo[]> {
    return this.conBlocco(slug, async () => {
      const voce = this.indice.video.get(slug)
      if (!voce) return []
      const testo = await leggiTesto(this.percorsi.scheda(slug))
      const nuova = cambia(testo === null ? null : (jsonDaTesto(testo)?.valore ?? null))
      if (nuova === null) return []
      const problemi = await this.problemiDi("scheda", nuova)
      if (problemi.length > 0) return problemi
      await scrivi(this.percorsi.scheda(slug), testoJson(nuova))
      await this.ricaricaScheda(voce)
      return []
    })
  }

  private segna(voce: VoceVideo, ms: number | undefined): void {
    voce.ultimoCambio = Math.max(voce.ultimoCambio, ms ?? 0)
  }

  private async ricaricaRisolto(voce: VoceVideo): Promise<void> {
    const stato = await statistica(this.percorsi.risolto(voce.slug))
    if ((stato?.mtimeMs ?? null) === voce.risoltoMtime) return
    voce.risoltoMtime = stato?.mtimeMs ?? null
    const risolto = stato ? (jsonDaTesto((await leggiTesto(this.percorsi.risolto(voce.slug))) ?? "")?.valore as { durata?: unknown; scene?: unknown } | undefined) : undefined
    const durata = Number(risolto?.durata)
    voce.durata = Number.isFinite(durata) ? durata : null
    const scene = Array.isArray(risolto?.scene) ? (risolto.scene as { nome?: unknown; durata?: unknown }[]) : []
    voce.durataScene = Object.fromEntries(scene.flatMap((s) => (typeof s.nome === "string" && typeof s.durata === "number" ? [[s.nome, s.durata]] : [])))
    voce.trattiRisolti = trattiDelRisolto(risolto)
    this.segna(voce, stato?.mtimeMs)
    this.annuncia(voce.slug, "risolto")
    if (this.avviato) this.programmaFotogrammi(voce)
  }

  /** Il fotogramma d'inizio di ogni tratto del risolto, fatto una volta in un lavoro di sfondo. */
  private programmaFotogrammi(voce: VoceVideo): void {
    this.miniature.programmaFotogrammi(this.indice.posizioniDeiTratti(voce, voce.trattiRisolti).flatMap((p) => (p === null ? [] : [p])))
  }

  private async ricaricaControllo(voce: VoceVideo): Promise<void> {
    const ms = (await statistica(this.percorsi.controllo(voce.slug)))?.mtimeMs ?? null
    if (ms === voce.controlloMtime) return
    voce.controlloMtime = ms
    this.annuncia(voce.slug, "controllo")
  }

  private async ricaricaUscite(voce: VoceVideo): Promise<void> {
    const cartella = this.percorsi.uscite(voce.slug)
    const file = (await elenca(cartella)).filter((d) => d.isFile() && eFileDelGirato(d.name))
    const lette = await Promise.all(file.map(async (d) => ({ nome: d.name, stato: await statisticaEsatta(join(cartella, d.name)) })))
    const presenti = lette.flatMap(({ nome, stato }) => (stato ? [{ file: `video/${voce.slug}/uscite/${nome}`, stato }] : []))
    const stessi = segnaGliStessiFile(presenti.map(({ file, stato }) => ({ file, id: idDelFile(stato) })))
    const uscite: Uscita[] = presenti
      .map(({ file, stato }) => ({ file, byte: Number(stato.size), cambiato: new Date(Number(stato.mtimeMs)).toISOString(), stesso_file: stessi.get(file) ?? null }))
      .sort((a, b) => a.file.localeCompare(b.file))
    if (JSON.stringify(uscite) === JSON.stringify(voce.uscite)) return
    voce.uscite = uscite
    // Un video senza piano (uscito da un altro programma) non ha un risolto: la durata sta accanto al file.
    const misure = Number((jsonDaTesto((await leggiTesto(join(cartella, "misure.json"))) ?? "")?.valore as { durata?: unknown } | undefined)?.durata)
    voce.durataUscita = Number.isFinite(misure) ? misure : null
    this.segna(voce, Math.max(0, ...uscite.map((u) => Date.parse(u.cambiato))))
    this.annuncia(voce.slug, "uscite")
    this.programmaImmagineDellaProva(voce)
  }

  /** L'anteprima è il file `materiali/anteprima.<estensione>` più recente: chi la cambia, anche con un'estensione diversa, vince su quella di prima. Qui si guarda anche se c'è il testo registrato. */
  private async ricaricaMateriali(voce: VoceVideo): Promise<void> {
    voce.testoRegistrato = (await statistica(join(this.percorsi.materiali(voce.slug), "testo-registrato.md")))?.isFile() ?? false
    const trovati = await Promise.all(
      ESTENSIONI_ANTEPRIMA.map(async (estensione) => {
        const nome = `anteprima.${estensione}`
        const stato = await statistica(join(this.percorsi.materiali(voce.slug), nome))
        return stato?.isFile() ? [{ file: `video/${voce.slug}/materiali/${nome}`, mtime: stato.mtimeMs }] : []
      }),
    )
    const piuRecente = trovati.flat().sort((x, y) => y.mtime - x.mtime)[0] ?? null
    voce.anteprima = piuRecente
    if (piuRecente) this.segna(voce, piuRecente.mtime)
  }

  /** La prova ha la sua immagine accanto; una prova più nuova dell'immagine (o senza) ne vuole una nuova. */
  private programmaImmagineDellaProva(voce: VoceVideo): void {
    const prova = voce.uscite.find((u) => u.file === `video/${voce.slug}/uscite/prova.mp4`)
    if (!prova) return
    const immagine = voce.uscite.find((u) => u.file === `video/${voce.slug}/uscite/prova.jpg`)
    if (immagine && Date.parse(immagine.cambiato) >= Date.parse(prova.cambiato)) return
    this.miniature.programmaProva(voce.slug, Date.parse(prova.cambiato))
  }

  // --- Il piano -------------------------------------------------------------------------------

  /**
   * Rilegge `piano.json`. Se è cambiato non per mano del server (`proprio` è il testo che il server ha appena scritto), la versione di prima va in storia.
   * Un testo che non è JSON lascia il piano com'era e ne dice il motivo in `pianoProblemi`; uno che non passa lo schema diventa il piano, ma non
   * un piano valido. Con `rivaluta` si giudica di nuovo anche un testo già visto (lo schema è cambiato).
   */
  private async pianoDaDisco(voce: VoceVideo, proprio?: string, rivaluta = false): Promise<void> {
    const testo = await leggiTesto(this.percorsi.piano(voce.slug))
    if (testo === voce.pianoVisto && !rivaluta) return
    voce.pianoVisto = testo
    if (testo === null) {
      Object.assign(voce, { piano: null, pianoTesto: null, pianoValido: null, pianoProblemi: [], pianoMtime: 0 })
      this.dopoIlPiano(voce, false)
      return
    }
    const letto = jsonDaTesto(testo)
    if (!letto) {
      console.error(`piano di «${voce.slug}» non è un JSON valido: lo lascio com'era finché non lo sistemi.`)
      this.cambiaProblemiDelPiano(voce, [NON_SI_LEGGE])
      return
    }
    // Un piano scritto da fuori (non dalle rotte, che l'hanno già controllato) si controlla anche nei riferimenti: all'avvio no, a piani ancora da leggere.
    const dellaForma = this.schemi.piano(letto.valore)
    const problemi = dellaForma.length > 0 || !this.avviato || testo === proprio ? dellaForma : await this.problemiDelPiano(voce.slug, letto.valore)
    if (testo === voce.pianoTesto) {
      if (JSON.stringify(problemi) === JSON.stringify(voce.pianoProblemi)) return
      voce.pianoValido = problemi.length === 0 ? (letto.valore as Piano) : null
      voce.pianoProblemi = problemi
      this.dopoIlPiano(voce, problemi.length === 0)
      return
    }
    if (testo !== proprio && voce.pianoTesto !== null) await registraNuovaVersione(this.percorsi.storia(voce.slug), voce.storia, voce.pianoTesto)
    voce.pianoTesto = testo
    voce.piano = letto.valore
    voce.pianoValido = problemi.length === 0 ? (letto.valore as Piano) : null
    voce.pianoProblemi = problemi
    voce.pianoMtime = (await statistica(this.percorsi.piano(voce.slug)))?.mtimeMs ?? Date.now()
    this.segna(voce, voce.pianoMtime)
    this.dopoIlPiano(voce, problemi.length === 0)
  }

  private cambiaProblemiDelPiano(voce: VoceVideo, problemi: Testo[]): void {
    if (JSON.stringify(problemi) === JSON.stringify(voce.pianoProblemi)) return
    voce.pianoProblemi = problemi
    this.annuncia(voce.slug, "piano")
  }

  private dopoIlPiano(voce: VoceVideo, risolvi: boolean): void {
    const usiCambiati = this.indice.ricalcolaUsi()
    this.annuncia(voce.slug, "piano")
    this.indice.dipendenti(voce.slug).forEach((slug) => this.annuncia(slug, "piano"))
    if (usiCambiati) this.eventi.emetti({ tipo: "grezzo" })
    if (risolvi) this.accodaRisolvi(voce.slug, true)
  }

  /** `risolvi` per il video e, con `conDipendenti`, per i video che lo usano come base. Non durante la lettura iniziale: dopo, `accodaRisolviIndietro` guarda cosa manca. */
  private accodaRisolvi(slug: string, conDipendenti: boolean): void {
    if (!this.avviato) return
    const da = conDipendenti ? [slug, ...this.indice.dipendenti(slug)] : [slug]
    da.filter((s) => this.indice.video.get(s)?.pianoValido != null).forEach((s) => this.coda.accoda({ comando: "risolvi", argomenti: [s], slug: s, file: null }))
  }

  /** Salva il piano come lo manda l'interfaccia: la versione di prima va in storia. Dice se qualcosa è cambiato. */
  salvaPiano(slug: string, nuovoTesto: string): Promise<boolean> {
    return this.conBlocco(slug, () => this.scriviPiano(slug, nuovoTesto))
  }

  /** Il piano di adesso, ritoccato da `ritocca` (che lo controlla e lancia se non va), salvato nello stesso blocco: due ritocchi insieme si mettono in fila e nessuno si perde. `null` se il video non ha un piano. */
  ritoccaPiano(slug: string, ritocca: (piano: unknown) => Promise<unknown>): Promise<unknown> {
    return this.conBlocco(slug, async () => {
      const voce = this.indice.video.get(slug)
      if (!voce) return null
      await this.pianoDaDisco(voce)
      if (voce.pianoTesto === null) return null
      const ritoccato = await ritocca(JSON.parse(voce.pianoTesto))
      await this.scriviPiano(slug, testoJson(ritoccato))
      return ritoccato
    })
  }

  private async scriviPiano(slug: string, nuovoTesto: string): Promise<boolean> {
    const voce = this.indice.video.get(slug)
    if (!voce) return false
    await this.pianoDaDisco(voce)
    if (voce.pianoTesto === nuovoTesto) return false
    if (voce.pianoTesto !== null) await registraNuovaVersione(this.percorsi.storia(slug), voce.storia, voce.pianoTesto)
    await scrivi(this.percorsi.piano(slug), nuovoTesto)
    await this.pianoDaDisco(voce, nuovoTesto)
    return true
  }

  /** Torna alla versione di prima o a quella dopo. Dice se c'era dove andare. */
  muoviPiano(slug: string, indietro: boolean): Promise<boolean> {
    return this.conBlocco(slug, async () => {
      const voce = this.indice.video.get(slug)
      if (!voce) return false
      await this.pianoDaDisco(voce)
      const testo = await muovi(this.percorsi.storia(slug), voce.storia, indietro, voce.pianoTesto ?? "")
      if (testo === null) return false
      await scrivi(this.percorsi.piano(slug), testo)
      await this.pianoDaDisco(voce, testo)
      return true
    })
  }

  /** Le versioni del piano, dalla più recente; `null` se il video non ha un piano. */
  versioniDelPiano(slug: string): Promise<VersioneDelPiano[] | null> {
    return this.conBlocco(slug, async () => {
      const voce = this.indice.video.get(slug)
      if (!voce) return null
      await this.pianoDaDisco(voce)
      if (voce.pianoTesto === null) return null
      return descriviVersioni(await leggiVersioni(this.percorsi.storia(slug), voce.storia), voce.storia, { testo: voce.pianoTesto, mtime: voce.pianoMtime })
    })
  }

  /** Il piano della versione `n` di `storia/`, o `null` se non c'è. */
  async pianoDellaVersione(slug: string, n: number): Promise<unknown> {
    const testo = await leggiVersione(this.percorsi.storia(slug), n)
    return testo === null ? null : (jsonDaTesto(testo)?.valore ?? null)
  }

  /** Il piano di adesso va in storia e la versione `n` torna in uso (`controlla` rifiuta un piano che non va più, come lo schema o il girato di oggi). */
  ripristinaPiano(slug: string, n: number, controlla: (piano: unknown) => Promise<void>): Promise<"manca" | "uguale" | "fatto"> {
    return this.conBlocco(slug, async () => {
      const voce = this.indice.video.get(slug)
      if (!voce) return "manca"
      await this.pianoDaDisco(voce)
      if (voce.pianoTesto === null) return "manca"
      const vecchio = await leggiVersione(this.percorsi.storia(slug), n)
      if (vecchio === null) return "manca"
      if (vecchio === voce.pianoTesto) return "uguale"
      await controlla(jsonDaTesto(vecchio)?.valore)
      const testo = await ripristina(this.percorsi.storia(slug), voce.storia, n, voce.pianoTesto)
      if (testo === null) return "manca"
      await scrivi(this.percorsi.piano(slug), testo)
      await this.pianoDaDisco(voce, testo)
      return "fatto"
    })
  }

  // --- Il girato ------------------------------------------------------------------------------

  /** Dice se è cambiato qualcosa. */
  private async aggiornaGrezzo(giorno: string, nome: string): Promise<boolean> {
    if (!eFileDelGirato(nome)) return false
    const file = `${giorno}/${nome}`
    const files = this.indice.grezzo.get(giorno) ?? new Map()
    this.indice.grezzo.set(giorno, files)

    const stato = await statistica(this.percorsi.grezzo(file))
    if (!stato?.isFile()) return files.delete(nome)

    const testo = await leggiTesto(this.percorsi.schedaGrezzo(file))
    const letto = testo === null ? null : jsonDaTesto(testo)
    const problemi = testo === null ? [] : letto ? this.schemi.grezzo(letto.valore) : [NON_SI_LEGGE]
    if (problemi.length > 0) console.error(`scheda di «${file}» non valida (${problemi.join("; ")}): il file resta senza scheda finché non la correggi.`)
    const scheda = letto && problemi.length === 0 ? (letto.valore as SchedaGrezzo) : null

    const prima = files.get(nome)
    files.set(nome, { giorno, nome, byte: stato.size, mtime: stato.mtimeMs, scheda, schedaTesto: testo, schedaProblemi: problemi })
    // Senza durata il file non è ancora misurato: la sonda completa la scheda, e la miniatura viene dopo.
    if (testo === null || (scheda !== null && scheda.durata === undefined)) this.sonda.programma(file)
    // Con la durata nella scheda il file è intero e misurato: prima sarebbe un fotogramma preso a caso.
    else if (typeof scheda?.durata === "number" && !this.indice.preparati.get(file)?.miniatura) this.miniature.programma(file, scheda.durata)
    if (scheda !== null) await this.chiediLaFoto(file)
    return !prima || prima.byte !== stato.size || prima.schedaTesto !== testo || JSON.stringify(prima.schedaProblemi) !== JSON.stringify(problemi) || (prima.scheda === null) !== (scheda === null)
  }

  /**
   * Una HEIC dell'iPhone è una griglia di riquadri che ffmpeg legge a uno solo: la foto intera la fa il motore. Una volta per file e per
   * avvio, e solo quando il file ha la sua scheda (il telefono la scrive prima del file, la sonda dopo che ha smesso di crescere).
   */
  private async chiediLaFoto(file: string): Promise<void> {
    if (!eHeic(file) || this.fotoRichieste.has(file)) return
    this.fotoRichieste.add(file)
    if ((await statistica(join(this.percorsi.preparato(file), "foto.jpg"))) !== null) return
    this.coda.accoda({ comando: "prepara-file", argomenti: [file], slug: null, file })
  }

  private async aggiornaGiorno(giorno: string): Promise<boolean> {
    const presenti = (await elenca(join(this.percorsi.archivio, "grezzo", giorno))).filter((d) => d.isFile() && eFileDelGirato(d.name)).map((d) => d.name)
    let cambiato = false
    for (const nome of presenti) cambiato = (await this.aggiornaGrezzo(giorno, nome)) || cambiato
    const files = this.indice.grezzo.get(giorno)
    files?.forEach((_, nome) => {
      if (presenti.includes(nome)) return
      files.delete(nome)
      cambiato = true
    })
    return cambiato
  }

  private async aggiornaPreparato(giorno: string, nome: string): Promise<boolean> {
    const chiave = `${giorno}/${nome}`
    const nuovo: Preparato = { ...PREPARATO_VUOTO }
    ;(await elenca(this.percorsi.preparato(chiave))).forEach((d) => {
      const campo = d.isFile() ? FILE_PREPARATI[d.name] : undefined
      if (campo) nuovo[campo] = `preparati/${chiave}/${d.name}`
    })
    nuovo.sagoma_pezzi = await this.pezziDiSagoma(chiave)
    await this.aggiornaFotogrammi(chiave)
    const prima = this.indice.preparati.get(chiave) ?? PREPARATO_VUOTO
    if (JSON.stringify(prima) === JSON.stringify(nuovo)) return false
    if (Object.values(nuovo).every((v) => v === null)) this.indice.preparati.delete(chiave)
    else this.indice.preparati.set(chiave, nuovo)
    return true
  }

  /** I pezzi di sagoma elencati in `sagoma.json` il cui file c'è; un elenco che non si legge o senza pezzi buoni è come nessun elenco. */
  private async pezziDiSagoma(chiave: string): Promise<Preparato["sagoma_pezzi"]> {
    const cartella = this.percorsi.preparato(chiave)
    const testo = await leggiTesto(join(cartella, "sagoma.json"))
    const letto = testo === null ? null : jsonDaTesto(testo)
    if (!letto) return null
    const presenti = (await Promise.all(pezziDichiarati(letto.valore).map(async (p) => ((await statistica(join(cartella, p.file))) === null ? [] : [{ ...p, file: `preparati/${chiave}/${p.file}` }])))).flat()
    return presenti.length > 0 ? presenti : null
  }

  /** I fotogrammi fatti di un file (`<decimi>.jpg`); i file a metà, che cominciano per punto, non contano. */
  private async aggiornaFotogrammi(chiave: string): Promise<void> {
    const trovati = new Set((await elenca(join(this.percorsi.preparato(chiave), "fotogrammi"))).flatMap((d) => (d.isFile() && /^\d+\.jpg$/.test(d.name) ? [Number.parseInt(d.name, 10)] : [])))
    const prima = this.indice.fotogrammi.get(chiave)
    if (prima?.size === trovati.size && [...trovati].every((n) => prima.has(n))) return
    if (trovati.size === 0) this.indice.fotogrammi.delete(chiave)
    else this.indice.fotogrammi.set(chiave, trovati)
    this.fotogrammiCambiati.add(chiave)
  }

  private async aggiornaPreparatiDelGiorno(giorno: string): Promise<boolean> {
    const presenti = (await elenca(join(this.percorsi.archivio, "preparati", giorno))).filter((d) => d.isDirectory()).map((d) => d.name)
    const spariti = [...this.indice.preparati.keys()].filter((chiave) => chiave.startsWith(`${giorno}/`) && !presenti.includes(chiave.slice(giorno.length + 1)))
    let cambiato = false
    for (const nome of [...presenti, ...spariti.map((chiave) => chiave.slice(giorno.length + 1))]) cambiato = (await this.aggiornaPreparato(giorno, nome)) || cambiato
    return cambiato
  }
}
