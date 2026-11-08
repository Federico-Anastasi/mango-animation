import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { registro } from "./catalogo";
import type { DalMontaggio } from "./globale";
import { decimali, impostaLingua, limita, palcoDi, type Tempi } from "./impianto";
import { filmatiAlPosto } from "./standard/filmato";
import { ContestoFascia } from "./standard/palco";
import { FASCIA, fasciaDi } from "./standard/stile";

const PASSO = 0.5;
const parametri = new URLSearchParams(window.location.search);

export function Animazioni() {
  const id = parametri.get("animazione") ?? Object.keys(registro.scene)[0] ?? "";
  const voce = registro.scene[id];
  const scena = voce?.scena;
  const palco = palcoDi(voce ? registro.videos[voce.slug]?.formato : undefined);
  const fisso = parametri.has("t") ? Number(parametri.get("t")) : null;
  const [dati, setDati] = useState<DalMontaggio | null>(null);
  // Una scena che scorre al passo del video dura quanto il suo tratto di montaggio; le altre durano quanto dicono.
  const durata = scena?.tempi && dati ? dati.durata : (scena?.durata ?? 0);
  const tempi: Tempi = { ...scena?.tempi, ...dati?.tempi };
  const fasciaDelQuadro = useMemo(() => (scena?.quadro ? fasciaDi(scena.quadro) : undefined), [scena]);
  const fascia = dati?.fascia ? { x0: dati.fascia[0], y0: dati.fascia[1], x1: dati.fascia[2], y1: dati.fascia[3] } : (fasciaDelQuadro ?? FASCIA);
  const [tempo, setTempo] = useState(limita(fisso ?? 0, 0, durata));
  const [inCorso, setInCorso] = useState(fisso === null);
  const vai = useCallback((t: number) => setTempo(limita(t, 0, durata)), [durata]);
  const alterna = useCallback(() => {
    if (tempo >= durata) {
      setTempo(0);
      setInCorso(true);
    } else setInCorso((c) => !c);
  }, [tempo, durata]);

  // L'unico requestAnimationFrame dell'impianto: fa scorrere il tempo, che poi disegna tutto.
  useEffect(() => {
    if (!inCorso) return;
    let ultimo = performance.now();
    let giro = 0;
    const avanza = (adesso: number) => {
      const passato = (adesso - ultimo) / 1000;
      ultimo = adesso;
      setTempo((t) => Math.min(durata, t + passato));
      giro = requestAnimationFrame(avanza);
    };
    giro = requestAnimationFrame(avanza);
    return () => cancelAnimationFrame(giro);
  }, [inCorso, durata]);
  useEffect(() => {
    if (inCorso && tempo >= durata) setInCorso(false);
  }, [inCorso, tempo, durata]);

  const durataAttuale = useRef(durata);
  useLayoutEffect(() => {
    durataAttuale.current = durata;
  }, [durata]);
  useEffect(() => {
    window.animazione = {
      vai: async (t) => {
        flushSync(() => setTempo(limita(t, 0, durataAttuale.current)));
        await filmatiAlPosto();
      },
      imposta: (nuovi) => {
        impostaLingua(nuovi.lingua ?? "it");
        flushSync(() => setDati(nuovi));
      },
      durata: scena?.durata ?? 0,
      fotogrammi: scena?.fotogrammi ?? [],
      fascia: scena?.fascia ?? (fasciaDelQuadro && [fasciaDelQuadro.x0, fasciaDelQuadro.y0, fasciaDelQuadro.x1, fasciaDelQuadro.y1]),
    };
    return () => {
      delete window.animazione;
    };
  }, [scena, fasciaDelQuadro]);

  useEffect(() => {
    if (fisso !== null) return;
    const tasto = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === " ") alterna();
      else if (e.key === "ArrowRight") vai(tempo + PASSO);
      else if (e.key === "ArrowLeft") vai(tempo - PASSO);
      else if (e.key === "Home") vai(0);
      else if (e.key === "End") vai(durata);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", tasto);
    return () => window.removeEventListener("keydown", tasto);
  }, [fisso, tempo, durata, vai, alterna]);

  const area = useRef<HTMLElement>(null);
  const [scala, setScala] = useState(0);
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const leggi = () => setScala(Math.min(el.clientWidth / palco.larghezza, el.clientHeight / palco.altezza));
    leggi();
    const osservatore = new ResizeObserver(leggi);
    osservatore.observe(el);
    return () => osservatore.disconnect();
  }, [palco.larghezza, palco.altezza]);

  return (
    <div className="pagina" data-registra={fisso !== null ? "" : undefined}>
      <main className="area" ref={area}>
        {scala > 0 && (
          <div className="cornice" style={{ width: palco.larghezza * scala, height: palco.altezza * scala }}>
            <div className="palco" style={{ width: palco.larghezza, height: palco.altezza, transform: `scale(${scala})` }}>
              {scena ? (
                <ContestoFascia.Provider value={fascia}>
                  <scena.Componente t={tempo} tempi={tempi} lingua={dati?.lingua ?? "it"} />
                </ContestoFascia.Provider>
              ) : <p className="an-vuoto">La scena «{id}» non è ancora disegnata.</p>}
            </div>
          </div>
        )}
      </main>
      {fisso === null && (
        <div className="an-barra">
          <div className="an-riga">
            {Object.entries(registro.videos).map(([slug, video]) => (
              <a key={slug} href={`?animazione=${Object.keys(video.scene)[0]}`} aria-current={slug === voce?.slug ? "page" : undefined}>
                {video.titolo}
              </a>
            ))}
          </div>
          <div className="an-riga">
            {Object.keys((voce ? registro.videos[voce.slug] : undefined)?.scene ?? {}).map((altra) => (
              <a key={altra} href={`?animazione=${altra}`} aria-current={altra === id ? "page" : undefined}>
                {altra.toUpperCase()}
              </a>
            ))}
            <strong>{scena?.titolo}</strong>
            <button onClick={() => vai(tempo - PASSO)}>−0,5 s</button>
            <button onClick={alterna}>{inCorso ? "Pausa" : "Avvia"}</button>
            <button onClick={() => vai(tempo + PASSO)}>+0,5 s</button>
            <span className="num">
              {decimali(tempo, 1)} / {decimali(durata, 1)} s
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
