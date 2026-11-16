// `suite/` è la stessa cartella in ogni app Mango: chi la cambia la cambia in tutte, e solo allora aggiorna qui l'impronta.
import { expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"

const REPO = resolve(import.meta.dir, "..", "..")
const SUITE = join(REPO, "suite")
const IMPRONTA = "40eebf7cb49748ed2d3e62390d91ebc6c88c397f5396dadd7176df767219ea68"
const TESTO = /\.(css|svg|txt|md)$/

test("suite/ è com'è stata scritta l'ultima volta che è cambiata in tutte le app", () => {
  const file = readdirSync(SUITE, { recursive: true, withFileTypes: true })
    .filter((voce) => voce.isFile())
    .map((voce) => join(voce.parentPath, voce.name).slice(SUITE.length + 1).replaceAll("\\", "/"))
    .sort()
  const impronta = new Bun.CryptoHasher("sha256")
  for (const nome of file) {
    const contenuto = readFileSync(join(SUITE, nome))
    // Un file di testo ha la stessa impronta con gli a capo di Windows e con quelli di Linux.
    impronta.update(`${nome}\n`).update(TESTO.test(nome) ? contenuto.toString("utf8").replaceAll("\r\n", "\n") : contenuto)
  }
  expect(impronta.digest("hex")).toBe(IMPRONTA)
})

test("i fogli di stile dello studio e delle pagine dell'app non scrivono colori: li prendono dai nomi di suite/tokens.css", () => {
  const fogli = [...new Bun.Glob("studio/src/**/*.css").scanSync({ cwd: REPO }), "app/ui/stile.css"].map((f) => f.replaceAll("\\", "/")).sort()
  const aMano = fogli.flatMap((foglio) =>
    readFileSync(join(REPO, foglio), "utf8")
      .split("\n")
      .filter((riga) => /#[0-9a-f]{3,8}\b|\b(rgb|hsl)a?\(/i.test(riga))
      .map((riga) => `${foglio}: ${riga.trim()}`),
  )
  // Un codice QR si legge solo su fondo bianco, in ogni tema.
  expect(aMano).toEqual(["studio/src/comuni/GuardaDalTelefono.module.css: background: #fff;", "studio/src/impostazioni/RiquadroArrivi.module.css: background: #fff;"])
})

test("le pagine che il server manda al telefono non scrivono colori: li prendono dai nomi di suite/tokens.css", () => {
  const sorgenti = ["server/src/media.ts", "server/src/accesso.ts", ...new Bun.Glob("server/src/arrivi/{pagine,pagina,carica,guarda,studio}.ts").scanSync({ cwd: REPO })].map((f) => f.replaceAll("\\", "/")).sort()
  const aMano = sorgenti.flatMap((sorgente) =>
    readFileSync(join(REPO, sorgente), "utf8")
      .split("\n")
      .filter((riga) => /#[0-9a-f]{3,8}\b|\b(rgb|hsl)a?\(|--(carta|scura|inchiostro|rosso|grigio|filo)\b/i.test(riga))
      .map((riga) => `${sorgente}: ${riga.trim()}`),
  )
  expect(aMano).toEqual([])
})
