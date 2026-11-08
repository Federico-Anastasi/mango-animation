import { describe, expect, test } from "bun:test";
import stile from "../../stile.json";
import { latiDaControllare } from "../script/foto";
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
