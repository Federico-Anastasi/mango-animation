// Le frasi che gli script di `animazioni/` dicono a chi usa il prodotto seguono la lingua del lavoro (`MANGO_ANIMATION_LINGUA`, `docs/API.md`, «La lingua delle frasi»).
import { describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dice } from "../script/lingua";
import { scegliScheda } from "../script/scheda";

const SCRIPT = join(import.meta.dir, "..", "script");

/** Gli argomenti della chiamata che comincia alla parentesi in `i`, come testo (saltando i testi fra virgolette). */
function argomentiDi(sorgente: string, i: number): string {
  let profondita = 0;
  for (let j = i; j < sorgente.length; j++) {
    const c = sorgente[j]!;
    if (c === '"' || c === "'" || c === "`") {
      for (j++; j < sorgente.length && sorgente[j] !== c; j++) if (sorgente[j] === "\\") j++;
    } else if (c === "(") profondita++;
    else if (c === ")" && --profondita === 0) return sorgente.slice(i + 1, j);
  }
  return sorgente.slice(i + 1);
}

/** Le chiamate che scrivono a chi usa il prodotto: `console.log`, `console.error`, `new Error`. */
const chiamateCheParlano = (sorgente: string): { chiamata: string; riga: number; argomenti: string }[] =>
  [...sorgente.matchAll(/console\.(?:log|error)\(|new Error\(/g)].map((m) => ({
    chiamata: m[0].slice(0, -1),
    riga: sorgente.slice(0, m.index).split("\n").length,
    argomenti: argomentiDi(sorgente, m.index + m[0].length - 1),
  }));

/** Le parole dei testi scritti a mano, senza ciò che ci entra (`${…}`) e senza i nomi fra «». */
const parole = (argomenti: string): string[] =>
  [...argomenti.replace(/\$\{[^}]*\}/g, " ").matchAll(/(["'`])((?:\\.|(?!\1)[^\\])*)\1/g)]
    .map((m) => m[2]!.replace(/«[^»]*»/g, " "))
    .flatMap((testo) => testo.match(/[A-Za-zÀ-ÿ]{3,}/g) ?? []);

describe("le frasi degli script", () => {
  const file = readdirSync(SCRIPT).filter((nome) => nome.endsWith(".ts"));

  test("ogni riga e ogni errore scritti a mano passano da dice(italiano, inglese)", () => {
    const senza = file.flatMap((nome) =>
      chiamateCheParlano(readFileSync(join(SCRIPT, nome), "utf8"))
        // `foto.ts` scrive anche un rapporto di controlli per Claude, in italiano: `server/src/sceneFoto.ts` ne cerca l'intestazione. I suoi errori sono frasi come le altre.
        .filter(({ chiamata }) => nome !== "foto.ts" || chiamata === "new Error")
        .filter(({ argomenti }) => !argomenti.trimStart().startsWith("dice(") && parole(argomenti).length > 0)
        .map(({ riga }) => `${nome}:${riga}`),
    );
    expect(senza).toEqual([]);
  });

  test("dice sceglie la frase della lingua del lavoro; senza lingua o con una che non c'è, l'italiano", () => {
    const prima = process.env["MANGO_ANIMATION_LINGUA"];
    try {
      delete process.env["MANGO_ANIMATION_LINGUA"];
      expect(dice("ciao", "hello")).toBe("ciao");
      process.env["MANGO_ANIMATION_LINGUA"] = "en";
      expect(dice("ciao", "hello")).toBe("hello");
      process.env["MANGO_ANIMATION_LINGUA"] = "fr";
      expect(dice("ciao", "hello")).toBe("ciao");
    } finally {
      if (prima === undefined) delete process.env["MANGO_ANIMATION_LINGUA"];
      else process.env["MANGO_ANIMATION_LINGUA"] = prima;
    }
  });

  test("la scheda scelta dice perché si disegna sul processore, e gli errori, nella lingua del lavoro", () => {
    const prima = process.env["MANGO_ANIMATION_LINGUA"];
    try {
      process.env["MANGO_ANIMATION_LINGUA"] = "en";
      expect(scegliScheda({}, [])).toMatchObject({ processore: expect.stringContaining("no NVIDIA card") });
      expect(scegliScheda({ profilo: null }, [])).toMatchObject({ processore: expect.stringContaining("the profile asks for it") });
      expect(() => scegliScheda({ profilo: 5 }, [])).toThrow("video card 5");
    } finally {
      if (prima === undefined) delete process.env["MANGO_ANIMATION_LINGUA"];
      else process.env["MANGO_ANIMATION_LINGUA"] = prima;
    }
  });
});

describe("registra, lanciato davvero", () => {
  const lancia = async (lingua: "it" | "en", tempi: string) => {
    const cartella = mkdtempSync(join(tmpdir(), "registra-lingua-"));
    try {
      const file = join(cartella, "tempi.json");
      if (tempi !== "") writeFileSync(file, tempi);
      const processo = Bun.spawn([process.execPath, "script/registra.ts", "--tempi", file, "--uscita", join(cartella, "scene")], {
        cwd: join(import.meta.dir, ".."),
        env: { ...process.env, MANGO_ANIMATION_LINGUA: lingua },
        stdout: "pipe",
        stderr: "pipe",
      });
      const [uscita, errori, codice] = await Promise.all([new Response(processo.stdout).text(), new Response(processo.stderr).text(), processo.exited]);
      return { uscita: uscita.trim(), errori: errori.trim(), codice };
    } finally {
      rmSync(cartella, { recursive: true, force: true });
    }
  };

  test("il riassunto della resa è nella lingua del lavoro", async () => {
    expect(await lancia("it", "{}")).toMatchObject({ codice: 0, uscita: "animazioni: rese 0, già rese 0" });
    expect(await lancia("en", "{}")).toMatchObject({ codice: 0, uscita: "animations: rendered 0, already rendered 0" });
  });

  test("un errore è nella lingua del lavoro", async () => {
    expect((await lancia("it", "")).errori).toContain("non c'è");
    const inglese = await lancia("en", "");
    expect(inglese.codice).toBe(1);
    expect(inglese.errori).toContain("does not exist");
    expect(inglese.errori).not.toContain("non c'è");
  });
});
