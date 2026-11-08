import { expect, test } from "bun:test";
import { analizza } from "../src/standard/notazione";

test("il testo semplice resta un pezzo solo", () => {
  expect(analizza("Ricomincia da capo")).toEqual([{ tipo: "testo", testo: "Ricomincia da capo", matematico: false }]);
});

test("un pedice prende la lettera davanti in corsivo matematico", () => {
  expect(analizza("X per W_{Q} fa Q")).toEqual([
    { tipo: "testo", testo: "X per ", matematico: false },
    { tipo: "testo", testo: "W", matematico: true },
    { tipo: "pedice", testo: "Q", corsivo: true },
    { tipo: "testo", testo: " fa Q", matematico: false },
  ]);
});

test("un pedice lungo e un apice sono in tondo", () => {
  expect(analizza("W_{gate}").at(-1)).toEqual({ tipo: "pedice", testo: "gate", corsivo: false });
  expect(analizza("K^{T}").at(-1)).toEqual({ tipo: "apice", testo: "T", corsivo: false });
});

test("fra i dollari le lettere sono corsive e il resto è tondo", () => {
  expect(analizza("$Q · K^{T}$")).toEqual([
    { tipo: "testo", testo: "Q", matematico: true },
    { tipo: "testo", testo: " · ", matematico: false },
    { tipo: "testo", testo: "K", matematico: true },
    { tipo: "apice", testo: "T", corsivo: false },
  ]);
});

test("le parentesi quadre fanno una tessera, anche senza lettere", () => {
  expect(analizza("Esce [S] e [ ;)]")).toEqual([
    { tipo: "testo", testo: "Esce ", matematico: false },
    { tipo: "tessera", testo: "S" },
    { tipo: "testo", testo: " e ", matematico: false },
    { tipo: "tessera", testo: " ;)" },
  ]);
});
