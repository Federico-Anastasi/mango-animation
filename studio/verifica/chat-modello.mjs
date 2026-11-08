// Modello, effort, permessi saltati, domande e Chrome contro un server vero con un Claude vero. Tutto dentro la pagina di
// Playwright: nessun input verso il sistema. Una conversazione sola, una foto per passo in `verifica/viste/`.
//   MANGO_ANIMATION_LAVORO=<cartella> MANGO_ANIMATION_PORTA=47600 MANGO_ANIMATION_PORTA_ARRIVI=47601 bun run --cwd server avvia    (un server tuo, mai quello della 47431)
//   MANGO_ANIMATION_LAVORO=<la stessa cartella> node verifica/chat-modello.mjs --url http://127.0.0.1:47600 [--browser chrome]
// Il server vuole la chiave (`chiave.mjs`): la legge dalla cartella di lavoro e la pagina entra da `/entra`.
// Alla fine scrive l'id della conversazione: il suo file va cancellato per id.
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
const cartella = join(dirname(fileURLToPath(import.meta.url)), "viste")
mkdirSync(cartella, { recursive: true })

const browser = await chromium.launch(valore("--browser", "") === "chrome" ? { channel: "chrome" } : {})
const pagina = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage()
const problemi = []
pagina.on("console", (m) => m.type() === "error" && problemi.push(`console: ${m.text()}`))
pagina.on("pageerror", (e) => problemi.push(`pagina: ${e.message}`))

let passo = 0
const foto = async (nome) => {
  passo += 1
  await pagina.screenshot({ path: join(cartella, `chat-modello-vero-${String(passo).padStart(2, "0")}-${nome}.png`) })
  console.log(`foto ${passo}: ${nome}`)
}
const ok = (frase) => console.log(`ok: ${frase}`)
const manca = (frase) => {
  problemi.push(frase)
  console.log(`MANCA: ${frase}`)
}

await entra(pagina, origine)
await pagina.goto(`${origine}/#/video`)
await pagina.getByRole("button", { name: /^Chat/ }).click()
const aside = pagina.getByRole("complementary", { name: "Chat", exact: true })
await aside.waitFor()
await pagina.getByRole("button", { name: "Nuova conversazione" }).click()
const campo = pagina.getByRole("textbox", { name: "Messaggio" })
const modello = pagina.getByLabel("Modello", { exact: true })
const effort = pagina.getByLabel("Effort", { exact: true })
const log = aside.getByRole("log", { name: "La conversazione" })

// 1. L'elenco dei modelli del server, e i menu che lo mostrano.
const elenco = await pagina.evaluate(async () => (await fetch("/api/chat/modelli")).json())
console.log("modelli:", elenco.map((m) => `${m.id}=${m.nome} [${m.effort.join(",")}]`).join(" | "))
if (!elenco.some((m) => m.nome === "Opus 5.5") || !elenco.some((m) => m.nome === "Sonnet 5.5")) manca("nell'elenco non ci sono Opus 5.5 e Sonnet 5.5")
else ok("l'elenco ha Opus 5.5 e Sonnet 5.5, con nome leggibile e livelli di effort")
await modello.waitFor()
await foto("menu-conversazione-nuova")

// 2. Si parte con Sonnet 5.5 ed effort Medio, scelti prima del primo messaggio.
await modello.selectOption("sonnet")
await effort.selectOption("medium")
let giri = 0
async function chiedi(testo, { attesaMs = 180000 } = {}) {
  await campo.click()
  await campo.fill(testo)
  await campo.press("Enter")
  giri += 1
  await aside.getByText(/^Fatto in /).nth(giri - 1).waitFor({ timeout: attesaMs })
  const tutto = await log.innerText()
  return tutto.slice(Math.max(0, tutto.lastIndexOf(testo.slice(0, 40))))
}

// 3. Un file fuori dal progetto: nessuna richiesta di permesso.
const file = join(tmpdir(), "chat-modello-prova.txt")
rmSync(file, { force: true })
let permessoComparso = false
const guardiaPermessi = setInterval(async () => {
  if ((await aside.getByRole("button", { name: "Consenti", exact: true }).count().catch(() => 0)) > 0) permessoComparso = true
}, 200)
await chiedi(`Scrivi il file ${file} con dentro solo la parola ciao-modello, poi dimmi che l'hai fatto in una riga.`)
clearInterval(guardiaPermessi)
if (permessoComparso) manca("è comparsa una richiesta di permesso")
else if (!existsSync(file) || !readFileSync(file, "utf8").includes("ciao-modello")) manca("il file non è stato scritto")
else ok("il file è scritto e nessun permesso è stato chiesto")
rmSync(file, { force: true })
await foto("file-senza-permesso")

// 4. AskUserQuestion: i bottoni, la risposta.
await campo.click()
await campo.fill("Usa lo strumento AskUserQuestion per chiedermi «Rosso o blu?» con le due opzioni Rosso e Blu, poi dimmi in una riga cosa ho scelto.")
await campo.press("Enter")
giri += 1
const domanda = aside.getByRole("region", { name: "Una domanda per te" })
await domanda.waitFor({ timeout: 180000 })
ok("AskUserQuestion arriva come domanda con i bottoni")
await foto("domanda")
await domanda.getByRole("button", { name: /Blu/ }).click()
await domanda.getByRole("button", { name: "Invia la risposta" }).click()
await aside.getByText(/^Fatto in /).nth(giri - 1).waitFor({ timeout: 180000 })
const dopoDomanda = (await log.innerText()).slice(-400)
if (/blu/i.test(dopoDomanda)) ok("Claude ha ricevuto la risposta «Blu»")
else manca(`Claude non dice di aver ricevuto «Blu»: ${dopoDomanda}`)
await foto("dopo-la-domanda")

// 5. Il modello: Sonnet 5.5; poi Opus 5.5 a conversazione aperta, e Claude risponde col nuovo.
const primo = await chiedi("Che modello sei? Rispondi in una riga con il nome del modello.")
console.log("risposta 1:", primo.split("\n").slice(-6).join(" ").slice(0, 200))
if (!/sonnet/i.test(primo)) manca("la risposta non nomina Sonnet")
await modello.selectOption("opus")
await pagina.waitForFunction(() => [...document.querySelectorAll("select")].some((s) => s.value === "opus"))
await foto("modello-cambiato-a-opus")
const secondo = await chiedi("Che modello sei adesso? Rispondi in una riga con il nome del modello.")
console.log("risposta 2:", secondo.split("\n").slice(-6).join(" ").slice(0, 200))
if (/opus/i.test(secondo.split("Che modello sei adesso?").pop() ?? "")) ok("dopo il cambio Claude dice di essere Opus")
else manca("dopo il cambio la risposta non nomina Opus")
if ((await modello.inputValue()) !== "opus") manca("il menu del modello non dice Opus")

// 6. L'effort a conversazione aperta: il server lo dice, il menu lo mostra, e Claude risponde ancora.
const id = await pagina.evaluate(() => localStorage.getItem("mango-animation.chat.corrente"))
for (const [livello, nome] of [["low", "Basso"], ["max", "Massimo"], ["", "Predefinito"]]) {
  await effort.selectOption(livello)
  await pagina.waitForFunction(async ([id, livello]) => ((await (await fetch(`/api/chat/${id}`)).json()).effort ?? "") === livello, [id, livello], { timeout: 10000 }).catch(() => manca(`il server non dice effort «${livello}»`))
  await pagina.waitForFunction((livello) => [...document.querySelectorAll("select")].some((s) => s.value === livello && [...s.options].some((o) => o.value === "xhigh")), livello, { timeout: 10000 }).catch(() => manca(`il menu dell'effort non dice ${nome}`))
  const r = await chiedi(`Rispondi solo con la parola: ok-${livello || "predefinito"}`)
  if (!r.includes(`ok-${livello || "predefinito"}`)) manca(`con effort ${nome} Claude non risponde`)
  else ok(`con effort ${nome} il server e il menu concordano e Claude risponde`)
  await foto(`effort-${livello || "predefinito"}`)
}

// 7. Gli strumenti di Claude in Chrome.
const chrome = await chiedi("Hai fra i tuoi strumenti quelli di Claude in Chrome (nomi che cominciano con mcp__claude-in-chrome__)? Rispondi sì o no e cita tre nomi esatti.")
if (/mcp__claude-in-chrome__/.test(chrome.split("tre nomi esatti.").pop() ?? "")) ok("Claude cita strumenti mcp__claude-in-chrome__*")
else manca("Claude non cita strumenti di Chrome")
await foto("chrome")

// 8. La stessa conversazione nelle tre larghezze.
for (const larghezza of [1000, 430]) {
  await pagina.setViewportSize({ width: larghezza, height: 900 })
  await pagina.waitForTimeout(400)
  const scorre = await pagina.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  if (scorre) manca(`a ${larghezza} px la pagina scorre in orizzontale`)
  await foto(`larghezza-${larghezza}`)
}

console.log(`conversazione: ${id}`)
await browser.close()
console.log(problemi.length === 0 ? "nessun problema" : `\n${problemi.length} problemi:\n  ${problemi.join("\n  ")}`)
process.exitCode = problemi.length === 0 ? 0 : 1
