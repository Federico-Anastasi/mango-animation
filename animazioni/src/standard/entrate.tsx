import type { CSSProperties, ReactNode } from "react";
import { curve, tra } from "../impianto";

interface AppareProps {
  t: number;
  da: number;
  /** Durata della comparsa. */
  durata?: number;
  /** Istante in cui comincia a sparire. */
  esce?: number;
  /** Da dove arriva, in px dal suo posto finale. */
  sposta?: readonly [number, number];
  style?: CSSProperties;
  className?: string;
  children?: ReactNode;
}

/** Compare (e al caso sparisce) senza mai occupare un altro posto: il layout non si muove. */
export function Appare({ t, da, durata = 0.7, esce, sposta = [0, 24], style, className, children }: AppareProps) {
  const dentro = tra(t, da, durata, 0, 1);
  const fuori = esce === undefined ? 0 : tra(t, esce, 0.5, 0, 1, curve.dolce);
  return (
    <div className={className} style={{ ...style, opacity: dentro * (1 - fuori), transform: `translate(${(1 - dentro) * sposta[0]}px, ${(1 - dentro) * sposta[1]}px)` }}>
      {children}
    </div>
  );
}

/** Un filo che si disegna da sinistra a destra. */
export function Filo({ t, da, durata = 0.9, spessore = 3, colore = "var(--filo)" }: { t: number; da: number; durata?: number; spessore?: number; colore?: string }) {
  return <div style={{ height: spessore, width: `${tra(t, da, durata, 0, 100, curve.dolce)}%`, background: colore }} />;
}
