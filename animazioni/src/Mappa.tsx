import { registro } from "./catalogo";

/** La mappa da tenere davanti mentre si registra: una riga per punto del video, tre appigli per riga. Pagina ferma, 1920×1080. */
export function Mappa({ slug }: { slug: string }) {
  const video = registro.videos[slug];
  if (!video) return <p className="an-vuoto">Il video «{slug}» non c’è.</p>;
  return (
    <div className="mappa">
      <div className="mappa-titolo an-etichetta">{video.titolo}</div>
      {Object.entries(video.scene).map(([sigla, scena], i) => (
        <div key={sigla} className="mappa-riga">
          <span className="an-num mappa-numero">{i + 1}</span>
          {scena.parole.map((appiglio) => {
            const [parole, nota] = typeof appiglio === "string" ? [appiglio] : appiglio;
            return (
              <span key={parole} className="an-testo mappa-parola">
                {parole}
                {nota && <small className="an-etichetta">{nota}</small>}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
