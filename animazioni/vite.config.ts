import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { ANIMAZIONI, dentro, fileDelCarattere, lavoroDa, SRC, sceneDelCreator, stileUnito } from "./script/percorsi";

const lavoro = lavoroDa();
const stile = stileUnito(lavoro);
const SCENE_DEL_CREATOR = sceneDelCreator(lavoro);
const MODULO_STILE = "virtual:stile";
const CASA_DEL_CREATOR = lavoro ? join(lavoro, "animazioni") : null;

// I caratteri dello stile entrano nella pagina con il nome e il peso con cui li chiamano le scene: «Titoli» (sottotitoli e scene) e «Titolo» (il titolo del video).
const FORMATI: Record<string, string> = { ".ttf": "truetype", ".otf": "opentype", ".woff2": "woff2" };
const CARATTERI = [
  { famiglia: "Titoli", peso: 700, file: fileDelCarattere(stile.caratteri.titoli) },
  { famiglia: "Titolo", peso: 500, file: fileDelCarattere((stile.caratteri as Record<string, string>)[stile.titolo.carattere]!) },
].map((c) => ({ ...c, indirizzo: `/font-${c.famiglia.toLowerCase()}${extname(c.file)}` }));

// I colori entrano nella pagina dallo stile unito, al momento della costruzione.
const daStile = (): Plugin => ({
  name: "da-stile",
  transformIndexHtml: () => [
    {
      tag: "style",
      injectTo: "head-prepend",
      children: `:root{${Object.entries(stile.colori)
        .map(([nome, valore]) => `--${nome.replaceAll("_", "-")}:${valore}`)
        .join(";")}}${CARATTERI.map((c) => `@font-face{font-family:"${c.famiglia}";src:url("${c.indirizzo}") format("${FORMATI[extname(c.file)]}");font-weight:${c.peso}}`).join("")}`,
    },
  ],
  configureServer: (server) => {
    for (const c of CARATTERI) {
      server.middlewares.use(c.indirizzo, (_richiesta, risposta) => {
        risposta.setHeader("Content-Type", `font/${extname(c.file).slice(1)}`);
        risposta.end(readFileSync(c.file));
      });
    }
  },
  generateBundle() {
    for (const c of CARATTERI) this.emitFile({ type: "asset", fileName: c.indirizzo.slice(1), source: readFileSync(c.file) });
  },
});

// Le scene del creator stanno nella sua cartella dei dati: importano dal prodotto con `@animazioni/…` e coi pacchetti di sempre, che
// si risolvono da `animazioni/` e non dalla cartella in cui stanno.
const dalloStileEDalCreator = (): Plugin => ({
  name: "stile-e-scene-del-creator",
  enforce: "pre",
  config: () => ({
    resolve: { alias: { "@animazioni": SRC, "@scene-del-creator": SCENE_DEL_CREATOR ?? join(ANIMAZIONI, ".senza-scene-del-creator") } },
    server: { fs: { allow: lavoro ? [lavoro] : [] } },
  }),
  async resolveId(sorgente, importatore, opzioni) {
    if (sorgente === MODULO_STILE) return "\0" + MODULO_STILE;
    if (!CASA_DEL_CREATOR || !importatore || !dentro(CASA_DEL_CREATOR, importatore)) return null;
    if (sorgente.startsWith("\0") || /^[./\\]|^[A-Za-z]:|^@animazioni\/|^virtual:/.test(sorgente)) return null;
    return this.resolve(sorgente, join(SRC, "main.tsx"), { ...opzioni, skipSelf: true });
  },
  load(id) {
    if (id !== "\0" + MODULO_STILE) return null;
    return `export default ${JSON.stringify(stile)};`;
  },
});

export default defineConfig({
  plugins: [dalloStileEDalCreator(), react(), daStile()],
  build: { outDir: "dist", emptyOutDir: true },
  server: { fs: { allow: [".."] } },
});
