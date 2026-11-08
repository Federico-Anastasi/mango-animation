// Dove il testo di Claude dà un tempo che il creator aspetta («circa 3 minuti», «~40 s», «verso le 15:42»), in italiano e in inglese.
// Una durata senza altro («fatto in 6 minuti», «un video di 40 secondi») è un fatto, non un'attesa: si segna solo se è approssimata
// o se la frase parla di ciò che manca.

export interface Frammento {
  testo: string
  stima: boolean
}

const LC = String.raw`\p{L}\p{N}`
const NUMERO = String.raw`\d+(?:[.,]\d+)?`
const UNITA = String.raw`(?:secondi|secondo|seconds?|secs?|s|minuti|minuto|minutes?|mins?|ore|ora|hours?|hrs?|hr|h)(?![${LC}])`
const DURATA = String.raw`(?<!\d[.,:])${NUMERO}(?:\s*(?:-|–|—|e|o|a|to|or)\s*${NUMERO})?\s*${UNITA}(?:\s+${NUMERO}\s*${UNITA})*`
const PAROLE_APPROSSIMATE = String.raw`(?:qualche\s+(?:secondo|secondi|minuto|minuti|ora|ore)|un\s+paio\s+di\s+(?:secondi|minuti|ore)|una\s+decina\s+di\s+(?:secondi|minuti)|mezz['’]?\s?ora|mezzora|un\s+quarto\s+d['’]ora|un['’]oretta|a\s+(?:couple\s+of|few)\s+(?:seconds|minutes|hours)|half\s+an\s+hour)`
const PAROLE_DA_CONTESTO = String.raw`(?:un['’]ora|un\s+minuto|an\s+hour|a\s+minute)(?![${LC}])`
const APPROSSIMAZIONE = String.raw`(?:circa|~|≈|più\s+o\s+meno|all['’]incirca|intorno\s+a|almeno|al\s+massimo|meno\s+di|oltre|fino\s+a|about|around|roughly|approximately|approx\.?|less\s+than|up\s+to|at\s+least|over|nearly|almost)`
const CODA = String.raw`(?:\s+(?:circa|più\s+o\s+meno|ancora|di\s+attesa|or\s+so|or\s+less|left|remaining)(?![${LC}]))`
const PASSATO = String.raw`(?!\s+(?:fa|ago)(?![${LC}]))`

const DURATE = new RegExp(
  String.raw`(?<![${LC}])(?<pre>${APPROSSIMAZIONE}\s*)?(?:(?<appr>${PAROLE_APPROSSIMATE}(?![${LC}]))|(?<contesto>${PAROLE_DA_CONTESTO})|(?<durata>${DURATA}))(?<coda>${CODA})?${PASSATO}`,
  "giu",
)

const ORA_MINUTI = String.raw`(?<ora>\d{1,2})[:.](?<minuti>\d{2})(?![${LC}]|[:.]\d)(?:\s?[ap]\.?m\.?(?![${LC}]))?`
const ORARIO_SICURO = new RegExp(String.raw`(?<![${LC}:.])(?:(?:verso|intorno|attorno|entro|fino)\s+(?:le|alle)|around|by|until|about)\s+${ORA_MINUTI}`, "giu")
const ORARIO_DA_CONTESTO = new RegExp(String.raw`(?<![${LC}:.])(?:alle|at|ore)\s+${ORA_MINUTI}`, "giu")

const ATTESA = new RegExp(
  String.raw`(?<![${LC}])(?:ci\s+(?:vuole|vogliono|vorr\w+|mette|metterà)|serv(?:e|ono|iranno)|manc(?:a|ano|heranno)|durerà|dureranno|impieg(?:a|herà)|finisce|finirà|termina|terminerà|ancora|attesa|aspett\w+|stim\w+|prevista?|tra|fra|entro|will\s+take|takes|should\s+take|going\s+to\s+take|ETA|remaining|wait|within)(?![${LC}])`,
  "iu",
)

const FINESTRA = 48

/** Ciò che la frase dice poco prima: se parla di ciò che manca, la durata è un'attesa. */
function parlaDiAttesa(testo: string, prima: number): boolean {
  const finestra = testo.slice(Math.max(0, prima - FINESTRA), prima)
  const ultima = [...finestra.matchAll(/[.!?;](?:\s|$)|\n/g)].at(-1)
  return ATTESA.test(ultima ? finestra.slice(ultima.index + ultima[0].length) : finestra)
}

const orarioValido = (ora: string | undefined, minuti: string | undefined): boolean => Number(ora) <= 24 && Number(minuti) <= 59

interface Tratto {
  da: number
  a: number
}

function trattiDi(testo: string): Tratto[] {
  const tratti: Tratto[] = []
  for (const m of testo.matchAll(DURATE)) {
    const g = m.groups ?? {}
    if (g["pre"] || g["appr"] || g["coda"] || parlaDiAttesa(testo, m.index)) tratti.push({ da: m.index, a: m.index + m[0].length })
  }
  for (const m of testo.matchAll(ORARIO_SICURO)) {
    if (orarioValido(m.groups?.["ora"], m.groups?.["minuti"])) tratti.push({ da: m.index, a: m.index + m[0].length })
  }
  for (const m of testo.matchAll(ORARIO_DA_CONTESTO)) {
    if (orarioValido(m.groups?.["ora"], m.groups?.["minuti"]) && parlaDiAttesa(testo, m.index)) tratti.push({ da: m.index, a: m.index + m[0].length })
  }
  return tratti.sort((x, y) => x.da - y.da)
}

/** Il testo a frammenti in ordine: quelli che dicono un tempo atteso sono `stima`. Rimessi insieme danno il testo di prima. */
export function dividiStime(testo: string): Frammento[] {
  const frammenti: Frammento[] = []
  let fine = 0
  for (const t of trattiDi(testo)) {
    if (t.da < fine) continue
    if (t.da > fine) frammenti.push({ testo: testo.slice(fine, t.da), stima: false })
    frammenti.push({ testo: testo.slice(t.da, t.a), stima: true })
    fine = t.a
  }
  if (fine < testo.length) frammenti.push({ testo: testo.slice(fine), stima: false })
  return frammenti
}
