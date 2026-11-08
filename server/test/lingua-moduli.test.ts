import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import type { NetworkInterfaceInfo } from "node:os"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Opzioni } from "../src/configurazione"
import type { LetturaFirewall } from "../src/arrivi/firewall"
import { aspetta, avviaAmbiente, avviaConScarico, chiama, fermaTutti, scriviFintoYtdlp, type Ambiente } from "./aiuti"

let finto: { comando: string[]; video: string }
let cartellaDelFinto: string

beforeAll(async () => {
  cartellaDelFinto = await mkdtemp(join(tmpdir(), "mango-animation-finto-ytdlp-"))
  finto = await scriviFintoYtdlp(cartellaDelFinto)
})

afterAll(() => rm(cartellaDelFinto, { recursive: true, force: true }))
afterEach(fermaTutti)

type Lingua = "it" | "en"
interface Errore {
  errore: string
}

describe("lo scarico dal web", () => {
  interface Lavori {
    finiti: { id: string; esito: string; errore: string | null; righe: string[] }[]
  }
  const scarica = (a: Ambiente, corpo: unknown, lingua?: Lingua) => chiama<{ id: string } & Errore>(a, "POST", "/api/grezzo/scarica", corpo, lingua)
  const finito = (a: Ambiente, id: string) => aspetta(async () => (await chiama<Lavori>(a, "GET", "/api/lavori")).corpo.finiti.find((f) => f.id === id))

  test("una richiesta che non va dice cosa correggere in inglese", async () => {
    const a = await avviaConScarico(finto)
    const sbagliate: [unknown, string][] = [
      [{}, "«url» is missing: the address of the video to download."],
      [{ url: "esempio" }, "«url» is not a web address: it must start with http:// or https://."],
      [{ url: "https://esempio.test/ok", da: "abc" }, "«da» must be a moment in the video: seconds (90 or 12.5) or minutes and seconds (1:30)."],
      [{ url: "https://esempio.test/ok", da: 60, a: 10 }, "«a» must come after «da» (or after the start of the video, if «da» is missing)."],
      [{ url: "https://esempio.test/ok", nome: 7 }, "«nome» must be text: the file name, without folders."],
      [{ url: "https://esempio.test/ok", inizio: 3 }, "«inizio» is not a field of this request: the fields are url, da, a, nome."],
    ]
    for (const [corpo, frase] of sbagliate) {
      const r = await scarica(a, corpo, "en")
      expect([r.stato, r.corpo.errore]).toEqual([400, frase])
    }
    expect((await scarica(a, {})).corpo.errore).toBe("Manca «url»: l'indirizzo del video da scaricare.")
  })

  test("le righe e l'errore del lavoro sono nella lingua di chi l'ha chiesto, anche se parte dopo un altro lavoro", async () => {
    const a = await avviaConScarico(finto)
    const lento = await scarica(a, { url: "https://esempio.test/lento", nome: "lento" }, "it")
    await aspetta(async () => (await chiama<{ in_corso: { id: string } | null }>(a, "GET", "/api/lavori")).corpo.in_corso?.id === lento.corpo.id)
    const muto = await scarica(a, { url: "https://esempio.test/muto", nome: "x" }, "en")
    const buono = await scarica(a, { url: "https://esempio.test/ok", nome: "buono" }, "en")
    await writeFile(join(a.radice, "via-ytdlp"), "")

    expect((await finito(a, lento.corpo.id)).righe.at(-1)).toBe("Scaricato: 2026-10-06/lento.mp4")
    const fallito = await finito(a, muto.corpo.id)
    expect(fallito.errore).toBe("The download did not work: look at the last lines of the job.")
    expect(fallito.righe.at(-1)).toBe("yt-dlp exited with code 3.")
    expect((await finito(a, buono.corpo.id)).righe.at(-1)).toBe("Downloaded: 2026-10-06/buono.mp4")
  })

  test("se il video non c'è dopo lo scarico lo dice in inglese", async () => {
    const a = await avviaConScarico(finto)
    const r = await scarica(a, { url: "https://esempio.test/niente", nome: "x" }, "en")
    expect((await finito(a, r.corpo.id)).errore).toBe("The download finished but the video is not there: look at the last lines of the job.")
  })
})

describe("la registrazione", () => {
  const FINTO_FFMPEG = `for await (const pezzo of process.stdin) if (new TextDecoder().decode(pezzo).includes("q")) break
`

  test("senza ffmpeg, senza registrazione da fermare: lo stato e gli errori in inglese", async () => {
    const a = await avviaAmbiente()
    const stato = await chiama<{ disponibile: boolean; motivo: string }>(a, "GET", "/api/registrazione", undefined, "en")
    expect(stato.corpo.motivo).toBe("Recording needs a program that is missing on this computer (ffmpeg): install it, then restart Mango Animation.")
    expect((await chiama<{ motivo: string }>(a, "GET", "/api/registrazione")).corpo.motivo).toMatch(/^Per registrare serve/)
    expect((await chiama<Errore>(a, "POST", "/api/registrazione", { modo: "schermo" }, "en")).corpo.errore).toBe(stato.corpo.motivo)
    expect((await chiama<Errore>(a, "DELETE", "/api/registrazione", undefined, "en")).corpo.errore).toBe("No recording is running.")
  })

  test("con ffmpeg: nessun microfono, dispositivo non trovato, registrazione già in corso", async () => {
    const registrazione: Opzioni["registrazione"] = {
      comando: null,
      schermo: ["-i", "schermo"],
      codifica: () => [],
      elenca: async () => ({ microfoni: [], camere: [] }),
    }
    const a = await avviaAmbiente({ registrazione }, async (c) => {
      await writeFile(join(c.radice, "finto-ffmpeg.ts"), FINTO_FFMPEG)
      registrazione.comando = [process.execPath, join(c.radice, "finto-ffmpeg.ts")]
    })
    await aspetta(async () => (await chiama<{ dispositivi: unknown }>(a, "GET", "/api/registrazione")).corpo.dispositivi !== null)
    const avvia = (corpo: unknown) => chiama<Errore>(a, "POST", "/api/registrazione", corpo, "en")
    expect((await avvia({ modo: "voce" })).corpo.errore).toBe("I cannot find a microphone: plug one in, then «Look for devices again».")
    expect((await avvia({ modo: "viso" })).corpo.errore).toBe("I cannot find a microphone: plug one in, then «Look for devices again».")
    expect((await avvia({ modo: "voce", microfono: "Inesistente" })).corpo.errore).toBe("The microphone «Inesistente» is not among those found: choose another, or «Look for devices again».")
    expect((await avvia({ modo: "viso", camera: "Inesistente" })).corpo.errore).toBe("The webcam «Inesistente» is not among those found: choose another, or «Look for devices again».")

    expect((await avvia({ modo: "schermo" })).stato).toBe(201)
    expect((await avvia({ modo: "schermo" })).corpo.errore).toBe("A recording is already running: stop it before starting another.")
    expect((await avvia({ modo: "schermo" })).stato).toBe(409)
    expect((await chiama(a, "DELETE", "/api/registrazione")).stato).toBe(200)
  })

  test("senza webcam lo dice in inglese", async () => {
    const registrazione: Opzioni["registrazione"] = { comando: null, schermo: [], codifica: () => [], elenca: async () => ({ microfoni: ["Microfono"], camere: [] }) }
    const a = await avviaAmbiente({ registrazione }, async (c) => {
      await writeFile(join(c.radice, "finto-ffmpeg.ts"), FINTO_FFMPEG)
      registrazione.comando = [process.execPath, join(c.radice, "finto-ffmpeg.ts")]
    })
    await aspetta(async () => (await chiama<{ dispositivi: unknown }>(a, "GET", "/api/registrazione")).corpo.dispositivi !== null)
    expect((await chiama<Errore>(a, "POST", "/api/registrazione", { modo: "viso" }, "en")).corpo.errore).toBe("I cannot find a webcam: plug one in, then «Look for devices again».")
  })
})

describe("i file serviti", () => {
  const leggi = (a: Ambiente, percorso: string, lingua?: Lingua, extra: Record<string, string> = {}) =>
    fetch(`${a.url}${percorso}`, { headers: { ...a.accesso, ...(lingua ? { "X-Lingua": lingua } : {}), ...extra } })

  test("un file che non c'è e un indirizzo che non esiste, nelle due lingue", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await mkdir(join(c.radice, "studio-dist"), { recursive: true })
      await writeFile(join(c.radice, "studio-dist", "index.html"), "<!doctype html><title>studio</title>")
    })
    const mancante = await leggi(a, "/media/video/v/uscite/non-c-e.mp4", "en")
    expect(mancante.status).toBe(404)
    expect(((await mancante.json()) as Errore).errore).toBe("The file is not there.")
    expect(((await (await leggi(a, "/media/video/v/uscite/non-c-e.mp4")).json()) as Errore).errore).toBe("Il file non c'è.")
    expect(((await (await leggi(a, "/assets/mancante.js", "en")).json()) as Errore).errore).toBe("The file is not there.")
    expect(((await (await leggi(a, "/a%5Cb", "en")).json()) as Errore).errore).toBe("This address does not exist.")
    expect(((await (await leggi(a, "/a%5Cb")).json()) as Errore).errore).toBe("Questo indirizzo non esiste.")
  })

  test("l'interfaccia non costruita: la pagina segue la lingua del browser", async () => {
    const a = await avviaAmbiente()
    const italiano = await leggi(a, "/", undefined, { Accept: "text/html" })
    expect(italiano.status).toBe(503)
    const paginaIt = await italiano.text()
    expect(paginaIt).toContain('<html lang="it">')
    expect(paginaIt).toContain("L'interfaccia non è ancora costruita")
    const inglese = await (await leggi(a, "/", undefined, { Accept: "text/html", "Accept-Language": "en-GB,en;q=0.9" })).text()
    expect(inglese).toContain('<html lang="en">')
    expect(inglese).toContain("The interface is not built yet")
    expect(await (await leggi(a, "/", undefined, { Accept: "text/html", "Accept-Language": "it-IT,it;q=0.9" })).text()).toContain('<html lang="it">')
  })
})

describe("l'accesso alle API", () => {
  test("il 401 in JSON e la pagina del browser nelle due lingue", async () => {
    const a = await avviaAmbiente()
    const json = (lingua?: Lingua) => fetch(`${a.url}/api/video`, { headers: lingua ? { "X-Lingua": lingua } : {} }).then((r) => r.json() as Promise<Errore>)
    expect((await json("en")).errore).toBe(
      "The request does not carry the server key: put it in the X-Chiave-Api header (the key is in archivio/arrivi/chiave-api.json). Mango Animation opens from the app. From a terminal, the server prints at startup the link that opens the studio with the key.",
    )
    expect((await json()).errore).toStartWith("La richiesta non porta la chiave del server")

    const pagina = (lingua: string) => fetch(`${a.url}/`, { headers: { accept: "text/html", "accept-language": lingua } }).then((r) => r.text())
    const inglese = await pagina("en-US,en;q=0.9")
    expect(inglese).toContain('<html lang="en">')
    expect(inglese).toContain("Mango Animation opens from the app.")
    const italiano = await pagina("it-IT")
    expect(italiano).toContain('<html lang="it">')
    expect(italiano).toContain("si apre dall&#39;app")
  })

  test("/entra con un metodo che non va", async () => {
    const a = await avviaAmbiente()
    const r = await fetch(`${a.url}/entra`, { method: "POST", headers: { ...a.accesso, "X-Lingua": "en" } })
    expect(r.status).toBe(405)
    expect(((await r.json()) as Errore).errore).toBe("This method is not allowed here.")
  })
})

describe("lo stato degli arrivi e dello studio dalla rete", () => {
  const voce = (address: string): NetworkInterfaceInfo => ({ address, family: "IPv4", internal: false, netmask: "255.0.0.0", mac: "00:00:00:00:00:00", cidr: null }) as NetworkInterfaceInfo
  const interfacce = (): NodeJS.Dict<NetworkInterfaceInfo[]> => ({ Ethernet: [voce("192.168.1.20")], Tailscale: [voce("100.101.102.103")] })
  const avvia = async (extra: Parameters<typeof avviaAmbiente>[0] = {}): Promise<Ambiente> => {
    const a = await avviaAmbiente({ arrivi: { porta: 0, limiteByte: 20 * 1024 ** 3, indirizzo: "192.168.1.20", interfacce }, ...extra }, async (c) => {
      await mkdir(join(c.radice, "studio-dist"), { recursive: true })
      await writeFile(join(c.radice, "studio-dist", "index.html"), "<!doctype html><title>studio di prova</title>")
    })
    await chiama(a, "PUT", "/api/arrivi", { acceso: true })
    return a
  }
  const base = (a: Ambiente): string => `http://127.0.0.1:${a.server.portaArrivi}`
  const dallaRete = (a: Ambiente, percorso: string, headers: Record<string, string> = {}, metodo = "GET") => fetch(`${base(a)}${percorso}`, { method: metodo, headers, redirect: "manual" })

  test("la ricezione spenta, e il motivo di Windows che blocca, nelle due lingue", async () => {
    const a = await avviaAmbiente()
    const spenta = await chiama<{ motivo: string }>(a, "GET", "/api/arrivi", undefined, "en")
    expect(spenta.corpo.motivo).toBe("Receiving from the phone is off: connect a phone from the studio (Footage) to receive its files.")
    expect((await chiama<{ motivo: string }>(a, "GET", "/api/arrivi")).corpo.motivo).toMatch(/^La ricezione dal telefono è spenta/)

    const bloccata: LetturaFirewall = { regole: [{ azione: "Block", profili: "Any" }], reti: ["Private"] }
    const b = await avvia({ leggiFirewall: async () => bloccata })
    await aspetta(async () => (await chiama<{ firewall: string }>(b, "GET", "/api/arrivi")).corpo.firewall === "bloccato")
    const stato = await chiama<{ pronto: boolean; motivo: string }>(b, "GET", "/api/arrivi", undefined, "en")
    expect(stato.corpo.pronto).toBe(false)
    expect(stato.corpo.motivo).toStartWith("Windows blocks incoming files to Mango Animation. Open «Windows Security»")
    expect(stato.corpo.motivo).toEndWith("Then press «Check again».")
  })

  test("senza rete, con la rete pubblica e con la finestra del firewall ancora da confermare", async () => {
    const senzaRete = await avvia({ arrivi: { porta: 0, limiteByte: 1024 ** 3, indirizzo: "" } })
    const r = await chiama<{ motivo: string | null }>(senzaRete, "GET", "/api/arrivi", undefined, "en")
    expect(r.corpo.motivo).toBe("The computer is not connected to a network: connect it to your home Wi-Fi and reopen this page.")

    const pubblica: LetturaFirewall = { regole: [{ azione: "Allow", profili: "Private" }], reti: ["Public"] }
    const a = await avvia({ leggiFirewall: async () => pubblica })
    await aspetta(async () => (await chiama<{ firewall: string }>(a, "GET", "/api/arrivi")).corpo.firewall !== "non-controllato")
    expect((await chiama<{ motivo: string }>(a, "GET", "/api/arrivi", undefined, "en")).corpo.motivo).toStartWith("The Wi-Fi is set as a public network")
  })

  test("la porta occupata", async () => {
    const occupante = Bun.serve({ port: 0, hostname: "0.0.0.0", fetch: () => new Response("") })
    try {
      const a = await avvia({ arrivi: { porta: occupante.port!, limiteByte: 1024 ** 3, indirizzo: "192.168.1.20" } })
      const r = await chiama<{ errore: string }>(a, "GET", "/api/arrivi", undefined, "en")
      expect(r.corpo.errore).toBe(`Another program is already using channel ${occupante.port} of the computer: close it and restart Mango Animation.`)
    } finally {
      occupante.stop(true)
    }
  })

  test("lo studio dalla rete: il motivo di Tailscale nelle due lingue", async () => {
    const lettura: LetturaFirewall = { regole: [{ azione: "Allow", profili: "Private" }], reti: ["Private", "Public"], tailscale: ["Public"] }
    const a = await avvia({ leggiFirewall: async () => lettura })
    await aspetta(async () => (await chiama<{ firewall: string }>(a, "GET", "/api/arrivi")).corpo.firewall === "consentito")
    await chiama(a, "PUT", "/api/accesso-studio", { acceso: true })
    const stato = (lingua?: Lingua) => chiama<{ fuori: { motivo: string } }>(a, "GET", "/api/accesso-studio", undefined, lingua).then((r) => r.corpo.fuori.motivo)
    expect(await stato("en")).toStartWith("Windows does not let anything in from the Tailscale network.")
    expect(await stato()).toStartWith("Windows non lascia entrare dalla rete di Tailscale.")
  })

  test("senza sessione, con la chiave sbagliata, da un'altra pagina web: le frasi nella lingua dello studio", async () => {
    const a = await avvia()
    await chiama(a, "PUT", "/api/accesso-studio", { acceso: true })
    const errore = async (r: Response): Promise<string> => ((await r.json()) as Errore).errore

    expect(await errore(await dallaRete(a, "/api/video", { "X-Lingua": "en" }))).toBe(
      "There is no session, or it has expired. To get into the studio, open the link on the computer, in Footage, in the box «The studio on your phone».",
    )
    expect(await errore(await dallaRete(a, "/api/video"))).toStartWith("La sessione non c'è o è scaduta.")
    expect(await errore(await dallaRete(a, "/studio?chiave=sbagliata", { "X-Lingua": "en" }))).toStartWith("The studio key is not right.")
    expect(await errore(await dallaRete(a, "/studio?chiave=sbagliata", { "X-Lingua": "en" }, "POST"))).toBe("This method is not allowed here.")

    const pagina = await (await dallaRete(a, "/", { accept: "text/html", "accept-language": "en-GB" })).text()
    expect(pagina).toContain('<html lang="en">')
    expect(pagina).toContain("There is no session, or it has expired.")
    expect(await (await dallaRete(a, "/", { accept: "text/html", "accept-language": "it-IT" })).text()).toContain("La sessione non c&#39;è o è scaduta.")

    const chiave = (JSON.parse(await readFile(join(a.archivio, "arrivi", "studio-remoto.json"), "utf-8")) as { chiave: string }).chiave
    const cookie = (await fetch(`${base(a)}/studio?chiave=${encodeURIComponent(chiave)}`, { redirect: "manual" })).headers.get("set-cookie")!.split(";")[0]!
    expect(await errore(await dallaRete(a, "/api/video", { cookie, origin: "http://sito-cattivo.example", "X-Lingua": "en" }))).toBe("This request comes from another web page and I will not carry it out.")
  })
})

describe("nessuna frase italiana senza inglese", () => {
  const FILE = ["scarica", "registrazione", "media", "accesso", "sagoma", "canale", "caricatoreCanali", "arrivi/studio", "arrivi/accessoStudio"]
  // Un errore interno che finisce nel log o interrompe un flusso già avviato non è una frase per chi usa lo studio; il testo italiano della pagina «interfaccia non costruita» ha il suo inglese accanto.
  const AMMESSE = [/throw new Error\(/, /^\s*it: "<h1>/]

  const senzaFrasi = (testo: string): string => {
    let fuori = ""
    let da = 0
    for (;;) {
      const inizio = testo.indexOf("frase(", da)
      if (inizio < 0) return fuori + testo.slice(da)
      fuori += testo.slice(da, inizio)
      let fine = inizio + "frase".length
      let profondita = 0
      let apice: string | null = null
      for (; fine < testo.length; fine++) {
        const c = testo[fine]!
        if (apice !== null) {
          if (c === "\\") fine++
          else if (c === apice) apice = null
        } else if (c === '"' || c === "`" || c === "'") apice = c
        else if (c === "(") profondita++
        else if (c === ")" && --profondita === 0) break
      }
      da = fine + 1
    }
  }

  test("ogni testo italiano fra virgolette è dentro una frase nelle due lingue", async () => {
    const letterale = /"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`|'(?:[^'\\\n]|\\.)*'/g
    const italiano = /[«»èàòùì]|\b(?:non|il|la|che|per|una?)\b/
    const rimaste: string[] = []
    for (const nome of FILE) {
      const righe = senzaFrasi(await Bun.file(join(import.meta.dir, "..", "src", `${nome}.ts`)).text()).split("\n")
      righe.forEach((riga, i) => {
        if (/^\s*(\/\/|\/\*|\*)/.test(riga) || /console\.(error|log)/.test(riga) || AMMESSE.some((a) => a.test(riga))) return
        if ((riga.match(letterale) ?? []).some((l) => italiano.test(l))) rimaste.push(`${nome}.ts:${i + 1}: ${riga.trim()}`)
      })
    }
    expect(rimaste).toEqual([])
  })
})
