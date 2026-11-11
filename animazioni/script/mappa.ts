// Salva la mappa per registrare di un video in mappe/mappa-<slug>.png (1920×1080).
// Uso: bun run mappa -- <slug> [slug ...]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { caricaRegistro } from "./catalogo";
import { assicuraCostruita, RADICE, servi } from "./comune";
import { dice } from "./lingua";

async function main() {
  const slugs = Bun.argv.slice(2);
  const registro = await caricaRegistro();
  const elenco = Object.keys(registro.videos).join(", ");
  if (!slugs.length) throw new Error(dice(`Manca il video. Si usa: mappa <slug> [slug ...]. I video sono: ${elenco}.`, `The video is missing. Usage: mappa <slug> [slug ...]. The videos are: ${elenco}.`));
  const mancanti = slugs.filter((s) => !registro.videos[s]);
  if (mancanti.length) throw new Error(dice(`Non esiste un video «${mancanti.join("», «")}». I video sono: ${elenco}.`, `There is no video «${mancanti.join("», «")}». The videos are: ${elenco}.`));
  await assicuraCostruita();
  const uscita = join(RADICE, "mappe");
  mkdirSync(uscita, { recursive: true });

  const server = servi();
  const browser = await chromium.launch();
  try {
    const pagina = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    for (const slug of slugs) {
      await pagina.goto(`http://127.0.0.1:${server.port}/?mappa=${encodeURIComponent(slug)}`);
      await pagina.waitForSelector(".mappa-riga");
      await pagina.evaluate(() => document.fonts.ready);
      const file = join(uscita, `mappa-${slug}.png`);
      await pagina.screenshot({ path: file });
      console.log(file);
    }
  } finally {
    await browser.close();
    await server.stop(true);
  }
}

main().catch((errore: unknown) => {
  console.error(errore instanceof Error ? errore.message : String(errore));
  process.exit(1);
});
