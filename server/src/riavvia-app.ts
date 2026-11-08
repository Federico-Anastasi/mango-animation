// `bun run --cwd server riavvia-app [--ferma] [--exe <percorso>] [--dati <cartella>]`: ferma l'app Mango Animation registrata e la riaccende (`docs/APP.md`).
import { join, resolve } from "node:path"
import { argomentiDi, portaDelServer, riavvia, sistemaVero } from "./riavvio"

try {
  const argomenti = argomentiDi(Bun.argv.slice(2))
  const locale = process.env["LOCALAPPDATA"]
  if (!argomenti.dati && !locale) throw new Error("Non so dove l'app tiene i suoi dati: LOCALAPPDATA manca. Indicala con --dati <cartella>.")
  await riavvia(sistemaVero, {
    dati: argomenti.dati ?? join(locale!, "dev.mango.animation"),
    porta: portaDelServer(process.env["MANGO_ANIMATION_PORTA"]),
    solaChiusura: argomenti.ferma,
    exe: argomenti.exe,
    exePredefinito: join(resolve(import.meta.dir, "..", ".."), "app", "target", "release", "mango-animation.exe"),
    ambiente: process.env,
    scrivi: (riga) => console.log(riga),
  })
  process.exit(0)
} catch (errore) {
  console.error(errore instanceof Error ? errore.message : String(errore))
  process.exit(1)
}
