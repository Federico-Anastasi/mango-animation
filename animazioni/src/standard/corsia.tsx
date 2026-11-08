import type { ReactNode } from "react";
import { curve, decimali, limita, tra } from "../impianto";
import { Numero } from "./numero";

const CORSIA = { cella: 10, passo: 12, perRiga: 74, righe: 3 };

interface VelocitaProps {
  t: number;
  /** Quando si disegna la corsia vuota, quando viene detto il numero. */
  traccia: number;
  numero: number;
  nome: ReactNode;
  valore: number;
  cifre: 0 | 1;
  rosso?: boolean;
}

/** Una velocità al passo della voce: il numero entra quando viene detto, e da lì la corsia si riempie di token
 *  alla velocità vera, una cella a token; piena, ricomincia. */
export function Velocita({ t, traccia, numero, nome, valore, cifre, rosso = false }: VelocitaProps) {
  const fatti = t < numero ? 0 : Math.floor(valore * (t - numero)) % (CORSIA.perRiga * CORSIA.righe);
  const colore = rosso ? "var(--rosso)" : "var(--blu)";
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <span className="an-testo" style={{ fontSize: 48, whiteSpace: "nowrap" }}>
          {nome}
        </span>
        <Numero testo={decimali(valore * tra(t, numero, 0.8, 0, 1, curve.dolce), cifre)} unita="token/s" rosso={rosso} opacita={tra(t, numero, 0.3, 0, 1)} />
      </div>
      <div style={{ position: "relative", height: 48, width: `${tra(t, traccia, 0.9, 0, 100, curve.dolce)}%`, background: "var(--filo)", overflow: "hidden" }}>
        {Array.from({ length: CORSIA.righe }, (_, riga) => (
          <div
            key={riga}
            style={{
              position: "absolute",
              left: 1,
              top: 5 + riga * 14,
              height: CORSIA.cella,
              width: limita(fatti - riga * CORSIA.perRiga, 0, CORSIA.perRiga) * CORSIA.passo,
              backgroundImage: `repeating-linear-gradient(90deg, ${colore} 0 ${CORSIA.cella}px, transparent ${CORSIA.cella}px ${CORSIA.passo}px)`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
