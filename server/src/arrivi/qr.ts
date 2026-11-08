// Codice QR in SVG, livello di correzione M, modo byte (ISO/IEC 18004). Serve un indirizzo di
// un centinaio di caratteri: scritto qui perché nessuna dipendenza del progetto lo fa.

// Byte di correzione per blocco e numero di blocchi, per versione 1..40 (indice 0 inutilizzato).
const ECC_PER_BLOCCO = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28]
const NUM_BLOCCHI = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49]

function moduliDati(versione: number): number {
  let n = (16 * versione + 128) * versione + 64
  if (versione >= 2) {
    const allineamenti = Math.floor(versione / 7) + 2
    n -= (25 * allineamenti - 10) * allineamenti - 55
    if (versione >= 7) n -= 36
  }
  return n
}

const byteDati = (versione: number): number => Math.floor(moduliDati(versione) / 8) - ECC_PER_BLOCCO[versione]! * NUM_BLOCCHI[versione]!

function moltiplicaGF(x: number, y: number): number {
  let z = 0
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z
}

function divisoreRS(grado: number): number[] {
  const risultato = new Array<number>(grado).fill(0)
  risultato[grado - 1] = 1
  let radice = 1
  for (let i = 0; i < grado; i++) {
    for (let j = 0; j < grado; j++) {
      risultato[j] = moltiplicaGF(risultato[j]!, radice)
      if (j + 1 < grado) risultato[j] = risultato[j]! ^ risultato[j + 1]!
    }
    radice = moltiplicaGF(radice, 0x02)
  }
  return risultato
}

function restoRS(dati: number[], divisore: number[]): number[] {
  const resto = new Array<number>(divisore.length).fill(0)
  for (const b of dati) {
    const fattore = b ^ resto.shift()!
    resto.push(0)
    divisore.forEach((c, i) => {
      resto[i]! ^= moltiplicaGF(c, fattore)
    })
  }
  return resto
}

const bit = (x: number, i: number): boolean => ((x >>> i) & 1) !== 0

function posizioniAllineamento(versione: number, dimensione: number): number[] {
  if (versione === 1) return []
  const n = Math.floor(versione / 7) + 2
  const passo = versione === 32 ? 26 : Math.ceil((versione * 4 + 4) / (n * 2 - 2)) * 2
  const posizioni = [6]
  for (let p = dimensione - 7; posizioni.length < n; p -= passo) posizioni.splice(1, 0, p)
  return posizioni
}

const MASCHERE: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
]

function penalita(m: boolean[][], n: number): number {
  let p = 0
  const trasposta = m[0]!.map((_, x) => m.map((riga) => riga[x]!))
  for (const griglia of [m, trasposta]) {
    for (const riga of griglia) {
      let corsa = 1
      for (let i = 1; i <= n; i++) {
        if (i < n && riga[i] === riga[i - 1]) corsa++
        else {
          if (corsa >= 5) p += corsa - 2
          corsa = 1
        }
      }
      const testo = riga.map((v) => (v ? "1" : "0")).join("")
      for (const schema of ["10111010000", "00001011101"]) {
        for (let da = testo.indexOf(schema); da >= 0; da = testo.indexOf(schema, da + 1)) p += 40
      }
    }
  }
  for (let y = 0; y < n - 1; y++) {
    for (let x = 0; x < n - 1; x++) {
      const c = m[y]![x]
      if (c === m[y]![x + 1] && c === m[y + 1]![x] && c === m[y + 1]![x + 1]) p += 3
    }
  }
  const scuri = m.reduce((s, riga) => s + riga.filter(Boolean).length, 0)
  return p + (Math.ceil(Math.abs(scuri * 20 - n * n * 10) / (n * n)) - 1) * 10
}

/** La matrice del codice: `true` = modulo scuro. */
function matriceQr(testo: string): boolean[][] {
  const byte = [...new TextEncoder().encode(testo)]
  let versione = 1
  while (versione <= 40 && 4 + (versione < 10 ? 8 : 16) + byte.length * 8 > byteDati(versione) * 8) versione++
  if (versione > 40) throw new Error("testo troppo lungo per un codice QR")

  const bits: number[] = []
  const aggiungi = (valore: number, quanti: number) => {
    for (let i = quanti - 1; i >= 0; i--) bits.push((valore >>> i) & 1)
  }
  aggiungi(0b0100, 4)
  aggiungi(byte.length, versione < 10 ? 8 : 16)
  byte.forEach((b) => aggiungi(b, 8))
  const capacita = byteDati(versione) * 8
  aggiungi(0, Math.min(4, capacita - bits.length))
  aggiungi(0, (8 - (bits.length % 8)) % 8)
  for (let pad = 0xec; bits.length < capacita; pad ^= 0xec ^ 0x11) aggiungi(pad, 8)
  const dati = Array.from({ length: bits.length / 8 }, (_, i) => bits.slice(i * 8, i * 8 + 8).reduce((a, b) => (a << 1) | b, 0))

  const blocchi = NUM_BLOCCHI[versione]!
  const ecc = ECC_PER_BLOCCO[versione]!
  const totale = Math.floor(moduliDati(versione) / 8)
  const corti = blocchi - (totale % blocchi)
  const lungBlocco = Math.floor(totale / blocchi)
  const divisore = divisoreRS(ecc)
  const parti: { dati: number[]; ecc: number[] }[] = []
  for (let i = 0, k = 0; i < blocchi; i++) {
    const pezzo = dati.slice(k, k + lungBlocco - ecc + (i < corti ? 0 : 1))
    k += pezzo.length
    parti.push({ dati: pezzo, ecc: restoRS(pezzo, divisore) })
  }
  const tutti: number[] = []
  for (let i = 0; i < lungBlocco - ecc + 1; i++) parti.forEach((p) => i < p.dati.length && tutti.push(p.dati[i]!))
  for (let i = 0; i < ecc; i++) parti.forEach((p) => tutti.push(p.ecc[i]!))

  const n = versione * 4 + 17
  const m = Array.from({ length: n }, () => new Array<boolean>(n).fill(false))
  const funzione = Array.from({ length: n }, () => new Array<boolean>(n).fill(false))
  const fissa = (x: number, y: number, scuro: boolean) => {
    m[y]![x] = scuro
    funzione[y]![x] = true
  }

  for (let i = 0; i < n; i++) {
    fissa(6, i, i % 2 === 0)
    fissa(i, 6, i % 2 === 0)
  }
  for (const [cx, cy] of [[3, 3], [n - 4, 3], [3, n - 4]] as const) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy))
        const x = cx + dx
        const y = cy + dy
        if (x >= 0 && x < n && y >= 0 && y < n) fissa(x, y, d !== 2 && d !== 4)
      }
    }
  }
  const pos = posizioniAllineamento(versione, n)
  pos.forEach((py, i) =>
    pos.forEach((px, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0)) return
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) fissa(px + dx, py + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
    }),
  )
  const formato = (maschera: number) => {
    let resto = maschera
    for (let i = 0; i < 10; i++) resto = (resto << 1) ^ ((resto >>> 9) * 0x537)
    const b = ((maschera << 10) | resto) ^ 0x5412
    for (let i = 0; i <= 5; i++) fissa(8, i, bit(b, i))
    fissa(8, 7, bit(b, 6))
    fissa(8, 8, bit(b, 7))
    fissa(7, 8, bit(b, 8))
    for (let i = 9; i < 15; i++) fissa(14 - i, 8, bit(b, i))
    for (let i = 0; i < 8; i++) fissa(n - 1 - i, 8, bit(b, i))
    for (let i = 8; i < 15; i++) fissa(8, n - 15 + i, bit(b, i))
    fissa(8, n - 8, true)
  }
  formato(0)
  if (versione >= 7) {
    let resto = versione
    for (let i = 0; i < 12; i++) resto = (resto << 1) ^ ((resto >>> 11) * 0x1f25)
    const b = (versione << 12) | resto
    for (let i = 0; i < 18; i++) {
      const a = n - 11 + (i % 3)
      const c = Math.floor(i / 3)
      fissa(a, c, bit(b, i))
      fissa(c, a, bit(b, i))
    }
  }

  let k = 0
  for (let destra = n - 1; destra >= 1; destra -= 2) {
    if (destra === 6) destra = 5
    for (let v = 0; v < n; v++) {
      for (let j = 0; j < 2; j++) {
        const x = destra - j
        const y = ((destra + 1) & 2) === 0 ? n - 1 - v : v
        if (!funzione[y]![x] && k < tutti.length * 8) {
          m[y]![x] = bit(tutti[k >>> 3]!, 7 - (k & 7))
          k++
        }
      }
    }
  }

  const applica = (maschera: number) => {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!funzione[y]![x] && MASCHERE[maschera]!(x, y)) m[y]![x] = !m[y]![x]
  }
  let migliore = 0
  let minima = Infinity
  for (let maschera = 0; maschera < 8; maschera++) {
    applica(maschera)
    formato(maschera)
    const p = penalita(m, n)
    if (p < minima) {
      minima = p
      migliore = maschera
    }
    applica(maschera)
  }
  applica(migliore)
  formato(migliore)
  return m
}

/** Il codice come SVG autonomo: scuro su chiaro, con la fascia bianca intorno che lo rende
 * leggibile anche nel tema scuro. */
export function qrSvg(testo: string): string {
  const m = matriceQr(testo)
  const n = m.length
  const margine = 4
  const tratti = m.flatMap((riga, y) => {
    const out: string[] = []
    for (let x = 0; x < n; x++) {
      if (!riga[x]) continue
      let fine = x
      while (fine + 1 < n && riga[fine + 1]) fine++
      out.push(`M${x + margine} ${y + margine}h${fine - x + 1}v1h-${fine - x + 1}z`)
      x = fine
    }
    return out
  })
  const lato = n + margine * 2
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lato} ${lato}" shape-rendering="crispEdges" role="img" aria-label="Codice QR"><rect width="${lato}" height="${lato}" fill="#fff"/><path d="${tratti.join("")}" fill="#000"/></svg>`
}
