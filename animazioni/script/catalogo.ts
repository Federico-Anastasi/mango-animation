import { Glob } from "bun";
import { pathToFileURL } from "node:url";
import { costruisciRegistro, type ModuloVideo, type Registro } from "../src/registro";
import { lavoroDa, SRC, sceneDelCreator } from "./percorsi";

/** Le scene lette da Bun, con lo stesso registro che la pagina costruisce da `import.meta.glob`: quelle del prodotto e quelle del creator. */
export async function caricaRegistro(src = SRC, creator: string | null = sceneDelCreator(lavoroDa()) ?? null): Promise<Registro> {
  const moduli: Record<string, ModuloVideo> = {};
  const cartelle = [{ cwd: `${src}/scene`.replaceAll("\\", "/") }, ...(creator ? [{ cwd: creator }] : [])];
  for (const { cwd } of cartelle)
    for await (const file of new Glob("*/scene.tsx").scan({ cwd, absolute: true }))
      moduli[file] = (await import(pathToFileURL(file).href)) as ModuloVideo;
  return costruisciRegistro(moduli);
}
