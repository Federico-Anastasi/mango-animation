// Il telefono e il computer: un ascoltatore HTTP a sé, sulla rete di casa, separato da quello
// dell'interfaccia (che resta su 127.0.0.1). In ascolto solo se serve: con un telefono collegato o con lo studio dalla rete acceso. Cinque rotte, tutte con la chiave: `POST /arrivi/contenuti-video`
// (il file), `GET /installa/contenuti-video` (la guida della Scorciatoia), `GET /carica` (la pagina per mandare i
// video dal telefono), `GET /guarda` (i video montati) e `GET /guarda/<slug>.mp4` (uno di loro, a pezzi).
// Tutto il resto è lo studio: se l'accesso dalla rete è acceso e la richiesta ha una sessione, si gira al server interno (`studio.ts`).
// Il file in arrivo si scrive a pezzi su un temporaneo e si rinomina a fine corsa: mai intero in memoria.
import { randomUUID } from "node:crypto"
import { mkdir, readdir, rm, statfs } from "node:fs/promises"
import type { NetworkInterfaceInfo } from "node:os"
import { join } from "node:path"
import type { Percorsi } from "../configurazione"
import { aggiungiRiga, jsonDaTesto, leggiTesto, rinomina, scrivi, statistica, testoJson } from "../disco"
import type { Eventi } from "../eventi"
import { frase, type Frase } from "../lingua"
import { percorsoSicuro, serviFile } from "../media"
import { leggiFile } from "../sonda"
import { giornoLocale, isoLocale } from "../tempo"
import { AccessoStudio } from "./accessoStudio"
import { chiaveArrivi, chiaveGiusta } from "./chiave"
import { ErroreArrivo, grandezza, motivoDelRifiuto } from "./errore"
import type { ControlloFirewall, GiudizioFirewall } from "./firewall"
import { paginaCarica } from "./carica"
import { paginaGuarda, type VideoDaGuardare } from "./guarda"
import { delimitatoreDi, leggiMultipart, type Scrittore } from "./multipart"
import { nomeDestinazione, nomePulito, tipoDi, type TipoArrivo } from "./nomi"
import { paginaInstallazione } from "./pagina"
import { indirizziLocali, indirizziTailscale, indirizzoNumerico } from "./rete"
import { qrSvg } from "./qr"
import { Ricezione } from "./ricezione"
import { entraConLaChiave, giraAlloStudio } from "./studio"

const MARGINE_DISCO = 512 * 1024 ** 2
const CONTROLLO_DISCO_OGNI = 256 * 1024 ** 2
const PARZIALI_VECCHI_MS = 24 * 3600_000
const ARRIVI_RICORDATI = 10
const ACCETTATI: TipoArrivo[] = ["video", "audio", "immagine"]
const NOME_TIPO: Record<TipoArrivo, string> = { video: "video", immagine: "foto", audio: "registrazioni audio", documento: "documenti" }
const ELENCO_ACCETTATI = ACCETTATI.map((t) => NOME_TIPO[t]).join(", ")

export interface Arrivo {
  file: string
  quando: string
  byte: number
}

export interface ContestoGestore {
  percorsi: Percorsi
  chiave: string
  limiteByte: number
  /** Porta su cui si ascolta davvero, per l'indirizzo che la guida non riesce a ricavare dalla richiesta. */
  porta: () => number
  /** Byte liberi sul disco che contiene `cartella`; sostituibile per provare un disco pieno. */
  spazioLibero?: (cartella: string) => number | Promise<number>
  adesso?: () => Date
  /** Il file è arrivato per intero e la risposta al telefono sta per partire: da qui in poi si occupa chi lo colloca. */
  arrivato: (atteso: Atteso, da: string | undefined) => void
  /** Chi ha aperto la guida: serve a sapere se un telefono è mai arrivato fin qui. */
  guidaAperta: (da: string | undefined) => void
  /** La ricezione dal telefono è accesa: spenta, le rotte del telefono non esistono (la porta può restare aperta per lo studio dalla rete). */
  ricezioneAccesa: () => boolean
  /** I video montati, da guardare sul telefono. */
  video: () => VideoDaGuardare[]
  /** Lo studio sulla rete: chi può entrare, su quale porta interna girare le richieste (`null` finché il server dello studio non è in ascolto) e la chiave delle API che le richieste girate portano. */
  studio: { accesso: AccessoStudio; porta: () => number | null; chiaveApi: string }
}

export interface InfoRichiesta {
  da?: string
  /** Toglie il limite di silenzio alla connessione di questa richiesta: serve a uno stream che resta aperto. */
  senzaScadenza?: () => void
}

async function spazioDelDisco(cartella: string): Promise<number> {
  const s = await statfs(cartella)
  return Number(s.bavail) * Number(s.bsize)
}

const risposta = (stato: number, corpo: Record<string, unknown>): Response => Response.json(corpo, { status: stato, headers: { "Cache-Control": "no-store" } })

function chiaveDellaRichiesta(req: Request, url: URL): string | null {
  const autorizzazione = req.headers.get("authorization")
  if (autorizzazione?.startsWith("Bearer ")) return autorizzazione.slice(7).trim()
  return req.headers.get("x-chiave") ?? url.searchParams.get("chiave")
}

function nomeDichiarato(req: Request, url: URL): string | null {
  const intestazione = req.headers.get("x-nome-file") ?? url.searchParams.get("nome")
  if (intestazione) {
    try {
      return decodeURIComponent(intestazione)
    } catch {
      return intestazione
    }
  }
  const disposizione = req.headers.get("content-disposition")
  return disposizione ? (/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposizione)?.[1] ?? null) : null
}

export async function nomeLibero(cartella: string, nome: string): Promise<string> {
  const punto = nome.lastIndexOf(".")
  const base = punto > 0 ? nome.slice(0, punto) : nome
  const estensione = punto > 0 ? nome.slice(punto) : ""
  for (let n = 1; ; n++) {
    const candidato = n === 1 ? nome : `${base}-${n}${estensione}`
    if (!(await Bun.file(join(cartella, candidato)).exists())) return candidato
  }
}

/** Un file arrivato per intero, che aspetta in `.in-corso/` di essere misurato e messo nel giorno di arrivo. */
export interface Atteso {
  /** Il nome del file in `.in-corso/`: `<nome>.<8 caratteri>.attesa`. */
  attesa: string
  /** `AAAAMMGG-HHMMSS-<nome ripulito>`: il nome che avrà in `grezzo/`. */
  nome: string
  quando: Date
  byte: number
}

const SUFFISSO_ATTESA = /\.[0-9a-f]{8}\.attesa$/

export interface ContestoColloca {
  percorsi: Percorsi
  ffprobe: string | null
  registra: (riga: Record<string, unknown>) => Promise<void>
  collocato: (arrivo: Arrivo) => Promise<void>
}

/** Misura il file, scrive la scheda e poi lo sposta nel giorno in cui è arrivato. */
export async function collocaArrivo(c: ContestoColloca, atteso: Atteso): Promise<void> {
  const percorso = join(c.percorsi.arrivi, ".in-corso", atteso.attesa)
  const lettura = c.ffprobe ? await leggiFile(c.ffprobe, percorso, atteso.nome) : null
  const giorno = giornoLocale(atteso.quando)
  const cartella = join(c.percorsi.archivio, "grezzo", giorno)
  await mkdir(cartella, { recursive: true })
  const nome = await nomeLibero(cartella, atteso.nome)
  // La scheda prima del file: chi guarda la cartella non vede mai un file del telefono senza la sua scheda.
  await scrivi(join(cartella, `${nome}.scheda.json`), testoJson({ tipo: "ripresa", origine: "telefono", arrivato: isoLocale(atteso.quando), note: "", ...lettura?.misure }))
  await rinomina(percorso, join(cartella, nome))
  const arrivo = { file: `${giorno}/${nome}`, quando: atteso.quando.toISOString(), byte: atteso.byte }
  await c.registra({ esito: "collocato", ...arrivo })
  await c.collocato(arrivo)
}

async function toglieParzialiVecchi(cartella: string, adesso: number): Promise<void> {
  const voci = await readdir(cartella)
  await Promise.all(
    voci.map(async (voce) => {
      const stato = await statistica(join(cartella, voce))
      if (stato && adesso - stato.mtimeMs > PARZIALI_VECCHI_MS) await rm(join(cartella, voce), { force: true })
    }),
  )
}

/** La funzione che risponde a ogni richiesta arrivata dalla rete. Separata dal server per provarla. */
export function creaGestore(contesto: ContestoGestore): (req: Request, info?: InfoRichiesta) => Promise<Response> {
  const spazioLibero = contesto.spazioLibero ?? spazioDelDisco
  const adesso = contesto.adesso ?? (() => new Date())
  const registro = join(contesto.percorsi.arrivi, "registro.jsonl")
  const registra = (riga: Record<string, unknown>): Promise<void> => aggiungiRiga(registro, JSON.stringify({ at: new Date().toISOString(), ...riga }))

  return async (req, info = {}) => {
    const url = new URL(req.url)
    const arrivo = /^\/arrivi\/contenuti-video\/?$/.test(url.pathname)
    const guida = /^\/installa\/contenuti-video\/?$/.test(url.pathname)
    const elenco = /^\/guarda\/?$/.test(url.pathname)
    const video = /^\/guarda\/([a-z0-9-]+)\.mp4$/.exec(url.pathname)?.[1]
    const prova = /^\/guarda\/prova\/([a-z0-9-]+)\.mp4$/.exec(url.pathname)?.[1]
    const copione = /^\/guarda\/copione\/([a-z0-9-]+)\.html$/.exec(url.pathname)?.[1]
    const carica = /^\/carica\/?$/.test(url.pathname)
    const delTelefono = arrivo || guida || elenco || video || prova || copione || carica
    if (!delTelefono) {
      const studio = contesto.studio
      if (!studio.accesso.acceso) return risposta(404, { errore: "Qui non c'è niente." })
      // Lo studio si apre solo all'indirizzo numerico del computer: un nome è quello di un altro sito che punta qui (DNS rebinding).
      if (!indirizzoNumerico(url.hostname)) return risposta(403, { errore: "Lo studio si apre solo all'indirizzo del computer, quello del link nel riquadro «Lo studio dal telefono»." })
      if (!/^\/studio\/?$/.test(url.pathname)) return giraAlloStudio(studio.accesso, studio.porta(), studio.chiaveApi, req, url, info.senzaScadenza ?? (() => {}))
      const esito = await entraConLaChiave(studio.accesso, req, url)
      await registra({ esito: esito.riuscito ? "studio-entrato" : "studio-rifiutato", da: info.da })
      return esito.risposta
    }
    if (!contesto.ricezioneAccesa()) return risposta(404, { errore: "Qui non c'è niente." })
    const metodoGiusto = arrivo ? req.method === "POST" : video || prova || copione ? req.method === "GET" || req.method === "HEAD" : req.method === "GET"
    if (!metodoGiusto) return risposta(405, { errore: "Metodo non ammesso qui." })

    if (!chiaveGiusta(contesto.chiave, chiaveDellaRichiesta(req, url))) {
      await registra({ esito: "rifiutato", motivo: "chiave sbagliata", da: info.da })
      return risposta(401, { errore: "La chiave non è giusta: riapri il codice QR in Mango Animation e rifai la Scorciatoia." })
    }

    if (elenco) return new Response(paginaGuarda(contesto.video(), contesto.chiave), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } })
    if (carica) return new Response(paginaCarica(contesto.chiave), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } })
    if (video || prova || copione) {
      const genere = video ? "montato" : prova ? "prova" : "copione"
      const scelto = contesto.video().find((v) => v.slug === (video ?? prova ?? copione) && v.genere === genere)
      const percorso = scelto ? percorsoSicuro(contesto.percorsi.archivio, scelto.file) : null
      const mancante = { montato: "Questo video non è ancora montato.", prova: "Questo video non ha una prova.", copione: "Questo video non ha una pagina da registrare." }
      return percorso ? serviFile(req, percorso, "no-cache") : risposta(404, { errore: mancante[genere] })
    }

    if (guida) {
      await registra({ esito: "pagina", da: info.da })
      contesto.guidaAperta(info.da)
      const host = req.headers.get("host") ?? ""
      const indirizzo = /^[\w.[\]:-]+$/.test(host) ? host : `localhost:${contesto.porta()}`
      const indirizzoRicezione = `http://${indirizzo}/arrivi/contenuti-video?chiave=${encodeURIComponent(contesto.chiave)}`
      return new Response(paginaInstallazione({ indirizzoRicezione, limiteGb: Math.round(contesto.limiteByte / 1024 ** 3) }), {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
      })
    }

    const quando = adesso()
    const parziali = join(contesto.percorsi.arrivi, ".in-corso")
    const parziale = join(parziali, `${randomUUID()}.parziale`)
    const inizio = Date.now()
    let scritti = 0
    const ricevuto: { nome: string | null } = { nome: null }
    try {
      const dichiarati = Number(req.headers.get("content-length"))
      const lunghezza = Number.isFinite(dichiarati) && dichiarati > 0 ? dichiarati : null
      if (lunghezza !== null && lunghezza > contesto.limiteByte) {
        throw new ErroreArrivo(413, `Il file pesa ${grandezza(lunghezza)}, più del massimo di ${grandezza(contesto.limiteByte)}.`)
      }
      await mkdir(parziali, { recursive: true })
      await toglieParzialiVecchi(parziali, quando.getTime())
      const libero = await spazioLibero(parziali)
      if (libero < (lunghezza ?? 0) + MARGINE_DISCO) {
        throw new ErroreArrivo(507, `Sul computer non c'è abbastanza spazio libero: ce ne sono ${grandezza(libero)}, per questo file ne servono ${grandezza((lunghezza ?? 0) + MARGINE_DISCO)}. Libera spazio e riprova.`)
      }
      if (!req.body) throw new ErroreArrivo(400, "Non è arrivato nessun file.")

      const contentType = req.headers.get("content-type") ?? ""
      const file = Bun.file(parziale).writer({ highWaterMark: 4 * 1024 ** 2 })
      let ultimoControllo = 0
      const spazioFinito = new ErroreArrivo(507, "Lo spazio sul computer è finito mentre il file arrivava. Libera spazio e riprova.")
      const scrittore: Scrittore = {
        async scrivi(pezzo) {
          scritti += pezzo.byteLength
          if (scritti > contesto.limiteByte) throw new ErroreArrivo(413, `Il file supera il massimo di ${grandezza(contesto.limiteByte)}.`)
          if (scritti - ultimoControllo >= CONTROLLO_DISCO_OGNI) {
            ultimoControllo = scritti
            if ((await spazioLibero(parziali)) < MARGINE_DISCO / 2) throw spazioFinito
          }
          try {
            file.write(pezzo)
            await file.flush()
          } catch (errore) {
            if ((errore as NodeJS.ErrnoException).code === "ENOSPC") throw spazioFinito
            throw errore
          }
        },
      }
      const controllaTipo = (nome: string, mime: string | null): string => {
        const pulito = nomePulito(nome, mime)
        const tipo = tipoDi(pulito, mime)
        if (!tipo) throw new ErroreArrivo(415, `Non riconosco che file sia («${pulito}»). Questa pagina accetta: ${ELENCO_ACCETTATI}.`)
        if (!ACCETTATI.includes(tipo)) throw new ErroreArrivo(415, `Questa pagina accetta solo ${ELENCO_ACCETTATI}, non ${NOME_TIPO[tipo]}.`)
        return pulito
      }

      try {
        if (contentType.toLowerCase().startsWith("multipart/form-data")) {
          const delimitatore = delimitatoreDi(contentType)
          if (!delimitatore) throw new ErroreArrivo(400, "Il modulo mandato non si legge.")
          const esito = await leggiMultipart(req.body, delimitatore, async (parte) => {
            ricevuto.nome = controllaTipo(parte.nome, parte.tipo)
            return scrittore
          })
          if (ricevuto.nome === null) throw new ErroreArrivo(400, "Nel modulo non c'è nessun file: il campo deve essere di tipo «File».")
          if (!esito.file || !esito.chiuso) throw new ErroreArrivo(400, "Il file è arrivato a metà: riprova.")
        } else {
          ricevuto.nome = controllaTipo(nomeDichiarato(req, url) ?? "", contentType)
          const lettore = req.body.getReader()
          for (;;) {
            const { done, value } = await lettore.read()
            if (done) break
            await scrittore.scrivi(value)
          }
          if (lunghezza !== null && scritti !== lunghezza) throw new ErroreArrivo(400, "Il file è arrivato a metà: riprova.")
        }
      } finally {
        try {
          await file.end()
        } catch (errore) {
          if ((errore as NodeJS.ErrnoException).code === "ENOSPC") throw spazioFinito
          throw errore
        }
      }
      const nomeOriginale = ricevuto.nome
      if (scritti === 0 || nomeOriginale === null) throw new ErroreArrivo(400, "Il file è vuoto.")

      const nome = nomeDestinazione(quando, nomeOriginale)
      const attesa = `${nome}.${randomUUID().slice(0, 8)}.attesa`
      await rinomina(parziale, join(parziali, attesa))
      const secondi = Math.round((Date.now() - inizio) / 100) / 10
      await registra({ esito: "ricevuto", file: nome, nome_originale: nomeOriginale, byte: scritti, secondi, da: info.da })
      contesto.arrivato({ attesa, nome, quando, byte: scritti }, info.da)
      return risposta(201, { ok: true, messaggio: `Ricevuto: ${nomeOriginale} (${grandezza(scritti)}).`, file: nome, byte: scritti })
    } catch (errore) {
      await rm(parziale, { force: true })
      const { stato, frase, dettaglio, interrotto } = motivoDelRifiuto(errore)
      if (dettaglio !== null && !interrotto) console.error(`arrivi: ${dettaglio}${errore instanceof Error && errore.stack ? `
${errore.stack}` : ""}`)
      await registra({ esito: "rifiutato", motivo: frase, ...(dettaglio === null ? {} : { dettaglio }), nome_originale: ricevuto.nome, byte: scritti, da: info.da })
      return risposta(stato, { ok: false, errore: frase })
    }
  }
}

// --- Il server ---------------------------------------------------------------------------------

export interface OpzioniRicevitore {
  percorsi: Percorsi
  porta: number
  indirizzo: string | null
  limiteByte: number
  ffprobe: string | null
  spazioLibero?: (cartella: string) => number | Promise<number>
  adesso?: () => Date
  eventi: Eventi
  firewall: ControlloFirewall
  /** Dopo che un file è al suo posto: l'indice lo deve vedere subito. */
  dopoArrivo: (relativi: string[]) => Promise<void>
  /** I video montati, da guardare sul telefono. */
  video: () => VideoDaGuardare[]
  /** Le interfacce di rete del computer, da cui si ricava l'indirizzo di Tailscale; sostituibile per le prove. */
  interfacce?: () => NodeJS.Dict<NetworkInterfaceInfo[]>
  /** La chiave delle API del server interno: le richieste dello studio dalla rete la portano da sole, dopo aver controllato la sessione. */
  chiaveApi: string
}

interface LinkStudio {
  indirizzo: string
  /** Il link che mette il cookie e apre lo studio, con la chiave dello studio. */
  link: string
  qr: string
}

export interface StatoStudioRemoto {
  acceso: boolean
  in_ascolto: boolean
  /** Dal Wi-Fi di casa; `null` se spento o senza rete. */
  casa: LinkStudio | null
  /** Da fuori casa, per l'indirizzo che Tailscale dà al computer; `null` se spento o se Tailscale non c'è. */
  fuori: (LinkStudio & { pronto: boolean; motivo: Frase | null }) | null
  /** Come `pronto` e `motivo` degli arrivi, per il Wi-Fi di casa. */
  pronto: boolean
  motivo: Frase | null
}

export interface StatoArrivi {
  /** La ricezione dal telefono è accesa: di base no, finché chi usa il computer non collega un telefono. */
  acceso: boolean
  in_ascolto: boolean
  indirizzo: string | null
  qr: string | null
  errore: Frase | null
  ultimi: Arrivo[]
  /** Cosa dice Windows: «consentito», «bloccato», «in-attesa» (non ha ancora chiesto il permesso), «sconosciuto» o «non-controllato» (il controllo non è ancora finito). */
  firewall: string
  /** Un telefono può arrivare fin qui. */
  pronto: boolean
  /** Perché non è pronto, o un avvertimento se lo è; con la strada da fare. */
  motivo: Frase | null
  /** La pagina coi video montati da guardare sul telefono, con la chiave, e il suo codice QR. */
  guarda: string | null
  qr_guarda: string | null
  /** La pagina per mandare i video dal telefono, con la chiave, e il suo codice QR. */
  carica: string | null
  qr_carica: string | null
}

const eLocale = (da: string | undefined): boolean => !da || /^(::1|127\.|::ffff:127\.)/.test(da)

export class Ricevitore {
  private ultimi: Arrivo[] = []
  private memoQr: { testo: string; svg: string } | null = null
  private memoQrGuarda: { testo: string; svg: string } | null = null
  private memoQrCarica: { testo: string; svg: string } | null = null
  private memoQrStudio = new Map<string, string>()
  private server: ReturnType<typeof Bun.serve> | null = null
  private portaStudio: number | null = null
  private errore: Frase | null = null
  private telefonoVisto = false
  private fila: Promise<void> = Promise.resolve()
  private gestore: ReturnType<typeof creaGestore> | null = null
  /** Gli accendi e spegni uno dopo l'altro: l'ultimo detto è quello che vale. */
  private cambi: Promise<void> = Promise.resolve()

  private constructor(
    private readonly opzioni: OpzioniRicevitore,
    private readonly chiave: string,
    readonly accesso: AccessoStudio,
    private readonly ricezione: Ricezione,
  ) {}

  static async avvia(opzioni: OpzioniRicevitore): Promise<Ricevitore> {
    const ricevitore = new Ricevitore(opzioni, await chiaveArrivi(opzioni.percorsi.arrivi), await AccessoStudio.carica(opzioni.percorsi.arrivi), await Ricezione.carica(opzioni.percorsi.arrivi))
    const registro = join(opzioni.percorsi.arrivi, "registro.jsonl")
    const righe = await leggiRegistro(registro)
    ricevitore.ultimi = righe
      .filter((r) => r.esito === "collocato" && typeof r.file === "string" && typeof r.quando === "string" && typeof r.byte === "number")
      .slice(-ARRIVI_RICORDATI)
      .reverse()
      .map((r) => ({ file: String(r.file), quando: String(r.quando), byte: Number(r.byte) }))
    ricevitore.telefonoVisto = righe.some((r) => (r.esito === "pagina" || r.esito === "ricevuto") && !eLocale(typeof r.da === "string" ? r.da : undefined))

    const contesto: ContestoColloca = {
      percorsi: opzioni.percorsi,
      ffprobe: opzioni.ffprobe,
      registra: (riga) => aggiungiRiga(registro, JSON.stringify({ at: new Date().toISOString(), ...riga })),
      collocato: async (arrivo) => {
        ricevitore.ultimi = [arrivo, ...ricevitore.ultimi].slice(0, ARRIVI_RICORDATI)
        await opzioni.dopoArrivo([`grezzo/${arrivo.file}.scheda.json`, `grezzo/${arrivo.file}`])
        opzioni.eventi.emetti({ tipo: "arrivi" })
      },
    }
    const metti = (atteso: Atteso): void => {
      ricevitore.fila = ricevitore.fila.then(() => collocaArrivo(contesto, atteso)).catch((errore) => console.error(`arrivi: «${atteso.nome}» resta in .in-corso e si riprova al prossimo avvio (${errore instanceof Error ? errore.message : String(errore)}).`))
    }
    for (const attesa of (await readdir(join(opzioni.percorsi.arrivi, ".in-corso")).catch(() => [])).filter((n) => SUFFISSO_ATTESA.test(n))) {
      const nome = attesa.replace(SUFFISSO_ATTESA, "")
      const [, anno, mese, giorno, ore, minuti, secondi] = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-/.exec(nome) ?? []
      const stato = await statistica(join(opzioni.percorsi.arrivi, ".in-corso", attesa))
      if (stato) metti({ attesa, nome, quando: anno ? new Date(+anno, +mese! - 1, +giorno!, +ore!, +minuti!, +secondi!) : new Date(stato.mtimeMs), byte: stato.size })
    }

    const gestore = creaGestore({
      percorsi: opzioni.percorsi,
      chiave: ricevitore.chiave,
      limiteByte: opzioni.limiteByte,
      porta: () => ricevitore.server?.port ?? opzioni.porta,
      spazioLibero: opzioni.spazioLibero,
      adesso: opzioni.adesso,
      arrivato: (atteso, da) => {
        ricevitore.telefonoVisto ||= !eLocale(da)
        metti(atteso)
      },
      guidaAperta: (da) => {
        ricevitore.telefonoVisto ||= !eLocale(da)
      },
      ricezioneAccesa: () => ricevitore.ricezione.acceso,
      video: opzioni.video,
      studio: { accesso: ricevitore.accesso, porta: () => ricevitore.portaStudio, chiaveApi: opzioni.chiaveApi },
    })
    ricevitore.gestore = gestore
    ricevitore.aggiornaAscolto()
    return ricevitore
  }

  /** La porta è in ascolto solo se serve: ai telefoni collegati o allo studio dalla rete. Altrimenti il computer non ascolta la rete per niente. */
  private aggiornaAscolto(): void {
    const serve = this.ricezione.acceso || this.accesso.acceso
    if (serve && this.server === null && this.gestore !== null) this.accendi(this.gestore)
    else if (!serve && this.server !== null) {
      this.server.stop(true)
      this.server = null
      this.errore = null
    }
  }

  private accendi(gestore: NonNullable<Ricevitore["gestore"]>): void {
    const { porta, limiteByte } = this.opzioni
    this.errore = null
    try {
      this.server = Bun.serve({
        hostname: "0.0.0.0",
        port: porta,
        maxRequestBodySize: limiteByte + 1024 ** 2,
        idleTimeout: 120,
        fetch: (req, s) => gestore(req, { da: s.requestIP(req)?.address, senzaScadenza: () => s.timeout(req, 0) }),
      })
    } catch (errore) {
      const occupata = (errore as NodeJS.ErrnoException).code === "EADDRINUSE" || /in use|EADDRINUSE/i.test(String(errore))
      const dettaglio = errore instanceof Error ? errore.message : String(errore)
      this.errore = occupata
        ? frase(
            `Un altro programma sta già usando il canale ${porta} del computer: chiudilo e riavvia Mango Animation.`,
            `Another program is already using channel ${porta} of the computer: close it and restart Mango Animation.`,
          )
        : frase(`La ricezione non riesce a partire: ${dettaglio}`, `Receiving cannot start: ${dettaglio}`)
      console.error(`arrivi: ${this.errore}`)
      return
    }
    // Windows chiede il permesso al firewall la prima volta che il programma ascolta la rete: si guarda dopo.
    void this.opzioni.firewall.controlla().then(() => this.opzioni.eventi.emetti({ tipo: "arrivi" }))
  }

  /** Collega o scollega i telefoni: la scelta resta dopo un riavvio. */
  impostaArrivi(acceso: boolean): Promise<void> {
    return this.cambia(() => this.ricezione.imposta(acceso))
  }

  /** Accende o spegne lo studio dalla rete, che ha bisogno della stessa porta. */
  impostaStudio(acceso: boolean): Promise<void> {
    return this.cambia(() => this.accesso.imposta(acceso))
  }

  private cambia(scelta: () => Promise<void>): Promise<void> {
    const fatto = this.cambi.then(async () => {
      await scelta()
      this.aggiornaAscolto()
    })
    this.cambi = fatto.catch(() => undefined)
    return fatto
  }

  get porta(): number | null {
    return this.server?.port ?? null
  }

  /** Aspetta che i file arrivati per intero siano al loro posto. */
  attendi(): Promise<void> {
    return this.fila
  }

  /** La porta del server interno dello studio, a cui si girano le richieste con una sessione. */
  collegaStudio(porta: number): void {
    this.portaStudio = porta
  }

  private conPorta(ip: string | undefined): string | null {
    return this.server && ip ? `${ip}:${this.server.port}` : null
  }

  statoStudio(): StatoStudioRemoto {
    const giudizio = this.opzioni.firewall.giudizio
    const indirizzoDiCasa = this.conPorta(this.opzioni.indirizzo ?? indirizziLocali()[0])
    const indirizzoFuori = this.conPorta(indirizziTailscale(this.opzioni.interfacce?.())[0])
    const { pronto, motivo } = this.giudica(giudizio, indirizzoDiCasa)
    const acceso = this.accesso.acceso
    const link = (indirizzo: string | null): LinkStudio | null => {
      if (!acceso || !indirizzo) return null
      const testo = `http://${indirizzo}/studio?chiave=${encodeURIComponent(this.accesso.chiave)}`
      if (!this.memoQrStudio.has(testo)) {
        if (this.memoQrStudio.size >= 4) this.memoQrStudio.clear()
        this.memoQrStudio.set(testo, qrSvg(testo))
      }
      return { indirizzo, link: testo, qr: this.memoQrStudio.get(testo)! }
    }
    const fuori = link(indirizzoFuori)
    const fuoriPronto = !(giudizio?.tailscale && giudizio.tailscale !== "consentito")
    return {
      acceso,
      in_ascolto: this.server !== null,
      casa: link(indirizzoDiCasa),
      fuori: fuori && {
        ...fuori,
        pronto: fuoriPronto,
        motivo: fuoriPronto
          ? null
          : frase(
              "Windows non lascia entrare dalla rete di Tailscale. Apri «Sicurezza di Windows», poi «Firewall e protezione della rete», «Consenti app attraverso il firewall», e spunta il programma anche per il tipo di rete di Tailscale (di solito «Pubblica»: così il programma si vede anche dalle reti pubbliche a cui colleghi il computer, ma senza la chiave dello studio non si entra). Poi premi «Controlla di nuovo».",
              "Windows does not let anything in from the Tailscale network. Open «Windows Security», then «Firewall & network protection», «Allow an app through firewall», and tick the program for the Tailscale network type too (usually «Public»: this also makes the program visible on the public networks you connect the computer to, but nobody gets into the studio without its key). Then press «Check again».",
            ),
      },
      pronto,
      motivo,
    }
  }

  stato(): StatoArrivi {
    const acceso = this.ricezione.acceso
    const indirizzo = acceso ? this.conPorta(this.opzioni.indirizzo ?? indirizziLocali()[0]) : null
    const guida = indirizzo ? `http://${indirizzo}/installa/contenuti-video?chiave=${encodeURIComponent(this.chiave)}` : null
    if (guida && this.memoQr?.testo !== guida) this.memoQr = { testo: guida, svg: qrSvg(guida) }
    const guarda = indirizzo ? `http://${indirizzo}/guarda?chiave=${encodeURIComponent(this.chiave)}` : null
    if (guarda && this.memoQrGuarda?.testo !== guarda) this.memoQrGuarda = { testo: guarda, svg: qrSvg(guarda) }
    const carica = indirizzo ? `http://${indirizzo}/carica?chiave=${encodeURIComponent(this.chiave)}` : null
    if (carica && this.memoQrCarica?.testo !== carica) this.memoQrCarica = { testo: carica, svg: qrSvg(carica) }

    const giudizio = this.opzioni.firewall.giudizio
    const { pronto, motivo } = acceso ? this.giudica(giudizio, indirizzo) : {
          pronto: false,
          motivo: frase(
            "La ricezione dal telefono è spenta: collega un telefono dallo studio (Girato) per riceverne i file.",
            "Receiving from the phone is off: connect a phone from the studio (Footage) to receive its files.",
          ),
        }
    return {
      acceso,
      in_ascolto: acceso && this.server !== null,
      indirizzo,
      qr: guida ? (this.memoQr?.svg ?? null) : null,
      errore: this.errore,
      ultimi: this.ultimi,
      firewall: giudizio?.stato ?? "non-controllato",
      pronto,
      motivo,
      guarda,
      qr_guarda: guarda ? (this.memoQrGuarda?.svg ?? null) : null,
      carica,
      qr_carica: carica ? (this.memoQrCarica?.svg ?? null) : null,
    }
  }

  private giudica(giudizio: GiudizioFirewall | null, indirizzo: string | null): { pronto: boolean; motivo: Frase | null } {
    if (!this.server) return { pronto: false, motivo: this.errore }
    if (!indirizzo) return { pronto: false, motivo: frase("Il computer non è collegato a una rete: collegalo al Wi-Fi di casa e riapri questa pagina.", "The computer is not connected to a network: connect it to your home Wi-Fi and reopen this page.") }
    if (giudizio?.stato === "bloccato") {
      return {
        pronto: false,
        motivo: frase(
          "Windows blocca i file in arrivo verso Mango Animation. Apri «Sicurezza di Windows», poi «Firewall e protezione della rete», «Consenti app attraverso il firewall», e spunta il programma sulle reti private. Poi premi «Controlla di nuovo».",
          "Windows blocks incoming files to Mango Animation. Open «Windows Security», then «Firewall & network protection», «Allow an app through firewall», and tick the program for private networks. Then press «Check again».",
        ),
      }
    }
    if (giudizio && giudizio.stato !== "consentito" && giudizio.soloPubbliche) {
      return {
        pronto: false,
        motivo: frase(
          "Il Wi-Fi è impostato come rete pubblica e Windows non lascia entrare i file dal telefono. In Impostazioni › Rete e Internet › Wi-Fi scegli «Rete privata», poi premi «Controlla di nuovo».",
          "The Wi-Fi is set as a public network and Windows does not let files in from the phone. In Settings › Network & internet › Wi-Fi choose «Private network», then press «Check again».",
        ),
      }
    }
    if (giudizio?.stato === "in-attesa" && !this.telefonoVisto) {
      return {
        pronto: true,
        motivo: frase(
          "Se l'iPhone non riesce a collegarsi, guarda se Windows ha aperto una finestra del firewall: tocca «Consenti».",
          "If the iPhone cannot connect, see whether Windows opened a firewall window: tap «Allow».",
        ),
      }
    }
    return { pronto: true, motivo: null }
  }

  chiudi(): void {
    this.server?.stop(true)
    this.server = null
  }
}

async function leggiRegistro(registro: string): Promise<Record<string, unknown>[]> {
  return ((await leggiTesto(registro)) ?? "")
    .split("\n")
    .filter((r) => r.length > 0)
    .flatMap((riga) => {
      const letto = jsonDaTesto(riga)?.valore
      return typeof letto === "object" && letto !== null ? [letto as Record<string, unknown>] : []
    })
}
