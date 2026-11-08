import { TITOLO } from "./stile";

/** Il titolo del video, come lo mette il montaggio: scritta verde su fondo nero, nel posto che dice il quadro. */
export function Titolo({ testo }: { testo: string }) {
  return (
    <div style={{ position: "absolute", left: TITOLO.x, top: TITOLO.y, transform: "translate(-50%, -50%)", width: "max-content", maxWidth: TITOLO.largo, padding: TITOLO.margine, background: `var(--${TITOLO.fondo})`, color: `var(--${TITOLO.colore})`, borderRadius: TITOLO.raggio, fontFamily: `"Titolo", sans-serif`, fontWeight: 500, fontSize: TITOLO.corpo, lineHeight: 1.1, textAlign: "center", textTransform: TITOLO.maiuscolo ? "uppercase" : "none" }}>
      {testo}
    </div>
  );
}
