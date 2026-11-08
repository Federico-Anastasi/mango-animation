import { costruisciRegistro, type ModuloVideo } from "./registro";

export const registro = costruisciRegistro({
  ...import.meta.glob<ModuloVideo>("./scene/*/scene.tsx", { eager: true }),
  ...import.meta.glob<ModuloVideo>("@scene-del-creator/*/scene.tsx", { eager: true }),
});
