// Le rotte della chat (`docs/CHAT.md`): l'interfaccia parla solo col server.
import { chiedi, ErroreApi, leggiRisposta } from "../api"
import type { AllegatoInviato, ComandoChat, ContestoChat, DettaglioConversazione, ImpostazioniChat, ModelloChat, SceltaRisposta, VoceConversazione } from "./tipi"
import { t } from "../lingua"

const nonCaricato = (): string => t("Il file non è stato caricato: riprova.", "The file was not uploaded: try again.")

const idUrl = (id: string) => encodeURIComponent(id)

export interface NuovoMessaggio {
  /** Può mancare solo se ci sono allegati. */
  testo?: string
  allegati?: AllegatoInviato[]
  contesto?: ContestoChat
  /** Il primo giro (o rifarlo): la conversazione comincia da Claude, senza un messaggio del creator. Va da solo, senza testo né allegati. */
  avvio?: "primo-giro" | "rifare-primo-giro"
}

export const apiChat = {
  elenco: () => chiedi<VoceConversazione[]>("GET", "/api/chat"),
  nuova: (messaggio: NuovoMessaggio, scelta: Partial<ImpostazioniChat> = {}) => chiedi<{ id: string }>("POST", "/api/chat", { ...messaggio, ...scelta }),
  modelli: () => chiedi<ModelloChat[]>("GET", "/api/chat/modelli"),
  comandi: () => chiedi<ComandoChat[]>("GET", "/api/chat/comandi"),
  impostazioni: (id: string, scelta: Partial<ImpostazioniChat>) => chiedi<ImpostazioniChat>("POST", `/api/chat/${idUrl(id)}/impostazioni`, scelta),
  conversazione: (id: string) => chiedi<DettaglioConversazione>("GET", `/api/chat/${idUrl(id)}`),
  manda: (id: string, messaggio: NuovoMessaggio) => chiedi<unknown>("POST", `/api/chat/${idUrl(id)}/messaggi`, messaggio),
  ferma: (id: string) => chiedi<unknown>("POST", `/api/chat/${idUrl(id)}/ferma`),
  chiudi: (id: string) => chiedi<unknown>("POST", `/api/chat/${idUrl(id)}/chiudi`),
  inBackground: (id: string) => chiedi<unknown>("POST", `/api/chat/${idUrl(id)}/background`),
  fermaTask: (id: string, task: string) => chiedi<unknown>("POST", `/api/chat/${idUrl(id)}/task/${idUrl(task)}/ferma`),
  rispondi: (id: string, richiesta: string, risposta: SceltaRisposta) => chiedi<unknown>("POST", `/api/chat/${idUrl(id)}/risposte/${idUrl(richiesta)}`, risposta),
}

/** Manda un file al server e torna il percorso dove l'ha salvato, da mettere negli `allegati` del messaggio. */
export async function caricaAllegato(file: File): Promise<string> {
  const risposta = await fetch("/api/chat/allegati", {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream", "X-Nome": encodeURIComponent(file.name || "allegato") },
    body: file,
  }).catch(() => null)
  if (!risposta) throw new ErroreApi(t("Mango Animation non risponde. Controlla che sia acceso sul computer e riprova.", "Mango Animation is not responding. Check that it is running on your computer and try again."), 0)
  const testo = await risposta.text()
  const dati = leggiRisposta(testo, risposta.status)
  if (!risposta.ok) throw new ErroreApi(typeof dati === "object" && dati !== null && "errore" in dati ? String(dati.errore) : nonCaricato(), risposta.status)
  const percorso = typeof dati === "object" && dati !== null && "percorso" in dati ? dati.percorso : null
  if (typeof percorso !== "string") throw new ErroreApi(nonCaricato(), risposta.status)
  return percorso
}

/** Chiede al server di copiare un file del computer fra gli allegati: torna il percorso dove l'ha messo, come `caricaAllegato`. */
export async function caricaAllegatoLocale(percorso: string): Promise<string> {
  return (await chiedi<{ percorso: string }>("POST", "/api/chat/allegati/locale", { percorso })).percorso
}
