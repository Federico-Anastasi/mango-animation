import { afterEach, describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import type { NetworkInterfaceInfo } from "node:os"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { AccessoStudio } from "../src/arrivi/accessoStudio"
import { indirizziTailscale } from "../src/arrivi/rete"
import type { LetturaFirewall } from "../src/arrivi/firewall"
import { contatori } from "../src/disco"
import { aspetta, avviaAmbiente, chiama, fermaTutti, scriviGrezzo, scriviVideo, type Ambiente } from "./aiuti"

afterEach(fermaTutti)

interface StatoStudio {
  acceso: boolean
  in_ascolto: boolean
  pronto: boolean
  motivo: string | null
  casa: { indirizzo: string; link: string; qr: string } | null
  fuori: { indirizzo: string; link: string; qr: string; pronto: boolean; motivo: string | null } | null
}

const voce = (address: string, family: "IPv4" | "IPv6" = "IPv4", internal = false): NetworkInterfaceInfo => ({ address, family, internal, netmask: "255.0.0.0", mac: "00:00:00:00:00:00", cidr: null }) as NetworkInterfaceInfo
const CON_TAILSCALE = (): NodeJS.Dict<NetworkInterfaceInfo[]> => ({ Ethernet: [voce("192.168.1.20")], Tailscale: [voce("100.101.102.103")] })
const SENZA_TAILSCALE = (): NodeJS.Dict<NetworkInterfaceInfo[]> => ({ Ethernet: [voce("192.168.1.20")] })

/** Con la ricezione dal telefono accesa, così la porta è in ascolto anche quando lo studio è spento: le prove guardano cosa risponde. */
const avvia = async (extra: Parameters<typeof avviaAmbiente>[0] = {}, interfacce: () => NodeJS.Dict<NetworkInterfaceInfo[]> = CON_TAILSCALE): Promise<Ambiente> => {
  const a = await avviaAmbiente({ arrivi: { porta: 0, limiteByte: 20 * 1024 ** 3, indirizzo: "192.168.1.20", interfacce }, ...extra }, async (c) => {
    await mkdir(join(c.radice, "studio-dist"), { recursive: true })
    await writeFile(join(c.radice, "studio-dist", "index.html"), "<!doctype html><title>studio di prova</title>")
  })
  await chiama(a, "PUT", "/api/arrivi", { acceso: true })
  return a
}

const base = (a: Ambiente): string => `http://127.0.0.1:${a.server.portaArrivi}`
const stato = async (a: Ambiente): Promise<StatoStudio> => (await chiama<StatoStudio>(a, "GET", "/api/accesso-studio")).corpo
const accendi = async (a: Ambiente): Promise<StatoStudio> => (await chiama<StatoStudio>(a, "PUT", "/api/accesso-studio", { acceso: true })).corpo
const percorsoDelLink = (link: string): string => new URL(link).pathname + new URL(link).search
const chiaveStudio = async (a: Ambiente): Promise<string> => JSON.parse(await readFile(join(a.archivio, "arrivi", "studio-remoto.json"), "utf-8")).chiave
const chiaveArrivi = async (a: Ambiente): Promise<string> => JSON.parse(await readFile(join(a.archivio, "arrivi", "chiave.json"), "utf-8")).chiave

/** Entra col link dello studio e dà il cookie che il server mette. */
async function entra(a: Ambiente, chiave?: string): Promise<{ risposta: Response; cookie: string | null }> {
  const risposta = await fetch(`${base(a)}/studio?chiave=${encodeURIComponent(chiave ?? (await chiaveStudio(a)))}`, { redirect: "manual" })
  const impostato = risposta.headers.get("set-cookie")
  return { risposta, cookie: impostato ? impostato.split(";")[0]! : null }
}

const dallaRete = (a: Ambiente, percorso: string, cookie: string | null, init: RequestInit & { headers?: Record<string, string> } = {}): Promise<Response> =>
  fetch(`${base(a)}${percorso}`, { ...init, headers: { ...(cookie ? { cookie } : {}), ...init.headers } })

async function accesa(extra: Parameters<typeof avviaAmbiente>[0] = {}): Promise<{ a: Ambiente; cookie: string }> {
  const a = await avvia(extra)
  await accendi(a)
  const { cookie } = await entra(a)
  if (!cookie) throw new Error("la prova non è riuscita a entrare")
  return { a, cookie }
}

describe("lo studio dalla rete è spento di base", () => {
  test("lo stato dice spento e non dà né link né codici; la rete non risponde a niente dello studio", async () => {
    const a = await avvia()
    expect(await stato(a)).toMatchObject({ acceso: false, casa: null, fuori: null })
    for (const percorso of ["/", "/api/video", "/api/eventi", "/assets/x.js", "/media/grezzo/a.mp4", "/studio?chiave=qualunque"]) {
      expect((await dallaRete(a, percorso, null)).status).toBe(404)
    }
  })

  test("spento, un cookie che era valido non basta", async () => {
    const { a, cookie } = await accesa()
    expect((await dallaRete(a, "/api/video", cookie)).status).toBe(200)
    await chiama(a, "PUT", "/api/accesso-studio", { acceso: false })
    expect((await dallaRete(a, "/api/video", cookie)).status).toBe(404)
  })

  test("accenderlo e spegnerlo si legge nello stato e si annuncia", async () => {
    const a = await avvia()
    const messaggi: string[] = []
    const controllo = new AbortController()
    const flusso = await fetch(`${a.url}/api/eventi`, { signal: controllo.signal, headers: a.accesso })
    void (async () => {
      const lettore = flusso.body!.getReader()
      try {
        for (;;) {
          const { done, value } = await lettore.read()
          if (done) return
          messaggi.push(new TextDecoder().decode(value))
        }
      } catch {
        // chiuso dalla prova
      }
    })()
    const acceso = await accendi(a)
    expect(acceso.acceso).toBe(true)
    expect(acceso.casa?.link).toMatch(/^http:\/\/192\.168\.1\.20:\d+\/studio\?chiave=/)
    await aspetta(() => messaggi.join("").includes('"accesso-studio"'))
    expect((await chiama<StatoStudio>(a, "PUT", "/api/accesso-studio", { acceso: false })).corpo).toMatchObject({ acceso: false, casa: null })
    controllo.abort()
  })

  test("la richiesta di accendere deve essere {acceso: true|false}", async () => {
    const a = await avvia()
    expect((await chiama(a, "PUT", "/api/accesso-studio", { acceso: "sì" })).stato).toBe(400)
    expect((await chiama(a, "PUT", "/api/accesso-studio", {})).stato).toBe(400)
  })

  test("leggere lo stato non legge il disco", async () => {
    const a = await avvia()
    await accendi(a)
    const prima = contatori.letture
    for (let i = 0; i < 10; i++) await stato(a)
    expect(contatori.letture).toBe(prima)
  })
})

describe("senza sessione lo studio non passa", () => {
  test("acceso ma senza cookie: 401, e la richiesta non arriva al server dello studio", async () => {
    const a = await avvia()
    await scriviVideo(a, "uno")
    await accendi(a)
    await aspetta(async () => (await chiama<unknown[]>(a, "GET", "/api/video")).corpo.length === 1)
    for (const [metodo, percorso] of [["GET", "/"], ["GET", "/api/video"], ["GET", "/api/eventi"], ["GET", "/media/grezzo/a.mp4"], ["DELETE", "/api/video/uno"]] as const) {
      const r = await dallaRete(a, percorso, null, { method: metodo })
      expect(r.status).toBe(401)
    }
    expect((await chiama<unknown[]>(a, "GET", "/api/video")).corpo).toHaveLength(1)
  })

  test("a una pagina che si apre dal browser il 401 risponde con una frase leggibile, al resto in JSON", async () => {
    const a = await avvia()
    await accendi(a)
    const pagina = await dallaRete(a, "/", null, { headers: { accept: "text/html,application/xhtml+xml" } })
    expect(pagina.status).toBe(401)
    expect(pagina.headers.get("content-type")).toContain("text/html")
    expect(await pagina.text()).toContain("link")
    const dati = await dallaRete(a, "/api/video", null)
    expect(dati.headers.get("content-type")).toContain("application/json")
    expect(((await dati.json()) as { errore: string }).errore).toContain("link")
  })

  test("un cookie inventato, o con la chiave al posto della sessione, non vale", async () => {
    const a = await avvia()
    await accendi(a)
    expect((await dallaRete(a, "/api/video", "mango_studio=inventato")).status).toBe(401)
    expect((await dallaRete(a, "/api/video", `mango_studio=${await chiaveStudio(a)}`)).status).toBe(401)
  })

  test("le rotte degli arrivi restano con la loro chiave, e la chiave dello studio non le apre", async () => {
    const a = await avvia()
    await accendi(a)
    expect((await fetch(`${base(a)}/guarda?chiave=${await chiaveArrivi(a)}`)).status).toBe(200)
    expect((await fetch(`${base(a)}/guarda?chiave=${await chiaveStudio(a)}`)).status).toBe(401)
    expect((await fetch(`${base(a)}/carica?chiave=${await chiaveStudio(a)}`)).status).toBe(401)
  })
})

describe("entrare con la chiave", () => {
  test("chiave sbagliata, mancante o degli arrivi: 401, nessun cookie", async () => {
    const a = await avvia()
    await accendi(a)
    for (const chiave of ["sbagliata", "", await chiaveArrivi(a)]) {
      const { risposta, cookie } = await entra(a, chiave)
      expect(risposta.status).toBe(401)
      expect(cookie).toBeNull()
    }
    const senza = await fetch(`${base(a)}/studio`, { redirect: "manual" })
    expect(senza.status).toBe(401)
    expect(senza.headers.get("set-cookie")).toBeNull()
  })

  test("chiave giusta: rimanda a «/» con un cookie HttpOnly, SameSite=Strict, a lunga scadenza, che non contiene la chiave", async () => {
    const a = await avvia()
    await accendi(a)
    const chiave = await chiaveStudio(a)
    const { risposta, cookie } = await entra(a, chiave)
    expect(risposta.status).toBe(303)
    expect(risposta.headers.get("location")).toBe("/")
    const impostato = risposta.headers.get("set-cookie")!
    expect(impostato).toMatch(/^mango_studio=[\w-]{20,};/)
    expect(impostato).toContain("HttpOnly")
    expect(impostato).toContain("SameSite=Strict")
    expect(impostato).toContain("Path=/")
    expect(Number(/Max-Age=(\d+)/.exec(impostato)?.[1])).toBeGreaterThanOrEqual(30 * 86400)
    expect(impostato).not.toContain(chiave)
    expect(risposta.headers.get("cache-control")).toBe("no-store")
    expect(cookie).not.toBeNull()
  })

  test("col cookie si vede lo studio: la pagina, le API, i file", async () => {
    const { a, cookie } = await accesa()
    await scriviVideo(a, "uno")
    await scriviGrezzo(a, "2026-10-09/a.bin", "abc")
    const pagina = await dallaRete(a, "/", cookie)
    expect(pagina.status).toBe(200)
    expect(await pagina.text()).toContain("studio di prova")
    expect((await dallaRete(a, "/api/lavori", cookie)).status).toBe(200)
    expect((await dallaRete(a, "/media/grezzo/2026-10-09/a.bin", cookie)).status).toBe(200)
    expect((await dallaRete(a, "/api/non-esiste", cookie)).status).toBe(404)
  })

  test("la sessione sta nel file con la sua impronta, mai col suo valore", async () => {
    const { a, cookie } = await accesa()
    const testo = await readFile(join(a.archivio, "arrivi", "studio-remoto.json"), "utf-8")
    const token = cookie.split("=")[1]!
    expect(testo).not.toContain(token)
    expect(testo).toContain(createHash("sha256").update(token).digest("hex"))
  })
})

describe("la richiesta che passa", () => {
  test("una pagina di un altro sito non può usare lo studio, nemmeno con il cookie: Origin estraneo, 403 e niente eseguito", async () => {
    const { a, cookie } = await accesa()
    await scriviVideo(a, "uno")
    const corpo = JSON.stringify({ percorso: "video/uno" })
    const json = { "content-type": "application/json" }
    for (const origine of ["http://sito-cattivo.example", "http://192.168.1.20:80", "null", "http://127.0.0.1:1"]) {
      const r = await dallaRete(a, "/api/apri", cookie, { method: "POST", body: corpo, headers: { ...json, origin: origine } })
      expect(r.status).toBe(403)
    }
    const lettura = await dallaRete(a, "/api/video", cookie, { headers: { origin: "http://sito-cattivo.example" } })
    expect(lettura.status).toBe(403)
    expect(a.apertiInEsplora).toEqual([])
  })

  test("Origin che è l'indirizzo del ricevitore stesso, o assente: passa, col corpo e il metodo giusti", async () => {
    const { a, cookie } = await accesa()
    await scriviVideo(a, "uno")
    const corpo = JSON.stringify({ percorso: "video/uno" })
    const json = { "content-type": "application/json" }
    expect((await dallaRete(a, "/api/apri", cookie, { method: "POST", body: corpo, headers: { ...json, origin: base(a) } })).status).toBe(200)
    expect((await dallaRete(a, "/api/apri", cookie, { method: "POST", body: corpo, headers: json })).status).toBe(200)
    expect(a.apertiInEsplora).toHaveLength(2)
    expect((await dallaRete(a, "/api/apri", cookie, { method: "POST", body: corpo, headers: { "content-type": "text/plain" } })).status).toBe(400)
    expect((await dallaRete(a, "/api/video", cookie, { method: "OPTIONS" })).status).toBe(405)
  })

  test("il server dello studio non vede il cookie né l'origine della rete: risponde come a chi lo usa da 127.0.0.1", async () => {
    const { a, cookie } = await accesa()
    const diretta = await chiama(a, "GET", "/api/lavori")
    const girata = await dallaRete(a, "/api/lavori", cookie)
    expect(await girata.json()).toEqual(diretta.corpo)
  })

  test("l'accesso allo studio si cambia solo dal computer: dalla rete, 403 e lo stato non cambia", async () => {
    const { a, cookie } = await accesa()
    const json = { "content-type": "application/json" }
    expect((await dallaRete(a, "/api/accesso-studio", cookie)).status).toBe(403)
    expect((await dallaRete(a, "/api/accesso-studio", cookie, { method: "PUT", body: JSON.stringify({ acceso: false }), headers: json })).status).toBe(403)
    expect((await dallaRete(a, "/api/accesso-studio/chiave", cookie, { method: "POST" })).status).toBe(403)
    expect((await stato(a)).acceso).toBe(true)
    expect((await dallaRete(a, "/api/video", cookie)).status).toBe(200)
  })

  test("gli eventi passano a pezzi, man mano, senza aspettare la fine", async () => {
    const { a, cookie } = await accesa()
    const controllo = new AbortController()
    const r = await dallaRete(a, "/api/eventi", cookie, { signal: controllo.signal })
    expect(r.status).toBe(200)
    expect(r.headers.get("content-type")).toContain("text/event-stream")
    const lettore = r.body!.getReader()
    let ricevuto = ""
    const leggi = (async () => {
      try {
        for (;;) {
          const { done, value } = await lettore.read()
          if (done) return
          ricevuto += new TextDecoder().decode(value)
        }
      } catch {
        // chiuso dalla prova
      }
    })()
    await aspetta(() => ricevuto.includes(": aperto"))
    await chiama(a, "PUT", "/api/accesso-studio", { acceso: true })
    await aspetta(() => ricevuto.includes('"tipo":"accesso-studio"'))
    const prima = ricevuto.length
    await aspetta(() => ricevuto.length > prima + 5)
    controllo.abort()
    await leggi
  })

  test("un file a pezzi (Range) passa com'è: 206, Content-Range, solo i byte chiesti", async () => {
    const { a, cookie } = await accesa()
    await scriviGrezzo(a, "2026-10-09/a.bin", new Uint8Array(Array.from({ length: 256 }, (_, i) => i)), null)
    const r = await dallaRete(a, "/media/grezzo/2026-10-09/a.bin", cookie, { headers: { range: "bytes=10-19" } })
    expect(r.status).toBe(206)
    expect(r.headers.get("content-range")).toBe("bytes 10-19/256")
    expect([...new Uint8Array(await r.arrayBuffer())]).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19])
    const fuori = await dallaRete(a, "/media/grezzo/2026-10-09/a.bin", cookie, { headers: { range: "bytes=900-" } })
    expect(fuori.status).toBe(416)
    const testa = await dallaRete(a, "/media/grezzo/2026-10-09/a.bin", cookie, { method: "HEAD" })
    expect(testa.status).toBe(200)
    expect(testa.headers.get("content-length")).toBe("256")
    expect(testa.headers.get("accept-ranges")).toBe("bytes")
  })

  test("una richiesta col nome di un altro sito al posto dell'indirizzo (DNS rebinding) non passa, nemmeno col cookie", async () => {
    const { a, cookie } = await accesa()
    for (const percorso of ["/api/video", `/studio?chiave=${encodeURIComponent(await chiaveStudio(a))}`]) {
      const r = await dallaRete(a, percorso, cookie, { headers: { host: `sito-qualunque.example:${a.server.portaArrivi}` }, redirect: "manual" })
      expect(r.status, percorso).toBe(403)
      expect(r.headers.get("set-cookie")).toBeNull()
    }
    expect((await dallaRete(a, "/api/video", cookie)).status).toBe(200)
  })

  test("un percorso che esce dall'archivio non esce nemmeno passando di qui", async () => {
    const { a, cookie } = await accesa()
    for (const percorso of ["/media/../chiave.json", "/media/%2e%2e/arrivi/studio-remoto.json", "/media/..%5C..%5Cx"]) {
      const r = await dallaRete(a, percorso, cookie)
      expect(await r.text()).not.toContain("chiave")
    }
  })

  test("se il server dello studio non risponde: 502 con una frase", async () => {
    const { a, cookie } = await accesa()
    a.server.ricevitore.collegaStudio(1)
    const r = await dallaRete(a, "/api/video", cookie)
    expect(r.status).toBe(502)
  })
})

describe("rifare la chiave e spegnere", () => {
  test("rifare la chiave cambia il link e fa cadere le sessioni: il vecchio cookie e il vecchio link non valgono, il nuovo sì", async () => {
    const { a, cookie } = await accesa()
    const vecchia = await chiaveStudio(a)
    const nuovo = (await chiama<StatoStudio>(a, "POST", "/api/accesso-studio/chiave")).corpo
    expect(nuovo.acceso).toBe(true)
    const nuova = await chiaveStudio(a)
    expect(nuova).not.toBe(vecchia)
    expect(nuovo.casa?.link).toContain(encodeURIComponent(nuova))
    expect((await dallaRete(a, "/api/video", cookie)).status).toBe(401)
    expect((await entra(a, vecchia)).risposta.status).toBe(401)
    const { cookie: dopo } = await entra(a, nuova)
    expect((await dallaRete(a, "/api/video", dopo)).status).toBe(200)
  })

  test("spegnere e riaccendere: le sessioni di prima non tornano e nemmeno il vecchio link, che aveva la chiave di prima", async () => {
    const { a, cookie } = await accesa()
    const chiave = await chiaveStudio(a)
    await chiama(a, "PUT", "/api/accesso-studio", { acceso: false })
    await accendi(a)
    expect(await chiaveStudio(a)).not.toBe(chiave)
    expect((await dallaRete(a, "/api/video", cookie)).status).toBe(401)
    expect((await entra(a, chiave)).cookie).toBeNull()
    expect((await entra(a)).cookie).not.toBeNull()
  })

  test("spegnere o rifare la chiave chiude anche il flusso degli eventi già aperto dal telefono", async () => {
    for (const revoca of [(a: Ambiente) => chiama(a, "PUT", "/api/accesso-studio", { acceso: false }), (a: Ambiente) => chiama(a, "POST", "/api/accesso-studio/chiave")]) {
      const { a, cookie } = await accesa()
      const r = await dallaRete(a, "/api/eventi", cookie)
      const lettore = r.body!.getReader()
      let chiuso = false
      const leggi = (async () => {
        try {
          for (;;) if ((await lettore.read()).done) break
        } catch {
          // chiuso dal ricevitore
        }
        chiuso = true
      })()
      await Bun.sleep(100)
      expect(chiuso).toBe(false)
      await revoca(a)
      await aspetta(() => chiuso, 3000)
      await leggi
    }
  })
})

describe("l'indirizzo in casa e quello fuori casa", () => {
  test("acceso: due link, in casa e su Tailscale, ognuno col suo codice, con la stessa chiave dello studio", async () => {
    const a = await avvia()
    const s = await accendi(a)
    const chiave = await chiaveStudio(a)
    expect(s.casa!.indirizzo).toMatch(/^192\.168\.1\.20:\d+$/)
    expect(s.fuori!.indirizzo).toMatch(/^100\.101\.102\.103:\d+$/)
    expect(s.fuori).toMatchObject({ pronto: true, motivo: null })
    expect(s.casa!.link).toBe(`http://${s.casa!.indirizzo}/studio?chiave=${encodeURIComponent(chiave)}`)
    expect(s.fuori!.link).toBe(`http://${s.fuori!.indirizzo}/studio?chiave=${encodeURIComponent(chiave)}`)
    expect(s.casa!.qr).toContain("<svg")
    expect(s.fuori!.qr).toContain("<svg")
    expect(percorsoDelLink(s.casa!.link)).toBe(percorsoDelLink(s.fuori!.link))
  })

  test("senza Tailscale sul computer non c'è il link di fuori casa", async () => {
    const a = await avvia({}, SENZA_TAILSCALE)
    expect((await accendi(a)).fuori).toBeNull()
  })

  test("Windows non lascia entrare dalla rete di Tailscale: il link di fuori casa lo dice, quello di casa resta pronto", async () => {
    const lettura: LetturaFirewall = { regole: [{ azione: "Allow", profili: "Private" }], reti: ["Private", "Public"], tailscale: ["Public"] }
    const a = await avvia({ leggiFirewall: async () => lettura })
    await aspetta(async () => (await chiama<{ firewall: string }>(a, "GET", "/api/arrivi")).corpo.firewall === "consentito")
    const s = await accendi(a)
    expect(s.pronto).toBe(true)
    expect(s.fuori?.pronto).toBe(false)
    expect(s.fuori?.motivo).toContain("Tailscale")
    expect(s.fuori?.motivo).toContain("firewall")
  })

  test("la rete di Tailscale coperta dalla regola: pronto; senza notizie sul firewall: pronto", async () => {
    const coperta: LetturaFirewall = { regole: [{ azione: "Allow", profili: "Private" }], reti: ["Private"], tailscale: ["Private"] }
    const a = await avvia({ leggiFirewall: async () => coperta })
    await aspetta(async () => (await chiama<{ firewall: string }>(a, "GET", "/api/arrivi")).corpo.firewall === "consentito")
    expect((await accendi(a)).fuori?.pronto).toBe(true)
    const b = await avvia({ leggiFirewall: async () => null })
    expect((await accendi(b)).fuori?.pronto).toBe(true)
  })
})

describe("gli indirizzi di Tailscale", () => {
  test("solo IPv4 in 100.64.0.0/10, qualunque nome abbia l'interfaccia", () => {
    const interfacce = {
      Ethernet: [voce("192.168.1.20")],
      Rete: [voce("100.64.0.1"), voce("100.127.255.254"), voce("100.63.255.255"), voce("100.128.0.1"), voce("10.0.0.5")],
      Altra: [voce("fd7a:115c:a1e0::1", "IPv6"), voce("100.100.100.100", "IPv4", true)],
    }
    expect(indirizziTailscale(interfacce)).toEqual(["100.64.0.1", "100.127.255.254"])
  })
})

describe("l'accesso allo studio sopravvive ai riavvii", () => {
  test("acceso, chiave e sessioni si ritrovano; una sessione scaduta no; spegnere le toglie", async () => {
    const cartella = await mkdtemp(join(tmpdir(), "mango-animation-accesso-"))
    try {
      let ora = 1_000_000
      const apri = (): Promise<AccessoStudio> => AccessoStudio.carica(cartella, () => ora)
      const primo = await apri()
      expect(primo.acceso).toBe(false)
      await primo.imposta(true)
      const chiave = primo.chiave
      const token = await primo.entra(chiave)
      expect(token).not.toBeNull()

      const secondo = await apri()
      expect(secondo.acceso).toBe(true)
      expect(secondo.chiave).toBe(chiave)
      expect(secondo.valida(token)).toBe(true)
      expect(secondo.valida("altro")).toBe(false)

      ora += 365 * 86400_000
      expect(secondo.valida(token)).toBe(false)
      expect((await apri()).valida(token)).toBe(false)

      const nuovo = await secondo.entra(chiave)
      await secondo.imposta(false)
      expect(secondo.valida(nuovo)).toBe(false)
      expect(await secondo.entra(chiave)).toBeNull()
      expect((await apri()).acceso).toBe(false)
    } finally {
      await rm(cartella, { recursive: true, force: true })
    }
  })

  test("un file scritto male non accende niente: si riparte spenti, con una chiave nuova", async () => {
    const cartella = await mkdtemp(join(tmpdir(), "mango-animation-accesso-"))
    try {
      await writeFile(join(cartella, "studio-remoto.json"), "{ non è json")
      const accesso = await AccessoStudio.carica(cartella)
      expect(accesso.acceso).toBe(false)
      expect(accesso.chiave.length).toBeGreaterThanOrEqual(32)
    } finally {
      await rm(cartella, { recursive: true, force: true })
    }
  })

  test("le sessioni ricordate sono poche: la più vecchia cade", async () => {
    const cartella = await mkdtemp(join(tmpdir(), "mango-animation-accesso-"))
    try {
      const accesso = await AccessoStudio.carica(cartella)
      await accesso.imposta(true)
      const primo = await accesso.entra(accesso.chiave)
      for (let i = 0; i < 25; i++) await accesso.entra(accesso.chiave)
      expect(accesso.valida(primo)).toBe(false)
    } finally {
      await rm(cartella, { recursive: true, force: true })
    }
  })
})
