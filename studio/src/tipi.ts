// Le forme dei dati, scritte a mano da `motore/schemi/*.json` e da `docs/` (PIANO, API, ARCHIVIO, MOTORE).
// I percorsi dei file nelle risposte sono relativi all'archivio, tranne `file` di una sorgente e di un
// file del girato, che sono relativi a `grezzo/`.

import type { EventoChat } from "./chat/tipi"

export type Rettangolo = [number, number, number, number]
export type Punto = [number, number]

export interface Zoom {
  scala?: number
  da?: number
  a?: number
  centro?: Punto
}

export interface Pezzo {
  /** Senza `sorgente` il pezzo è senza voce: ha `durata` e, se mostra una ripresa muta, `girato` (con `vista` e `zoom`). */
  sorgente?: string
  durata?: number
  da?: number
  a?: number
  via?: Array<[number, number]>
  pausa?: number
  minuto?: string
  dice?: string
  rifila?: [number, number]
  vista?: string
  zoom?: Zoom
}

export interface Scena {
  nome: string
  quadro?: string
  animazione?: string
  vista?: string
  pezzi: Pezzo[]
  ancore?: Array<[string, number, number]>
  parole?: Record<string, [string, number]>
}

export interface Vista {
  taglio: Rettangolo
  inserto?: Rettangolo
}

export interface Sorgente {
  file: string
  sfasamento?: number
  riquadri?: Record<string, Rettangolo>
  viste?: Record<string, Vista>
}

export interface Correzione {
  sorgente?: string
  sentite: string[]
  giuste: string | string[]
}

export interface Ritocco {
  sorgente: string
  minuto: string
  sentito: string
  detto: string
}

export type ModoSottotitoli = "parola per parola" | "a battute" | "nessuno"

export type ScritturaSottotitoli = "minuscola" | "come trascritta"

export interface SottotitoliPiano {
  modo?: ModoSottotitoli
  scrittura?: ScritturaSottotitoli
  nomi?: string[]
  correzioni?: Correzione[]
  ritocchi?: Ritocco[]
}

export interface TitoloPiano {
  testo: string
  parte?: string
  da?: number
  a?: number
}

export interface SuonoPiano {
  file: string
  /** Si lega a una sorgente o a una scena (un video senza voce non ha sorgenti). */
  sorgente?: string
  scena?: string
  t: number
  picco: number
}

export interface Piano {
  base?: string
  quadro?: string
  sorgenti?: Record<string, Sorgente>
  scene?: Scena[]
  sottotitoli?: SottotitoliPiano
  titolo?: TitoloPiano
  suoni?: SuonoPiano[]
  coda?: number
  /** Il primo fotogramma del video: il disegno e, se serve, il secondo da cui prendere la sagoma. */
  copertina?: { disegno: string; istante?: number }
}

export interface PianoCompleto extends Piano {
  quadro: string
  sorgenti: Record<string, Sorgente>
  scene: Scena[]
}

export interface ScenaRisolta {
  nome: string
  quadro: string
  inizio: number
  durata: number
  animazione: string | null
  ancore: Array<[number, number]>
  tempi: Record<string, number>
}

export interface Tratto {
  scena: number
  pezzo: number
  /** `null` per un pezzo senza voce: niente parole; ciò che mostra, se non è solo l'animazione, sta in `girato`. */
  sorgente: string | null
  da: number
  durata: number
  esce: number
  vista: string | null
  zoom: Zoom | null
  legato: [number | null, number | null]
  /** La sagoma viene da un'altra ripresa: quale e da che secondo. */
  sagoma: { sorgente: string; da: number } | null
  /** Ciò che lo strato `girato` mostra quando non è la ripresa della voce: un'altra ripresa, ferma o che corre al suo `passo`; per un pezzo senza voce è il suo girato muto. */
  girato?: { sorgente: string; da?: number; fermo?: number; passo?: number } | null
}

export interface ParolaRisolta {
  p: string
  da: number
  a: number
  tratto: number
  nella_sorgente: number
  /** Quello dell'allineamento: solo per i pezzi a parole, per gli altri `null`. */
  voto: number | null
}

export interface Battuta {
  da: number
  a: number
  testo: string
  istanti: number[]
  /** Una parola che conta: sta da sola, più grande, e salta quando viene detta. */
  rilievo?: boolean
}

export interface Avviso {
  tratto: number
  cosa: string
  /** La stessa frase in inglese; manca in un `risolto.json` scritto prima che il motore la scrivesse. */
  cosa_en?: string
}

export interface Risolto {
  impronta: string
  formato: { largo: number; alto: number; fps: number }
  durata: number
  scene: ScenaRisolta[]
  tratti: Tratto[]
  parole: ParolaRisolta[]
  battute: Battuta[]
  titolo: { testo: string; parte?: string | null; da: number; a: number } | null
  /** La copertina com'è nel piano: il montato ha un fotogramma in più davanti. */
  copertina?: { disegno: string; istante?: number } | null
  suoni: Array<{ file: string; esce: number; guadagno: number }>
  avvisi: Avviso[]
}

export type StatoVideo = "proposta" | "in lavorazione" | "pronto" | "pubblicato" | "scartato"

export interface Pubblicazione {
  canale: string
  data: string
  url?: string
}

export interface Numeri {
  data: string
  canale: string
  visualizzazioni?: number
  mi_piace?: number
  commenti?: number
  condivisioni?: number
  salvati?: number
}

export interface DaVerificare {
  cosa: string
  perche?: string
  stato: "aperto" | "a posto"
}

export interface PassoScaletta {
  apri: string
  fai?: string
  spiega?: string
}

export interface Scheda {
  titolo: string
  stato: StatoVideo
  creato: string
  serie?: string
  /** 1 è il primo da fare; chi non l'ha viene dopo. */
  priorita?: number
  /** Senza: un video. Un carosello ha le sue immagini in `uscite/slide-<n>.png`. */
  formato?: "video" | "carosello"
  canali?: Array<"tiktok" | "instagram" | "youtube" | "x">
  /** `quadro` e `scene` servono alla prova prima di registrare: ogni scena comincia alla frase del copione che inizia con `dalla`. */
  proposta?: {
    aggancio?: string
    centro?: string
    chiusa?: string
    note?: string
    quadro?: string
    scene?: Array<{ animazione: string | null; dalla: string }>
  }
  scaletta?: PassoScaletta[]
  didascalia?: string
  hashtag?: string[]
  pubblicazioni?: Pubblicazione[]
  numeri?: Numeri[]
  da_verificare?: DaVerificare[]
  note?: string
}

export interface Controllo {
  quando: string
  del_finale: string
  durata: number
  silenzi: Array<{ a: number; dura: number }>
  parole_fuori_posto: Array<{ parola: string; attesa: [number, number]; trovata: [number, number]; voto: number }>
  sentito: string
  differenze: Array<{ a: number; voluto: string; sentito: string }>
  tagli_nel_parlato: Array<{ a: number; db: number }>
}

export interface Uscita {
  file: string
  byte: number
  cambiato: string
  /** Se è un secondo nome di un altro file di `uscite/` (`con-copertina.mp4` di `finale.mp4`), quell'altro; altrimenti `null`. */
  stesso_file: string | null
}

export interface DettaglioVideo {
  slug: string
  cartella: string
  scheda: Scheda
  /** `null` per un video senza piano: se è finito, c'è solo il file in `uscite`. */
  piano: Piano | null
  /** Perché la scheda e il piano scritti nei file non passano i controlli (vuoto se passano). `scheda` e `piano` sono gli ultimi buoni. */
  problemi: { scheda: string[]; piano: string[] }
  /** `null` se la base non esiste o fa un giro, o se il piano scritto nel file non è valido. */
  piano_risolto_da_base: PianoCompleto | null
  risolto: Risolto | null
  risolto_aggiornato: boolean
  controllo: Controllo | null
  uscite: Uscita[]
  /** Il video montato completo da guardare (quello con la copertina se è dello stesso montaggio); `null` senza montato. */
  montato: { file: string; quando: string } | null
  materiali: Array<{ file: string; byte: number }>
  puo_annullare: boolean
  puo_rifare: boolean
  /** Il lavoro di questo video che gira o aspetta, se c'è. */
  lavoro: { id: string | number; comando: string; stato: "in corso" | "in coda" } | null
  /** Il piano o lo stile sono stati salvati dopo l'inizio del montaggio in corso di questo video. */
  montaggio_superato: boolean
  /** Quando il piano (o quello di una sua base) è stato salvato l'ultima volta, in ISO. */
  piano_cambiato: string | null
  /** Il piano è stato salvato dopo l'ultimo montaggio: il video montato non lo segue. Falso senza un montato. */
  piano_dopo_montato: boolean
  /** Un elemento per tratto del risolto: il fotogramma d'inizio (percorso nell'archivio), o `null` se il tratto non ha girato o l'immagine non è ancora pronta. */
  fotogrammi: Array<string | null>
}

export interface VoceElenco {
  slug: string
  scheda: Scheda
  durata: number | null
  miniatura: string | null
  /** `materiali/anteprima.<estensione>`, se c'è: ciò con cui una proposta si presenta. */
  anteprima: string | null
  ha_piano: boolean
  ha_finale: boolean
  ultimo_cambio: string
}

export type TipoGrezzo = "ripresa" | "diretta" | "schermo" | "altro"
export type OrigineGrezzo = "telefono" | "registrazione" | "scaricato" | "altro"

export interface SchedaGrezzo {
  tipo: TipoGrezzo
  origine: OrigineGrezzo
  arrivato?: string
  durata?: number
  largo?: number
  alto?: number
  fps?: number
  note?: string
  /** Solo per un file scaricato dal web. */
  url?: string
  tratto?: { da: number; a?: number }
  titolo?: string
  canale?: string
}

/** Un pezzo di sagoma preparata (`docs/ARCHIVIO.md`): i secondi della ripresa che copre e il file, che comincia a `inizio`. */
export interface PezzoSagoma {
  da: number
  a: number
  /** Relativo all'archivio. */
  file: string
  inizio: number
}

export interface PreparatoGrezzo {
  parole: string | null
  sagoma: string | null
  /** I pezzi che `sagoma.json` elenca e che ci sono; senza elenco, la sagoma di prima è `sagoma`. */
  sagoma_pezzi?: PezzoSagoma[] | null
  leggero: string | null
  onda: string | null
  miniatura: string | null
  /** Di un file immagine: la foto intera e dritta, che il browser mostra anche per una HEIC. */
  foto?: string | null
  trascrizione: string | null
}

export interface FileGrezzo {
  /** `giorno/nome`, come nei piani. */
  file: string
  nome: string
  byte: number
  /** `null` finché il server non l'ha scritta. */
  scheda: SchedaGrezzo | null
  /** Perché la scheda scritta nel file non passa i controlli (vuoto se passa o non c'è). */
  scheda_problemi: string[]
  preparato: PreparatoGrezzo
  usato_in: string[]
}

export interface GiornoGrezzo {
  giorno: string
  file: FileGrezzo[]
}

export interface ParolaGrezzo {
  p: string
  da: number
  a: number
}


export interface Lavoro {
  id: string | number
  slug: string | null
  comando: string
  /** `giorno/nome` per la preparazione di un file. */
  file?: string | null
  accodato?: string
  iniziato?: string
  finito?: string
  righe?: string[]
  /** Del lavoro in corso: i secondi che dovrebbe durare e quando dovrebbe finire; `null` se non c'è storia per stimarlo. */
  stima?: number | null
  fine_prevista?: string | null
  esito?: "riuscito" | "fallito" | "fermato" | "interrotto"
  errore?: string | null
}

/** `GET /api/profilo`: se `profilo.json` passa lo schema, e le frasi di ciò che non va. */
export interface StatoProfilo {
  valido: boolean
  presente: boolean
  canali: Array<{ piattaforma: string; nome?: string }>
  problemi: string[]
}

export interface StatoLavori {
  in_corso: Lavoro | null
  in_coda: Lavoro[]
  finiti: Lavoro[]
}

export interface StatoArrivi {
  in_ascolto: boolean
  indirizzo: string | null
  qr: string | null
  errore: string | null
  ultimi: Array<{ file: string; quando: string; byte: number }>
  firewall: "consentito" | "bloccato" | "in-attesa" | "sconosciuto" | "non-controllato"
  pronto: boolean
  motivo: string | null
  /** La pagina coi video montati da guardare sul telefono, e il suo codice QR. */
  guarda: string | null
  qr_guarda: string | null
  /** La pagina per mandare i video dal telefono, e il suo codice QR. */
  carica: string | null
  qr_carica: string | null
}

interface LinkStudio {
  indirizzo: string
  link: string
  qr: string
}

export interface StatoStudioRemoto {
  acceso: boolean
  in_ascolto: boolean
  /** Il link per entrare dal Wi-Fi di casa; `null` se spento o senza rete. */
  casa: LinkStudio | null
  /** Il link per entrare da fuori casa con Tailscale; `null` se spento o se Tailscale non c'è sul computer. */
  fuori: (LinkStudio & { pronto: boolean; motivo: string | null }) | null
  /** Se il Wi-Fi di casa può arrivare fin qui, e se no perché. */
  pronto: boolean
  motivo: string | null
}

export interface AnimazioneDisponibile {
  sigla: string
  titolo: string
  durata: number
}

export type Angolo = "alto-sinistra" | "alto-destra" | "basso-sinistra" | "basso-destra"

export type Strato =
  | { tipo: "animazione"; area: Rettangolo }
  | { tipo: "girato"; area: Rettangolo; centro?: Punto; adatta?: "contieni" | "riempi" }
  | { tipo: "sagoma"; scala_minima: number; testa: number; /** `"testa"`: la testa al centro del fotogramma. */ x: number | "testa"; aria: number; sfuma: number; scala_margine?: number }
  | { tipo: "riquadro"; nome: string; y: number; scala: number; raggio: number }
  | { tipo: "inserto"; largo: number; bordo: number }
  | { tipo: "viso"; nome: string; angolo: Angolo; largo: number; margine: number; raggio: number }

export interface Formato {
  largo: number
  alto: number
  fps: number
}

/** Ciò che un quadro può cambiare di un cartello (sottotitoli o titolo) rispetto allo stile: il punto in cui sta e l'aspetto. */
export interface SpecCartello {
  x: number
  y: number
  corpo?: number
  corpo_minimo?: number
  /** `null`: niente riquadro dietro le lettere. */
  fondo?: string | null
  colore?: string
  bordo?: number
  contorno?: number
  colore_contorno?: string
}

export interface Quadro {
  /** Il nome di un formato di `formati`; senza, quello verticale di `formato`. */
  formato?: string
  fondo: string
  strati: Strato[]
  sottotitoli: SpecCartello & { largo: number; ancora: "sinistra" | "centro" }
  titolo: SpecCartello & { largo?: number; ancora: "sinistra" | "centro" }
  fascia_animazione?: Rettangolo
}

export interface Stile {
  formato: Formato
  formati?: Record<string, Formato>
  colori: Record<string, string>
  caratteri: Record<string, string>
  voce: { lufs: number; silenzio_db: number; margine: number }
  taglio: {
    a_tempo: { prima: number; dopo: number; pausa: number; tratto_minimo: number }
    a_parole: { pausa: number; stacco: number; vicine: number }
  }
  sottotitoli: {
    modo: ModoSottotitoli
    scrittura: ScritturaSottotitoli
    carattere: string
    corpo: number
    corpo_minimo: number
    caratteri_per_battuta: number
    stacco: number
    /** `null`: niente riquadro dietro le lettere. */
    fondo: string | null
    colore: string
    colore_correzione: string
    bordo: number
    /** Lo spessore e il colore del filo attorno alle lettere. */
    contorno?: number
    colore_contorno?: string
    margine: number
    margine_alto: number
    margine_basso: number
    interlinea: number
    passo_corpo: number
    rilievo: { corpo: number; colore: string; salto: number; salto_durata: number }
  }
  titolo: {
    carattere: string
    corpo: number
    corpo_minimo: number
    passo_corpo: number
    fondo: string
    colore: string
    margine: number
    margine_alto: number
    margine_basso: number
    interlinea: number
    largo: number
    allinea: "centro" | "sinistra"
    maiuscolo: boolean
    parte: { colore: string; stacco: number }
  }
  suoni: { fondo_db: number; accento_db: number }
  copertina: { titolo_in_alto: boolean; sagoma_del_primo_fotogramma: boolean }
  uscita: { crf: number; audio_kbit: number; leggero: { largo: number; alto: number; crf: number } }
  quadri: Record<string, Quadro>
}

export type ModoRegistrazione = "schermo" | "voce" | "viso"

export interface StatoRegistrazione {
  disponibile: boolean
  motivo: string | null
  dispositivi: { microfoni: string[]; camere: string[] } | null
  in_corso: { modo: ModoRegistrazione; iniziata: string; file: string[] } | null
  ultima: { file: string[]; finita: string; errore: string | null } | null
}

export type EventoVideo = "scheda" | "piano" | "risolto" | "controllo" | "uscite" | "materiali" | "fotogrammi" | "nuovo" | "tolto"

export type Evento =
  | { tipo: "video"; slug: string; cosa: EventoVideo }
  | { tipo: "grezzo" }
  | { tipo: "stile" }
  | { tipo: "animazioni" }
  | { tipo: "lavori" }
  | { tipo: "arrivi" }
  | { tipo: "accesso-studio" }
  | { tipo: "registrazione" }
  | { tipo: "canale"; canale: string }
  | { tipo: "consumi" }
  | { tipo: "modelli" }
  | { tipo: "comandi" }
  | { tipo: "profilo" }
  | EventoChat

export type TipoEvento = Evento["tipo"]

// --- I motori del profilo (`docs/MOTORI.md`, §4) ---------------------------------------------------

export type NomeMotore = "trascrizione" | "allineamento" | "sagoma" | "segui" | "pulizia_voce" | "dettatura"
export type DoveGira = "scheda" | "processore"

/** Una funzione pesante: `attiva` senza indicazione è vero, `dove` senza indicazione lo decide il computer; `modello` e `calcolo` sono della trascrizione e lo studio non li tocca. */
export interface FunzioneMotore {
  attiva?: boolean
  dove?: DoveGira
  modello?: string
  calcolo?: string
}

export type Motori = Partial<Record<NomeMotore, FunzioneMotore>>

// --- Il lavoro di Claude per video (`docs/API.md`, «Consumi») --------------------------------------

export interface GettoniDiClaude {
  /** Ciò che Claude ha scritto. */
  scritti: number
  /** Il contesto già visto che Claude rilegge a ogni richiesta. */
  riletti: number
  /** Il contesto messo per la prima volta. */
  nuovi: number
}

export interface ConsumoDiClaude {
  /** Secondi in cui Claude lavorava. */
  tempo: number
  giri: number
  token: GettoniDiClaude
}

export interface ConsumoDiUnVideo extends ConsumoDiClaude {
  dal: string
  al: string
}

export interface ConsumiDiClaude {
  /** Falso finché il server non ha letto tutte le conversazioni la prima volta: i conti di allora sono parziali. */
  pronto: boolean
  video: Record<string, ConsumoDiUnVideo>
  senza_video: ConsumoDiClaude
}

// --- Il canale: ciò che l'ultima lettura ha portato in archivio ------------------------------------

export interface LetturaCanale {
  lettura: string
  quando: string
  completa: boolean
  mancano: string[]
}

export interface VideoDelCanale {
  id: string
  url?: string
  slug: string | null
  titolo?: string
  didascalia?: string
  pubblicato?: string
  durata?: number
  visualizzazioni?: number
  mi_piace?: number
  commenti?: number
  condivisioni?: number
  salvati?: number
  nuovi_follower?: number
  tempo_medio?: number
  visti_fino_in_fondo?: number
  tempo_riproduzione_s?: number
  da_per_te?: number
  commenti_letti: number
  variazione: { visualizzazioni: number | null; mi_piace: number | null; commenti: number | null } | null
}

export interface RigaClassifica {
  posto: number
  nome: string
  cosa_fa: string
  follower: number
  mi_piace: number
  visualizzazioni: number
  punteggio: number
}

/** `quando` è il giorno in cui sono stati letti i profili; `quando_io` la lettura da cui vengono i numeri di `io`. */
export interface ClassificaCanale {
  quando: string | null
  io: string | null
  quando_io: string | null
  come: string[]
  righe: RigaClassifica[]
}

export interface StatoCanale {
  ultima: { lettura: string; quando: string } | null
  letture: LetturaCanale[]
  profilo: { quando?: string; nome?: string; follower?: number; seguiti?: number; mi_piace?: number; video?: number } | null
  video: VideoDelCanale[]
}

export interface TappaCrescita {
  data: string
  follower: number
}

/** `crescita.json` del canale (`docs/ARCHIVIO.md`, «La crescita del canale»). */
export interface Crescita {
  quando: string
  partenza: TappaCrescita
  obiettivo: string
  scenari: Array<{ nome: string; tappe: TappaCrescita[] }>
  settimana: Array<{ giorno: string; cosa: string; controllo?: boolean }>
  tipi: Array<{ nome: string; spiega: string; video: string[] }>
  mix: string[]
  consigli: Array<{ titolo: string; testo: string }>
  novita: Array<{ nome: string; cosa: string; per_te: string; giudizio: "sì" | "più avanti" | "no"; fonte?: string }>
  come: string[]
}

export type CrescitaCanale = Crescita | { quando: null }

export interface PuntoAndamento {
  quando: string
  follower: number | null
  mi_piace: number | null
  video: number | null
}

export interface Commento {
  id: string
  autore: string
  testo?: string
  note?: string
  risposta_a: string | null
  del_creator: boolean
  mi_piace?: number
  tempo_fa?: string
  quando_scritto?: string
}

export interface CommentiDelVideo {
  quando: string
  video: string
  commenti: Commento[]
  nuovi: string[]
}

export interface Conversazione {
  con: string
  giorni?: string
  riassunto?: string
  messaggi?: Array<{ da: "lui" | "creator"; testo: string; quando_scritto?: string }>
}

export interface MessaggiDelCanale {
  quando: string
  conversazioni: Conversazione[]
}
