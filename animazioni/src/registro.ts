import type { Scena, Video } from "./impianto";

export interface ModuloVideo {
  video: Video;
}

export interface Registro {
  /** I video per slug (il nome della cartella in `scene/`). */
  videos: Readonly<Record<string, Video>>;
  /** Ogni scena per sigla, col video a cui appartiene. */
  scene: Readonly<Record<string, { slug: string; scena: Scena }>>;
}

const PERCORSO = /(?:^|[\\/])scene[\\/]([^\\/]+)[\\/]scene\.tsx$/;

/** Mette in fila i moduli `scene/<slug>/scene.tsx`: un video è una cartella, non c'è un elenco da tenere. */
export function costruisciRegistro(moduli: Readonly<Record<string, ModuloVideo>>): Registro {
  const videos: Record<string, Video> = {};
  const scene: Record<string, { slug: string; scena: Scena }> = {};
  for (const [percorso, modulo] of Object.entries(moduli).sort(([a], [b]) => a.localeCompare(b))) {
    const slug = PERCORSO.exec(percorso)?.[1];
    if (!slug) throw new Error(`«${percorso}» non è una scena di un video: i video stanno in scene/<slug>/scene.tsx`);
    if (videos[slug]) throw new Error(`Il video «${slug}» è in due cartelle: i video del prodotto e quelli del creator non possono avere lo stesso nome`);
    videos[slug] = modulo.video;
    for (const [sigla, scena] of Object.entries(modulo.video.scene)) {
      const altro = scene[sigla];
      if (altro) throw new Error(`La sigla «${sigla}» è in due video: «${altro.slug}» e «${slug}»`);
      scene[sigla] = { slug, scena };
    }
  }
  return { videos, scene };
}
