import { limita } from "../impianto";
import carattere from "../scene/sigla/caratteri/space-grotesk.typeface.json";
import icona from "./loghi/mango-animation.svg?raw";

// Il marchio di Mango Animation per le scene in 2D: l'icona dell'app a sinistra, «mango» a destra e «animation» sotto, larga come
// «mango», nel carattere della sigla (Space Grotesk bold, `scene/sigla/caratteri/`). È l'impaginazione della sigla, in piano.

interface Glifo {
  ha: number;
  x_min: number;
  x_max: number;
  y_min: number;
  y_max: number;
  o: string;
}

const GLIFI = carattere.glyphs as unknown as Record<string, Glifo>;
const EM = carattere.resolution;
/** Spaziatura fra le lettere e vuoto fra le due righe, in corpi; dall'icona al testo, in altezze del blocco: come nella sigla. */
const ARIA = 0.03;
const VUOTO = 0.16;
const STACCO = 0.3;
const PAROLA = "mango";
const SOTTO = "animation";
const PIENA = 1.2;
/** Il colore di «animation»: l'arancio al centro della sfumatura del marchio. */
const ARANCIO = "#FFA61F";

/** Il contorno di un glifo (formato three.js: m, l, q, b con il punto d'arrivo prima dei controlli, y verso l'alto) in un tracciato SVG di corpo 1. */
function tracciato(o: string): string {
  const v = o.trim().split(/\s+/);
  const n = (i: number) => Number(v[i]) / EM;
  const p = (i: number) => `${n(i)} ${-n(i + 1)}`;
  let d = "";
  for (let i = 0; i < v.length; ) {
    const c = v[i];
    if (c === "m" || c === "l") {
      d += `${c === "m" ? "M" : "L"} ${p(i + 1)} `;
      i += 3;
    } else if (c === "q") {
      d += `Q ${p(i + 3)} ${p(i + 1)} `;
      i += 5;
    } else if (c === "b") {
      d += `C ${p(i + 3)} ${p(i + 5)} ${p(i + 1)} `;
      i += 7;
    } else {
      i += 1;
    }
  }
  return d + "Z";
}

interface Lettera {
  d: string;
  /** Il bordo sinistro della cella della lettera e la linea di base, nel blocco alto 1. */
  x: number;
  y: number;
  corpo: number;
}

/** Il blocco impaginato con altezza 1: l'icona, poi le lettere; `largo` è la sua larghezza. */
function impagina() {
  const em = (k: number) => k / EM;
  const glifo = (c: string) => GLIFI[c]!;
  const larghezza = (testo: string) => {
    const l = [...testo];
    return l.slice(0, -1).reduce((s, c) => s + em(glifo(c).ha) + ARIA, 0) + em(glifo(l[l.length - 1]!).x_max) - em(glifo(l[0]!).x_min);
  };
  const estremo = (testo: string, chiave: "y_max" | "y_min") => [...testo].map((c) => em(glifo(c)[chiave]));
  const corpoSotto = larghezza(PAROLA) / larghezza(SOTTO);
  // Con «mango» di corpo 1: dal basso, «animation», il vuoto, la discesa della «g», «mango».
  const altoSotto = corpoSotto * Math.max(...estremo(SOTTO, "y_max"));
  const scesa = -Math.min(0, ...estremo(PAROLA, "y_min"));
  const alto = altoSotto + VUOTO + scesa + Math.max(...estremo(PAROLA, "y_max"));
  const s = 1 / alto;
  const xTesto = 1 + STACCO;
  const riga = (testo: string, corpo: number, base: number): Lettera[] => {
    let x = xTesto - em(glifo(testo[0]!).x_min) * corpo;
    return [...testo].map((c) => {
      const lettera = { d: tracciato(glifo(c).o), x, y: base, corpo };
      x += (em(glifo(c).ha) + ARIA) * corpo;
      return lettera;
    });
  };
  return {
    largo: xTesto + larghezza(PAROLA) * s,
    parola: riga(PAROLA, s, 1 - (altoSotto + VUOTO + scesa) * s),
    sotto: riga(SOTTO, corpoSotto * s, 1),
  };
}

const BLOCCO = impagina();
const VISTA = icona.match(/viewBox="([^"]+)"/)![1]!;
const DISEGNO = icona.replace(/^[^]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");

/** Altezza su larghezza del marchio: per sapere quanto è alto un marchio largo `largo`. */
export const ASPETTO_MARCHIO = 1 / BLOCCO.largo;

/** Da 0 a 1 con un piccolo rimbalzo oltre l'1: l'icona che si posa, una lettera che si alza. */
function posa(k: number) {
  const x = limita(k, 0, 1);
  return 1 + 2.2 * (x - 1) ** 3 + 1.2 * (x - 1) ** 2;
}

/**
 * Il marchio centrato in (x, y), largo `largo` pixel, dentro un `<svg>`. `t` sono i secondi da quando entra: l'icona si posa, poi le
 * lettere di «mango» si alzano una dopo l'altra e quelle di «animation» sotto, come nella sigla; senza `t` è fermo, intero.
 */
export function MarchioMango({ x, y, largo, t = Infinity, chiaro = "var(--carta)" }: { x: number; y: number; largo: number; t?: number; chiaro?: string }) {
  if (t <= 0) return null;
  const k = largo / BLOCCO.largo;
  // Il disegno dell'icona ha aria attorno al mango: ingrandita di `PIENA`, il mango è alto quanto le due righe.
  const cresce = posa(t / 0.45) * PIENA;
  const lettera = (l: Lettera, nasce: number, colore: string, i: number) => {
    const c = limita((t - nasce) / 0.3, 0, 1);
    if (c <= 0) return null;
    return <path key={`${colore}${i}`} d={l.d} fill={colore} opacity={Math.min(1, c * 2)} transform={`translate(${l.x} ${l.y + (1 - posa(c)) * 0.25}) scale(${l.corpo})`} />;
  };
  return (
    <g transform={`translate(${x - largo / 2} ${y - k / 2}) scale(${k})`}>
      <g transform={`translate(0.5 0.5) scale(${cresce}) translate(-0.5 -0.5)`} opacity={Math.min(1, t / 0.2)}>
        <svg x={0} y={0} width={1} height={1} viewBox={VISTA} dangerouslySetInnerHTML={{ __html: DISEGNO }} />
      </g>
      {BLOCCO.parola.map((l, i) => lettera(l, 0.25 + i * 0.065, chiaro, i))}
      {BLOCCO.sotto.map((l, i) => lettera(l, 0.6 + i * 0.03, ARANCIO, i))}
    </g>
  );
}
