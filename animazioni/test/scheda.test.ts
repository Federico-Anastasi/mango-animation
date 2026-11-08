import { describe, expect, test } from "bun:test";
import { scegliScheda, type Scheda } from "../script/scheda";

const prima: Scheda = { indice: 0, nome: "NVIDIA GeForce RTX 3060 Ti", utilizzo: 0, memoriaMB: 300 };
const seconda: Scheda = { indice: 1, nome: "NVIDIA GeForce GTX 1660 SUPER", utilizzo: 0, memoriaMB: 200 };
const terza: Scheda = { indice: 2, nome: "NVIDIA GeForce GTX 1080", utilizzo: 0, memoriaMB: 100 };
const schede = [prima, seconda, terza];

describe("la scheda su cui il browser disegna", () => {
  test("quella del profilo, per indice di nvidia-smi", () => {
    expect(scegliScheda({ profilo: 1 }, schede)).toEqual({ scheda: seconda });
  });

  test("senza profilo, la prima scheda NVIDIA che c'è", () => {
    expect(scegliScheda({}, schede)).toEqual({ scheda: prima });
  });

  test("senza schede o con null nel profilo, il processore, e dice perché", () => {
    expect(scegliScheda({}, [])).toMatchObject({ processore: expect.stringContaining("nessuna scheda NVIDIA") });
    expect(scegliScheda({ profilo: null }, schede)).toMatchObject({ processore: expect.stringContaining("macchina.scheda_video") });
  });

  test("una scheda del profilo che non c'è ferma la resa: nessun ripiego", () => {
    expect(() => scegliScheda({ profilo: 5 }, schede)).toThrow("scheda video 5");
    expect(() => scegliScheda({ profilo: 0 }, [])).toThrow("scheda video 0");
  });

  test("ANIMAZIONI_SCHEDA, un pezzo del nome, vince sul profilo; «processore» anche", () => {
    expect(scegliScheda({ profilo: 0, nome: "1080" }, schede)).toEqual({ scheda: terza });
    expect(scegliScheda({ profilo: 0, nome: "processore" }, schede)).toMatchObject({ processore: expect.any(String) });
    expect(() => scegliScheda({ nome: "4090" }, schede)).toThrow("«4090»");
  });
});
