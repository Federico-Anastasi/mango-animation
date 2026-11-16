// Chi parla con `codex app-server` (JSON-RPC su stdio, una riga per messaggio): un programma solo per tutte le conversazioni.
import type { Oggetto } from "../traduzione"

/** Codex ha risposto a una richiesta con un errore, o il programma è caduto prima di rispondere (`codice` è `null`). */
export class ErroreDiCodex extends Error {
  constructor(
    messaggio: string,
    readonly codice: number | null,
  ) {
    super(messaggio)
  }
}

/** Il Codex installato è più vecchio della versione con cui il protocollo è stato provato: ogni richiesta fallisce così. */
export class CodexTroppoVecchio extends ErroreDiCodex {
  constructor(
    readonly versione: string,
    readonly minima: string,
  ) {
    super(`Codex ${versione} è più vecchio della ${minima}`, null)
  }
}

export interface ClienteCodex {
  /** Una richiesta a Codex e il suo `result`. Accende il programma se è spento; fallisce con `ErroreDiCodex`. */
  chiedi: <T = Oggetto>(metodo: string, parametri?: unknown) => Promise<T>
  /** Ogni notifica di Codex, di ogni thread; torna come smettere di ascoltare. */
  ascolta: (alla: (metodo: string, parametri: Oggetto) => void) => () => void
  /**
   * Chi risponde alle richieste che Codex fa a noi (un permesso, una domanda): ciò che torna è il `result`. `ritirata` scatta se
   * Codex chiude la richiesta da sé prima della risposta. Senza nessuno che risponde, la richiesta riceve un errore.
   */
  rispondi: (gestore: (metodo: string, parametri: Oggetto, ritirata: AbortSignal) => Promise<unknown>) => void
  /** Avvisa quando il programma cade: i thread accesi non ci sono più finché non si riprendono. Torna come smettere. */
  allaCaduta: (alla: (errore: Error) => void) => () => void
  /** La cartella in cui Codex tiene le sue cose (`codexHome` nella risposta a `initialize`); `null` se non l'ha detta. Accende il programma se è spento. */
  codexHome: () => Promise<string | null>
  /** Il processo del programma acceso; `null` se è spento. */
  pid: () => number | null
  /** Spegne il programma; una richiesta dopo lo riaccende. */
  chiudi: () => Promise<void>
}
