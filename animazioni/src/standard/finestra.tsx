import type { CSSProperties, ReactNode } from "react";
import { curve, tra, type Punto } from "../impianto";

// La finestra da vecchio computer: un cambio di stile che aggancia, non lo stile del video. I colori sono quelli del
// sistema di allora, non della carta.
export const GRIGIO_FINESTRA = "#C0C0C0";
const BLU_FINESTRA = "#000080";
export const RILIEVO = { border: "5px solid", borderColor: "#FFFFFF #404040 #404040 #FFFFFF" } as const;
export const INCASSO = { border: "5px solid", borderColor: "#808080 #FFFFFF #FFFFFF #808080" } as const;

export type Tappe = readonly (readonly [number, Punto])[];

export function Finestra({ titolo, style, children }: { titolo: string; style: CSSProperties; children: ReactNode }) {
  return (
    <div style={{ position: "absolute", background: GRIGIO_FINESTRA, padding: 6, ...RILIEVO, ...style }}>
      <div className="an-testo" style={{ background: BLU_FINESTRA, color: "#FFFFFF", fontSize: 40, padding: "8px 18px", whiteSpace: "nowrap" }}>{titolo}</div>
      {children}
    </div>
  );
}

/** La barra a blocchi: `parte` va da 0 a 1. */
export function Avanzamento({ parte }: { parte: number }) {
  const blocchi = 14;
  return (
    <div style={{ display: "flex", gap: 8, height: 64, padding: 6, background: "#FFFFFF", ...INCASSO }}>
      {Array.from({ length: blocchi }, (_, i) => (
        <div key={i} style={{ flex: 1, background: i < Math.floor(parte * blocchi) ? BLU_FINESTRA : "transparent" }} />
      ))}
    </div>
  );
}

/** Il bottone «OK»: in rilievo, incassato una volta premuto. */
export function Pulsante({ premuto, children }: { premuto: boolean; children: ReactNode }) {
  return (
    <div className="an-testo" style={{ width: 220, margin: "0 auto 20px", fontSize: 40, color: "#000000", textAlign: "center", background: GRIGIO_FINESTRA, ...(premuto ? INCASSO : RILIEVO) }}>
      {children}
    </div>
  );
}

/** Dove sta il puntatore: va da una tappa all'altra (`[quando parte, dove arriva]`) e intanto ondeggia, così non è mai fermo. */
export function doveIlPuntatore(t: number, da: Punto, tappe: Tappe): Punto {
  const fermo = tappe.reduce<Punto>((qui, [parte, arriva]) => {
    const p = tra(t, parte, 0.7, 0, 1, curve.dolce);
    return [qui[0] + (arriva[0] - qui[0]) * p, qui[1] + (arriva[1] - qui[1]) * p];
  }, da);
  return [fermo[0] + Math.sin(t * 2.1) * 9, fermo[1] + Math.cos(t * 1.7) * 7];
}

export function Puntatore({ dove }: { dove: Punto }) {
  return (
    <svg width={46} height={70} viewBox="0 0 23 35" style={{ position: "absolute", left: dove[0], top: dove[1] }}>
      <polygon points="1,1 1,27 7,21 12,33 16,31 11,20 20,20" fill="#FFFFFF" stroke="#000000" strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}
