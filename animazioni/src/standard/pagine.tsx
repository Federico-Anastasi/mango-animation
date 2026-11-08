import { useId, type ReactNode } from "react";
import { curve, limita, tra } from "../impianto";
import stile from "virtual:stile";

// Le pagine e le foto vere dei video di notizia: la scena copre la banda in alto del quadro `girato-con-animazione`, sopra il girato
// a tutto fotogramma. Ciò che si legge sta dentro i lati che il telefono taglia, la telecamera non sta mai ferma (si sposta fra le
// viste e si avvicina piano da sola), e i riquadri rossi si disegnano sulle frasi della pagina. Le coordinate dei disegni sono della
// banda: x da 0 a LARGO, y da 0 ad ALTO.

const quadro = stile.quadri["girato-con-animazione"];
const [X0, Y0, X1, Y1] = quadro.fascia_animazione as [number, number, number, number];
export const LARGO = X1 - X0;
export const ALTO = Y1 - Y0;
/** Il rettangolo che la scena copre: tutta la larghezza, dalla cima fino al bordo basso della banda (lì comincia il girato). */
export const FONDO = [0, 0, X1, Y1] as const;
/** Quanto ciò che si legge sta lontano dai lati. */
export const LATI = stile.telefono.margine_lati;
const LARGO_UTILE = LARGO - 2 * LATI;

/** Quanto la telecamera si avvicina da sola ogni secondo: lo sfondo non resta mai fermo. */
const SPINTA = 0.003;
/** Quanta della larghezza che si legge prende una frase inquadrata: il resto è bianco dentro i lati, anche dopo la spinta. */
const AGIO = 0.88;
const RESPIRO_RIQUADRO = 6;
/** Quanto dura la salita di una pagina nuova. */
const SALITA = 0.55;

export type Riquadro = readonly [number, number, number, number];

export interface Immagine {
  src: string;
  largo: number;
  alto: number;
}

/** Quanto è visibile una cosa che entra a `da` (0,7 s) e, se c'è, esce a `via`. */
export const entra = (t: number, da: number, durata = 0.7): number => tra(t, da, durata, 0, 1);
export const esce = (t: number, da: number, durata = 0.5): number => 1 - tra(t, da, durata, 0, 1, curve.dolce);
export const vista = (t: number, da: number, via?: number): number => entra(t, da) * (via === undefined ? 1 : esce(t, via));

/** Un numero che va da `x0` a `x1` fra `da` e `da + durata`, piano in partenza e in arrivo. */
export const sposta = (t: number, da: number, x0: number, x1: number, durata = 1.2): number => tra(t, da, durata, x0, x1, curve.dolce);

/** Un numero intero sempre uguale fra 0 e 1, da due interi: per sfarfallii e campi di numeri senza stato. */
export function caso(a: number, b: number): number {
  let h = Math.imul(a + 1013, 0x9e3779b1) ^ Math.imul(b + 733, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  return ((h ^ (h >>> 12)) >>> 0) / 2 ** 32;
}

const formati = new Map<number, Intl.NumberFormat>();

/** Un numero all'italiana con `cifre` decimali e il segno meno tipografico. */
export function cifra(v: number, cifre = 0): string {
  if (!formati.has(cifre)) formati.set(cifre, new Intl.NumberFormat("it-IT", { minimumFractionDigits: cifre, maximumFractionDigits: cifre }));
  return formati.get(cifre)!.format(v);
}

/** La scena: fondo bianco su tutto il FONDO, e un gruppo con l'origine nell'angolo alto a sinistra della banda. */
export function Tela({ children }: { children: ReactNode }) {
  return (
    <svg width={FONDO[2]} height={FONDO[3]} viewBox={`0 0 ${FONDO[2]} ${FONDO[3]}`} style={{ position: "absolute", left: 0, top: 0, overflow: "hidden" }}>
      <rect x={0} y={0} width={FONDO[2]} height={FONDO[3]} fill="var(--bianco)" />
      <g transform={`translate(${X0} ${Y0})`}>{children}</g>
    </svg>
  );
}

/** Dove guarda la telecamera: il punto `cx, cy` dell'immagine al centro della banda, ingrandito `s` volte, da `da` in `durata` secondi. */
export interface Veduta {
  da: number;
  durata?: number;
  cx: number;
  cy: number;
  s: number;
}

/** Una veduta che inquadra un riquadro dell'immagine: lo mette al centro della banda, largo quanto `larghezza` della parte che si legge
 * (o alto quanto `altezza` della banda, se è il lato che conta). */
export function inquadra(r: Riquadro, da: number, larghezza = 1, durata?: number, altezza = 0.92): Veduta {
  const s = Math.min((LARGO_UTILE * AGIO * larghezza) / r[2], (ALTO * altezza) / r[3]);
  return { da, durata, cx: r[0] + r[2] / 2, cy: r[1] + r[3] / 2, s };
}

/** La veduta all'istante t: da una all'altra con `curve.dolce`, più la spinta lenta. */
export function telecamera(t: number, viste: readonly Veduta[]): { cx: number; cy: number; s: number } {
  let stato = { cx: viste[0]!.cx, cy: viste[0]!.cy, s: viste[0]!.s };
  for (const v of viste.slice(1)) {
    if (t < v.da) break;
    const p = curve.dolce(limita((t - v.da) / (v.durata ?? 1.0), 0, 1));
    stato = { cx: stato.cx + (v.cx - stato.cx) * p, cy: stato.cy + (v.cy - stato.cy) * p, s: stato.s * (v.s / stato.s) ** p };
  }
  return { ...stato, s: stato.s * (1 + SPINTA * t) };
}

/** Un riquadro rosso attorno a una frase, che si disegna da sinistra in `durata` secondi da `da`. */
export interface Evidenza {
  rect: Riquadro;
  da: number;
  durata?: number;
}

/** Quanto è salita una pagina che entra a `da`: 0 sotto la scena, 1 al suo posto. Senza `da` è già al suo posto. */
export const salita = (t: number, da?: number): number => (da === undefined ? 1 : tra(t, da, SALITA, 0, 1, curve.dolce));

/** Un disegno che sale dal basso come una pagina, su fondo bianco, e copre ciò che c'era. */
export function Foglio({ t, entra: da, children }: { t: number; entra?: number; children: ReactNode }) {
  const su = salita(t, da);
  if (su <= 0) return null;
  return (
    <g transform={`translate(0 ${(1 - su) * FONDO[3]})`}>
      <rect x={-X0} y={-Y0} width={FONDO[2]} height={FONDO[3]} fill="var(--bianco)" />
      {children}
      {su < 1 && <line x1={-X0} y1={-Y0 + 1.5} x2={FONDO[2]} y2={-Y0 + 1.5} stroke="var(--filo)" strokeWidth={3} />}
    </g>
  );
}

/** Una foto vera come oggetto della scena: sta in un riquadro della banda, col filo d'inchiostro attorno, e il soggetto riempie il
 * riquadro (il di più si taglia). Con `entra` sale dal basso a quell'istante. `tesa` la fa entrare senza filo, per un ritratto solo. */
export function Foto({ t, immagine, x, y, largo, alto, entra: da, tesa = false }: {
  t: number;
  immagine: Immagine;
  x: number;
  y: number;
  largo: number;
  alto: number;
  entra?: number;
  tesa?: boolean;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const su = salita(t, da);
  if (su <= 0) return null;
  return (
    <g transform={`translate(0 ${(1 - su) * (ALTO + alto)})`} opacity={su}>
      <clipPath id={`foto${id}`}>
        <rect x={x} y={y} width={largo} height={alto} />
      </clipPath>
      <g clipPath={`url(#foto${id})`}>
        <image href={immagine.src} x={x} y={y} width={largo} height={alto} preserveAspectRatio="xMidYMin slice" />
      </g>
      {!tesa && <rect x={x} y={y} width={largo} height={alto} fill="none" stroke="var(--inchiostro)" strokeWidth={4} />}
    </g>
  );
}

/** Il nome di una persona a schermo: grande, a sinistra, nell'inchiostro. Mai sotto i 40 px. */
export function Etichetta({ x, y, size = 46, colore = "var(--inchiostro)", opacita = 1, children }: {
  x: number;
  y: number;
  size?: number;
  colore?: string;
  opacita?: number;
  children: ReactNode;
}) {
  return (
    <text x={x} y={y} fontSize={Math.max(40, size)} fontWeight={700} fill={colore} opacity={opacita} style={{ fontFamily: "var(--display)" }}>
      {children}
    </text>
  );
}

/**
 * Una pagina o una foto vera ripresa da vicino, dentro i lati che il telefono taglia (fuori resta il bianco): la telecamera si sposta
 * fra le viste, i riquadri rossi si disegnano sulle frasi. Con `entra` sale dal basso a quell'istante e copre ciò che c'era; mentre
 * sale, un filo ne segna il bordo. Riquadri e filo hanno sempre lo stesso spessore sullo schermo, qualunque sia l'ingrandimento.
 */
export function Pagina({ t, immagine, viste, evidenze = [], entra: da, fondo = "var(--bianco)" }: {
  t: number;
  immagine: Immagine;
  viste: readonly Veduta[];
  evidenze?: readonly Evidenza[];
  entra?: number;
  fondo?: string;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const su = salita(t, da);
  if (su <= 0) return null;
  const { cx, cy, s } = telecamera(t, viste);
  return (
    <g transform={`translate(0 ${(1 - su) * FONDO[3]})`}>
      <rect x={-X0} y={-Y0} width={FONDO[2]} height={FONDO[3]} fill={fondo} />
      <clipPath id={`lati${id}`}>
        <rect x={LATI} y={-Y0} width={LARGO - 2 * LATI} height={FONDO[3]} />
      </clipPath>
      <g clipPath={`url(#lati${id})`}>
      <g transform={`translate(${LARGO / 2} ${ALTO / 2}) scale(${s}) translate(${-cx} ${-cy})`}>
        <image href={immagine.src} x={0} y={0} width={immagine.largo} height={immagine.alto} preserveAspectRatio="none" />
        {evidenze.map((e, i) => {
          const p = tra(t, e.da, e.durata ?? 0.6, 0, 1, curve.dolce);
          if (p <= 0) return null;
          const [x, y, w, h] = e.rect;
          const r = RESPIRO_RIQUADRO / s;
          return (
            <g key={i}>
              <clipPath id={`ev${id}-${i}`}>
                <rect x={x - r - 40} y={y - r - 40} width={(w + 2 * r + 80) * p} height={h + 2 * r + 80} />
              </clipPath>
              <rect x={x - r} y={y - r} width={w + 2 * r} height={h + 2 * r} rx={4 / s} fill="none" stroke="var(--rosso)" strokeWidth={7} vectorEffect="non-scaling-stroke" clipPath={`url(#ev${id}-${i})`} />
            </g>
          );
        })}
      </g>
      </g>
      {su < 1 && <line x1={-X0} y1={-Y0 + 1.5} x2={FONDO[2]} y2={-Y0 + 1.5} stroke="var(--filo)" strokeWidth={3} />}
    </g>
  );
}