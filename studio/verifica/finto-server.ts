// Un finto server che parla come quello vero (`docs/API.md`) su un archivio di esempio, per provare l'interfaccia
// senza aspettare il server né toccare l'archivio vero. Tiene da sé la coda dei lavori, annulla e rifai, e gli
// eventi; il «risolvi» è quello semplice di `risolvi-finto.ts`.
//   bun run verifica/finto-server.ts          porta 47531, archivio in una cartella temporanea (rifatto a ogni avvio)
import { copyFile, mkdir, readdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { dirname, extname, join, normalize, resolve, sep } from "node:path"
import type { AnimazioneDisponibile, Controllo, Evento, GiornoGrezzo, Lavoro, Motori, ParolaGrezzo, Piano, PianoCompleto, Scheda, SchedaGrezzo, StatoArrivi, StatoRegistrazione, StatoStudioRemoto, Stile, Uscita, VoceElenco } from "../src/tipi"
import { creaChatFinta } from "./finto-chat"
import { CARTELLA_PREDEFINITA, generaArchivio } from "./genera-archivio"
import { applicaBase, risolvi } from "./risolvi-finto"

const PORTA = Number(process.env.PORTA_FINTO ?? 47531)
const MONTA_MS = Number(process.env.MONTA_FINTO_MS ?? 900)
const ARCHIVIO = resolve(process.env.FINTO_ARCHIVIO ?? CARTELLA_PREDEFINITA)
const RADICE_REPO = resolve(import.meta.dir, "..", "..")
const DIST = resolve(process.env.FINTO_DIST ?? resolve(import.meta.dir, "..", "dist"))

// L'archivio temporaneo predefinito si rifà a ogni avvio, così ha sempre i video di prova di adesso; uno scelto con FINTO_ARCHIVIO resta com'è.
if (!process.env.FINTO_ARCHIVIO || !existsSync(join(ARCHIVIO, "stile.json"))) await generaArchivio(ARCHIVIO)

class ErroreHttp extends Error {
  constructor(
    readonly stato: number,
    messaggio: string,
    readonly problemi: string[] = [],
  ) {
    super(messaggio)
  }
}

const json = (dati: unknown, stato = 200) => Response.json(dati, { status: stato })
const leggi = async <T>(percorso: string): Promise<T> => JSON.parse(await readFile(percorso, "utf8")) as T
const leggiSe = async <T>(percorso: string): Promise<T | null> => (existsSync(percorso) ? leggi<T>(percorso) : null)
const scrivi = (percorso: string, dati: unknown) => mkdir(dirname(percorso), { recursive: true }).then(() => writeFile(percorso, `${JSON.stringify(dati, null, 2)}\n`))
const cartellaVideo = (slug: string) => join(ARCHIVIO, "video", slug)
const dormi = (ms: number) => new Promise((ok) => setTimeout(ok, ms))

const eventi = new Set<ReadableStreamDefaultController<Uint8Array>>()
const codifica = new TextEncoder()
function emetti(evento: Evento): void {
  const riga = codifica.encode(`data: ${JSON.stringify(evento)}\n\n`)
  for (const c of eventi) c.enqueue(riga)
}

// Cosa il server vero direbbe di una scheda o di un piano scritti male (e, con `indietro`, di un risolto rimasto indietro senza un `risolvi` in coda): le foto lo chiedono con `POST /finto/problemi`.
const problemiDelVideo = new Map<string, { scheda: string[]; piano: string[] }>()
const problemiDelGirato = new Map<string, string[]>()
let problemiDelProfilo: string[] = []

// Lo studio dal telefono: spento di base; `POST /finto/tailscale` dice com'è Tailscale sul computer finto.
let studioAcceso = false
let tailscale: "pronto" | "bloccato" | "assente" = "pronto"
const statoStudioRemoto = (): StatoStudioRemoto => {
  const link = (indirizzo: string) => ({ indirizzo, link: `http://${indirizzo}/studio?chiave=prova`, qr: QR })
  return {
    acceso: studioAcceso,
    in_ascolto: true,
    casa: studioAcceso ? link("192.168.1.20:47420") : null,
    fuori: studioAcceso && tailscale !== "assente" ? { ...link("100.101.102.103:47420"), pronto: tailscale === "pronto", motivo: tailscale === "pronto" ? null : "Windows non lascia entrare dalla rete di Tailscale. Apri «Sicurezza di Windows», poi «Firewall e protezione della rete», «Consenti app attraverso il firewall», e spunta il programma anche per il tipo di rete di Tailscale. Poi premi «Controlla di nuovo»." } : null,
    pronto: true,
    motivo: null,
  }
}

const stato = new Map<string, { passato: string[]; futuro: string[]; aggiornato: boolean }>()
const statoDi = (slug: string) => {
  const s = stato.get(slug) ?? { passato: [], futuro: [], aggiornato: true }
  stato.set(slug, s)
  return s
}

const stileAttuale = () => leggi<Stile>(join(ARCHIVIO, "stile.json"))

async function slugs(): Promise<string[]> {
  return existsSync(join(ARCHIVIO, "video")) ? (await readdir(join(ARCHIVIO, "video"))).sort() : []
}

async function grezzoFile(): Promise<Array<{ giorno: string; nome: string; percorso: string }>> {
  const radice = join(ARCHIVIO, "grezzo")
  if (!existsSync(radice)) return []
  const giorni = await readdir(radice)
  return (await Promise.all(giorni.map(async (g) => (await readdir(join(radice, g))).filter((n) => /\.(mp4|mov|heic|jpe?g|png)$/i.test(n)).map((nome) => ({ giorno: g, nome, percorso: join(radice, g, nome) }))))).flat()
}

async function parole(file: string): Promise<ParolaGrezzo[]> {
  return (await leggiSe<ParolaGrezzo[]>(join(ARCHIVIO, "preparati", file, "parole.json"))) ?? []
}

async function durataDi(file: string): Promise<number> {
  return (await leggiSe<SchedaGrezzo>(join(ARCHIVIO, "grezzo", `${file}.scheda.json`)))?.durata ?? 0
}

const percorsoSe = (percorso: string) => (existsSync(join(ARCHIVIO, percorso)) ? percorso : null)

/** Il piano con la base applicata, senza ricalcolare niente. */
async function effettivoDi(slug: string): Promise<PianoCompleto | null> {
  const piano = await leggiSe<Piano>(join(cartellaVideo(slug), "piano.json"))
  if (!piano) return null
  if (!piano.base) return piano as PianoCompleto
  const base = await effettivoDi(piano.base)
  if (!base) throw new ErroreHttp(400, `Il video di base «${piano.base}» non esiste.`)
  return applicaBase(base, piano)
}

async function ricalcola(slug: string): Promise<void> {
  const piano = await leggi<Piano>(join(cartellaVideo(slug), "piano.json"))
  const base = piano.base ? await effettivoDi(piano.base) : null
  const [parolePerFile, durate] = await Promise.all([
    (async () => {
      const m = new Map<string, ParolaGrezzo[]>()
      for (const g of await grezzoFile()) m.set(`${g.giorno}/${g.nome}`, await parole(`${g.giorno}/${g.nome}`))
      return m
    })(),
    (async () => {
      const m = new Map<string, number>()
      for (const g of await grezzoFile()) m.set(`${g.giorno}/${g.nome}`, await durataDi(`${g.giorno}/${g.nome}`))
      return m
    })(),
  ])
  const { risolto } = risolvi(piano, base, { stile: await stileAttuale(), parole: (f) => parolePerFile.get(f) ?? [], durata: (f) => durate.get(f) ?? 0 })
  await scrivi(join(cartellaVideo(slug), "lavoro", "risolto.json"), risolto)
}

async function uscite(slug: string): Promise<Uscita[]> {
  const cartella = join(cartellaVideo(slug), "uscite")
  if (!existsSync(cartella)) return []
  const lette = await Promise.all(
    (await readdir(cartella)).sort().map(async (nome) => ({ nome, s: await stat(join(cartella, nome)) })),
  )
  const primi = new Map<string, string>()
  return lette.map(({ nome, s }) => {
    const file = `video/${slug}/uscite/${nome}`
    const id = `${s.dev}:${s.ino}`
    const primo = primi.get(id)
    if (primo === undefined) primi.set(id, file)
    return { file, byte: s.size, cambiato: s.mtime.toISOString(), stesso_file: primo ?? null }
  })
}

/** Il montato da guardare, come lo dice il server: la copertina se è lo stesso file del finale o non è più vecchia, altrimenti il finale. */
function montatoDi(elenco: Uscita[]): { file: string; quando: string } | null {
  const finale = elenco.find((u) => u.file.endsWith("/uscite/finale.mp4"))
  const copertina = elenco.find((u) => u.file.endsWith("/uscite/con-copertina.mp4"))
  const stessi = finale && copertina && (finale.stesso_file === copertina.file || copertina.stesso_file === finale.file)
  const scelto = !finale ? copertina : copertina && (stessi || Date.parse(copertina.cambiato) >= Date.parse(finale.cambiato)) ? copertina : finale
  return scelto ? { file: scelto.file, quando: scelto.cambiato } : null
}

async function elencoMateriali(slug: string): Promise<Array<{ file: string; byte: number }>> {
  const cartella = join(cartellaVideo(slug), "materiali")
  if (!existsSync(cartella)) return []
  return Promise.all((await readdir(cartella)).sort().map(async (n) => ({ file: `video/${slug}/materiali/${n}`, byte: (await stat(join(cartella, n))).size })))
}

function lavoroDi(slug: string): { id: string; comando: string; stato: "in corso" | "in coda" } | null {
  if (inCorso?.slug === slug) return { id: String(inCorso.id), comando: inCorso.comando, stato: "in corso" }
  const c = coda.find((x) => x.slug === slug)
  return c ? { id: c.id, comando: c.comando, stato: "in coda" } : null
}

/** Come il server vero: il fotogramma d'inizio di ogni tratto, al decimo di secondo; qui lo fa ffmpeg al momento, una volta. */
async function fotogrammiDei(risolto: { tratti?: Array<{ sorgente: string | null; da: number }> } | null, piano: PianoCompleto): Promise<Array<string | null>> {
  return Promise.all(
    (risolto?.tratti ?? []).map(async (t) => {
      const file = t.sorgente === null ? undefined : piano.sorgenti[t.sorgente]?.file
      if (file === undefined) return null
      const decimi = Math.round(t.da * 10)
      const relativo = `preparati/${file}/fotogrammi/${decimi}.jpg`
      const destinazione = join(ARCHIVIO, relativo)
      if (!existsSync(destinazione)) {
        await mkdir(dirname(destinazione), { recursive: true })
        const processo = Bun.spawn(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", String(decimi / 10), "-i", join(ARCHIVIO, "grezzo", file), "-frames:v", "1", "-vf", "scale=240:-2", destinazione], { stdout: "ignore", stderr: "ignore" })
        if ((await processo.exited) !== 0) return null
      }
      return relativo
    }),
  )
}

async function dettaglio(slug: string) {
  const cartella = cartellaVideo(slug)
  const scheda = await leggiSe<Scheda>(join(cartella, "scheda.json"))
  if (!scheda) throw new ErroreHttp(404, "Questo video non c'è. Torna all'elenco dei video e sceglilo di nuovo.")
  const piano = await leggiSe<Piano>(join(cartella, "piano.json"))
  const effettivo = (await effettivoDi(slug)) ?? { quadro: "girato-pieno", sorgenti: {}, scene: [] }
  const s = statoDi(slug)
  const risolto = await leggiSe<{ tratti?: Array<{ sorgente: string | null; da: number }> }>(join(cartella, "lavoro", "risolto.json"))
  const elenco = await uscite(slug)
  const finale = elenco.find((u) => u.file.endsWith("/uscite/finale.mp4"))
  const pianoDel = existsSync(join(cartella, "piano.json")) ? (await stat(join(cartella, "piano.json"))).mtime.getTime() : null
  const pianoCambiato = Math.max(pianoDel ?? 0, pianoSalvatoA.get(slug) ?? 0)
  return {
    slug,
    cartella,
    scheda,
    piano,
    problemi: problemiDelVideo.get(slug) ?? { scheda: [], piano: [] },
    piano_risolto_da_base: effettivo,
    risolto,
    risolto_aggiornato: s.aggiornato,
    controllo: await leggiSe<Controllo>(join(cartella, "lavoro", "controllo.json")),
    uscite: elenco,
    montato: montatoDi(elenco),
    materiali: await elencoMateriali(slug),
    puo_annullare: s.passato.length > 0,
    puo_rifare: s.futuro.length > 0,
    lavoro: lavoroDi(slug),
    montaggio_superato: inCorso?.comando === "monta" && inCorso.slug === slug && (pianoSalvatoA.get(slug) ?? 0) > Date.parse(inCorso.iniziato ?? ""),
    piano_cambiato: pianoCambiato > 0 ? new Date(pianoCambiato).toISOString() : null,
    piano_dopo_montato: finale !== undefined && pianoCambiato > Date.parse(finale.cambiato),
    fotogrammi: await fotogrammiDei(risolto, effettivo),
  }
}

async function elenco(): Promise<VoceElenco[]> {
  return Promise.all(
    (await slugs()).map(async (slug) => {
      const cartella = cartellaVideo(slug)
      const scheda = await leggi<Scheda>(join(cartella, "scheda.json"))
      const risolto = await leggiSe<{ durata: number }>(join(cartella, "lavoro", "risolto.json"))
      const effettivo = await effettivoDi(slug).catch(() => null)
      const primo = Object.values(effettivo?.sorgenti ?? {})[0]
      const uscita = await uscite(slug)
      const copertina = uscita.find((u) => u.file.endsWith("copertina.png"))
      const anteprima = ["png", "jpg", "jpeg", "webp"].map((e) => `video/${slug}/materiali/anteprima.${e}`).find((p) => existsSync(join(ARCHIVIO, p))) ?? null
      const tocchi = await Promise.all([join(cartella, "scheda.json"), join(cartella, "piano.json")].filter(existsSync).map(async (p) => (await stat(p)).mtime.getTime()))
      return {
        slug,
        scheda,
        durata: risolto?.durata ?? null,
        miniatura: copertina?.file ?? uscita.find((u) => u.file.endsWith("/uscite/slide-1.png"))?.file ?? anteprima ?? (primo ? `preparati/${primo.file}/miniatura.jpg` : null) ?? uscita.find((u) => u.file.endsWith("/uscite/prova.jpg"))?.file ?? null,
        anteprima,
        ha_piano: existsSync(join(cartella, "piano.json")),
        ha_finale: uscita.some((u) => u.file.endsWith("finale.mp4")),
        ultimo_cambio: new Date(Math.max(...tocchi, ...uscita.map((u) => new Date(u.cambiato).getTime()))).toISOString(),
      }
    }),
  )
}

async function controllaPiano(slug: string, piano: Piano): Promise<void> {
  const stile = await stileAttuale()
  const file = new Set((await grezzoFile()).map((g) => `${g.giorno}/${g.nome}`))
  if (piano.base !== undefined && !(await slugs()).includes(piano.base)) throw new ErroreHttp(400, `Il video di base «${piano.base}» non esiste.`)
  if (piano.base === slug) throw new ErroreHttp(400, "Un video non può avere sé stesso come base.")
  if (piano.base === undefined && (!piano.quadro || !piano.sorgenti || !piano.scene)) throw new ErroreHttp(400, "Il piano deve avere un quadro, le sorgenti e le scene (oppure una base).")
  const base = piano.base ? await effettivoDi(piano.base) : null
  const effettivo = base ? applicaBase(base, piano) : (piano as PianoCompleto)
  const problemi: string[] = []
  if (!stile.quadri[effettivo.quadro]) problemi.push(`Il quadro «${effettivo.quadro}» non è nello stile.`)
  for (const [nome, s] of Object.entries(piano.sorgenti ?? {})) if (!file.has(s.file)) problemi.push(`Il file della sorgente «${nome}» non è nel girato.`)
  for (const scena of effettivo.scene) {
    if (scena.quadro && !stile.quadri[scena.quadro]) problemi.push(`Il quadro «${scena.quadro}» della scena «${scena.nome}» non è nello stile.`)
    if (scena.pezzi.length === 0) problemi.push(`La scena «${scena.nome}» non ha nessun pezzo.`)
    for (const pezzo of scena.pezzi) {
      if (pezzo.sorgente === undefined) {
        if (pezzo.durata === undefined) problemi.push(`Nella scena «${scena.nome}» un pezzo non ha né sorgente né durata.`)
        continue
      }
      const sorgente = effettivo.sorgenti[pezzo.sorgente]
      if (!sorgente) {
        problemi.push(`Nella scena «${scena.nome}» un pezzo usa la sorgente «${pezzo.sorgente}», che il piano non dichiara.`)
        continue
      }
      const vista = pezzo.vista ?? scena.vista
      if (vista && !sorgente.viste?.[vista]) problemi.push(`La vista «${vista}» non è dichiarata per la sorgente «${pezzo.sorgente}».`)
    }
  }
  if (problemi.length > 0) throw new ErroreHttp(400, problemi[0]!, problemi)
}

interface Compito {
  id: string
  slug: string | null
  comando: string
  file?: string
  accodato: number
}

const coda: Compito[] = []
const pianoSalvatoA = new Map<string, number>()
const finiti: Lavoro[] = []
let inCorso: Lavoro | null = null
let fermato = false
let contatore = 0
let occupato = false

function mettiInCoda(compito: Omit<Compito, "id" | "accodato">): string {
  const id = `l${++contatore}`
  if (!coda.some((c) => c.slug === compito.slug && c.comando === compito.comando && c.file === compito.file && compito.comando === "risolvi")) coda.push({ ...compito, id, accodato: Date.now() })
  emetti({ tipo: "lavori" })
  void lavora()
  return id
}

async function esegui(c: Compito): Promise<void> {
  const riga = (testo: string) => {
    inCorso!.righe = [...(inCorso!.righe ?? []), testo]
    emetti({ tipo: "lavori" })
  }
  riga(`Comincio: ${c.comando}`)
  await dormi(400)
  if (fermato) return
  if (c.comando === "risolvi" && c.slug) {
    riga("Ricalcolo i tratti dal piano")
    await ricalcola(c.slug)
    statoDi(c.slug).aggiornato = true
    emetti({ tipo: "video", slug: c.slug, cosa: "risolto" })
  }
  if (c.comando === "monta" && c.slug) {
    riga("Rendo le scene e monto")
    for (const fine = Date.now() + MONTA_MS; Date.now() < fine && !fermato; ) await dormi(50)
    if (fermato) return
    await mkdir(join(cartellaVideo(c.slug), "uscite"), { recursive: true })
    await copyFile(join(ARCHIVIO, "finale-generico.mp4"), join(cartellaVideo(c.slug), "uscite", "finale.mp4"))
    emetti({ tipo: "video", slug: c.slug, cosa: "uscite" })
  }
  if (c.comando === "controlla" && c.slug) {
    riga("Riascolto il montato")
    await dormi(700)
    const finale = join(cartellaVideo(c.slug), "uscite", "finale.mp4")
    if (!existsSync(finale)) throw new Error("Non c'è un montato da controllare.")
    const controllo: Controllo = { quando: new Date().toISOString(), del_finale: (await stat(finale)).mtime.toISOString(), durata: 12, silenzi: [], parole_fuori_posto: [], sentito: "", differenze: [], tagli_nel_parlato: [] }
    await scrivi(join(cartellaVideo(c.slug), "lavoro", "controllo.json"), controllo)
    emetti({ tipo: "video", slug: c.slug, cosa: "controllo" })
  }
  if (c.comando === "carosello" && c.slug) {
    riga("Rendo le slide")
    await dormi(900)
    const uscite = join(cartellaVideo(c.slug), "uscite")
    await mkdir(uscite, { recursive: true })
    // Le slide del carosello di prova servono da modello; una resa nuova cambia la data dei file.
    for (const n of [1, 2, 3]) {
      const file = join(uscite, `slide-${n}.png`)
      await copyFile(join(cartellaVideo("carosello-dispensa"), "uscite", `slide-${n}.png`), file)
      await utimes(file, new Date(), new Date())
    }
    riga("attenzione: slide 2: «Quanto sale serve» nel lato sinistro, che il telefono taglia")
    riga("attenzione: slide 3: «Che farina hai?» nella zona della didascalia")
    riga("3 slide in uscite/, avvisi: 2")
    emetti({ tipo: "video", slug: c.slug, cosa: "uscite" })
  }
  if (c.comando === "prepara-file") {
    riga("Preparo il girato")
    await dormi(600)
    emetti({ tipo: "grezzo" })
  }
}

async function lavora(): Promise<void> {
  if (occupato) return
  occupato = true
  while (coda.length > 0) {
    const c = coda.shift()!
    fermato = false
    // Il montaggio ha una storia da cui stimarlo, gli altri lavori no: le foto mostrano tutte e due le righe.
    const stima = c.comando === "monta" ? 240 : null
    inCorso = { id: c.id, slug: c.slug, comando: c.comando, file: c.file ?? null, iniziato: new Date().toISOString(), righe: [], stima, fine_prevista: stima === null ? null : new Date(Date.now() + stima * 1000).toISOString() }
    emetti({ tipo: "lavori" })
    let esito: Lavoro["esito"] = "riuscito"
    let errore: string | null = null
    try {
      await esegui(c)
      if (fermato) esito = "fermato"
    } catch (e) {
      esito = "fallito"
      errore = e instanceof Error ? e.message : String(e)
    }
    finiti.unshift({ ...inCorso, finito: new Date().toISOString(), esito, errore })
    finiti.length = Math.min(finiti.length, 20)
    inCorso = null
    emetti({ tipo: "lavori" })
  }
  occupato = false
}

async function scriviPiano(slug: string, piano: Piano, registra: boolean): Promise<void> {
  const file = join(cartellaVideo(slug), "piano.json")
  const prima = await readFile(file, "utf8")
  const s = statoDi(slug)
  if (registra) {
    s.passato.push(prima)
    s.futuro = []
  }
  await mkdir(join(cartellaVideo(slug), "storia"), { recursive: true })
  await writeFile(join(cartellaVideo(slug), "storia", `${s.passato.length}.json`), prima)
  await scrivi(file, piano)
  pianoSalvatoA.set(slug, Date.now())
  s.aggiornato = false
  emetti({ tipo: "video", slug, cosa: "piano" })
  mettiInCoda({ slug, comando: "risolvi" })
}

const SLUG = (testo: string) =>
  testo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "video"

async function nuovoVideo(corpo: { titolo?: string; slug?: string; stato?: Scheda["stato"]; formato?: Scheda["formato"]; grezzo?: string[] }): Promise<{ slug: string }> {
  if (!corpo.titolo?.trim()) throw new ErroreHttp(400, "Serve il titolo del nuovo video.")
  const esistenti = await slugs()
  let slug = corpo.slug ?? SLUG(corpo.titolo)
  for (let n = 2; esistenti.includes(slug); n++) slug = `${corpo.slug ?? SLUG(corpo.titolo)}-${n}`
  if (corpo.formato === "carosello" && corpo.grezzo?.length) throw new ErroreHttp(400, "Un carosello non ha girato: crealo senza file, le slide si scrivono a mano.")
  const scheda: Scheda = { titolo: corpo.titolo.trim(), stato: corpo.stato ?? "proposta", creato: new Date().toISOString().slice(0, 10), ...(corpo.formato === undefined ? {} : { formato: corpo.formato }) }
  await scrivi(join(cartellaVideo(slug), "scheda.json"), scheda)
  if (corpo.grezzo?.length) {
    const sorgenti = Object.fromEntries(corpo.grezzo.map((f, i) => [`f${i + 1}`, { file: f }]))
    const piano: Piano = { quadro: "girato-pieno", sorgenti, scene: [{ nome: "girato", pezzi: Object.keys(sorgenti).map((sorgente) => ({ sorgente })) }] }
    await controllaPiano(slug, piano)
    await scrivi(join(cartellaVideo(slug), "piano.json"), piano)
    await ricalcola(slug)
  }
  emetti({ tipo: "video", slug, cosa: "nuovo" })
  return { slug }
}

async function grezzoElenco(): Promise<GiornoGrezzo[]> {
  const usi = new Map<string, string[]>()
  for (const slug of await slugs()) {
    const eff = await effettivoDi(slug).catch(() => null)
    for (const s of Object.values(eff?.sorgenti ?? {})) usi.set(s.file, [...(usi.get(s.file) ?? []), slug])
  }
  const perGiorno = new Map<string, GiornoGrezzo["file"]>()
  for (const g of await grezzoFile()) {
    const file = `${g.giorno}/${g.nome}`
    const scheda = await leggiSe<SchedaGrezzo>(`${g.percorso}.scheda.json`)
    const prep = `preparati/${file}`
    perGiorno.set(g.giorno, [
      ...(perGiorno.get(g.giorno) ?? []),
      {
        file,
        nome: g.nome,
        byte: (await stat(g.percorso)).size,
        scheda,
        scheda_problemi: problemiDelGirato.get(file) ?? [],
        preparato: {
          parole: percorsoSe(`${prep}/parole.json`),
          sagoma: percorsoSe(`${prep}/sagoma.webm`),
          leggero: percorsoSe(`${prep}/leggero.mp4`),
          onda: percorsoSe(`${prep}/onda.bin`),
          miniatura: percorsoSe(`${prep}/miniatura.jpg`),
          foto: percorsoSe(`${prep}/foto.jpg`),
          trascrizione: null,
        },
        usato_in: [...new Set(usi.get(file) ?? [])],
      },
    ])
  }
  return [...perGiorno.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([giorno, file]) => ({ giorno, file }))
}

const QR = (() => {
  const n = 21
  const celle = Array.from({ length: n * n }, (_, i) => ((i * 2654435761) >>> 0) % 7 < 3)
  const rettangoli = celle.flatMap((pieno, i) => (pieno ? [`<rect x="${i % n}" y="${Math.floor(i / n)}" width="1" height="1"/>`] : []))
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><g fill="#000">${rettangoli.join("")}</g></svg>`
})()

// I conti del lavoro di Claude (`GET /api/consumi`) e le letture del canale (`GET /api/canale/tiktok`), per la pagina della produzione.
const conto = (ore: number, scritti: number, giri: number, giorniFa: number) => ({
  tempo: Math.round(ore * 3600),
  giri,
  token: { scritti, riletti: scritti * 420, nuovi: scritti * 4 },
  dal: new Date(Date.now() - (giorniFa + 3) * 86_400_000).toISOString(),
  al: new Date(Date.now() - giorniFa * 86_400_000).toISOString(),
})
const CONSUMI = {
  pronto: true,
  video: {
    "pentole-nel-cassetto": conto(0.4, 36_594, 10, 3),
    "pane-veloce": conto(1.1, 115_576, 10, 1),
    "tre-forni-in-casa": conto(0.6, 80_927, 3, 9),
    "cucina-di-casa": conto(1.2, 181_733, 12, 17),
    "torta-contro-tiramisu": conto(0.45, 161_367, 4, 26),
    "dentro-una-torta": conto(3.2, 2_265_734, 70, 45),
    "primo-video-pubblicato": conto(0.8, 90_000, 6, 30),
    "ricetta-in-diretta": conto(0.3, 40_000, 3, 1),
    "pasta-fresca": conto(2.4, 310_000, 22, 2),
  },
  senza_video: conto(22, 3_431_805, 700, 0),
}
const NUMERI_DEL_CANALE: Array<[slug: string, visualizzazioni: number, miPiace: number, nuoviFollower: number]> = [
  ["pentole-nel-cassetto", 18_400, 1200, 41],
  ["tre-forni-in-casa", 40_200, 3100, 200],
  ["cucina-di-casa", 9300, 540, 18],
  ["torta-contro-tiramisu", 25_100, 1900, 64],
  ["dentro-una-torta", 2100, 90, 3],
  ["primo-video-pubblicato", 1810, 130, 2],
]
const CANALE = {
  ultima: { lettura: "2026-11-03-1000", quando: "2026-11-03T10:00:00" },
  letture: [{ lettura: "2026-11-03-1000", quando: "2026-11-03T10:00:00", completa: true, mancano: [] }],
  profilo: { nome: "esempio", follower: 640, mi_piace: 5200, video: 6 },
  video: NUMERI_DEL_CANALE.map(([slug, visualizzazioni, miPiace, nuoviFollower]) => ({ id: slug, slug, visualizzazioni, mi_piace: miPiace, nuovi_follower: nuoviFollower, commenti_letti: 0, variazione: null })),
}

const chatFinta = creaChatFinta({ archivio: ARCHIVIO, emetti, mettiInCoda })

async function porta(richiesta: Request): Promise<Response> {
  const url = new URL(richiesta.url)
  const rispostaChat = await chatFinta(richiesta, url)
  if (rispostaChat) return rispostaChat
  const percorso = url.pathname
  const metodo = richiesta.method
  const corpo = async <T>() => (await richiesta.json()) as T

  if (percorso === "/api/eventi") {
    let controllo: ReadableStreamDefaultController<Uint8Array>
    let battito: ReturnType<typeof setInterval>
    const flusso = new ReadableStream<Uint8Array>({
      start(c) {
        controllo = c
        eventi.add(c)
        c.enqueue(codifica.encode(": aperto\n\n"))
        battito = setInterval(() => c.enqueue(codifica.encode(": battito\n\n")), 20_000)
      },
      cancel() {
        clearInterval(battito)
        eventi.delete(controllo)
      },
    })
    return new Response(flusso, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } })
  }

  if (percorso === "/finto/problemi" && metodo === "POST") {
    const { slug, file, scheda, piano, indietro } = await corpo<{ slug?: string; file?: string; scheda?: string[]; piano?: string[]; indietro?: boolean }>()
    if (slug !== undefined) {
      statoDi(slug).aggiornato = indietro !== true
      problemiDelVideo.set(slug, { scheda: scheda ?? [], piano: piano ?? [] })
      emetti({ tipo: "video", slug, cosa: "scheda" })
    }
    if (file !== undefined) {
      problemiDelGirato.set(file, scheda ?? [])
      emetti({ tipo: "grezzo" })
    }
    return json({})
  }
  if (percorso === "/finto/profilo" && metodo === "POST") {
    problemiDelProfilo = (await corpo<{ problemi?: string[] }>()).problemi ?? []
    emetti({ tipo: "profilo" })
    return json({})
  }
  if (percorso === "/api/profilo" && metodo === "GET") return json({ valido: problemiDelProfilo.length === 0, presente: true, canali: [{ piattaforma: "tiktok", nome: "@esempio" }], problemi: problemiDelProfilo })
  if (percorso === "/finto/tailscale" && metodo === "POST") {
    tailscale = (await corpo<{ stato: "pronto" | "bloccato" | "assente" }>()).stato
    emetti({ tipo: "accesso-studio" })
    return json({})
  }
  if (percorso === "/api/accesso-studio" && metodo === "GET") return json(statoStudioRemoto())
  if (percorso === "/api/accesso-studio" && metodo === "PUT") {
    studioAcceso = (await corpo<{ acceso: boolean }>()).acceso
    emetti({ tipo: "accesso-studio" })
    return json(statoStudioRemoto())
  }
  if (percorso === "/api/accesso-studio/chiave" && metodo === "POST") return json(statoStudioRemoto())
  if (percorso === "/api/video" && metodo === "GET") return json(await elenco())
  if (percorso === "/api/video" && metodo === "POST") return json(await nuovoVideo(await corpo()), 201)
  const video = /^\/api\/video\/([^/]+)(?:\/(scheda|piano|annulla|rifai|lavori))?$/.exec(percorso)
  if (video) {
    const slug = decodeURIComponent(video[1]!)
    const azione = video[2]
    if (!(await slugs()).includes(slug)) throw new ErroreHttp(404, "Questo video non c'è. Torna all'elenco dei video e sceglilo di nuovo.")
    if (!azione && metodo === "GET") return json(await dettaglio(slug))
    if (!azione && metodo === "DELETE") {
      const scheda = await leggi<Scheda>(join(cartellaVideo(slug), "scheda.json"))
      if (scheda.stato !== "proposta" || existsSync(join(cartellaVideo(slug), "uscite", "finale.mp4"))) throw new ErroreHttp(409, "Solo una proposta senza video montato si toglie. Per gli altri video cambia lo stato in «scartato».")
      await rm(cartellaVideo(slug), { recursive: true, force: true })
      emetti({ tipo: "video", slug, cosa: "tolto" })
      return json({})
    }
    if (azione === "scheda" && metodo === "PUT") {
      const scheda = await corpo<Scheda>()
      if (!scheda.titolo || !scheda.stato || !scheda.creato) throw new ErroreHttp(400, "La scheda deve avere titolo, stato e data di creazione.")
      if (scheda.stato === "pubblicato" && (scheda.pubblicazioni ?? []).length === 0) throw new ErroreHttp(400, "Un video pubblicato ha almeno una pubblicazione: aggiungila prima di cambiare lo stato.")
      await scrivi(join(cartellaVideo(slug), "scheda.json"), scheda)
      emetti({ tipo: "video", slug, cosa: "scheda" })
      return json({ ok: true })
    }
    if (azione === "piano" && metodo === "PUT") {
      const piano = await corpo<Piano>()
      await controllaPiano(slug, piano)
      await scriviPiano(slug, piano, true)
      return json({ ok: true, puo_annullare: statoDi(slug).passato.length > 0, puo_rifare: false })
    }
    if ((azione === "annulla" || azione === "rifai") && metodo === "POST") {
      const s = statoDi(slug)
      const da = azione === "annulla" ? s.passato : s.futuro
      const verso = azione === "annulla" ? s.futuro : s.passato
      const precedente = da.pop()
      if (precedente === undefined) throw new ErroreHttp(409, azione === "annulla" ? "Non c'è niente da annullare." : "Non c'è niente da rifare.")
      verso.push(await readFile(join(cartellaVideo(slug), "piano.json"), "utf8"))
      const piano = JSON.parse(precedente) as Piano
      await scriviPiano(slug, piano, false)
      return json({ ok: true, piano, puo_annullare: s.passato.length > 0, puo_rifare: s.futuro.length > 0 })
    }
    if (azione === "lavori" && metodo === "POST") {
      const { comando } = await corpo<{ comando: string }>()
      if (!["prepara", "risolvi", "monta", "controlla", "carosello"].includes(comando)) throw new ErroreHttp(400, "Il comando non è tra quelli che si possono mettere in coda.")
      const carosello = (await leggi<Scheda>(join(cartellaVideo(slug), "scheda.json"))).formato === "carosello"
      if (comando === "carosello" && !carosello) throw new ErroreHttp(409, "Questo video non è un carosello: nella scheda manca «formato»: «carosello».")
      if (comando !== "carosello" && carosello) throw new ErroreHttp(409, "Questo è un carosello: non ha piano né montato, le sue slide le rende il comando «carosello».")
      if (comando === "monta" && !existsSync(join(cartellaVideo(slug), "piano.json"))) throw new ErroreHttp(400, "Questo video non ha ancora un piano da montare.")
      return json({ id: mettiInCoda({ slug, comando }) }, 202)
    }
  }

  if (percorso === "/api/grezzo" && metodo === "GET") return json(await grezzoElenco())
  if (percorso === "/api/grezzo/parole") {
    const file = url.searchParams.get("file") ?? ""
    const lista = await leggiSe<ParolaGrezzo[]>(join(ARCHIVIO, "preparati", file, "parole.json"))
    if (!lista) throw new ErroreHttp(404, "Questo file non è ancora stato preparato: preparalo per avere le parole.")
    return json(lista)
  }
  if (percorso === "/api/grezzo/scheda" && metodo === "PUT") {
    const file = url.searchParams.get("file") ?? ""
    if (!existsSync(join(ARCHIVIO, "grezzo", file))) throw new ErroreHttp(404, "Questo file non è nel girato.")
    await scrivi(join(ARCHIVIO, "grezzo", `${file}.scheda.json`), await corpo())
    emetti({ tipo: "grezzo" })
    return json({})
  }
  if (percorso === "/api/grezzo/prepara" && metodo === "POST") {
    const { file } = await corpo<{ file: string; sagoma: boolean }>()
    if (!existsSync(join(ARCHIVIO, "grezzo", file))) throw new ErroreHttp(404, "Questo file non è nel girato.")
    return json({ id: mettiInCoda({ slug: null, comando: "prepara-file", file }) }, 202)
  }

  if (percorso === "/api/stile" && metodo === "GET") return json(await stileAttuale())
  if (percorso === "/api/stile" && metodo === "PUT") {
    const nuovo = await corpo<Stile>()
    for (const slug of await slugs()) {
      const eff = await effettivoDi(slug).catch(() => null)
      const usati = [eff?.quadro, ...(eff?.scene ?? []).map((s) => s.quadro)].filter((q): q is string => q !== undefined)
      const mancante = usati.find((q) => !nuovo.quadri[q])
      if (mancante) throw new ErroreHttp(400, `Il quadro «${mancante}» è usato dal video «${slug}»: non si può togliere.`)
    }
    await scrivi(join(ARCHIVIO, "stile.json"), nuovo)
    emetti({ tipo: "stile" })
    return json({})
  }
  if (percorso === "/api/macchina" && metodo === "GET") return json((await leggiSe<{ macchina: object }>(join(ARCHIVIO, "profilo.json")))?.macchina ?? {})
  if (percorso === "/api/motori" && metodo === "GET") return json((await leggiSe<{ motori: Motori }>(join(ARCHIVIO, "profilo.json")))?.motori ?? {})
  if (percorso === "/api/motori" && metodo === "PUT") {
    const nuovi = await corpo<Motori>()
    const dove = Object.values(nuovi).flatMap((f) => (f.dove === undefined ? [] : [f.dove]))
    if (dove.some((d) => d !== "scheda" && d !== "processore")) throw new ErroreHttp(400, "I motori non sono validi: dove deve essere uno fra: scheda, processore")
    await scrivi(join(ARCHIVIO, "profilo.json"), { versione: 1, motori: nuovi })
    emetti({ tipo: "profilo" })
    return json(nuovi)
  }
  if (percorso === "/api/animazioni") {
    const risultato: Record<string, AnimazioneDisponibile[]> = {}
    for (const slug of await slugs()) {
      const eff = await effettivoDi(slug).catch(() => null)
      const sigle = [...new Set([...(eff?.scene ?? []).flatMap((s) => (s.animazione ? [s.animazione] : [])), ...(eff ? ["c4"] : [])])]
      risultato[slug] = sigle.map((sigla) => ({ sigla, titolo: `Scena ${sigla}`, durata: 6 }))
    }
    return json(risultato)
  }
  if (percorso === "/api/lavori" && metodo === "GET") return json({ in_corso: inCorso, in_coda: coda.map((c) => ({ id: c.id, slug: c.slug, comando: c.comando, file: c.file ?? null, accodato: new Date(c.accodato).toISOString(), stima: c.comando === "monta" ? 240 : null })), finiti })
  const lavoro = /^\/api\/lavori\/([^/]+)$/.exec(percorso)
  if (lavoro && metodo === "DELETE") {
    const id = decodeURIComponent(lavoro[1]!)
    const posto = coda.findIndex((c) => c.id === id)
    if (posto >= 0) coda.splice(posto, 1)
    else if (inCorso?.id === id) fermato = true
    else throw new ErroreHttp(404, "Questo lavoro non c'è più: è già finito.")
    emetti({ tipo: "lavori" })
    return json({})
  }
  if (percorso === "/api/arrivi" || percorso === "/api/arrivi/controlla") {
    const stato: StatoArrivi = { in_ascolto: true, indirizzo: "192.168.1.20:47420", qr: QR, errore: null, ultimi: [{ file: "2026-10-06/20261006-222801-prova-a.mp4", quando: "2026-10-06T22:28:01", byte: 412_000 }], firewall: "consentito", pronto: true, motivo: null, guarda: "http://192.168.1.20:47420/guarda?chiave=prova", qr_guarda: QR, carica: "http://192.168.1.20:47420/carica?chiave=prova", qr_carica: QR }
    return json(stato)
  }
  if (percorso === "/api/registrazione" && metodo === "GET") {
    const stato: StatoRegistrazione = { disponibile: true, motivo: null, dispositivi: { microfoni: ["Microfono"], camere: ["Webcam"] }, in_corso: null, ultima: null }
    return json(stato)
  }
  if (percorso === "/api/consumi" && metodo === "GET") return json(CONSUMI)
  if (percorso === "/api/canale/tiktok" && metodo === "GET") return json(CANALE)
  // Classifica, strategia e commenti non ancora letti: le viste mostrano cosa chiedere nella chat.
  if (percorso === "/api/canale/tiktok/classifica" && metodo === "GET") return json({ quando: null, io: null, quando_io: null, come: [], righe: [] })
  if (percorso === "/api/canale/tiktok/crescita" && metodo === "GET") return json({ quando: null })
  if (percorso === "/api/canale/tiktok/andamento" && metodo === "GET") return json([])
  if (percorso === "/api/canale/tiktok/messaggi" && metodo === "GET") return json({ quando: "2026-11-03T10:00:00", conversazioni: [] })
  if (percorso === "/api/canale/tiktok/commenti" && metodo === "GET") return json({ quando: "2026-11-03T10:00:00", video: url.searchParams.get("video") ?? "", commenti: [], nuovi: [] })
  if (percorso === "/api/apri" && metodo === "POST") {
    console.log("apri", await corpo())
    return json({})
  }

  if (percorso.startsWith("/media/") || percorso.startsWith("/font/")) {
    const radice = percorso.startsWith("/media/") ? ARCHIVIO : join(RADICE_REPO, "font")
    const relativo = decodeURIComponent(percorso.replace(/^\/(media|font)\//, ""))
    const file = normalize(join(radice, relativo))
    if (!file.startsWith(radice + sep) || !existsSync(file)) return json({ errore: "Questo file non c'è nell'archivio." }, 404)
    const dati = Bun.file(file)
    const intervallo = /^bytes=(\d*)-(\d*)$/.exec(richiesta.headers.get("range") ?? "")
    if (!intervallo) return new Response(dati, { headers: { "Accept-Ranges": "bytes" } })
    const grandezza = dati.size
    const da = intervallo[1] ? Number(intervallo[1]) : Math.max(grandezza - Number(intervallo[2]), 0)
    const a = intervallo[1] && intervallo[2] ? Math.min(Number(intervallo[2]), grandezza - 1) : grandezza - 1
    return new Response(dati.slice(da, a + 1), { status: 206, headers: { "Content-Range": `bytes ${da}-${a}/${grandezza}`, "Accept-Ranges": "bytes", "Content-Length": String(a - da + 1), "Content-Type": dati.type } })
  }

  if (percorso.startsWith("/api/")) return json({ errore: "Questa rotta non esiste." }, 404)
  const richiesto = normalize(join(DIST, percorso === "/" ? "index.html" : percorso))
  const file = richiesto.startsWith(DIST) && existsSync(richiesto) && extname(richiesto) !== "" ? richiesto : join(DIST, "index.html")
  if (!existsSync(file)) return json({ errore: "L'interfaccia non è stata costruita: lancia la build." }, 404)
  return new Response(Bun.file(file))
}

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: PORTA,
  idleTimeout: 120,
  async fetch(richiesta) {
    try {
      return await porta(richiesta)
    } catch (e) {
      if (e instanceof ErroreHttp) return json({ errore: e.message, ...(e.problemi.length > 1 ? { problemi: e.problemi } : {}) }, e.stato)
      console.error(e)
      return json({ errore: e instanceof Error ? e.message : "Errore del finto server." }, 500)
    }
  },
})

console.log(`Finto server su http://127.0.0.1:${server.port}, archivio ${ARCHIVIO}`)
