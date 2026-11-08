// Le rotte di `docs/API.md` che usa lo studio (le altre le usa Claude, dai suoi strumenti). L'interfaccia non legge mai il disco: passa da qui.
import type {
  ClassificaCanale,
  ConsumiDiClaude,
  CrescitaCanale,
  CommentiDelVideo,
  MessaggiDelCanale,
  PuntoAndamento,
  StatoCanale,
  DettaglioVideo,
  AnimazioneDisponibile,
  GiornoGrezzo,
  ParolaGrezzo,
  Piano,
  Scheda,
  SchedaGrezzo,
  Stile,
  ModoRegistrazione,
  StatoArrivi,
  StatoStudioRemoto,
  StatoLavori,
  StatoProfilo,
  StatoRegistrazione,
  Uscita,
  VoceElenco,
} from "./tipi"
import { lingua, t } from "./lingua"

export class ErroreApi extends Error {
  readonly codice: number
  constructor(messaggio: string, codice: number) {
    super(messaggio)
    this.codice = codice
  }
}

/** La frase del server e, se un rifiuto ha più motivi, ognuno su una riga. */
function fraseDelServer(dati: unknown, stato: number): string {
  if (typeof dati !== "object" || dati === null || !("errore" in dati)) return t("Il server ha risposto con un errore ({stato}).", "The server answered with an error ({stato}).", { stato })
  const problemi = "problemi" in dati && Array.isArray(dati.problemi) ? dati.problemi.map(String) : []
  return [String(dati.errore), ...problemi].join("\n")
}

const serverSpento = () => t("Mango Animation non risponde. Controlla che sia acceso sul computer e riprova.", "Mango Animation is not answering. Check that it is running on your computer and try again.")

export async function chiedi<T>(metodo: string, percorso: string, corpo?: unknown): Promise<T> {
  const risposta = await fetch(percorso, {
    method: metodo,
    headers: { "X-Lingua": lingua(), ...(corpo === undefined ? {} : { "Content-Type": "application/json" }) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }).catch(() => null)
  if (!risposta) throw new ErroreApi(serverSpento(), 0)
  const testo = await risposta.text()
  const dati: unknown = testo ? JSON.parse(testo) : null
  if (!risposta.ok) {
    throw new ErroreApi(fraseDelServer(dati, risposta.status), risposta.status)
  }
  return dati as T
}

const slugUrl = (slug: string) => encodeURIComponent(slug)
const fileUrl = (file: string) => `?file=${encodeURIComponent(file)}`

export const api = {
  elencoVideo: () => chiedi<VoceElenco[]>("GET", "/api/video"),
  video: (slug: string) => chiedi<DettaglioVideo>("GET", `/api/video/${slugUrl(slug)}`),
  scriviScheda: (slug: string, scheda: Scheda) => chiedi<unknown>("PUT", `/api/video/${slugUrl(slug)}/scheda`, scheda),
  scriviPiano: (slug: string, piano: Piano) => chiedi<unknown>("PUT", `/api/video/${slugUrl(slug)}/piano`, piano),
  annulla: (slug: string) => chiedi<unknown>("POST", `/api/video/${slugUrl(slug)}/annulla`),
  rifai: (slug: string) => chiedi<unknown>("POST", `/api/video/${slugUrl(slug)}/rifai`),
  togliVideo: (slug: string) => chiedi<unknown>("DELETE", `/api/video/${slugUrl(slug)}`),

  grezzo: () => chiedi<GiornoGrezzo[]>("GET", "/api/grezzo"),
  paroleGrezzo: (file: string) => chiedi<ParolaGrezzo[]>("GET", `/api/grezzo/parole${fileUrl(file)}`),
  scriviSchedaGrezzo: (file: string, scheda: SchedaGrezzo) => chiedi<unknown>("PUT", `/api/grezzo/scheda${fileUrl(file)}`, scheda),

  stile: () => chiedi<Stile>("GET", "/api/stile"),
  scriviStile: (stile: Stile) => chiedi<unknown>("PUT", "/api/stile", stile),
  animazioni: () => chiedi<Record<string, AnimazioneDisponibile[]>>("GET", "/api/animazioni"),
  lavori: () => chiedi<StatoLavori>("GET", "/api/lavori"),
  fermaLavoro: (id: string | number) => chiedi<unknown>("DELETE", `/api/lavori/${encodeURIComponent(String(id))}`),
  arrivi: () => chiedi<StatoArrivi>("GET", "/api/arrivi"),
  controllaArrivi: () => chiedi<StatoArrivi>("POST", "/api/arrivi/controlla"),
  accessoStudio: () => chiedi<StatoStudioRemoto>("GET", "/api/accesso-studio"),
  accendiStudioDalTelefono: (acceso: boolean) => chiedi<StatoStudioRemoto>("PUT", "/api/accesso-studio", { acceso }),
  rifaiChiaveDelloStudio: () => chiedi<StatoStudioRemoto>("POST", "/api/accesso-studio/chiave"),
  registrazione: () => chiedi<StatoRegistrazione>("GET", "/api/registrazione"),
  avviaRegistrazione: (modo: ModoRegistrazione, scelta: { microfono?: string; camera?: string } = {}) => chiedi<StatoRegistrazione>("POST", "/api/registrazione", { modo, ...scelta }),
  fermaRegistrazione: () => chiedi<StatoRegistrazione>("DELETE", "/api/registrazione"),
  cercaDispositivi: () => chiedi<StatoRegistrazione>("POST", "/api/registrazione/dispositivi"),
  canale: (canale: string) => chiedi<StatoCanale>("GET", `/api/canale/${encodeURIComponent(canale)}`),
  andamentoCanale: (canale: string) => chiedi<PuntoAndamento[]>("GET", `/api/canale/${encodeURIComponent(canale)}/andamento`),
  classificaCanale: (canale: string) => chiedi<ClassificaCanale>("GET", `/api/canale/${encodeURIComponent(canale)}/classifica`),
  crescitaCanale: (canale: string) => chiedi<CrescitaCanale>("GET", `/api/canale/${encodeURIComponent(canale)}/crescita`),
  commentiCanale: (canale: string, video: string) => chiedi<CommentiDelVideo>("GET", `/api/canale/${encodeURIComponent(canale)}/commenti?video=${encodeURIComponent(video)}`),
  messaggiCanale: (canale: string) => chiedi<MessaggiDelCanale>("GET", `/api/canale/${encodeURIComponent(canale)}/messaggi`),
  profilo: () => chiedi<StatoProfilo>("GET", "/api/profilo"),
  consumi: () => chiedi<ConsumiDiClaude>("GET", "/api/consumi"),
  apri: (percorso: string) => chiedi<unknown>("POST", "/api/apri", { percorso }),
}

/** Un file dell'archivio, servito a pezzi (`Range`): il percorso è relativo all'archivio. */
export const urlMedia = (percorso: string): string => `/media/${percorso.split("/").map(encodeURIComponent).join("/")}`

/** Un file con la sua versione nell'indirizzo: un file rifatto si ricarica invece di restare quello in memoria. */
export const urlVersionato = (percorso: string, versione: string): string => `${urlMedia(percorso)}?v=${encodeURIComponent(versione)}`

export const urlUscita = (u: Uscita): string => urlVersionato(u.file, u.cambiato)

/** Il livello della voce di un file preparato: un byte ogni centesimo di secondo. */
export async function leggiOnda(percorso: string): Promise<Uint8Array | null> {
  const risposta = await fetch(urlMedia(percorso)).catch(() => null)
  if (!risposta?.ok) return null
  return new Uint8Array(await risposta.arrayBuffer())
}
