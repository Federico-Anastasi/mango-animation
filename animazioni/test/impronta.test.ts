import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { caricaRegistro } from "../script/catalogo";
import { SRC } from "../script/percorsi";
import { giaReso, improntaDi, invalida, PARTI_DELLO_STILE, segnaReso, sorgentiDi, type VoceTempi } from "../script/impronta";

const voce: VoceTempi = { durata: 8, ancore: [[1, 0.5]], tempi: { si: 2, no: 4 } };
let base = "";
let radice = "";

async function scrivi(percorso: string, testo: string) {
  await mkdir(join(base, percorso, ".."), { recursive: true });
  await writeFile(join(base, percorso), testo);
}

let lavoro = "";

const impronta = async (slug: string, sigla: string, aggiunte: readonly string[] = []) => (await improntaDi(radice, slug, sigla, voce, aggiunte, lavoro)).valore;

beforeEach(async () => {
  delete process.env["MANGO_ANIMATION_LAVORO"];
  base = await mkdtemp(join(tmpdir(), "impronta-"));
  radice = join(base, "animazioni");
  lavoro = join(base, "lavoro");
  await mkdir(lavoro);
  await scrivi("stile.json", "{}");
  await scrivi("animazioni/src/impianto.ts", "export const comune = 1;");
  await scrivi("animazioni/src/standard/stile.ts", 'import stile from "virtual:stile";\nexport default stile;');
  await scrivi("animazioni/src/Animazioni.tsx", "export const pagina = 1;");
  await scrivi("animazioni/src/scene/mio/scene.tsx", 'import { m1 } from "./bit";\nexport const video = { scene: { m1 } };');
  await scrivi("animazioni/src/scene/mio/bit.tsx", "export const m1 = 1;");
  await scrivi("animazioni/src/scene/mio/inutile.tsx", "export const mai = 1;");
  await scrivi("animazioni/src/scene/altro/scene.tsx", "export const video = {};");
  await scrivi("animazioni/src/scene/gruppo/scene.tsx", 'import { ap1 } from "./ap1";\nimport { ap2 } from "./ap2";\nimport { ap3 } from "./ap3";\nexport const video = { scene: { ap1, ap2, ap3 } };');
  await scrivi("animazioni/src/scene/gruppo/ap1.tsx", 'import { mondo } from "./mondo";\nimport { pagine } from "./dati";\nexport const ap1 = [mondo, pagine];');
  await scrivi("animazioni/src/scene/gruppo/ap2.tsx", 'import { mondo } from "./mondo";\nexport const ap2 = [mondo];');
  await scrivi("animazioni/src/scene/gruppo/ap3.tsx", 'import { solo } from "./solo";\nexport const ap3 = [solo];');
  await scrivi("animazioni/src/scene/gruppo/mondo.tsx", 'import { colore } from "./aspetto";\nexport const mondo = colore;');
  await scrivi("animazioni/src/scene/gruppo/aspetto.ts", "export const colore = 1;");
  await scrivi("animazioni/src/scene/gruppo/dati.ts", 'import foto from "./foto.jpg?inline";\nexport const pagine = foto;');
  await scrivi("animazioni/src/scene/gruppo/foto.jpg", "pixel");
  await scrivi("animazioni/src/scene/gruppo/solo.ts", "export const solo = 1;");
});

afterEach(() => rm(base, { recursive: true, force: true }));

describe("improntaDi", () => {
  test("è la stessa con gli stessi tempi e gli stessi sorgenti, anche con le parole in un altro ordine", async () => {
    const a = await impronta("mio", "m1");
    const b = (await improntaDi(radice, "mio", "m1", { ...voce, tempi: { no: 4, si: 2 } }, [])).valore;
    expect(b).toBe(a);
  });

  test("cambia se cambia un tempo, un'ancora, la durata o il formato", async () => {
    const a = await impronta("mio", "m1");
    const con = async (v: VoceTempi) => (await improntaDi(radice, "mio", "m1", v, [])).valore;
    expect(await con({ ...voce, tempi: { si: 2.1, no: 4 } })).not.toBe(a);
    expect(await con({ ...voce, ancore: [[1, 0.6]] })).not.toBe(a);
    expect(await con({ ...voce, durata: 8.1 })).not.toBe(a);
    expect(await con({ ...voce, formato: { largo: 1920, alto: 1080 } })).not.toBe(await con({ ...voce, formato: { largo: 1080, alto: 1920 } }));
  });

  test("cambia se cambia la fascia utile del quadro della scena", async () => {
    const con = async (v: VoceTempi) => (await improntaDi(radice, "mio", "m1", v, [])).valore;
    expect(await con({ ...voce, fascia: [0, 170, 1080, 720] })).not.toBe(await con({ ...voce, fascia: [90, 250, 980, 850] }));
    expect(await con({ ...voce, fascia: [0, 170, 1080, 720] })).toBe(await con({ ...voce, fascia: [0, 170, 1080, 720] }));
  });

  test("cambia se cambia un file aggiunto, come lo stile", async () => {
    await scrivi("animazioni/conf.json", "uno");
    const a = await impronta("mio", "m1", [join(radice, "conf.json")]);
    await scrivi("animazioni/conf.json", "due");
    expect(await impronta("mio", "m1", [join(radice, "conf.json")])).not.toBe(a);
  });

  test("cambiare il file di una scena non cambia l'impronta di un'altra dello stesso video", async () => {
    const [ap1, ap2, ap3] = [await impronta("gruppo", "ap1"), await impronta("gruppo", "ap2"), await impronta("gruppo", "ap3")];
    await scrivi("animazioni/src/scene/gruppo/ap1.tsx", 'import { mondo } from "./mondo";\nimport { pagine } from "./dati";\nexport const ap1 = [mondo, pagine, 1];');
    expect(await impronta("gruppo", "ap1")).not.toBe(ap1);
    expect(await impronta("gruppo", "ap2")).toBe(ap2);
    expect(await impronta("gruppo", "ap3")).toBe(ap3);
  });

  test("un modulo comune cambia l'impronta di chi lo importa, anche a catena, e non di chi no", async () => {
    const [ap1, ap2, ap3] = [await impronta("gruppo", "ap1"), await impronta("gruppo", "ap2"), await impronta("gruppo", "ap3")];
    await scrivi("animazioni/src/scene/gruppo/mondo.tsx", 'import { colore } from "./aspetto";\nexport const mondo = [colore, 2];');
    expect(await impronta("gruppo", "ap1")).not.toBe(ap1);
    expect(await impronta("gruppo", "ap2")).not.toBe(ap2);
    expect(await impronta("gruppo", "ap3")).toBe(ap3);

    const [dopoAp1, dopoAp2] = [await impronta("gruppo", "ap1"), await impronta("gruppo", "ap2")];
    await scrivi("animazioni/src/scene/gruppo/aspetto.ts", "export const colore = 2;");
    expect(await impronta("gruppo", "ap2")).not.toBe(dopoAp2);
    expect(await impronta("gruppo", "ap3")).toBe(ap3);

    await scrivi("animazioni/src/scene/gruppo/foto.jpg", "altri pixel");
    expect(await impronta("gruppo", "ap1")).not.toBe(dopoAp1);
  });

  test("un'immagine importata con un suffisso entra nell'impronta solo di chi la importa", async () => {
    const [ap1, ap2] = [await impronta("gruppo", "ap1"), await impronta("gruppo", "ap2")];
    await scrivi("animazioni/src/scene/gruppo/foto.jpg", "altri pixel");
    expect(await impronta("gruppo", "ap1")).not.toBe(ap1);
    expect(await impronta("gruppo", "ap2")).toBe(ap2);
  });

  test("senza un file col nome della sigla si parte da scene.tsx e dai file che importa", async () => {
    const a = await impronta("mio", "m1");
    await scrivi("animazioni/src/scene/mio/inutile.tsx", "export const mai = 2;");
    expect(await impronta("mio", "m1")).toBe(a);
    await scrivi("animazioni/src/scene/mio/bit.tsx", "export const m1 = 2;");
    expect(await impronta("mio", "m1")).not.toBe(a);
  });

  test("cambia se cambia il codice comune della pagina o lo stile che importa, non un altro video", async () => {
    const a = await impronta("mio", "m1");
    await scrivi("animazioni/src/scene/altro/scene.tsx", "export const video = { cambiato: true };");
    expect(await impronta("mio", "m1")).toBe(a);
    await scrivi("animazioni/src/impianto.ts", "export const comune = 2;");
    const b = await impronta("mio", "m1");
    expect(b).not.toBe(a);
    await scrivi("animazioni/src/Animazioni.tsx", "export const pagina = 2;");
    const c = await impronta("mio", "m1");
    expect(c).not.toBe(b);
    await scrivi("stile.json", '{"colori":{"carta":"#fff"}}');
    expect(await impronta("mio", "m1")).not.toBe(c);
  });

  test("dello stile contano solo le parti che le animazioni leggono: i sottotitoli, la voce, l'uscita, un quadro che nessuna scena nomina non rifanno una scena", async () => {
    await scrivi("animazioni/src/standard/stile.ts", 'import stile from "virtual:stile";\nexport const fascia = stile.quadri["uno"].fascia_animazione;');
    const stile = (extra: object, quadro: object = {}) => JSON.stringify({ colori: { carta: "#fff" }, quadri: { uno: { fascia_animazione: [0, 0, 1, 1], ...quadro } }, ...extra });
    await scrivi("stile.json", stile({ voce: { lufs: -16 }, sottotitoli: { corpo: 50 } }, { sottotitoli: { y: 1200 } }));
    const a = await impronta("mio", "m1");
    await scrivi("stile.json", stile({ voce: { lufs: -14 }, uscita: { crf: 20 }, sagoma: { margine: 2 }, sottotitoli: { corpo: 60 } }, { sottotitoli: { y: 1300 } }));
    expect(await impronta("mio", "m1")).toBe(a);
    await scrivi("stile.json", JSON.stringify({ colori: { carta: "#fff" }, quadri: { uno: { fascia_animazione: [0, 0, 1, 1] }, altro: { fascia_animazione: [5, 5, 6, 6] } } }));
    expect(await impronta("mio", "m1")).toBe(a);
    await scrivi("stile.json", stile({}, { fascia_animazione: [0, 0, 1, 2] }));
    expect(await impronta("mio", "m1")).not.toBe(a);
    await scrivi("stile.json", stile({ titolo: { corpo: 70 } }));
    expect(await impronta("mio", "m1")).not.toBe(a);
  });

  test("lo stile del creator sopra quello di serie conta come lo stile di serie: cambia l'impronta solo se cambia una parte che la pagina legge", async () => {
    await scrivi("stile.json", '{"colori":{"carta":"#fff","rosso":"#f00"},"voce":{"lufs":-16}}');
    const a = await impronta("mio", "m1");
    await scrivi("lavoro/stile.json", '{"voce":{"lufs":-14},"uscita":{"crf":20}}');
    expect(await impronta("mio", "m1")).toBe(a);
    await scrivi("lavoro/stile.json", '{"colori":{"rosso":"#c00"}}');
    const b = await impronta("mio", "m1");
    expect(b).not.toBe(a);
    await scrivi("lavoro/stile.json", '{"colori":{"rosso":"#f00"}}');
    expect(await impronta("mio", "m1")).toBe(a);
    await rm(join(lavoro, "stile.json"));
    expect(await impronta("mio", "m1")).toBe(a);
  });

  test("le parti dello stile nell'impronta sono tutte e sole quelle che la pagina legge", async () => {
    const vera = join(import.meta.dir, "..");
    const letti = new Set<string>();
    for (const file of [join(vera, "vite.config.ts"), ...(await Array.fromAsync(new Bun.Glob("src/**/*.{ts,tsx}").scan({ cwd: vera, absolute: true })))]) {
      const testo = await Bun.file(file).text();
      if (/import stile from "virtual:stile"|= stileUnito[(]/.test(testo)) for (const [, parte] of testo.matchAll(/\bstile\.(?!json\b)([a-z_]+)/g)) letti.add(parte!);
    }
    expect([...letti].sort()).toEqual([...PARTI_DELLO_STILE].sort());
  });

  test("una scena con import() dinamico cade sull'hash dell'intera cartella del video e lo dice", async () => {
    await scrivi("animazioni/src/scene/gruppo/ap2.tsx", 'export const ap2 = () => import("./solo");');
    const risposta = await improntaDi(radice, "gruppo", "ap2", voce, []);
    expect(risposta.largo).toContain("ap2.tsx");
    expect(risposta.largo).toContain("import");
    await scrivi("animazioni/src/scene/gruppo/ap3.tsx", "export const ap3 = 2;");
    expect((await improntaDi(radice, "gruppo", "ap2", voce, [])).valore).not.toBe(risposta.valore);
    await scrivi("animazioni/src/scene/altro/scene.tsx", "export const video = { cambiato: true };");
    expect((await improntaDi(radice, "gruppo", "ap2", voce, [])).valore).not.toBe(risposta.valore);
    expect((await improntaDi(radice, "gruppo", "ap1", voce, [])).largo).toBeUndefined();
  });

  test("import.meta.glob in un file di una scena e un import che non si trova cadono sull'hash largo", async () => {
    await scrivi("animazioni/src/scene/gruppo/ap2.tsx", 'export const ap2 = import.meta.glob("./*.tsx");');
    expect((await improntaDi(radice, "gruppo", "ap2", voce, [])).largo).toContain("import.meta.glob");
    await scrivi("animazioni/src/scene/gruppo/ap3.tsx", 'import { x } from "./manca";\nexport const ap3 = x;');
    expect((await improntaDi(radice, "gruppo", "ap3", voce, [])).largo).toContain("./manca");
  });

  test("import.meta.glob nella pagina comune non fa tornare all'hash largo", async () => {
    await scrivi("animazioni/src/catalogo.ts", 'export const registro = import.meta.glob("./scene/*/scene.tsx");');
    expect((await improntaDi(radice, "gruppo", "ap2", voce, [])).largo).toBeUndefined();
  });

  test("senza il file della scena dice dove lo cercava", async () => {
    await mkdir(join(radice, "src/scene/vuoto"), { recursive: true });
    await expect(improntaDi(radice, "vuoto", "zz", voce, [])).rejects.toThrow("vuoto");
  });
});

describe("le scene del creator", () => {
  beforeEach(async () => {
    await scrivi("lavoro/animazioni/scene/suo/scene.tsx", 'import { m1 } from "./bit";\nimport { comune } from "@animazioni/impianto";\nexport const video = { scene: { m1 }, comune };');
    await scrivi("lavoro/animazioni/scene/suo/bit.tsx", 'import { altro } from "@animazioni/standard/altro";\nexport const m1 = altro;');
    await scrivi("lavoro/animazioni/scene/suo/inutile.tsx", "export const mai = 1;");
    await scrivi("animazioni/src/standard/altro.ts", "export const altro = 1;");
  });

  test("l'impronta segue i file della scena nella cartella dei dati e ciò che importa dal prodotto, senza cadere sull'hash largo", async () => {
    const risposta = await improntaDi(radice, "suo", "m1", voce, [], lavoro);
    expect(risposta.largo).toBeUndefined();
    const a = risposta.valore;
    await scrivi("lavoro/animazioni/scene/suo/inutile.tsx", "export const mai = 2;");
    expect(await impronta("suo", "m1")).toBe(a);
    await scrivi("lavoro/animazioni/scene/suo/bit.tsx", 'import { altro } from "@animazioni/standard/altro";\nexport const m1 = [altro, 2];');
    const b = await impronta("suo", "m1");
    expect(b).not.toBe(a);
    await scrivi("animazioni/src/standard/altro.ts", "export const altro = 2;");
    const c = await impronta("suo", "m1");
    expect(c).not.toBe(b);
    await scrivi("animazioni/src/impianto.ts", "export const comune = 3;");
    expect(await impronta("suo", "m1")).not.toBe(c);
  });

  test("non dipende da dove sta la cartella dei dati", async () => {
    const a = await impronta("suo", "m1");
    const altrove = join(base, "altrove");
    await mkdir(join(altrove, "animazioni", "scene"), { recursive: true });
    await cp(join(lavoro, "animazioni", "scene", "suo"), join(altrove, "animazioni", "scene", "suo"), { recursive: true });
    expect((await improntaDi(radice, "suo", "m1", voce, [], altrove)).valore).toBe(a);
  });

  test("senza cartella di lavoro dice dove cercava la scena", async () => {
    await expect(improntaDi(radice, "suo", "m1", voce, [], null)).rejects.toThrow("suo");
  });
});

describe("le scene vere", () => {
  test("nessuna cade sull'hash largo e ognuna dipende dal suo file e non da quelli delle sorelle", async () => {
    const vera = join(import.meta.dir, "..");
    const registro = await caricaRegistro(SRC, null);
    for (const [sigla, { slug }] of Object.entries(registro.scene)) {
      const trovati = await sorgentiDi(vera, slug, sigla, null);
      expect(trovati.largo, sigla).toBeUndefined();
      expect(trovati.file.length, sigla).toBeGreaterThan(5);
    }
    const e1 = (await sorgentiDi(vera, "esempio-ancore", "e1", null)).file.map((f) => relative(vera, f).replaceAll("\\", "/"));
    expect(e1).toContain("src/scene/esempio-ancore/scene.tsx");
    expect(e1).toContain("src/scene/esempio-ancore/dati.ts");
    expect(e1).toContain("src/impianto.ts");
    expect(e1).toContain("src/standard/barra.tsx");
    expect(e1).not.toContain("src/scene/esempio-orizzontale/scene.tsx");
  });
});

describe("giaReso", () => {
  test("rifà la scena finché non c'è un file reso con questa impronta", async () => {
    const file = join(base, "a1.mp4");
    expect(await giaReso(file, "x")).toBe(false);
    await writeFile(file, "video");
    expect(await giaReso(file, "x")).toBe(false);
    await segnaReso(file, "x");
    expect(await giaReso(file, "x")).toBe(true);
    expect(await giaReso(file, "y")).toBe(false);
  });

  test("un file lasciato a metà non risulta reso", async () => {
    const file = join(base, "a1.mp4");
    await writeFile(file, "video");
    await segnaReso(file, "x");
    await invalida(file);
    expect(await giaReso(file, "x")).toBe(false);
  });
});
