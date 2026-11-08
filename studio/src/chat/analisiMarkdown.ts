// Il markdown di Claude letto in un albero, senza HTML: titoli, elenchi, tabelle, codice, citazioni, enfasi, collegamenti.
// Un testo scritto a metà (un blocco di codice non chiuso) si legge comunque: serve mentre arriva a pezzi.

export type Inline =
  | { tipo: "testo"; testo: string }
  | { tipo: "codice"; testo: string }
  | { tipo: "forte"; figli: Inline[] }
  | { tipo: "corsivo"; figli: Inline[] }
  | { tipo: "barrato"; figli: Inline[] }
  | { tipo: "collegamento"; href: string; figli: Inline[] }
  | { tipo: "a-capo" }

export interface VoceElenco {
  /** `null` se non è una casella; altrimenti spuntata o no. */
  casella: boolean | null
  blocchi: Blocco[]
}

export type Blocco =
  | { tipo: "titolo"; livello: number; figli: Inline[] }
  | { tipo: "paragrafo"; figli: Inline[] }
  | { tipo: "elenco"; ordinato: boolean; inizio: number; voci: VoceElenco[] }
  | { tipo: "codice"; lingua: string; testo: string }
  | { tipo: "citazione"; blocchi: Blocco[] }
  | { tipo: "tabella"; testa: Inline[][]; righe: Inline[][][]; allineamento: Array<"sinistra" | "centro" | "destra" | null> }
  | { tipo: "linea" }

const RE_VOCE = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/
const RE_RECINTO = /^\s*(`{3,}|~{3,})\s*([\w+#.-]*)\s*$/
const RE_TITOLO = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/
const RE_LINEA = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/
const RE_SEPARATORE_TABELLA = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/

const rientro = (riga: string): number => riga.length - riga.trimStart().length

function celle(riga: string): string[] {
  let r = riga.trim()
  if (r.startsWith("|")) r = r.slice(1)
  if (r.endsWith("|") && !r.endsWith("\\|")) r = r.slice(0, -1)
  const fuori: string[] = []
  let corrente = ""
  for (let i = 0; i < r.length; i++) {
    const c = r[i]!
    if (c === "\\" && r[i + 1] === "|") {
      corrente += "|"
      i++
    } else if (c === "|") {
      fuori.push(corrente.trim())
      corrente = ""
    } else corrente += c
  }
  fuori.push(corrente.trim())
  return fuori
}

const iniziaBlocco = (riga: string): boolean => RE_RECINTO.test(riga) || RE_TITOLO.test(riga) || RE_VOCE.test(riga) || /^\s{0,3}>/.test(riga) || RE_LINEA.test(riga)

export function leggiBlocchi(testo: string): Blocco[] {
  const righe = testo.replace(/\r\n?/g, "\n").split("\n")
  const blocchi: Blocco[] = []
  let i = 0
  while (i < righe.length) {
    const riga = righe[i]!
    if (riga.trim() === "") {
      i++
      continue
    }
    const recinto = RE_RECINTO.exec(riga)
    if (recinto) {
      const segno = recinto[1]!
      const corpo: string[] = []
      i++
      while (i < righe.length && !new RegExp(`^\\s*${segno[0]}{${segno.length},}\\s*$`).test(righe[i]!)) corpo.push(righe[i++]!)
      i++
      blocchi.push({ tipo: "codice", lingua: recinto[2] ?? "", testo: corpo.join("\n") })
      continue
    }
    const titolo = RE_TITOLO.exec(riga)
    if (titolo) {
      blocchi.push({ tipo: "titolo", livello: titolo[1]!.length, figli: leggiInline(titolo[2]!) })
      i++
      continue
    }
    if (RE_LINEA.test(riga)) {
      blocchi.push({ tipo: "linea" })
      i++
      continue
    }
    if (/^\s{0,3}>/.test(riga)) {
      const corpo: string[] = []
      while (i < righe.length && /^\s{0,3}>/.test(righe[i]!)) corpo.push(righe[i++]!.replace(/^\s{0,3}>\s?/, ""))
      blocchi.push({ tipo: "citazione", blocchi: leggiBlocchi(corpo.join("\n")) })
      continue
    }
    if (riga.includes("|") && i + 1 < righe.length && RE_SEPARATORE_TABELLA.test(righe[i + 1]!) && righe[i + 1]!.includes("-")) {
      const testa = celle(riga)
      const allineamento = celle(righe[i + 1]!).map((c) => (c.startsWith(":") && c.endsWith(":") ? ("centro" as const) : c.endsWith(":") ? ("destra" as const) : c.startsWith(":") ? ("sinistra" as const) : null))
      const corpo: string[][] = []
      i += 2
      while (i < righe.length && righe[i]!.trim() !== "" && righe[i]!.includes("|")) corpo.push(celle(righe[i++]!))
      blocchi.push({
        tipo: "tabella",
        testa: testa.map(leggiInline),
        righe: corpo.map((r) => testa.map((_, k) => leggiInline(r[k] ?? ""))),
        allineamento: testa.map((_, k) => allineamento[k] ?? null),
      })
      continue
    }
    const voce = RE_VOCE.exec(riga)
    if (voce) {
      const base = voce[1]!.length
      const ordinato = /\d/.test(voce[2]!)
      const voci: VoceElenco[] = []
      const inizio = ordinato ? Number.parseInt(voce[2]!, 10) : 1
      while (i < righe.length) {
        const questa = RE_VOCE.exec(righe[i]!)
        if (!questa || questa[1]!.length > base + 1 || questa[1]!.length < base || /\d/.test(questa[2]!) !== ordinato) break
        const corpo: string[] = [questa[3]!]
        const spazio = questa[1]!.length + questa[2]!.length + 1
        i++
        while (i < righe.length) {
          const prossima = righe[i]!
          if (prossima.trim() === "") {
            const dopo = righe[i + 1]
            if (dopo !== undefined && dopo.trim() !== "" && rientro(dopo) > base) {
              corpo.push("")
              i++
              continue
            }
            break
          }
          const eVoce = RE_VOCE.exec(prossima)
          if (eVoce && eVoce[1]!.length <= base + 1) break
          if (rientro(prossima) <= base && iniziaBlocco(prossima)) break
          corpo.push(rientro(prossima) > base ? prossima.slice(Math.min(rientro(prossima), spazio)) : prossima.trimStart())
          i++
        }
        const casella = /^\[([ xX])\]\s+/.exec(corpo[0]!)
        if (casella) corpo[0] = corpo[0]!.slice(casella[0].length)
        voci.push({ casella: casella ? casella[1] !== " " : null, blocchi: leggiBlocchi(corpo.join("\n")) })
      }
      blocchi.push({ tipo: "elenco", ordinato, inizio, voci })
      continue
    }
    const paragrafo: string[] = [riga]
    i++
    while (i < righe.length && righe[i]!.trim() !== "" && !iniziaBlocco(righe[i]!) && !(righe[i]!.includes("|") && i + 1 < righe.length && RE_SEPARATORE_TABELLA.test(righe[i + 1]!))) paragrafo.push(righe[i++]!)
    blocchi.push({ tipo: "paragrafo", figli: leggiInline(paragrafo.join("\n")) })
  }
  return blocchi
}

const SCHEMI_SICURI = /^(https?:|mailto:|#|\/)/i

/** Un collegamento si apre solo se è web, posta, interno alla pagina o relativo: mai `javascript:` e simili. */
export const indirizzoSicuro = (href: string): boolean => SCHEMI_SICURI.test(href.trim())

export function leggiInline(testo: string): Inline[] {
  const fuori: Inline[] = []
  let parziale = ""
  const vuota = () => {
    if (parziale) fuori.push({ tipo: "testo", testo: parziale })
    parziale = ""
  }
  let i = 0
  while (i < testo.length) {
    const c = testo[i]!
    if (c === "\\" && i + 1 < testo.length && /[\\`*_{}[\]()#+\-.!|~>]/.test(testo[i + 1]!)) {
      parziale += testo[i + 1]
      i += 2
      continue
    }
    if (c === "\n") {
      vuota()
      fuori.push({ tipo: "a-capo" })
      i++
      continue
    }
    if (c === "`") {
      let n = 1
      while (testo[i + n] === "`") n++
      const chiusura = testo.indexOf("`".repeat(n), i + n)
      if (chiusura > 0) {
        vuota()
        fuori.push({ tipo: "codice", testo: testo.slice(i + n, chiusura).replace(/^ (.*) $/, "$1") })
        i = chiusura + n
        continue
      }
    }
    if (c === "[") {
      const m = /^\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/.exec(testo.slice(i))
      if (m) {
        vuota()
        fuori.push({ tipo: "collegamento", href: m[2]!, figli: leggiInline(m[1]!) })
        i += m[0].length
        continue
      }
    }
    if (c === "*" || c === "_" || c === "~") {
      const doppio = testo[i + 1] === c
      const lunghezza = doppio ? 2 : 1
      if (!(c === "~" && !doppio) && !(c === "_" && i > 0 && /\w/.test(testo[i - 1]!))) {
        const segno = c.repeat(lunghezza)
        const apre = testo[i + lunghezza]
        if (apre !== undefined && !/\s/.test(apre)) {
          let fine = testo.indexOf(segno, i + lunghezza)
          while (fine > 0 && (/\s/.test(testo[fine - 1]!) || (c === "_" && /\w/.test(testo[fine + lunghezza] ?? "")))) fine = testo.indexOf(segno, fine + 1)
          if (fine > i + lunghezza) {
            vuota()
            const figli = leggiInline(testo.slice(i + lunghezza, fine))
            fuori.push(c === "~" ? { tipo: "barrato", figli } : doppio ? { tipo: "forte", figli } : { tipo: "corsivo", figli })
            i = fine + lunghezza
            continue
          }
        }
      }
    }
    const web = c === "h" ? /^https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/.exec(testo.slice(i)) : null
    if (web) {
      vuota()
      fuori.push({ tipo: "collegamento", href: web[0], figli: [{ tipo: "testo", testo: web[0] }] })
      i += web[0].length
      continue
    }
    parziale += c
    i++
  }
  vuota()
  return fuori
}
