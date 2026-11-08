import claude from "./loghi/claude.svg?raw";
import openai from "./loghi/openai.svg?raw";

// Ogni file in `loghi/` ha accanto il suo `.txt`: da dove viene, la licenza, il giorno in cui è stato scaricato.

export interface Simbolo {
  vista: readonly [number, number, number, number];
  tracciato: string;
  colore: string;
}

function simbolo(svg: string, colore: string | undefined): Simbolo {
  const vista = svg.match(/viewBox="([^"]+)"/)?.[1]?.split(" ").map(Number);
  const tracciato = svg.match(/ d="([^"]+)"/)?.[1];
  if (vista?.length !== 4 || !tracciato || !colore) throw new Error("un logo in standard/loghi/ non ha viewBox, tracciato o colore");
  return { vista: vista as unknown as Simbolo["vista"], tracciato, colore };
}

/** Il simbolo di Claude (`loghi/claude.txt`: Commons, CC0, marchio di Anthropic), nel suo arancio. */
export const CLAUDE = simbolo(claude, claude.match(/fill="([^"]+)"/)?.[1]);

/** Il simbolo di OpenAI, cioè di ChatGPT (`loghi/openai.txt`: Commons, pubblico dominio, marchio registrato). */
export const CHATGPT = simbolo(openai, "var(--inchiostro)");

/** Un logo centrato in (x, y), largo `lato` pixel, girato di `ruota` gradi. */
export function Logo({ simbolo: s, x, y, lato, ruota = 0, opacita = 1 }: { simbolo: Simbolo; x: number; y: number; lato: number; ruota?: number; opacita?: number }) {
  if (opacita <= 0) return null;
  const [vx, vy, vl, va] = s.vista;
  const k = lato / Math.max(vl, va);
  return (
    <g opacity={opacita} transform={`translate(${x} ${y}) rotate(${ruota}) scale(${k}) translate(${-vx - vl / 2} ${-vy - va / 2})`}>
      <path d={s.tracciato} fill={s.colore} />
    </g>
  );
}
