// Gli strumenti MCP «video»: ciò che fa il server passa dalla sua API, i comandi leggeri del motore si lanciano da qui.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join, resolve } from "node:path"
import { z } from "zod"
import { COMANDI_DEL_VIDEO, SLUG } from "../rotte"
import { SIGLA, type RisultatoSceneFoto } from "../sceneFoto"
import { righeDaVtt } from "../vtt"
import { chiamaApi, ErroreStrumento } from "./api"
import { aspettaFine, statoDelLavoro } from "./lavori"
import type { OpzioniMcp } from "./opzioni"
import { erroreDi, lancia, rimpicciolisci } from "./processi"

const SECONDI_MOTORE = 120
const ATTESA_PREDEFINITA = 60
const ATTESA_MASSIMA = 300
const FOTO_MASSIME = 8
const ASCOLTO_MASSIMO = 10
const FINESTRA_PAROLE = 600
const SECONDI_SOTTOTITOLI = 90

const SOLA_LETTURA = { readOnlyHint: true }

const slug = z.string().regex(SLUG, "Lo slug ha solo lettere minuscole, numeri e trattini: lo dà video_elenco.").describe("The video identifier, as video_elenco returns it (e.g. «basilico-come-potarlo»).")

const testo = (t: string): CallToolResult => ({ content: [{ type: "text", text: t }] })
const json = (valore: unknown): CallToolResult => testo(JSON.stringify(valore))

async function comeStrumento(f: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await f()
  } catch (errore) {
    if (errore instanceof ErroreStrumento) return { isError: true, content: [{ type: "text", text: errore.message }] }
    throw errore
  }
}

interface ElencoDelVideo {
  slug: string
  scheda: { titolo: string; stato: string }
  ha_piano: boolean
  ha_finale: boolean
}

interface DettaglioDelVideo {
  slug: string
  cartella: string
  uscite: { file: string }[]
  scheda: unknown
  piano: unknown
  problemi: { scheda: string[]; piano: string[] }
  risolto: { durata: number; scene: { nome: string; quadro: string; inizio: number; durata: number; animazione: string | null }[]; avvisi: unknown[] } | null
  risolto_aggiornato: boolean
  lavoro: { id: string; comando: string; stato: "in corso" | "in coda" } | null
  montato: { file: string; quando: string } | null
  piano_dopo_montato: boolean
  fase: { passo: number; azione: string } | null
}

export function creaServerMcp(o: OpzioniMcp): McpServer {
  const server = new McpServer({ name: "mango-animation", version: "1.0.0" })

  const etichettate = async (percorsi: string[], etichetta: (i: number) => string): Promise<CallToolResult["content"]> => {
    const contenuto: CallToolResult["content"] = []
    for (const [i, percorso] of percorsi.entries()) contenuto.push({ type: "text", text: etichetta(i) }, await rimpicciolisci(o.ffmpeg, resolve(o.codice, percorso)))
    return contenuto
  }

  const motore = async (argomenti: string[]): Promise<string> => {
    const { eseguibile, modulo, ambiente } = o.motore
    const esito = await lancia([eseguibile, "-m", modulo, ...argomenti], { cwd: o.codice, env: ambiente, secondi: SECONDI_MOTORE })
    if (esito.codice !== 0) throw erroreDi(`python -m ${modulo} ${argomenti.join(" ")}`, esito)
    return esito.stdout
  }

  server.registerTool(
    "video_elenco",
    {
      description:
        "Lists the videos in the archive, most recent first. For each one: slug (the identifier every other tool needs), titolo (title), stato (state: proposta, in lavorazione, pronto, pubblicato, scartato), whether it has a plan and whether it is already rendered. Start here.",
      annotations: SOLA_LETTURA,
    },
    () =>
      comeStrumento(async () => {
        const video = await chiamaApi<ElencoDelVideo[]>(o.api, "GET", "/api/video")
        return json(video.map((v) => ({ slug: v.slug, titolo: v.scheda.titolo, stato: v.scheda.stato, ha_piano: v.ha_piano, ha_finale: v.ha_finale })))
      }),
  )

  server.registerTool(
    "video_leggi",
    {
      description:
        "Reads a video: the card (`scheda`: title, state, proposal, notes), the plan (`piano.json`: the single source of truth of an edit; change it only with piano_scrivi or piano_ritocca, never by writing the file, because they validate before saving; the format is in docs/PIANO.md) and a summary of the resolved plan (the real timings): duration, scenes with name, frame layout (`quadro`), start, duration and animation, plus the warnings. Words and segments are not included (too many): use `parole` for those. `risolto_aggiornato` false means the plan changed after the last `risolvi`: the summary belongs to the previous plan. `montato` is the edited video to watch, or null if there is none: `file` (path in the archive), `fatto_il` (when it was made), `segue_il_piano` (false: the plan or the style changed after the edit, so the video does not follow them yet and needs re-editing) and `con_copertina` (true: the file is the one with the cover as its first frame). `lavoro` is the job running or queued for this video, if any. `fase` is the step of the method (1 to 8) the video has reached and the action that comes next, or null if the steps do not apply (a carousel, a discarded video). `problemi` says why the card or the plan written in the file is not used (not valid against the schema, or not JSON): the server keeps the last valid card, and a plan with problems cannot be used until it is fixed: the server refuses every job on it, with the same reasons. Empty lists mean all is well.",
      inputSchema: { slug },
      annotations: SOLA_LETTURA,
    },
    ({ slug }) =>
      comeStrumento(async () => {
        const v = await chiamaApi<DettaglioDelVideo>(o.api, "GET", `/api/video/${slug}`)
        const risolto = v.risolto && {
          durata: v.risolto.durata,
          scene: v.risolto.scene.map(({ nome, quadro, inizio, durata, animazione }) => ({ nome, quadro, inizio, durata, animazione })),
          avvisi: v.risolto.avvisi,
        }
        const montato = v.montato && { file: v.montato.file, fatto_il: v.montato.quando, segue_il_piano: !v.piano_dopo_montato, con_copertina: v.montato.file.endsWith("/con-copertina.mp4") }
        return json({ slug: v.slug, scheda: v.scheda, piano: v.piano, problemi: v.problemi, risolto, risolto_aggiornato: v.risolto_aggiornato, montato, lavoro: v.lavoro, fase: v.fase })
      }),
  )

  server.registerTool(
    "piano_scrivi",
    {
      description:
        "Replaces the plan of a video with the one given: the whole JSON object, not a patch (read the plan first with video_leggi). The server validates it against the schema and its references: if it is invalid it answers with what to fix and the file does not change. If valid, it keeps the previous version (go back with piano_annulla) and queues `risolvi` by itself. The format is in docs/PIANO.md.",
      inputSchema: { slug, piano: z.record(z.string(), z.unknown()).describe("The whole plan (the content of piano.json).") },
    },
    ({ slug, piano }) => comeStrumento(async () => json(await chiamaApi(o.api, "PUT", `/api/video/${slug}/piano`, piano))),
  )

  server.registerTool(
    "piano_ritocca",
    {
      description:
        "Changes only some fields of the plan of a video, by path, instead of rewriting it whole with piano_scrivi: the way for a correction (a `dice`, a `rifila`, a scene's animation, one piece more or less). Each touch-up is `{ op, path, value }`: `op` is «replace» (the field must exist), «add» (a new field; in a list, inserted at that index, or at the end with «-»), «remove» or «test» (changes nothing: the answer is a conflict if the field is not the given `value`, for a touch-up that must not overwrite someone else's change: put it before the `replace`); `path` is a JSON Pointer into piano.json (e.g. «/scene/3/pezzi/0/dice», «/scene/2/pezzi/-»). They are applied in order to the plan written in the file (read it with video_leggi), then the whole result is validated as with piano_scrivi: if a path does not exist or the result is invalid, the answer says what to fix and the file does not change. If valid, the previous version is kept (piano_annulla) and `risolvi` is queued. Returns the new plan.",
      inputSchema: {
        slug,
        ritocchi: z
          .array(z.object({ op: z.enum(["replace", "add", "remove", "test"]), path: z.string().describe("Where, as a JSON Pointer (e.g. «/scene/0/pezzi/1/dice»)."), value: z.unknown().optional().describe("The new value (for «test»: the value the field must have); not for «remove».") }).strict())
          .min(1)
          .describe("The touch-ups, applied in order."),
      },
    },
    ({ slug, ritocchi }) => comeStrumento(async () => json(await chiamaApi(o.api, "PATCH", `/api/video/${slug}/piano`, ritocchi))),
  )

  server.registerTool(
    "scheda_cambia",
    {
      description:
        "Changes the card of a video (stato, proposta, note, da_verificare, didascalia, hashtag, pubblicazioni…) by giving only the fields to change: objects are merged field by field (in `proposta` giving `centro` is enough), `null` removes a field, texts and lists are replaced whole. The server validates it against the schema: if invalid it answers with what to fix and the file does not change. Returns the new card. This is the way to write the card: no scripts and no hand edits to scheda.json.",
      inputSchema: { slug, campi: z.record(z.string(), z.unknown()).describe("The fields to change, as in the card; `null` to remove one.") },
    },
    ({ slug, campi }) => comeStrumento(async () => json((await chiamaApi<{ scheda: unknown }>(o.api, "PATCH", `/api/video/${slug}/scheda`, campi)).scheda)),
  )

  server.registerTool(
    "video_nuovo",
    {
      description:
        "Creates a new video in the archive, as a proposal: the folder, the card with the title and its preview image (`materiali/anteprima.png`: the title and your line on a card in the creator's style, which the Video list shows for the proposal). Every proposal has a preview, so `riga` is required. If you have something better (a photo, a drawing, a first slide), save it over `materiali/anteprima.png` (or as `anteprima.jpg`: the most recent file wins) and look at it. `formato: \"carosello\"` for a carousel (swipeable images: then the «carosello» skill), otherwise a video. With `girato` (files of the footage) the video is also born with a plan: frame `girato-pieno`, one piece for each file. Returns the slug, the address of its page in the studio and the path of the preview. Use it when the creator asks for a video or carousel that does not exist yet (check video_elenco first). If the preview fails the video exists anyway, and the error says how to redo the preview.",
      // Rigido: un campo con un altro nome («tipo») non si ignora, sennò un carosello nascerebbe video.
      inputSchema: z
        .object({
          titolo: z.string().trim().min(1, "Il titolo non può essere vuoto.").describe("The title, as the creator will see it (e.g. «Basilico: come potarlo davvero»)."),
          riga: z.string().trim().min(1, "Serve una riga che dica di cosa parla: va sull'anteprima.").describe("One line saying what the video is about, written under the title on the preview card (e.g. «Cosa cambia nell'orto col primo caldo»)."),
          formato: z.enum(["video", "carosello"]).default("video").describe("«carosello» for swipeable images, «video» (the default) for a video."),
          girato: z.array(z.string()).min(1).optional().describe("Files of the footage to start from, each written «day/name» as in the Footage list (e.g. «2026-10-06/a.mp4»). Not for a carousel."),
        })
        .strict(),
    },
    ({ titolo, riga, formato, girato }) =>
      comeStrumento(async () => {
        const { slug } = await chiamaApi<{ slug: string }>(o.api, "POST", "/api/video", { titolo, ...(formato === "carosello" ? { formato } : {}), ...(girato ? { grezzo: girato } : {}) })
        try {
          await motore(["anteprima-proposta", slug, "--riga", riga])
        } catch (errore) {
          if (!(errore instanceof ErroreStrumento)) throw errore
          throw new ErroreStrumento(`Il video «${slug}» è stato creato, ma la sua anteprima no: ${errore.message} Si rifà con: python -m motore anteprima-proposta ${slug} --riga "<la riga>".`)
        }
        return json({ slug, formato, anteprima: `video/${slug}/materiali/anteprima.png` })
      }),
  )

  server.registerTool(
    "apri",
    {
      description:
        "Shows the creator a page of the studio or a file of the archive: in the app's own window when the app is running, else in the browser, already signed in. It is the only way to bring the creator to something (the studio's addresses do not open by themselves). Give `video` (the slug) for the video's page, with `scheda` for one of its tabs (e.g. «slide», «montaggio»), or `percorso` for a file of the archive written relative to it (e.g. «video/orto-in-numeri/uscite/con-copertina.mp4»). It only opens: then wait for the creator. To show a folder in Windows Explorer, ask the creator.",
      inputSchema: z
        .object({
          video: slug.optional(),
          scheda: z.string().regex(/^[a-z-]+$/).optional().describe("A tab of the video's page, only with `video`."),
          percorso: z.string().min(1).optional().describe("A file of the archive, relative to it, only without `video`."),
        })
        .strict(),
    },
    (argomenti) => comeStrumento(async () => json(await chiamaApi(o.api, "POST", "/api/apri", { dove: "browser", ...argomenti }))),
  )

  server.registerTool(
    "piano_annulla",
    {
      description: "Goes back to the previous version of the plan (the last replacement) and returns the restored plan. Error if this is already the first version.",
      inputSchema: { slug },
    },
    ({ slug }) => comeStrumento(async () => json(await chiamaApi(o.api, "POST", `/api/video/${slug}/annulla`))),
  )

  server.registerTool(
    "valida",
    {
      description:
        "Checks the plan of a video without writing it or rendering: schema and references (sources, frame layouts, views, animations, `dice` words). If it is fine it returns any warnings; otherwise the error lists what to fix. Fast, does not use the graphics card.",
      inputSchema: { slug },
      annotations: SOLA_LETTURA,
    },
    ({ slug }) =>
      comeStrumento(async () => {
        const uscita = await motore(["valida", slug])
        const avvisi = uscita
          .split("\n")
          .filter((r) => r.startsWith("attenzione: "))
          .map((r) => r.slice("attenzione: ".length))
        return json({ valido: true, avvisi })
      }),
  )

  server.registerTool(
    "parole",
    {
      description:
        "Every segment of the resolved video with its words and their instants, in the source and in the video. Use it to choose where to cut or anchor a scene. It can be long for a long video.",
      inputSchema: { slug },
      annotations: SOLA_LETTURA,
    },
    ({ slug }) => comeStrumento(async () => testo((await motore(["parole", slug])).trim())),
  )

  server.registerTool(
    "foto",
    {
      description: `Frames of the video at the given seconds, as shrunk but readable images. Use it to look at the result: subtitles, title, scenes. By default from the rendered video (uscite/finale.mp4: it must already be rendered, job «monta»); with video «anteprima» from the latest preview (job «anteprima»), to check a correction without rendering everything: seconds are those of the rendered video, and a second outside the part the preview covers is an error that says which part it covers. With video «prova» from the rehearsal (uscite/prova.mp4, job «prova»), with its own seconds. At most ${FOTO_MASSIME} seconds at a time. For a footage file use girato_foto. Always look at frames with these tools, never by extracting them with ffmpeg from the shell.`,
      inputSchema: {
        slug,
        secondi: z.array(z.number().min(0)).min(1).max(FOTO_MASSIME).describe("The seconds to look at, from the first (0) on."),
        video: z.enum(["montato", "anteprima", "prova"]).default("montato").describe("Which file: the rendered video (the default), the latest preview or the rehearsal."),
      },
    },
    ({ slug, secondi, video }) =>
      comeStrumento(async () => {
        const scelta = video === "montato" ? [] : [`--${video}`]
        const file = (await motore(["foto", slug, ...secondi.map(String), ...scelta])).split("\n").filter((r) => r.length > 0)
        return { content: await etichettate(file, (i) => `Secondo ${secondi[i]}${video === "prova" ? " della prova" : ""}`) }
      }),
  )

  server.registerTool(
    "ascolta",
    {
      description: `The sound of a stretch, at most ${ASCOLTO_MASSIMO} seconds, of a footage file (\`file\`, seconds of the file) or of the rendered video (\`slug\`, seconds of the video): the voice level in dB every hundredth of a second (\`livello\`, from \`da\`), the stretches above the silence threshold of the style (\`voce\`: [start, end] in seconds) and the spectrogram as an image (0-8 kHz; its time axis starts at 0, which is \`da\`). Use it to find where a word really ends, a key knock after a number, a breath, a held «eeeh» before a word (flat sound, without consonants): the transcription times are wrong by up to half a second.`,
      inputSchema: {
        slug: slug.optional(),
        file: z.string().min(1).optional().describe("A footage file written `day/name`, instead of `slug`."),
        da: z.number().min(0).describe("The second to start from."),
        a: z.number().min(0).describe(`The second to stop at, after \`da\`, at most ${ASCOLTO_MASSIMO} seconds later.`),
      },
      annotations: SOLA_LETTURA,
    },
    ({ slug, file, da, a }) =>
      comeStrumento(async () => {
        if ((slug === undefined) === (file === undefined)) throw new ErroreStrumento("Dai o `slug` (il montato) o `file` (un file del girato), uno solo dei due.")
        if (file?.startsWith("-")) throw new ErroreStrumento("Il file si scrive `giorno/nome`, come lo nomina archivio/grezzo/.")
        if (a <= da || a - da > ASCOLTO_MASSIMO) throw new ErroreStrumento(`«a» viene dopo «da», al più ${ASCOLTO_MASSIMO} secondi dopo.`)
        const esito = JSON.parse(await motore(["ascolta", String(da), String(a), ...(file === undefined ? ["--video", slug!] : ["--file", file])])) as Record<string, unknown> & { spettrogramma: string }
        const { spettrogramma, ...resto } = esito
        return { content: [{ type: "text", text: JSON.stringify(resto) }, await rimpicciolisci(o.ffmpeg, resolve(o.codice, spettrogramma))] }
      }),
  )

  server.registerTool(
    "girato_parole",
    {
      description: `The words of a prepared footage file between two of its seconds, with when each is said: [word, start, end]. At most ${FINESTRA_PAROLE} seconds at a time. Use it to find a sentence in a take or a downloaded video and choose a piece by words (\`minuto\`, \`dice\`). The words are in the language the file was transcribed in: if it is wrong, set \`lingua\` with girato_scheda and redo them with girato_prepara and \`ritrascrivi\`.`,
      inputSchema: {
        file: z.string().min(1).describe("The footage file written `day/name`, as the folder archivio/grezzo/ names it (e.g. «2026-10-21/keynote.mp4»)."),
        da: z.number().min(0).describe("The second of the file to start from."),
        a: z.number().min(0).describe(`The second of the file to stop at, after \`da\`, at most ${FINESTRA_PAROLE} seconds later.`),
      },
      annotations: SOLA_LETTURA,
    },
    ({ file, da, a }) =>
      comeStrumento(async () => {
        if (a <= da || a - da > FINESTRA_PAROLE) throw new ErroreStrumento(`«a» viene dopo «da», al più ${FINESTRA_PAROLE} secondi dopo.`)
        const parole = await chiamaApi<{ p: string; da: number; a: number }[]>(o.api, "GET", `/api/grezzo/parole?file=${encodeURIComponent(file)}`)
        return json({ file, da, a, parole: parole.filter((w) => w.a > da && w.da < a).map((w) => [w.p, w.da, w.a]) })
      }),
  )

  server.registerTool(
    "web_testo",
    {
      description:
        "The text of a video on the web (YouTube and the other sites yt-dlp knows) from its subtitles, without downloading it: one line for each new sentence, «mm:ss text» with the minute it starts at. Written subtitles if the video has them, otherwise the automatic ones. Use it to read a talk or a keynote and choose the stretch to download with girato_scarica (`da`, `a`). The times are those of the subtitles, not of the voice: the exact cut is chosen on the downloaded file, by words.",
      inputSchema: {
        url: z.string().regex(/^https?:\/\//, "L'indirizzo comincia con http:// o https://.").describe("The address of the video."),
        lingua: z.string().regex(/^[a-z]{2}$/, "La lingua sono due lettere minuscole, come «en».").describe("The language of the subtitles, two letters (e.g. «en» for the words of a keynote in English)."),
      },
      annotations: SOLA_LETTURA,
    },
    ({ url, lingua }) =>
      comeStrumento(async () => {
        if (o.ytdlp === null) throw new ErroreStrumento("yt-dlp non è installato su questo computer: installalo (vedi docs/NUOVO-COMPUTER.md) e riavvia.")
        const cartella = await mkdtemp(join(tmpdir(), "mango-sottotitoli-"))
        try {
          const comando = [...o.ytdlp, "--skip-download", "--write-subs", "--write-auto-subs", "--sub-langs", `${lingua},${lingua}-orig`, "--sub-format", "vtt", "-o", join(cartella, "t.%(ext)s"), url]
          const esito = await lancia(comando, { cwd: cartella, env: {}, secondi: SECONDI_SOTTOTITOLI })
          if (esito.codice !== 0) throw erroreDi("yt-dlp", esito)
          const vtt = (await readdir(cartella)).filter((f) => f.endsWith(".vtt")).sort()[0]
          if (vtt === undefined) throw new ErroreStrumento(`Il video non ha sottotitoli in «${lingua}», né scritti né automatici.`)
          return testo(righeDaVtt(await readFile(join(cartella, vtt), "utf-8")).join("\n"))
        } finally {
          await rm(cartella, { recursive: true, force: true })
        }
      }),
  )

  server.registerTool(
    "girato_foto",
    {
      description: `Frames of a footage file at its own seconds, as shrunk but readable images: to see what a take, a downloaded video or a recorded screen shows before putting it in a plan (where the person is, what the screen frames). At most ${FOTO_MASSIME} seconds at a time.`,
      inputSchema: {
        file: z.string().min(1).describe("The footage file written `day/name`, as the folder archivio/grezzo/ names it (e.g. «2026-10-06/IMG_5106.MOV»)."),
        secondi: z.array(z.number().min(0)).min(1).max(FOTO_MASSIME).describe("The seconds of the file to look at, from the first (0) on."),
      },
      annotations: SOLA_LETTURA,
    },
    ({ file, secondi }) =>
      comeStrumento(async () => {
        if (file.startsWith("-")) throw new ErroreStrumento("Il file si scrive `giorno/nome`, come lo nomina archivio/grezzo/.")
        const percorsi = (await motore(["foto-girato", file, ...secondi.map(String)])).split("\n").filter((r) => r.length > 0)
        return { content: await etichettate(percorsi, (i) => `Secondo ${secondi[i]} di ${file}`) }
      }),
  )

  server.registerTool(
    "slide",
    {
      description: `The slides of a carousel (uscite/slide-<n>.png, produced by the «carosello» job), as shrunk but readable images, in number order: all of them, or the requested ones. At most ${FOTO_MASSIME} at a time. If the render of that carousel is queued or running, it first waits for it to finish: the slides returned are always those of the latest render.`,
      inputSchema: {
        slug,
        numeri: z.array(z.number().int().min(1)).min(1).max(FOTO_MASSIME).optional().describe("The numbers of the slides to look at (from 1); if missing, all of them."),
      },
      annotations: SOLA_LETTURA,
    },
    ({ slug, numeri }) =>
      comeStrumento(async () => {
        const leggi = () => chiamaApi<DettaglioDelVideo & { scheda: { formato?: string } | null }>(o.api, "GET", `/api/video/${slug}`)
        let v = await leggi()
        // Chiesta insieme a lavoro_aspetta (di sola lettura, quindi in parallelo), leggerebbe i PNG della resa di prima.
        if (v.lavoro?.comando === "carosello") {
          const fine = await aspettaFine(o.api, v.lavoro.id, ATTESA_MASSIMA)
          if (fine.stato !== "finito") throw new ErroreStrumento(`La resa delle slide di «${slug}» è ancora ${fine.stato} dopo ${ATTESA_MASSIMA} secondi: richiama «slide» quando è finita.`)
          v = await leggi()
        }
        if (v.scheda?.formato !== "carosello") throw new ErroreStrumento(`«${slug}» non è un carosello: per un video usa «foto».`)
        const rese = v.uscite.map((u) => /\/uscite\/slide-(\d+)\.png$/.exec(u.file)?.[1]).filter((n): n is string => n !== undefined).map(Number).sort((x, y) => x - y)
        if (rese.length === 0) throw new ErroreStrumento(`«${slug}» non ha ancora slide: scrivile in materiali/carosello.html e rendile col lavoro «carosello».`)
        const mancanti = (numeri ?? []).filter((n) => !rese.includes(n))
        if (mancanti.length > 0) throw new ErroreStrumento(`Non c'è la slide ${mancanti.join(", ")}: ci sono le slide da 1 a ${rese.at(-1)}.`)
        const scelte = numeri ?? rese.slice(0, FOTO_MASSIME)
        const contenuto: CallToolResult["content"] = []
        for (const n of scelte) contenuto.push({ type: "text", text: `Slide ${n}` }, await rimpicciolisci(o.ffmpeg, join(v.cartella, "uscite", `slide-${n}.png`)))
        if (!numeri && rese.length > FOTO_MASSIME) contenuto.push({ type: "text", text: `Le slide sono ${rese.length}: chiedi le altre con «numeri».` })
        return { content: contenuto }
      }),
  )

  server.registerTool(
    "scene_foto",
    {
      description:
        `The key frames of an animated scene (scenes live in animazioni/), as shrunk images, with the outcome of the automatic checks: text under 40 px, text or drawings outside the usable band, a background that stays still. controlli: "falliti" is a result, not an error: each report says what to fix in the scene. It draws the scene in a browser on the graphics card: it takes from a few tens of seconds to a few minutes, plus the wait if another job is running (it goes through the same queue as the engine jobs, one at a time, and shows in the creator's jobs panel). If it runs out of time (${ATTESA_MASSIMA} seconds) it answers with the id of the job: call it again with that lavoro to collect the result without drawing the scene again.`,
      inputSchema: {
        sigla: z.string().regex(SIGLA, "La sigla ha solo lettere, numeri, trattini e trattini bassi.").describe("The scene code, as in the plan (e.g. «l1», «a3»)."),
        lavoro: z.string().min(1).optional().describe("The id of the job from a previous call that ran out of time."),
      },
    },
    ({ sigla, lavoro }) =>
      comeStrumento(async () => {
        const id = lavoro ?? (await chiamaApi<{ id: string }>(o.api, "POST", "/api/animazioni/foto", { sigla })).id
        const fine = await aspettaFine(o.api, id, ATTESA_MASSIMA)
        if (fine.stato !== "finito") throw new ErroreStrumento(`La resa della scena «${sigla}» è ancora ${fine.stato} dopo ${ATTESA_MASSIMA} secondi: richiama «scene_foto» con lavoro «${id}» per averla quando è finita.`)
        if (fine.esito !== "riuscito") throw new ErroreStrumento(fine.errore ?? `La resa della scena «${sigla}» non è riuscita (${fine.esito}).`)
        const { png, segnalazioni } = fine.risultato as RisultatoSceneFoto
        const contenuto: CallToolResult["content"] = [{ type: "text", text: JSON.stringify({ sigla, controlli: segnalazioni.length === 0 ? "superati" : "falliti", segnalazioni }) }]
        for (const percorso of png) contenuto.push({ type: "text", text: basename(percorso) }, await rimpicciolisci(o.ffmpeg, resolve(o.codice, percorso)))
        return { content: contenuto }
      }),
  )

  server.registerTool(
    "lavoro",
    {
      description:
        "Queues an engine job on a video and answers right away like lavoro_stato: the id, whether it is queued or already running, and the estimate in seconds (`stima`, from similar jobs already finished; `null` means there are not enough: say so, do not invent a duration). The queue runs one job at a time (there is one graphics card). On a video that was a proposal, the card moves to «in lavorazione». If the plan written in the file is not valid, the job is refused and the answer says what to fix (piano_ritocca). Then wait for the end with lavoro_aspetta. Commands: `prepara` (transcribes and prepares the footage the plan uses; long), `risolvi` (the real timings of the plan; already done by itself whenever a plan is written), `monta` (the final video; minutes), `anteprima` (only a part, quickly, to check a correction: give `scena` or `da` and `a`), `controlla` (listens to the rendered video again), `copertina` (the cover image with the cutout, give `disegno` and if needed `istante`), `carosello` (the slides of materiali/carosello.html into uscite/, with the checks on margins and caption; then look at them with «slide»), `prova` (the rehearsal to record against, uscite/prova.mp4, from the script in the card's `proposta`: skill «prova»; it needs no plan and the card stays «proposta»). The video must have a plan, except for `prova`; a carousel has none and accepts only `carosello`.",
      inputSchema: {
        slug,
        comando: z.enum(COMANDI_DEL_VIDEO),
        scena: z.string().optional().describe("Only for anteprima: the name of a scene of the plan."),
        da: z.number().optional().describe("Only for anteprima: the second of the video to start from (with `a`, instead of `scena`)."),
        a: z.number().optional().describe("Only for anteprima: the second of the video to end at, after `da`."),
        disegno: z.string().optional().describe("Only for copertina: the image as large as the frame, looked up in the video materials or given as a full path."),
        istante: z.number().optional().describe("Only for copertina: the second of the video to take the cutout from, if the first frame is not good."),
      },
    },
    ({ slug, ...richiesta }) =>
      comeStrumento(async () => {
        const { id } = await chiamaApi<{ id: string }>(o.api, "POST", `/api/video/${slug}/lavori`, richiesta)
        return json(await statoDelLavoro(o.api, id))
      }),
  )

  server.registerTool(
    "girato_prepara",
    {
      description:
        "Queues the preparation of one footage file (transcription with the instant of every word, light copy, waveform, thumbnail; a photo gets its whole upright image) and answers right away like `lavoro`: the id, whether it is queued or already running, and the estimate in seconds (`stima`; `null` means there are not enough similar jobs: say so, do not invent a duration). It goes through the same queue as every heavy job, one at a time on the graphics card: never run the engine's `prepara-file` from the shell. Wait for the end with lavoro_aspetta.",
      inputSchema: {
        file: z.string().min(1).describe("The footage file written `day/name`, as the folder archivio/grezzo/ names it (e.g. «2026-10-06/IMG_5106.MOV»)."),
        ritrascrivi: z.boolean().default(false).describe("Redo the transcription even if the file is already prepared: after changing its `lingua` with girato_scheda, or when the words came out wrong. The rest of the preparation stays."),
      },
    },
    ({ file, ritrascrivi }) =>
      comeStrumento(async () => {
        const { id } = await chiamaApi<{ id: string }>(o.api, "POST", "/api/grezzo/prepara", { file, ritrascrivi })
        return json(await statoDelLavoro(o.api, id))
      }),
  )

  server.registerTool(
    "girato_scheda",
    {
      description:
        "Changes the card of a footage file by giving only the fields to change (as scheda_cambia does for a video): `lingua` (the language spoken, two letters, e.g. «en» for a keynote in English: the transcription uses it), `note`, `tipo`, `origine`…; `null` removes a field. The server validates it against the schema: if invalid it answers with what to fix and the file does not change. Returns the new card. After changing `lingua` of a prepared file, redo its words with girato_prepara and `ritrascrivi`.",
      inputSchema: {
        file: z.string().min(1).describe("The footage file written `day/name`, as the folder archivio/grezzo/ names it (e.g. «2026-10-21/keynote.mp4»)."),
        campi: z.record(z.string(), z.unknown()).describe("The fields to change, as in the card; `null` to remove one."),
      },
    },
    ({ file, campi }) => comeStrumento(async () => json((await chiamaApi<{ scheda: unknown }>(o.api, "PATCH", `/api/grezzo/scheda?file=${encodeURIComponent(file)}`, campi)).scheda)),
  )

  server.registerTool(
    "girato_scarica",
    {
      description:
        "Downloads a video from the web into the footage with yt-dlp, whole or only the part from `da` to `a`, as an mp4 (H.264 and AAC when the source has them, at most the height set in the style), and answers right away like `lavoro`. It is a job of the same queue, one at a time. When it ends, the last line of the job is «Scaricato: <day>/<name>.mp4»: that is the `file` to use in plans and with girato_prepara; it already has its card (origine «scaricato», the address, the part, the title and channel of the video). For a long video always give `da` and `a`: the disk is limited. Never write into archivio/grezzo/ by hand and never run yt-dlp from the shell: this is the way in. Then wait for the end with lavoro_aspetta.",
      inputSchema: {
        url: z.string().min(1).describe("The address of the video, starting with http:// or https://."),
        da: z.union([z.number().min(0), z.string()]).optional().describe("Where the part starts: seconds (90) or minutes and seconds (1:30, or 1:02:03). If missing, from the start."),
        a: z.union([z.number().min(0), z.string()]).optional().describe("Where the part ends, after `da`, written the same way. If missing, to the end."),
        nome: z.string().optional().describe("The file name without folders (e.g. «keynote»; .mp4 is added). If missing, it comes from the title of the video. A name already taken is never overwritten: a number is added."),
      },
    },
    ({ url, da, a, nome }) =>
      comeStrumento(async () => {
        const { id } = await chiamaApi<{ id: string }>(o.api, "POST", "/api/grezzo/scarica", { url, da, a, nome })
        return json(await statoDelLavoro(o.api, id))
      }),
  )

  server.registerTool(
    "lavoro_stato",
    {
      description:
        "How a queued job is going: queued, running or finished. Queued and running give the estimate in seconds (`null`: not enough similar finished jobs to estimate it, say so); running also gives the seconds elapsed and `fine_prevista`, the computer clock time at which it should end («15:42»). When finished it gives the outcome (riuscito, fallito, fermato), the error and the last lines it wrote. It covers running jobs, queued jobs and the last 20 finished ones.",
      inputSchema: { id: z.string().min(1).describe("The id returned by the «lavoro» tool.") },
      annotations: SOLA_LETTURA,
    },
    ({ id }) => comeStrumento(async () => json(await statoDelLavoro(o.api, id))),
  )

  server.registerTool(
    "lavoro_aspetta",
    {
      description: `Waits for a job to finish, for at most the given time (default ${ATTESA_PREDEFINITA} seconds, at most ${ATTESA_MASSIMA}), and returns the outcome and the last lines. If the time runs out first, it answers with the state of that moment (in corso): call it again. There is no need to poll the state at intervals.`,
      inputSchema: {
        id: z.string().min(1).describe("The id returned by the «lavoro» tool."),
        secondi: z.number().min(1).max(ATTESA_MASSIMA).default(ATTESA_PREDEFINITA).describe("How long to wait at most."),
      },
      annotations: SOLA_LETTURA,
    },
    ({ id, secondi }) => comeStrumento(async () => json(await aspettaFine(o.api, id, secondi))),
  )

  return server
}
