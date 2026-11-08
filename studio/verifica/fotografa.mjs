// Fotografa ogni vista e ogni scheda a tre larghezze (1400, 1000, 430 px), nel tema chiaro e in quello scuro,
// contro un server che serve l'interfaccia costruita (di default il finto server su 47531).
//   node verifica/fotografa.mjs [--url http://127.0.0.1:47531] [--tema chiaro|scuro] [--lingua it|en] [--browser chrome] [--vista parte-del-nome] [--uscita cartella]
// Fallisce se la pagina esce in orizzontale, se un controllo esce dal bordo destro, se un contenitore che
// scorre da solo è più alto della parte visibile della pagina, se i pannelli del montaggio non sono alti quanto
// l'anteprima accanto, se una vista resta su «carico…» o se la console ha errori. Le foto finiscono in `verifica/viste/`.
import { chromium } from "@playwright/test"
import { mkdirSync, readdirSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const argomenti = process.argv.slice(2)
const valore = (nome, predefinito) => (argomenti.includes(nome) ? argomenti[argomenti.indexOf(nome) + 1] : predefinito)
const origine = valore("--url", "http://127.0.0.1:47531")
const temi = valore("--tema", "") ? [valore("--tema", "")] : ["chiaro", "scuro"]
const soloVista = valore("--vista", "")
// La lingua è quella del browser: il contesto la dichiara, e nei nomi delle foto l'inglese ha il suo suffisso.
const inglese = valore("--lingua", "it") === "en"
const T = (italiano, ingleseTesto) => (inglese ? ingleseTesto : italiano)
// Le scene che guidano la pagina con testi scritti in italiano (la conversazione d'esempio, gli avvisi) non si rifanno in inglese.
const SOLO_ITALIANO = ["chat-conversazione", "chat-permesso", "chat-immagine-grande", "chat-mango-lavora", "chat-menu-modello", "chat-domanda", "chat-allegato", "chat-lavoro", "chat-tempi", "chat-background", "chat-chiusa", "chat-chiudi", "lavori-piano-cambiato", "slide-carosello-avvisi", "scheda-non-valida", "montaggio-piano-non-valido", "girato-scheda-rifiutata"]
// Con `--chat` ogni vista si fotografa con la chat aperta sulla conversazione d'esempio.
const conChat = argomenti.includes("--chat")
// A 430 px la chat copre la vista: con `--chat` le larghezze sono due, e a 430 la chat si fotografa con le sue scene.
const larghezze = conChat ? [1400, 1000] : [1400, 1000, 430]
const cartella = valore("--uscita", join(dirname(fileURLToPath(import.meta.url)), "viste"))

const FILE_DIRETTA = "2026-10-08/diretta-prova-cucina.mp4"
const VISTE = [
  { nome: "video", indirizzo: "#/video" },
  { nome: "montaggio-pasta", indirizzo: "#/video/pasta-fresca/montaggio", prima: inPiano, pronta: "[data-testid=palco]" },
  { nome: "montaggio-ricetta", indirizzo: "#/video/ricetta-in-diretta/montaggio", prima: inPiano, pronta: "[data-testid=palco]" },
  { nome: "montaggio-variante", indirizzo: "#/video/variante-ricetta/montaggio", prima: inPiano, pronta: "[data-testid=palco]" },
  { nome: "montaggio-tratto", indirizzo: "#/video/pasta-fresca/montaggio", prima: inPiano, pronta: "[data-testid=palco]", dopo: (p) => p.locator("[data-tratto]").nth(3).click({ position: { x: 30, y: 25 } }) },
  { nome: "montaggio-zoom", indirizzo: "#/video/ricetta-in-diretta/montaggio", prima: inPiano, pronta: "[data-testid=palco]", dopo: (p) => p.locator("[data-tratto]").nth(1).click({ position: { x: 30, y: 25 } }) },
  { nome: "montaggio-parole", indirizzo: "#/video/pasta-fresca/montaggio", prima: inPiano, pronta: "[data-testid=palco]", dopo: (p) => p.getByRole("heading", { name: T("Il parlato", "Speech") }).locator("..").getByRole("button", { name: "modello" }).click() },
  { nome: "montaggio-scena", indirizzo: "#/video/pasta-fresca/montaggio", prima: inPiano, pronta: "[data-testid=palco]", dopo: (p) => p.getByRole("button", { name: "c2", exact: true }).click() },
  { nome: "montaggio-montato", indirizzo: "#/video/pasta-fresca/montaggio", pronta: "video", dopo: (p) => p.getByRole("button", { name: T("Montato", "Edited"), exact: true }).click() },
  { nome: "montaggio-lungo", indirizzo: "#/video/ricetta-intera/montaggio", prima: inPiano, pronta: "[data-testid=palco]" },
  { nome: "montaggio-senza-voce", indirizzo: "#/video/animazioni-e-voce/montaggio", prima: inPiano, pronta: "[data-testid=palco]" },
  { nome: "montaggio-senza-voce-tratto", indirizzo: "#/video/animazioni-e-voce/montaggio", prima: inPiano, pronta: "[data-testid=palco]", dopo: (p) => p.locator("[data-tratto]").nth(0).click({ position: { x: 30, y: 25 } }) },
  { nome: "prova-senza-piano", indirizzo: "#/video/registrazione-guidata", pronta: "video" },
  { nome: "montaggio-montato-piano-cambiato", indirizzo: "#/video/ricetta-in-diretta/montaggio", pronta: "video", dopo: (p) => p.getByRole("button", { name: T("Montato", "Edited"), exact: true }).click() },
  { nome: "montaggio-senza-piano", indirizzo: "#/video/cena-fra-due-cucine/montaggio" },
  { nome: "scheda-pubblicato", indirizzo: "#/video/primo-video-pubblicato/scheda" },
  { nome: "scheda-proposta", indirizzo: "#/video/cena-fra-due-cucine/scheda" },
  { nome: "scheda-senza-elenchi", indirizzo: "#/video/animazioni-e-voce/scheda" },
  { nome: "controllo-pasta", indirizzo: "#/video/pasta-fresca/controllo" },
  { nome: "controllo-pane", indirizzo: "#/video/pane-veloce/controllo" },
  { nome: "copertina-pane", indirizzo: "#/video/pane-veloce/copertina" },
  { nome: "copertina-vuota", indirizzo: "#/video/cena-fra-due-cucine/copertina" },
  { nome: "copertina-vecchia", indirizzo: "#/video/ricetta-in-diretta/copertina" },
  { nome: "file-pane", indirizzo: "#/video/pane-veloce/file" },
  { nome: "slide-carosello-vuoto", indirizzo: "#/video/carosello-nuovo/slide" },
  { nome: "slide-carosello", indirizzo: "#/video/carosello-dispensa/slide", pronta: "img[alt^='Slide 1 ']" },
  { nome: "slide-carosello-avvisi", indirizzo: "#/video/carosello-dispensa/slide", pronta: "img[alt^='Slide 1 ']", dopo: renderEAvvisi },
  { nome: "scheda-non-valida", indirizzo: "#/video/cena-fra-due-cucine/scheda", dopo: schedaNonValida, poi: schedaCorretta },
  { nome: "montaggio-piano-non-valido", indirizzo: "#/video/ricetta-in-diretta/montaggio", prima: inPiano, pronta: "[data-testid=palco]", dopo: pianoNonValido, poi: schedaCorretta },
  { nome: "montaggio-non-aggiornato", indirizzo: "#/video/ricetta-in-diretta/montaggio", prima: inPiano, pronta: "[data-testid=palco]", dopo: risoltoIndietro, poi: schedaCorretta },
  { nome: "girato-scheda-rifiutata", indirizzo: `#/girato?file=${encodeURIComponent("2026-10-09/messo-a-mano.mp4")}`, dopo: schedaGirataRifiutata, poi: schedaCorretta },
  { nome: "girato", indirizzo: "#/girato" },
  { nome: "girato-studio-acceso", indirizzo: "#/girato", dopo: (p) => studioDalTelefono(p, true, "pronto"), poi: (p) => studioDalTelefono(p, false, "pronto") },
  { nome: "girato-studio-tailscale-bloccato", indirizzo: "#/girato", dopo: (p) => studioDalTelefono(p, true, "bloccato"), poi: (p) => studioDalTelefono(p, false, "pronto") },
  { nome: "girato-studio-senza-tailscale", indirizzo: "#/girato", dopo: (p) => studioDalTelefono(p, true, "assente"), poi: (p) => studioDalTelefono(p, false, "pronto") },
  { nome: "girato-file", indirizzo: `#/girato?file=${encodeURIComponent(FILE_DIRETTA)}` },
  { nome: "girato-foto", indirizzo: `#/girato?file=${encodeURIComponent("2026-10-09/IMG_0042.HEIC")}` },
  { nome: "girato-foto-originale", indirizzo: `#/girato?file=${encodeURIComponent("2026-10-09/IMG_0043.JPG")}` },
  { nome: "profilo-non-valido", indirizzo: "#/video", dopo: profiloNonValido, poi: profiloCorretto },
  { nome: "girato-senza-scheda", indirizzo: `#/girato?file=${encodeURIComponent("2026-10-09/messo-a-mano.mp4")}` },
  { nome: "produzione", indirizzo: "#/produzione" },
  { nome: "pubblico", indirizzo: "#/pubblico" },
  { nome: "pubblico-senza-commenti", indirizzo: "#/pubblico?video=ricetta-in-diretta" },
  { nome: "classifica-vuota", indirizzo: "#/classifica" },
  { nome: "crescita-vuota", indirizzo: "#/crescita" },
  { nome: "stile", indirizzo: "#/stile" },
  { nome: "motori", indirizzo: "#/motori", pronta: "ul[aria-label]" },
  // L'app mette nella pagina il ponte del computer (`window.__MANGO_ANIMATION__.computer`): qui lo mette lo scenario scelto, che l'init script legge da localStorage.
  { nome: "motori-app-con-scheda", indirizzo: "#/motori", prima: (p) => scenarioComputer(p, "scheda"), pronta: "section[aria-label] dl", poi: (p) => scenarioComputer(p, null) },
  // «Segnala un problema» c'è solo nell'app, che mette nella pagina il ponte `segnalazione`: qui lo mette lo scenario scelto.
  { nome: "segnalazione-bottone", indirizzo: "#/video", prima: (p) => scenarioSegnalazione(p, true), poi: (p) => scenarioSegnalazione(p, false) },
  { nome: "segnalazione-dialogo", indirizzo: "#/video", prima: (p) => scenarioSegnalazione(p, true), dopo: apriLaSegnalazione, poi: (p) => scenarioSegnalazione(p, false) },
  { nome: "motori-app-senza-scheda", indirizzo: "#/motori", prima: (p) => scenarioComputer(p, "senza"), pronta: "section[aria-label] dl", poi: (p) => scenarioComputer(p, null) },
  // La chat: le scene si fotografano con la chat aperta e poi la chiudono (a meno che non sia accesa con --chat).
  { nome: "chat-conversazione", indirizzo: "#/video/carosello-dispensa/slide", pronta: "img[alt^='Slide 1 ']", dopo: (p) => chatEsempio(p, "alto"), poi: chiudiChat },
  { nome: "chat-permesso", indirizzo: "#/video/carosello-dispensa/slide", pronta: "img[alt^='Slide 1 ']", dopo: (p) => chatEsempio(p, "basso"), poi: chiudiChat },
  { nome: "chat-immagine-grande", indirizzo: "#/video/carosello-dispensa/slide", dopo: apriImmagineGrande, poi: async (p) => (await p.keyboard.press("Escape"), await chiudiChat(p)) },
  { nome: "chat-elenco", indirizzo: "#/video", dopo: async (p) => (await apriChat(p), p.getByRole("button", { name: T("Le conversazioni", "Conversations") }).click()), poi: chiudiChat },
  { nome: "chat-mango-lavora", indirizzo: "#/video/ricetta-in-diretta/montaggio", dopo: (p) => chatMango(p, false), poi: chiudiChatTempi },
  { nome: "chat-menu-modello-mango", indirizzo: "#/video/ricetta-in-diretta/montaggio", dopo: (p) => chatMango(p, true), poi: async (p) => (await p.reload(), await chiudiChatTempi(p)) },
  { nome: "chat-menu-modello-claude", indirizzo: "#/video/ricetta-in-diretta/montaggio", dopo: chatMenuClaude, poi: async (p) => (await p.reload(), await chiudiChatTempi(p)) },
  { nome: "chat-vuota", indirizzo: "#/girato", dopo: async (p) => (await apriChat(p), p.getByRole("button", { name: T("Nuova conversazione", "New conversation") }).click()), poi: chiudiChat },
  // La tendina dei comandi: «/» e un comando scelto con ↑ (la riga scelta, in fondo all'elenco, deve restare in vista); poi una parte del nome.
  { nome: "chat-comandi", indirizzo: "#/girato", dopo: (p) => chatComandi(p, "/", "ArrowUp"), poi: chiudiChat },
  { nome: "chat-comandi-filtro", indirizzo: "#/girato", dopo: (p) => chatComandi(p, "/mo", "ArrowDown"), poi: chiudiChat },
  // Una conversazione chiusa (è nell'elenco ma non ha il processo acceso), e il bottone «Chiudi la conversazione» premuto.
  { nome: "chat-chiusa", indirizzo: "#/girato", dopo: chatChiusa, poi: chiudiChatTempi },
  { nome: "chat-chiudi", indirizzo: "#/girato", dopo: chatChiudi, poi: chiudiChat },
  { nome: "chat-domanda", indirizzo: "#/video/ricetta-in-diretta/montaggio", dopo: chatDomanda, poi: chiudiChat },
  { nome: "chat-allegato", indirizzo: "#/video/carosello-dispensa/slide", dopo: chatAllegato, poi: chiudiChat },
  { nome: "chat-lavoro", indirizzo: "#/video/ricetta-in-diretta/montaggio", dopo: chatLavoro, poi: async (p) => (await fermaTuttiILavori(p), await chiudiChat(p)) },
  // Il giro in corso coi tempi che scorrono (serve un montaggio lungo come sotto): cronometro, strumento in corso, stime evidenziate.
  { nome: "chat-tempi", indirizzo: "#/video/ricetta-in-diretta/montaggio", dopo: chatTempi, poi: chiudiChatTempi },
  // Un comando che Claude aspetta (il bottone «Manda in background») e un lavoro già in background (la scheda con «Ferma»).
  { nome: "chat-background", indirizzo: "#/video/ricetta-in-diretta/montaggio", dopo: chatBackground, poi: chiudiChatTempi },
  // Serve il finto server con un montaggio lungo: `MONTA_FINTO_MS=8000 bun run verifica/finto-server.ts`.
  { nome: "lavori-piano-cambiato", indirizzo: "#/video", dopo: pianoCambiatoDuranteIlMontaggio, poi: fermaTuttiILavori },
]

const COMPUTER_DI_PROVA = {
  scheda: { schede: [{ indice: 0, nome: "NVIDIA GeForce RTX 3060 Ti", memoria_mb: 8192, libera_mb: 5200, capacita: "8.6" }], processore: "AMD Ryzen 7 5800X", thread: 16, ram_mb: 32768, disco_libero_mb: 214000 },
  senza: { schede: [], processore: "Intel Core i5-8250U", thread: 8, ram_mb: 3500, disco_libero_mb: 61000 },
}

async function scenarioComputer(pagina, nome) {
  await pagina.evaluate((n) => (n ? localStorage.setItem("prova.computer", n) : localStorage.removeItem("prova.computer")), nome)
  await pagina.reload()
}

async function scenarioSegnalazione(pagina, acceso) {
  await pagina.evaluate((a) => (a ? localStorage.setItem("prova.segnalazione", "si") : localStorage.removeItem("prova.segnalazione")), acceso)
  await pagina.reload()
}

async function apriLaSegnalazione(pagina) {
  await pagina.getByRole("button", { name: T("Segnala un problema", "Report a problem") }).click()
  await pagina.getByRole("dialog", { name: T("Segnala un problema", "Report a problem") }).waitFor({ timeout: 5000 }).catch(() => problemi.push("segnalazione-dialogo: il dialogo non si apre"))
}

// Un video già montato si apre su «Montato»: il palco c'è solo nel modo «Piano».
async function inPiano(pagina) {
  const piano = pagina.getByRole("button", { name: T("Piano", "Plan"), exact: true })
  if ((await piano.getAttribute("aria-pressed").catch(() => "true")) === "false") await piano.click()
}

// La resa delle slide chiesta come la chiede Claude e, a lavoro finito, un avviso aperto sulla sua slide.
async function renderEAvvisi(pagina) {
  await pagina.evaluate(() => fetch("/api/video/carosello-dispensa/lavori", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ comando: "carosello" }) }))
  await pagina.getByRole("list", { name: "Avvisi delle slide" }).waitFor({ timeout: 8000 }).catch(() => problemi.push("slide-carosello-avvisi: gli avvisi non compaiono dopo la resa"))
  await pagina.getByRole("button", { name: /^Slide 2:/ }).click().catch(() => {})
}

// Il finto server dice, come farebbe quello vero, che un file scritto a mano non passa i controlli: la pagina si aggiorna da sola.
const dicePerche = (pagina, corpo) => pagina.evaluate((c) => fetch("/finto/problemi", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) }), corpo)

async function schedaNonValida(pagina) {
  await dicePerche(pagina, { slug: "cena-fra-due-cucine", scheda: ["proposta: «spezzoni» non è una chiave ammessa"] })
  await pagina.getByText(/La scheda di questo video ha un errore/).waitFor({ timeout: 5000 }).catch(() => problemi.push("scheda-non-valida: l'avviso non compare"))
}

async function pianoNonValido(pagina) {
  await dicePerche(pagina, { slug: "ricetta-in-diretta", piano: ["scene[0]: manca «nome»"] })
  await pagina.getByText(/Il piano di questo video ha un errore: chiedi/).waitFor({ timeout: 5000 }).catch(() => problemi.push("montaggio-piano-non-valido: l'avviso non compare"))
  await pagina.getByText("Dettaglio per chi sistema l'errore").click().catch(() => problemi.push("montaggio-piano-non-valido: il riquadro del dettaglio non si apre"))
}

async function risoltoIndietro(pagina) {
  await dicePerche(pagina, { slug: "ricetta-in-diretta", indietro: true })
  await pagina.getByText(/non segue ancora il piano o lo stile di adesso|does not follow the current plan or style yet/).waitFor({ timeout: 5000 }).catch(() => problemi.push("montaggio-non-aggiornato: l'avviso non compare"))
}

async function schedaGirataRifiutata(pagina) {
  await dicePerche(pagina, { file: "2026-10-09/messo-a-mano.mp4", scheda: ["soggetto: «soggetto» non è una chiave ammessa"] })
  await pagina.getByText(/La scheda di questo file ha un errore/).waitFor({ timeout: 5000 }).catch(() => problemi.push("girato-scheda-rifiutata: l'avviso non compare"))
}

// Lo studio dal telefono acceso o spento sul finto server, con Tailscale pronto, bloccato da Windows o assente: la pagina lo mostra da sola.
async function studioDalTelefono(pagina, acceso, tailscale) {
  await pagina.evaluate(async ([a, t]) => {
    const manda = (percorso, metodo, corpo) => fetch(percorso, { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) })
    await manda("/finto/tailscale", "POST", { stato: t })
    await manda("/api/accesso-studio", "PUT", { acceso: a })
  }, [acceso, tailscale])
  const atteso = acceso ? pagina.getByRole("button", { name: T("Spegni", "Turn off") }) : pagina.getByRole("button", { name: T("Accendi", "Turn on") })
  await atteso.waitFor({ timeout: 5000 }).catch(() => problemi.push(`lo studio dal telefono ${acceso ? "non si accende" : "non si spegne"} nella pagina`))
}

// Come il server vero quando `profilo.json` non passa lo schema: l'avviso compare da solo, e sparisce quando il profilo torna buono.
async function profiloNonValido(pagina) {
  const frasi = [T("macchina.scheda_video: deve essere un numero o null", "macchina.scheda_video: must be a number or null"), T("canali[0].piattaforma: manca", "canali[0].piattaforma: missing")]
  await pagina.evaluate((p) => fetch("/finto/profilo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ problemi: p }) }), frasi)
  await pagina.getByRole("status", { name: T("Profilo da correggere", "Profile needs fixing") }).waitFor({ timeout: 5000 }).catch(() => problemi.push("profilo-non-valido: l'avviso non compare"))
}

function profiloCorretto(pagina) {
  return pagina.evaluate(() => fetch("/finto/profilo", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }))
}

async function schedaCorretta(pagina) {
  await dicePerche(pagina, { slug: "cena-fra-due-cucine" })
  await dicePerche(pagina, { slug: "ricetta-in-diretta" })
  await dicePerche(pagina, { file: "2026-10-09/messo-a-mano.mp4" })
}

async function fermaTuttiILavori(pagina) {
  await pagina.evaluate(async () => {
    const { in_corso: inCorso, in_coda: inCoda } = await (await fetch("/api/lavori")).json()
    for (const l of [inCorso, ...inCoda]) if (l) await fetch(`/api/lavori/${l.id}`, { method: "DELETE" })
  })
  await pagina.waitForFunction(async () => (await (await fetch("/api/lavori")).json()).in_corso === null, undefined, { timeout: 5000 }).catch(() => {})
}

// Un montaggio parte, il suo piano viene salvato di nuovo, e si apre la barra dei lavori.
async function pianoCambiatoDuranteIlMontaggio(pagina) {
  await fermaTuttiILavori(pagina)
  await pagina.evaluate(async () => {
    const slug = "ricetta-in-diretta"
    await fetch(`/api/video/${slug}/lavori`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ comando: "monta" }) })
    while ((await (await fetch("/api/lavori")).json()).in_corso?.comando !== "monta") await new Promise((ok) => setTimeout(ok, 50))
    const piano = (await (await fetch(`/api/video/${slug}`)).json()).piano
    await fetch(`/api/video/${slug}/piano`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...piano, coda: (piano.coda ?? 0) + 0.5 }) })
  })
  const bottone = pagina.locator("header button[aria-expanded]").nth(1)
  await bottone.locator("[aria-hidden]", { hasText: "!" }).waitFor({ timeout: 3000 }).catch(() => problemi.push("lavori-piano-cambiato: «Piano cambiato» non compare nella barra (il finto server va avviato con MONTA_FINTO_MS=8000)"))
  await bottone.click().catch(() => {})
}

// --- La chat -----------------------------------------------------------------------------------------------------------
async function apriChat(pagina) {
  if ((await pagina.getByRole("complementary", { name: "Chat", exact: true }).count()) === 0) await pagina.getByRole("button", { name: /^Chat/ }).click()
  await pagina.getByRole("complementary", { name: "Chat", exact: true }).waitFor()
}

async function chiudiChat(pagina) {
  if (conChat) return
  if ((await pagina.getByRole("complementary", { name: "Chat", exact: true }).count()) > 0) await pagina.keyboard.press("Control+j")
}

// La conversazione d'esempio, in alto (le prime risposte) o in fondo (il permesso in attesa).
async function chatEsempio(pagina, dove) {
  await pagina.evaluate(() => localStorage.setItem("mango-animation.chat.corrente", "esempio"))
  await pagina.reload()
  await apriChat(pagina)
  const log = pagina.getByRole("log", { name: "La conversazione" })
  await log.waitFor()
  await pagina.getByText("Cosa ho trovato").waitFor()
  await pagina.waitForTimeout(500)
  await log.evaluate((el, d) => (el.scrollTop = d === "alto" ? 0 : el.scrollHeight), dove)
  await pagina.waitForTimeout(300)
}

async function apriImmagineGrande(pagina) {
  await chatEsempio(pagina, "alto")
  const miniatura = pagina.getByRole("button", { name: /Ingrandisci/ }).first()
  await miniatura.scrollIntoViewIfNeeded()
  await miniatura.click()
  await pagina.getByRole("dialog").waitFor()
  await pagina.waitForTimeout(300)
}

async function nuovaConversazione(pagina) {
  await apriChat(pagina)
  await pagina.getByRole("button", { name: T("Nuova conversazione", "New conversation") }).click()
  const campo = pagina.getByRole("textbox", { name: "Messaggio" })
  await campo.fill("")
  return campo
}

// Si scrive davvero nel campo, tasto per tasto, e si manda con Invio.
async function chatDomanda(pagina) {
  const campo = await nuovaConversazione(pagina)
  await campo.click()
  await campo.pressSequentially("Hai una domanda per me?", { delay: 15 })
  await campo.press("Enter")
  await pagina.getByRole("button", { name: "Invia le risposte" }).waitFor({ timeout: 8000 })
  await pagina.getByRole("button", { name: /Sagoma al centro/ }).click()
  await pagina.getByRole("button", { name: /Copertina Un primo/ }).click()
  await pagina.waitForTimeout(300)
}

// Si scrive la barra nel campo di una conversazione nuova e si sceglie con una freccia: la tendina resta aperta nella foto.
async function chatComandi(pagina, testo, freccia) {
  await apriChat(pagina)
  await pagina.getByRole("button", { name: T("Nuova conversazione", "New conversation") }).click()
  const campo = pagina.getByRole("textbox", { name: T("Messaggio", "Message") })
  await campo.fill("")
  await campo.click()
  await campo.pressSequentially(testo, { delay: 15 })
  const elenco = pagina.getByRole("listbox", { name: T("Comandi", "Commands") })
  await elenco.waitFor({ timeout: 8000 }).catch(() => problemi.push(`chat-comandi: la tendina non compare con «${testo}»`))
  await campo.press(freccia)
  await pagina.waitForTimeout(300)
  const scelta = pagina.locator('[role="option"][aria-selected="true"]')
  const dentro = await scelta.evaluate((el) => {
    const r = el.getBoundingClientRect()
    const e = el.closest('[role="listbox"]').getBoundingClientRect()
    return r.top >= e.top - 1 && r.bottom <= e.bottom + 1
  })
  if (!dentro) problemi.push(`chat-comandi: la riga scelta con «${testo}» non è tutta in vista`)
}

async function chatChiusa(pagina) {
  await pagina.evaluate(() => localStorage.setItem("mango-animation.chat.corrente", "vecchia"))
  await pagina.reload()
  await apriChat(pagina)
  await pagina.getByText("Verso le").waitFor()
  await pagina.getByRole("textbox", { name: "Messaggio" }).fill("")
  await pagina.getByText("Chiusa").first().waitFor({ timeout: 8000 }).catch(() => problemi.push("chat-chiusa: lo stato «Chiusa» non compare"))
  if ((await pagina.getByRole("button", { name: "Chiudi la conversazione" }).count()) > 0) problemi.push("chat-chiusa: il bottone «Chiudi la conversazione» c'è su una conversazione chiusa")
}

// Una conversazione nuova con un messaggio: finita la risposta il processo è acceso e il bottone c'è; premuto, lo stato dice «Chiusa».
async function chatChiudi(pagina) {
  const campo = await nuovaConversazione(pagina)
  await campo.click()
  await campo.pressSequentially("Ciao, dimmi solo che ci sei", { delay: 10 })
  await campo.press("Enter")
  const chiudi = pagina.getByRole("button", { name: "Chiudi la conversazione" })
  await pagina.getByText(/^Fatto\./).waitFor({ timeout: 8000 }).catch(() => problemi.push("chat-chiudi: la risposta non arriva"))
  await chiudi.waitFor({ timeout: 8000 }).catch(() => problemi.push("chat-chiudi: il bottone «Chiudi la conversazione» non compare"))
  await pagina.waitForTimeout(300)
  await chiudi.click().catch(() => {})
  await pagina.getByText("Chiusa").first().waitFor({ timeout: 8000 }).catch(() => problemi.push("chat-chiudi: dopo il clic lo stato non dice «Chiusa»"))
  await pagina.waitForTimeout(300)
}

async function chatAllegato(pagina) {
  const campo = await nuovaConversazione(pagina)
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64")
  await pagina.locator('input[type="file"]').setInputFiles({ name: "schermata.png", mimeType: "image/png", buffer: png })
  await pagina.getByRole("button", { name: "Togli l'allegato schermata.png" }).waitFor()
  await campo.click()
  await campo.pressSequentially("Che ne pensi di questa schermata?", { delay: 10 })
  await pagina.waitForTimeout(300)
}

async function chatTempi(pagina) {
  await fermaTuttiILavori(pagina)
  await pagina.evaluate(() => localStorage.setItem("mango-animation.chat.corrente", "tempi"))
  await pagina.reload()
  await apriChat(pagina)
  await pagina.getByRole("group", { name: "Lavoro: Montaggio" }).first().waitFor({ timeout: 8000 }).catch(() => problemi.push("chat-tempi: la scheda del lavoro non compare"))
  await pagina.getByRole("status").filter({ hasText: /(Sta pensando|Aspetta lo strumento) · / }).waitFor({ timeout: 8000 }).catch(() => problemi.push("chat-tempi: il cronometro del giro non compare"))
  await pagina.waitForTimeout(2500)
}

async function chatBackground(pagina) {
  await pagina.evaluate(() => localStorage.setItem("mango-animation.chat.corrente", "background"))
  await pagina.reload()
  await apriChat(pagina)
  await pagina.getByRole("group", { name: /^Lavoro in background/ }).waitFor({ timeout: 8000 }).catch(() => problemi.push("chat-background: la scheda del lavoro in background non compare"))
  await pagina.getByRole("button", { name: "Manda in background" }).waitFor({ timeout: 8000 }).catch(() => problemi.push("chat-background: il bottone «Manda in background» non compare"))
  await pagina.waitForTimeout(500)
}

// Una conversazione di Mango Code che lavora; con `conMenu` il menu del modello si fotografa aperto (l'elenco di un menu del browser non finisce nelle foto: si mostra come lista).
async function chatMango(pagina, conMenu) {
  await pagina.evaluate(() => localStorage.setItem("mango-animation.chat.corrente", "mango"))
  await pagina.reload()
  await apriChat(pagina)
  await pagina.getByRole("status").filter({ hasText: /Mango Code (sta pensando|aspetta lo strumento)/ }).waitFor({ timeout: 8000 }).catch(() => problemi.push("chat-mango: «Mango Code sta pensando» non compare"))
  if (conMenu) await mostraMenu(pagina, "Modello")
  await pagina.waitForTimeout(500)
}

async function chatMenuClaude(pagina) {
  await pagina.evaluate(() => localStorage.setItem("mango-animation.chat.corrente", "esempio"))
  await pagina.reload()
  await apriChat(pagina)
  await pagina.getByText("Cosa ho trovato").waitFor()
  await mostraMenu(pagina, "Modello")
  await pagina.waitForTimeout(300)
}

async function mostraMenu(pagina, nome) {
  await pagina.getByLabel(nome).evaluate((el) => {
    el.size = el.options.length
    el.style.cssText += ";position:absolute;z-index:50;height:auto;box-shadow:0 2px 8px rgba(0,0,0,.25)"
  })
}

async function chiudiChatTempi(pagina) {
  await fermaTuttiILavori(pagina)
  await pagina.evaluate(() => localStorage.setItem("mango-animation.chat.corrente", "esempio"))
  await chiudiChat(pagina)
}

async function chatLavoro(pagina) {
  await fermaTuttiILavori(pagina)
  const campo = await nuovaConversazione(pagina)
  await campo.click()
  await campo.pressSequentially("Monta il video ricetta-in-diretta", { delay: 10 })
  await campo.press("Enter")
  await pagina.getByRole("group", { name: "Lavoro: Montaggio" }).waitFor({ timeout: 8000 }).catch(() => problemi.push("chat-lavoro: la scheda del lavoro non compare"))
  await pagina.waitForTimeout(1500)
}

// Le misure vivono nella pagina: stesse regole a ogni larghezza.
function misura() {
  const finestra = window.innerWidth
  const principale = document.querySelector("main")
  const scorre = (el) => {
    const s = getComputedStyle(el)
    return ["auto", "scroll", "hidden"].includes(s.overflowX)
  }
  const tagliati = []
  for (const el of document.querySelectorAll("button, input, select, textarea, a[href]")) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === "hidden") continue
    let tagliatoDa = false
    for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      if (scorre(p) && r.right > p.getBoundingClientRect().right + 1) {
        tagliatoDa = true
        break
      }
    }
    if (!tagliatoDa && r.right > finestra + 1) tagliati.push(`${el.tagName.toLowerCase()} «${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30)}»`)
  }
  const alti = []
  const visibile = principale ? principale.clientHeight : window.innerHeight
  for (const el of document.querySelectorAll("*")) {
    if (el === principale || el === document.body || el === document.documentElement) continue
    const s = getComputedStyle(el)
    if ((s.overflowY === "auto" || s.overflowY === "scroll") && el.scrollHeight > el.clientHeight + 1 && el.getBoundingClientRect().height > visibile + 1) alti.push(el.className || el.tagName)
  }
  // I pannelli accanto all'anteprima: alti quanto la riga, che è alta quanto l'anteprima, e niente che ne esce.
  const fuoriRiga = []
  for (const el of document.querySelectorAll('[data-accanto="true"]')) {
    const riga = el.closest("[data-allinea]")
    const anteprima = riga?.firstElementChild?.firstElementChild
    if (!riga || !anteprima) continue
    const altezza = riga.getBoundingClientRect().height
    const attesa = Math.max(anteprima.getBoundingClientRect().height, parseFloat(getComputedStyle(el).minHeight) || 0)
    if (Math.abs(el.getBoundingClientRect().bottom - riga.getBoundingClientRect().bottom) > 1 || altezza > attesa + 1 || el.scrollHeight > el.clientHeight + 1) fuoriRiga.push(el.className)
  }
  return {
    fuoriRiga,
    doc: document.documentElement.scrollWidth - finestra,
    principale: principale ? principale.scrollWidth - principale.clientWidth : 0,
    tagliati,
    alti,
    caricamenti: document.querySelectorAll("[data-caricamento]").length,
  }
}

mkdirSync(cartella, { recursive: true })
if (!soloVista) for (const vecchio of readdirSync(cartella)) if (vecchio.endsWith(".png") && /-en(-[ab])?\.png$/.test(vecchio) === inglese) rmSync(join(cartella, vecchio))

// Dove il Chromium di Playwright non è installato: `--browser chrome` usa il Chrome del computer.
const browser = await chromium.launch(valore("--browser", "") === "chrome" ? { channel: "chrome" } : {})
const problemi = []
let foto = 0
for (const tema of temi) {
  for (const larghezza of larghezze) {
    const contesto = await browser.newContext({ viewport: { width: larghezza, height: 900 }, colorScheme: tema === "scuro" ? "dark" : "light", locale: inglese ? "en-US" : "it-IT" })
    const pagina = await contesto.newPage()
    await pagina.addInitScript((computer) => {
      const nome = localStorage.getItem("prova.computer")
      const ponte = {}
      if (nome && computer[nome]) ponte.computer = { leggi: async () => computer[nome] }
      if (localStorage.getItem("prova.segnalazione")) ponte.segnalazione = { invioAttivo: async () => true, invia: async () => ({ inviata: true }) }
      if (Object.keys(ponte).length > 0) window.__MANGO_ANIMATION__ = ponte
    }, COMPUTER_DI_PROVA)
    if (conChat) await pagina.addInitScript(() => (localStorage.setItem("mango-animation.chat.corrente", "esempio"), localStorage.setItem("mango-animation.chat.aperta", "si")))
    const errori = []
    // Le scene animate non ancora rese non si trovano: il server non dice quali lo sono, e si prova a caricarle.
    pagina.on("console", (m) => m.type() === "error" && !m.location().url.includes("/lavoro/scene/") && errori.push(m.text()))
    pagina.on("pageerror", (e) => errori.push(e.message))
    await pagina.goto(`${origine}/`)
    for (const [n, vista] of VISTE.entries()) {
      if (soloVista && !vista.nome.includes(soloVista)) continue
      if (inglese && SOLO_ITALIANO.some((nome) => vista.nome.startsWith(nome))) continue
      const etichetta = `${vista.nome} @ ${larghezza}px, tema ${tema}`
      errori.length = 0
      await pagina.evaluate((h) => (window.location.hash = h), vista.indirizzo)
      await pagina.waitForTimeout(300)
      const caricata = await pagina.waitForFunction(() => document.querySelectorAll("[data-caricamento]").length === 0, undefined, { timeout: 20000 }).then(() => true, () => false)
      if (!caricata) problemi.push(`${etichetta}: ancora «carico…» dopo 20 s`)
      if (vista.prima) await vista.prima(pagina)
      if (vista.pronta) await pagina.waitForSelector(vista.pronta, { timeout: 10000 }).catch(() => problemi.push(`${etichetta}: ${vista.pronta} non compare`))
      await pagina.waitForTimeout(900)
      if (vista.dopo) {
        await vista.dopo(pagina)
        await pagina.waitForTimeout(600)
      }
      await pagina.evaluate(() => document.querySelector("main")?.scrollTo(0, 0))
      const m = await pagina.evaluate(misura)
      const base = `${String(n + 1).padStart(2, "0")}-${vista.nome}-${larghezza}-${tema}${inglese ? "-en" : ""}`
      await pagina.screenshot({ path: join(cartella, `${base}.png`) })
      foto++
      // Una vista più alta dello schermo si fotografa anche più in basso: ciò che non si vede non si può giudicare.
      const { alto, visibile } = await pagina.evaluate(() => ({ alto: document.querySelector("main")?.scrollHeight ?? 0, visibile: document.querySelector("main")?.clientHeight ?? 0 }))
      for (const [suffisso, quota] of [["b", 1], ["a", 0.5]]) {
        if (alto <= visibile + 5 || (suffisso === "a" && alto <= visibile * 2)) continue
        await pagina.evaluate((q) => document.querySelector("main")?.scrollTo(0, (document.querySelector("main").scrollHeight - document.querySelector("main").clientHeight) * q), quota)
        await pagina.waitForTimeout(150)
        await pagina.screenshot({ path: join(cartella, `${base}-${suffisso}.png`) })
        foto++
      }
      if (m.doc > 0) problemi.push(`${etichetta}: la pagina esce di ${m.doc}px in orizzontale`)
      if (m.principale > 0) problemi.push(`${etichetta}: il corpo esce di ${m.principale}px in orizzontale`)
      if (m.tagliati.length > 0) problemi.push(`${etichetta}: escono dal bordo destro ${m.tagliati.slice(0, 5).join(", ")}`)
      if (m.alti.length > 0) problemi.push(`${etichetta}: scorrono da soli ma sono più alti dello schermo: ${m.alti.slice(0, 3).join(", ")}`)
      if (m.fuoriRiga.length > 0) problemi.push(`${etichetta}: i pannelli accanto all'anteprima non sono alti quanto la riga`)
      if (m.caricamenti > 0) problemi.push(`${etichetta}: resta un «carico…»`)
      for (const e of errori) problemi.push(`${etichetta}: errore in console: ${e}`)
      if (vista.poi) await vista.poi(pagina)
    }
    await contesto.close()
  }
}
await browser.close()

console.log(`${foto} foto in ${cartella}`)
if (problemi.length > 0) {
  console.log(`\n${problemi.length} problemi:`)
  for (const p of problemi) console.log(`  ${p}`)
  process.exitCode = 1
} else console.log("nessun problema")
