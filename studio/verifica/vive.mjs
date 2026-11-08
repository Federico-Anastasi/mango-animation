// Le prove dal vivo: un vero browser contro il finto server, su un archivio di esempio fresco e una porta sua.
//   node verifica/vive.mjs
// Avvia da sé generatore e server (chiude solo ciò che ha avviato, per PID) e dice cosa funziona.
import { chromium } from "@playwright/test"
import { spawn } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const qui = dirname(fileURLToPath(import.meta.url))
const radiceStudio = join(qui, "..")
const PORTA = 47541
const origine = `http://127.0.0.1:${PORTA}`
const cartella = mkdtempSync(join(tmpdir(), "mango-animation-vive-"))

// `bun` è uno script di npm che Node non lancia da solo: si usa il programma vero, e si chiude per PID.
const BUN = process.env.BUN_EXE ?? (process.platform === "win32" ? join(process.env.APPDATA ?? "", "npm", "node_modules", "bun", "bin", "bun.exe") : "bun")

function esegui(comando, argomenti, env = {}) {
  return spawn(comando, argomenti, { cwd: radiceStudio, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"], shell: false })
}

await new Promise((ok, no) => {
  const p = esegui(BUN, ["run", "verifica/genera-archivio.ts", cartella])
  p.on("exit", (c) => (c === 0 ? ok() : no(new Error("generazione dell'archivio fallita"))))
})
const server = esegui(BUN, ["run", "verifica/finto-server.ts"], { PORTA_FINTO: String(PORTA), FINTO_ARCHIVIO: cartella })
await new Promise((ok, no) => {
  server.stdout.on("data", (d) => String(d).includes("Finto server") && ok())
  server.on("exit", () => no(new Error("il finto server si è fermato")))
  setTimeout(() => no(new Error("il finto server non parte")), 20000)
})

const risultati = []
async function prova(nome, corpo) {
  const t0 = Date.now()
  try {
    await corpo()
    risultati.push({ nome, ok: true })
    console.log(`+ ${nome} (${Date.now() - t0} ms)`)
  } catch (e) {
    risultati.push({ nome, ok: false, errore: e instanceof Error ? e.message : String(e) })
    console.log(`! ${nome}\n    ${risultati.at(-1).errore.split("\n").join("\n    ")}`)
  }
}
function atteso(condizione, frase) {
  if (!condizione) throw new Error(frase)
}

// Dove il Chromium di Playwright non è installato: `--browser chrome` usa il Chrome del computer, come in `fotografa.mjs`.
const browser = await chromium.launch(process.argv.includes("--browser") && process.argv[process.argv.indexOf("--browser") + 1] === "chrome" ? { channel: "chrome" } : {})
async function nuovaPagina(larghezza = 1400) {
  const contesto = await browser.newContext({ viewport: { width: larghezza, height: 1000 }, locale: "it-IT" })
  const pagina = await contesto.newPage()
  const errori = []
  pagina.on("pageerror", (e) => errori.push(e.message))
  pagina.on("console", (m) => m.type() === "error" && !m.location().url.includes("/lavoro/scene/") && errori.push(m.text()))
  return { pagina, errori, contesto }
}
const tempoDelloOrologio = async (pagina) => {
  const testo = await pagina.locator("[data-testid=orologio]").innerText()
  const [m, s] = testo.split("/")[0].trim().split(":")
  return Number(m) * 60 + Number(s.replace(",", "."))
}
// Un video già montato si apre su «Montato»: il palco c'è solo nel modo «Piano».
const inPiano = async (pagina) => {
  const piano = pagina.getByRole("button", { name: "Piano", exact: true })
  await piano.waitFor()
  if ((await piano.getAttribute("aria-pressed")) === "false") await piano.click()
  await pagina.waitForSelector("[data-testid=palco]")
}
const apriMontaggio = async (pagina, slug) => {
  await pagina.goto(`${origine}/#/video/${slug}/montaggio`)
  await inPiano(pagina)
  await pagina.waitForSelector("[data-tratto]")
}
const clicSulRighello = async (pagina, frazione) => {
  const righello = pagina.getByRole("slider", { name: "Scorri il video" })
  await righello.scrollIntoViewIfNeeded()
  const r = await righello.boundingBox()
  await pagina.mouse.click(r.x + r.width * frazione, r.y + 8)
}
const piano = async (pagina, slug) => (await (await pagina.request.get(`${origine}/api/video/${slug}`)).json()).piano
const tratti = (pagina) => pagina.locator("[data-tratto]").count()
// Il montaggio è ricalcolato quando lo dice il server e l'interfaccia ha tolto l'avviso.
const aspettaRisolto = async (pagina, slug) => {
  await pagina.waitForFunction(async (s) => (await (await fetch(`/api/video/${s}`)).json()).risolto_aggiornato === true, slug, { timeout: 15000 })
  await pagina.waitForFunction(() => !document.body.innerText.includes("si sta ricalcolando"), undefined, { timeout: 15000 })
}

await prova("l'anteprima suona: il tempo avanza e passa da un tratto all'altro", async () => {
  const { pagina, errori, contesto } = await nuovaPagina()
  await apriMontaggio(pagina, "pasta-fresca")
  await pagina.waitForTimeout(1500)
  const visti = new Set()
  await pagina.getByRole("button", { name: "Avvia", exact: true }).click()
  const t0 = await tempoDelloOrologio(pagina)
  for (let i = 0; i < 30; i++) {
    visti.add(await pagina.locator("[data-testid=palco]").getAttribute("data-tratto-attuale"))
    await pagina.waitForTimeout(250)
  }
  const t1 = await tempoDelloOrologio(pagina)
  atteso(t1 - t0 > 3, `il tempo non avanza abbastanza: da ${t0} a ${t1}`)
  atteso(visti.size >= 3, `il palco è rimasto su ${[...visti].join(", ")}: non è passato da un tratto all'altro`)
  await pagina.getByRole("button", { name: "Ferma", exact: true }).click()
  const fermo = await tempoDelloOrologio(pagina)
  await pagina.waitForTimeout(600)
  atteso(Math.abs((await tempoDelloOrologio(pagina)) - fermo) < 0.05, "dopo «Ferma» il tempo continua")
  atteso(errori.length === 0, `errori in console: ${errori.join(" | ")}`)
  await contesto.close()
})

await prova("l'anteprima compone gli strati: la tela non è vuota e ha animazione, sagoma e fondo", async () => {
  const { pagina, contesto } = await nuovaPagina()
  await apriMontaggio(pagina, "pasta-fresca")
  await pagina.waitForTimeout(2000)
  const colori = await pagina.evaluate(() => {
    const tela = document.querySelector("[data-testid=palco] canvas")
    const ctx = tela.getContext("2d")
    const d = ctx.getImageData(0, 0, tela.width, tela.height).data
    const vari = new Set()
    for (let i = 0; i < d.length; i += 4 * 97) vari.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`)
    return [...vari]
  })
  atteso(colori.length >= 3, `la tela ha solo ${colori.length} colori`)
  await contesto.close()
})

await prova("la tela segue la testina: due secondi diversi, due immagini diverse", async () => {
  const { pagina, contesto } = await nuovaPagina()
  await apriMontaggio(pagina, "ricetta-in-diretta")
  await pagina.waitForTimeout(1500)
  const firma = () =>
    pagina.evaluate(() => {
      const tela = document.querySelector("[data-testid=palco] canvas")
      const d = tela.getContext("2d").getImageData(0, 0, tela.width, tela.height).data
      let somma = 0
      for (let i = 0; i < d.length; i += 4 * 53) somma = (somma * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7) % 1000003
      return somma
    })
  const prima = await firma()
  await clicSulRighello(pagina, 0.7)
  await pagina.waitForTimeout(1200)
  atteso((await tempoDelloOrologio(pagina)) > 5, "il righello non ha spostato la testina")
  atteso((await firma()) !== prima, "la tela non è cambiata spostando la testina")
  await contesto.close()
})

await prova("trascinare un bordo manda il piano giusto, e il montaggio ricalcolato torna da solo", async () => {
  const { pagina, contesto } = await nuovaPagina()
  await apriMontaggio(pagina, "pasta-fresca")
  const prima = await piano(pagina, "pasta-fresca")
  const maniglia = pagina.getByLabel("Accorcia o allunga l'inizio del tratto").first()
  await maniglia.scrollIntoViewIfNeeded()
  const m = await maniglia.boundingBox()
  const richiesta = pagina.waitForRequest((r) => r.method() === "PUT" && r.url().endsWith("/pasta-fresca/piano"))
  await pagina.mouse.move(m.x + m.width / 2, m.y + m.height / 2)
  await pagina.mouse.down()
  await pagina.mouse.move(m.x + 60, m.y + m.height / 2, { steps: 6 })
  await pagina.mouse.up()
  const corpo = JSON.parse((await richiesta).postData())
  const dopo = corpo.scene[0].pezzi[0]
  atteso(prima.scene[0].pezzi[0].da === 0.1, "la partenza non è quella attesa")
  atteso(dopo.da > 0.15 && dopo.da < 1.2, `il bordo d'inizio dovrebbe essere spostato in avanti, è ${dopo.da}`)
  atteso(JSON.stringify(corpo.scene.slice(1)) === JSON.stringify(prima.scene.slice(1)), "il ritocco ha toccato anche le altre scene")
  await pagina.waitForFunction(() => document.body.innerText.includes("si sta ricalcolando"), undefined, { timeout: 3000 }).catch(() => undefined)
  await aspettaRisolto(pagina, "pasta-fresca")
  const lungo = await pagina.locator("[data-tratto]").first().boundingBox()
  atteso(lungo.width > 5, "il primo tratto non c'è più")
  await contesto.close()
})

await prova("dividere alla testina, togliere un tratto, annullare e rifare", async () => {
  const { pagina, contesto } = await nuovaPagina()
  await apriMontaggio(pagina, "pane-veloce")
  const originale = await piano(pagina, "pane-veloce")
  await clicSulRighello(pagina, 0.3)
  await pagina.keyboard.press("s")
  await pagina.waitForFunction(async () => (await (await fetch("/api/video/pane-veloce")).json()).piano.scene[0].pezzi.length === 2, undefined, { timeout: 8000 })
  await aspettaRisolto(pagina, "pane-veloce")
  const diviso = await piano(pagina, "pane-veloce")
  atteso(diviso.scene[0].pezzi.length === 2, "il pezzo non si è diviso in due")
  atteso(diviso.scene[0].pezzi[0].a === diviso.scene[0].pezzi[1].da, "i due pezzi non si toccano nel punto di divisione")

  const prima = await tratti(pagina)
  await pagina.locator("[data-tratto]").nth(prima - 1).click({ position: { x: 20, y: 25 } })
  await pagina.getByRole("button", { name: /Togli/ }).click()
  await pagina.waitForFunction(async () => (await (await fetch("/api/video/pane-veloce")).json()).piano.scene[0].pezzi.length === 1, undefined, { timeout: 8000 })
  await aspettaRisolto(pagina, "pane-veloce")
  await pagina.waitForFunction((n) => document.querySelectorAll("[data-tratto]").length < n, prima, { timeout: 8000 }).catch(() => undefined)
  atteso((await tratti(pagina)) < prima, "togliendo un tratto la timeline non ne mostra meno")

  await pagina.getByRole("button", { name: /Annulla/ }).click()
  await pagina.waitForFunction(async () => (await (await fetch("/api/video/pane-veloce")).json()).piano.scene[0].pezzi.length === 2, undefined, { timeout: 8000 })
  await aspettaRisolto(pagina, "pane-veloce")
  await pagina.getByRole("button", { name: /Annulla/ }).click()
  await pagina.waitForFunction(async () => (await (await fetch("/api/video/pane-veloce")).json()).piano.scene[0].pezzi.length === 1, undefined, { timeout: 8000 })
  await aspettaRisolto(pagina, "pane-veloce")
  const tornato = await piano(pagina, "pane-veloce")
  atteso(JSON.stringify(tornato) === JSON.stringify(originale), "dopo due «Annulla» il piano non è quello di partenza")
  await pagina.getByRole("button", { name: /Rifai/ }).click()
  await pagina.waitForFunction(async () => (await (await fetch("/api/video/pane-veloce")).json()).piano.scene[0].pezzi.length === 2, undefined, { timeout: 8000 })
  await contesto.close()
})

await prova("togliere parole dal parlato scrive i secondi da togliere e il tratto si accorcia", async () => {
  const { pagina, contesto } = await nuovaPagina()
  await apriMontaggio(pagina, "ricetta-in-diretta")
  const elenco = pagina.getByRole("heading", { name: "Il parlato" }).locator("..")
  await elenco.getByRole("button", { name: "bruciato", exact: true }).click()
  await pagina.getByRole("button", { name: /Togli dal montaggio/ }).click()
  await pagina.waitForFunction(async () => (await (await fetch("/api/video/ricetta-in-diretta")).json()).piano.scene[1].pezzi.length === 2, undefined, { timeout: 8000 })
  const dopo = await piano(pagina, "ricetta-in-diretta")
  atteso(dopo.scene[1].pezzi[0].dice === "si è" && dopo.scene[1].pezzi[1].dice === "di nuovo", `i due pezzi sono «${dopo.scene[1].pezzi.map((p) => p.dice).join("» e «")}»`)
  await contesto.close()
})

await prova("lo zoom di un pezzo si sceglie dal pannello e il centro si trascina sull'anteprima", async () => {
  const { pagina, contesto } = await nuovaPagina()
  await apriMontaggio(pagina, "ricetta-in-diretta")
  await pagina.locator("[data-tratto]").first().click({ position: { x: 20, y: 25 } })
  await pagina.getByRole("heading", { name: "Tratto scelto" }).waitFor()
  await pagina.locator("label:has(span:text-is('Ingrandimento')) select").selectOption("fisso")
  await pagina.waitForFunction(async () => (await (await fetch("/api/video/ricetta-in-diretta")).json()).piano.scene[0].pezzi[0].zoom?.scala === 1.5, undefined, { timeout: 8000 })
  await aspettaRisolto(pagina, "ricetta-in-diretta")
  await pagina.locator("[data-tratto]").first().click({ position: { x: 20, y: 25 } })
  const palco = pagina.locator("[data-testid=palco]")
  await pagina.waitForSelector("[data-testid=palco][data-pan]")
  const r = await palco.boundingBox()
  const x = r.x + r.width / 2
  const y = r.y + r.height * 0.25
  await pagina.mouse.move(x, y)
  await pagina.mouse.down()
  await pagina.mouse.move(x - r.width * 0.15, y, { steps: 6 })
  await pagina.mouse.up()
  await pagina.waitForFunction(async () => (await (await fetch("/api/video/ricetta-in-diretta")).json()).piano.scene[0].pezzi[0].zoom?.centro?.[0] > 0.55, undefined, { timeout: 8000 })
  const zoom = (await piano(pagina, "ricetta-in-diretta")).scene[0].pezzi[0].zoom
  atteso(zoom.scala === 1.5 && zoom.centro[0] > 0.55, `lo zoom scritto è ${JSON.stringify(zoom)}`)
  await aspettaRisolto(pagina, "ricetta-in-diretta")
  await pagina.screenshot({ path: join(qui, "viste", "vive-zoom.png") })
  await contesto.close()
})

await prova("una parola del parlato si corregge e la correzione sta nei sottotitoli del piano", async () => {
  const { pagina, contesto } = await nuovaPagina()
  await apriMontaggio(pagina, "pasta-fresca")
  const elenco = pagina.getByRole("heading", { name: "Il parlato" }).locator("..")
  await elenco.getByRole("button", { name: "impasto", exact: true }).dblclick()
  const campo = pagina.getByLabel("Come si scrive")
  await campo.fill("Impasto")
  await pagina.getByRole("button", { name: "Correggi", exact: true }).click()
  await pagina.waitForFunction(async () => ((await (await fetch("/api/video/pasta-fresca")).json()).piano.sottotitoli?.correzioni ?? []).length === 2, undefined, { timeout: 8000 })
  const correzioni = (await piano(pagina, "pasta-fresca")).sottotitoli.correzioni
  atteso(correzioni.some((c) => c.sentite.includes("impasto") && c.giuste === "Impasto"), `la correzione scritta è ${JSON.stringify(correzioni)}`)
  await aspettaRisolto(pagina, "pasta-fresca")
  await elenco.getByRole("button", { name: "Impasto", exact: true }).waitFor({ timeout: 8000 })
  await pagina.screenshot({ path: join(qui, "viste", "vive-parola.png") })
  await contesto.close()
})

await prova("un pezzo passa a un'altra scena dal pannello e va in testa a quella che viene dopo", async () => {
  const { pagina, contesto } = await nuovaPagina()
  await apriMontaggio(pagina, "pasta-fresca")
  const prima = await piano(pagina, "pasta-fresca")
  atteso(prima.scene[1].pezzi.length === 2, "la scena c2 doveva avere due pezzi")
  await pagina.locator('[data-scena="1"]').first().click({ position: { x: 20, y: 25 } })
  await pagina.getByRole("heading", { name: "Tratto scelto" }).waitFor()
  await pagina.getByLabel("Porta in un'altra scena").selectOption({ label: "c3" })
  await pagina.waitForFunction(async () => (await (await fetch("/api/video/pasta-fresca")).json()).piano.scene[1].pezzi.length === 1, undefined, { timeout: 8000 })
  const dopo = await piano(pagina, "pasta-fresca")
  atteso(dopo.scene[2].pezzi.length === 2 && dopo.scene[2].pezzi[0].dice === prima.scene[1].pezzi[0].dice, "il pezzo non è in testa alla scena c3")
  await aspettaRisolto(pagina, "pasta-fresca")
  await pagina.screenshot({ path: join(qui, "viste", "vive-scena.png") })
  await contesto.close()
})

await prova("il bordo fra due parole di un pezzo a parole si trascina: il pezzo si divide e la fine del primo si allunga", async () => {
  const { pagina, contesto } = await nuovaPagina()
  const slug = "ricetta-in-diretta"
  // Fra «forno» e «si» c'è una pausa tolta: un pezzo a parole che le tiene tutte e due ha due tratti, e il bordo fra loro sta in mezzo alle parole.
  const prima = await piano(pagina, slug)
  const col = structuredClone(prima)
  col.scene[1].pezzi = [{ sorgente: "diretta", minuto: "0:01", dice: "il forno si è bruciato", zoom: { scala: 1.4, centro: [0.5, 0.4] } }]
  const messo = await pagina.request.put(`${origine}/api/video/${slug}/piano`, { data: col })
  atteso(messo.ok(), `il piano di prova non si scrive: ${await messo.text()}`)
  await apriMontaggio(pagina, slug)
  await aspettaRisolto(pagina, slug)
  const tratti = pagina.locator('[data-scena="1"]')
  await pagina.waitForFunction(() => document.querySelectorAll('[data-scena="1"]').length === 2, undefined, { timeout: 8000 })
  atteso((await tratti.count()) === 2, "il pezzo a parole non ha due tratti")
  const maniglia = tratti.first().getByLabel("Accorcia o allunga la fine del tratto")
  await maniglia.scrollIntoViewIfNeeded()
  const m = await maniglia.boundingBox()
  const richiesta = pagina.waitForRequest((r) => r.method() === "PUT" && r.url().endsWith(`/${slug}/piano`))
  await pagina.mouse.move(m.x + m.width / 2, m.y + m.height / 2)
  await pagina.mouse.down()
  await pagina.mouse.move(m.x + 32, m.y + m.height / 2, { steps: 6 })
  await pagina.screenshot({ path: join(qui, "viste", "vive-bordo-trascinando.png") })
  await pagina.mouse.up()
  const pezzi = JSON.parse((await richiesta).postData()).scene[1].pezzi
  atteso(pezzi.length === 2, `il pezzo non si è diviso: ${JSON.stringify(pezzi)}`)
  atteso(pezzi[0].dice === "il forno" && pezzi[1].dice === "si è bruciato", `le parole divise sono «${pezzi[0].dice}» e «${pezzi[1].dice}»`)
  atteso(pezzi[0].rifila?.[1] > 0.1 && pezzi[0].rifila[1] < 0.6 && pezzi[1].rifila === undefined, `la rifila non è quella attesa: ${JSON.stringify(pezzi.map((p) => p.rifila))}`)
  atteso(JSON.stringify(pezzi.map((p) => p.zoom)) === JSON.stringify([col.scene[1].pezzi[0].zoom, col.scene[1].pezzi[0].zoom]), "lo zoom fisso non è rimasto a tutti e due")
  await aspettaRisolto(pagina, slug)
  const dopo = pagina.locator('[data-scena="1"]')
  await pagina.waitForFunction(() => document.querySelectorAll('[data-scena="1"]').length === 2, undefined, { timeout: 8000 })
  atteso((await dopo.count()) === 2, "dopo il ritocco i tratti della scena non sono due")
  await pagina.screenshot({ path: join(qui, "viste", "vive-bordo.png") })
  await pagina.request.put(`${origine}/api/video/${slug}/piano`, { data: prima })
  await contesto.close()
})

await prova("un pezzo che viene dalla base si può staccare, e dopo è del video", async () => {
  const { pagina, contesto } = await nuovaPagina()
  await apriMontaggio(pagina, "variante-ricetta")
  await pagina.locator("[data-tratto]").first().click({ position: { x: 20, y: 25 } })
  await pagina.getByRole("heading", { name: "Tratto scelto" }).waitFor()
  atteso(await pagina.getByText(/viene dal video «/).isVisible(), "non dice che il pezzo è della base")
  await pagina.getByRole("button", { name: "Stacca dalla base" }).first().click()
  await pagina.waitForFunction(async () => (await (await fetch("/api/video/variante-ricetta")).json()).piano.base === undefined, undefined, { timeout: 8000 })
  const staccato = await piano(pagina, "variante-ricetta")
  atteso(staccato.scene.length === 3, `le scene copiate sono ${staccato.scene.length}, ne servivano 3`)
  await contesto.close()
})

await prova("a riposo, per cinque secondi, non parte nessuna richiesta oltre agli eventi", async () => {
  const { pagina, contesto } = await nuovaPagina()
  await apriMontaggio(pagina, "pasta-fresca")
  await pagina.waitForTimeout(4000)
  const richieste = []
  pagina.on("request", (r) => richieste.push(`${r.method()} ${new URL(r.url()).pathname}`))
  await pagina.waitForTimeout(5000)
  const fuori = richieste.filter((r) => !r.endsWith("/api/eventi"))
  atteso(fuori.length === 0, `richieste a riposo: ${fuori.join(", ")}`)
  await contesto.close()
})

await prova("un ricarica resta dov'è: video, scheda e parametri", async () => {
  const { pagina, contesto } = await nuovaPagina()
  await pagina.goto(`${origine}/#/video/primo-video-pubblicato/scheda`)
  await pagina.getByRole("heading", { name: "La proposta" }).waitFor()
  await pagina.reload()
  await pagina.getByRole("heading", { name: "La proposta" }).waitFor()
  await pagina.goto(`${origine}/#/girato?file=${encodeURIComponent("2026-10-08/diretta-prova-cucina.mp4")}`)
  await pagina.getByRole("heading", { name: "diretta-prova-cucina.mp4" }).waitFor()
  await pagina.reload()
  await pagina.getByRole("heading", { name: "diretta-prova-cucina.mp4" }).waitFor()
  await contesto.close()
})

await prova("dal Controllo, «Vai a» porta il montaggio a quel secondo", async () => {
  const { pagina, contesto } = await nuovaPagina()
  await pagina.goto(`${origine}/#/video/pasta-fresca/controllo`)
  await pagina.getByRole("link", { name: "Vai a 0:08,1" }).click()
  await inPiano(pagina)
  await pagina.waitForTimeout(500)
  atteso(Math.abs((await tempoDelloOrologio(pagina)) - 8.1) < 0.05, "la testina non è a 8,1")
  await contesto.close()
})

await prova("un messaggio dal server aggiorna la vista senza ricaricare: un video nuovo compare nell'elenco", async () => {
  const { pagina, contesto } = await nuovaPagina()
  await pagina.goto(`${origine}/#/video`)
  await pagina.getByRole("heading", { name: "In lavorazione" }).waitFor()
  await pagina.request.post(`${origine}/api/video`, { data: { titolo: "Arrivato da fuori" } })
  await pagina.getByRole("link", { name: /Arrivato da fuori/ }).waitFor({ timeout: 5000 })
  await contesto.close()
})

await prova("il montaggio chiesto nella chat va nel pannello dei lavori", async () => {
  const { pagina, contesto } = await nuovaPagina()
  await apriMontaggio(pagina, "pane-veloce")
  await pagina.getByText("Per montare, rimontare o cambiare il video, chiedilo nella chat.").waitFor()
  await pagina.request.post(`${origine}/api/video/pane-veloce/lavori`, { data: { comando: "monta" } })
  await pagina.getByRole("button", { name: /Lavoro in corso|in attesa/ }).waitFor({ timeout: 5000 })
  await pagina.getByRole("button", { name: /Lavoro in corso|in attesa/ }).click()
  await pagina.getByRole("dialog", { name: "Lavori" }).getByText(/Montaggio/).first().waitFor()
  await pagina.getByRole("button", { name: /Nessun lavoro/ }).waitFor({ timeout: 10000 })
  await contesto.close()
})

await browser.close()
server.kill()
rmSync(cartella, { recursive: true, force: true })

const falliti = risultati.filter((r) => !r.ok)
console.log(`\n${risultati.length - falliti.length} su ${risultati.length} prove riuscite`)
if (falliti.length > 0) process.exitCode = 1
