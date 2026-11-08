// Per gli script e le prove di Bun (`bunfig.toml`): lo stile unito e gli import delle scene del creator, come li risolve Vite per la pagina.
// Bun non chiede al plugin la risoluzione degli import statici: i file del creator si caricano con gli import già riscritti.
import { plugin } from "bun";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ANIMAZIONI, dentro, lavoroDa, SRC, stileUnito } from "./percorsi";

const LETTORE = new Bun.Transpiler({ loader: "tsx" });
const dritto = (percorso: string): string => percorso.replaceAll("\\", "/");

function eDelCreator(percorso: string): boolean {
  const lavoro = lavoroDa();
  return lavoro !== undefined && dentro(join(lavoro, "animazioni"), percorso);
}

function riscrivi(codice: string): string {
  let riscritto = codice;
  for (const { path } of LETTORE.scanImports(codice)) {
    if (/^[./\\]|^[A-Za-z]:|^virtual:/.test(path)) continue;
    const vero = path.startsWith("@animazioni/") ? Bun.resolveSync("./" + path.slice("@animazioni/".length), SRC) : Bun.resolveSync(path, ANIMAZIONI);
    riscritto = riscritto.replaceAll(`"${path}"`, `"${dritto(vero)}"`).replaceAll(`'${path}'`, `'${dritto(vero)}'`);
  }
  return riscritto;
}

plugin({
  name: "stile-e-scene-del-creator",
  setup(costruzione) {
    costruzione.module("virtual:stile", () => ({ exports: { default: stileUnito() }, loader: "object" }));
    costruzione.onLoad({ filter: /animazioni[\\/]scene[\\/].*[.]tsx?$/ }, ({ path }) => {
      const codice = readFileSync(path, "utf8");
      return { contents: eDelCreator(path) ? riscrivi(codice) : codice, loader: path.endsWith(".tsx") ? "tsx" : "ts" };
    });
  },
});
