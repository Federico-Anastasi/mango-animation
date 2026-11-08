// Quanto l'anteprima «Piano» somiglia al montato: per ogni secondo dato disegna il «Piano» nel browser, prende lo stesso
// fotogramma dal montato con ffmpeg e dice il PSNR fra i due (più è alto più si somigliano; i caratteri e i bordi non coincidono al pixel, quindi non è mai infinito).
// Una foto per secondo, i due fotogrammi affiancati, in `verifica/viste/fedelta-<slug>-<secondo>.png`.
//   MANGO_ANIMATION_LAVORO=<cartella di lavoro> node verifica/fedelta.mjs <slug> <secondo...> [--porta 47431] [--browser chrome]
// Sul finto server (senza chiave): --url http://127.0.0.1:47541 --archivio <cartella dell'archivio>.
import { chromium } from "@playwright/test"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { entra, intestazioniDelServer } from "./chiave.mjs"

const argomenti = process.argv.slice(2)
const valore = (nome, predefinito) => (argomenti.includes(nome) ? argomenti[argomenti.indexOf(nome) + 1] : predefinito)
const posizionali = argomenti.filter((a, i) => !a.startsWith("--") && !(i > 0 && argomenti[i - 1].startsWith("--")))
const [slug, ...secondi] = posizionali
if (!slug || secondi.length === 0) throw new Error("Uso: node verifica/fedelta.mjs <slug> <secondo...> [--url …] [--archivio …] [--browser chrome]")
const lavoro = process.env.MANGO_ANIMATION_LAVORO
const origine = valore("--url", `http://127.0.0.1:${valore("--porta", process.env.MANGO_ANIMATION_PORTA ?? "47431")}`)
const archivio = valore("--archivio", lavoro ? join(lavoro, "archivio") : "")
if (!archivio) throw new Error("Manca l'archivio: MANGO_ANIMATION_LAVORO, oppure --archivio.")
const conChiave = lavoro !== undefined
const cartella = join(dirname(fileURLToPath(import.meta.url)), "viste")
mkdirSync(cartella, { recursive: true })
const temp = mkdtempSync(join(tmpdir(), "mango-fedelta-"))

const browser = await chromium.launch(valore("--browser", "") === "chrome" ? { channel: "chrome" } : {})
const pagina = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
try {
  if (conChiave) await entra(pagina, origine)
  else await pagina.goto(`${origine}/`)
  const dettaglio = await (await pagina.request.get(`${origine}/api/video/${slug}`, { headers: conChiave ? intestazioniDelServer() : {} })).json()
  if (!dettaglio.montato) throw new Error("Questo video non ha ancora un montato da confrontare.")
  if (!dettaglio.risolto) throw new Error("Questo video non ha il montaggio calcolato.")
  const { fps } = dettaglio.risolto.formato
  const unFotogramma = dettaglio.risolto.copertina ? 1 / fps : 0
  const file = join(archivio, ...dettaglio.montato.file.split("/"))
  console.log(`montato: ${dettaglio.montato.file}${dettaglio.risolto.copertina ? " (con la copertina in testa: un fotogramma in più)" : ""}${dettaglio.piano_dopo_montato ? "\nATTENZIONE: il piano è cambiato dopo questo montato, il confronto non è giusto." : ""}`)
  for (const t of secondi) {
    await pagina.goto(`${origine}/#/video/${slug}/montaggio?t=${t}`)
    await pagina.reload()
    await pagina.getByRole("button", { name: /^(Piano|Plan)$/ }).click().catch(() => undefined)
    await pagina.waitForSelector("[data-testid=palco] canvas")
    await pagina.waitForTimeout(3000)
    const browserPng = join(temp, `piano-${t}.png`)
    const montatoPng = join(temp, `montato-${t}.png`)
    await pagina.locator("[data-testid=palco] canvas").screenshot({ path: browserPng })
    const estrai = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(Number(t) + unFotogramma), "-i", file, "-frames:v", "1", montatoPng], { encoding: "utf8" })
    if (estrai.status !== 0) throw new Error(`ffmpeg non ha estratto il secondo ${t}: ${estrai.stderr}`)
    const misure = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", montatoPng], { encoding: "utf8" }).stdout.trim().split(",")
    const [larghezza, altezza] = misure.map(Number)
    const confronto = spawnSync("ffmpeg", ["-hide_banner", "-i", browserPng, "-i", montatoPng, "-lavfi", `[0:v]scale=${larghezza}:${altezza}[a];[a][1:v]psnr`, "-f", "null", "-"], { encoding: "utf8" })
    const psnr = /average:(\S+)/.exec(confronto.stderr)?.[1] ?? "?"
    spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", browserPng, "-i", montatoPng, "-filter_complex", `[0:v]scale=${larghezza}:${altezza}[a];[a][1:v]hstack`, join(cartella, `fedelta-${slug}-${t}.png`)])
    console.log(`secondo ${t}: PSNR ${psnr} dB`)
  }
} finally {
  await browser.close()
  rmSync(temp, { recursive: true, force: true })
}
