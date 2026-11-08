import type { ReactElement } from "react";
import { FORMATI } from "./standard/stile";

export type Punto = readonly [number, number];

/** I secondi in cui viene detta ogni parola di una scena che scorre al passo del video, per nome. */
export type Tempi = Readonly<Record<string, number>>;

export interface ScenaProps<T extends Tempi = Tempi> {
  /** Secondi dall'inizio della scena: l'unica fonte di movimento. */
  t: number;
  /** I secondi di scena in cui il video dice ogni parola: quelli del montaggio, o quelli propri della scena. */
  tempi: T;
  /** La lingua in cui la scena scrive i suoi testi: quella del montaggio, o l'italiano se nessuno gliel'ha detta (vedi `testi.ts` della scena). */
  lingua?: string;
}

/** Un appiglio della mappa: le parole, oppure le parole con una nota in piccolo sotto. */
export type Appiglio = string | readonly [parole: string, nota: string];

export interface Scena<T extends Tempi = Tempi> {
  titolo: string;
  /** Ciò che la voce dice mentre la scena scorre. */
  voce: string;
  /** Tre appigli per dirlo a memoria: sono la riga della mappa da tenere davanti mentre si registra. */
  parole: readonly [Appiglio, Appiglio, Appiglio];
  /** Secondi: l'ultimo fotogramma è fermo e regge da solo. */
  durata: number;
  /** Gli istanti da fotografare: uno per ogni cosa che entra, e l'ultimo fotogramma. */
  fotogrammi: readonly number[];
  /** Presente solo nelle scene che scorrono al passo del video: i tempi di partenza, usati finché non li dà un montaggio. */
  tempi?: T;
  /** Il quadro di `stile.json` per cui la scena è disegnata: la sua fascia utile è quella della scena (anteprime e controlli di `foto`); nel video vale il quadro del piano. Senza, `sagoma-su-animazione`. */
  quadro?: string;
  /** Il rettangolo [x0, y0, x1, y1] dove la scena disegna, se non è la fascia utile dello stile. */
  fascia?: readonly [number, number, number, number];
  /** Senza sfondo: nel montaggio, fuori da ciò che disegna, resta visibile il girato sotto (una scritta sopra una ripresa). */
  trasparente?: boolean;
  // Dichiarato come metodo: una scena coi suoi tempi precisi vale come una scena coi tempi generici.
  Componente(props: ScenaProps<T>): ReactElement;
}

export type NomeFormato = keyof typeof FORMATI;

/** Un video: le sue scene per sigla. */
export interface Video {
  titolo: string;
  /** Il formato in cui sono disegnate le sue scene; senza, il verticale. */
  formato?: NomeFormato;
  scene: Readonly<Record<string, Scena>>;
}

export function palcoDi(formato: NomeFormato = "verticale") {
  const { largo, alto } = FORMATI[formato];
  return { larghezza: largo, altezza: alto };
}

export type Curva = (x: number) => number;

export const curve = {
  lineare: (x) => x,
  /** Parte piano e arriva piano: per ciò che si sposta da un posto a un altro. */
  dolce: (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2),
  /** Parte deciso e si posa piano: per ciò che entra. */
  entra: (x) => 1 - (1 - x) ** 3,
} satisfies Record<string, Curva>;

export const limita = (x: number, minimo: number, massimo: number): number => Math.min(massimo, Math.max(minimo, x));

/** Il valore al tempo t di un movimento da `da` ad `a` che dura `durata` secondi a partire da `inizio`; prima resta `da`, dopo resta `a`. */
export function tra(t: number, inizio: number, durata: number, da: number, a: number, curva: Curva = curve.entra): number {
  const x = limita((t - inizio) / durata, 0, 1);
  return da + (a - da) * curva(x);
}

const locali: Readonly<Record<string, string>> = { it: "it-IT", en: "en-US" };

function formatiDi(lingua: string) {
  const locale = locali[lingua] ?? lingua;
  return ([0, 1, 2] as const).map((cifre) => new Intl.NumberFormat(locale, { minimumFractionDigits: cifre, maximumFractionDigits: cifre }));
}

let formati = formatiDi("it");

/** La lingua in cui la scena scrive numeri e date: la decide il montaggio, una volta sola prima dei fotogrammi. */
export function impostaLingua(lingua: string): void {
  formati = formatiDi(lingua);
}

/** Numero con un numero fisso di decimali (0, 1 o 2), scritto come si usa nella lingua della scena: le cifre non cambiano larghezza mentre un numero conta. */
export const decimali = (valore: number, cifre: 0 | 1 | 2): string => (formati[cifre] ?? formati[0]!).format(valore);
