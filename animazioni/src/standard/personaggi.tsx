import { curve, limita } from "../impianto";

// I due personaggi delle scene in cui il creator dice la sua: la AI (sempre lei, blu, con due occhi) e l'umano (a inchiostro). E la strada
// della ricerca: un cammino a tratti che si disegna, coi vicoli ciechi che si barrano.

export type Punto = readonly [number, number];

const TRATTO = { stroke: "var(--inchiostro)", strokeWidth: 5, strokeLinejoin: "round" as const };

/** La AI: un disco blu con due occhi, che respira un poco. `guarda` sposta gli occhi verso destra (1) o sinistra (−1). */
export function AI({ x, y, t, r = 34, guarda = 1, opacita = 1 }: { x: number; y: number; t: number; r?: number; guarda?: number; opacita?: number }) {
  if (opacita <= 0) return null;
  const su = 3 * Math.sin(2.2 * t);
  return (
    <g opacity={opacita} transform={`translate(${x} ${y + su})`}>
      <circle r={r} fill="var(--blu)" {...TRATTO} />
      <circle cx={-r * 0.3 + guarda * r * 0.12} cy={-r * 0.12} r={r * 0.15} fill="var(--carta)" />
      <circle cx={r * 0.3 + guarda * r * 0.12} cy={-r * 0.12} r={r * 0.15} fill="var(--carta)" />
    </g>
  );
}

/** L'umano: testa e spalle a inchiostro. */
export function Umano({ x, y, t, r = 30, opacita = 1, fase = 0 }: { x: number; y: number; t: number; r?: number; opacita?: number; fase?: number }) {
  if (opacita <= 0) return null;
  const su = 2 * Math.sin(1.7 * t + fase);
  return (
    <g opacity={opacita} transform={`translate(${x} ${y + su})`}>
      <path d={`M${-r * 1.25} ${r * 1.7} Q${-r * 1.2} ${r * 0.55} 0 ${r * 0.55} Q${r * 1.2} ${r * 0.55} ${r * 1.25} ${r * 1.7} Z`} fill="var(--carta-scura)" {...TRATTO} />
      <circle r={r * 0.62} fill="var(--carta-scura)" {...TRATTO} />
    </g>
  );
}

/** Il punto a `p` (0…1) lungo una spezzata, e la lunghezza della spezzata. */
export function lungo(punti: readonly Punto[], p: number): Punto {
  const tratti = punti.slice(1).map((b, i) => Math.hypot(b[0] - punti[i]![0], b[1] - punti[i]![1]));
  const totale = tratti.reduce((a, b) => a + b, 0);
  let resta = limita(p, 0, 1) * totale;
  for (let i = 0; i < tratti.length; i++) {
    if (resta <= tratti[i]! || i === tratti.length - 1) {
      const f = tratti[i]! ? limita(resta / tratti[i]!, 0, 1) : 0;
      const a = punti[i]!;
      const b = punti[i + 1]!;
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    }
    resta -= tratti[i]!;
  }
  return punti[punti.length - 1]!;
}

/** Una spezzata disegnata fino a `p` (0…1). */
export function Cammino({ punti, p, colore = "var(--blu)", spessore = 15, tratteggio, opacita = 1 }: {
  punti: readonly Punto[];
  p: number;
  colore?: string;
  spessore?: number;
  tratteggio?: string;
  opacita?: number;
}) {
  if (p <= 0 || opacita <= 0) return null;
  const fine = lungo(punti, p);
  const tratti = punti.slice(1).map((b, i) => Math.hypot(b[0] - punti[i]![0], b[1] - punti[i]![1]));
  const totale = tratti.reduce((a, b) => a + b, 0);
  let fatta = 0;
  const visti: Punto[] = [punti[0]!];
  for (let i = 0; i < tratti.length; i++) {
    if (fatta + tratti[i]! >= p * totale) break;
    fatta += tratti[i]!;
    visti.push(punti[i + 1]!);
  }
  visti.push(fine);
  return (
    <polyline
      points={visti.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}
      fill="none"
      stroke={colore}
      strokeWidth={spessore}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={tratteggio}
      opacity={opacita}
    />
  );
}

/** Una croce che si disegna in due colpi su un vicolo cieco, mentre `p` va da 0 a 1. */
export function Croce({ x, y, p, r = 22 }: { x: number; y: number; p: number; r?: number }) {
  if (p <= 0) return null;
  const a = curve.dolce(limita(p * 2, 0, 1));
  const b = curve.dolce(limita(p * 2 - 1, 0, 1));
  return (
    <g stroke="var(--rosso)" strokeWidth={9} strokeLinecap="round">
      <line x1={x - r} y1={y - r} x2={x - r + 2 * r * a} y2={y - r + 2 * r * a} />
      {b > 0 && <line x1={x + r} y1={y - r} x2={x + r - 2 * r * b} y2={y - r + 2 * r * b} />}
    </g>
  );
}

/** La bandiera dell'obiettivo, che sale sull'asta mentre `p` va da 0 a 1. */
export function Bandiera({ x, y, p, t }: { x: number; y: number; p: number; t: number }) {
  if (p <= 0) return null;
  const alto = 110 * curve.entra(limita(p, 0, 1));
  const sventola = 6 * Math.sin(3 * t);
  return (
    <g>
      <line x1={x} y1={y} x2={x} y2={y - alto} stroke="var(--inchiostro)" strokeWidth={6} strokeLinecap="round" />
      {p > 0.6 && (
        <path d={`M${x} ${y - alto} L${x + 70} ${y - alto + 20 + sventola} L${x} ${y - alto + 44} Z`} fill="var(--rosso)" stroke="var(--inchiostro)" strokeWidth={4} strokeLinejoin="round" />
      )}
      <circle cx={x} cy={y} r={9} fill="var(--inchiostro)" />
    </g>
  );
}