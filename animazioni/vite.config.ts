import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { ANIMAZIONI, CODICE, dentro, lavoroDa, SRC, sceneDelCreator, stileUnito } from "./script/percorsi";

const lavoro = lavoroDa();
const stile = stileUnito(lavoro);
const FONT_TITOLI = join(CODICE, stile.caratteri.titoli);
const FONT_TITOLO = join(CODICE, (stile.caratteri as Record<string, string>)[stile.titolo.carattere]!);
const SCENE_DEL_CREATOR = sceneDelCreator(lavoro);
const MODULO_STILE = "virtual:stile";
const CASA_DEL_CREATOR = lavoro ? join(lavoro, "animazioni") : null;

// I colori e i caratteri (quello dei sottotitoli e delle scene, quello del titolo del video) entrano nella pagina dallo stile unito, al momento della costruzione.
const daStile = (): Plugin => ({
  name: "da-stile",
  transformIndexHtml: () => [
    {
      tag: "style",
      injectTo: "head-prepend",
      children: `:root{${Object.entries(stile.colori)
        .map(([nome, valore]) => `--${nome.replaceAll("_", "-")}:${valore}`)
        .join(";")}}@font-face{font-family:"Titoli";src:url("/font-titoli.ttf") format("truetype");font-weight:700}@font-face{font-family:"Titolo";src:url("/font-titolo.ttf") format("truetype");font-weight:500}`,
    },
  ],
  configureServer: (server) => {
    server.middlewares.use("/font-titoli.ttf", (_richiesta, risposta) => {
      risposta.setHeader("Content-Type", "font/ttf");
      risposta.end(readFileSync(FONT_TITOLI));
    });
    server.middlewares.use("/font-titolo.ttf", (_richiesta, risposta) => {
      risposta.setHeader("Content-Type", "font/ttf");
      risposta.end(readFileSync(FONT_TITOLO));
    });
  },
  generateBundle() {
    this.emitFile({ type: "asset", fileName: "font-titoli.ttf", source: readFileSync(FONT_TITOLI) });
    this.emitFile({ type: "asset", fileName: "font-titolo.ttf", source: readFileSync(FONT_TITOLO) });
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
