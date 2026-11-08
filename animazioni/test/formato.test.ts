import { describe, expect, test } from "bun:test";
import { palcoDi } from "../src/impianto";
import { caricaRegistro } from "../script/catalogo";
import { SRC } from "../script/percorsi";

describe("il formato di un video", () => {
  test("senza dichiararlo, il palco è quello verticale dello stile", () => {
    expect(palcoDi(undefined)).toEqual({ larghezza: 1080, altezza: 1920 });
  });

  test("un video orizzontale ha il palco orizzontale dello stile", () => {
    expect(palcoDi("orizzontale")).toEqual({ larghezza: 1920, altezza: 1080 });
  });

  test("un video che lo dichiara è orizzontale, gli altri verticali", async () => {
    const registro = await caricaRegistro(SRC, null);
    expect(registro.videos["esempio-orizzontale"]?.formato).toBe("orizzontale");
    expect(registro.videos["esempio-ancore"]?.formato).toBeUndefined();
  });
});
