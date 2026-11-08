import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import type { Scena, Video } from "../src/impianto";
import { costruisciRegistro } from "../src/registro";
import { caricaRegistro } from "../script/catalogo";
import { SRC } from "../script/percorsi";

const scena = (titolo: string): Scena => ({ titolo, voce: "", parole: ["a", "b", "c"], durata: 4, fotogrammi: [1, 3.9], Componente: () => createElement("div") });
const video = (titolo: string, ...sigle: string[]): Video => ({ titolo, scene: Object.fromEntries(sigle.map((s) => [s, scena(s)])) });

describe("costruisciRegistro", () => {
  test("trova le scene per video dal nome della cartella", () => {
    const registro = costruisciRegistro({
      "./scene/primo-video/scene.tsx": { video: video("Primo", "p1", "p2") },
      "./scene/secondo/scene.tsx": { video: video("Secondo", "s1") },
    });
    expect(Object.keys(registro.videos)).toEqual(["primo-video", "secondo"]);
    expect(Object.keys(registro.scene)).toEqual(["p1", "p2", "s1"]);
    expect(registro.scene["p2"]?.slug).toBe("primo-video");
  });

  test("capisce anche i percorsi di Windows", () => {
    const percorso = ["C:", "animazioni", "src", "scene", "nuovo", "scene.tsx"].join(String.fromCharCode(92));
    const registro = costruisciRegistro({ [percorso]: { video: video("Nuovo", "n1") } });
    expect(registro.scene["n1"]?.slug).toBe("nuovo");
  });

  test("rifiuta una sigla in due video", () => {
    expect(() =>
      costruisciRegistro({
        "./scene/uno/scene.tsx": { video: video("Uno", "x1") },
        "./scene/due/scene.tsx": { video: video("Due", "x1") },
      }),
    ).toThrow("«x1» è in due video");
  });

  test("rifiuta lo stesso video in due cartelle, una del prodotto e una del creator", () => {
    expect(() =>
      costruisciRegistro({
        "./scene/uno/scene.tsx": { video: video("Uno", "x1") },
        "C:/lavoro/animazioni/scene/uno/scene.tsx": { video: video("Uno bis", "x2") },
      }),
    ).toThrow("Il video «uno» è in due cartelle");
  });

  test("rifiuta un file che non è in scene/<slug>/scene.tsx", () => {
    expect(() => costruisciRegistro({ "./scene/scene.tsx": { video: video("Storto", "z1") } })).toThrow("non è una scena di un video");
  });
});

describe("le scene del pacchetto", async () => {
  const registro = await caricaRegistro(SRC, null);

  test("ogni cartella in scene/ è un video, coi suoi slug", () => {
    expect(Object.keys(registro.videos)).toEqual(["esempio-al-passo-della-voce", "esempio-ancore", "esempio-orizzontale", "sigla", "standard"]);
  });

  test("le scene d'esempio coprono i tre modi di scrivere una scena: con le ancore, al passo del video, trasparente", () => {
    const sigle = (slug: string) => Object.keys(registro.videos[slug]?.scene ?? {});
    expect(sigle("esempio-ancore")).toEqual(["e1", "e2"]);
    expect(sigle("esempio-al-passo-della-voce")).toEqual(["p1", "p2"]);
    expect(sigle("esempio-orizzontale")).toEqual(["o1"]);
    expect(registro.scene["e1"]?.scena.tempi).toBeUndefined();
    expect(Object.keys(registro.scene["p1"]?.scena.tempi ?? {}).length).toBeGreaterThan(0);
    expect(registro.scene["p2"]?.scena.trasparente).toBe(true);
  });

  test("ogni scena ha una durata e fotogrammi dentro la sua durata", () => {
    for (const [sigla, { scena }] of Object.entries(registro.scene)) {
      expect(scena.durata, sigla).toBeGreaterThan(0);
      expect(scena.fotogrammi.length, sigla).toBeGreaterThan(0);
      for (const t of scena.fotogrammi) expect(t >= 0 && t <= scena.durata, `${sigla} a ${t}`).toBe(true);
    }
  });

  test("ogni elemento standard ha la sua scena dimostrativa", () => {
    expect(Object.keys(registro.videos["standard"]?.scene ?? {})).toEqual(["std-palco", "std-entrate", "std-numero", "std-barra", "std-corsia", "std-finestra", "std-schema", "std-titolo"]);
  });
});
