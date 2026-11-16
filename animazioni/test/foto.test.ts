import { afterEach, describe, expect, test } from "bun:test";
import stile from "../../stile.json";
import { fraseDelProblema, latiDaControllare, RIGA_DEI_CONTROLLI, type Problema } from "../script/foto";
import { FASCIA, fasciaDi } from "../src/standard/stile";

const verticale = { width: stile.formati.verticale.largo, height: stile.formati.verticale.alto };
const orizzontale = { width: stile.formati.orizzontale.largo, height: stile.formati.orizzontale.alto };
const m = stile.telefono.margine_lati;

describe("latiDaControllare", () => {
  test("una scena trasparente va sopra il girato a tutto fotogramma, senza rimpicciolirsi: ciò che disegna sta dentro i lati", () => {
    expect(latiDaControllare({ trasparente: true }, verticale)).toEqual([m, verticale.width - m]);
  });

  test("le altre scene le stringe il quadro dentro i lati, o le tiene la fascia", () => {
    expect(latiDaControllare({}, verticale)).toBeNull();
  });

  test("in orizzontale il telefono non taglia i lati", () => {
    expect(latiDaControllare({ trasparente: true }, orizzontale)).toBeNull();
  });
});

describe("fasciaDi", () => {
  test("ogni quadro ha la sua fascia utile: sagoma-al-centro finisce più in alto di sagoma-su-animazione", () => {
    expect(Object.values(fasciaDi("sagoma-al-centro"))).toEqual(stile.quadri["sagoma-al-centro"].fascia_animazione);
    expect(fasciaDi("sagoma-al-centro").y1).toBeLessThan(FASCIA.y1);
    expect(fasciaDi("sagoma-su-animazione")).toEqual(FASCIA);
  });

  test("un quadro senza fascia lo dice", () => {
    expect(() => fasciaDi("girato-pieno")).toThrow(/«girato-pieno» non ha una fascia_animazione/);
  });
});

describe("RIGA_DEI_CONTROLLI", () => {
  test("è la riga che il server cerca per riconoscere le segnalazioni, la stessa in ogni lingua (server/src/sceneFoto.ts)", () => {
    expect(RIGA_DEI_CONTROLLI).toBe("@controlli");
  });
});

describe("fraseDelProblema", () => {
  const casi: Problema[] = [
    { tipo: "manca-il-palco" },
    { tipo: "testo-tagliato", misure: "0-100 × 0-50", testo: "ciao" },
    { tipo: "testo-piccolo", misure: "0-100 × 0-50", testo: "ciao", corpo: "30px", minimo: 40 },
    { tipo: "testo-fuori-fascia", misure: "0-100 × 0-50", testo: "ciao" },
    { tipo: "testo-nei-lati", misure: "0-100 × 0-50", testo: "ciao" },
    { tipo: "testo-esce", misure: "0-100 × 0-50", testo: "ciao" },
    { tipo: "disegno-fuori-fascia", misure: "0-100 × 0-50" },
    { tipo: "disegno-nei-lati", misure: "0-100 × 0-50" },
  ];
  const lingua = process.env["MANGO_ANIMATION_LINGUA"];
  afterEach(() => {
    if (lingua === undefined) delete process.env["MANGO_ANIMATION_LINGUA"];
    else process.env["MANGO_ANIMATION_LINGUA"] = lingua;
  });

  test("ogni problema ha la sua frase in italiano, e in inglese senza parole italiane", () => {
    delete process.env["MANGO_ANIMATION_LINGUA"];
    const italiano = casi.map(fraseDelProblema);
    process.env["MANGO_ANIMATION_LINGUA"] = "en";
    const inglese = casi.map(fraseDelProblema);
    expect(new Set(italiano).size).toBe(casi.length);
    expect(new Set(inglese).size).toBe(casi.length);
    expect(italiano[2]).toBe("testo sotto i 40 px (30px): «ciao»");
    expect(inglese[2]).toBe("text under 40 px (30px): «ciao»");
    for (const frase of inglese) expect(frase).not.toMatch(/(testo|disegno|fascia|lati|manca|riquadro|taglia|esce)/);
  });
});
