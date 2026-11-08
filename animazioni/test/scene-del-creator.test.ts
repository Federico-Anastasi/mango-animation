import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { caricaRegistro } from "../script/catalogo";
import { ANIMAZIONI } from "../script/percorsi";

const SCENA = `import { createElement } from "react";
import { tra, type ScenaProps, type Video } from "@animazioni/impianto";
import { Numero } from "@animazioni/standard/numero";
import stile from "virtual:stile";

const Prova = ({ t }: ScenaProps) => createElement("div", { style: { opacity: tra(t, 0, 1, 0, 1) } }, createElement(Numero, { testo: String(stile.formato.fps), unita: "fps", corpo: 80 }));

export const video: Video = {
  titolo: "Prova del creator",
  scene: { zz1: { titolo: "ZZ1 · Titolo di prova del creator", voce: "", parole: ["a", "b", "c"], durata: 2, fotogrammi: [1, 1.9], Componente: Prova } },
};
`;

let lavoro = "";
let scene = "";

beforeAll(async () => {
  lavoro = await mkdtemp(join(tmpdir(), "lavoro-"));
  scene = join(lavoro, "animazioni", "scene");
  await mkdir(join(scene, "prova-del-creator"), { recursive: true });
  await writeFile(join(scene, "prova-del-creator", "scene.tsx"), SCENA);
  await writeFile(join(lavoro, "stile.json"), '{"formato":{"fps":24}}');
});

afterAll(() => rm(lavoro, { recursive: true, force: true }));

const lancia = (comando: string[], ambiente: Record<string, string> = {}) =>
  Bun.spawn([process.execPath, ...comando], { cwd: ANIMAZIONI, env: { ...process.env, MANGO_ANIMATION_LAVORO: lavoro, ...ambiente }, stdout: "pipe", stderr: "pipe" });

describe("le scene del creator, nella sua cartella dei dati", () => {
  test("il registro le trova accanto a quelle del prodotto, e importano dal prodotto", async () => {
    process.env["MANGO_ANIMATION_LAVORO"] = lavoro;
    try {
      const registro = await caricaRegistro();
      expect(Object.keys(registro.videos)).toContain("prova-del-creator");
      expect(Object.keys(registro.videos)).toContain("standard");
      expect(registro.scene["zz1"]?.slug).toBe("prova-del-creator");
    } finally {
      delete process.env["MANGO_ANIMATION_LAVORO"];
    }
  });

  test.if(process.platform === "win32")("anche se la variabile scrive il percorso con le maiuscole e le minuscole diverse", async () => {
    process.env["MANGO_ANIMATION_LAVORO"] = lavoro.toLowerCase();
    try {
      expect(Object.keys((await caricaRegistro()).videos)).toContain("prova-del-creator");
    } finally {
      delete process.env["MANGO_ANIMATION_LAVORO"];
    }
  });

  test("senza cartella di lavoro ci sono solo quelle del prodotto", async () => {
    expect(Object.keys((await caricaRegistro()).videos)).not.toContain("prova-del-creator");
  });

  test("`elenco`, lanciato come fa il server, le dice con la variabile d'ambiente", async () => {
    const processo = lancia(["run", "elenco"]);
    const [uscita, codice] = await Promise.all([new Response(processo.stdout).text(), processo.exited]);
    expect(codice).toBe(0);
    const elenco = JSON.parse(uscita.slice(uscita.indexOf("{"))) as Record<string, { sigla: string }[]>;
    expect(elenco["prova-del-creator"]?.map((s) => s.sigla)).toEqual(["zz1"]);
  });

  test("la pagina costruita le contiene, con lo stile unito del creator", async () => {
    const uscita = await mkdtemp(join(tmpdir(), "pagina-"));
    try {
      const processo = lancia(["x", "vite", "build", "--logLevel", "error", "--outDir", uscita]);
      const [errori, codice] = await Promise.all([new Response(processo.stderr).text(), processo.exited]);
      expect(errori).toBe("");
      expect(codice).toBe(0);
      const js = await Promise.all((await readdir(join(uscita, "assets"))).filter((f) => f.endsWith(".js")).map((f) => readFile(join(uscita, "assets", f), "utf8")));
      expect(js.some((codice) => codice.includes("ZZ1 · Titolo di prova del creator"))).toBe(true);
      expect(js.some((codice) => codice.includes('fps:24'))).toBe(true);
    } finally {
      await rm(uscita, { recursive: true, force: true });
    }
  }, 180_000);
});
