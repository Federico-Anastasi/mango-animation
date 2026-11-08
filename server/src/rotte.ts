// Le rotte di `docs/API.md`. Le letture rispondono dall'indice in memoria; le scritture validano,
// scrivono in modo atomico e fanno annunciare il cambio all'elaboratore.
import { join } from "node:path"
import { entra, haLaChiave, senzaChiave } from "./accesso"
import type { Animazioni } from "./animazioni"
import type { ControlloFirewall } from "./arrivi/firewall"
import type { Ricevitore } from "./arrivi/ricevitore"
import { INTESTAZIONE_DALLA_RETE } from "./arrivi/studio"
import type { Chat } from "./chat/chat"
import { rotteDellaChat } from "./chat/rotte"
import type { Coda } from "./coda"
import type { Consumi } from "./consumi/consumi"
import type { Opzioni, Percorsi } from "./configurazione"
import { elencaFile, jsonDaTesto, leggiTesto, rimuovi, scrivi, statistica, testoJson } from "./disco"
import type { Elaboratore } from "./elaboratore"
import type { Eventi } from "./eventi"
import { trattiDelRisolto, type Indice } from "./indice"
import { ErroreConFrase, Frase, frase, haLingua, linguaDi, nellaLingua, nellaLinguaDi, type Lingua, type Testo } from "./lingua"
import { decodifica, nonSiServe, percorsoSicuro, serviFile, serviStudio } from "./media"
import { ErroreRegistrazione, MODI, type Modo, type Registrazione, type Scelta } from "./registrazione"
import { applicaRitocchi, ErroreRitocco } from "./ritocchi"
import { COMANDO_SCARICA, ErroreScarico, leggiRichiesta, misureScarico, scarica, type RichiestaScarico } from "./scarica"
import { montatoDi, pianoDopoIlMontato } from "./montato"
import { ErroreMotori, macchinaDelProfilo, motoriDelProfilo, salvaMotori } from "./motori"
import type { Schemi } from "./schemi"
import { differenza } from "./stile"
import { giornoLocale } from "./tempo"

export interface Contesto {
  opzioni: Opzioni
  percorsi: Percorsi
  indice: Indice
  elaboratore: Elaboratore
  coda: Coda
  eventi: Eventi
  animazioni: Animazioni
  ricevitore: Ricevitore
  firewall: ControlloFirewall
  registrazione: Registrazione
  chat: Chat
  consumi: Consumi
  /** Gli schemi di `motore/schemi/`, per ciò che il server scrive nel profilo. */
  schemi: Schemi
  /** La chiave delle API (`accesso.ts`): senza, ogni richiesta è 401. */
  chiaveApi: string
}

const NON_AMMESSO = frase("Metodo non ammesso qui.", "This method is not allowed here.")

class ErroreApi extends ErroreConFrase {
  constructor(
    readonly stato: number,
    testo: Testo,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(testo)
  }
}

interface Chiamata {
  req: Request
  url: URL
  param: string[]
}

type Gestore = (chiamata: Chiamata) => Promise<Response> | Response
type Rotta = [metodo: string, modello: RegExp, gestore: Gestore]

export const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
export const COMANDI_DEL_VIDEO = ["prepara", "risolvi", "monta", "anteprima", "controlla", "copertina", "carosello", "prova"] as const
/** I campi della richiesta oltre a `comando`, e il comando a cui servono. */
const CAMPI_DEL_COMANDO: Record<string, string> = { scena: "anteprima", da: "anteprima", a: "anteprima", disegno: "copertina", istante: "copertina" }
const NOMI_LOCALI = new Set(["127.0.0.1", "localhost", "[::1]"])

const risposta = (corpo: unknown, stato = 200): Response => Response.json(corpo, { status: stato, headers: { "Cache-Control": "no-store" } })

async function corpoJson(req: Request): Promise<unknown> {
  if (!(req.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    throw new ErroreApi(400, frase("Manda il corpo come JSON, con l'intestazione Content-Type: application/json.", "Send the body as JSON, with the header Content-Type: application/json."))
  }
  try {
    return await req.json()
  } catch {
    throw new ErroreApi(400, frase("Il corpo non è un JSON valido.", "The body is not valid JSON."))
  }
}

const èOggetto = (valore: unknown): valore is Record<string, unknown> => typeof valore === "object" && valore !== null && !Array.isArray(valore)

const LA_RICHIESTA = frase("La richiesta", "The request")
const LA_MODIFICA_DELLA_SCHEDA = frase("La modifica della scheda", "The card change")
const LO_STILE = frase("Lo stile", "The style")

function comeOggetto(valore: unknown, cosa: Frase): Record<string, unknown> {
  if (!èOggetto(valore)) throw new ErroreApi(400, frase(`${cosa.it} deve essere un oggetto JSON.`, `${cosa.en} must be a JSON object.`))
  return valore
}

const unisci = (problemi: Testo[], lingua: Lingua): string => problemi.map((p) => nellaLinguaDi(p, lingua)).join(" · ")

/** I primi cinque problemi e quanti altri ce ne sono, nella lingua data. */
const elencoBreve = (problemi: Testo[], lingua: Lingua): string => {
  const altri = problemi.length - 5
  return [unisci(problemi.slice(0, 5), lingua), ...(altri > 0 ? [lingua === "it" ? `e altri ${altri}` : `and ${altri} more`] : [])].join(" · ")
}

/** Una frase che porta in fondo l'elenco dei problemi, uno per lingua. */
const conElenco = (problemi: Testo[], it: (elenco: string) => string, en: (elenco: string) => string): Frase => frase(it(unisci(problemi, "it")), en(unisci(problemi, "en")))

const schedaNonValida = (problemi: Testo[]): Frase => conElenco(problemi, (e) => `La scheda non è valida: ${e}`, (e) => `The card is not valid: ${e}`)
const schedaNonSarebbeValida = (problemi: Testo[]): Frase => conElenco(problemi, (e) => `La scheda non sarebbe valida: ${e}`, (e) => `The card would not be valid: ${e}`)
const fileNonNelGrezzo = (file: string): Frase => frase(`Il file «${file}» non c'è in archivio/grezzo/: guarda la pagina Girato.`, `The file «${file}» is not in archivio/grezzo/: see the Footage page.`)
/** JSON Merge Patch (RFC 7386): gli oggetti si fondono campo per campo, `null` toglie, il resto (testi, liste) si sostituisce. */
function fondi(base: unknown, modifica: unknown): unknown {
  if (!èOggetto(modifica)) return modifica
  const risultato: Record<string, unknown> = èOggetto(base) ? { ...base } : {}
  for (const [campo, valore] of Object.entries(modifica)) {
    if (valore === null) delete risultato[campo]
    else risultato[campo] = fondi(risultato[campo], valore)
  }
  return risultato
}

const èSecondo = (valore: unknown): valore is number => typeof valore === "number" && Number.isFinite(valore) && valore >= 0
/** Un testo che comincia per «-» il motore lo prenderebbe per un'opzione. */
const èTestoDaPassare = (valore: unknown): valore is string => typeof valore === "string" && valore.length > 0 && !valore.startsWith("-")

/** Gli argomenti che il motore vuole dopo lo slug, dalla richiesta di un lavoro. */
function argomentiDelLavoro(comando: string, corpo: Record<string, unknown>): string[] {
  for (const campo of Object.keys(corpo)) {
    const diChi = CAMPI_DEL_COMANDO[campo]
    if (campo !== "comando" && diChi !== comando) {
      throw new ErroreApi(
        400,
        diChi
          ? frase(`«${campo}» non serve al comando «${comando}»: vale solo per ${diChi}.`, `«${campo}» is not needed by the command «${comando}»: it only applies to ${diChi}.`)
          : frase(`«${campo}» non è un campo di questa richiesta.`, `«${campo}» is not a field of this request.`),
      )
    }
  }
  const { scena, da, a, disegno, istante } = corpo
  if (comando === "anteprima") {
    if (scena !== undefined) {
      if (da !== undefined || a !== undefined) throw new ErroreApi(400, frase("Per l'anteprima dai o la scena o i secondi «da» e «a», non tutti e due.", "For the preview give either the scene or the seconds «da» and «a», not both."))
      if (!èTestoDaPassare(scena)) throw new ErroreApi(400, frase("La scena dev'essere il nome di una scena del piano: un testo che non cominci con «-».", "The scene must be the name of a scene in the plan: text that does not start with «-»."))
      return ["--scena", scena]
    }
    if (da === undefined || a === undefined) throw new ErroreApi(400, frase("Per l'anteprima dai la scena oppure i secondi «da» e «a».", "For the preview give the scene or the seconds «da» and «a»."))
    if (!èSecondo(da) || !èSecondo(a)) throw new ErroreApi(400, frase("«da» e «a» sono secondi del video: numeri da 0 in su.", "«da» and «a» are seconds of the video: numbers from 0 up."))
    if (a <= da) throw new ErroreApi(400, frase("«a» deve venire dopo «da».", "«a» must come after «da»."))
    return ["--da", String(da), "--a", String(a)]
  }
  if (comando === "copertina") {
    if (!èTestoDaPassare(disegno)) throw new ErroreApi(400, frase("Per la copertina dai il «disegno»: il percorso di un'immagine, che non cominci con «-».", "For the cover give the «disegno»: the path of an image, not starting with «-»."))
    if (istante === undefined) return [disegno]
    if (!èSecondo(istante)) throw new ErroreApi(400, frase("«istante» è un secondo del video: un numero da 0 in su.", "«istante» is a second of the video: a number from 0 up."))
    return [disegno, "--istante", String(istante)]
  }
  return []
}

async function leggiJson(percorso: string): Promise<unknown> {
  const testo = await leggiTesto(percorso)
  return testo === null ? null : (jsonDaTesto(testo)?.valore ?? null)
}

/** `giorno/nome`, come lo scrivono i piani: due parti, niente `..`. */
function fileDelGirato(valore: unknown, dove: string): string {
  const file = typeof valore === "string" ? valore.replaceAll("\\", "/") : ""
  const parti = file.split("/")
  if (parti.length !== 2 || parti.some((p) => p === "" || p === "." || p === ".." || p.includes(":"))) {
    throw new ErroreApi(400, frase(`${dove}: il file va scritto «giorno/nome», per esempio «2026-10-06/IMG_5106.MOV».`, `${dove}: the file must be written «giorno/nome» (day/name), for example «2026-10-06/IMG_5106.MOV».`))
  }
  return file
}

function slugDi(parametro: string | undefined): string {
  const slug = decodifica(parametro ?? "")
  if (!slug || !SLUG.test(slug)) throw new ErroreApi(404, frase("Non c'è un video con questo nome: guarda l'elenco dei video.", "There is no video with this name: look at the list of videos."))
  return slug
}

const slugDa = (titolo: string): string =>
  titolo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "")

const nomeDellaSorgente = (file: string): string => {
  const nome = (file.split("/").pop() ?? "").replace(/\.[^.]+$/, "").replace(/^\d{8}-\d{6}-/, "")
  return slugDa(nome) || "sorgente"
}

export function creaGestore(c: Contesto): (req: Request, senzaScadenza: () => void) => Promise<Response> {
  const { percorsi, indice, elaboratore, coda } = c

  /** Il video esiste come cartella (anche senza una scheda valida). */
  const cartellaDi = (slug: string) => {
    const voce = indice.video.get(slug)
    if (!voce) throw new ErroreApi(404, frase(`Non c'è un video «${slug}»: guarda l'elenco dei video.`, `There is no video «${slug}»: look at the list of videos.`))
    return voce
  }

  const quadriUsati = (): Map<string, string[]> => {
    const usati = new Map<string, string[]>()
    indice.video.forEach((voce) => {
      const quadri = new Set([voce.pianoConBase?.quadro, ...(voce.pianoConBase?.scene ?? []).map((s) => s.quadro)].filter((q): q is string => q !== undefined))
      quadri.forEach((q) => usati.set(q, [...(usati.get(q) ?? []), voce.slug]))
    })
    return usati
  }

  const sePianoNonValido = (problemi: Testo[]): void => {
    if (problemi.length === 0) return
    throw new ErroreApi(400, frase(`Il piano non è valido: ${elencoBreve(problemi, "it")}`, `The plan is not valid: ${elencoBreve(problemi, "en")}`), { problemi })
  }

  // --- Video ----------------------------------------------------------------------------------

  /** Il piano (o quello della sua base) o lo stile sono stati salvati dopo l'inizio del montaggio in corso di questo video. */
  const montaggioSuperato = (slug: string): boolean => {
    const iniziato = coda.montaggioIniziato(slug)
    return iniziato !== null && Math.max(indice.ultimoPiano(slug), indice.stile.mtime) > iniziato
  }

  const dettaglio: Gestore = async ({ param }) => {
    const slug = slugDi(param[0])
    const voce = indice.visibile(slug)
    if (!voce) {
      const perche = indice.video.get(slug)?.schedaProblemi ?? []
      throw new ErroreApi(
        404,
        frase(`Non c'è un video «${slug}» con una scheda valida: la sua scheda va sistemata.`, `There is no video «${slug}» with a valid card: its card needs fixing.`),
        { problemi: perche },
      )
    }
    const [risolto, controllo, materiali, montaggio] = await Promise.all([
      leggiJson(percorsi.risolto(slug)),
      leggiJson(percorsi.controllo(slug)),
      elencaFile(percorsi.materiali(slug)),
      leggiJson(join(percorsi.video(slug), "lavoro", "montaggio.json")),
    ])
    const montato = montatoDi(voce.uscite)
    const risoltoAggiornato = voce.risoltoMtime !== null && voce.risoltoMtime >= Math.max(indice.ultimoPiano(slug), indice.stile.mtime)
    return risposta({
      slug,
      cartella: percorsi.video(slug),
      scheda: voce.scheda,
      piano: voce.piano,
      problemi: { scheda: voce.schedaProblemi, piano: voce.pianoProblemi },
      piano_risolto_da_base: voce.pianoConBase,
      risolto,
      risolto_aggiornato: risoltoAggiornato,
      controllo,
      uscite: voce.uscite,
      montato: montato && { file: montato.file, quando: montato.cambiato },
      materiali: materiali.map((m) => ({ file: `video/${slug}/materiali/${m.relativo}`, byte: m.byte })),
      puo_annullare: indice.puoAnnullare(voce),
      puo_rifare: indice.puoRifare(voce),
      lavoro: coda.lavoroDi(slug),
      montaggio_superato: montaggioSuperato(slug),
      piano_cambiato: indice.ultimoPiano(slug) > 0 ? new Date(indice.ultimoPiano(slug)).toISOString() : null,
      piano_dopo_montato: pianoDopoIlMontato({ conMontato: indice.haIlMontato(voce), montaggio, risolto, risoltoAggiornato, pianoPiuNuovoDelFinale: indice.pianoPiuNuovoDelFinale(voce) }),
      fotogrammi: indice.fotogrammiDeiTratti(voce, trattiDelRisolto(risolto)),
    })
  }

  const creaVideo: Gestore = async ({ req }) => {
    const corpo = comeOggetto(await corpoJson(req), LA_RICHIESTA)
    const titolo = typeof corpo["titolo"] === "string" ? corpo["titolo"].trim() : ""
    if (!titolo) throw new ErroreApi(400, frase("Manca il titolo: scrivi come si chiama il video.", "The title is missing: write what the video is called."))
    if (corpo["slug"] !== undefined && (typeof corpo["slug"] !== "string" || !SLUG.test(corpo["slug"]))) {
      throw new ErroreApi(
        400,
        frase(
          "Il nome della cartella può avere solo lettere minuscole, numeri e trattini (per esempio «orto-in-numeri»).",
          "The folder name can only have lowercase letters, numbers and hyphens (for example «orto-in-numeri»).",
        ),
      )
    }
    const elencoGrezzo = corpo["grezzo"] ?? []
    if (!Array.isArray(elencoGrezzo)) throw new ErroreApi(400, frase("«grezzo» deve essere un elenco di file, ciascuno scritto «giorno/nome».", "«grezzo» must be a list of files, each written «giorno/nome»."))
    const grezzo = [...new Set(elencoGrezzo.map((f, i) => fileDelGirato(f, `grezzo[${i}]`)))]
    for (const file of grezzo) {
      if (!(await statistica(percorsi.grezzo(file)))?.isFile()) {
        throw new ErroreApi(400, frase(`Il file «${file}» non c'è in archivio/grezzo/: scegline uno dalla pagina Girato.`, `The file «${file}» is not in archivio/grezzo/: pick one from the Footage page.`))
      }
    }
    if (corpo["formato"] === "carosello" && grezzo.length > 0) {
      throw new ErroreApi(400, frase("Un carosello non ha girato: crealo senza file, le slide si scrivono a mano.", "A carousel has no footage: create it without files, the slides are written by hand."))
    }
    const scheda = { titolo, stato: corpo["stato"] ?? "proposta", creato: giornoLocale(new Date()), ...(corpo["formato"] === undefined ? {} : { formato: corpo["formato"] }) }
    const problemiScheda = await elaboratore.problemiDi("scheda", scheda)
    if (problemiScheda.length > 0) {
      throw new ErroreApi(400, conElenco(problemiScheda, (e) => `Il video non si può creare: ${e}`, (e) => `The video cannot be created: ${e}`))
    }

    return elaboratore.conBlocco("\0nuovo", async () => {
      const voluto = typeof corpo["slug"] === "string" ? corpo["slug"] : null
      const base = voluto ?? (slugDa(titolo) || "video")
      const esiste = async (s: string): Promise<boolean> => indice.video.has(s) || (await statistica(percorsi.video(s))) !== null
      if (voluto && (await esiste(voluto))) throw new ErroreApi(409, frase(`C'è già un video «${voluto}»: scegli un altro nome per la cartella.`, `There is already a video «${voluto}»: choose another name for the folder.`))
      const slug = await (async () => {
        for (let n = 1; ; n++) {
          const candidato = n === 1 ? base : `${base}-${n}`
          if (!(await esiste(candidato))) return candidato
        }
      })()

      const nomi: string[] = []
      const sorgenti = Object.fromEntries(
        grezzo.map((file) => {
          const radice = nomeDellaSorgente(file)
          let nome = radice
          for (let n = 2; nomi.includes(nome); n++) nome = `${radice}-${n}`
          nomi.push(nome)
          return [nome, { file }]
        }),
      )
      const piano = grezzo.length > 0 ? { quadro: "girato-pieno", sorgenti, scene: [{ nome: "scena", pezzi: Object.keys(sorgenti).map((sorgente) => ({ sorgente })) }] } : null
      if (piano) sePianoNonValido(await elaboratore.problemiDelPiano(slug, piano))

      await scrivi(percorsi.scheda(slug), testoJson(scheda))
      if (piano) await scrivi(percorsi.piano(slug), testoJson(piano))
      await elaboratore.cambiati([`video/${slug}/scheda.json`, ...(piano ? [`video/${slug}/piano.json`] : [])])
      return risposta({ slug }, 201)
    })
  }

  const salvaScheda: Gestore = async ({ req, param }) => {
    const slug = slugDi(param[0])
    cartellaDi(slug)
    const scheda = await corpoJson(req)
    const problemi = await elaboratore.cambiaScheda(slug, () => scheda)
    if (problemi.length > 0) throw new ErroreApi(400, schedaNonValida(problemi), { problemi })
    return risposta({ ok: true })
  }

  const cambiaScheda: Gestore = async ({ req, param }) => {
    const slug = slugDi(param[0])
    cartellaDi(slug)
    const modifica = comeOggetto(await corpoJson(req), LA_MODIFICA_DELLA_SCHEDA)
    let nuova: unknown = null
    const problemi = await elaboratore.cambiaScheda(slug, (suDisco) => (nuova = fondi(suDisco, modifica)))
    if (problemi.length > 0) throw new ErroreApi(400, schedaNonSarebbeValida(problemi), { problemi })
    return risposta({ ok: true, scheda: nuova })
  }

  const ritoccaPiano: Gestore = async ({ req, param }) => {
    const slug = slugDi(param[0])
    const voce = cartellaDi(slug)
    if (voce.pianoTesto === null) {
      throw new ErroreApi(409, frase("Questo video non ha ancora un piano da ritoccare: scrivilo intero (PUT del piano).", "This video has no plan yet to adjust: write it whole (PUT of the plan)."))
    }
    let piano: unknown
    try {
      piano = applicaRitocchi(JSON.parse(voce.pianoTesto), await corpoJson(req))
    } catch (errore) {
      throw errore instanceof ErroreRitocco ? new ErroreApi(400, errore.testo) : errore
    }
    sePianoNonValido(await elaboratore.problemiDelPiano(slug, piano))
    await elaboratore.salvaPiano(slug, testoJson(piano))
    return risposta({ ok: true, piano, puo_annullare: indice.puoAnnullare(voce), puo_rifare: indice.puoRifare(voce) })
  }

  const salvaPiano: Gestore = async ({ req, param }) => {
    const slug = slugDi(param[0])
    const voce = cartellaDi(slug)
    const piano = await corpoJson(req)
    sePianoNonValido(await elaboratore.problemiDelPiano(slug, piano))
    await elaboratore.salvaPiano(slug, testoJson(piano))
    return risposta({ ok: true, puo_annullare: indice.puoAnnullare(voce), puo_rifare: indice.puoRifare(voce) })
  }

  const muoviPiano =
    (indietro: boolean): Gestore =>
    async ({ param }) => {
      const slug = slugDi(param[0])
      const voce = cartellaDi(slug)
      if (!(await elaboratore.muoviPiano(slug, indietro))) {
        throw new ErroreApi(
          409,
          indietro
            ? frase("Non c'è niente da annullare: questa è la prima versione del piano.", "There is nothing to undo: this is the first version of the plan.")
            : frase("Non c'è niente da rifare: questa è l'ultima versione del piano.", "There is nothing to redo: this is the last version of the plan."),
        )
      }
      return risposta({ ok: true, piano: voce.piano, puo_annullare: indice.puoAnnullare(voce), puo_rifare: indice.puoRifare(voce) })
    }

  const mettiInCoda: Gestore = async ({ req, param }) => {
    const slug = slugDi(param[0])
    const voce = cartellaDi(slug)
    const corpo = comeOggetto(await corpoJson(req), LA_RICHIESTA)
    const comando = corpo["comando"]
    if (typeof comando !== "string" || !(COMANDI_DEL_VIDEO as readonly string[]).includes(comando)) {
      throw new ErroreApi(400, frase(`Il comando deve essere uno fra: ${COMANDI_DEL_VIDEO.join(", ")}.`, `The command must be one of: ${COMANDI_DEL_VIDEO.join(", ")}.`))
    }
    const argomenti = argomentiDelLavoro(comando, corpo)
    // Un carosello non ha piano: le sue slide le rende il comando «carosello», che a un video non serve.
    const carosello = voce.scheda?.["formato"] === "carosello"
    if (comando === "carosello" && !carosello) {
      throw new ErroreApi(409, frase("Questo video non è un carosello: nella scheda manca «formato»: «carosello».", "This video is not a carousel: its card is missing «formato»: «carosello»."))
    }
    if (comando !== "carosello" && carosello) {
      throw new ErroreApi(
        409,
        frase(
          "Questo è un carosello: non ha piano né montato, le sue slide le rende il comando «carosello».",
          "This is a carousel: it has no plan or edited video, its slides are made by the command «carosello».",
        ),
      )
    }
    // La prova si fa sul copione, prima che ci siano girato e piano: il video resta una proposta.
    const prova = comando === "prova"
    if (!carosello && !prova) {
      if (voce.pianoTesto === null) {
        throw new ErroreApi(409, frase("Questo video non ha ancora un piano: scrivilo (o chiedilo nella chat) e riprova.", "This video has no plan yet: write it (or ask for it in the chat) and try again."))
      }
      // Un piano scritto a mano nel file scavalca i controlli delle rotte: qui si rifanno, sul piano com'è adesso, prima di lanciare il motore.
      const problemi = voce.pianoProblemi.length > 0 ? voce.pianoProblemi : await elaboratore.problemiDelPiano(slug, JSON.parse(voce.pianoTesto))
      if (problemi.length > 0) {
        throw new ErroreApi(
          409,
          frase(
            `Il piano scritto nel file non è valido, quindi non lancio «${comando}». Correggilo con piano_ritocca o piano_scrivi, che controllano prima di salvare. Cosa non va: ${elencoBreve(problemi, "it")}`,
            `The plan written in the file is not valid, so I am not launching «${comando}». Fix it with piano_ritocca or piano_scrivi, which check before saving. What is wrong: ${elencoBreve(problemi, "en")}`,
          ),
          { problemi },
        )
      }
    }
    // Chi chiede un lavoro su una proposta ci sta lavorando: non deve restare fra le proposte. Gli altri stati li cambia il creator.
    if (!prova) {
      const problemi = await elaboratore.cambiaScheda(slug, (scheda) => ((scheda as { stato?: unknown } | null)?.stato === "proposta" ? { ...(scheda as object), stato: "in lavorazione" } : null))
      if (problemi.length > 0) console.error(`scheda di «${slug}»: resta «proposta», perché ${problemi.join("; ")}`)
    }
    return risposta({ id: coda.accoda({ comando, argomenti: [slug, ...argomenti], slug, file: null }) }, 202)
  }

  const eliminaVideo: Gestore = async ({ param }) => {
    const slug = slugDi(param[0])
    const voce = cartellaDi(slug)
    if (voce.scheda?.stato !== "proposta" || voce.uscite.some((u) => u.file.endsWith("/uscite/finale.mp4"))) {
      throw new ErroreApi(
        409,
        frase(
          "Si cancella solo una proposta senza montato. Per gli altri video cambia lo stato in «scartato»: resta in archivio e non si propone più.",
          "Only a proposal without an edited video can be deleted. For the other videos change the status to «scartato»: it stays in the archive and is not proposed again.",
        ),
      )
    }
    const chiLoUsa = indice.dipendenti(slug)
    if (chiLoUsa.length > 0) {
      const elenco = chiLoUsa.map((s) => `«${s}»`).join(", ")
      throw new ErroreApi(409, frase(`Il video è la base di ${elenco}: togli prima la base da quei piani.`, `The video is the base of ${elenco}: first remove the base from those plans.`))
    }
    if (coda.lavoroDi(slug)) {
      throw new ErroreApi(409, frase("Su questo video c'è un lavoro in corso o in coda: fermalo dalla barra dei lavori e riprova.", "A job is running or queued on this video: stop it from the jobs bar and try again."))
    }
    await rimuovi(percorsi.video(slug))
    await elaboratore.cambiati([`video/${slug}`])
    return risposta({ ok: true })
  }

  // --- Girato ---------------------------------------------------------------------------------

  const fileDallaRichiesta = (url: URL): { file: string; giorno: string; nome: string } => {
    const file = fileDelGirato(url.searchParams.get("file"), "file")
    const [giorno = "", nome = ""] = file.split("/")
    if (!indice.grezzo.get(giorno)?.has(nome)) throw new ErroreApi(404, fileNonNelGrezzo(file))
    return { file, giorno, nome }
  }

  const paroleDelFile: Gestore = async ({ url }) => {
    const { file, giorno, nome } = fileDallaRichiesta(url)
    const parole = indice.preparatoDi(giorno, nome).parole
    if (!parole) {
      throw new ErroreApi(
        404,
        frase(`«${file}» non è ancora stato preparato: premi «Prepara» nella pagina Girato e aspetta che finisca.`, `«${file}» has not been prepared yet: press «Prepare» on the Footage page and wait for it to finish.`),
      )
    }
    return risposta(await leggiJson(join(percorsi.archivio, parole)))
  }

  const salvaSchedaDelFile: Gestore = async ({ req, url }) => {
    const { file } = fileDallaRichiesta(url)
    const scheda = await corpoJson(req)
    const problemi = await elaboratore.problemiDi("grezzo", scheda)
    if (problemi.length > 0) throw new ErroreApi(400, schedaNonValida(problemi), { problemi })
    await scrivi(percorsi.schedaGrezzo(file), testoJson(scheda))
    await elaboratore.cambiati([`grezzo/${file}.scheda.json`])
    return risposta({ ok: true })
  }

  const cambiaSchedaDelFile: Gestore = async ({ req, url }) => {
    const { file, giorno, nome } = fileDallaRichiesta(url)
    const modifica = comeOggetto(await corpoJson(req), LA_MODIFICA_DELLA_SCHEDA)
    const nuova = fondi(indice.grezzo.get(giorno)?.get(nome)?.scheda ?? {}, modifica)
    const problemi = await elaboratore.problemiDi("grezzo", nuova)
    if (problemi.length > 0) throw new ErroreApi(400, schedaNonSarebbeValida(problemi), { problemi })
    await scrivi(percorsi.schedaGrezzo(file), testoJson(nuova))
    await elaboratore.cambiati([`grezzo/${file}.scheda.json`])
    return risposta({ ok: true, scheda: nuova })
  }

  const preparaFile: Gestore = async ({ req }) => {
    const corpo = comeOggetto(await corpoJson(req), LA_RICHIESTA)
    const file = fileDelGirato(corpo["file"], "file")
    const [giorno = "", nome = ""] = file.split("/")
    if (!indice.grezzo.get(giorno)?.has(nome)) throw new ErroreApi(404, fileNonNelGrezzo(file))
    const { ritrascrivi = false } = corpo
    if (typeof ritrascrivi !== "boolean") throw new ErroreApi(400, frase("«ritrascrivi» è vero o falso.", "«ritrascrivi» is true or false."))
    const id = coda.accoda({ comando: "prepara-file", argomenti: [file, ...(ritrascrivi ? ["--ritrascrivi"] : [])], slug: null, file })
    return risposta({ id }, 202)
  }

  const scaricaGirato: Gestore = async ({ req }) => {
    const corpo = comeOggetto(await corpoJson(req), LA_RICHIESTA)
    let richiesta: RichiestaScarico
    try {
      richiesta = leggiRichiesta(corpo)
    } catch (errore) {
      throw errore instanceof ErroreScarico ? new ErroreApi(400, errore.testo) : errore
    }
    const { ytdlp } = c.opzioni
    if (ytdlp === null) {
      throw new ErroreApi(
        409,
        frase(
          "yt-dlp non è installato su questo computer: installalo (vedi docs/NUOVO-COMPUTER.md), riavvia il server e riprova.",
          "yt-dlp is not installed on this computer: install it (see docs/NUOVO-COMPUTER.md), restart the server and try again.",
        ),
      )
    }
    const misure = misureScarico(indice.stile.valore)
    if (misure === null) {
      throw new ErroreApi(
        409,
        frase(
          "Nello stile manca la sezione «scarico» (altezza_massima, codec_video, codec_audio): rimettila in stile.json e riprova.",
          "The style is missing the section «scarico» (altezza_massima, codec_video, codec_audio): put it back in stile.json and try again.",
        ),
      )
    }
    const contesto = {
      ytdlp,
      ffprobe: c.opzioni.ffprobe,
      misure,
      cartellaScarichi: join(percorsi.arrivi, ".scarichi"),
      cartellaGrezzo: join(percorsi.archivio, "grezzo"),
      adesso: c.opzioni.arrivi.adesso ?? (() => new Date()),
      cambiati: (relativi: string[]) => elaboratore.cambiati(relativi),
    }
    const id = coda.accoda({
      comando: COMANDO_SCARICA,
      argomenti: [richiesta.url, String(richiesta.da ?? ""), String(richiesta.a ?? ""), richiesta.nome ?? ""],
      slug: null,
      file: null,
      esegui: (io) => scarica(contesto, richiesta, io),
    })
    return risposta({ id }, 202)
  }

  // --- Stile, lavori, arrivi ------------------------------------------------------------------

  const leggiStile: Gestore = () => {
    if (indice.stile.valore === null) throw new ErroreApi(404, frase("Non trovo stile.json nella cartella del prodotto: va reinstallato.", "I cannot find stile.json in the product folder: it needs to be reinstalled."))
    return risposta(indice.stile.valore)
  }

  const salvaStile: Gestore = async ({ req }) => {
    const stile = await corpoJson(req)
    const problemi: Frase[] = []
    const radice = comeOggetto(stile, LO_STILE)
    const formato = radice["formato"] as Record<string, unknown> | undefined
    if (!formato || !["largo", "alto", "fps"].every((k) => typeof formato[k] === "number" && (formato[k] as number) > 0)) {
      problemi.push(frase("formato: servono «largo», «alto» e «fps», numeri maggiori di zero.", "formato: «largo», «alto» and «fps» are needed, numbers greater than zero."))
    }
    const quadri = radice["quadri"]
    if (typeof quadri !== "object" || quadri === null || Array.isArray(quadri) || Object.keys(quadri).length === 0) {
      problemi.push(frase("quadri: serve almeno un quadro.", "quadri: at least one frame is needed."))
    } else {
      Object.entries(quadri).forEach(([nome, quadro]) => {
        if (!Array.isArray((quadro as { strati?: unknown } | null)?.strati)) problemi.push(frase(`quadri.${nome}: manca la lista «strati».`, `quadri.${nome}: the list «strati» is missing.`))
      })
      quadriUsati().forEach((video, nome) => {
        if (nome in quadri) return
        const usatoDa = video.map((s) => `«${s}»`).join(", ")
        problemi.push(
          frase(
            `il quadro «${nome}» è usato da ${usatoDa} e non può sparire: cambia prima il quadro di quei piani.`,
            `the frame «${nome}» is used by ${usatoDa} and cannot go away: first change the frame of those plans.`,
          ),
        )
      })
    }
    if (problemi.length > 0) throw new ErroreApi(400, conElenco(problemi, (e) => `Lo stile non è valido: ${e}`, (e) => `The style is not valid: ${e}`), { problemi })
    await scrivi(c.opzioni.stileCreator, testoJson(differenza(indice.stile.serie, stile)))
    await elaboratore.stileCambiato()
    return risposta({ ok: true })
  }

  // --- I motori del profilo ---------------------------------------------------------------------

  const leggiMotori: Gestore = () => risposta(motoriDelProfilo(indice.profilo.valore))

  const leggiMacchina: Gestore = () => risposta(macchinaDelProfilo(indice.profilo.valore))

  const leggiProfilo: Gestore = () => risposta({ valido: indice.profiloProblemi.length === 0, problemi: indice.profiloProblemi })

  const scriviMotori: Gestore = async ({ req }) => {
    const motori = await corpoJson(req)
    if (indice.profiloProblemi.length > 0) {
      throw new ErroreApi(
        409,
        frase("profilo.json non passa lo schema: correggilo prima di cambiare i motori, o la scrittura lo sostituirebbe.", "profilo.json does not pass the schema: fix it before changing the engines, or the write would replace it."),
        { problemi: indice.profiloProblemi },
      )
    }
    try {
      await salvaMotori(motori, indice.profilo, c.schemi, c.opzioni.lavoro)
    } catch (errore) {
      if (errore instanceof ErroreMotori) throw new ErroreApi(errore.stato, errore.testo, { problemi: errore.problemi })
      throw errore
    }
    await elaboratore.profiloCambiato()
    return risposta(motoriDelProfilo(indice.profilo.valore))
  }

  const fermaLavoro: Gestore = async ({ param }) => {
    const esito = await coda.ferma(decodifica(param[0] ?? "") ?? "")
    if (!esito) throw new ErroreApi(404, frase("Questo lavoro non c'è più: è già finito o è stato tolto.", "This job is no longer there: it has already finished or been removed."))
    return risposta({ ok: true, esito })
  }

  /** Apre nel browser di sistema una pagina dello studio o un file dell'archivio, entrando con la chiave: la chiave non passa da chi chiede. */
  const apriNelBrowser = async (corpo: Record<string, unknown>, origine: string): Promise<Response> => {
    const { video, percorso, scheda } = corpo
    let dopo: string
    if (typeof video === "string" && percorso !== undefined) {
      throw new ErroreApi(400, frase("Dì una cosa sola: «video» per la pagina di un video, oppure «percorso» per un file.", "Say one thing only: «video» for a video's page, or «percorso» for a file."))
    }
    if (typeof video === "string") {
      if (!SLUG.test(video) || !indice.video.has(video)) {
        throw new ErroreApi(404, frase(`Il video «${video}» non c'è: lo slug lo dà video_elenco.`, `The video «${video}» does not exist: the slug comes from video_elenco.`))
      }
      if (scheda !== undefined && (typeof scheda !== "string" || !/^[a-z-]+$/.test(scheda))) {
        throw new ErroreApi(
          400,
          frase(
            "«scheda» è il nome di una scheda della pagina del video, per esempio «slide» o «montaggio».",
            "«scheda» is the name of a tab of the video's page, for example «slide» or «montaggio».",
          ),
        )
      }
      dopo = `/#/video/${video}${typeof scheda === "string" ? `/${scheda}` : ""}`
    } else if (typeof percorso === "string") {
      if (scheda !== undefined) throw new ErroreApi(400, frase("«scheda» va con «video», non con «percorso».", "«scheda» goes with «video», not with «percorso»."))
      const relativo = percorso.replaceAll("\\", "/")
      const assoluto = percorsoSicuro(percorsi.archivio, relativo)
      if (assoluto === null || relativo === "") {
        throw new ErroreApi(
          400,
          frase(
            "Il percorso deve stare dentro l'archivio e non avere «..»: scrivilo relativo all'archivio, per esempio «video/orto-in-numeri/uscite/finale.mp4».",
            "The path must be inside the archive and have no «..»: write it relative to the archive, for example «video/orto-in-numeri/uscite/finale.mp4».",
          ),
        )
      }
      if (nonSiServe(relativo) || !(await statistica(assoluto))?.isFile()) {
        throw new ErroreApi(404, frase("Questo file non c'è nell'archivio (o non si mostra): si apre un file, non una cartella.", "This file is not in the archive (or is not shown): a file is opened, not a folder."))
      }
      dopo = `/media/${relativo.split("/").filter((p) => p !== "").map(encodeURIComponent).join("/")}`
    } else {
      throw new ErroreApi(
        400,
        frase(
          "Dì cosa aprire: «video» (lo slug, con «scheda» se serve) per la pagina di un video, «percorso» per un file dell'archivio.",
          "Say what to open: «video» (the slug, with «scheda» if needed) for a video's page, «percorso» for a file in the archive.",
        ),
      )
    }
    c.opzioni.apriNelBrowser(`${origine}/entra?chiave=${encodeURIComponent(c.chiaveApi)}&dopo=${encodeURIComponent(dopo)}`)
    return risposta({ ok: true, aperto: dopo })
  }

  const apri: Gestore = async ({ req, url }) => {
    const corpo = comeOggetto(await corpoJson(req), LA_RICHIESTA)
    if (corpo["dove"] === "browser") return apriNelBrowser(corpo, url.origin)
    const percorso = corpo["percorso"]
    const assoluto = typeof percorso === "string" ? percorsoSicuro(percorsi.archivio, percorso.replaceAll("\\", "/")) : null
    if (assoluto === null) {
      throw new ErroreApi(
        400,
        frase(
          "Il percorso deve stare dentro l'archivio e non avere «..»: scrivilo relativo all'archivio, per esempio «video/orto-in-numeri».",
          "The path must be inside the archive and have no «..»: write it relative to the archive, for example «video/orto-in-numeri».",
        ),
      )
    }
    const stato = await statistica(assoluto)
    if (!stato) throw new ErroreApi(404, frase("Questo file o cartella non c'è nell'archivio.", "This file or folder is not in the archive."))
    c.opzioni.mostraInEsplora(assoluto, stato.isDirectory())
    return risposta({ ok: true })
  }

  const impostaArrivi: Gestore = async ({ req }) => {
    soloDalComputer(req)
    const acceso = comeOggetto(await corpoJson(req), LA_RICHIESTA)["acceso"]
    if (typeof acceso !== "boolean") {
      throw new ErroreApi(400, frase("Manca «acceso»: true per collegare un telefono, false per scollegarli.", "«acceso» is missing: true to connect a phone, false to disconnect them."))
    }
    await c.ricevitore.impostaArrivi(acceso)
    c.eventi.emetti({ tipo: "arrivi" })
    return risposta(c.ricevitore.stato())
  }

  const controllaFirewall: Gestore = async () => {
    await c.firewall.controlla()
    c.eventi.emetti({ tipo: "arrivi" })
    return risposta(c.ricevitore.stato())
  }

  // --- Lo studio dalla rete -------------------------------------------------------------------

  /** Chi arriva dalla rete porta l'intestazione che il ricevitore mette: l'accesso allo studio si cambia solo dal computer. */
  const soloDalComputer = (req: Request): void => {
    if (req.headers.has(INTESTAZIONE_DALLA_RETE)) {
      throw new ErroreApi(403, frase("L'accesso allo studio dalla rete si cambia solo dal computer, non dal telefono.", "Access to the studio from the network can only be changed from the computer, not from the phone."))
    }
  }

  const cambiato = async (azione: () => Promise<void>): Promise<Response> => {
    await azione()
    c.eventi.emetti({ tipo: "accesso-studio" })
    return risposta(c.ricevitore.statoStudio())
  }

  const leggiAccessoStudio: Gestore = ({ req }) => {
    soloDalComputer(req)
    return risposta(c.ricevitore.statoStudio())
  }

  const impostaAccessoStudio: Gestore = async ({ req }) => {
    soloDalComputer(req)
    const acceso = comeOggetto(await corpoJson(req), LA_RICHIESTA)["acceso"]
    if (typeof acceso !== "boolean") {
      throw new ErroreApi(400, frase("Manca «acceso»: true per accendere lo studio dalla rete, false per spegnerlo.", "«acceso» is missing: true to turn the studio on from the network, false to turn it off."))
    }
    return cambiato(() => c.ricevitore.impostaStudio(acceso))
  }

  const rifaiChiaveDelloStudio: Gestore = ({ req }) => {
    soloDalComputer(req)
    return cambiato(() => c.ricevitore.accesso.rifaiChiave())
  }

  // --- La registrazione -----------------------------------------------------------------------

  /** Un rifiuto della registrazione è un conflitto con lo stato di adesso: 409 con la sua frase. */
  const conRegistrazione = async (azione: () => Promise<void>, stato = 200): Promise<Response> => {
    try {
      await azione()
    } catch (errore) {
      if (errore instanceof ErroreRegistrazione) throw new ErroreApi(409, errore.testo)
      throw errore
    }
    return risposta(c.registrazione.stato(), stato)
  }

  const avviaRegistrazione: Gestore = async ({ req }) => {
    const corpo = comeOggetto(await corpoJson(req), LA_RICHIESTA)
    const modo = corpo["modo"]
    if (typeof modo !== "string" || !(MODI as readonly string[]).includes(modo)) {
      const modi = MODI.map((m) => `«${m}»`).join(", ")
      throw new ErroreApi(400, frase(`«modo» deve essere uno fra ${modi}.`, `«modo» must be one of ${modi}.`))
    }
    const scelta: Scelta = {}
    for (const campo of ["microfono", "camera"] as const) {
      const valore = corpo[campo]
      if (valore === undefined) continue
      if (typeof valore !== "string" || valore === "") {
        throw new ErroreApi(400, frase(`«${campo}» è il nome di un dispositivo fra quelli che il server ha trovato.`, `«${campo}» is the name of a device among those the server found.`))
      }
      scelta[campo] = valore
    }
    return conRegistrazione(() => c.registrazione.avvia(modo as Modo, scelta), 201)
  }

  // --- Il canale ------------------------------------------------------------------------------

  const NOME_CANALE = /^[a-z0-9]+(-[a-z0-9]+)*$/
  const IDENTIFICATORE = /^[A-Za-z0-9_-]+$/
  const nomeDelCanale = (parametro: string | undefined): string => {
    const nome = decodifica(parametro ?? "")
    if (!nome || !NOME_CANALE.test(nome)) {
      throw new ErroreApi(
        404,
        frase(
          "Questo canale non esiste: il nome ha solo lettere minuscole, numeri e trattini (per esempio «tiktok»).",
          "This channel does not exist: the name has only lowercase letters, numbers and hyphens (for example «tiktok»).",
        ),
      )
    }
    return nome
  }
  const parametro = (url: URL, nome: string): string | undefined => {
    const valore = url.searchParams.get(nome)
    if (valore === null) return undefined
    if (!IDENTIFICATORE.test(valore)) {
      throw new ErroreApi(400, frase(`«${nome}» non è scritto bene: usa solo lettere, numeri, trattini e trattini bassi.`, `«${nome}» is not written correctly: use only letters, numbers, hyphens and underscores.`))
    }
    return valore
  }

  /** Il file di una lettura, letto adesso: è l'unica lettura dal disco di queste rotte, perché commenti e messaggi sono grandi. */
  async function fileDellaLettura(canale: string, lettura: string, relativo: string): Promise<Record<string, unknown>> {
    const letto = jsonDaTesto((await leggiTesto(join(percorsi.canali, canale, "letture", lettura, relativo))) ?? "")?.valore
    if (typeof letto !== "object" || letto === null || Array.isArray(letto)) {
      throw new ErroreApi(409, frase("La lettura si sta scrivendo proprio adesso: riprova tra un attimo.", "The read is being written right now: try again in a moment."))
    }
    return letto as Record<string, unknown>
  }

  const canale: Gestore = ({ param }) => risposta(indice.canali.vista(nomeDelCanale(param[0])))

  const andamento: Gestore = ({ param }) => risposta(indice.canali.andamento(nomeDelCanale(param[0])))

  const classifica: Gestore = ({ param }) => risposta(indice.canali.classifica(nomeDelCanale(param[0])))

  const crescita: Gestore = ({ param }) => risposta(indice.canali.crescita(nomeDelCanale(param[0])))

  const commentiDelCanale: Gestore = async ({ param, url }) => {
    const nome = nomeDelCanale(param[0])
    const video = parametro(url, "video")
    if (video === undefined) {
      throw new ErroreApi(
        400,
        frase(
          "Manca «video»: scrivi l'identificatore del video del canale, per esempio ?video=7425550000000000000.",
          "«video» is missing: write the identifier of the channel's video, for example ?video=7425550000000000000.",
        ),
      )
    }
    const trovato = indice.canali.commenti(nome, video, parametro(url, "lettura"))
    if (!trovato) {
      throw new ErroreApi(
        404,
        frase(
          "Non ci sono commenti letti per questo video (o per quella lettura): per rileggere il canale, chiedilo nella chat.",
          "There are no comments read for this video (or for that read): to read the channel again, ask in the chat.",
        ),
      )
    }
    const file = await fileDellaLettura(nome, trovato.lettura.lettura, `commenti/${video}.json`)
    return risposta({ ...file, lettura: trovato.lettura.lettura, nuovi: trovato.nuovi })
  }

  const messaggiDelCanale: Gestore = async ({ param, url }) => {
    const nome = nomeDelCanale(param[0])
    const trovato = indice.canali.messaggi(nome, parametro(url, "lettura"))
    if (!trovato) {
      throw new ErroreApi(
        404,
        frase(
          "Non ci sono messaggi letti (o non per quella lettura): per rileggere il canale, chiedilo nella chat.",
          "There are no messages read (or not for that read): to read the channel again, ask in the chat.",
        ),
      )
    }
    const file = await fileDellaLettura(nome, trovato.lettura.lettura, "messaggi.json")
    const conversazioni = (Array.isArray(file["conversazioni"]) ? file["conversazioni"] : []).map((conv: Record<string, unknown>) => ({ ...conv, nuovi: trovato.nuovi.get(String(conv["con"])) ?? [] }))
    return risposta({ ...file, lettura: trovato.lettura.lettura, conversazioni })
  }

  const commentiDelVideo: Gestore = async ({ param }) => {
    const slug = slugDi(param[0])
    const legato = indice.canali.legatoA(slug)
    if (!legato) return risposta({ commenti: [], legato: false })
    const trovato = indice.canali.commenti(legato.canale, legato.id)
    if (!trovato) return risposta({ commenti: [], nuovi: [], legato: true, canale: legato.canale, video: legato.id, lettura: null })
    const file = await fileDellaLettura(legato.canale, trovato.lettura.lettura, `commenti/${legato.id}.json`)
    return risposta({ ...file, commenti: Array.isArray(file["commenti"]) ? file["commenti"] : [], legato: true, canale: legato.canale, video: legato.id, lettura: trovato.lettura.lettura, nuovi: trovato.nuovi })
  }

  // --- La tabella -----------------------------------------------------------------------------

  const rotte: Rotta[] = [
    ["GET", /^\/api\/video$/, () => risposta(indice.elencoVideo())],
    ["POST", /^\/api\/video$/, creaVideo],
    ["GET", /^\/api\/video\/([^/]+)$/, dettaglio],
    ["DELETE", /^\/api\/video\/([^/]+)$/, eliminaVideo],
    ["PUT", /^\/api\/video\/([^/]+)\/scheda$/, salvaScheda],
    ["PATCH", /^\/api\/video\/([^/]+)\/scheda$/, cambiaScheda],
    ["PUT", /^\/api\/video\/([^/]+)\/piano$/, salvaPiano],
    ["PATCH", /^\/api\/video\/([^/]+)\/piano$/, ritoccaPiano],
    ["POST", /^\/api\/video\/([^/]+)\/annulla$/, muoviPiano(true)],
    ["POST", /^\/api\/video\/([^/]+)\/rifai$/, muoviPiano(false)],
    ["POST", /^\/api\/video\/([^/]+)\/lavori$/, mettiInCoda],
    ["GET", /^\/api\/grezzo$/, () => risposta(indice.elencoGrezzo())],
    ["GET", /^\/api\/grezzo\/parole$/, paroleDelFile],
    ["PUT", /^\/api\/grezzo\/scheda$/, salvaSchedaDelFile],
    ["PATCH", /^\/api\/grezzo\/scheda$/, cambiaSchedaDelFile],
    ["POST", /^\/api\/grezzo\/prepara$/, preparaFile],
    ["POST", /^\/api\/grezzo\/scarica$/, scaricaGirato],
    ["GET", /^\/api\/stile$/, leggiStile],
    ["PUT", /^\/api\/stile$/, salvaStile],
    ["GET", /^\/api\/motori$/, leggiMotori],
    ["PUT", /^\/api\/motori$/, scriviMotori],
    ["GET", /^\/api\/macchina$/, leggiMacchina],
    ["GET", /^\/api\/profilo$/, leggiProfilo],
    ["GET", /^\/api\/animazioni$/, async () => risposta(await c.animazioni.ottieni())],
    ["GET", /^\/api\/lavori$/, () => risposta(coda.stato())],
    ["DELETE", /^\/api\/lavori\/([^/]+)$/, fermaLavoro],
    ["GET", /^\/api\/arrivi$/, () => risposta(c.ricevitore.stato())],
    ["PUT", /^\/api\/arrivi$/, impostaArrivi],
    ["POST", /^\/api\/arrivi\/controlla$/, controllaFirewall],
    ["GET", /^\/api\/accesso-studio$/, leggiAccessoStudio],
    ["PUT", /^\/api\/accesso-studio$/, impostaAccessoStudio],
    ["POST", /^\/api\/accesso-studio\/chiave$/, rifaiChiaveDelloStudio],
    ["GET", /^\/api\/registrazione$/, () => risposta(c.registrazione.stato())],
    ["POST", /^\/api\/registrazione$/, avviaRegistrazione],
    ["DELETE", /^\/api\/registrazione$/, () => conRegistrazione(() => c.registrazione.ferma())],
    ["POST", /^\/api\/registrazione\/dispositivi$/, () => conRegistrazione(() => c.registrazione.elencaDispositivi())],
    ["GET", /^\/api\/canale\/([^/]+)$/, canale],
    ["GET", /^\/api\/canale\/([^/]+)\/andamento$/, andamento],
    ["GET", /^\/api\/canale\/([^/]+)\/classifica$/, classifica],
    ["GET", /^\/api\/canale\/([^/]+)\/crescita$/, crescita],
    ["GET", /^\/api\/canale\/([^/]+)\/commenti$/, commentiDelCanale],
    ["GET", /^\/api\/canale\/([^/]+)\/messaggi$/, messaggiDelCanale],
    ["GET", /^\/api\/video\/([^/]+)\/commenti$/, commentiDelVideo],
    ["GET", /^\/api\/consumi$/, () => risposta(c.consumi.vista())],
    ["POST", /^\/api\/apri$/, apri],
    ...rotteDellaChat(c.chat),
  ]

  async function api(req: Request, url: URL, senzaScadenza: () => void): Promise<Response> {
    if (url.pathname === "/api/eventi") {
      if (req.method !== "GET") throw new ErroreApi(405, NON_AMMESSO)
      senzaScadenza()
      return c.eventi.apri()
    }
    const trovate = rotte.flatMap(([metodo, modello, gestore]) => {
      const m = modello.exec(url.pathname)
      return m ? [{ metodo, gestore, param: m.slice(1) }] : []
    })
    if (trovate.length === 0) throw new ErroreApi(404, frase("Questa rotta non esiste: guarda docs/API.md.", "This route does not exist: see docs/API.md."))
    const scelta = trovate.find((t) => t.metodo === req.method)
    if (!scelta) throw new ErroreApi(405, NON_AMMESSO)
    return scelta.gestore({ req, url, param: scelta.param })
  }

  return (req, senzaScadenza) => {
    const lingua = linguaDi(req)
    if (haLingua(req)) coda.linguaDelloStudio = lingua
    return nellaLingua(lingua, () => gestisci(req, senzaScadenza))
  }

  async function gestisci(req: Request, senzaScadenza: () => void): Promise<Response> {
    try {
      const url = new URL(req.url)
      if (!NOMI_LOCALI.has(url.hostname)) {
        const indirizzo = `http://127.0.0.1:${url.port || c.opzioni.porta}`
        throw new ErroreApi(
          403,
          frase(`Questo server risponde solo a «127.0.0.1» e «localhost»: apri ${indirizzo}.`, `This server only answers to «127.0.0.1» and «localhost»: open ${indirizzo}.`),
        )
      }
      const origine = req.headers.get("origin")
      if (req.method !== "GET" && req.method !== "HEAD" && origine && !NOMI_LOCALI.has(new URL(origine).hostname)) {
        throw new ErroreApi(
          403,
          frase(
            "Questa richiesta viene da un'altra pagina web e non la eseguo: le modifiche si fanno dall'interfaccia di Mango Animation.",
            "This request comes from another web page and I will not carry it out: changes are made from the Mango Animation interface.",
          ),
        )
      }

      if (url.pathname === "/entra") return entra(req, url, c.chiaveApi)
      if (!haLaChiave(c.chiaveApi, req, url)) return senzaChiave(req)

      if (url.pathname.startsWith("/api/")) return await api(req, url, senzaScadenza)
      if (req.method !== "GET" && req.method !== "HEAD") throw new ErroreApi(405, NON_AMMESSO)

      const cartelle: [prefisso: string, radice: string, cache: string][] = [
        ["/media/", percorsi.archivio, "no-cache"],
        ["/font/", c.opzioni.font, "public, max-age=86400"],
      ]
      for (const [prefisso, radice, cache] of cartelle) {
        if (!url.pathname.startsWith(prefisso)) continue
        const relativo = decodifica(url.pathname.slice(prefisso.length))
        const percorso = relativo === null ? null : percorsoSicuro(radice, relativo)
        if (percorso === null) {
          throw new ErroreApi(400, frase("Questo percorso non è ammesso: si servono solo file dentro la cartella, senza «..».", "This path is not allowed: only files inside the folder are served, without «..»."))
        }
        if (prefisso === "/media/" && relativo !== null && nonSiServe(relativo)) throw new ErroreApi(404, frase("Questo file non c'è.", "This file is not there."))
        return await serviFile(req, percorso, cache)
      }
      return await serviStudio(req, c.opzioni.studio, url.pathname)
    } catch (errore) {
      if (errore instanceof ErroreApi) return Response.json({ errore: errore.testo, ...errore.extra }, { status: errore.stato })
      console.error(`${req.method} ${req.url}: ${errore instanceof Error ? (errore.stack ?? errore.message) : String(errore)}`)
      return Response.json(
        {
          errore: frase(
            "Qualcosa è andato storto nel server: la richiesta non è stata eseguita. I dettagli sono nel terminale dove gira il server.",
            "Something went wrong in the server: the request was not carried out. The details are in the terminal where the server runs.",
          ),
        },
        { status: 500 },
      )
    }
  }
}
