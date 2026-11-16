// Un terzo motore per le prove della chat: il suo prefisso, i suoi livelli di effort, il suo registro, nessun comando con la barra, nessun
// lavoro in background e nessuno strumento suo per le domande. Fa ciò che la prova gli dice e registra ciò che riceve.
import type { ComandoChat } from "../src/chat/comandi"
import { serverVideo, type ServerMcp } from "../src/chat/metodo"
import type { Apertura, CapacitaDelMotore, ConversazioneLetta, EventoMotore, MessaggioPerIlMotore, Motore, NomiDelMotore, SessioneMotore } from "../src/chat/motore"
import { RegistroDelMotore } from "../src/chat/registro"
import { ErroreChat, type ModelloChat, type VoceSessione } from "../src/chat/tipi"
import { frase } from "../src/lingua"

const PREFISSO = "finto/"

export class SessioneFinta implements SessioneMotore {
  readonly scritti: MessaggioPerIlMotore[] = []
  /** Lo strumento «video» come questa conversazione lo riceve. */
  readonly mcp: Record<string, ServerMcp>
  readonly modelliCambiati: string[] = []
  fermate = 0
  chiusa = false
  private readonly conclusione = Promise.withResolvers<void>()
  readonly finita = this.conclusione.promise

  constructor(
    readonly apertura: Apertura,
    private readonly motore: MotoreFinto,
  ) {
    this.mcp = serverVideo(apertura.codice, apertura.lavoro, { id: apertura.id, capacita: motore.capacita })
  }

  /** Un evento del motore, come se lo mandasse lui. */
  evento(evento: EventoMotore): void {
    this.apertura.evento(evento)
  }

  scrivi = (messaggio: MessaggioPerIlMotore): void => {
    this.scritti.push(messaggio)
    const modello = (this.apertura.modello ?? `${PREFISSO}uno`).slice(PREFISSO.length)
    void this.motore.registro.cambia(this.apertura.id, (vecchio) => ({ sessione: this.apertura.id, modello, titolo: vecchio?.titolo ?? messaggio.testo.slice(0, 40), aggiornata: Date.now() }))
  }

  ferma = async (): Promise<void> => {
    this.fermate++
  }

  chiudi = (): void => {
    this.chiusa = true
    this.conclusione.resolve()
  }

  cambiaModello = async (modello: string): Promise<void> => {
    this.modelliCambiati.push(modello)
  }

  misuraIlContesto = async () => null
}

export class MotoreFinto implements Motore {
  readonly id = "finto"
  readonly nomi: NomiDelMotore = { programma: "Finto", servizio: "Finto Cloud", menu: "Finto", comando: null, nelleFrasi: "Finto" }
  readonly prefisso = PREFISSO
  readonly capacita: CapacitaDelMotore = {
    effort: true,
    comandi: false,
    fermaLavoro: false,
    inBackground: false,
    immaginiNegliEsiti: false,
    controlloRemoto: false,
    sottoagenti: false,
    browser: false,
    strumentoDelleDomande: false,
  }
  readonly registro: RegistroDelMotore
  readonly sessioni: SessioneFinta[] = []
  /** Se è vero il motore non risponde: i modelli falliscono e non è pronto. */
  spento = false
  private readonly osservatori = new Set<() => void>()

  constructor(archivio: string) {
    this.registro = new RegistroDelMotore(archivio, this.id, this.nomi.programma)
  }

  /** Il motore si accende o si spegne: chi osserva lo sa. */
  accendi(acceso: boolean): void {
    this.spento = !acceso
    this.osservatori.forEach((o) => o())
  }

  pronto = async (): Promise<boolean> => !this.spento

  apri = (apertura: Apertura): SessioneFinta => {
    const sessione = new SessioneFinta(apertura, this)
    this.sessioni.push(sessione)
    return sessione
  }

  modelli = async (): Promise<ModelloChat[]> => {
    if (this.spento) throw new ErroreChat(502, frase("Finto non risponde.", "Finto is not answering."))
    return [
      {
        id: `${PREFISSO}uno`,
        nome: "Finto · Uno",
        descrizione: "Un modello con due livelli",
        motore: this.id,
        effort: [
          { id: "corto", nome: { it: "Corto", en: "Short" } },
          { id: "lungo", nome: { it: "Lungo", en: "Long" } },
        ],
        reale: `${PREFISSO}uno`,
      },
      { id: `${PREFISSO}due`, nome: "Finto · Due", descrizione: "Un modello senza livelli", motore: this.id, effort: [], reale: `${PREFISSO}due` },
    ]
  }

  comandi = async (): Promise<ComandoChat[]> => []

  modelloGrande = (modelli: ModelloChat[]): string | null => modelli.at(-1)?.id ?? null

  osservaAccensione = (alCambio: () => void): { chiudi: () => void } => {
    this.osservatori.add(alCambio)
    return { chiudi: () => this.osservatori.delete(alCambio) }
  }

  elenca = (): Promise<VoceSessione[]> => this.registro.voci()

  eSua = (id: string): Promise<boolean> => this.registro.eSua(id)

  leggi: Motore["leggi"] = async (id): Promise<ConversazioneLetta | null> => {
    const ricordo = await this.registro.di(id)
    if (!ricordo) return null
    return { messaggi: [{ id: "m1", ruolo: "utente", quando: new Date(ricordo.aggiornata).toISOString(), parti: [{ tipo: "testo", testo: ricordo.titolo }] }], contestoUsato: null, primoGiro: false, modello: `${PREFISSO}${ricordo.modello}` }
  }
}
