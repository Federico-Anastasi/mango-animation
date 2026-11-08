// L'archivio di esempio per provare l'interfaccia senza il server vero: tre file di girato sintetici di pochi
// secondi (fatti con ffmpeg), le loro copie preparate, otto video in tutti gli stati. Sta in una cartella
// temporanea fuori da git e pesa pochi megabyte.
//   bun run verifica/genera-archivio.ts [cartella]
import { existsSync } from "node:fs"
import { copyFile, link, mkdir, readFile, rm, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import type { Controllo, Piano, Scheda, SchedaGrezzo, Stile } from "../src/tipi"
import { FILE_PROVA, type FileProva } from "./dati-prova"
import { risolvi } from "./risolvi-finto"

export const CARTELLA_PREDEFINITA = join(tmpdir(), "mango-animation-archivio-prova")
const RADICE_REPO = resolve(import.meta.dir, "..", "..")

async function ffmpeg(...argomenti: string[]): Promise<void> {
  const processo = Bun.spawn(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", ...argomenti], { stdout: "ignore", stderr: "pipe" })
  const errore = await new Response(processo.stderr).text()
  if ((await processo.exited) !== 0) throw new Error(`ffmpeg non è riuscito (${argomenti.join(" ")}): ${errore}`)
}

const scrivi = async (percorso: string, contenuto: unknown) => {
  await mkdir(dirname(percorso), { recursive: true })
  await writeFile(percorso, typeof contenuto === "string" || contenuto instanceof Uint8Array ? contenuto : `${JSON.stringify(contenuto, null, 2)}\n`)
}

/** L'espressione del volume: voce dove ci sono parole, silenzio altrove. */
const voce = (f: FileProva) => f.parole.map((w) => `between(t,${w.da - 0.03},${w.a + 0.03})`).join("+")

async function creaFile(radice: string, f: FileProva): Promise<void> {
  const grezzo = join(radice, "grezzo", f.file)
  const prep = join(radice, "preparati", f.file)
  await mkdir(dirname(grezzo), { recursive: true })
  await mkdir(prep, { recursive: true })
  const sorgente =
    f.tipo === "diretta"
      ? `testsrc2=size=${f.largo}x${f.alto}:rate=30:duration=${f.durata}[fondo];smptebars=size=${f.webcam![2]}x${f.webcam![3]}:rate=30:duration=${f.durata}[cam];[fondo][cam]overlay=${f.webcam![0]}:${f.webcam![1]}[v]`
      : `${f.file.includes("prova-a") ? "testsrc2" : "testsrc"}=size=${f.largo}x${f.alto}:rate=30:duration=${f.durata}[v]`
  await ffmpeg("-filter_complex", `${sorgente};aevalsrc='0.5*sin(2*PI*${f.tono}*t)*(${voce(f)})':s=16000:d=${f.durata}[a]`, "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "34", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "40k", grezzo)

  const lato = f.largo >= f.alto ? "scale=720:-2" : "scale=-2:720"
  await ffmpeg("-i", grezzo, "-vf", lato, "-c:v", "libx264", "-preset", "ultrafast", "-crf", "34", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "40k", join(prep, "leggero.mp4"))
  await ffmpeg("-i", grezzo, "-frames:v", "1", "-vf", "scale=240:-2", join(prep, "miniatura.jpg"))
  await scrivi(join(prep, "parole.json"), f.parole)

  const onda = new Uint8Array(Math.ceil(f.durata * 100))
  for (let i = 0; i < onda.length; i++) {
    const t = i / 100
    onda[i] = f.parole.some((w) => t >= w.da && t <= w.a) ? 150 + ((i * 37) % 100) : 3 + ((i * 7) % 5)
  }
  await scrivi(join(prep, "onda.bin"), onda)

  if (f.tipo === "ripresa") {
    const [l, a] = [Math.round((f.largo * 720) / f.alto / 2) * 2, 720]
    const cx = `${l * 0.4}+8*sin(T*2)`
    const testa = `lt(pow((X-(${cx}))/${l * 0.1},2)+pow((Y-${a * 0.3})/${a * 0.08},2),1)`
    const spalle = `lt(pow((X-(${cx}))/${l * 0.3},2)+pow((Y-${a * 0.62})/${a * 0.18},2),1)+gte(Y,${a * 0.62})*lt(abs(X-(${cx})),${l * 0.3})`
    await ffmpeg(
      "-f",
      "lavfi",
      "-i",
      `color=c=black@0.0:s=${l}x${a}:r=30:d=${f.durata},format=yuva420p,geq=lum='170':cb='90':cr='165':a='255*gt(${testa}+${spalle},0)'`,
      "-c:v",
      "libvpx-vp9",
      "-pix_fmt",
      "yuva420p",
      "-auto-alt-ref",
      "0",
      "-b:v",
      "0",
      "-crf",
      "42",
      "-deadline",
      "realtime",
      join(prep, "sagoma.webm"),
    )
  }

  const scheda: SchedaGrezzo = {
    tipo: f.tipo,
    origine: f.tipo === "diretta" ? "registrazione" : "telefono",
    arrivato: `${f.file.slice(0, 10)}T${f.tipo === "diretta" ? "21:05:12" : "22:28:01"}`,
    durata: f.durata,
    largo: f.largo,
    alto: f.alto,
    fps: 30,
    note: f.tipo === "diretta" ? "Diretta in cucina: la webcam è in alto a destra." : "",
  }
  await scrivi(`${grezzo}.scheda.json`, scheda)
}

/** Una foto arrivata dal telefono: il file (di una HEIC basta un segnaposto, il finto server non la decodifica), la scheda e le immagini che il motore ne ricava. */
async function creaFoto(radice: string, file: string, { intera }: { intera: boolean }): Promise<void> {
  const grezzo = join(radice, "grezzo", file)
  const prep = join(radice, "preparati", file)
  await mkdir(dirname(grezzo), { recursive: true })
  await mkdir(prep, { recursive: true })
  const disegno = "color=c=0xE4E2D9:s=540x720:d=1,drawbox=x=90:y=120:w=360:h=360:color=0x1F4B99:t=fill,drawbox=x=150:y=540:w=240:h=40:color=0xE03A1E:t=fill"
  if (file.endsWith(".HEIC")) await writeFile(grezzo, new Uint8Array(180_000))
  else await ffmpeg("-f", "lavfi", "-i", disegno, "-frames:v", "1", grezzo)
  await ffmpeg("-f", "lavfi", "-i", disegno, "-frames:v", "1", "-vf", "scale=240:-2", join(prep, "miniatura.jpg"))
  if (intera) await ffmpeg("-f", "lavfi", "-i", disegno, "-frames:v", "1", join(prep, "foto.jpg"))
  const scheda: SchedaGrezzo = { tipo: "ripresa", origine: "telefono", arrivato: `${file.slice(0, 10)}T18:12:40`, note: "" }
  await scrivi(`${grezzo}.scheda.json`, scheda)
}

function trova(f: FileProva, frase: string): { minuto: string; dice: string } {
  const parole = frase.split(" ")
  const i = f.parole.findIndex((_, k) => parole.every((p, j) => f.parole[k + j]?.p === p))
  if (i < 0) throw new Error(`La frase «${frase}» non è in ${f.file}.`)
  return { minuto: `${Math.floor(f.parole[i]!.da / 60)}:${String(Math.floor(f.parole[i]!.da % 60)).padStart(2, "0")}`, dice: frase }
}

function piani(): Record<string, Piano> {
  const [a, b, diretta] = FILE_PROVA as [FileProva, FileProva, FileProva]
  const sorgenteDiretta = {
    file: diretta.file,
    sfasamento: 0.479,
    riquadri: { webcam: diretta.webcam! },
    viste: { gara: { taglio: [160, 0, 960, 720] as [number, number, number, number], inserto: [10, 60, 400, 208] as [number, number, number, number] } },
  }
  return {
    "ricetta-in-diretta": {
      quadro: "schermo-e-viso",
      sorgenti: { diretta: sorgenteDiretta },
      scene: [
        { nome: "apertura", vista: "gara", pezzi: [{ sorgente: "diretta", ...trova(diretta, "allora ragazzi guardiamo il forno") }] },
        { nome: "gara", vista: "gara", pezzi: [{ sorgente: "diretta", ...trova(diretta, "si è bruciato di nuovo"), zoom: { scala: 1.4, centro: [0.5, 0.4] } }] },
        { nome: "chiusa", vista: "gara", pezzi: [{ sorgente: "diretta", ...trova(diretta, "ma stavolta di pochissimo") }, { sorgente: "diretta", da: 8.6, a: 12.6, vista: "gara" }] },
      ],
      sottotitoli: { modo: "parola per parola", nomi: [], correzioni: [], ritocchi: [] },
      titolo: { testo: "Una ricetta in tre mosse" },
      coda: 0.7,
    },
    "pasta-fresca": {
      quadro: "sagoma-su-animazione",
      sorgenti: { a: { file: a.file }, b: { file: b.file } },
      scene: [
        { nome: "c1", animazione: "c1", pezzi: [{ sorgente: "a", da: 0.1, a: 5.8, via: [[1.5, 1.8]] }], ancore: [["a", 2.2, 1.2]] },
        { nome: "c2", animazione: "c2", pezzi: [{ sorgente: "b", ...trova(b, "il segreto è la pazienza") }, { sorgente: "b", ...trova(b, "lievita in frigorifero"), zoom: { da: 1, a: 1.5, centro: [0.5, 0.35] } }] },
        { nome: "c3", animazione: "c3", quadro: "girato-pieno", pezzi: [{ sorgente: "a", ...trova(a, "solo farina fatta bene") }] },
      ],
      sottotitoli: { modo: "parola per parola", nomi: ["Impasto"], correzioni: [{ sorgente: "a", sentite: ["magia"], giuste: "*magia" }], ritocchi: [] },
      titolo: { testo: "Pasta fresca: tre ingredienti in cucina" },
      suoni: [{ file: "materiali/disco.wav", sorgente: "a", t: 0.8, picco: -16 }],
      coda: 0.7,
    },
    "animazioni-e-voce": {
      quadro: "solo-animazione",
      sorgenti: { a: { file: a.file } },
      scene: [
        { nome: "apertura", animazione: "c1", pezzi: [{ durata: 4 }] },
        { nome: "parlato", animazione: "c2", quadro: "sagoma-su-animazione", pezzi: [{ sorgente: "a", ...trova(a, "che batte il mio vecchio pane") }] },
        { nome: "chiusa", animazione: "c3", pezzi: [{ durata: 3 }, { durata: 2.5 }] },
      ],
      sottotitoli: { modo: "parola per parola", nomi: [], correzioni: [], ritocchi: [] },
      titolo: { testo: "Prima le animazioni, poi la voce" },
      suoni: [{ file: "disco.wav", scena: "apertura", t: 1, picco: -16 }],
      coda: 0.5,
    },
    "ricetta-intera": {
      quadro: "lungo-schermo",
      sorgenti: { diretta: { file: diretta.file, riquadri: { viso: diretta.webcam! } } },
      scene: [{ nome: "intero", pezzi: [{ sorgente: "diretta", ...trova(diretta, "si è bruciato di nuovo") }, { sorgente: "diretta", ...trova(diretta, "ora vi spiego come ho fatto") }] }],
      sottotitoli: { modo: "parola per parola" },
      titolo: { testo: "La ricetta per intero" },
      coda: 0.5,
    },
    "pane-veloce": {
      quadro: "girato-pieno",
      sorgenti: { a: { file: a.file } },
      scene: [{ nome: "tutto", pezzi: [{ sorgente: "a" }] }],
      sottotitoli: { modo: "a battute" },
      titolo: { testo: "Il pane in un'ora" },
      coda: 0.5,
    },
    "primo-video-pubblicato": {
      quadro: "schermo-pieno",
      sorgenti: { b: { file: b.file } },
      scene: [{ nome: "tutto", pezzi: [{ sorgente: "b" }] }],
      sottotitoli: { modo: "parola per parola" },
      coda: 0.5,
    },
    "variante-ricetta": {
      base: "ricetta-in-diretta",
      scene: [{ nome: "gara", vista: "gara", pezzi: [{ sorgente: "diretta", ...trova(diretta, "ma stavolta di pochissimo") }] }],
      titolo: { testo: "Di pochissimo" },
    },
  }
}

/** Video usciti a distanza di giorni da oggi, per la vista della produzione: i conti del lavoro di Claude sono in `finto-server.ts`. */
const USCITI_DA_GIORNI: Record<string, { titolo: string; giorni: number }> = {
  "pentole-nel-cassetto": { titolo: "Quante pentole stanno nel cassetto", giorni: 3 },
  "tre-forni-in-casa": { titolo: "Tre forni in casa", giorni: 9 },
  "cucina-di-casa": { titolo: "La cucina di casa, la guida", giorni: 17 },
  "torta-contro-tiramisu": { titolo: "La torta che batte il tiramisù", giorni: 26 },
  "dentro-una-torta": { titolo: "Cosa c'è dentro una torta", giorni: 45 },
}

function usciti(): Record<string, Scheda> {
  return Object.fromEntries(
    Object.entries(USCITI_DA_GIORNI).map(([slug, { titolo, giorni }]): [string, Scheda] => [
      slug,
      {
        titolo,
        stato: "pubblicato",
        creato: "2026-09-20",
        proposta: { aggancio: titolo, centro: "", chiusa: "" },
        pubblicazioni: [{ canale: "tiktok", data: new Date(Date.now() - giorni * 86_400_000).toISOString().slice(0, 16), url: `https://www.tiktok.com/@esempio/video/${slug}` }],
        note: "",
      },
    ]),
  )
}

const schede = (): Record<string, Scheda> => ({
  "ricetta-in-diretta": {
    titolo: "Una ricetta in tre mosse",
    stato: "in lavorazione",
    creato: "2026-10-08",
    serie: "ricette",
    proposta: { aggancio: "Un impasto con tre ingredienti ha battuto il mio vecchio pane.", centro: "Quanto serve per impastare davvero.", chiusa: "Voi quanti ingredienti usereste?", note: "Tutto dalla diretta dell'8 ottobre." },
    didascalia: "Tre ingredienti contro il mio pane. Ha vinto lui.",
    hashtag: ["cucina", "ricette", "impasti", "prove"],
    note: "",
  },
  "pasta-fresca": {
    titolo: "Pasta fresca: tre ingredienti in cucina",
    stato: "in lavorazione",
    creato: "2026-10-06",
    proposta: { aggancio: "Una pasta fresca con un uovo solo.", centro: "Come si fa a mano.", chiusa: "Cosa ci rimettete?", note: "" },
    didascalia: "Una pasta fresca con un uovo solo.",
    hashtag: ["cucina", "pasta", "impasti"],
    da_verificare: [
      { cosa: "Il numero di uova detto a voce", perche: "A schermo ne compare un altro.", stato: "aperto" },
      { cosa: "Il nome dell'impasto nella seconda scena", stato: "a posto" },
    ],
    note: "Le animazioni c2 e c3 sono da rendere.",
  },
  "animazioni-e-voce": {
    titolo: "Prima le animazioni, poi la voce",
    stato: "in lavorazione",
    creato: "2026-10-12",
    proposta: { aggancio: "Un video che comincia senza nessuno che parla.", centro: "Le animazioni portano il discorso, la voce arriva dopo.", chiusa: "Voi l'avreste guardato fino in fondo?" },
    note: "Due pezzi senza voce, uno con la voce in mezzo.",
  },
  "cena-fra-due-cucine": {
    titolo: "Una cena fra due cucine",
    stato: "proposta",
    creato: "2026-10-05",
    proposta: { aggancio: "Due cucine di casa che si passano i piatti.", centro: "Il tempo di cottura è il vero limite.", chiusa: "Perché non lo fanno tutti?", note: "Servono i tempi di cottura." },
    scaletta: [
      { apri: "Il timer del forno", fai: "Mostra la cottura nelle due cucine", spiega: "È il tempo che decide tutto" },
      { apri: "Il piano di lavoro", fai: "Avvia la cottura" },
      { apri: "La tabella dei tempi" },
    ],
    da_verificare: [{ cosa: "Il tempo misurato nelle due cucine", perche: "Non c'è ancora una misura datata.", stato: "aperto" }],
    note: "",
  },
  "pane-veloce": {
    titolo: "Il pane in un'ora",
    stato: "pronto",
    creato: "2026-10-04",
    proposta: { aggancio: "Un pane veloce nel forno di casa mia.", centro: "Cosa cambia quando è fatto in casa.", chiusa: "Voi cosa cuocereste?" },
    didascalia: "Il pane in un'ora, in casa mia.",
    hashtag: ["cucina", "pane"],
    note: "Approvato dal creator il 9 ottobre.",
  },
  "primo-video-pubblicato": {
    titolo: "Il primo video uscito",
    stato: "pubblicato",
    creato: "2026-09-28",
    serie: "inizio",
    canali: ["tiktok", "youtube"],
    proposta: { aggancio: "Ho tolto il lievito e il pane è rimasto piatto.", centro: "Cosa serve per farlo salire.", chiusa: "Voi cosa togliereste?" },
    didascalia: "Ho tolto il lievito, risparmiato tre quarti del tempo, e ottenuto un pane piatto.",
    hashtag: ["cucina", "pane", "sperimentare", "italiano"],
    pubblicazioni: [
      { canale: "tiktok", data: "2026-10-07T13:15", url: "https://www.tiktok.com/@esempio/video/1" },
      { canale: "youtube shorts", data: "2026-10-07T18:40", url: "https://youtube.com/shorts/esempio" },
    ],
    numeri: [
      { data: "2026-10-07", canale: "tiktok", visualizzazioni: 312, mi_piace: 24, commenti: 3, condivisioni: 1, salvati: 5 },
      { data: "2026-10-08", canale: "tiktok", visualizzazioni: 1240, mi_piace: 96, commenti: 11, condivisioni: 6, salvati: 20 },
      { data: "2026-10-09", canale: "tiktok", visualizzazioni: 1810, mi_piace: 130, commenti: 15, condivisioni: 9, salvati: 31 },
      { data: "2026-10-08", canale: "youtube shorts", visualizzazioni: 260, mi_piace: 18, commenti: 1 },
      { data: "2026-10-09", canale: "youtube shorts", visualizzazioni: 530, mi_piace: 33, commenti: 2 },
    ],
    note: "Uscito il 7 ottobre dopo il sì del creator.",
  },
  ...usciti(),
  "ricetta-intera": { titolo: "La ricetta per intero", stato: "proposta", creato: "2026-10-09", serie: "ricette", proposta: { aggancio: "Tutta la ricetta, senza tagli.", centro: "L'ultimo passaggio in forno.", chiusa: "" }, note: "Versione orizzontale per YouTube." },
  "variante-ricetta": { titolo: "Ricetta: di pochissimo", stato: "in lavorazione", creato: "2026-10-09", serie: "ricette", proposta: { aggancio: "Si è bruciato di pochissimo.", centro: "Il margine è la notizia.", chiusa: "" }, note: "" },
  "carosello-dispensa": {
    titolo: "COSA C'È NELLA TUA DISPENSA?",
    stato: "proposta",
    creato: "2026-10-25",
    formato: "carosello",
    proposta: { aggancio: "Cosa c'è nella tua dispensa?", centro: "Farina, sale, lievito, acqua.", chiusa: "Che farina hai?" },
  },
  "carosello-nuovo": { titolo: "Quanto sale serve davvero", stato: "proposta", creato: "2026-11-02", formato: "carosello", proposta: { aggancio: "Quanto sale serve davvero?", centro: "Una slide per caso.", chiusa: "Quanto ne usi tu?" } },
  "registrazione-guidata": {
    titolo: "Il segreto della sfoglia",
    stato: "in lavorazione",
    creato: "2026-10-27",
    proposta: { aggancio: "Conosci il segreto della sfoglia?", centro: "Spiegato da zero, un passaggio alla volta.", chiusa: "Quale altro trucco ti è sembrato geniale?" },
    note: "La prova per registrare: le scene con la battuta da dire.",
  },
  "idea-scartata": { titolo: "Dieci trucchi in cucina", stato: "scartato", creato: "2026-10-01", proposta: { aggancio: "Dieci trucchi.", centro: "", chiusa: "" }, note: "Scartata: è un elenco, non un lavoro fatto." },
  "proposta-ricetta-2": { titolo: "Ricetta: come ho fatto", stato: "proposta", creato: "2026-10-09", serie: "ricette", proposta: { aggancio: "Ora vi spiego come ho fatto a salvarlo.", centro: "Il passaggio che non vedevate.", chiusa: "Voi lo vedevate?" }, note: "" },
})

export async function generaArchivio(radice: string): Promise<void> {
  await rm(radice, { recursive: true, force: true })
  await mkdir(radice, { recursive: true })
  const stile: Stile = JSON.parse(await readFile(join(RADICE_REPO, "stile.json"), "utf8"))
  await scrivi(join(radice, "stile.json"), stile)

  for (const f of FILE_PROVA) await creaFile(radice, f)
  const paroleDi = (file: string) => FILE_PROVA.find((f) => f.file === file)?.parole ?? []
  const durataDi = (file: string) => FILE_PROVA.find((f) => f.file === file)?.durata ?? 0

  const aMano = join(radice, "grezzo", "2026-10-09", "messo-a-mano.mp4")
  await mkdir(dirname(aMano), { recursive: true })
  await ffmpeg("-f", "lavfi", "-i", "testsrc=size=320x568:rate=30:duration=3", "-f", "lavfi", "-i", "sine=f=300:d=3", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "36", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "32k", "-shortest", aMano)
  await creaFoto(radice, "2026-10-09/IMG_0042.HEIC", { intera: true })
  await creaFoto(radice, "2026-10-09/IMG_0043.JPG", { intera: false })
  await ffmpeg("-f", "lavfi", "-i", "testsrc2=size=270x480:rate=30:duration=12", "-f", "lavfi", "-i", "sine=f=523:d=12", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "36", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "32k", "-shortest", join(radice, "finale-generico.mp4"))
  await ffmpeg("-f", "lavfi", "-i", "color=c=0xF1F0EB:s=360x640:r=30:d=7[f];color=c=0x1F4B99:s=120x120:r=30:d=7[q];color=c=0x17171B:s=320x6:r=30:d=7[l];[f][q]overlay=x='20+40*t':y=180[a];[a][l]overlay=x=20:y=420", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "30", "-pix_fmt", "yuv420p", join(radice, "animazione-c1.mp4"))
  await ffmpeg("-f", "lavfi", "-i", "color=c=0xE4E2D9:s=480x480:d=1", "-frames:v", "1", join(radice, "disegno-a.png"))
  await ffmpeg("-f", "lavfi", "-i", "color=c=0x1F4B99:s=480x480:d=1,drawbox=x=60:y=60:w=360:h=360:color=0xE03A1E:t=24", "-frames:v", "1", join(radice, "disegno-b.png"))
  await ffmpeg("-f", "lavfi", "-i", "sine=f=880:d=0.3", join(radice, "disco.wav"))

  const pianiDati = piani()
  const tutte = schede()
  const ora = Date.now()

  for (const [slug, scheda] of Object.entries(tutte)) {
    const cartella = join(radice, "video", slug)
    await scrivi(join(cartella, "scheda.json"), scheda)
    const piano = pianiDati[slug]
    if (!piano) continue
    await scrivi(join(cartella, "piano.json"), piano)
    const base = piano.base ? risolvi(pianiDati[piano.base]!, null, { stile, parole: paroleDi, durata: durataDi }).effettivo : null
    const { risolto } = risolvi(piano, base, { stile, parole: paroleDi, durata: durataDi })
    await scrivi(join(cartella, "lavoro", "risolto.json"), risolto)
  }

  const conUscite = ["ricetta-in-diretta", "pasta-fresca", "pane-veloce", "primo-video-pubblicato"]
  for (const slug of conUscite) {
    const finale = join(radice, "video", slug, "uscite", "finale.mp4")
    await mkdir(dirname(finale), { recursive: true })
    await copyFile(join(radice, "finale-generico.mp4"), finale)
    await scrivi(join(radice, "video", slug, "uscite", "finale.srt"), "1\n00:00:00,200 --> 00:00:01,500\nCiao a tutti\n")
    const quando = new Date(ora - (slug === "ricetta-in-diretta" ? 2 : 1) * 3600_000)
    await utimes(finale, quando, quando)
    if (slug !== "ricetta-in-diretta") {
      const pianoVecchio = join(radice, "video", slug, "piano.json")
      if (existsSync(pianoVecchio)) await utimes(pianoVecchio, new Date(ora - 3 * 3600_000), new Date(ora - 3 * 3600_000))
    }
  }
  await copyFile(join(radice, "finale-generico.mp4"), join(radice, "video", "primo-video-pubblicato", "uscite", "leggero.mp4"))
  const pane = join(radice, "video", "pane-veloce")
  await copyFile(join(radice, "disegno-b.png"), join(pane, "uscite", "copertina.png"))
  // Come il montaggio vero: la copertina è dentro il montato, e con-copertina.mp4 è un secondo nome dello stesso file.
  await link(join(pane, "uscite", "finale.mp4"), join(pane, "uscite", "con-copertina.mp4"))
  // E un montato di prima, con la copertina di un montaggio più vecchio rimasta accanto.
  const vecchia = join(radice, "video", "ricetta-in-diretta", "uscite", "con-copertina.mp4")
  await copyFile(join(radice, "finale-generico.mp4"), vecchia)
  await utimes(vecchia, new Date(ora - 30 * 3600_000), new Date(ora - 30 * 3600_000))
  await mkdir(join(pane, "materiali"), { recursive: true })
  await copyFile(join(radice, "disegno-a.png"), join(pane, "materiali", "sfondo.png"))
  await copyFile(join(radice, "disegno-b.png"), join(pane, "materiali", "schema.png"))
  const slide = join(radice, "video", "carosello-dispensa", "uscite")
  await mkdir(slide, { recursive: true })
  for (const [n, colore] of [[1, "0x17171B"], [2, "0x1F4B99"], [3, "0xE03A1E"]] as const)
    await ffmpeg("-f", "lavfi", "-i", `color=c=${colore}:s=270x480:d=1,drawbox=x=30:y=60:w=210:h=40:color=0xF1F0EB:t=fill`, "-frames:v", "1", join(slide, `slide-${n}.png`))
  for (const [slug, colore] of [["cena-fra-due-cucine", "0xF1F0EB"], ["proposta-ricetta-2", "0xFFFFFF"]] as const) {
    const cartella = join(radice, "video", slug, "materiali")
    await mkdir(cartella, { recursive: true })
    await ffmpeg("-f", "lavfi", "-i", `color=c=${colore}:s=270x480:d=1,drawbox=x=27:y=170:w=48:h=5:color=0xD32F2F:t=fill,drawbox=x=27:y=200:w=210:h=22:color=0x111111:t=fill,drawbox=x=27:y=232:w=150:h=22:color=0x111111:t=fill,drawbox=x=27:y=275:w=190:h=12:color=0x6B6B6B:t=fill`, "-frames:v", "1", join(cartella, "anteprima.png"))
  }
  const prova = join(radice, "video", "registrazione-guidata", "uscite")
  await mkdir(prova, { recursive: true })
  await copyFile(join(radice, "animazione-c1.mp4"), join(prova, "prova.mp4"))
  await ffmpeg("-ss", "3", "-i", join(prova, "prova.mp4"), "-frames:v", "1", "-vf", "scale=-2:360", join(prova, "prova.jpg"))
  const pasta = join(radice, "video", "pasta-fresca")
  await mkdir(join(pasta, "materiali"), { recursive: true })
  await copyFile(join(radice, "disco.wav"), join(pasta, "materiali", "disco.wav"))
  await mkdir(join(pasta, "lavoro", "scene"), { recursive: true })
  await copyFile(join(radice, "animazione-c1.mp4"), join(pasta, "lavoro", "scene", "c1.mp4"))
  // Le misure della testa come le scrive il motore (`lavoro/teste.json`): la seconda ripresa ha la testa più in basso, quindi decide la scala.
  const [prima, seconda] = FILE_PROVA as [FileProva, FileProva]
  await scrivi(join(pasta, "lavoro", "teste.json"), { [prima.file]: { sagoma: {}, intervalli: [[0, 6]], cima: 420, centri: [430, 436, 433] }, [seconda.file]: { sagoma: {}, intervalli: [[0, 8]], cima: 520, centri: [420, 428, 424] } })
  const conSenzaVoce = join(radice, "video", "animazioni-e-voce")
  await mkdir(join(conSenzaVoce, "materiali"), { recursive: true })
  await copyFile(join(radice, "disco.wav"), join(conSenzaVoce, "materiali", "disco.wav"))
  await mkdir(join(conSenzaVoce, "lavoro", "scene"), { recursive: true })
  for (const sigla of ["c1", "c3"]) await copyFile(join(radice, "animazione-c1.mp4"), join(conSenzaVoce, "lavoro", "scene", `${sigla}.mp4`))

  const controlloPasta: Controllo = {
    quando: new Date(ora - 2 * 3600_000).toISOString(),
    del_finale: new Date(ora - 2 * 3600_000 - 600_000).toISOString(),
    durata: 24.6,
    silenzi: [{ a: 12.3, dura: 0.41 }, { a: 18.7, dura: 0.52 }],
    parole_fuori_posto: [{ parola: "batte", attesa: [6.1, 6.4], trovata: [6.9, 7.2], voto: 0.4 }],
    sentito: "ciao a tutti oggi vi mostro un impasto semplice che batte il mio vecchio pane tre ingredienti e niente magia",
    differenze: [{ a: 9.2, voluto: "e niente magia", sentito: "e niente maggia" }],
    tagli_nel_parlato: [{ a: 8.1, db: -31 }],
  }
  await scrivi(join(pasta, "lavoro", "controllo.json"), controlloPasta)
  const controlloPane: Controllo = { quando: new Date(ora - 1800_000).toISOString(), del_finale: new Date(ora - 3600_000).toISOString(), durata: 10.4, silenzi: [], parole_fuori_posto: [], sentito: "ciao a tutti oggi vi mostro un impasto semplice", differenze: [], tagli_nel_parlato: [] }
  await scrivi(join(pane, "lavoro", "controllo.json"), controlloPane)

  await scrivi(join(radice, "arrivi", "registro.jsonl"), "")
}

if (import.meta.main) {
  const cartella = resolve(process.argv[2] ?? CARTELLA_PREDEFINITA)
  await generaArchivio(cartella)
  console.log(`Archivio di prova in ${cartella}`)
}
