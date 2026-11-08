// Un archivio vero in una cartella temporanea, un server sulle sue porte libere e un finto motore
// (uno script Python che scrive righe su stdout e, secondo il comando, `lavoro/risolto.json`, `lavoro/controllo.json`,
// `uscite/anteprima.mp4` o le parole di un file preparato; o esce con 1).
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import type { Messaggio } from "../src/eventi"
import { creaServer, type Server } from "../src/server"
import type { Opzioni } from "../src/configurazione"
import { MangoCode } from "../src/chat/mangocode"
import type { OpzioniChat } from "../src/chat/tipi"

const REPO = join(import.meta.dir, "..", "..")

const FINTO_MOTORE = `import os, signal, subprocess, sys, time, json
if os.environ.get("FINTO_IGNORA_CTRL_C"):
    signal.signal(signal.SIGINT, signal.SIG_IGN)
    signal.signal(signal.SIGBREAK, signal.SIG_IGN)
radice = os.environ["MANGO_ANIMATION_LAVORO"]
archivio = os.path.join(radice, "archivio")
comando = sys.argv[1]
args = sys.argv[2:]
nome = args[0] if args else ""
def scrivi(riga):
    with open(os.path.join(radice, "chiamate.log"), "a", encoding="utf-8") as f:
        f.write(riga + "\\n")
scrivi("inizio " + comando + " " + " ".join(args))
print(comando + " " + " ".join(args), flush=True)
if comando == "risolvi" and os.path.exists(os.path.join(radice, "risolvi-rotto")):
    inglese = os.environ.get("MANGO_ANIMATION_LINGUA") == "en"
    print("The plan does not resolve: fix it and try again." if inglese else "Il piano non si risolve: correggilo e riprova.", file=sys.stderr, flush=True)
    sys.exit(1)
if comando == "risolvi":
    cartella = os.path.join(archivio, "video", nome, "lavoro")
    os.makedirs(cartella, exist_ok=True)
    with open(os.path.join(cartella, "risolto.json"), "w") as f:
        json.dump({"durata": 12.5}, f)
elif comando == "anteprima":
    cartella = os.path.join(archivio, "video", nome, "uscite")
    os.makedirs(cartella, exist_ok=True)
    with open(os.path.join(cartella, "anteprima.mp4"), "w") as f:
        f.write("x")
elif comando == "controlla":
    cartella = os.path.join(archivio, "video", nome, "lavoro")
    os.makedirs(cartella, exist_ok=True)
    with open(os.path.join(cartella, "controllo.json"), "w") as f:
        json.dump({"silenzi": []}, f)
elif comando == "prepara-file":
    cartella = os.path.join(archivio, "preparati", *nome.split("/"))
    os.makedirs(cartella, exist_ok=True)
    with open(os.path.join(cartella, "parole.json"), "w") as f:
        json.dump([], f)
elif comando == "prepara":
    inglese = os.environ.get("MANGO_ANIMATION_LINGUA") == "en"
    print("The file prova.mp4 is missing: copy it into archivio/grezzo/ and try again." if inglese else "Manca il file prova.mp4: copialo in archivio/grezzo/ e riprova.", file=sys.stderr, flush=True)
    scrivi("fine prepara " + nome)
    sys.exit(1)
elif comando == "copertina":
    sys.exit(4)
elif comando == "carosello":
    # Se la prova ha preparato una slide «nuova», aspetta il via e la mette al posto della slide 1.
    nuova = os.path.join(radice, "slide-nuova.png")
    if os.path.exists(nuova):
        for _ in range(600):
            if os.path.exists(os.path.join(radice, "via-" + nome)):
                break
            time.sleep(0.05)
        cartella = os.path.join(archivio, "video", nome, "uscite")
        os.makedirs(cartella, exist_ok=True)
        with open(nuova, "rb") as da, open(os.path.join(cartella, "slide-1.png"), "wb") as a:
            a.write(da.read())
elif comando == "monta":
    open(os.path.join(radice, "pid-" + nome), "w").write(str(os.getpid()))
    figlio = subprocess.Popen([sys.executable, "-c", "import signal, time; signal.signal(signal.SIGINT, signal.SIG_IGN); signal.signal(signal.SIGBREAK, signal.SIG_IGN); time.sleep(60)"])
    open(os.path.join(radice, "figlio-" + nome), "w").write(str(figlio.pid))
    for _ in range(600):
        if os.path.exists(os.path.join(radice, "via-" + nome)):
            break
        time.sleep(0.05)
    figlio.kill()
scrivi("fine " + comando + " " + " ".join(args))
`

const FINTO_YTDLP = `import json, os, shutil, sys, time
argv = sys.argv[1:]
log = os.environ["FINTO_YTDLP_LOG"]
with open(log, "a", encoding="utf-8") as f:
    f.write(json.dumps(argv) + "\\n")
url = argv[-1]
base = argv[argv.index("-o") + 1].replace(".%(ext)s", "")
if url.endswith("/rotto"):
    print("[youtube] abc: Downloading webpage", flush=True)
    print("ERROR: [youtube] abc: Video unavailable", file=sys.stderr, flush=True)
    sys.exit(1)
if url.endswith("/lento"):
    open(base + ".mp4.part", "w").write("x")
    print("[download]  10.0% of 5.00MiB", flush=True)
    via = os.path.join(os.path.dirname(log), "via-ytdlp")
    for _ in range(600):
        if os.path.exists(via):
            break
        time.sleep(0.05)
if url.endswith("/muto"):
    sys.exit(3)
if url.endswith("/niente"):
    sys.exit(0)
if "--skip-download" in argv:
    if not url.endswith("/senza-sottotitoli"):
        lingua = argv[argv.index("--sub-langs") + 1].split(",")[0]
        with open(base + "." + lingua + ".vtt", "w", encoding="utf-8") as f:
            f.write("WEBVTT\\n\\n00:01:02.500 --> 00:01:04.000\\nhello " + lingua + "\\n")
    sys.exit(0)
shutil.copy(os.environ["FINTO_YTDLP_VIDEO"], base + ".mp4")
info = {"id": "xyz789"} if url.endswith("/senza-titolo") else {"id": "abc123", "title": "Keynote: L'AI è qui!", "channel": "Apple", "webpage_url": url}
with open(base + ".info.json", "w", encoding="utf-8") as f:
    json.dump(info, f, ensure_ascii=False)
print("[download] 100% of 5.00MiB", flush=True)
`

/**
 * Un finto yt-dlp (uno script Python) e un video di un secondo che "scarica": `comando` va in `Opzioni.ytdlp`.
 * Gli indirizzi che finiscono per `/rotto`, `/niente`, `/lento` (aspetta `via-ytdlp` accanto al registro), `/senza-titolo` e
 * `/senza-sottotitoli` si comportano di conseguenza; con `--skip-download` scrive i sottotitoli della lingua chiesta.
 */
export async function scriviFintoYtdlp(cartella: string): Promise<{ comando: string[]; video: string }> {
  await mkdir(cartella, { recursive: true })
  const script = join(cartella, "finto_ytdlp.py")
  const video = join(cartella, "esempio.mp4")
  await writeFile(script, FINTO_YTDLP)
  const fatto = Bun.spawn(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=10", "-t", "1", "-pix_fmt", "yuv420p", "-y", video], { stdin: "ignore", stdout: "ignore", stderr: "inherit" })
  if ((await fatto.exited) !== 0) throw new Error("ffmpeg non ha fatto il video di prova")
  return { comando: ["python", script], video }
}

/** Le chiamate del finto yt-dlp, una lista di argomenti per chiamata. */
export async function chiamateDelFintoYtdlp(radice: string): Promise<string[][]> {
  try {
    return (await readFile(join(radice, "ytdlp.log"), "utf-8")).split(/\r?\n/).filter(Boolean).map((r) => JSON.parse(r) as string[])
  } catch {
    return []
  }
}

export interface Ambiente {
  /** La cartella di lavoro temporanea: l'archivio ci sta dentro, il codice in `codice`. */
  radice: string
  codice: string
  archivio: string
  stile: string
  server: Server
  url: string
  /** Le intestazioni che ogni richiesta alle API porta: la chiave del server. */
  accesso: Record<string, string>
  apertiInEsplora: { percorso: string; eCartella: boolean }[]
  /** Gli indirizzi che il server avrebbe aperto nel browser. */
  apertiNelBrowser: string[]
  ferma: () => Promise<void>
}

const ambienti: Ambiente[] = []

/**
 * La chat di base delle prove: nessun Claude Code vero (partirebbe una conversazione reale, a spese dell'account) e nessuna
 * conversazione vera di `~/.claude`. Le prove della chat passano la loro.
 */
function chatSenzaClaude(radice: string, archivio: string): OpzioniChat {
  return {
    query: () => {
      throw new Error("in questa prova Claude Code non c'è: passa una chat finta")
    },
    sessioni: { elenca: async () => [], leggi: async () => null, osserva: async () => ({ chiudi: () => undefined }) },
    mangoCode: new MangoCode({ dati: join(radice, "mango-code-finto"), archivio, adesso: () => new Date() }),
  }
}

export type Cartelle = Pick<Ambiente, "radice" | "archivio" | "stile">

/** `semina` scrive nell'archivio prima che il server parta: l'indice lo trova già pronto. */
/** Il finto motore in `<radice>/finto/finto_motore`: da mettere in `PYTHONPATH`. */
export async function scriviFintoMotore(radice: string): Promise<void> {
  await mkdir(join(radice, "finto", "finto_motore"), { recursive: true })
  await writeFile(join(radice, "finto", "finto_motore", "__main__.py"), FINTO_MOTORE)
}

export async function avviaAmbiente(extra: Partial<Opzioni> = {}, semina?: (cartelle: Cartelle) => Promise<void>): Promise<Ambiente> {
  const radice = await mkdtemp(join(tmpdir(), "mango-animation-prova-"))
  const archivio = join(radice, "archivio")
  const stile = join(radice, "repo", "stile.json")
  const codice = join(radice, "codice")
  await mkdir(codice, { recursive: true })
  await scriviFintoMotore(radice)
  await mkdir(dirname(stile), { recursive: true })
  await writeFile(stile, await readFile(join(REPO, "stile.json")))
  const apertiInEsplora: Ambiente["apertiInEsplora"] = []
  const apertiNelBrowser: string[] = []
  await semina?.({ radice, archivio, stile })

  const server = await creaServer({
    codice,
    lavoro: radice,
    archivio,
    stile,
    schemi: join(REPO, "motore", "schemi"),
    studio: join(radice, "studio-dist"),
    font: join(REPO, "font"),
    porta: 0,
    motore: { eseguibile: "python", modulo: "finto_motore", ambiente: { PYTHONPATH: join(radice, "finto") } },
    animazioni: { cartella: join(radice, "animazioni"), comando: [process.execPath, "-e", "console.log(JSON.stringify({ prova: [{ sigla: 'a', titolo: 'A', durata: 3 }] }))"] },
    arrivi: { porta: 0, limiteByte: 20 * 1024 ** 3, indirizzo: "192.168.1.20" },
    ffmpeg: null,
    ytdlp: null,
    registrazione: { comando: null, schermo: [], codifica: () => [], elenca: async () => ({ microfoni: [], camere: [] }) },
    rimbalzoMs: 40,
    quietoUsciteMs: 200,
    fermoMs: 150,
    battitoMs: 150,
    consumi: { cartella: join(radice, "conversazioni-finte"), quietoMs: 100 },
    schede: { prendi: async () => null, rendi: async () => null },
    chat: chatSenzaClaude(radice, archivio),
    leggiFirewall: async () => ({ regole: [{ azione: "Allow", profili: "Any" }], reti: ["Private"] }),
    mostraInEsplora: (percorso, eCartella) => void apertiInEsplora.push({ percorso, eCartella }),
    apriNelBrowser: (indirizzo) => void apertiNelBrowser.push(indirizzo),
    ...extra,
  })
  const ambiente: Ambiente = {
    radice: extra.lavoro ?? radice,
    codice: extra.codice ?? codice,
    archivio: extra.archivio ?? archivio,
    stile: extra.stile ?? stile,
    server,
    url: `http://127.0.0.1:${server.porta}`,
    accesso: { "X-Chiave-Api": server.chiaveApi },
    apertiInEsplora,
    apertiNelBrowser,
    ferma: async () => {
      await server.ferma()
      await rm(radice, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    },
  }
  ambienti.push(ambiente)
  return ambiente
}

/** Le 22:28:01 del 6 ottobre 2026: l'ora a cui il server di prova crede che arrivi ciò che scarica. */
export const ADESSO_DI_PROVA = new Date(2026, 9, 6, 22, 28, 1)

/** Un ambiente col finto yt-dlp al posto del vero, e il registro delle sue chiamate in `<radice>/ytdlp.log`. */
export async function avviaConScarico(finto: { comando: string[]; video: string }, extra: Partial<Opzioni> = {}, semina?: (cartelle: Cartelle) => Promise<void>): Promise<Ambiente> {
  const a = await avviaAmbiente(
    { ytdlp: finto.comando, arrivi: { porta: 0, limiteByte: 20 * 1024 ** 3, indirizzo: "192.168.1.20", adesso: () => ADESSO_DI_PROVA }, ...extra },
    semina,
  )
  process.env["FINTO_YTDLP_LOG"] = join(a.radice, "ytdlp.log")
  process.env["FINTO_YTDLP_VIDEO"] = finto.video
  return a
}

export async function fermaTutti(): Promise<void> {
  for (const ambiente of ambienti.splice(0).reverse()) await ambiente.ferma()
}

/** `lingua: "en"` chiede le frasi in inglese, come fa lo studio. */
export async function chiama<T = Record<string, unknown>>(a: Ambiente, metodo: string, percorso: string, corpo?: unknown, lingua?: "it" | "en"): Promise<{ stato: number; corpo: T; intestazioni: Headers }> {
  const risposta = await fetch(a.url + percorso, {
    method: metodo,
    headers: { ...a.accesso, ...(corpo === undefined ? {} : { "Content-Type": "application/json" }), ...(lingua === undefined ? {} : { "X-Lingua": lingua }) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })
  const testo = await risposta.text()
  return { stato: risposta.status, corpo: (testo ? JSON.parse(testo) : null) as T, intestazioni: risposta.headers }
}

export async function aspetta<T>(prova: () => T | Promise<T>, ms = 8000): Promise<NonNullable<T>> {
  const limite = Date.now() + ms
  for (;;) {
    const valore = await prova()
    if (valore) return valore as NonNullable<T>
    if (Date.now() > limite) throw new Error(`Non è successo entro ${ms} ms: ${prova.toString()}`)
    await Bun.sleep(25)
  }
}

export interface Ascolto {
  messaggi: Messaggio[]
  testo: () => string
  chiudi: () => void
}

/** Si attacca a `/api/eventi` e tiene i messaggi che arrivano. */
export async function ascolta(a: Ambiente): Promise<Ascolto> {
  const controllo = new AbortController()
  const risposta = await fetch(`${a.url}/api/eventi`, { signal: controllo.signal, headers: a.accesso })
  const messaggi: Messaggio[] = []
  let completo = ""
  let ricevuto = ""
  void (async () => {
    const lettore = risposta.body!.getReader()
    const decodifica = new TextDecoder()
    try {
      for (;;) {
        const { done, value } = await lettore.read()
        if (done) return
        const pezzo = decodifica.decode(value, { stream: true })
        completo += pezzo
        ricevuto += pezzo
        const blocchi = ricevuto.split("\n\n")
        blocchi.slice(0, -1).forEach((b) => b.startsWith("data: ") && messaggi.push(JSON.parse(b.slice(6)) as Messaggio))
        ricevuto = blocchi[blocchi.length - 1] ?? ""
      }
    } catch {
      // chiuso dalla prova
    }
  })()
  return { messaggi, testo: () => completo, chiudi: () => controllo.abort() }
}

export const piano = (file = "2026-10-06/a.mp4"): Record<string, unknown> => ({
  quadro: "girato-pieno",
  sorgenti: { a: { file } },
  scene: [{ nome: "s", pezzi: [{ sorgente: "a", da: 0, a: 2 }] }],
})

export async function scriviGrezzo(a: Cartelle, file: string, contenuto: string | Uint8Array = "x", scheda: object | null = { tipo: "ripresa", origine: "telefono", durata: 2 }): Promise<void> {
  const percorso = join(a.archivio, "grezzo", file)
  await mkdir(dirname(percorso), { recursive: true })
  if (scheda) await writeFile(`${percorso}.scheda.json`, JSON.stringify(scheda))
  await writeFile(percorso, contenuto)
}

export async function scriviVideo(a: Cartelle, slug: string, scheda: object = { titolo: slug, stato: "proposta", creato: "2026-10-06" }, pianoDelVideo?: object): Promise<void> {
  const cartella = join(a.archivio, "video", slug)
  await mkdir(cartella, { recursive: true })
  await writeFile(join(cartella, "scheda.json"), JSON.stringify(scheda))
  if (!pianoDelVideo) return
  await writeFile(join(cartella, "piano.json"), JSON.stringify(pianoDelVideo, null, 2))
  // Un video con un piano ha anche il suo risolto, scritto dopo: all'avvio il server non lo trova indietro e non lo rifà.
  await mkdir(join(cartella, "lavoro"), { recursive: true })
  await writeFile(join(cartella, "lavoro", "risolto.json"), JSON.stringify({ durata: 12.5 }))
}

export const righeDelFinto = async (a: Cartelle): Promise<string[]> => {
  try {
    return (await readFile(join(a.radice, "chiamate.log"), "utf-8")).split(/\r?\n/).filter(Boolean)
  } catch {
    return []
  }
}
