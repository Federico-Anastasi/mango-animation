// Ciò che serve a foto, video e mappe: la pagina costruita servita in locale e una scena aperta ferma a t=0.
import { existsSync, readFileSync, statSync, watch } from "node:fs";
import { readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { palcoDi } from "../src/impianto";
import type { Registro } from "../src/registro";
import { CODICE, lavoroDa, type Stile, stileUnito } from "./percorsi";
import { schedaVideo } from "./scheda";
import { dice } from "./lingua";

export const RADICE = fileURLToPath(new URL("../", import.meta.url));
export const FPS = stileUnito().formati.verticale.fps;
/** Quante scene si rendono insieme: una ogni `parallelismo.processori_per_lavoro` processori dello stile, perché Chrome e x264 ne usano già più d'uno ciascuno. */
export const paralleleSu = (processori: number, stile: Stile = stileUnito()): number => Math.max(1, Math.floor(processori / stile.parallelismo.processori_per_lavoro));
export const PARALLELE = paralleleSu(availableParallelism());

/** `lavoro` su ogni voce, `quanti` alla volta; al primo errore si ferma e lo restituisce. */
export async function aGruppi<T>(voci: readonly T[], quanti: number, lavoro: (voce: T, indice: number) => Promise<void>): Promise<void> {
  let prossima = 0;
  const operaio = async () => {
    while (prossima < voci.length) {
      const i = prossima++;
      await lavoro(voci[i]!, i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(quanti, voci.length) }, operaio));
}

/** Lo stile e le scene del creator, se c'è una cartella di lavoro: da lì dipende la pagina quanto dal codice. */
function sorgentiDelCreator(): string[] {
  const lavoro = lavoroDa();
  return lavoro ? [join(lavoro, "stile.json"), join(lavoro, "animazioni")] : [];
}

async function piuRecente(percorso: string): Promise<number> {
  if (!existsSync(percorso)) return 0;
  if (!statSync(percorso).isDirectory()) return statSync(percorso).mtimeMs;
  const voci = await readdir(percorso);
  return Math.max(0, ...(await Promise.all(voci.map((v) => piuRecente(join(percorso, v))))));
}

export type Costruzione = {
  radice: string;
  /** File o cartelle da cui dipende la pagina: se uno è più nuovo di `dist/index.html`, si ricostruisce. */
  sorgenti: string[];
  /** La cartella di lavoro per cui è costruita (le sue scene e il suo stile entrano nella pagina); senza, quella della variabile d'ambiente. */
  lavoro: string;
  /** Scrive la pagina intera nella cartella data. */
  costruisci: (uscita: string) => Promise<void>;
};

const BLOCCO = "dist.lock";
const NUOVA = "dist.nuova";
const VECCHIA = "dist.vecchia";
const ATTESA_MASSIMA_MS = 60_000;

const costruisciConVite = async (uscita: string): Promise<void> => {
  const r = Bun.spawn([process.execPath, "x", "vite", "build", "--logLevel", "error", "--outDir", uscita], { cwd: RADICE, stdout: "inherit", stderr: "inherit" });
  if ((await r.exited) !== 0) throw new Error(dice("La pagina delle animazioni non si costruisce: guarda l'errore qui sopra.", "The animations page does not build: look at the error above."));
};

const codice = (e: unknown): string | undefined => (e instanceof Error && "code" in e && typeof e.code === "string" ? e.code : undefined);

function vivo(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return codice(e) !== "ESRCH";
  }
}

/** Prende il blocco; se è di un processo che non c'è più lo toglie e dice di riprovare. */
async function prendiBlocco(blocco: string): Promise<boolean> {
  try {
    await writeFile(blocco, String(process.pid), { flag: "wx" });
    return true;
  } catch (e) {
    if (codice(e) !== "EEXIST") throw e;
  }
  const pid = Number.parseInt(await readFile(blocco, "utf8").catch(() => ""), 10);
  if (Number.isInteger(pid) && !vivo(pid)) await rm(blocco, { force: true });
  return false;
}

/** Aspetta che il blocco sparisca guardando la cartella; la guardia lunga serve solo se chi lo teneva è stato ucciso. */
function attendiSparizione(radice: string, blocco: string): Promise<void> {
  return new Promise((risolvi, rifiuta) => {
    const guardia = setTimeout(fine, ATTESA_MASSIMA_MS);
    const osservatore = watch(radice, (_evento, file) => {
      if (file === null || file === BLOCCO) fine();
    });
    osservatore.on("error", (e) => {
      chiudi();
      rifiuta(e);
    });
    function chiudi() {
      clearTimeout(guardia);
      osservatore.close();
    }
    function fine() {
      chiudi();
      risolvi();
    }
    if (!existsSync(blocco)) fine();
  });
}

async function scambia(radice: string): Promise<void> {
  const dist = join(radice, "dist");
  const vecchia = join(radice, VECCHIA);
  await rm(vecchia, { recursive: true, force: true });
  if (existsSync(dist)) await rename(dist, vecchia);
  try {
    await rename(join(radice, NUOVA), dist);
  } catch (e) {
    if (existsSync(vecchia)) await rename(vecchia, dist);
    throw e;
  }
  await rm(vecchia, { recursive: true, force: true });
}

/** La pagina costruita non resta mai indietro: se un sorgente è più nuovo, si ricostruisce prima di usarla. Una costruzione alla volta: gli altri aspettano e rileggono. */
export async function assicuraCostruita(opzioni: Partial<Costruzione> = {}): Promise<void> {
  const radice = opzioni.radice ?? RADICE;
  const sorgenti = opzioni.sorgenti ?? [join(RADICE, "src"), join(RADICE, "index.html"), join(RADICE, "vite.config.ts"), join(CODICE, "stile.json"), ...sorgentiDelCreator()];
  const costruisci = opzioni.costruisci ?? costruisciConVite;
  const lavoro = opzioni.lavoro ?? lavoroDa() ?? "";
  const pagina = join(radice, "dist", "index.html");
  const marcaLavoro = join(radice, "dist", ".lavoro");
  const blocco = join(radice, BLOCCO);
  const nuova = join(radice, NUOVA);
  const costruitaPer = () => (existsSync(marcaLavoro) ? readFileSync(marcaLavoro, "utf8") : "");
  const aggiornata = async () => existsSync(pagina) && costruitaPer() === lavoro && statSync(pagina).mtimeMs >= Math.max(...(await Promise.all(sorgenti.map(piuRecente))));

  while (!(await aggiornata())) {
    if (!(await prendiBlocco(blocco))) {
      await attendiSparizione(radice, blocco);
      continue;
    }
    try {
      if (await aggiornata()) return;
      console.log(dice("costruisco la pagina delle animazioni…", "building the animations page…"));
      await rm(nuova, { recursive: true, force: true });
      await costruisci(nuova);
      await writeFile(join(nuova, ".lavoro"), lavoro);
      await scambia(radice);
      return;
    } finally {
      await rm(nuova, { recursive: true, force: true });
      await rm(blocco, { force: true });
    }
  }
}

/** La pagina costruita, servita su una porta libera di questo computer. */
export function servi() {
  const radice = join(RADICE, "dist") + "/";
  return Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: (richiesta) => {
      const percorso = new URL(richiesta.url).pathname;
      return new Response(Bun.file(radice + (percorso === "/" ? "index.html" : percorso.slice(1))));
    },
  });
}

/** Il fotogramma di una scena, in pixel: quello del formato del suo video. */
export function palcoDellaScena(registro: Registro, sigla: string) {
  const { larghezza, altezza } = palcoDi(registro.videos[registro.scene[sigla]?.slug ?? ""]?.formato);
  return { width: larghezza, height: altezza };
}

export async function apri(registro: Registro) {
  const server = servi();
  const scheda = await schedaVideo();
  console.log(dice(`animazioni: disegno su ${scheda.nome}`, `animations: drawing on ${scheda.nome}`));
  const browser = await chromium.launch({ args: scheda.args });
  const errori: string[] = [];
  const scena = async (id: string): Promise<Page> => {
    const pagina = await browser.newPage({ viewport: palcoDellaScena(registro, id), locale: "it-IT" });
    pagina.on("pageerror", (e) => errori.push(dice(`${id}: errore di pagina: ${e.message}`, `${id}: page error: ${e.message}`)));
    pagina.on("console", (m) => m.type() === "error" && errori.push(`${id}: console: ${m.text()}`));
    await pagina.goto(`http://127.0.0.1:${server.port}/?animazione=${encodeURIComponent(id)}&t=0`);
    await pagina.waitForFunction(() => window.animazione !== undefined);
    await pagina.evaluate(() => document.fonts.ready);
    // Le immagini delle scene (pagine vere, fotogrammi di una registrazione) devono essere già decodificate al primo fotogramma.
    await pagina.evaluate(() => Promise.all([...document.images].map((immagine) => immagine.decode().catch(() => undefined))));
    return pagina;
  };
  const chiudi = async () => {
    await browser.close();
    await server.stop(true);
  };
  return { scena, errori, chiudi };
}
