import { afterEach, describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { avviaAmbiente, chiama, fermaTutti, piano, scriviGrezzo, scriviVideo, type Ambiente } from "./aiuti"

afterEach(fermaTutti)

interface Errore {
  errore: string
  problemi?: string[]
}

/** La stessa richiesta in italiano (senza intestazione) e in inglese: lo stato è lo stesso, le due frasi sono quelle date. */
async function nelleDueLingue(a: Ambiente, metodo: string, percorso: string, corpo: unknown, stato: number, it: string | RegExp, en: string | RegExp): Promise<void> {
  const italiano = await chiama<Errore>(a, metodo, percorso, corpo)
  const inglese = await chiama<Errore>(a, metodo, percorso, corpo, "en")
  expect(italiano.stato).toBe(stato)
  expect(inglese.stato).toBe(stato)
  if (typeof it === "string") expect(italiano.corpo.errore).toBe(it)
  else expect(italiano.corpo.errore).toMatch(it)
  if (typeof en === "string") expect(inglese.corpo.errore).toBe(en)
  else expect(inglese.corpo.errore).toMatch(en)
}

describe("nessuna frase italiana nuda nelle rotte", () => {
  test("ogni ErroreApi porta una frase nelle due lingue o un nome che la contiene, mai un testo scritto lì", async () => {
    const sorgente = await readFile(join(import.meta.dir, "..", "src", "rotte.ts"), "utf-8")
    const nude = [...sorgente.matchAll(/new ErroreApi\(\s*\d+,\s*["'`][^\n]*/g)].map((m) => m[0])
    expect(nude).toEqual([])
    const oggetti = [...sorgente.matchAll(/comeOggetto\([^\n]*,\s*["'`][^\n]*/g)].map((m) => m[0])
    expect(oggetti).toEqual([])
  })
})

describe("gli errori delle rotte, in italiano e in inglese", () => {
  test("creare un video: senza titolo, con la cartella storta, con un file che non c'è, con un nome già preso", async () => {
    const a = await avviaAmbiente({}, async (c) => scriviVideo(c, "presente"))
    await nelleDueLingue(a, "POST", "/api/video", {}, 400, "Manca il titolo: scrivi come si chiama il video.", "The title is missing: write what the video is called.")
    await nelleDueLingue(
      a,
      "POST",
      "/api/video",
      { titolo: "Prova", slug: "Storto Qui" },
      400,
      "Il nome della cartella può avere solo lettere minuscole, numeri e trattini (per esempio «orto-in-numeri»).",
      "The folder name can only have lowercase letters, numbers and hyphens (for example «orto-in-numeri»).",
    )
    await nelleDueLingue(
      a,
      "POST",
      "/api/video",
      { titolo: "Prova", grezzo: ["2026-10-06/manca.mp4"] },
      400,
      "Il file «2026-10-06/manca.mp4» non c'è in archivio/grezzo/: scegline uno dalla pagina Girato.",
      "The file «2026-10-06/manca.mp4» is not in archivio/grezzo/: pick one from the Footage page.",
    )
    await nelleDueLingue(
      a,
      "POST",
      "/api/video",
      { titolo: "Prova", grezzo: "storto" },
      400,
      "«grezzo» deve essere un elenco di file, ciascuno scritto «giorno/nome».",
      "«grezzo» must be a list of files, each written «giorno/nome».",
    )
    await nelleDueLingue(
      a,
      "POST",
      "/api/video",
      { titolo: "Prova", slug: "presente" },
      409,
      "C'è già un video «presente»: scegli un altro nome per la cartella.",
      "There is already a video «presente»: choose another name for the folder.",
    )
  })

  test("il corpo che non è un oggetto porta il nome di ciò che si aspettava", async () => {
    const a = await avviaAmbiente()
    await nelleDueLingue(a, "POST", "/api/video", [], 400, "La richiesta deve essere un oggetto JSON.", "The request must be a JSON object.")
  })

  test("lo slug storto o assente", async () => {
    const a = await avviaAmbiente()
    await nelleDueLingue(a, "GET", "/api/video/Storto%20Qui", undefined, 404, "Non c'è un video con questo nome: guarda l'elenco dei video.", "There is no video with this name: look at the list of videos.")
    await nelleDueLingue(a, "POST", "/api/video/non-c-e/lavori", { comando: "monta" }, 404, "Non c'è un video «non-c-e»: guarda l'elenco dei video.", "There is no video «non-c-e»: look at the list of videos.")
  })

  test("un lavoro: comando sbagliato, campo che non serve, anteprima senza scena, piano mancante", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviVideo(c, "v")
    })
    const elenco = "prepara, risolvi, monta, anteprima, controlla, copertina, carosello, prova"
    await nelleDueLingue(a, "POST", "/api/video/v/lavori", { comando: "boh" }, 400, `Il comando deve essere uno fra: ${elenco}.`, `The command must be one of: ${elenco}.`)
    await nelleDueLingue(
      a,
      "POST",
      "/api/video/v/lavori",
      { comando: "monta", scena: "uno" },
      400,
      "«scena» non serve al comando «monta»: vale solo per anteprima.",
      "«scena» is not needed by the command «monta»: it only applies to anteprima.",
    )
    await nelleDueLingue(
      a,
      "POST",
      "/api/video/v/lavori",
      { comando: "anteprima", scena: "uno", da: 1 },
      400,
      "Per l'anteprima dai o la scena o i secondi «da» e «a», non tutti e due.",
      "For the preview give either the scene or the seconds «da» and «a», not both.",
    )
    await nelleDueLingue(a, "POST", "/api/video/v/lavori", { comando: "anteprima", da: 5, a: 2 }, 400, "«a» deve venire dopo «da».", "«a» must come after «da».")
    await nelleDueLingue(
      a,
      "POST",
      "/api/video/v/lavori",
      { comando: "copertina" },
      400,
      "Per la copertina dai il «disegno»: il percorso di un'immagine, che non cominci con «-».",
      "For the cover give the «disegno»: the path of an image, not starting with «-».",
    )
    await nelleDueLingue(
      a,
      "POST",
      "/api/video/v/lavori",
      { comando: "monta" },
      409,
      "Questo video non ha ancora un piano: scrivilo (o chiedilo nella chat) e riprova.",
      "This video has no plan yet: write it (or ask for it in the chat) and try again.",
    )
    await nelleDueLingue(
      a,
      "POST",
      "/api/video/v/lavori",
      { comando: "carosello" },
      409,
      "Questo video non è un carosello: nella scheda manca «formato»: «carosello».",
      "This video is not a carousel: its card is missing «formato»: «carosello».",
    )
  })

  test("la scheda: PATCH e PUT non validi portano l'elenco dei problemi nella lingua scelta", async () => {
    const a = await avviaAmbiente({}, async (c) => scriviVideo(c, "v"))
    await nelleDueLingue(a, "PATCH", "/api/video/v/scheda", { stato: "boh" }, 400, /^La scheda non sarebbe valida: .+/, /^The card would not be valid: .+/)
    await nelleDueLingue(a, "PUT", "/api/video/v/scheda", { stato: "boh" }, 400, /^La scheda non è valida: .+/, /^The card is not valid: .+/)
    await nelleDueLingue(a, "PATCH", "/api/video/v/scheda", [1], 400, "La modifica della scheda deve essere un oggetto JSON.", "The card change must be a JSON object.")
  })

  test("il piano: da ritoccare quando non c'è, nessuna versione da annullare o rifare, non valido", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/a.mp4")
      await scriviVideo(c, "senza")
      await scriviVideo(c, "con", undefined, piano())
    })
    await nelleDueLingue(
      a,
      "PATCH",
      "/api/video/senza/piano",
      { operazioni: [] },
      409,
      "Questo video non ha ancora un piano da ritoccare: scrivilo intero (PUT del piano).",
      "This video has no plan yet to adjust: write it whole (PUT of the plan).",
    )
    await nelleDueLingue(a, "POST", "/api/video/con/annulla", undefined, 409, "Non c'è niente da annullare: questa è la prima versione del piano.", "There is nothing to undo: this is the first version of the plan.")
    await nelleDueLingue(a, "POST", "/api/video/con/rifai", undefined, 409, "Non c'è niente da rifare: questa è l'ultima versione del piano.", "There is nothing to redo: this is the last version of the plan.")
    await nelleDueLingue(a, "PUT", "/api/video/con/piano", { quadro: "girato-pieno" }, 400, /^Il piano non è valido: .+/, /^The plan is not valid: .+/)
  })

  test("togliere un video che non è una proposta, o che ha un lavoro", async () => {
    const a = await avviaAmbiente({}, async (c) => scriviVideo(c, "fatto", { titolo: "Fatto", stato: "in lavorazione", creato: "2026-10-06" }))
    await nelleDueLingue(
      a,
      "DELETE",
      "/api/video/fatto",
      undefined,
      409,
      "Si cancella solo una proposta senza montato. Per gli altri video cambia lo stato in «scartato»: resta in archivio e non si propone più.",
      "Only a proposal without an edited video can be deleted. For the other videos change the status to «scartato»: it stays in the archive and is not proposed again.",
    )
  })

  test("il girato: un file che non c'è, non ancora preparato, scritto male, ritrascrivi", async () => {
    const a = await avviaAmbiente({}, async (c) => scriviGrezzo(c, "2026-10-06/a.mp4"))
    await nelleDueLingue(
      a,
      "GET",
      "/api/grezzo/parole?file=2026-10-06/manca.mp4",
      undefined,
      404,
      "Il file «2026-10-06/manca.mp4» non c'è in archivio/grezzo/: guarda la pagina Girato.",
      "The file «2026-10-06/manca.mp4» is not in archivio/grezzo/: see the Footage page.",
    )
    await nelleDueLingue(
      a,
      "GET",
      "/api/grezzo/parole?file=2026-10-06/a.mp4",
      undefined,
      404,
      "«2026-10-06/a.mp4» non è ancora stato preparato: premi «Prepara» nella pagina Girato e aspetta che finisca.",
      "«2026-10-06/a.mp4» has not been prepared yet: press «Prepare» on the Footage page and wait for it to finish.",
    )
    await nelleDueLingue(
      a,
      "POST",
      "/api/grezzo/prepara",
      { file: "storto" },
      400,
      "file: il file va scritto «giorno/nome», per esempio «2026-10-06/IMG_5106.MOV».",
      "file: the file must be written «giorno/nome» (day/name), for example «2026-10-06/IMG_5106.MOV».",
    )
    await nelleDueLingue(a, "POST", "/api/grezzo/prepara", { file: "2026-10-06/a.mp4", ritrascrivi: "si" }, 400, "«ritrascrivi» è vero o falso.", "«ritrascrivi» is true or false.")
    await nelleDueLingue(a, "PATCH", "/api/grezzo/scheda?file=2026-10-06/a.mp4", { tipo: "boh" }, 400, /^La scheda non sarebbe valida: .+/, /^The card would not be valid: .+/)
  })

  test("scaricare dal web senza yt-dlp", async () => {
    const a = await avviaAmbiente()
    await nelleDueLingue(
      a,
      "POST",
      "/api/grezzo/scarica",
      { url: "https://esempio.test/ok" },
      409,
      "yt-dlp non è installato su questo computer: installalo (vedi docs/NUOVO-COMPUTER.md), riavvia il server e riprova.",
      "yt-dlp is not installed on this computer: install it (see docs/NUOVO-COMPUTER.md), restart the server and try again.",
    )
  })

  test("lo stile: non valido con tutti i problemi, e il lavoro che non c'è più", async () => {
    const a = await avviaAmbiente()
    await nelleDueLingue(
      a,
      "PUT",
      "/api/stile",
      {},
      400,
      "Lo stile non è valido: formato: servono «largo», «alto» e «fps», numeri maggiori di zero. · quadri: serve almeno un quadro.",
      "The style is not valid: formato: «largo», «alto» and «fps» are needed, numbers greater than zero. · quadri: at least one frame is needed.",
    )
    const inglese = await chiama<Errore>(a, "PUT", "/api/stile", {}, "en")
    expect(inglese.corpo.problemi).toEqual(["formato: «largo», «alto» and «fps» are needed, numbers greater than zero.", "quadri: at least one frame is needed."])
    await nelleDueLingue(a, "DELETE", "/api/lavori/nessuno", undefined, 404, "Questo lavoro non c'è più: è già finito o è stato tolto.", "This job is no longer there: it has already finished or been removed.")
  })

  test("aprire un file o una pagina: cosa manca, cosa non c'è", async () => {
    const a = await avviaAmbiente()
    await nelleDueLingue(
      a,
      "POST",
      "/api/apri",
      { dove: "browser" },
      400,
      "Dì cosa aprire: «video» (lo slug, con «scheda» se serve) per la pagina di un video, «percorso» per un file dell'archivio.",
      "Say what to open: «video» (the slug, with «scheda» if needed) for a video's page, «percorso» for a file in the archive.",
    )
    await nelleDueLingue(
      a,
      "POST",
      "/api/apri",
      { dove: "browser", video: "nessuno" },
      404,
      "Il video «nessuno» non c'è: lo slug lo dà video_elenco.",
      "The video «nessuno» does not exist: the slug comes from video_elenco.",
    )
    await nelleDueLingue(a, "POST", "/api/apri", { percorso: "video/nessuno" }, 404, "Questo file o cartella non c'è nell'archivio.", "This file or folder is not in the archive.")
    await nelleDueLingue(
      a,
      "POST",
      "/api/apri",
      { percorso: "../fuori" },
      400,
      "Il percorso deve stare dentro l'archivio e non avere «..»: scrivilo relativo all'archivio, per esempio «video/orto-in-numeri».",
      "The path must be inside the archive and have no «..»: write it relative to the archive, for example «video/orto-in-numeri».",
    )
  })

  test("telefoni e studio dalla rete: manca «acceso»", async () => {
    const a = await avviaAmbiente()
    await nelleDueLingue(
      a,
      "PUT",
      "/api/arrivi",
      {},
      400,
      "Manca «acceso»: true per collegare un telefono, false per scollegarli.",
      "«acceso» is missing: true to connect a phone, false to disconnect them.",
    )
    await nelleDueLingue(
      a,
      "PUT",
      "/api/accesso-studio",
      {},
      400,
      "Manca «acceso»: true per accendere lo studio dalla rete, false per spegnerlo.",
      "«acceso» is missing: true to turn the studio on from the network, false to turn it off.",
    )
  })

  test("la registrazione: modo sbagliato, dispositivo senza nome, nessuna registrazione da fermare", async () => {
    const a = await avviaAmbiente()
    await nelleDueLingue(a, "POST", "/api/registrazione", { modo: "boh" }, 400, /^«modo» deve essere uno fra «.+»/, /^«modo» must be one of «.+»/)
    await nelleDueLingue(
      a,
      "POST",
      "/api/registrazione",
      { modo: "schermo", microfono: "" },
      400,
      "«microfono» è il nome di un dispositivo fra quelli che il server ha trovato.",
      "«microfono» is the name of a device among those the server found.",
    )
    await nelleDueLingue(a, "DELETE", "/api/registrazione", undefined, 409, "Non c'è nessuna registrazione in corso.", "No recording is running.")
  })

  test("il canale: nome storto, identificatore storto, «video» mancante", async () => {
    const a = await avviaAmbiente()
    await nelleDueLingue(
      a,
      "GET",
      "/api/canale/Storto%20Qui",
      undefined,
      404,
      "Questo canale non esiste: il nome ha solo lettere minuscole, numeri e trattini (per esempio «tiktok»).",
      "This channel does not exist: the name has only lowercase letters, numbers and hyphens (for example «tiktok»).",
    )
    await nelleDueLingue(
      a,
      "GET",
      "/api/canale/tiktok/commenti",
      undefined,
      400,
      "Manca «video»: scrivi l'identificatore del video del canale, per esempio ?video=7425550000000000000.",
      "«video» is missing: write the identifier of the channel's video, for example ?video=7425550000000000000.",
    )
    await nelleDueLingue(
      a,
      "GET",
      "/api/canale/tiktok/commenti?video=a%20b",
      undefined,
      400,
      "«video» non è scritto bene: usa solo lettere, numeri, trattini e trattini bassi.",
      "«video» is not written correctly: use only letters, numbers, hyphens and underscores.",
    )
    await nelleDueLingue(
      a,
      "GET",
      "/api/canale/tiktok/commenti?video=7425550000000000000",
      undefined,
      404,
      "Non ci sono commenti letti per questo video (o per quella lettura): per rileggere il canale, chiedilo nella chat.",
      "There are no comments read for this video (or for that read): to read the channel again, ask in the chat.",
    )
    await nelleDueLingue(
      a,
      "GET",
      "/api/canale/tiktok/messaggi",
      undefined,
      404,
      "Non ci sono messaggi letti (o non per quella lettura): per rileggere il canale, chiedilo nella chat.",
      "There are no messages read (or not for that read): to read the channel again, ask in the chat.",
    )
  })

  test("un percorso non ammesso", async () => {
    const a = await avviaAmbiente()
    const fuori = await fetch(`${a.url}/media/..%2fstile.json`, { headers: { ...a.accesso, "X-Lingua": "en" } })
    expect(fuori.status).toBe(400)
    expect(((await fuori.json()) as Errore).errore).toBe("This path is not allowed: only files inside the folder are served, without «..».")
    const manca = await fetch(`${a.url}/media/video/v/uscite/manca.mp4`, { headers: { ...a.accesso, "X-Lingua": "it" } })
    expect(manca.status).toBe(404)
  })
})
