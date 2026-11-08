/** Un arrivo rifiutato: lo `stato` è quello HTTP, il messaggio arriva in italiano a chi manda. */
export class ErroreArrivo extends Error {
  constructor(
    readonly stato: number,
    messaggio: string,
  ) {
    super(messaggio)
  }
}

const GB = 1024 ** 3

/** «3,2 GB» / «850 MB», per i messaggi. */
export function grandezza(byte: number): string {
  if (byte >= GB) return `${(byte / GB).toFixed(1).replace(".", ",")} GB`
  return `${Math.max(1, Math.round(byte / 1024 ** 2))} MB`
}

const CODICI_DEL_COLLEGAMENTO = new Set(["ECONNRESET", "ECONNABORTED", "EPIPE"])
const CODICI_DEI_PERMESSI = new Set(["EPERM", "EBUSY", "EACCES"])

export interface MotivoDelRifiuto {
  stato: number
  /** La frase che arriva al telefono. */
  frase: string
  /** Il dettaglio tecnico, per il registro; `null` per un rifiuto voluto. */
  dettaglio: string | null
  /** Il telefono se n'è andato: non c'è niente di rotto sul computer, e nessuno a cui rispondere. */
  interrotto: boolean
}

/** Perché un file non è stato salvato, in una frase che dice cosa è successo davvero. */
export function motivoDelRifiuto(errore: unknown): MotivoDelRifiuto {
  if (errore instanceof ErroreArrivo) return { stato: errore.stato, frase: errore.message, dettaglio: null, interrotto: false }
  const messaggio = errore instanceof Error ? errore.message : String(errore)
  const code = (errore as NodeJS.ErrnoException | null)?.code
  const dettaglio = typeof code === "string" && !messaggio.includes(code) ? `${code}: ${messaggio}` : messaggio
  if ((errore as Error | null)?.name === "AbortError" || (typeof code === "string" && CODICI_DEL_COLLEGAMENTO.has(code))) {
    return { stato: 400, frase: "Il collegamento con il telefono si è interrotto prima della fine del file, che non è stato salvato. Riprova, con il telefono vicino al router.", dettaglio, interrotto: true }
  }
  if (typeof code === "string" && CODICI_DEI_PERMESSI.has(code)) {
    return { stato: 500, frase: "Windows non ha lasciato salvare il file: un altro programma (di solito l'antivirus) tiene aperta la cartella degli arrivi. Riprova fra qualche secondo.", dettaglio, interrotto: false }
  }
  return { stato: 500, frase: `Il computer non è riuscito a salvare il file (${typeof code === "string" ? code : messaggio}). Il dettaglio è in archivio/arrivi/registro.jsonl.`, dettaglio, interrotto: false }
}
