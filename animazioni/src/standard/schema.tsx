import type { ReactNode } from "react";
import { curve, tra, type Punto, type ScenaProps } from "../impianto";
import { Appare } from "./entrate";
import { Scatola } from "./palco";

/** Il punto a `quanto` (da 0 a 1) del tratto fra due punti. */
export const fra = (a: Punto, b: Punto, quanto: number): Punto => [a[0] + (b[0] - a[0]) * quanto, a[1] + (b[1] - a[1]) * quanto];

/** Va e viene fra 0 e 1, una volta ogni due unità. */
export const vaEViene = (x: number): number => curve.dolce(1 - Math.abs((((x % 2) + 2) % 2) - 1));

interface NodoProps {
  dove: Punto;
  largo: number;
  alto: number;
  /** Quanto è comparso, da 0 a 1: opacità e scala insieme. */
  visto?: number;
  children?: ReactNode;
}

/** Un nodo della rete: una scatola centrata su `dove`. */
export function Nodo({ dove, largo, alto, visto = 1, children }: NodoProps) {
  return (
    <div
      style={{ position: "absolute", left: dove[0] - largo / 2, top: dove[1] - alto / 2, width: largo, height: alto, border: "5px solid var(--inchiostro)", background: "var(--carta-scura)", opacity: visto, transform: `scale(${0.6 + 0.4 * visto})`, display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      {children}
    </div>
  );
}

/** Un filo fra due nodi: da mettere dentro un `<svg>` grande quanto il campo. */
export function Collegamento({ da, a, colore = "var(--grigio)", opacita = 1 }: { da: Punto; a: Punto; colore?: string; opacita?: number }) {
  return <line x1={da[0]} y1={da[1]} x2={a[0]} y2={a[1]} stroke={colore} strokeWidth={4} opacity={opacita} />;
}

/** Un pacchetto di dati che corre su un filo. */
export function Pacchetto({ dove, lato, colore = "var(--inchiostro)", opacita = 1 }: { dove: Punto; lato: number; colore?: string; opacita?: number }) {
  return <div style={{ position: "absolute", left: dove[0] - lato / 2, top: dove[1] - lato / 2, width: lato, height: lato, borderRadius: "50%", background: colore, opacity: opacita }} />;
}

export const UTENTE_ALTO = 102;

/** Chi usa la rete: busto e testa, con la testa in `y`. */
export function Utente({ x, y, opacita }: { x: number; y: number; opacita: number }) {
  const tratto = { position: "absolute", border: "5px solid var(--inchiostro)", background: "var(--carta-scura)" } as const;
  return (
    <div style={{ opacity: opacita }}>
      <div style={{ ...tratto, left: x - 23, top: y, width: 46, height: 46, borderRadius: "50%" }} />
      <div style={{ ...tratto, left: x - 48, top: y + 52, width: 96, height: UTENTE_ALTO - 52, borderRadius: "48px 48px 0 0" }} />
    </div>
  );
}

interface ComputerProps extends Pick<ScenaProps, "t"> {
  da: number;
  nome: string;
  style: { left: number; top: number; width: number; height: number };
  /** Cosa fa, scritto sotto il nome dall'istante `notaDa`, quando il bordo diventa blu. */
  nota?: string;
  notaDa?: number;
}

/** Un computer con il suo nome: compare a `da`, e da `notaDa` dice cosa fa. */
export function Computer({ t, da, nome, style, nota, notaDa = 0 }: ComputerProps) {
  return (
    <Appare t={t} da={da} style={{ position: "absolute", ...style }}>
      <Scatola style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span className="an-display" style={{ fontSize: 54 }}>
          {nome}
        </span>
        {nota && (
          <Appare t={t} da={notaDa} sposta={[0, 0]} className="an-etichetta" style={{ fontSize: 40, whiteSpace: "nowrap" }}>
            {nota}
          </Appare>
        )}
      </Scatola>
      {nota && <div style={{ position: "absolute", inset: 0, border: "5px solid var(--blu)", opacity: tra(t, notaDa, 0.5, 0, 1) }} />}
    </Appare>
  );
}
