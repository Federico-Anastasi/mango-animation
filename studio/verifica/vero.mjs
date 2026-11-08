// Foto dell'interfaccia sul server vero: node verifica/vero.mjs <cartella> <larghezza> <rotta...>
// Il server vuole la chiave della cartella di lavoro (MANGO_ANIMATION_LAVORO): entra da /entra, che mette il cookie, come l'app.
import { chromium } from "playwright";
import { entra } from "./chiave.mjs";
const [cartella, larghezza, ...rotte] = process.argv.slice(2);
const porta = process.env.MANGO_ANIMATION_PORTA ?? "47431";
const browser = await chromium.launch();
const pagina = await browser.newPage({ viewport: { width: Number(larghezza), height: 900 } });
await entra(pagina, `http://127.0.0.1:${porta}`);
const errori = [];
pagina.on("console", (m) => m.type() === "error" && errori.push(m.text()));
pagina.on("pageerror", (e) => errori.push(e.message));
for (const rotta of rotte) {
  await pagina.goto(`http://127.0.0.1:${porta}/#/${rotta}`);
  await pagina.waitForTimeout(2500);
  await pagina.screenshot({ path: `${cartella}/${rotta.replace(/[^a-z0-9-]+/gi, "_")}-${larghezza}.png`, fullPage: true });
}
console.log(errori.length ? errori.slice(0, 15).join("\n") : "nessun errore in console");
await browser.close();
