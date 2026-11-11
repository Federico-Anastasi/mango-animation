// Il Google Chrome del computer, pilotato con Playwright (`pagina.mjs`, `carosello.mjs`). Se non c'è, lo dice con una frase e si ferma.
import { chromium } from "../studio/node_modules/@playwright/test/index.mjs";

export async function apriChrome(opzioni = {}) {
  try {
    return await chromium.launch({ channel: "chrome", ...opzioni });
  } catch (errore) {
    console.error(`manca Google Chrome, che serve a questo strumento: installalo da google.com/chrome (${String(errore.message).split("\n")[0]})`);
    process.exit(3);
  }
}
