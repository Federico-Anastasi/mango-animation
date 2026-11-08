// Gli allegati della chat in un vero browser contro il server vero (con una cartella dei dati temporanea e porte di prova):
// il ponte degli appunti dell'app è finto nella pagina, ma il resto è vero: l'incolla, il trascinamento, la rotta che copia
// il file, l'anteprima servita dal server. Non accende l'app.
//   node verifica/appunti-pagina.mjs
// Chiude solo ciò che ha avviato, per PID. Una foto per larghezza in `verifica/viste/`.
import { chromium } from "@playwright/test"
import { spawn, spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { entra, intestazioniDelServer } from "./chiave.mjs"

const qui = dirname(fileURLToPath(import.meta.url))
const PORTA = 47594
const origine = `http://127.0.0.1:${PORTA}`
const temp = mkdtempSync(join(tmpdir(), "mango-appunti-"))
const lavoro = join(temp, "dati")
mkdirSync(join(lavoro, "archivio"), { recursive: true })
const cartellaViste = join(qui, "viste")
mkdirSync(cartellaViste, { recursive: true })

const BUN = process.env.BUN_EXE ?? (process.platform === "win32" ? join(process.env.APPDATA ?? "", "npm", "node_modules", "bun", "bin", "bun.exe") : "bun")
const server = spawn(BUN, ["run", "src/avvia.ts"], {
  cwd: join(qui, "..", "..", "server"),
  env: { ...process.env, MANGO_ANIMATION_LAVORO: lavoro, MANGO_ANIMATION_PORTA: String(PORTA), MANGO_ANIMATION_PORTA_ARRIVI: String(PORTA + 1) },
  stdio: "ignore",
})
const chiudi = () => {
  spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" })
  rmSync(temp, { recursive: true, force: true })
}
process.on("exit", chiudi)

const KO = []
const ok = (frase) => console.log(`ok: ${frase}`)
const no = (frase) => (KO.push(frase), console.log(`NO: ${frase}`))
const prova = (condizione, frase) => (condizione ? ok(frase) : no(frase))

// Un PNG vero (un quadrato), per l'anteprima.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64")
const cartellaFile = join(temp, "Desktop")
mkdirSync(cartellaFile)
const nota = join(cartellaFile, "nota di prova.txt")
const foto = join(cartellaFile, "schermata.png")
writeFileSync(nota, "ciao dal documento\n")
writeFileSync(foto, PNG)

try {
  const fine = Date.now() + 60000
  // Il server scrive la chiave all'avvio, prima di ascoltare: appena risponde con la chiave giusta è pronto.
  const pronto = () => {
    try {
      return fetch(`${origine}/api/lavori`, { headers: intestazioniDelServer(lavoro) }).then((r) => r.ok, () => false)
    } catch {
      return false
    }
  }
  while (!(await pronto())) {
    if (Date.now() > fine) throw new Error("il server di prova non risponde")
    await new Promise((r) => setTimeout(r, 400))
  }
  const browser = await chromium.launch({ channel: "msedge" })
  const problemi = []
  for (const larghezza of [1400, 1000, 430]) {
    const pagina = await (await browser.newContext({ viewport: { width: larghezza, height: 900 } })).newPage()
    pagina.on("pageerror", (e) => problemi.push(`${larghezza}: ${e.message}`))
    // Il ponte finto: ciò che gli appunti di Windows "contengono" lo decide la prova.
    await pagina.addInitScript(() => {
      window.__appuntiProva = []
      window.__MANGO_ANIMATION__ = { appunti: { percorsi: async () => window.__appuntiProva } }
    })
    await entra(pagina, origine, lavoro)
    await pagina.goto(`${origine}/#/video`)
    await pagina.getByRole("button", { name: /^Chat/ }).click()
    const pannello = pagina.getByRole("complementary", { name: "Chat", exact: true })
    await pannello.waitFor()
    const campo = pannello.getByRole("textbox", { name: "Messaggio" })
    const elenco = pannello.getByRole("list", { name: "Allegati" })
    await campo.focus()

    const incolla = (riempi) =>
      campo.evaluate((el, f) => {
        const dt = new DataTransfer()
        if (f === "testo") dt.setData("text/plain", "una frase copiata")
        const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })
        el.dispatchEvent(ev)
        return ev.defaultPrevented
      }, riempi)

    // Ctrl+V di testo: resta testo, la pagina non lo ferma.
    prova((await incolla("testo")) === false, `${larghezza}: l'incolla di testo non è fermata dalla pagina`)

    // Ctrl+V con due file negli appunti: uno di testo e un'immagine.
    await pagina.evaluate(([a, b]) => (window.__appuntiProva = [a, b]), [nota, foto])
    prova((await incolla("vuoto")) === true, `${larghezza}: Ctrl+V senza file né testo passa dall'app`)
    await pannello.getByText("nota di prova.txt").waitFor({ timeout: 10000 }).catch(() => undefined)
    const anteprima = pannello.getByRole("img", { name: "schermata.png" })
    await anteprima.waitFor({ timeout: 10000 }).catch(() => undefined)
    prova((await elenco.getByRole("listitem").count()) === 2, `${larghezza}: due allegati nel campo`)
    await pagina.waitForFunction(() => document.querySelector('button[aria-label="Manda"]')?.disabled === false, null, { timeout: 10000 }).catch(() => undefined)
    prova(await pannello.getByRole("button", { name: "Manda" }).isEnabled(), `${larghezza}: finiti di caricare si può mandare`)
    const larga = await anteprima.evaluate((img) => img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0).catch(() => false)
    prova(larga, `${larghezza}: l'anteprima dell'immagine è servita dal server e si vede`)
    prova(!(await pagina.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)), `${larghezza}: nessuno scorrimento orizzontale`)
    await pagina.screenshot({ path: join(cartellaViste, `appunti-pagina-${larghezza}.png`) })

    // Un file che non c'è più: l'errore compare sull'allegato.
    await pagina.evaluate(([x]) => (window.__appuntiProva = [x]), [join(cartellaFile, "sparito.txt")])
    await incolla("vuoto")
    prova(await pannello.getByText(/Non caricato: .*non c'è/).waitFor({ timeout: 10000 }).then(() => true, () => false), `${larghezza}: un file sparito lo dice`)

    // Il trascinamento: un `drop` con un file arriva al pannello.
    const prima = await elenco.getByRole("listitem").count()
    await pannello.evaluate((el) => {
      const dt = new DataTransfer()
      dt.items.add(new File(["trascinato"], "trascinato.txt", { type: "text/plain" }))
      el.dispatchEvent(new DragEvent("dragenter", { dataTransfer: dt, bubbles: true, cancelable: true }))
      el.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }))
    })
    await pannello.getByText("trascinato.txt").waitFor({ timeout: 10000 }).catch(() => undefined)
    prova((await elenco.getByRole("listitem").count()) === prima + 1, `${larghezza}: un file trascinato diventa un allegato`)
    await pagina.context().close()
  }
  console.log(problemi.length === 0 ? "nessun errore nella pagina" : `errori nella pagina:\n  ${problemi.join("\n  ")}`)
  if (problemi.length > 0) KO.push("errori nella pagina")
  await browser.close()
} finally {
  chiudi()
}
console.log(KO.length === 0 ? "tutto ok" : `\n${KO.length} passi falliti`)
process.exitCode = KO.length === 0 ? 0 : 1
