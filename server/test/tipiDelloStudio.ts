// I tipi che lo studio si aspetta (`studio/src/tipi.ts`, scritti a mano) letti dal compilatore di TypeScript dello studio, e un controllo che dice se un dato
// che il server ha mandato ha quella forma. Serve alla prova che tiene allineati server e studio (`accordo-studio.test.ts`).
import { createRequire } from "node:module"
import { dirname, join, resolve } from "node:path"
import type * as Ts from "../../studio/node_modules/typescript"

const STUDIO = resolve(import.meta.dir, "..", "..", "studio")
const ts = createRequire(join(STUDIO, "package.json"))("typescript") as typeof Ts

/** Il compilatore dello studio sui file dati, con le stesse regole del suo `tsconfig` (conta `strict`: `null` e opzionale sono cose diverse). */
function programma(file: string): { checker: Ts.TypeChecker; esportati: Map<string, Ts.Symbol> } {
  const prog = ts.createProgram([file], { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, strict: true, skipLibCheck: true, noEmit: true, types: [] })
  const checker = prog.getTypeChecker()
  const sorgente = prog.getSourceFile(file)
  const modulo = sorgente && checker.getSymbolAtLocation(sorgente)
  if (!modulo) throw new Error(`non riesco a leggere i tipi di ${file}`)
  return { checker, esportati: new Map(checker.getExportsOfModule(modulo).map((s) => [s.getName(), s])) }
}

export interface TipiLetti {
  /** I problemi di `valore` rispetto al tipo esportato `nome` (o ai suoi elementi, con `elenco`); vuoto se ha la forma giusta. */
  controlla: (nome: string, valore: unknown, opzioni?: { elenco?: boolean }) => string[]
  /** Le stringhe che il campo `campo` può valere nel tipo esportato `nome` (per le unioni di oggetti: tutte le alternative). */
  valoriDi: (nome: string, campo: string) => string[]
  /** Le stringhe di un tipo che è un'unione di stringhe fisse. */
  letterali: (nome: string) => string[]
}

export function leggiTipi(file: string): TipiLetti {
  const { checker, esportati } = programma(file)
  const tipoEsportato = (nome: string): Ts.Type => {
    const simbolo = esportati.get(nome)
    if (!simbolo) throw new Error(`il tipo «${nome}» non c'è in ${file}`)
    return checker.getDeclaredTypeOfSymbol(simbolo)
  }
  const F = ts.TypeFlags

  const dellaProprieta = (p: Ts.Symbol): Ts.Type => checker.getTypeOfSymbol(p)

  function problemi(v: unknown, t: Ts.Type, percorso: string): string[] {
    if (t.flags & (F.Any | F.Unknown)) return []
    if (t.isUnion()) {
      // Un valore che combacia con un'alternativa va bene; se nessuna combacia, si dicono i problemi di quella più vicina, cioè fra le alternative dello stesso genere del valore.
      const per = t.types.map((x) => ({ x, p: problemi(v, x, percorso) }))
      if (per.some(({ p }) => p.length === 0)) return []
      const dello = (x: Ts.Type) => (Array.isArray(v) ? checker.isArrayType(x) || checker.isTupleType(x) : v === null ? !!(x.flags & F.Null) : typeof v === "object" ? !!(x.flags & F.Object) && !checker.isArrayType(x) && !checker.isTupleType(x) : typeof v === "string" ? !!(x.flags & F.StringLike) : typeof v === "number" ? !!(x.flags & F.NumberLike) : typeof v === "boolean" ? !!(x.flags & F.BooleanLike) : false)
      const vicine = per.filter(({ x }) => dello(x))
      return (vicine.length > 0 ? vicine : per).reduce((meglio, c) => (c.p.length < meglio.p.length ? c : meglio)).p
    }
    if (t.isIntersection()) return t.types.flatMap((x) => problemi(v, x, percorso))
    if (t.isStringLiteral()) return v === t.value ? [] : [`${percorso}: dovrebbe essere «${t.value}», è ${JSON.stringify(v)}`]
    if (t.isNumberLiteral()) return v === t.value ? [] : [`${percorso}: dovrebbe essere ${t.value}, è ${JSON.stringify(v)}`]
    if (t.flags & F.BooleanLiteral) {
      const atteso = checker.typeToString(t) === "true"
      return v === atteso ? [] : [`${percorso}: dovrebbe essere ${atteso}, è ${JSON.stringify(v)}`]
    }
    if (t.flags & F.String) return typeof v === "string" ? [] : [`${percorso}: dovrebbe essere un testo, è ${JSON.stringify(v)}`]
    if (t.flags & F.Number) return typeof v === "number" ? [] : [`${percorso}: dovrebbe essere un numero, è ${JSON.stringify(v)}`]
    if (t.flags & F.Boolean) return typeof v === "boolean" ? [] : [`${percorso}: dovrebbe essere vero o falso, è ${JSON.stringify(v)}`]
    if (t.flags & F.Null) return v === null ? [] : [`${percorso}: dovrebbe essere null, è ${JSON.stringify(v)}`]
    if (t.flags & (F.Undefined | F.Void)) return v === undefined ? [] : [`${percorso}: non dovrebbe esserci`]
    if (checker.isTupleType(t) || checker.isArrayType(t)) {
      if (!Array.isArray(v)) return [`${percorso}: dovrebbe essere un elenco, è ${JSON.stringify(v)}`]
      const elementi = checker.getTypeArguments(t as Ts.TypeReference)
      if (checker.isTupleType(t)) return elementi.length === v.length ? v.flatMap((x, i) => problemi(x, elementi[i]!, `${percorso}[${i}]`)) : [`${percorso}: dovrebbe avere ${elementi.length} elementi, ne ha ${v.length}`]
      return v.flatMap((x, i) => problemi(x, elementi[0]!, `${percorso}[${i}]`))
    }
    if (t.flags & F.Object) {
      if (typeof v !== "object" || v === null || Array.isArray(v)) return [`${percorso}: dovrebbe essere un oggetto, è ${JSON.stringify(v)}`]
      const dato = v as Record<string, unknown>
      const dallaProprieta = checker.getPropertiesOfType(t).flatMap((p) => {
        const nome = p.getName()
        if (dato[nome] === undefined) return p.flags & ts.SymbolFlags.Optional || problemi(undefined, dellaProprieta(p), "").length === 0 ? [] : [`${percorso}.${nome}: manca`]
        return problemi(dato[nome], dellaProprieta(p), `${percorso}.${nome}`)
      })
      const dalIndice = checker.getIndexInfosOfType(t).flatMap((info) => Object.entries(dato).flatMap(([k, x]) => problemi(x, info.type, `${percorso}.${k}`)))
      return [...dallaProprieta, ...dalIndice]
    }
    return [`${percorso}: un tipo che la prova non sa leggere (${checker.typeToString(t)})`]
  }

  return {
    controlla: (nome, valore, opzioni) => {
      const t = tipoEsportato(nome)
      if (!opzioni?.elenco) return problemi(valore, t, nome)
      return Array.isArray(valore) ? valore.flatMap((x, i) => problemi(x, t, `${nome}[${i}]`)) : [`${nome}: dovrebbe essere un elenco`]
    },
    letterali: (nome) => {
      const t = tipoEsportato(nome)
      return (t.isUnion() ? t.types : [t]).filter((x) => x.isStringLiteral()).map((x) => (x as Ts.StringLiteralType).value)
    },
    valoriDi: (nome, campo) => {
      const alternative = tipoEsportato(nome).isUnion() ? (tipoEsportato(nome) as Ts.UnionType).types : [tipoEsportato(nome)]
      return alternative.flatMap((a) => {
        const p = checker.getPropertyOfType(a, campo)
        if (!p) return []
        const t = dellaProprieta(p)
        return (t.isUnion() ? t.types : [t]).filter((x) => x.isStringLiteral()).map((x) => (x as Ts.StringLiteralType).value)
      })
    },
  }
}

export const tipiDelloStudio = (): TipiLetti => leggiTipi(join(STUDIO, "src", "tipi.ts"))
export const cartellaDelloStudio = dirname(join(STUDIO, "package.json"))
