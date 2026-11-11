import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CHATGPT, CLAUDE, Logo, META } from "../src/standard/loghi";

describe("i loghi standard", () => {
  test("ogni logo ha il suo riquadro, il suo tracciato e il suo colore", () => {
    for (const logo of [CLAUDE, CHATGPT, META]) {
      expect(logo.vista).toHaveLength(4);
      expect(logo.tracciato.length).toBeGreaterThan(20);
      expect(logo.colore).not.toBe("");
    }
  });

  test("Logo si centra in (x, y) e scala il lato lungo a `lato`", () => {
    const [vx, vy, vl, va] = CLAUDE.vista;
    const k = 200 / Math.max(vl, va);
    const html = renderToStaticMarkup(createElement("svg", null, createElement(Logo, { simbolo: CLAUDE, x: 100, y: 300, lato: 200, ruota: 15 })));
    expect(html).toContain(`translate(100 300) rotate(15) scale(${k}) translate(${-vx - vl / 2} ${-vy - va / 2})`);
    expect(html).toContain(`fill="${CLAUDE.colore}"`);
  });

  test("senza opacità non disegna niente", () => {
    expect(renderToStaticMarkup(createElement("svg", null, createElement(Logo, { simbolo: CHATGPT, x: 0, y: 0, lato: 10, opacita: 0 })))).not.toContain("<path");
  });

  test("i file dei loghi sono SVG puliti: niente classi né colori in hsl copiati da una pagina web", async () => {
    for (const nome of ["claude", "openai", "meta"]) {
      const svg = await Bun.file(new URL(`../src/standard/loghi/${nome}.svg`, import.meta.url)).text();
      expect(svg).not.toMatch(/class=|hsl\(|style=/);
    }
  });

  test("ogni file ha accanto la sua fonte e la sua licenza", async () => {
    for (const nome of ["claude", "openai", "meta"]) {
      const testo = await Bun.file(new URL(`../src/standard/loghi/${nome}.txt`, import.meta.url)).text();
      expect(testo).toContain("https://");
      expect(testo).toMatch(/CC0|pubblico dominio|licenza/i);
    }
  });
});
