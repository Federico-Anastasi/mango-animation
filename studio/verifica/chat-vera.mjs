// La chat contro un server vero con un Claude vero: si scrive nel campo tasto per tasto, si manda con Invio, si guarda la
// risposta che arriva, la riga di uno strumento del progetto e un file scritto senza che venga chiesto un permesso. Tutto dentro la pagina
// di Playwright: nessun input verso il sistema. Un foto per passo in `verifica/viste/`.
//   MANGO_ANIMATION_LAVORO=<cartella> MANGO_ANIMATION_PORTA=47600 MANGO_ANIMATION_PORTA_ARRIVI=47601 bun run --cwd server avvia    (un server tuo, mai quello della 47431)
//   MANGO_ANIMATION_LAVORO=<la stessa cartella> node verifica/chat-vera.mjs --url http://127.0.0.1:47600 [--browser chrome] [--larghezza 1400]
// Il server vuole la chiave (`chiave.mjs`): la legge dalla cartella di lavoro e la pagina entra da `/entra`.
// Il terzo passo vuole un carosello con delle slide: `--carosello <slug>`, oppure `carosello-dispensa` dell'archivio di prova
// (`bun run archivio <cartella di lavoro>/archivio`, in `studio/`).
import { chromium } from "@playwright/test"
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { entra } from "./chiave.mjs"

const argomenti = process.argv.slice(2)
const valore = (nome, predefinito) => (argomenti.includes(nome) ? argomenti[argomenti.indexOf(nome) + 1] : predefinito)
const origine = valore("--url", "")
if (!origine || origine.endsWith(":47431")) throw new Error("Serve --url di un server di prova su una porta libera: la 47431 è del server in uso.")
const larghezza = Number(valore("--larghezza", "1400"))
const carosello = valore("--carosello", "carosello-dispensa")
const cartella = join(dirname(fileURLToPath(import.meta.url)), "viste")
mkdirSync(cartella, { recursive: true })

const browser = await chromium.launch(valore("--browser", "") === "chrome" ? { channel: "chrome" } : {})
const pagina = await (await browser.newContext({ viewport: { width: larghezza, height: 900 } })).newPage()
const problemi = []
pagina.on("console", (m) => m.type() === "error" && problemi.push(`console: ${m.text()}`))
pagina.on("pageerror", (e) => problemi.push(`pagina: ${e.message}`))

let passo = 0
const foto = async (nome) => {
  passo += 1
  await pagina.screenshot({ path: join(cartella, `chat-vera-${larghezza}-${String(passo).padStart(2, "0")}-${nome}.png`) })
  console.log(`foto ${passo}: ${nome}`)
}
const ok = (frase) => console.log(`ok: ${frase}`)

await entra(pagina, origine)
await pagina.goto(`${origine}/#/video`)
await pagina.getByRole("button", { name: /^Chat/ }).click()
const aside = pagina.getByRole("complementary", { name: "Chat", exact: true })
await aside.waitFor()
await pagina.getByRole("button", { name: "Nuova conversazione" }).click()
const campo = pagina.getByRole("textbox", { name: "Messaggio" })
await foto("chat-vuota")

// 1. Una domanda che usa uno strumento video.
await campo.click()
await campo.pressSequentially("Quanti video ci sono? Usa lo strumento video_elenco e rispondi in una riga.", { delay: 12 })
await foto("scritto")
await campo.press("Enter")
await aside.getByText("Quanti video ci sono?").first().waitFor({ timeout: 15000 })
await foto("mandato")
const rigaStrumento = aside.getByRole("button", { name: /Video · elenco dei video/ })
await rigaStrumento.waitFor({ timeout: 120000 })
ok("la riga dello strumento «Video · elenco dei video» compare")
await foto("strumento")
await aside.getByText(/^Fatto in /).first().waitFor({ timeout: 180000 })
ok("il giro finisce con la durata")
await rigaStrumento.click()
await aside.getByText("Cosa ha chiesto").waitFor()
await foto("strumento-aperto")
await rigaStrumento.click()
await foto("risposta")

// 2. Scrivere un file fuori dal progetto: nessuna richiesta di permesso (la chat parte con i permessi saltati), il file c'è.
await campo.click()
const file = join(tmpdir(), "chat-prova.txt")
rmSync(file, { force: true })
await campo.pressSequentially(`Scrivi il file ${file} con dentro solo la parola ciao-dalla-chat, poi dimmi che l'hai fatto.`, { delay: 12 })
await campo.press("Enter")
await aside.getByText(/^Fatto in /).nth(1).waitFor({ timeout: 180000 })
if ((await aside.getByRole("button", { name: "Consenti", exact: true }).count()) > 0) throw new Error("è comparsa una richiesta di permesso")
if (!existsSync(file) || !readFileSync(file, "utf8").includes("ciao-dalla-chat")) throw new Error("il file non è stato scritto")
rmSync(file)
ok("il file è scritto e nessun permesso è stato chiesto")
await foto("senza-permesso")

// 3. Un carosello aperto: «questo carosello» basta, perché il video aperto parte col messaggio; le immagini dello strumento nella chat.
await pagina.goto(`${origine}/#/video/${carosello}/slide`)
await pagina.reload()
await aside.waitFor()
await campo.fill("")
await campo.pressSequentially("Guarda le slide 1 e 2 di questo carosello con lo strumento slide e dimmi in una riga cosa vedi.", { delay: 12 })
await foto("messaggio-sul-carosello")
await campo.press("Enter")
const immagine = aside.locator('img[src^="data:image"]').first()
await immagine.waitFor({ timeout: 180000 })
ok("l'immagine di uno strumento compare nella chat")
await aside.getByText(/^Fatto in /).nth(2).waitFor({ timeout: 180000 })
await foto("immagini-nella-chat")
await immagine.click()
await pagina.getByRole("dialog").waitFor()
await foto("immagine-a-tutto-schermo")
await pagina.keyboard.press("Escape")
await pagina.getByRole("dialog").waitFor({ state: "detached" })
ok("Esc chiude l'immagine a tutto schermo")

await browser.close()
console.log(problemi.length === 0 ? "nessun problema in console" : `\n${problemi.length} problemi:\n  ${problemi.join("\n  ")}`)
process.exitCode = problemi.length === 0 ? 0 : 1
