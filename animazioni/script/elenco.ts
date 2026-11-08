import { caricaRegistro } from "./catalogo";

const registro = await caricaRegistro();
const elenco = Object.fromEntries(
  Object.entries(registro.videos).map(([slug, video]) => [slug, Object.entries(video.scene).map(([sigla, scena]) => ({ sigla, titolo: scena.titolo, durata: scena.durata }))]),
);
console.log(JSON.stringify(elenco));
