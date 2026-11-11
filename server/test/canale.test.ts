import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { contatori } from "../src/disco"
import { aspetta, ascolta, avviaAmbiente, chiama, fermaTutti, scriviVideo, type Cartelle } from "./aiuti"

afterEach(fermaTutti)

const commento = (id: string, testo = "ciao") => ({ id, autore: "marco", testo, quando_scritto: "2026-10-08T10:00", mi_piace: 0, risposta_a: null, del_creator: false })
const messaggio = (da: "lui" | "creator", testo: string, quando = "2026-10-08T10:00") => ({ da, testo, quando_scritto: quando })

const scriviFile = async (a: Cartelle, lettura: string, relativo: string, contenuto: unknown, canale = "tiktok"): Promise<void> => {
  const percorso = join(a.archivio, "canali", canale, "letture", lettura, relativo)
  await mkdir(join(percorso, ".."), { recursive: true })
  await writeFile(percorso, typeof contenuto === "string" ? contenuto : JSON.stringify(contenuto))
}

const PRIMA = "2026-10-08-1000"
const DOPO = "2026-10-09-1830"

/** Due letture finte: la seconda ha un video nuovo, un commento nuovo, un messaggio nuovo e una conversazione nuova. */
async function dueLetture(a: Cartelle, canale = "tiktok"): Promise<void> {
  const f = (lettura: string, relativo: string, contenuto: unknown) => scriviFile(a, lettura, relativo, contenuto, canale)
  await f(PRIMA, "profilo.json", { quando: "2026-10-08T10:00:00", nome: "mio_canale", follower: 100, seguiti: 5, mi_piace: 1000, video: 2 })
  await f(PRIMA, "video.json", {
    quando: "2026-10-08T10:00:00",
    video: [
      { id: "111", url: "https://t/111", slug: "orto", visualizzazioni: 1000, mi_piace: 50, commenti: 2, condivisioni: 1 },
      { id: "222", url: "https://t/222", slug: null, visualizzazioni: 200, mi_piace: 10, commenti: 0 },
    ],
  })
  await f(PRIMA, "commenti/111.json", { quando: "2026-10-08T10:00:00", video: "111", commenti: [commento("c1"), commento("c2")] })
  await f(PRIMA, "messaggi.json", { quando: "2026-10-08T10:00:00", conversazioni: [{ con: "marco", messaggi: [messaggio("lui", "ciao"), messaggio("creator", "ciao a te")] }] })
  await f(PRIMA, "esito.json", { quando: "2026-10-08T10:01:00", completa: true, mancano: [] })

  await f(DOPO, "profilo.json", { quando: "2026-10-09T18:30:00", nome: "mio_canale", follower: 120, seguiti: 5, mi_piace: 1100, video: 3 })
  await f(DOPO, "video.json", {
    quando: "2026-10-09T18:30:00",
    video: [
      { id: "111", url: "https://t/111", slug: "orto", visualizzazioni: 1500, mi_piace: 70, commenti: 3 },
      { id: "222", url: "https://t/222", slug: null, visualizzazioni: 250, mi_piace: 10, commenti: 0 },
      { id: "333", url: "https://t/333", slug: null, visualizzazioni: 40 },
    ],
  })
  await f(DOPO, "commenti/111.json", { quando: "2026-10-09T18:30:00", video: "111", commenti: [commento("c1"), commento("c2"), commento("c3", "nuovo")] })
  await f(DOPO, "messaggi.json", {
    quando: "2026-10-09T18:30:00",
    conversazioni: [
      { con: "marco", messaggi: [messaggio("lui", "ciao"), messaggio("creator", "ciao a te"), messaggio("lui", "e il video?", "2026-10-09T09:00")] },
      { con: "anna", messaggi: [messaggio("lui", "bello")] },
    ],
  })
  await f(DOPO, "esito.json", { quando: "2026-10-09T18:31:00", completa: false, mancano: ["messaggi: la seconda pagina non si è aperta"] })
}

const conLetture = () =>
  avviaAmbiente({}, async (c) => {
    await dueLetture(c)
    await scriviVideo(c, "orto")
  })

interface Vista {
  ultima: { lettura: string; quando: string } | null
  letture: { lettura: string; quando: string; completa: boolean; mancano: string[] }[]
  profilo: Record<string, unknown> | null
  video: { id: string; commenti_letti: number; variazione: { visualizzazioni: number | null; mi_piace: number | null; commenti: number | null } | null }[]
}

describe("GET /api/canale/:canale", () => {
  test("l'ultima lettura, l'elenco, il profilo e i video dell'ultima lettura riuscita, con commenti letti e variazione", async () => {
    const a = await conLetture()
    const r = await chiama<Vista>(a, "GET", "/api/canale/tiktok")
    expect(r.stato).toBe(200)
    expect(r.corpo.ultima).toEqual({ lettura: DOPO, quando: "2026-10-09T18:31:00" })
    expect(r.corpo.letture).toEqual([
      { lettura: DOPO, quando: "2026-10-09T18:31:00", completa: false, mancano: ["messaggi: la seconda pagina non si è aperta"] },
      { lettura: PRIMA, quando: "2026-10-08T10:01:00", completa: true, mancano: [] },
    ])
    expect(r.corpo.profilo).toMatchObject({ follower: 120, mi_piace: 1100 })
    expect(r.corpo.video.map((v) => v.id)).toEqual(["111", "222", "333"])
    expect(r.corpo.video[0]).toMatchObject({ id: "111", slug: "orto", visualizzazioni: 1500, commenti_letti: 3, variazione: { visualizzazioni: 500, mi_piace: 20, commenti: 1 } })
    expect(r.corpo.video[1]).toMatchObject({ commenti_letti: 0, variazione: { visualizzazioni: 50, mi_piace: 0, commenti: 0 } })
    expect(r.corpo.video[2]).toMatchObject({ id: "333", commenti_letti: 0, variazione: null })
  })

  test("un campo che manca in una delle due letture dà una variazione null per quel campo", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await dueLetture(c)
      await scriviFile(c, DOPO, "video.json", { video: [{ id: "111", visualizzazioni: 1500 }] })
    })
    const r = await chiama<Vista>(a, "GET", "/api/canale/tiktok")
    expect(r.corpo.video[0]!.variazione).toEqual({ visualizzazioni: 500, mi_piace: null, commenti: null })
  })

  test("un canale senza letture è vuoto, non un errore; un nome scritto male è 404", async () => {
    const a = await conLetture()
    expect((await chiama(a, "GET", "/api/canale/youtube")).corpo).toEqual({ ultima: null, letture: [], profilo: null, video: [] })
    expect((await chiama(a, "GET", "/api/canale/Tik%20Tok")).stato).toBe(404)
    expect((await chiama(a, "GET", "/api/canale/tiktok/altro")).stato).toBe(404)
    expect((await chiama(a, "POST", "/api/canale/tiktok")).stato).toBe(405)
  })

  test("se l'ultima lettura non ha il profilo o i video, profilo e video sono quelli dell'ultima riuscita", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await dueLetture(c)
      await scriviFile(c, "2026-10-10-0900", "esito.json", { quando: "2026-10-10T09:00:00", completa: false, mancano: ["profilo: TikTok ha chiesto il captcha"] })
    })
    const r = await chiama<Vista>(a, "GET", "/api/canale/tiktok")
    expect(r.corpo.ultima?.lettura).toBe("2026-10-10-0900")
    expect(r.corpo.letture).toHaveLength(3)
    expect(r.corpo.profilo).toMatchObject({ follower: 120 })
    expect(r.corpo.video[0]).toMatchObject({ id: "111", variazione: { visualizzazioni: 500 } })
  })
})

describe("GET /api/canale/:canale/andamento", () => {
  test("una voce per lettura, dalla più vecchia", async () => {
    const a = await conLetture()
    expect((await chiama<unknown>(a, "GET", "/api/canale/tiktok/andamento")).corpo).toEqual([
      { quando: "2026-10-08T10:01:00", follower: 100, mi_piace: 1000, video: 2 },
      { quando: "2026-10-09T18:31:00", follower: 120, mi_piace: 1100, video: 3 },
    ])
    expect((await chiama<unknown>(a, "GET", "/api/canale/youtube/andamento")).corpo).toEqual([])
  })
})

interface Classifica {
  quando: string | null
  io: string | null
  quando_io: string | null
  come: string[]
  righe: { posto: number; nome: string; cosa_fa: string; follower: number; mi_piace: number; visualizzazioni: number; punteggio: number }[]
}

const scriviClassifica = async (a: Cartelle, contenuto: unknown, canale = "tiktok"): Promise<void> => {
  const percorso = join(a.archivio, "canali", canale, "classifica.json")
  await mkdir(join(percorso, ".."), { recursive: true })
  await writeFile(percorso, typeof contenuto === "string" ? contenuto : JSON.stringify(contenuto))
}

const profilo = (nome: string, follower: number, mi_piace: number, visualizzazioni: number) => ({ nome, follower, mi_piace, visualizzazioni, cosa_fa: `cosa fa ${nome}` })
const CLASSIFICA = {
  quando: "2026-10-08",
  io: "mio_canale",
  quanti: 3,
  video_della_mediana: 2,
  come: ["Vengono da una ricerca."],
  profili: [profilo("grande", 5000, 90000, 800), profilo("visto", 300, 2000, 9000), profilo("mio_canale", 10, 20, 30), profilo("piccolo", 50, 500, 100)],
}

describe("GET /api/canale/:canale/classifica", () => {
  test("il punteggio è la somma delle tre posizioni; la mia riga ha i numeri dell'ultima lettura riuscita", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await dueLetture(c)
      await scriviClassifica(c, CLASSIFICA)
    })
    const r = (await chiama<Classifica>(a, "GET", "/api/canale/tiktok/classifica")).corpo
    expect(r).toMatchObject({ quando: "2026-10-08", io: "mio_canale", quando_io: "2026-10-09T18:31:00", come: ["Vengono da una ricerca."] })
    // «mio_canale» nell'ultima lettura: 120 follower, 1.100 mi piace, mediana degli ultimi due video con il numero (1500, 250) = 875
    expect(r.righe).toEqual([
      { posto: 1, nome: "grande", cosa_fa: "cosa fa grande", follower: 5000, mi_piace: 90000, visualizzazioni: 800, punteggio: 5 },
      { posto: 2, nome: "visto", cosa_fa: "cosa fa visto", follower: 300, mi_piace: 2000, visualizzazioni: 9000, punteggio: 5 },
      { posto: 3, nome: "mio_canale", cosa_fa: "cosa fa mio_canale", follower: 120, mi_piace: 1100, visualizzazioni: 875, punteggio: 8 },
    ])
  })

  test("senza una lettura del canale la mia riga resta quella scritta nel file, con la sua data", async () => {
    const a = await avviaAmbiente({}, (c) => scriviClassifica(c, CLASSIFICA))
    const r = (await chiama<Classifica>(a, "GET", "/api/canale/tiktok/classifica")).corpo
    expect(r.quando_io).toBe("2026-10-08")
    expect(r.righe.map((x) => [x.nome, x.punteggio])).toEqual([["grande", 4], ["visto", 5], ["piccolo", 9]])
  })

  test("un canale senza classifica risponde vuoto, non con un errore", async () => {
    const a = await conLetture()
    expect((await chiama<Classifica>(a, "GET", "/api/canale/tiktok/classifica")).corpo).toEqual({ quando: null, io: null, quando_io: null, come: [], righe: [] })
    expect((await chiama(a, "GET", "/api/canale/Tik Tok/classifica")).stato).toBe(404)
  })
})

const scriviCrescita = async (a: Cartelle, contenuto: unknown, canale = "tiktok"): Promise<void> => {
  const percorso = join(a.archivio, "canali", canale, "crescita.json")
  await mkdir(join(percorso, ".."), { recursive: true })
  await writeFile(percorso, typeof contenuto === "string" ? contenuto : JSON.stringify(contenuto))
}

const CRESCITA = {
  quando: "2026-10-25",
  partenza: { data: "2026-10-25", follower: 626 },
  obiettivo: "atteso",
  scenari: [
    { nome: "prudente", tappe: [{ data: "2027-01-25", follower: 1400 }] },
    { nome: "atteso", tappe: [{ data: "2027-01-25", follower: 2000 }] },
  ],
  settimana: [{ giorno: "mercoledì", cosa: "lettura del canale e controllo", controllo: true }],
  tipi: [{ nome: "le mie prove", spiega: "il mio computer", video: ["orto"] }],
  mix: ["Tre su quattro sono prove mie."],
  consigli: [{ titolo: "Serie", testo: "Una serie per volta." }],
  novita: [{ nome: "Storie", cosa: "video di un giorno", per_te: "poco", giudizio: "no", fonte: "https://esempio" }],
  come: ["Dalle letture del canale."],
}

describe("GET /api/canale/:canale/crescita", () => {
  test("il file della crescita com'è scritto; senza file risponde vuoto, non con un errore", async () => {
    const a = await avviaAmbiente({}, (c) => scriviCrescita(c, CRESCITA))
    expect((await chiama(a, "GET", "/api/canale/tiktok/crescita")).corpo).toEqual(CRESCITA)
    expect((await chiama(a, "GET", "/api/canale/youtube/crescita")).corpo).toEqual({ quando: null })
    expect((await chiama(a, "GET", "/api/canale/Tik Tok/crescita")).stato).toBe(404)
  })

  test("un file scritto a metà (manca una parte, o la data di partenza non si legge) non si carica, e il server dice quale file è incompleto", async () => {
    const errori: string[] = []
    const prima = console.error
    console.error = (...argomenti: unknown[]) => void errori.push(argomenti.join(" "))
    try {
      for (const campo of ["partenza", "settimana", "tipi", "mix", "consigli", "novita", "come"]) {
        const { [campo]: _tolto, ...senza } = CRESCITA as Record<string, unknown>
        const a = await avviaAmbiente({}, (c) => scriviCrescita(c, senza))
        expect((await chiama(a, "GET", "/api/canale/tiktok/crescita")).corpo).toEqual({ quando: null })
      }
      const dataRotta = await avviaAmbiente({}, (c) => scriviCrescita(c, { ...CRESCITA, partenza: { data: "boh", follower: 626 } }))
      expect((await chiama(dataRotta, "GET", "/api/canale/tiktok/crescita")).corpo).toEqual({ quando: null })
      const tipoSenzaVideo = await avviaAmbiente({}, (c) => scriviCrescita(c, { ...CRESCITA, tipi: [{ nome: "le mie prove", spiega: "il mio computer" }] }))
      expect((await chiama(tipoSenzaVideo, "GET", "/api/canale/tiktok/crescita")).corpo).toEqual({ quando: null })
    } finally {
      console.error = prima
    }
    expect(errori.some((e) => /crescita\.json di «tiktok» non è completo/.test(e))).toBe(true)
  })

  test("un file con un obiettivo che non è fra gli scenari, o con una tappa senza numero, non si carica", async () => {
    const a = await avviaAmbiente({}, (c) => scriviCrescita(c, { ...CRESCITA, obiettivo: "sognato" }))
    expect((await chiama(a, "GET", "/api/canale/tiktok/crescita")).corpo).toEqual({ quando: null })
    const b = await avviaAmbiente({}, (c) => scriviCrescita(c, { ...CRESCITA, scenari: [{ nome: "atteso", tappe: [{ data: "2027-01-25" }] }] }))
    expect((await chiama(b, "GET", "/api/canale/tiktok/crescita")).corpo).toEqual({ quando: null })
  })
})

describe("GET /api/canale/:canale/commenti", () => {
  test("il file dei commenti dell'ultima lettura, con gli id nuovi rispetto alla lettura prima", async () => {
    const a = await conLetture()
    const r = await chiama<{ video: string; lettura: string; commenti: { id: string }[]; nuovi: string[] }>(a, "GET", "/api/canale/tiktok/commenti?video=111")
    expect(r.stato).toBe(200)
    expect(r.corpo).toMatchObject({ video: "111", lettura: DOPO, quando: "2026-10-09T18:30:00", nuovi: ["c3"] })
    expect(r.corpo.commenti.map((c) => c.id)).toEqual(["c1", "c2", "c3"])
  })

  test("una lettura precedente: nessuna lettura prima, nessun nuovo", async () => {
    const a = await conLetture()
    const r = await chiama<{ lettura: string; commenti: unknown[]; nuovi: string[] }>(a, "GET", `/api/canale/tiktok/commenti?video=111&lettura=${PRIMA}`)
    expect(r.corpo).toMatchObject({ lettura: PRIMA, nuovi: [] })
    expect(r.corpo.commenti).toHaveLength(2)
  })

  test("senza lettura si prende la più recente che ha quel file", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await dueLetture(c)
      await rm(join(c.archivio, "canali", "tiktok", "letture", DOPO, "commenti"), { recursive: true })
    })
    expect((await chiama<{ lettura: string }>(a, "GET", "/api/canale/tiktok/commenti?video=111")).corpo.lettura).toBe(PRIMA)
  })

  test("rifiuta: video mancante o scritto male, video senza commenti, lettura che non c'è", async () => {
    const a = await conLetture()
    expect((await chiama(a, "GET", "/api/canale/tiktok/commenti")).stato).toBe(400)
    expect((await chiama(a, "GET", "/api/canale/tiktok/commenti?video=..%2F..%2Fx")).stato).toBe(400)
    expect((await chiama(a, "GET", "/api/canale/tiktok/commenti?video=222")).stato).toBe(404)
    expect((await chiama(a, "GET", "/api/canale/tiktok/commenti?video=111&lettura=2000-01-01-0000")).stato).toBe(404)
    expect((await chiama(a, "GET", "/api/canale/youtube/commenti?video=111")).stato).toBe(404)
  })
})

describe("GET /api/canale/:canale/messaggi", () => {
  test("le conversazioni dell'ultima lettura con gli indici dei messaggi nuovi, e quelle nuove per intero", async () => {
    const a = await conLetture()
    const r = await chiama<{ lettura: string; conversazioni: { con: string; messaggi: { testo: string }[]; nuovi: number[] }[] }>(a, "GET", "/api/canale/tiktok/messaggi")
    expect(r.corpo.lettura).toBe(DOPO)
    expect(r.corpo.conversazioni.map((c) => [c.con, c.messaggi.length, c.nuovi])).toEqual([
      ["marco", 3, [2]],
      ["anna", 1, [0]],
    ])
    expect(r.corpo.conversazioni[0]!.messaggi[2]!.testo).toBe("e il video?")
  })

  test("la lettura più vecchia non ha niente prima: nessun nuovo", async () => {
    const a = await conLetture()
    const r = await chiama<{ conversazioni: { nuovi: number[] }[] }>(a, "GET", `/api/canale/tiktok/messaggi?lettura=${PRIMA}`)
    expect(r.corpo.conversazioni.map((c) => c.nuovi)).toEqual([[]])
    expect((await chiama(a, "GET", "/api/canale/tiktok/messaggi?lettura=2000-01-01-0000")).stato).toBe(404)
    expect((await chiama(a, "GET", "/api/canale/youtube/messaggi")).stato).toBe(404)
  })
})

describe("il legame tra un video del canale e la sua scheda", () => {
  const conSchede = () =>
    avviaAmbiente({}, async (c) => {
      await dueLetture(c)
      await scriviVideo(c, "orto")
      await scriviVideo(c, "nuovo", { titolo: "Nuovo", stato: "pubblicato", creato: "2026-10-06", pubblicazioni: [{ canale: "tiktok", data: "2026-10-09T18:00", url: "https://www.tiktok.com/@mio/video/333?lang=it" }] })
      await scriviVideo(c, "su-youtube", { titolo: "Su YouTube", stato: "pubblicato", creato: "2026-10-06", pubblicazioni: [{ canale: "youtube", data: "2026-10-09T18:00", url: "https://youtu.be/222" }] })
    })

  test("un video che la lettura non lega prende lo slug dalla scheda la cui pubblicazione ha il suo indirizzo", async () => {
    const a = await conSchede()
    const r = await chiama<{ video: { id: string; slug: string | null }[] }>(a, "GET", "/api/canale/tiktok")
    const slugDi = (id: string) => r.corpo.video.find((v) => v.id === id)?.slug ?? null
    expect(slugDi("333")).toBe("nuovo")
    expect(slugDi("111")).toBe("orto")
    expect(slugDi("222")).toBeNull()
  })

  test("i commenti di un video si trovano anche con il legame della scheda", async () => {
    const a = await conSchede()
    expect((await chiama(a, "GET", "/api/video/nuovo/commenti")).corpo).toEqual({ commenti: [], nuovi: [], legato: true, canale: "tiktok", video: "333", lettura: null })
    expect((await chiama(a, "GET", "/api/video/su-youtube/commenti")).corpo).toEqual({ commenti: [], legato: false })
  })
})

describe("GET /api/video/:slug/commenti", () => {
  test("i commenti del video del canale legato a quello slug", async () => {
    const a = await conLetture()
    const r = await chiama<{ legato: boolean; canale: string; video: string; lettura: string; commenti: { id: string }[]; nuovi: string[] }>(a, "GET", "/api/video/orto/commenti")
    expect(r.corpo).toMatchObject({ legato: true, canale: "tiktok", video: "111", lettura: DOPO, nuovi: ["c3"] })
    expect(r.corpo.commenti.map((c) => c.id)).toEqual(["c1", "c2", "c3"])
  })

  test("un video non legato dà {commenti: [], legato: false}; uno legato ma senza commenti letti li dà vuoti", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await dueLetture(c)
      await scriviVideo(c, "altro")
      await scriviFile(c, DOPO, "video.json", { video: [{ id: "111", slug: "orto" }, { id: "999", slug: "altro" }] })
    })
    expect((await chiama(a, "GET", "/api/video/altro-ancora/commenti")).corpo).toEqual({ commenti: [], legato: false })
    expect((await chiama(a, "GET", "/api/video/altro/commenti")).corpo).toEqual({ commenti: [], nuovi: [], legato: true, canale: "tiktok", video: "999", lettura: null })
    expect((await chiama(a, "GET", "/api/video/Storto/commenti")).stato).toBe(404)
  })
})

describe("l'osservatore del canale", () => {
  test("una lettura nuova compare quando arriva l'esito; a metà non rompe niente", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await dueLetture(c)
    })
    const ascolto = await ascolta(a)
    const nuova = "2026-10-11-0800"
    const arriva = () => ascolto.messaggi.filter((m) => m.tipo === "canale").length
    const letture = async () => (await chiama<Vista>(a, "GET", "/api/canale/tiktok")).corpo.letture.length

    await scriviFile(a, nuova, "profilo.json", { quando: "2026-10-11T08:00:00", follower: 150, mi_piace: 1200, video: 3 })
    await scriviFile(a, nuova, "video.json", '{ "video": [ { "id": "111", "visualizzaz')
    await aspetta(() => arriva() >= 1)
    expect(await letture()).toBe(2)

    await scriviFile(a, nuova, "esito.json", { quando: "2026-10-11T08:01:00", completa: true, mancano: [] })
    await aspetta(async () => (await letture()) === 3)
    let r = (await chiama<Vista>(a, "GET", "/api/canale/tiktok")).corpo
    expect(r.ultima?.lettura).toBe(nuova)
    expect(r.profilo).toMatchObject({ follower: 120 })
    expect(r.video[0]).toMatchObject({ id: "111", variazione: { visualizzazioni: 500 } })

    await scriviFile(a, nuova, "video.json", { video: [{ id: "111", visualizzazioni: 1800, mi_piace: 80, commenti: 3 }] })
    await aspetta(async () => (await chiama<Vista>(a, "GET", "/api/canale/tiktok")).corpo.video[0]?.variazione?.visualizzazioni === 300)
    r = (await chiama<Vista>(a, "GET", "/api/canale/tiktok")).corpo
    expect(r.profilo).toMatchObject({ follower: 150 })
    expect(r.video).toHaveLength(1)
    expect(ascolto.messaggi.every((m) => m.tipo !== "canale" || m.canale === "tiktok")).toBe(true)

    await rm(join(a.archivio, "canali", "tiktok", "letture", nuova), { recursive: true })
    await aspetta(async () => (await letture()) === 2)
    ascolto.chiudi()
  })

  test("nuovi commenti e messaggi si vedono appena il file è completo", async () => {
    const a = await conLetture()
    await scriviFile(a, DOPO, "commenti/111.json", { video: "111", commenti: [commento("c1"), commento("c2"), commento("c3"), commento("c4")] })
    await aspetta(async () => (await chiama<{ nuovi: string[] }>(a, "GET", "/api/canale/tiktok/commenti?video=111")).corpo.nuovi.length === 2)
    expect((await chiama<Vista>(a, "GET", "/api/canale/tiktok")).corpo.video[0]!.commenti_letti).toBe(4)
    await scriviFile(a, DOPO, "commenti/111.json", '{ "video": "111", "commenti": [ { "id": ')
    await Bun.sleep(300)
    expect((await chiama<Vista>(a, "GET", "/api/canale/tiktok")).corpo.video[0]!.commenti_letti).toBe(4)
  })

  test("la classifica compare e cambia quando il suo file è scritto per intero, e segue le letture", async () => {
    const a = await conLetture()
    const ascolto = await ascolta(a)
    const classifica = async () => (await chiama<Classifica>(a, "GET", "/api/canale/tiktok/classifica")).corpo
    await scriviClassifica(a, CLASSIFICA)
    await aspetta(async () => (await classifica()).righe.length === 3)
    expect(ascolto.messaggi.some((m) => m.tipo === "canale" && m.canale === "tiktok")).toBe(true)

    await scriviClassifica(a, '{ "quando": "2026-10-08", "profili": [ { "nome": ')
    await Bun.sleep(300)
    expect((await classifica()).righe).toHaveLength(3)

    await scriviFile(a, DOPO, "profilo.json", { quando: "2026-10-09T18:30:00", nome: "mio_canale", follower: 9000, seguiti: 5, mi_piace: 1100, video: 3 })
    await aspetta(async () => (await classifica()).righe.find((x) => x.nome === "mio_canale")?.follower === 9000)
    ascolto.chiudi()
  })

  test("la crescita compare quando il suo file è scritto per intero; a metà resta quella di prima", async () => {
    const a = await conLetture()
    const crescita = async () => (await chiama<{ quando: string | null }>(a, "GET", "/api/canale/tiktok/crescita")).corpo
    await scriviCrescita(a, CRESCITA)
    await aspetta(async () => (await crescita()).quando === "2026-10-25")
    await scriviCrescita(a, '{ "quando": "2026-11-01", "scenari": [ ')
    await Bun.sleep(300)
    expect((await crescita()).quando).toBe("2026-10-25")
    await scriviCrescita(a, { ...CRESCITA, quando: "2026-11-01" })
    await aspetta(async () => (await crescita()).quando === "2026-11-01")
  })

  test("le rotte di indice non leggono il disco; commenti e messaggi sì, una volta sola per richiesta", async () => {
    const a = await conLetture()
    await Bun.sleep(200)
    const prima = contatori.letture
    for (let i = 0; i < 10; i++) {
      await chiama(a, "GET", "/api/canale/tiktok")
      await chiama(a, "GET", "/api/canale/tiktok/andamento")
      await chiama(a, "GET", "/api/canale/tiktok/classifica")
      await chiama(a, "GET", "/api/canale/tiktok/crescita")
    }
    expect(contatori.letture).toBe(prima)
    await chiama(a, "GET", "/api/canale/tiktok/commenti?video=111")
    expect(contatori.letture).toBe(prima + 1)
    await chiama(a, "GET", "/api/canale/tiktok/messaggi")
    expect(contatori.letture).toBe(prima + 2)
  })
})
