// Ciò che Codex riceve all'apertura di una conversazione al posto di ciò che Claude Code carica da solo: il metodo del prodotto, le regole del creator, le righe dell'app.
import { regoleDelCreator, testoDelMetodo } from "../../../../plugin/metodo"
import { istruzioniDelMetodo, stessaCartella } from "../metodo"
import { istruzioniDellApp } from "../motore"

/** Il `CLAUDE.md` del creator lo legge Codex da sé dalla cartella di lavoro; il resto sta qui. */
export function istruzioniDiCodex(lavoro: string, codice: string, app: Parameters<typeof istruzioniDellApp>[0]): string {
  const regole = stessaCartella(codice, lavoro) ? [] : regoleDelCreator(lavoro)
  return [testoDelMetodo(codice, lavoro), ...regole, istruzioniDelMetodo(lavoro, codice, istruzioniDellApp(app))].join("\n\n")
}
