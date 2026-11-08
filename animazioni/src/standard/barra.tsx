import type { ReactNode } from "react";
import { curve, decimali, tra } from "../impianto";
import { Appare } from "./entrate";
import { Numero } from "./numero";

interface MisuraProps {
  t: number;
  da: number;
  nome: string;
  valore: number;
  cifre: 0 | 1 | 2;
  unita: string;
  /** Quanta parte della barra riempie il valore, da 0 a 1. */
  frazione: number;
  rosso?: boolean;
  barra?: string;
  /** Disegnato sopra la barra, nelle sue coordinate. */
  children?: ReactNode;
}

/** Una riga di misura: nome, numero che conta e barra che cresce insieme al numero. */
export function Misura({ t, da, nome, valore, cifre, unita, frazione, rosso = false, barra = "var(--blu)", children }: MisuraProps) {
  const p = tra(t, da + 0.4, 1.2, 0, 1, curve.dolce);
  return (
    <Appare t={t} da={da}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <span className="an-testo" style={{ fontSize: 48, whiteSpace: "nowrap" }}>
          {nome}
        </span>
        <Numero testo={decimali(valore * p, cifre)} unita={unita} rosso={rosso} />
      </div>
      <div style={{ position: "relative", height: 48, background: "var(--filo)" }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${frazione * p * 100}%`, background: barra }} />
        {children}
      </div>
    </Appare>
  );
}
