// Le pagine vere da mettere a schermo, in formato telefono, e dove stanno le frasi che la scena cerchia.
//
// La lancia `python -m motore pagina <slug>` (docs/MOTORE.md, «Le pagine vere»), che poi fa i ritagli. A mano, dalla radice del
// repo: node strumenti/pagina.mjs <pagine.json> [nome …]
//
// `pagine.json` sta in `materiali/` del video e ha una voce per pagina:
//   { "articolo": { "url": "https://esempio.it/articolo", "intera": true,
//                   "frasi": { "titolo": "Il titolo dell articolo", "cifra": "Il dato citato" } } }
// Accanto al JSON scrive `screen-<nome>.png` (tutta la pagina con `intera`; altrimenti almeno la finestra, e sotto l'ultima frase
// quanta pagina serve a portarla nella metà alta), `screen-<nome>.json` con `larghezza`, `altezza` e i riquadri delle frasi,
// `[x, y, largo, alto]` in px dell'immagine, e `screen-<nome>.txt` con URL, stato HTTP, titolo e quando: è la provenienza. Una frase
// che non si trova resta fuori dal JSON, e si dice. Una voce con `"filmato": [da, a]` è una pagina che si muove: si filma grande quanto lo
// schermo del telefono, col tempo della pagina fermo fra un fotogramma e l'altro (`orologio.mjs`), in `filmato-<nome>.webm`, e la cattura
// ferma è quella a `da`. Esce con 1 se una pagina non è stata presa. Le misure: `pagina` dello stile.
import { apriChrome } from "./chrome.mjs";
import { dice } from "./lingua.mjs";
import { spawn } from "node:child_process";
import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { orologio } from "./orologio.mjs";
import { leggiStile } from "./stile.mjs";

const STILE = leggiStile(fileURLToPath(new URL("..", import.meta.url)), process.env.MANGO_ANIMATION_LAVORO);
const { larghezza: LARGHEZZA, densita: DENSITA, finestra: FINESTRA, sotto_le_frasi: SOTTO } = STILE.pagina;
const FORMATO = STILE.formati.verticale;

/** La posizione del testo `frase` nella pagina, in px CSS: si cerca nei nodi di testo, così vale anche per una frase dentro un paragrafo
 * lungo, e si uniscono i riquadri quando la frase è scritta su più righe. Le occorrenze nascoste (l'indice chiuso di Wikipedia da
 * telefono, le sezioni chiuse) non contano; `indice` sceglie fra quelle visibili (1 = la prima), perché gli stessi titoli tornano in cima e nel capitolo. */
const MISURA = ([frase, indice]) => {
  const spazio = (s) => s.replace(/\s+/g, " ").toLowerCase();
  const cercato = spazio(frase);
  const intorno = document.createRange();
  const cammino = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let viste = 0;
  let riquadri = [];
  for (let nodo = cammino.nextNode(); nodo; nodo = cammino.nextNode()) {
    const testo = nodo.nodeValue;
    if (!testo || !testo.trim()) continue;
    const normalizzata = spazio(testo);
    if (!normalizzata.includes(cercato)) continue;
    // Ritrova gli indici veri: la normalizzata accorcia gli spazi, quindi si ricostruisce camminando i caratteri.
    const dove = normalizzata.indexOf(cercato);
    let da = -1;
    let a = -1;
    for (let i = 0; i < testo.length; i++) {
      const prossimi = spazio(testo.slice(0, i + 1)).length;
      if (da < 0 && prossimi > dove) da = i;
      if (da >= 0 && prossimi >= dove + cercato.length) { a = i + 1; break; }
    }
    if (da < 0 || a < 0) return null;
    intorno.setStart(nodo, da);
    intorno.setEnd(nodo, a);
    // Un testo in una sezione chiusa ha i suoi riquadri, ma non si vede e non entra nella cattura: lo dice checkVisibility.
    const visibili = nodo.parentElement.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) ? [...intorno.getClientRects()].filter((r) => r.width > 1 && r.height > 1) : [];
    if (visibili.length === 0 || ++viste < indice) continue;
    riquadri = visibili;
    break;
  }
  if (riquadri.length === 0) return null;
  const x = Math.min(...riquadri.map((r) => r.left));
  const y = Math.min(...riquadri.map((r) => r.top));
  const destra = Math.max(...riquadri.map((r) => r.right));
  const sotto = Math.max(...riquadri.map((r) => r.bottom));
  return [x, y + window.scrollY, destra - x, sotto - y];
};

/** Scrive accanto e rinomina alla fine: chi osserva la cartella non vede mai un file a metà. */
function scrivi(cartella, nome, contenuto) {
  writeFileSync(join(cartella, `.${nome}.parziale`), contenuto);
  renameSync(join(cartella, `.${nome}.parziale`), join(cartella, nome));
}

/** I riquadri delle frasi nella `scheda`, in px CSS della pagina; quelle che non si trovano si dicono. */
async function misura(scheda, nome, frasi) {
  const riquadri = {};
  for (const [chiave, richiesta] of Object.entries(frasi)) {
    const [frase, indice] = Array.isArray(richiesta) ? richiesta : [richiesta, 1];
    const r = await scheda.evaluate(MISURA, [frase, indice]);
    if (r) riquadri[chiave] = r;
    else console.error(dice(`${nome}: non trovo «${frase}» fra il testo che si vede`, `${nome}: I cannot find «${frase}» in the visible text`));
  }
  return riquadri;
}

/** Quando è stata presa, all'ora di questo computer: «2026-11-07 alle 15:42». */
function adesso() {
  const ora = new Date();
  return new Date(ora.getTime() - ora.getTimezoneOffset() * 60000).toISOString().slice(0, 16).replace("T", " alle ");
}

/** Una pagina che si muove, filmata grande quanto lo schermo del telefono (il formato del video): l'orologio finto la porta a `da`,
 * lì si prende anche la cattura ferma (`screen-<nome>.png`, con le frasi), poi un fotogramma ogni trentesimo fino ad `a` in
 * `filmato-<nome>.webm`, senza suono. */
async function filma(nome, voce) {
  const [da, a] = voce.filmato;
  const schermo = { width: LARGHEZZA, height: Math.round((LARGHEZZA * FORMATO.alto) / FORMATO.largo) };
  const contestoFilmato = await browser.newContext({ ...TELEFONO, viewport: schermo });
  await contestoFilmato.addInitScript(orologio);
  const scheda = await contestoFilmato.newPage();
  try {
    const risposta = await scheda.goto(voce.url, { waitUntil: "load", timeout: 60000 });
    await scheda.evaluate(() => document.fonts.ready);
    // Il tempo della pagina è fermo: questa attesa vera lascia arrivare i file che carica da sé (moduli, immagini, modelli 3D).
    await scheda.waitForTimeout(1500);
    const passo = 1000 / FORMATO.fps;
    for (let t = 0; t < da * 1000 - passo / 2; t += passo) await scheda.evaluate((ms) => window.__orologio.avanza(ms), passo);
    const qui = dirname(file);
    const png = await scheda.screenshot();
    const frasi = Object.fromEntries(Object.entries(await misura(scheda, nome, voce.frasi ?? {})).map(([k, r]) => [k, r.map((v) => Math.round(v * DENSITA))]));
    const parziale = join(qui, `.filmato-${nome}.webm.parziale`);
    const codifica = spawn("ffmpeg", ["-v", "error", "-y", "-f", "image2pipe", "-framerate", String(FORMATO.fps), "-i", "-", "-an", "-c:v", "libvpx-vp9", "-crf", "32", "-b:v", "0", "-g", String(FORMATO.fps / 2), "-pix_fmt", "yuv420p", "-row-mt", "1", "-deadline", "good", "-cpu-used", "4", "-f", "webm", parziale], { stdio: ["pipe", "inherit", "inherit"] });
    const finita = new Promise((risolvi, rifiuta) => {
      codifica.on("error", rifiuta);
      codifica.on("close", (codice) => (codice === 0 ? risolvi() : rifiuta(new Error(dice(`ffmpeg è uscito con ${codice}`, `ffmpeg exited with ${codice}`)))));
    });
    const fotogrammi = Math.round((a - da) * FORMATO.fps);
    try {
      for (let n = 0; n < fotogrammi; n++) {
        if (n > 0) await scheda.evaluate((ms) => window.__orologio.avanza(ms), passo);
        const jpeg = await scheda.screenshot({ type: "jpeg", quality: 92 });
        if (!codifica.stdin.write(jpeg)) await new Promise((r) => codifica.stdin.once("drain", r));
      }
      codifica.stdin.end();
      await finita;
    } catch (errore) {
      codifica.kill();
      rmSync(parziale, { force: true });
      throw errore;
    }
    renameSync(parziale, join(qui, `filmato-${nome}.webm`));
    const [largo, alto] = [png.readUInt32BE(16), png.readUInt32BE(20)];
    const titolo = await scheda.title();
    scrivi(qui, `screen-${nome}.png`, png);
    scrivi(qui, `screen-${nome}.json`, JSON.stringify({ larghezza: largo, altezza: alto, frasi }) + "\n");
    scrivi(qui, `screen-${nome}.txt`, `${voce.url}\n${risposta?.status() ?? "?"} · ${titolo}\npresa il ${adesso()}\nfilmata da ${da} s a ${a} s del suo tempo, ${fotogrammi} fotogrammi\n`);
    console.log(dice(`${nome}: ${risposta?.status()} · filmata ${largo}×${alto}, ${fotogrammi} fotogrammi · ${titolo}`, `${nome}: ${risposta?.status()} · filmed ${largo}×${alto}, ${fotogrammi} frames · ${titolo}`));
  } finally {
    await contestoFilmato.close();
  }
}

const file = resolve(process.argv[2] ?? "");
const pagine = JSON.parse(readFileSync(file, "utf8"));
const volute = process.argv.slice(3);
const nomi = volute.length > 0 ? volute : Object.keys(pagine);

const TELEFONO = {
  deviceScaleFactor: DENSITA,
  isMobile: true,
  hasTouch: true,
  locale: "it-IT",
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
};
const browser = await apriChrome({ headless: !process.env.PAGINA_VISIBILE });
const contesto = await browser.newContext({ ...TELEFONO, viewport: { width: LARGHEZZA, height: FINESTRA } });
const pagina = await contesto.newPage();
let mancate = 0;

for (const nome of nomi) {
  const voce = pagine[nome];
  if (!voce) {
    console.error(dice(`non conosco «${nome}»: ho ${Object.keys(pagine).join(", ")}`, `I do not know «${nome}»: I have ${Object.keys(pagine).join(", ")}`));
    mancate++;
    continue;
  }
  try {
    if (voce.filmato) {
      await filma(nome, voce);
      continue;
    }
    const risposta = await pagina.goto(voce.url, { waitUntil: "domcontentloaded", timeout: 60000 });
    // Un controllo anti-bot («Checking your browser…») si scioglie da sé dopo qualche secondo: si aspetta che la pagina vera arrivi.
    for (let giro = 0; giro < 40; giro++) {
      const ostacolo = /checking your browser|just a moment|attention required/i.test(await pagina.title());
      if (!ostacolo && (await pagina.evaluate(() => document.body.innerText.length)) > 1500) break;
      await pagina.waitForTimeout(1000);
    }
    if (/checking your browser|just a moment|attention required/i.test(await pagina.title())) {
      console.error(dice(`${nome}: NON PRESO · il controllo anti-bot non si è sciolto in 40 s; i file di prima restano com'erano`, `${nome}: NOT TAKEN · the anti-bot check did not clear in 40 s; the earlier files are left as they were`));
      mancate++;
      continue;
    }
    await pagina.waitForTimeout(1200);
    await pagina.evaluate(() => document.fonts.ready);
    for (const etichetta of ["Accetta e chiudi", "Accetta tutto", "Accetta", "Accept all cookies", "Accept all", "Rifiuta non essenziali"]) {
      const bottone = pagina.getByRole("button", { name: etichetta, exact: false }).first();
      if (await bottone.isVisible().catch(() => false)) {
        await bottone.click().catch(() => {});
        await pagina.waitForTimeout(1200);
        break;
      }
    }
    // Senza `intera` la cattura arriva almeno in fondo alla finestra e, sotto l'ultima frase, per SOTTO px dell'immagine.
    const prima = await misura(pagina, nome, voce.frasi ?? {});
    const fondo = Math.max(0, ...Object.values(prima).map(([, y, , alto]) => y + alto));
    const ritaglio = voce.intera === true ? {} : { clip: { x: 0, y: 0, width: LARGHEZZA, height: Math.max(FINESTRA, fondo + SOTTO / DENSITA) } };
    const png = await pagina.screenshot({ fullPage: true, ...ritaglio });
    // Le frasi trovate si rimisurano dopo la cattura, dove stanno nell'immagine scritta.
    const trovate = Object.fromEntries(Object.entries(voce.frasi ?? {}).filter(([chiave]) => chiave in prima));
    const dopo = {};
    for (const [chiave, r] of Object.entries(await misura(pagina, nome, trovate))) dopo[chiave] = r.map((v) => Math.round(v * DENSITA));
    const [largo, alto] = [png.readUInt32BE(16), png.readUInt32BE(20)];
    const titolo = await pagina.title();
    const qui = dirname(file);
    scrivi(qui, `screen-${nome}.png`, png);
    scrivi(qui, `screen-${nome}.json`, JSON.stringify({ larghezza: largo, altezza: alto, frasi: dopo }) + "\n");
    scrivi(qui, `screen-${nome}.txt`, `${voce.url}\n${risposta?.status() ?? "?"} · ${titolo}\npresa il ${adesso()}\n`);
    console.log(dice(`${nome}: ${risposta?.status()} · ${largo}×${alto} · ${Object.keys(dopo).length} frasi · ${titolo}`, `${nome}: ${risposta?.status()} · ${largo}×${alto} · ${Object.keys(dopo).length} sentences · ${titolo}`));
  } catch (e) {
    console.error(dice(`${nome}: NON PRESO · ${String(e.message).split("\n")[0]}`, `${nome}: NOT TAKEN · ${String(e.message).split("\n")[0]}`));
    mancate++;
  }
}

await browser.close();
process.exitCode = mancate > 0 ? 1 : 0;
