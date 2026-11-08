import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assicuraCostruita } from "../script/comune";

let radice = "";
let costruzioni = 0;

const opzioni = (durata = 0, fallisce = false) => ({
  radice,
  sorgenti: [join(radice, "src")],
  costruisci: async (uscita: string) => {
    costruzioni++;
    await mkdir(uscita, { recursive: true });
    await Bun.sleep(durata);
    if (fallisce) throw new Error("rotto");
    await writeFile(join(uscita, "index.html"), "nuova");
  },
});

beforeEach(async () => {
  radice = await mkdtemp(join(tmpdir(), "costruzione-"));
  await mkdir(join(radice, "src"));
  await writeFile(join(radice, "src", "a.ts"), "x");
  costruzioni = 0;
});

afterEach(() => rm(radice, { recursive: true, force: true }));

test("due chiamate insieme costruiscono una volta sola", async () => {
  await Promise.all([assicuraCostruita(opzioni(150)), assicuraCostruita(opzioni(150))]);
  expect(costruzioni).toBe(1);
  expect(await Bun.file(join(radice, "dist", "index.html")).text()).toBe("nuova");
  expect(existsSync(join(radice, "dist.lock"))).toBe(false);
  expect(existsSync(join(radice, "dist.nuova"))).toBe(false);
});

test("una pagina aggiornata non si ricostruisce, una vecchia sostituisce la precedente", async () => {
  await mkdir(join(radice, "dist"));
  await writeFile(join(radice, "dist", "index.html"), "vecchia");
  await writeFile(join(radice, "dist", "resto.txt"), "da togliere");
  await assicuraCostruita(opzioni());
  expect(costruzioni).toBe(0);
  const passato = new Date(Date.now() - 60000);
  await utimes(join(radice, "dist", "index.html"), passato, passato);
  await assicuraCostruita(opzioni());
  expect(costruzioni).toBe(1);
  await utimes(join(radice, "dist", "index.html"), passato, passato);
  await assicuraCostruita(opzioni());
  expect(costruzioni).toBe(2);
  expect(await Bun.file(join(radice, "dist", "index.html")).text()).toBe("nuova");
  expect(existsSync(join(radice, "dist", "resto.txt"))).toBe(false);
});

test("un blocco con un PID che non esiste più non blocca", async () => {
  const morto = Bun.spawn([process.execPath, "-e", ""]);
  await morto.exited;
  await writeFile(join(radice, "dist.lock"), String(morto.pid));
  await assicuraCostruita(opzioni());
  expect(costruzioni).toBe(1);
  expect(existsSync(join(radice, "dist.lock"))).toBe(false);
});

test("un blocco di un processo vivo fa aspettare, e quando sparisce si ricontrolla", async () => {
  await writeFile(join(radice, "dist.lock"), String(process.pid));
  let finita = false;
  const attesa = assicuraCostruita(opzioni()).then(() => (finita = true));
  await Bun.sleep(100);
  expect(finita).toBe(false);
  await mkdir(join(radice, "dist"));
  await writeFile(join(radice, "dist", "index.html"), "fatta da altri");
  await rm(join(radice, "dist.lock"));
  await attesa;
  expect(costruzioni).toBe(0);
});

test("se la costruzione fallisce il blocco si toglie e la pagina di prima resta", async () => {
  await mkdir(join(radice, "dist"));
  await writeFile(join(radice, "dist", "index.html"), "vecchia");
  const passato = new Date(Date.now() - 60000);
  await utimes(join(radice, "dist", "index.html"), passato, passato);
  await expect(assicuraCostruita(opzioni(0, true))).rejects.toThrow("rotto");
  expect(existsSync(join(radice, "dist.lock"))).toBe(false);
  expect(existsSync(join(radice, "dist.nuova"))).toBe(false);
  expect(await Bun.file(join(radice, "dist", "index.html")).text()).toBe("vecchia");
});

test("la pagina costruita per una cartella di lavoro non vale per un'altra", async () => {
  await assicuraCostruita({ ...opzioni(), lavoro: "uno" });
  await assicuraCostruita({ ...opzioni(), lavoro: "uno" });
  expect(costruzioni).toBe(1);
  await assicuraCostruita({ ...opzioni(), lavoro: "due" });
  expect(costruzioni).toBe(2);
  await assicuraCostruita({ ...opzioni(), lavoro: "due" });
  expect(costruzioni).toBe(2);
  await assicuraCostruita(opzioni());
  expect(costruzioni).toBe(3);
});
