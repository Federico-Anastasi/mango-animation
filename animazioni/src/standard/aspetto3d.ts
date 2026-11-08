import { curve, decimali, limita } from "../impianto";

// L'aspetto dei film in 3D, fuori dallo stile comune: fondo quasi nero, il testo che entra nel modello in
// ambra, i pesi in azzurro, l'attenzione in magenta; Q, K e V hanno ognuna il suo colore.

export const W = 1080;
export const H = 1920;
export const C = {
  fondo: "#07090D",
  griglia: "#161B25",
  spento: "#1E2532",
  tenue: "#7A869B",
  testo: "#EEF1F6",
  token: "#FFB627",
  peso: "#4CCBFF",
  attenzione: "#FF4FA3",
  /** Q è l'attenzione che cerca: il suo colore è quello dell'attenzione. */
  query: "#FF4FA3",
  chiave: "#3DDC97",
  valore: "#A78BFA",
} as const;

/** Il fondo della tessera di un token, e il filo ambra che la staccherebbe dal fondo del film. */
export const TESSERA_TOKEN = { fondo: "#2B1F08", filo: "rgba(255, 182, 39, 0.4)" } as const;

export const num = (x: number, cifre = 4) => (x < 0 ? "−" : "") + new Intl.NumberFormat("it-IT", { minimumFractionDigits: cifre, maximumFractionDigits: cifre }).format(Math.abs(x));
export const intero = (x: number) => decimali(x, 0);
/** Uno spazio in testa al pezzo si vede come un punto: è parte del token. */
export const pezzo = (p: string) => (p.startsWith(" ") ? `·${p.slice(1)}` : p);

/** Da 0 a 1 fra `da` e `da + dura`, con la curva d'ingresso. */
export const entra = (t: number, da: number, dura = 0.4) => curve.entra(limita((t - da) / dura, 0, 1));
export const dolce = (t: number, da: number, dura: number) => curve.dolce(limita((t - da) / dura, 0, 1));
