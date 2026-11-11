import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { leggiStile } from "../../strumenti/stile.mjs";
import { lavoroDa } from "./percorsi";
import type { Ancora } from "./tempo";

/** Ciò che un montaggio dice di una scena: quanto dura, dove sono le ancore, quando viene detta ogni parola. */
export interface VoceTempi {
  durata: number;
  ancore: readonly Ancora[];
  tempi?: Readonly<Record<string, number>>;
  /** La misura del fotogramma che il montaggio si aspetta. */
  formato?: { largo: number; alto: number };
  /** La lingua in cui la scena scrive i suoi testi: entra nell'impronta, perché la stessa scena in due lingue è resa due volte. */
  lingua?: string;
  /** La fascia utile del quadro della scena nel piano: se cambia, la scena è un'altra. */
  fascia?: readonly [number, number, number, number];
}

export interface Impronta {
  valore: string;
  /** Presente quando l'impronta ha dovuto coprire l'intera cartella del video: dice perché. */
  largo?: string;
}

const CODICE = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts"]);
const ESTENSIONI = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".json"];
/** Le scene nella cartella dei dati importano dal prodotto con questo prefisso (`animazioni/src/`): sono file da cui dipende la scena come gli altri. */
const PRODOTTO = "@animazioni/";
const DINAMICO = /\bimport\s*\(|\bimport\.meta\.glob/;
const LETTORI = { ts: new Bun.Transpiler({ loader: "ts" }), tsx: new Bun.Transpiler({ loader: "tsx" }) };

async function filesDi(cartella: string): Promise<string[]> {
  const voci = await readdir(cartella, { withFileTypes: true }).catch(() => []);
  const sotto = await Promise.all(voci.map((v) => (v.isDirectory() ? filesDi(join(cartella, v.name)) : [join(cartella, v.name)])));
  return sotto.flat();
}

const eFile = (percorso: string) => stat(percorso).then((s) => s.isFile(), () => false);

async function trova(base: string): Promise<string | undefined> {
  const candidati = [base, ...ESTENSIONI.map((e) => base + e), ...ESTENSIONI.map((e) => join(base, `index${e}`))];
  for (const candidato of candidati) if (await eFile(candidato)) return candidato;
  return undefined;
}

/** Segue gli import relativi a catena dai file di partenza; i file già in `visti` non si rileggono. Restituisce ciò che non si è potuto seguire. */
async function segui(radice: string, partenze: readonly string[], visti: Set<string>, cercaDinamici: boolean) {
  const problemi: string[] = [];
  const daFare = [...partenze];
  while (daFare.length) {
    const file = daFare.pop()!;
    if (visti.has(file)) continue;
    visti.add(file);
    const estensione = extname(file);
    if (!CODICE.has(estensione)) continue;
    const nome = relative(radice, file);
    try {
      const codice = await readFile(file, "utf8");
      if (cercaDinamici && DINAMICO.test(codice)) problemi.push(`${nome} usa import() o import.meta.glob`);
      const lettore = estensione === ".tsx" || estensione === ".jsx" ? LETTORI.tsx : LETTORI.ts;
      for (const { path } of lettore.scanImports(codice)) {
        const delProdotto = path.startsWith(PRODOTTO);
        if (!path.startsWith(".") && !delProdotto) continue;
        const base = delProdotto ? resolve(radice, "src", path.slice(PRODOTTO.length)) : resolve(dirname(file), path);
        const trovato = await trova(base.split(/[?#]/)[0]!);
        if (trovato) daFare.push(trovato);
        else problemi.push(`${nome} importa «${path}», che non trovo`);
      }
    } catch {
      problemi.push(`non riesco a leggere gli import di ${nome}`);
    }
  }
  return problemi;
}

/** I sorgenti da cui dipende una scena: il suo file (`<sigla>.tsx` nella cartella del video, altrimenti `scene.tsx`) e ciò che importa a catena, più la pagina comune. La cartella del video è nel prodotto (`src/scene/<slug>`) o in quella dei dati (`<lavoro>/animazioni/scene/<slug>`). */
export async function sorgentiDi(radice: string, slug: string, sigla: string, lavoro: string | null = lavoroDa() ?? null): Promise<{ file: string[]; largo?: string }> {
  const src = join(radice, "src");
  const delProdotto = join(src, "scene", slug);
  const proprio = !lavoro || (await stat(delProdotto).then((s) => s.isDirectory(), () => false)) ? delProdotto : join(lavoro, "animazioni", "scene", slug);
  const visti = new Set<string>();
  const altrove = join(src, "scene") + sep;
  const comuni = (await filesDi(src)).filter((f) => !f.startsWith(altrove));
  const problemiComuni = await segui(radice, comuni, visti, false);

  const cercate = [`${sigla}.tsx`, `${sigla}.ts`, "scene.tsx"].map((n) => join(proprio, n));
  const esistenti = await Promise.all(cercate.map(eFile));
  const entrata = cercate[esistenti.indexOf(true)];
  if (!entrata) throw new Error(`Non trovo il file della scena «${sigla}»: né ${sigla}.tsx né scene.tsx in ${relative(radice, proprio)}.`);

  const problemi = [...problemiComuni, ...(await segui(radice, [entrata], visti, true))];
  if (!problemi.length) return { file: [...visti] };
  await segui(radice, await filesDi(proprio), visti, false);
  return { file: [...visti], largo: problemi.join("; ") };
}

/** Dello stile (quello di serie con sopra quello del creator) contano le parti che la pagina delle animazioni legge (`src/standard/stile.ts`, `vite.config.ts`, le scene): il resto (voce, taglio, sagoma, uscita, i sottotitoli…) non cambia un fotogramma. */
export const PARTI_DELLO_STILE = ["formati", "colori", "caratteri", "titolo", "telefono", "quadri"] as const;

/** Lo stile come lo vede la pagina: le parti sopra, e dei `quadri` solo quelli che un sorgente nomina, senza i loro sottotitoli (si mettono sul video intero). */
export function stileDelleAnimazioni(stile: Record<string, unknown>, sorgenti: string): string {
  const quadri = Object.entries((stile.quadri ?? {}) as Record<string, Record<string, unknown>>)
    .filter(([nome]) => sorgenti.includes(`"${nome}"`))
    .map(([nome, { sottotitoli: _, ...quadro }]) => [nome, quadro]);
  return JSON.stringify({ ...Object.fromEntries(PARTI_DELLO_STILE.map((parte) => [parte, stile[parte]])), quadri: Object.fromEntries(quadri) });
}

/** L'impronta di una scena resa: i tempi che le ha dato il montaggio e i sorgenti da cui viene (il suo file con ciò che importa, la pagina comune, i file in `aggiunte`; dello stile unito le sole `PARTI_DELLO_STILE`). Lo stile del creator sta in `<lavoro>/stile.json`. */
export async function improntaDi(radice: string, slug: string, sigla: string, voce: VoceTempi, aggiunte: readonly string[], lavoro: string | null = lavoroDa() ?? null): Promise<Impronta> {
  const { file, largo } = await sorgentiDi(radice, slug, sigla, lavoro);
  const casa = lavoro ? join(lavoro, "animazioni") : undefined;
  const nome = (f: string) => (casa && !relative(casa, f).startsWith("..") ? `creator/${relative(casa, f)}` : relative(radice, f));
  const sorgenti = [...new Set([...file, ...aggiunte])].sort((a, b) => nome(a).localeCompare(nome(b)));
  const hash = createHash("sha1");
  const tempi = Object.entries(voce.tempi ?? {}).sort(([a], [b]) => a.localeCompare(b));
  hash.update(JSON.stringify({ durata: voce.durata, ancore: voce.ancore, tempi, formato: voce.formato, lingua: voce.lingua, fascia: voce.fascia }));
  const contenuti = await Promise.all(sorgenti.map(async (f) => [f, await readFile(f)] as const));
  const testi = contenuti.map(([, c]) => c.toString("utf8")).join("\n");
  for (const [f, contenuto] of contenuti) hash.update(nome(f) + "\0").update(contenuto).update("\0");
  hash.update("stile\0").update(stileDelleAnimazioni(leggiStile(resolve(radice, ".."), lavoro ?? undefined), testi));
  return largo ? { valore: hash.digest("hex"), largo } : { valore: hash.digest("hex") };
}

/** Il file reso è buono se c'è e l'impronta scritta accanto è quella di adesso. */
export async function giaReso(file: string, impronta: string): Promise<boolean> {
  const accanto = `${file}.impronta`;
  return existsSync(file) && existsSync(accanto) && (await readFile(accanto, "utf8")) === impronta;
}

export async function segnaReso(file: string, impronta: string): Promise<void> {
  await writeFile(`${file}.impronta`, impronta);
}

/** Prima di rifare un file si toglie la sua impronta: un file lasciato a metà non risulta mai reso. */
export async function invalida(file: string): Promise<void> {
  await rm(`${file}.impronta`, { force: true });
}
