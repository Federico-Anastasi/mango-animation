import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import { FASCIA } from "./stile";

const campoDi = (f: typeof FASCIA) => ({ left: f.x0, top: f.y0, width: f.x1 - f.x0, height: f.y1 - f.y0 });

export const CAMPO = campoDi(FASCIA);

/** La fascia in cui la scena sta nel video: quella del quadro del suo piano, che la pagina le dà; senza, quella di serie. */
export const ContestoFascia = createContext(FASCIA);

/** La fascia utile del palco: il contenuto di una scena sta qui dentro, centrato in verticale. */
export function Campo({ children }: { children: ReactNode }) {
  return (
    <div className="an-campo" style={campoDi(useContext(ContestoFascia))}>
      {children}
    </div>
  );
}

/** La scatola di un oggetto (un modello, una scheda, un computer). */
export function Scatola({ style, children }: { style?: CSSProperties; children?: ReactNode }) {
  return <div style={{ border: "5px solid var(--inchiostro)", background: "var(--carta-scura)", ...style }}>{children}</div>;
}
