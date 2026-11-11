// Le slide di un carosello: ogni `section.slide` di `carosello.html` diventa `slide-<n>.png`, e si guarda che ciò che si legge stia
// fuori dai lati che il telefono taglia, dalla colonna dei bottoni di TikTok e dalla zona della didascalia.
//
// La lancia `python -m motore carosello <slug>` (docs/MOTORE.md, «Il carosello»). A mano, dalla radice del repo:
//   node strumenti/carosello.mjs <carosello.html> <cartella delle slide>
// Scrive ogni slide accanto col nome `.slide-<n>.parziale.png` e la rinomina solo a lavoro finito. Sull'ultima riga di stdout un JSON:
// { "slide": 3, "avvisi": [ { "slide": 2, "cosa": "lato destro" | "lato sinistro" | "didascalia" | "immagine" | "carattere" | "piccolo" | "tagliato" | "accavallato" | "vuota", "testo": "…", "dettaglio"?: "…" } ] }.
// Oltre ai lati e alla didascalia: il testo troppo piccolo (`piccolo`), tagliato dal suo riquadro o dalla slide (`tagliato`), sopra un altro
// testo (`accavallato`) e la slide quasi vuota o di un solo colore (`vuota`); `dettaglio` porta il numero o il testo che serve a dirlo.
// Le misure: `carosello` e `telefono.margine_lati` dello stile (di serie, con sopra quello del creator).
import { apriChrome } from "./chrome.mjs";
import { dice } from "./lingua.mjs";
import { renameSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { leggiStile } from "./stile.mjs";

const stile = leggiStile(fileURLToPath(new URL("..", import.meta.url)), process.env.MANGO_ANIMATION_LAVORO);
const {
  largo: LARGO, alto: ALTO, destra: DESTRA, didascalia: DIDASCALIA, testo_minimo: PICCOLO, taglio_tolleranza: TAGLIO,
  accavallamento: ACCAVALLAMENTO, pieno_minimo: PIENO, differenza_colore: DIFFERENZA,
} = stile.carosello;
const SINISTRA = stile.telefono.margine_lati;

const [pagina, cartella] = process.argv.slice(2).map((p) => resolve(p));
if (!pagina || !cartella) {
  console.error(dice("uso: node strumenti/carosello.mjs <carosello.html> <cartella delle slide>", "usage: node strumenti/carosello.mjs <carosello.html> <slides folder>"));
  process.exit(2);
}

/** Per ogni slide: il testo che esce dalla zona sicura (un riquadro per nodo di testo, così un paragrafo lungo dice la riga giusta),
 * quello troppo piccolo (la dimensione vera sullo schermo, anche in un disegno rimpicciolito), quello tagliato dal suo riquadro o dalla
 * slide, i testi che si sovrappongono, le immagini che non si sono caricate e i caratteri dichiarati che non si sono caricati. */
const GUARDA = ([sinistra, destra, basso, piccolo, taglio, accavallamento]) => {
  const avvisi = [];
  const slide = [...document.querySelectorAll("section.slide")];
  slide.forEach((s, i) => {
    const origine = s.getBoundingClientRect();
    const righe = [];
    const cammino = document.createTreeWalker(s, NodeFilter.SHOW_TEXT);
    for (let nodo = cammino.nextNode(); nodo; nodo = cammino.nextNode()) {
      const testo = nodo.nodeValue.replace(/\s+/g, " ").trim();
      if (!testo) continue;
      const elemento = nodo.parentElement;
      if (!elemento || !elemento.checkVisibility() || getComputedStyle(elemento).opacity === "0") continue;
      const intorno = document.createRange();
      intorno.selectNodeContents(nodo);
      const riquadri = [...intorno.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
      if (riquadri.length === 0) continue;
      righe.push({ testo, riquadri });

      const corpo = parseFloat(getComputedStyle(elemento).fontSize);
      const matrice = elemento instanceof SVGGraphicsElement ? elemento.getScreenCTM() : null;
      const vero = Math.round(matrice ? corpo * Math.hypot(matrice.a, matrice.b) : corpo);
      if (vero < piccolo) {
        avvisi.push({ slide: i + 1, cosa: "piccolo", testo, dettaglio: String(vero) });
        continue;
      }

      const margine = taglio * corpo;
      const tagliato = riquadri.some((r) => {
        for (let e = elemento; e && e !== s.parentElement; e = e.parentElement) {
          const calcolato = getComputedStyle(e);
          const taglia = e === s ? [true, true] : [calcolato.overflowX !== "visible", calcolato.overflowY !== "visible"];
          if (!taglia[0] && !taglia[1]) continue;
          const c = e.getBoundingClientRect();
          if (taglia[0] && (r.left < c.left - margine || r.right > c.right + margine)) return true;
          if (taglia[1] && (r.top < c.top - margine || r.bottom > c.bottom + margine)) return true;
        }
        return false;
      });
      if (tagliato) {
        avvisi.push({ slide: i + 1, cosa: "tagliato", testo });
        continue;
      }

      for (const r of riquadri) {
        const x = r.left - origine.left;
        const y = r.top - origine.top;
        const cosa = x < sinistra ? "lato sinistro" : x + r.width > destra ? "lato destro" : y + r.height > basso ? "didascalia" : null;
        if (cosa) {
          avvisi.push({ slide: i + 1, cosa, testo });
          break;
        }
      }
    }
    for (let a = 0; a < righe.length; a++) {
      for (let b = a + 1; b < righe.length; b++) {
        const sopra = righe[a].riquadri.some((r) => righe[b].riquadri.some((q) => {
          const larghezza = Math.min(r.right, q.right) - Math.max(r.left, q.left);
          const altezza = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top);
          return larghezza > 0 && altezza > 0 && (larghezza * altezza) / Math.min(r.width * r.height, q.width * q.height) > accavallamento;
        }));
        if (sopra) avvisi.push({ slide: i + 1, cosa: "accavallato", testo: righe[a].testo, dettaglio: righe[b].testo });
      }
    }
    for (const img of s.querySelectorAll("img")) {
      if (!img.complete || img.naturalWidth === 0) avvisi.push({ slide: i + 1, cosa: "immagine", testo: img.getAttribute("src") ?? "" });
    }
  });
  for (const f of document.fonts) if (f.status === "error") avvisi.push({ slide: null, cosa: "carattere", testo: f.family });
  return { quante: slide.length, misure: slide.map((s) => [s.offsetWidth, s.offsetHeight]), avvisi };
};

/** La parte di una slide (da 0 a 1) che ha un colore diverso da quello che ne occupa di più: l'immagine si guarda ridotta. */
const DIVERSO = async ([png, differenza]) => {
  const immagine = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
  const w = Math.round(immagine.width / 4);
  const h = Math.round(immagine.height / 4);
  const tela = new OffscreenCanvas(w, h);
  const c = tela.getContext("2d");
  c.drawImage(immagine, 0, 0, w, h);
  const { data } = c.getImageData(0, 0, w, h);
  const conti = new Map();
  for (let p = 0; p < data.length; p += 4) {
    const chiave = ((data[p] >> 4) << 8) | ((data[p + 1] >> 4) << 4) | (data[p + 2] >> 4);
    conti.set(chiave, (conti.get(chiave) ?? 0) + 1);
  }
  const [dominante] = [...conti.entries()].reduce((a, b) => (b[1] > a[1] ? b : a));
  const centro = [(dominante >> 8) & 15, (dominante >> 4) & 15, dominante & 15].map((v) => v * 16 + 8);
  let diversi = 0;
  for (let p = 0; p < data.length; p += 4) {
    if (Math.max(...centro.map((v, k) => Math.abs(data[p + k] - v))) > differenza) diversi++;
  }
  return diversi / (w * h);
};

const browser = await apriChrome();
try {
  const scheda = await browser.newPage({ viewport: { width: LARGO, height: ALTO } });
  await scheda.goto(pathToFileURL(pagina).href, { waitUntil: "load" });
  await scheda.evaluate(async () => {
    await Promise.all([...document.fonts].map((f) => f.load().catch(() => null)));
    await document.fonts.ready;
  });
  const { quante, misure, avvisi } = await scheda.evaluate(GUARDA, [SINISTRA, LARGO - DESTRA, ALTO - DIDASCALIA, PICCOLO, TAGLIO, ACCAVALLAMENTO]);
  const storte = misure.map(([w, h], i) => (w === LARGO && h === ALTO ? null : dice(`la slide ${i + 1} è ${w}×${h}`, `slide ${i + 1} is ${w}×${h}`))).filter(Boolean);
  if (storte.length > 0) {
    console.error(dice(`${storte.join("; ")}: ogni section.slide dev'essere ${LARGO}×${ALTO}`, `${storte.join("; ")}: every section.slide must be ${LARGO}×${ALTO}`));
    process.exit(1);
  }
  const elementi = await scheda.$$("section.slide");
  for (let i = 0; i < elementi.length; i++) {
    const parziale = join(cartella, `.slide-${i + 1}.parziale.png`);
    const png = await elementi[i].screenshot({ path: parziale });
    renameSync(parziale, join(cartella, `slide-${i + 1}.png`));
    const diverso = await scheda.evaluate(DIVERSO, [png.toString("base64"), DIFFERENZA]);
    if (diverso < PIENO) avvisi.push({ slide: i + 1, cosa: "vuota", testo: "", dettaglio: String(Math.round(diverso * 100)) });
  }
  avvisi.sort((a, b) => (a.slide ?? Infinity) - (b.slide ?? Infinity));
  console.log(JSON.stringify({ slide: quante, avvisi }));
} finally {
  await browser.close();
}
