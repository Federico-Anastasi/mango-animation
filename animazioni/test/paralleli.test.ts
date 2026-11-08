import { expect, test } from "bun:test";
import { aGruppi } from "../script/comune";

test("aGruppi fa tutto il lavoro, mai più di quanti alla volta", async () => {
  let insieme = 0;
  let massimo = 0;
  const fatti: number[] = [];
  await aGruppi([1, 2, 3, 4, 5, 6, 7], 3, async (v) => {
    insieme++;
    massimo = Math.max(massimo, insieme);
    await Bun.sleep(5 + (v % 3) * 5);
    fatti.push(v);
    insieme--;
  });
  expect(fatti.toSorted()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  expect(massimo).toBe(3);
});

test("aGruppi si ferma al primo errore e lo restituisce", async () => {
  const lavoro = aGruppi([1, 2, 3], 2, async (v) => {
    if (v === 2) throw new Error("rotto");
  });
  await expect(lavoro).rejects.toThrow("rotto");
});
