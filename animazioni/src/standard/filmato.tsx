import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { limita } from "../impianto";
import { FORMATO } from "./stile";

// Un filmato dentro una scena: una pagina che si muove (`filmato-<nome>.webm` di `python -m motore pagina`, docs/MOTORE.md, «Le pagine
// vere»), una registrazione dello schermo. Non va da solo: a ogni fotogramma della scena si porta all'istante `t` del filmato, e chi
// registra aspetta che ci sia arrivato (`filmatiAlPosto`), così il fotogramma scritto è sempre quello giusto. Senza suono. In WebM
// (VP9): il browser che registra le scene non legge l'H.264.

/** Il fotogramma `t` (secondi) cade a metà del suo trentesimo: il browser non si ferma su quello prima per un arrotondamento. */
const alFotogramma = (t: number) => (Math.floor(t * FORMATO.fps) + 0.5) / FORMATO.fps;

export function Filmato({ src, t, style }: { src: string; t: number; style?: CSSProperties }) {
  const video = useRef<HTMLVideoElement>(null);
  useLayoutEffect(() => {
    const v = video.current;
    if (!v) return;
    const fine = Number.isFinite(v.duration) ? v.duration - 0.5 / FORMATO.fps : Infinity;
    const voluto = limita(alFotogramma(Math.max(0, t)), 0, fine);
    if (Math.abs(v.currentTime - voluto) > 0.25 / FORMATO.fps) v.currentTime = voluto;
  }, [t]);
  return <video ref={video} src={src} muted playsInline preload="auto" style={{ display: "block", objectFit: "cover", ...style }} />;
}

/** Torna quando ogni filmato della pagina ha caricato ed è fermo sul fotogramma chiesto, e quel fotogramma è disegnato; un filmato che non
 * si legge è un errore, col suo nome. */
export async function filmatiAlPosto(): Promise<void> {
  const filmati = [...document.querySelectorAll("video")];
  if (filmati.length === 0) return;
  await Promise.all(
    filmati.map(async (v) => {
      while (v.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || v.seeking) {
        if (v.error) throw new Error(`il filmato ${v.currentSrc || v.src} non si legge: ${v.error.message || v.error.code}`);
        await new Promise<void>((pronto, rotto) => {
          const smetti = () => {
            v.removeEventListener("loadeddata", fatto);
            v.removeEventListener("seeked", fatto);
            v.removeEventListener("error", guasto);
          };
          const fatto = () => {
            smetti();
            pronto();
          };
          const guasto = () => {
            smetti();
            rotto(new Error(`il filmato ${v.currentSrc || v.src} non si legge: ${v.error?.message || v.error?.code}`));
          };
          v.addEventListener("loadeddata", fatto);
          v.addEventListener("seeked", fatto);
          v.addEventListener("error", guasto);
        });
      }
    }),
  );
  await new Promise<void>((disegnato) => requestAnimationFrame(() => requestAnimationFrame(() => disegnato())));
}
