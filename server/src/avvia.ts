// `bun run avvia` (con `--apri` apre anche il browser). Si chiude con Ctrl+C.
import { apriNelBrowser } from "./configurazione"
import { legaIFigliAlProcesso } from "./figli"
import { creaServer } from "./server"

const indirizzo = (porta: number): string => `http://127.0.0.1:${porta}`

try {
  legaIFigliAlProcesso()
} catch (errore) {
  console.error(errore instanceof Error ? errore.message : String(errore))
}

let server: Awaited<ReturnType<typeof creaServer>>
try {
  server = await creaServer()
} catch (errore) {
  const occupata = (errore as NodeJS.ErrnoException).code === "EADDRINUSE" || /in use|EADDRINUSE/i.test(String(errore))
  console.error(
    occupata
      ? "La porta di Mango Animation è già in uso: forse il server è già acceso (apri http://127.0.0.1:47431), oppure scegli un'altra porta con MANGO_ANIMATION_PORTA."
      : `Il server non parte: ${errore instanceof Error ? errore.message : String(errore)}`,
  )
  process.exit(1)
}

// Il link con la chiave si scrive solo in un terminale: l'app tiene l'uscita del server in un file di registro, e lì la chiave non deve finire.
const ingresso = `${indirizzo(server.porta)}/entra?chiave=${encodeURIComponent(server.chiaveApi)}`
console.log(`Mango Animation: ${indirizzo(server.porta)}`)
if (process.stdout.isTTY) console.log(`Per aprirla nel browser: ${ingresso}`)
const arrivi = server.ricevitore.stato()
console.log(
  !arrivi.acceso
    ? "Arrivi dal telefono: spenti finché non si collega un telefono (Girato)."
    : arrivi.in_ascolto
      ? `Arrivi dal telefono: ${arrivi.indirizzo ?? `porta ${server.portaArrivi}`}`
      : `Arrivi dal telefono spenti: ${arrivi.errore}`,
)
if (process.argv.includes("--apri")) apriNelBrowser(ingresso)

let inChiusura = false
const chiudi = async (): Promise<void> => {
  if (inChiusura) return
  inChiusura = true
  await server.ferma()
  process.exit(0)
}
// Su Windows Ctrl+C è SIGINT, Ctrl+Interr è SIGBREAK e la finestra della console che si chiude è SIGHUP.
for (const segnale of ["SIGINT", "SIGBREAK", "SIGTERM", "SIGHUP"] as const) process.on(segnale, chiudi)
