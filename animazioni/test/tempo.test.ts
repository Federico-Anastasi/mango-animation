import { describe, expect, test } from "bun:test";
import { nellaScena } from "../script/tempo";

describe("nellaScena", () => {
  test("senza ancore la scena scorre al passo del video", () => {
    expect(nellaScena([], 0)).toBe(0);
    expect(nellaScena([], 3.5)).toBe(3.5);
  });

  test("se il parlato è più lento la scena avanza e poi aspetta l'ancora dopo", () => {
    const ancore = [[5, 2]] as const;
    expect(nellaScena(ancore, 1)).toBe(1);
    expect(nellaScena(ancore, 2)).toBe(2);
    expect(nellaScena(ancore, 4.9)).toBe(2);
  });

  test("se il parlato è più svelto la scena si stringe per arrivare in tempo", () => {
    const ancore = [[2, 4]] as const;
    expect(nellaScena(ancore, 1)).toBe(2);
    expect(nellaScena(ancore, 2)).toBe(4);
  });

  test("dopo l'ultima ancora la scena riparte da lì al passo del video", () => {
    const ancore = [[5, 2], [8, 6]] as const;
    expect(nellaScena(ancore, 5)).toBe(2);
    expect(nellaScena(ancore, 6.5)).toBe(4);
    expect(nellaScena(ancore, 8)).toBe(6);
    expect(nellaScena(ancore, 10)).toBe(8);
  });
});
