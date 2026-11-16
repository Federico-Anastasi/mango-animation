// Il contratto fra la chat e un motore: ciò che un motore è e sa fare, gli eventi che dà mentre lavora, ciò che
// la chat gli chiede, le richieste che lui fa al creator e una conversazione riletta. Ogni motore traduce il suo protocollo in queste forme.
import { frase, type Frase, type Lingua } from "../lingua"
import type { ComandoChat } from "./comandi"
import { ErroreChat, type ContestoUsato, type DomandaChat, type ImmagineDelloStrumento, type LivelloEffort, type MessaggioChat, type ModelloChat, type TaskChat, type UsoTask, type VoceSessione } from "./tipi"

/** Ciò che uno strumento ha risposto: il testo intero (lo accorcia la chat), se è un errore, le immagini. */
export interface EsitoDelloStrumento {
  testo: string
  errore: boolean
  immagini: ImmagineDelloStrumento[]
}

/** Un lavoro in background che il motore dice di avere ancora. */
export interface LavoroInBackground {
  id: string
  genere: TaskChat["tipo"]
  descrizione: string
}

/** Com'è finito male un giro, in un codice del prodotto: la frase per il creator la scrive la chat, col nome del motore. */
export type ErroreDelGiro =
  /** L'abbonamento non permette altri messaggi; `finoA` in secondi dal 1970, se il motore lo sa. */
  | { codice: "limite"; finoA: number | null }
  | { codice: "non_collegato" | "sovraccarico" | "pagamento" | "sospeso" | "organizzazione" | "verifica" | "risposta_troppo_lunga" | "troppi_passaggi" | "limite_di_spesa" }
  /** Un errore del servizio che il prodotto non conosce: `dettaglio` è il suo nome com'è arrivato. */
  | { codice: "non_risposto"; dettaglio: string }
  /** Il giro si è chiuso da sé dicendo perché (`fermato`), oppure con un errore (`errore`); `causa` può essere vuota. */
  | { codice: "fermato" | "errore"; causa: string }

export type EventoMotore =
  /** Il motore è partito: il modello e l'effort che ha acceso. */
  | { tipo: "avvio"; modello: string; effort: LivelloEffort | null }
  /** Sta lavorando a un giro, anche cominciato da sé. */
  | { tipo: "attivo" }
  /** Un pezzo di testo o di pensiero: i pezzi con la stessa `voce` sono la stessa Parte, una voce nuova è una Parte nuova. */
  | { tipo: "testo" | "pensiero"; voce: string; pezzo: string }
  /** Uno strumento parte. `nome` è nel vocabolario della chat (`Bash`, `Read`, `mcp__video__…`). */
  | { tipo: "strumento"; id: string; nome: string; ingresso: unknown }
  /** L'ingresso di uno strumento già partito, quando arriva intero dopo. */
  | { tipo: "ingresso"; id: string; ingresso: unknown }
  | { tipo: "esito"; id: string; esito: EsitoDelloStrumento }
  /** Ciò che ha scritto un comando locale del motore (`/context`, `/compact`). */
  | { tipo: "uscita"; testo: string }
  /** Quanto contesto occupa la conversazione dopo una risposta. */
  | { tipo: "contesto"; usati: number }
  /** Il contesto è stato riassunto: quello nuovo non si sa ancora. */
  | { tipo: "riassunto" }
  | { tipo: "titolo"; titolo: string }
  | { tipo: "comandi"; comandi: ComandoChat[] }
  | { tipo: "lavoro"; cosa: "iniziato"; id: string; genere: TaskChat["tipo"]; descrizione: string; background: boolean }
  | { tipo: "lavoro"; cosa: "cambiato"; id: string; background?: boolean; descrizione?: string }
  | { tipo: "lavoro"; cosa: "uso"; id: string; uso: UsoTask }
  | { tipo: "lavoro"; cosa: "finito"; id: string }
  /** L'elenco intero dei lavori in background: quelli che mancano sono finiti. */
  | { tipo: "lavoro"; cosa: "in_background"; lavori: LavoroInBackground[] }
  /** Il giro è finito. `inCoda`: i messaggi del creator già arrivati che avranno un altro giro. */
  | { tipo: "fine"; errore: ErroreDelGiro | null; costo?: number; durata_ms: number; inCoda: number }

/** Ciò che il motore chiede al creator: il permesso di usare uno strumento, o una o più domande con le loro opzioni. */
export type RichiestaDelMotore = { tipo: "permesso"; id: string; strumento: string; ingresso: Record<string, unknown> } | { tipo: "domanda"; id: string; domande: DomandaChat[] }

/** La risposta: per una domanda, il testo scelto o scritto per ogni domanda; per un no, la frase da dare al motore e se deve fermarsi. */
export type RispostaAlMotore = { consente: true; risposte?: Record<string, string> } | { consente: false; motivo: string; ferma: boolean }

export type TipoImmagine = "image/png" | "image/jpeg" | "image/gif" | "image/webp"

/** Un messaggio del creator: il testo che il motore legge e le immagini che vede (in base64). */
export interface MessaggioPerIlMotore {
  testo: string
  immagini: { tipo: TipoImmagine; dati: string }[]
}

export interface Apertura {
  id: string
  /** La conversazione c'è già presso il motore: si riprende invece di crearla. */
  esiste: boolean
  /** La cartella del prodotto, da cui arriva il metodo. */
  codice: string
  /** La cartella in cui il motore lavora. */
  lavoro: string
  /** La scelta del creator; `null`: quello del motore. */
  modello: string | null
  effort: LivelloEffort | null
  /** Ogni cosa che succede, nell'ordine in cui succede. */
  evento: (evento: EventoMotore) => void
  /** `annullata` scatta se il motore ritira la richiesta prima della risposta. */
  chiedi: (richiesta: RichiestaDelMotore, annullata: AbortSignal) => Promise<RispostaAlMotore>
  /** La lingua dello studio, per le frasi che il motore riceve al posto di una risposta. */
  lingua: () => Lingua
}

/** Una conversazione accesa presso il motore. Ciò che un motore non sa fare manca, e lo dicono le sue capacità. */
export interface SessioneMotore {
  /** Si chiude quando il motore si spegne; fallisce se si interrompe. */
  finita: Promise<void>
  /** Accoda un messaggio del creator: il motore lo legge anche mentre lavora. */
  scrivi: (messaggio: MessaggioPerIlMotore) => void
  /** Ferma il giro in corso. */
  ferma: () => Promise<void>
  /** Spegne la conversazione: resta presso il motore e si riprende con `esiste`. */
  chiudi: () => void
  cambiaModello: (modello: string) => Promise<void>
  /** `null` torna al predefinito del modello. Solo i motori con la capacità `effort`. */
  cambiaEffort?: (effort: LivelloEffort | null) => Promise<void>
  /** Solo i motori con la capacità `fermaLavoro`. */
  fermaLavoro?: (id: string) => Promise<void>
  /** I lavori in primo piano vanno in background, e il motore legge subito ciò che il creator ha scritto. Solo i motori con la capacità `inBackground`. */
  inBackground?: () => Promise<void>
  /** La misura intera a fine giro; `null` se il motore non ha ancora contato. */
  misuraIlContesto: () => Promise<ContestoUsato | null>
  /** Rende la conversazione raggiungibile dall'app del motore, col nome dato. Solo i motori che l'hanno. */
  collega?: (nome: string) => void
}

/** Una conversazione riletta da dove il motore la tiene. */
export interface ConversazioneLetta {
  messaggi: MessaggioChat[]
  /** `null` se nessuna risposta lo dice, o se dopo l'ultima il contesto è stato riassunto. */
  contestoUsato: ContestoUsato | null
  /** È cominciata con l'avvio del primo giro. */
  primoGiro: boolean
  /** Il modello con cui girava, nell'`id` dell'elenco dei modelli; `null` se non lo si sa o se non è più offerto. */
  modello: string | null
}

/** Come il motore si chiama nelle frasi per il creator. */
export interface NomiDelMotore {
  /** Il programma: «Claude Code», «Mango Code». */
  programma: string
  /** Il servizio che risponde, nelle frasi sull'account e sui limiti. */
  servizio: string
  /** Nel menu dei motori dello studio. */
  menu: string
  /** Il comando da terminale a cui le frasi rimandano; `null` se il motore non ne ha uno. */
  comando: string | null
  /** Il nome con cui la chat lo chiama mentre lavora; `null` se non ne ha uno suo. */
  nelleFrasi: string | null
}

/** Ciò che un motore sa fare: lo studio non offre i bottoni di ciò che manca, e la chat risponde 409 a chi li chiede lo stesso. */
export interface CapacitaDelMotore {
  /** Livelli di effort, per modello. */
  effort: boolean
  /** I comandi con la barra. */
  comandi: boolean
  fermaLavoro: boolean
  inBackground: boolean
  /** Le immagini dei risultati degli strumenti arrivano alla chat. */
  immaginiNegliEsiti: boolean
  /** La conversazione compare nell'app del motore. */
  controlloRemoto: boolean
  sottoagenti: boolean
  /** Sa usare il browser del creator. */
  browser: boolean
  /** Ha un suo strumento per fare domande al creator: se manca, lo dà il server MCP «video». */
  strumentoDelleDomande: boolean
}

/** Cosa manca a un motore, per la frase del 409 che lo nomina. */
export type CapacitaMancante = "effort" | "comandi" | "fermaLavoro" | "inBackground"

const FRASI_DI_CIO_CHE_MANCA: Record<CapacitaMancante, (programma: string) => Frase> = {
  effort: (p) => frase(`${p} non ha livelli di effort.`, `${p} has no effort levels.`),
  comandi: (p) => frase(`${p} non ha comandi con la barra.`, `${p} has no slash commands.`),
  fermaLavoro: (p) => frase(`${p} non ha lavori da fermare uno per uno: usa «Ferma».`, `${p} has no jobs to stop one by one: use «Stop».`),
  inBackground: (p) => frase(`${p} non ha lavori da mandare in background.`, `${p} has no jobs to send to the background.`),
}

/** L'errore di chi chiede a un motore ciò che non ha. */
export const manca = (nomi: NomiDelMotore, cosa: CapacitaMancante): ErroreChat => new ErroreChat(409, FRASI_DI_CIO_CHE_MANCA[cosa](nomi.programma))

/** Un motore della chat, intero: cosa è, cosa sa fare, le sue conversazioni, i suoi modelli e i suoi comandi. */
export interface Motore {
  /** L'identificativo che le rotte e lo studio usano (`claude-code`, `mango-code`). */
  id: string
  nomi: NomiDelMotore
  /** L'inizio dell'`id` dei suoi modelli; `null` per il motore dei modelli senza prefisso (ce n'è uno solo). */
  prefisso: string | null
  capacita: CapacitaDelMotore
  /** Risponde adesso. */
  pronto: (lavoro: string) => Promise<boolean>
  apri: (apertura: Apertura) => SessioneMotore
  /** I modelli che offre adesso; fallisce se non riesce a leggerli. */
  modelli: (lavoro: string) => Promise<ModelloChat[]>
  /** I comandi con la barra, se la capacità `comandi` c'è. */
  comandi: (lavoro: string) => Promise<ComandoChat[]>
  /** Il modello che indica per il primo giro, fra i suoi; `null` se non ne indica uno. */
  modelloGrande: (modelli: ModelloChat[]) => string | null
  /** Avvisa quando il motore si accende o si spegne, e i suoi modelli sono da rileggere. `null` se non c'è niente da osservare. */
  osservaAccensione?: (alCambio: () => void) => { chiudi: () => void } | null
  /** Rifiuta un messaggio con la barra che il motore non può avere dalla chat. */
  controllaIlComando?: (testo: string) => void

  // Le sue conversazioni.
  /** Quelle che il motore ha, per l'elenco. */
  elenca: () => Promise<VoceSessione[]>
  /** `null` se la conversazione non c'è. */
  leggi: (id: string, dove: { lavoro: string; archivio: string; lingua: Lingua }) => Promise<ConversazioneLetta | null>
  /** Avvisa quando una sua conversazione cambia (anche fuori dalla chat). Solo chi le tiene in file che altri possono scrivere. */
  osservaConversazioni?: (alCambio: (id: string) => void) => Promise<{ chiudi: () => void }>
  /** La conversazione è sua. Solo i motori che danno loro l'identificativo alle conversazioni (e le tengono in un registro). */
  eSua?: (id: string) => Promise<boolean>
}

/** Ciò che cambia nell'app rispetto al terminale, in testa alle istruzioni di ogni motore. */
export const istruzioniDellApp = (motore: { immaginiNegliEsiti: boolean; strumentoDelleDomande: string }): string =>
  [
    "The creator writes to you from the chat of the Mango Animation app, not from a terminal: next to the chat there is the studio with the videos.",
    motore.immaginiNegliEsiti ? "The creator sees in the chat the images returned by the tools (foto, slide, scene_foto): to show a result, use them." : null,
    `When a choice is needed use the ${motore.strumentoDelleDomande} tool: in the chat it becomes a set of buttons.`,
    "Never ask the creator to run commands: if a command is needed, run it yourself.",
    "Name a video by its slug or by the path archivio/video/<slug>/…: in the chat it becomes a link that opens it in the studio. Other paths inside archivio/ become a button that shows them in Explorer; paths elsewhere are plain text.",
    "Write to the creator in their language (`creator.lingua` in `profilo.json`), in every sentence, even the short ones between one step and the next, and in the description of the commands you run (the chat shows it to the creator).",
  ]
    .filter((riga): riga is string => riga !== null)
    .join("\n")
