import { chromium } from "playwright";
import { leggiProfilo } from "../../strumenti/profilo.mjs";
import { dice } from "./lingua";

// La scheda video su cui il browser disegna le scene: quella di `macchina.scheda_video` del profilo del creator (l'indice di `nvidia-smi`; `null` per il
// processore); senza profilo, la prima scheda NVIDIA che c'è, e senza schede il processore (lo dice). `ANIMAZIONI_SCHEDA` ne indica un'altra per una
// volta sola (un pezzo del nome, ad esempio `1660`) o `processore`. Chrome sceglie la scheda dal suo LUID, che cambia a ogni avvio di Windows: si trova
// provando i LUID che Windows elenca e guardando che scheda risponde. Se la scheda voluta non c'è, la resa si ferma: nessun ripiego su un'altra.

/** Una scheda occupata da un altro lavoro (non dallo schermo, che ne usa qualche centinaio di MB) rallenta e viene rallentata: si avvisa. */
const OCCUPATA = { utilizzo: 30, memoriaMB: 1500 } as const;

export interface Scheda {
  indice: number;
  nome: string;
  utilizzo: number;
  memoriaMB: number;
}

async function esegui(comando: string[]): Promise<string> {
  const processo = Bun.spawn(comando, { stdout: "pipe", stderr: "pipe" });
  const testo = await new Response(processo.stdout).text();
  await processo.exited;
  return testo;
}

async function schede(): Promise<Scheda[]> {
  const testo = await esegui(["nvidia-smi", "--query-gpu=index,name,utilization.gpu,memory.used", "--format=csv,noheader,nounits"]).catch(() => "");
  return testo
    .split("\n")
    .map((riga) => riga.split(",").map((campo) => campo.trim()))
    .filter((campi) => campi.length === 4)
    .map(([indice, nome, utilizzo, memoria]) => ({ indice: Number(indice), nome: nome!, utilizzo: Number(utilizzo), memoriaMB: Number(memoria) }));
}

export interface Richiesta {
  /** `macchina.scheda_video` del profilo: l'indice di nvidia-smi, `null` per il processore, assente se il profilo non dice. */
  profilo?: number | null;
  /** `ANIMAZIONI_SCHEDA`: un pezzo del nome della scheda, o «processore». */
  nome?: string;
}

/** La scheda su cui disegnare, o il processore con la frase che dice perché. */
export function scegliScheda({ profilo, nome }: Richiesta, elenco: Scheda[]): { scheda: Scheda } | { processore: string } {
  if (nome !== undefined) {
    if (nome.toLowerCase() === "processore") return { processore: dice("ANIMAZIONI_SCHEDA lo chiede", "ANIMAZIONI_SCHEDA asks for it") };
    const scheda = elenco.find((s) => s.nome.toLowerCase().includes(nome.toLowerCase()));
    if (!scheda) throw new Error(dice(`La scheda video «${nome}» non c'è: ANIMAZIONI_SCHEDA dice un pezzo del nome di una scheda NVIDIA (nvidia-smi), o «processore»`, `The video card «${nome}» does not exist: ANIMAZIONI_SCHEDA gives a piece of the name of an NVIDIA card (nvidia-smi), or «processore»`));
    return { scheda };
  }
  if (profilo === null) return { processore: dice("il profilo lo chiede (macchina.scheda_video)", "the profile asks for it (macchina.scheda_video)") };
  if (profilo !== undefined) {
    const scheda = elenco.find((s) => s.indice === profilo);
    if (!scheda) throw new Error(dice(`Il profilo vuole la scheda video ${profilo} (macchina.scheda_video), ma nvidia-smi non la elenca: correggi il numero, oppure metti null per disegnare sul processore`, `The profile wants video card ${profilo} (macchina.scheda_video), but nvidia-smi does not list it: fix the number, or put null to draw on the processor`));
    return { scheda };
  }
  const prima = elenco[0];
  return prima ? { scheda: prima } : { processore: dice("nessuna scheda NVIDIA (si indica in profilo.json, macchina.scheda_video)", "no NVIDIA card (set one in profilo.json, macchina.scheda_video)") };
}

function indiceDelProfilo(): number | null | undefined {
  const scheda = (leggiProfilo(process.env.MANGO_ANIMATION_LAVORO).macchina as { scheda_video?: unknown } | undefined)?.scheda_video;
  return typeof scheda === "number" || scheda === null ? scheda : undefined;
}

/** I LUID delle schede che Windows elenca (contatori «GPU Adapter Memory»), come coppie [alta, bassa] di interi. */
async function luid(): Promise<[number, number][]> {
  const testo = await esegui(["powershell", "-NoProfile", "-Command", "(Get-Counter '\\GPU Adapter Memory(*)\\Dedicated Usage').CounterSamples.InstanceName"]);
  return [...testo.matchAll(/luid_0x([0-9a-f]{8})_0x([0-9a-f]{8})/gi)].map((m) => [parseInt(m[1]!, 16), parseInt(m[2]!, 16)]);
}

/** Che scheda è dietro a un LUID: la dice WebGL, aprendo un browser su quell'adattatore. */
async function nomeDelLuid([alto, basso]: [number, number]): Promise<string> {
  const browser = await chromium.launch({ args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", `--use-adapter-luid=${alto},${basso}`] });
  try {
    const pagina = await browser.newPage();
    return await pagina.evaluate(() => {
      const gl = document.createElement("canvas").getContext("webgl");
      const info = gl?.getExtension("WEBGL_debug_renderer_info");
      return gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
    });
  } finally {
    await browser.close();
  }
}

let scelta: Promise<{ args: string[]; nome: string }> | undefined;

/** Gli argomenti di Chrome per disegnare sulla scheda scelta, e il suo nome; trovati una volta sola per processo. */
export function schedaVideo(): Promise<{ args: string[]; nome: string }> {
  scelta ??= trova();
  return scelta;
}

async function trova(): Promise<{ args: string[]; nome: string }> {
  const nome = process.env.ANIMAZIONI_PROCESSORE === "1" ? "processore" : process.env.ANIMAZIONI_SCHEDA;
  const scelta = scegliScheda({ profilo: indiceDelProfilo(), ...(nome === undefined ? {} : { nome }) }, await schede());
  if ("processore" in scelta) {
    console.log(dice(`animazioni: ${scelta.processore}: disegno sul processore, più lento`, `animations: ${scelta.processore}: drawing on the processor, slower`));
    return { args: ["--disable-gpu"], nome: "il processore" };
  }
  const { scheda } = scelta;
  if (scheda.utilizzo >= OCCUPATA.utilizzo || scheda.memoriaMB >= OCCUPATA.memoriaMB) {
    console.log(dice(`animazioni: attenzione, ${scheda.nome} sta già lavorando (${scheda.utilizzo}%, ${scheda.memoriaMB} MB)`, `animations: warning, ${scheda.nome} is already busy (${scheda.utilizzo}%, ${scheda.memoriaMB} MB)`));
  }
  // I filmati delle scene (`standard/filmato.tsx`) si decodificano sul processore: sull'adattatore scelto col LUID la decodifica della
  // scheda fallisce al primo spostamento («video decode error»), mentre il disegno resta sulla scheda.
  const base = ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--disable-accelerated-video-decode"];
  for (const id of await luid()) {
    if ((await nomeDelLuid(id).catch(() => "")).includes(scheda.nome)) return { args: [...base, `--use-adapter-luid=${id[0]},${id[1]}`], nome: scheda.nome };
  }
  throw new Error(dice(`Non trovo l'adattatore Direct3D di ${scheda.nome}: la resa non riparte su un'altra scheda; si sceglie con ANIMAZIONI_SCHEDA`, `I cannot find the Direct3D adapter of ${scheda.nome}: the rendering does not move to another card; choose one with ANIMAZIONI_SCHEDA`));
}
