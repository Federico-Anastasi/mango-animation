// La chat del finto server (`docs/CHAT.md`): una conversazione d'esempio ricca (testo con tabella e codice, strumenti, due
// immagini, un permesso in attesa) e un Claude di copione che risponde a ciò che si scrive: testo a pezzi, uno strumento, e
// secondo le parole del messaggio un permesso («permesso»), una domanda («domanda») o un lavoro in coda («monta»).
import { deflateSync } from "node:zlib"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { ComandoChat, ContestoUsato, DomandaChat, ImpostazioniChat, LivelloEffort, Messaggio, ModelloChat, Parte, Richiesta, StatoConversazione, TaskChat, VoceConversazione } from "../src/chat/tipi"
import type { Evento } from "../src/tipi"

export interface DipendenzeChat {
  archivio: string
  emetti: (evento: Evento) => void
  mettiInCoda: (compito: { slug: string | null; comando: string }) => string
}

const TUTTI: LivelloEffort[] = ["low", "medium", "high", "xhigh", "max"]
const MODELLI: ModelloChat[] = [
  { id: "default", nome: "Predefinito (Sonnet 5.5)", descrizione: "Efficient for routine tasks", effort: TUTTI, reale: "claude-sonnet-5-5" },
  { id: "opus", nome: "Opus 5.5", descrizione: "Best for everyday, complex tasks", effort: TUTTI, reale: "claude-opus-5-5" },
  { id: "sonnet", nome: "Sonnet 5.5", descrizione: "Efficient for routine tasks", effort: TUTTI, reale: "claude-sonnet-5-5" },
  { id: "claude-opus-4-6", nome: "Opus 4.6", descrizione: "Older", effort: ["low", "medium", "high", "max"], reale: "claude-opus-4-6" },
  { id: "claude-haiku-4-5-20251001", nome: "Haiku 4.5", descrizione: "Fastest", effort: [], reale: "claude-haiku-4-5-20251001" },
  { id: "mango-code/toq", nome: "Mango Code · TOQ-v1", descrizione: "Mango Code, sul computer · 64k di contesto · non vede le immagini", effort: [], reale: "mango-code/toq" },
]

const COMANDI: ComandoChat[] = [
  { nome: "add-dir", descrizione: "Add a new working directory", argomenti: "<path>", alias: [] },
  { nome: "clear", descrizione: "Clear conversation history and free up context", argomenti: "", alias: ["reset", "new"] },
  { nome: "compact", descrizione: "Clear conversation history but keep a summary in context. Optional: /compact [instructions for summarization]", argomenti: "<optional custom summarization instructions>", alias: [] },
  { nome: "context", descrizione: "Show current context usage", argomenti: "", alias: [] },
  { nome: "cost", descrizione: "Show the total cost and duration of the current session", argomenti: "", alias: [] },
  { nome: "effort", descrizione: "Set effort level for model usage", argomenti: "[low|medium|high|xhigh|max]", alias: [] },
  { nome: "mcp", descrizione: "Manage MCP servers", argomenti: "", alias: [] },
  { nome: "model", descrizione: "Set the AI model for Claude Code", argomenti: "[model]", alias: [] },
  { nome: "rename", descrizione: "Rename the current conversation", argomenti: "<name>", alias: [] },
  { nome: "usage", descrizione: "Show plan usage limits", argomenti: "", alias: [] },
  { nome: "monta", descrizione: "(project) Edits or re-edits a video of the archive", argomenti: "", alias: [] },
  { nome: "controlla", descrizione: "(project) Checks an edited video before sending it to the creator", argomenti: "", alias: [] },
  { nome: "scena", descrizione: "(project) Writes or corrects a video's animated scenes", argomenti: "", alias: [] },
]

interface Conversazione extends ImpostazioniChat {
  id: string
  titolo: string
  aggiornata: string
  stato: StatoConversazione
  lavoraDa: string | null
  messaggi: Messaggio[]
  inAttesa: Richiesta[]
  task: TaskChat[]
  fermata: boolean
  /** Il processo è acceso anche a conversazione pronta (ha ricevuto un messaggio) e finché il creator non la chiude. */
  accesa?: boolean
  /** Chiusa dal creator: il processo è spento finché non scrive di nuovo. */
  chiusa?: boolean
  contestoUsato?: ContestoUsato
}

/** Un istante di `secondi` fa. */
const fa = (secondi: number): string => new Date(Date.now() - secondi * 1000).toISOString()

// --- Un'immagine vera da mettere nella chat: una slide in 9:16 disegnata a rettangoli ---------------------------------

function crc32(dati: Uint8Array): number {
  let c = ~0
  for (const byte of dati) {
    c ^= byte
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function pezzoPng(tipo: string, dati: Uint8Array): Uint8Array {
  const fuori = new Uint8Array(12 + dati.length)
  const vista = new DataView(fuori.buffer)
  vista.setUint32(0, dati.length)
  fuori.set(new TextEncoder().encode(tipo), 4)
  fuori.set(dati, 8)
  vista.setUint32(8 + dati.length, crc32(fuori.subarray(4, 8 + dati.length)))
  return fuori
}

/** Una slide finta in PNG, base64: fondo carta, una barra di titolo, righe di testo e un quadrato. */
function slideFinta(numero: number): string {
  const larghezza = 270
  const altezza = 480
  const pixel = new Uint8Array((larghezza * 3 + 1) * altezza)
  const riempi = (x: number, y: number, l: number, a: number, [r, g, b]: [number, number, number]) => {
    for (let j = y; j < y + a; j++) for (let i = x; i < x + l; i++) pixel.set([r, g, b], j * (larghezza * 3 + 1) + 1 + i * 3)
  }
  riempi(0, 0, larghezza, altezza, [0xf1, 0xf0, 0xeb])
  riempi(24, 60, 150, 14, [0xe0, 0x3a, 0x1e])
  riempi(24, 84, 200 - numero * 20, 14, [0x17, 0x17, 0x1b])
  for (let k = 0; k < 6; k++) riempi(24, 150 + k * 22, 220 - ((k * 37 + numero * 11) % 90), 8, [0x5f, 0x5d, 0x56])
  riempi(24, 300, 80 + numero * 20, 80 + numero * 20, [0x1f, 0x4b, 0x99])
  const intestazione = new Uint8Array(13)
  const vista = new DataView(intestazione.buffer)
  vista.setUint32(0, larghezza)
  vista.setUint32(4, altezza)
  intestazione.set([8, 2, 0, 0, 0], 8)
  const firma = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])
  const parti = [firma, pezzoPng("IHDR", intestazione), pezzoPng("IDAT", deflateSync(pixel)), pezzoPng("IEND", new Uint8Array())]
  const png = new Uint8Array(parti.reduce((n, p) => n + p.length, 0))
  let posto = 0
  for (const p of parti) {
    png.set(p, posto)
    posto += p.length
  }
  return Buffer.from(png).toString("base64")
}

const TESTO_RICCO = `## Cosa ho trovato

Le slide sono **9**, e due hanno un problema:

- la slide 4 ha il titolo che il telefono taglia a destra
- la slide 7 scrive nella zona della didascalia

| slide | avviso | cosa fare |
|---|---|---|
| 4 | testo nei lati | stringere il titolo |
| 7 | zona della didascalia | alzare il blocco di 120 px |

Le ho corrette in \`materiali/carosello.html\` e riscritto con:

\`\`\`bash
python -m motore carosello carosello-dispensa
\`\`\`

Il video \`carosello-dispensa\` è in \`archivio/video/carosello-dispensa/uscite/slide-1.png\`: ora gli avvisi sono zero.`

const mostra = (testo: string): Parte => ({ tipo: "testo", testo })

function esempio(): Conversazione {
  const quando = "2026-11-02T10:12:00"
  return {
    id: "esempio",
    titolo: "Controllo delle slide del carosello",
    aggiornata: quando,
    stato: "aspetta",
    lavoraDa: fa(252),
    fermata: false,
    modello: "claude-sonnet-5-5",
    effort: "high",
    contestoUsato: { usati: 41_100, totale: 200_000 },
    task: [],
    inAttesa: [{ id: "perm1", tipo: "permesso", strumento: "Bash", ingresso: { command: "python -m motore carosello carosello-dispensa" }, frase: "Vuole lanciare: python -m motore carosello carosello-dispensa" }],
    messaggi: [
      { id: "m1", ruolo: "utente", quando, parti: [mostra("Controlla le slide del carosello della dispensa e dimmi cosa non va.")] },
      {
        id: "m2",
        ruolo: "claude",
        quando,
        parti: [
          { tipo: "pensiero", testo: "Prima guardo la scheda e le slide già rese, poi gli avvisi dell'ultima resa." },
          mostra("Guardo prima la scheda, poi le slide."),
          { tipo: "strumento", id: "t1", nome: "mcp__video__video_leggi", ingresso: { slug: "carosello-dispensa" }, esito: '{"titolo":"Carosello della dispensa","formato":"carosello","slide":9}', iniziato: fa(250), finito: fa(249) },
          { tipo: "strumento", id: "t2", nome: "Read", ingresso: { file_path: "C:\\Users\\esempio\\mango-animation\\docs\\PIANO.md" }, esito: "# Il piano\n\nIl piano è l'unica verità di un montaggio.", iniziato: fa(249), finito: fa(248) },
          { tipo: "strumento", id: "t3", nome: "mcp__video__slide", ingresso: { slug: "carosello-dispensa", slide: [4, 7] }, esito: "2 slide", immagini: [4, 7].map((n) => ({ media_type: "image/png", data: slideFinta(n % 5) })), iniziato: fa(248), finito: fa(240) },
          mostra(TESTO_RICCO),
          { tipo: "strumento", id: "t4", nome: "Grep", ingresso: { pattern: "margine_lati" }, esito: "stile.json:12", iniziato: fa(140), finito: fa(139) },
          { tipo: "fine", durata_ms: 94_000, costo: 0.31 },
        ],
      },
      { id: "m3", ruolo: "utente", quando, parti: [mostra("Bene. Rendile di nuovo e dimmi se gli avvisi sono zero.")] },
      {
        id: "m4",
        ruolo: "claude",
        quando,
        parti: [
          mostra("Le rendo adesso."),
          { tipo: "strumento", id: "t4b", nome: "Bash", ingresso: { command: "cd /c/Users/esempio/mango-animation && python -m motore valida carosello-dispensa", description: "Controlla il piano del carosello" }, esito: "piano valido", iniziato: fa(120), finito: fa(98) },
          { tipo: "strumento", id: "t4c", nome: "Bash", ingresso: { command: "cd /c/Users/esempio/mango-animation && git status --short archivio/video/carosello-dispensa" }, esito: "nessun cambio", iniziato: fa(98), finito: fa(97) },
          { tipo: "strumento", id: "t5", nome: "Bash", ingresso: { command: "python -m motore carosello carosello-dispensa" }, iniziato: fa(52) }],
      },
    ],
  }
}

const ALTRA: Conversazione = {
  id: "vecchia",
  titolo: "Che ora finisce il montaggio?",
  aggiornata: "2026-11-01T18:30:00",
  stato: "pronta",
  lavoraDa: null,
  fermata: false,
  modello: null,
  effort: null,
  inAttesa: [],
  task: [],
  messaggi: [
    { id: "v1", ruolo: "utente", quando: "2026-11-01T18:29:00", parti: [mostra("Che ora finisce il montaggio?")] },
    { id: "v2", ruolo: "claude", quando: "2026-11-01T18:30:00", parti: [mostra("Verso le **15:42**, secondo la stima della coda."), { tipo: "fine", durata_ms: 6_000 }] },
  ],
}

const DOMANDE: DomandaChat[] = [
  { domanda: "Con quale quadro lo monto?", intestazione: "Quadro", multipla: false, opzioni: [{ etichetta: "Sagoma al centro", descrizione: "Le animazioni sopra, la tua sagoma a tutta larghezza" }, { etichetta: "Girato pieno", descrizione: "Solo tu che parli, nessuna animazione" }] },
  { domanda: "Cosa aggiungo?", intestazione: "Extra", multipla: true, opzioni: [{ etichetta: "Copertina", descrizione: "Un primo fotogramma pieno" }, { etichetta: "Controllo", descrizione: "Riascolto e fotogrammi accanto alle parole" }] },
]

export function creaChatFinta(d: DipendenzeChat): (richiesta: Request, url: URL) => Promise<Response | null> {
  const conversazioni = new Map<string, Conversazione>([
    ["esempio", esempio()],
    ["vecchia", ALTRA],
  ])
  const attese = new Map<string, (risposta: unknown) => void>()
  let contatore = 100

  const json = (dati: unknown, stato = 200) => Response.json(dati, { status: stato })
  const errore = (stato: number, frase: string) => json({ errore: frase }, stato)
  const dormi = (ms: number) => new Promise((ok) => setTimeout(ok, ms))
  const emetti = (id: string, resto: object) => d.emetti({ tipo: "chat", id, ...resto } as Evento)
  const attiva = (c: Conversazione) => c.chiusa !== true && (c.stato !== "pronta" || c.accesa === true)
  const elenco = (): VoceConversazione[] => [...conversazioni.values()].sort((a, b) => b.aggiornata.localeCompare(a.aggiornata)).map((c) => ({ id: c.id, titolo: c.titolo, aggiornata: c.aggiornata, attiva: attiva(c) }))
  // Il finto non somma i giri: il tempo di lavoro è quello del giro in corso.
  const lavoroDi = (c: Conversazione) => ({ ms: 0, da: c.stato === "lavora" ? c.lavoraDa : null })
  const imposta = (c: Conversazione, stato: StatoConversazione) => {
    c.stato = stato
    c.lavoraDa = stato === "pronta" || stato === "errore" ? null : (c.lavoraDa ?? new Date().toISOString())
    emetti(c.id, { evento: "stato", stato, ...(c.lavoraDa ? { da: c.lavoraDa } : {}), lavoro: lavoroDi(c) })
  }

  // Il giro in corso con i tempi: due montaggi in coda, uno che gira e uno in attesa, e Claude che li aspetta e dice quanto ci vuole.
  function creaTempi(): Conversazione {
    const [primo, secondo] = [d.mettiInCoda({ slug: "ricetta-in-diretta", comando: "monta" }), d.mettiInCoda({ slug: "variante-ricetta", comando: "monta" })]
    return {
      id: "tempi",
      titolo: "Due montaggi di fila",
      aggiornata: new Date().toISOString(),
      stato: "lavora",
      lavoraDa: fa(134),
      fermata: false,
      modello: "claude-sonnet-5-5",
      effort: "high",
      inAttesa: [],
      task: [],
      messaggi: [
        { id: "k1", ruolo: "utente", quando: fa(140), parti: [mostra("Monta ricetta-in-diretta e poi variante-ricetta. Dimmi quanto ci metti.")] },
        {
          id: "k2",
          ruolo: "claude",
          quando: fa(134),
          parti: [
            mostra("Metto in coda i due montaggi. Il primo dura **circa 4 minuti**; il secondo parte dopo e finisce verso le 15:42. Intanto controllo che il piano sia valido: ci vogliono 20 secondi."),
            { tipo: "strumento", id: "k-v", nome: "mcp__video__valida", ingresso: { slug: "ricetta-in-diretta" }, esito: "piano valido", iniziato: fa(131), finito: fa(111) },
            { tipo: "strumento", id: "k-1", nome: "mcp__video__lavoro", ingresso: { slug: "ricetta-in-diretta", comando: "monta" }, esito: JSON.stringify({ id: primo }), iniziato: fa(110), finito: fa(110) },
            { tipo: "strumento", id: "k-2", nome: "mcp__video__lavoro", ingresso: { slug: "variante-ricetta", comando: "monta" }, esito: JSON.stringify({ id: secondo }), iniziato: fa(109), finito: fa(109) },
            { tipo: "strumento", id: "k-a", nome: "mcp__video__lavoro_aspetta", ingresso: { id: primo }, iniziato: fa(108) },
          ],
        },
      ],
    }
  }

  // Una conversazione di Mango Code che lavora: la testata, il campo di scrittura e il menu dei modelli dicono Mango Code, non Claude.
  function creaMango(): Conversazione {
    return {
      id: "mango",
      titolo: "Che video ho in archivio?",
      aggiornata: new Date().toISOString(),
      stato: "lavora",
      lavoraDa: fa(42),
      fermata: false,
      modello: "mango-code/toq",
      effort: null,
      // Oltre il 70%: la barretta del contesto si vede arancione.
      contestoUsato: { usati: 52_400, totale: 65_536 },
      inAttesa: [],
      task: [],
      messaggi: [
        { id: "mc1", ruolo: "utente", quando: fa(50), parti: [mostra("Che video ho in archivio? Elencameli.")] },
        {
          id: "mc2",
          ruolo: "claude",
          quando: fa(45),
          parti: [
            mostra("Guardo la cartella dei video."),
            { tipo: "strumento", id: "mc-1", nome: "LS", ingresso: { path: "archivio/video" }, esito: "ricetta-in-diretta\ncarosello-dispensa\nvariante-ricetta", iniziato: fa(44), finito: fa(43) },
            { tipo: "strumento", id: "mc-2", nome: "Read", ingresso: { file_path: "archivio/video/ricetta-in-diretta/scheda.json" }, iniziato: fa(5) },
          ],
        },
      ],
    }
  }

  // Un comando lungo che Claude aspetta e un lavoro già in background: il bottone «Manda in background» e la scheda con «Ferma».
  function creaBackground(): Conversazione {
    return {
      id: "background",
      titolo: "Rendere le slide e controllare i video",
      aggiornata: new Date().toISOString(),
      stato: "lavora",
      lavoraDa: fa(95),
      fermata: false,
      modello: "claude-sonnet-5-5",
      effort: "high",
      inAttesa: [],
      task: [
        { id: "bg1", tipo: "comando", descrizione: "Rende le 9 slide del carosello della dispensa", iniziato: fa(75), background: true },
        { id: "fg1", tipo: "comando", descrizione: "Controlla tutti i video dell'archivio", iniziato: fa(20), background: false },
      ],
      messaggi: [
        { id: "g1", ruolo: "utente", quando: fa(100), parti: [mostra("Rendi le slide del carosello e intanto controlla tutti i video.")] },
        {
          id: "g2",
          ruolo: "claude",
          quando: fa(95),
          parti: [
            mostra("Rendo le slide in background e intanto lancio il controllo dei video."),
            { tipo: "strumento", id: "g-1", nome: "Bash", ingresso: { command: "python -m motore carosello carosello-dispensa", description: "Rende le slide" }, esito: "Comando partito in background", iniziato: fa(76), finito: fa(75) },
            { tipo: "strumento", id: "g-2", nome: "Bash", ingresso: { command: "python -m motore valida --tutti", description: "Controlla tutti i video" }, iniziato: fa(20) },
          ],
        },
      ],
    }
  }

  async function chiedi(c: Conversazione, richiesta: Richiesta): Promise<unknown> {
    c.inAttesa.push(richiesta)
    emetti(c.id, { evento: "richiesta", richiesta })
    imposta(c, "aspetta")
    return new Promise((ok) => attese.set(richiesta.id, ok))
  }

  async function scrivi(c: Conversazione, messaggio: Messaggio, testo: string, indice: number) {
    for (let fino = 0; fino < testo.length && !c.fermata; fino += 14) {
      messaggio.parti[indice] = mostra(testo.slice(0, fino + 14))
      emetti(c.id, { evento: "parte", messaggio: messaggio.id, indice, parte: messaggio.parti[indice] })
      await dormi(35)
    }
  }

  // Il permesso in attesa dell'esempio: a risposta data, il lavoro riprende e la conversazione si chiude.
  attese.set("perm1", (risposta) => {
    const c = conversazioni.get("esempio")!
    const m = c.messaggi.at(-1)!
    const no = (risposta as { scelta?: string }).scelta === "no"
    imposta(c, "lavora")
    const indice = m.parti.length - 1
    m.parti[indice] = { tipo: "strumento", id: "t5", nome: "Bash", ingresso: { command: "python -m motore carosello carosello-dispensa" }, ...(no ? { errore: "Il permesso di usare Bash non è stato dato." } : { esito: "9 slide rese, 0 avvisi" }) }
    emetti(c.id, { evento: "parte", messaggio: m.id, indice, parte: m.parti[indice]! })
    m.parti.push(mostra(no ? "Va bene, non le rendo." : "Fatto: **9 slide rese, nessun avviso**."))
    emetti(c.id, { evento: "parte", messaggio: m.id, indice: indice + 1, parte: m.parti[indice + 1]! })
    imposta(c, "pronta")
  })

  async function rispondi(c: Conversazione, testoFa: string) {
    c.fermata = false
    imposta(c, "lavora")
    const inizio = Date.now()
    const m: Messaggio = { id: `m${++contatore}`, ruolo: "claude", quando: new Date().toISOString(), parti: [] }
    c.messaggi.push(m)
    emetti(c.id, { evento: "messaggio", messaggio: m })
    await scrivi(c, m, "Guardo cosa serve e comincio.", 0)
    const strumento = (parte: Parte) => {
      const i = m.parti.findIndex((p) => p.tipo === "strumento" && parte.tipo === "strumento" && p.id === parte.id)
      const indice = i < 0 ? m.parti.length : i
      m.parti[indice] = parte
      emetti(c.id, { evento: "parte", messaggio: m.id, indice, parte })
    }
    const dice = testoFa.toLowerCase()
    if (dice.includes("monta")) {
      const id = d.mettiInCoda({ slug: "ricetta-in-diretta", comando: "monta" })
      strumento({ tipo: "strumento", id: "tl", nome: "mcp__video__lavoro", ingresso: { slug: "ricetta-in-diretta", comando: "monta" }, esito: JSON.stringify({ id }) })
    } else {
      strumento({ tipo: "strumento", id: "ts", nome: "Bash", ingresso: { command: "bun test" } })
      await dormi(700)
      strumento({ tipo: "strumento", id: "ts", nome: "Bash", ingresso: { command: "bun test" }, esito: "12 prove verdi" })
    }
    if (dice.includes("permesso")) {
      strumento({ tipo: "strumento", id: "tp", nome: "Bash", ingresso: { command: "rm -rf lavoro/scene" } })
      const risposta = (await chiedi(c, { id: `p${++contatore}`, tipo: "permesso", strumento: "Bash", ingresso: { command: "rm -rf lavoro/scene" }, frase: "Vuole lanciare: rm -rf lavoro/scene" })) as { scelta?: string }
      strumento({ tipo: "strumento", id: "tp", nome: "Bash", ingresso: { command: "rm -rf lavoro/scene" }, ...(risposta.scelta === "no" ? { errore: "Il permesso di usare Bash non è stato dato." } : { esito: "fatto" }) })
      imposta(c, "lavora")
    }
    if (dice.includes("domanda")) {
      const risposta = (await chiedi(c, { id: `q${++contatore}`, tipo: "domanda", domande: DOMANDE })) as { scelta?: { risposte?: Record<string, string> } }
      imposta(c, "lavora")
      m.parti.push(mostra(""))
      await scrivi(c, m, `Va bene: ${Object.values(risposta.scelta?.risposte ?? {}).join("; ")}.`, m.parti.length - 1)
    } else {
      m.parti.push(mostra(""))
      await scrivi(c, m, `Fatto. Ho letto «${testoFa.slice(0, 60)}» e ho controllato \`ricetta-in-diretta\`: **niente da correggere**.`, m.parti.length - 1)
    }
    const fine: Parte = { tipo: "fine", durata_ms: Date.now() - inizio, ...(c.fermata ? { errore: "L'hai fermato tu." } : {}) }
    m.parti.push(fine)
    emetti(c.id, { evento: "parte", messaggio: m.id, indice: m.parti.length - 1, parte: fine })
    imposta(c, "pronta")
    c.aggiornata = new Date().toISOString()
    emetti(c.id, { evento: "elenco" })
  }

  function aggiungiMessaggioDelCreator(c: Conversazione, corpo: { testo: string; allegati?: Array<{ percorso: string }> }) {
    const m: Messaggio = { id: `m${++contatore}`, ruolo: "utente", quando: new Date().toISOString(), parti: [...(corpo.allegati ?? []).map((a): Parte => ({ tipo: "allegato", percorso: a.percorso, immagine: /\.(png|jpe?g|gif|webp)$/i.test(a.percorso) })), mostra(corpo.testo)] }
    c.messaggi.push(m)
    c.accesa = true
    c.chiusa = false
    emetti(c.id, { evento: "messaggio", messaggio: m })
  }

  return async (richiesta, url) => {
    const percorso = url.pathname
    const metodo = richiesta.method
    if (!percorso.startsWith("/api/chat")) return null
    const corpo = async <T>() => (await richiesta.json()) as T
    if (percorso === "/api/chat" && metodo === "GET") return json(elenco())
    if (percorso === "/api/chat" && metodo === "POST") {
      const dati = await corpo<{ testo: string; allegati?: Array<{ percorso: string }>; modello?: string; effort?: LivelloEffort }>()
      const c: Conversazione = { id: `c${++contatore}`, titolo: dati.testo.slice(0, 50), aggiornata: new Date().toISOString(), stato: "pronta", lavoraDa: null, messaggi: [], inAttesa: [], task: [], fermata: false, modello: dati.modello ?? null, effort: dati.effort ?? null }
      conversazioni.set(c.id, c)
      aggiungiMessaggioDelCreator(c, dati)
      emetti(c.id, { evento: "elenco" })
      void rispondi(c, dati.testo)
      return json({ id: c.id }, 201)
    }
    if (percorso === "/api/chat/modelli" && metodo === "GET") return json(MODELLI)
    if (percorso === "/api/chat/comandi" && metodo === "GET") return json(COMANDI)
    if (percorso === "/api/chat/allegati" && metodo === "POST") {
      const nome = decodeURIComponent(richiesta.headers.get("x-nome") ?? "allegato").replace(/[^\w.-]+/g, "_")
      const relativo = `chat/allegati/${++contatore}-${nome}`
      await mkdir(join(d.archivio, "chat", "allegati"), { recursive: true })
      await writeFile(join(d.archivio, relativo), new Uint8Array(await richiesta.arrayBuffer()))
      return json({ percorso: relativo }, 201)
    }
    const una = /^\/api\/chat\/([^/]+)(?:\/(messaggi|ferma|chiudi|impostazioni|background|task\/([^/]+)\/ferma|risposte\/([^/]+)))?$/.exec(percorso)
    if (!una) return errore(404, "Questa rotta non esiste.")
    const idUna = decodeURIComponent(una[1]!)
    if (idUna === "tempi" && metodo === "GET" && !una[2]) conversazioni.set("tempi", creaTempi())
    if (idUna === "background" && metodo === "GET" && !una[2]) conversazioni.set("background", creaBackground())
    if (idUna === "mango" && metodo === "GET" && !una[2]) conversazioni.set("mango", creaMango())
    const c = conversazioni.get(idUna)
    if (!c) return errore(404, "Questa conversazione non c'è.")
    if (!una[2] && metodo === "GET") return json({ id: c.id, titolo: c.titolo, attiva: attiva(c), stato: c.stato, lavora_da: c.lavoraDa, lavoro: lavoroDi(c), modello: c.modello, effort: c.effort, messaggi: c.messaggi, in_attesa: c.inAttesa, task: c.task, contesto_usato: c.contestoUsato ?? null })
    if (una[2] === "messaggi" && metodo === "POST") {
      const dati = await corpo<{ testo: string; allegati?: Array<{ percorso: string }> }>()
      aggiungiMessaggioDelCreator(c, dati)
      if (c.stato === "pronta") void rispondi(c, dati.testo)
      return json({ ok: true }, 202)
    }
    if (una[2] === "impostazioni" && metodo === "POST") {
      const dati = await corpo<Partial<ImpostazioniChat>>()
      if (dati.modello !== undefined) c.modello = dati.modello
      if (dati.effort !== undefined) c.effort = dati.effort
      const livelli = MODELLI.find((m) => m.id === (c.modello ?? "default") || m.reale === c.modello)?.effort ?? []
      if (c.effort !== null && !livelli.includes(c.effort)) c.effort = null
      emetti(c.id, { evento: "impostazioni", modello: c.modello, effort: c.effort })
      return json({ modello: c.modello, effort: c.effort })
    }
    if (una[2] === "ferma" && metodo === "POST") {
      c.fermata = true
      return json({ ok: true })
    }
    if (una[2] === "chiudi" && metodo === "POST") {
      c.fermata = true
      c.chiusa = true
      for (const r of c.inAttesa) emetti(c.id, { evento: "risposta", richiesta: r.id })
      c.inAttesa = []
      imposta(c, "pronta")
      emetti(c.id, { evento: "chiusa" })
      emetti(c.id, { evento: "elenco" })
      return json({ ok: true })
    }
    if (una[2] === "background" && metodo === "POST") {
      if (!c.task.some((t) => !t.background)) return errore(409, "Non c'è un lavoro in corso da mandare in background.")
      c.task = c.task.map((t) => ({ ...t, background: true }))
      emetti(c.id, { evento: "task", task: c.task })
      return json({ ok: true })
    }
    if (una[3] && metodo === "POST") {
      if (!c.task.some((t) => t.id === decodeURIComponent(una[3]!))) return errore(404, "Questo lavoro non c'è più: è già finito, o qualcuno l'ha già fermato.")
      c.task = c.task.filter((t) => t.id !== decodeURIComponent(una[3]!))
      emetti(c.id, { evento: "task", task: c.task })
      return json({ ok: true })
    }
    if (una[4] && metodo === "POST") {
      const id = decodeURIComponent(una[4])
      const attesa = attese.get(id)
      if (!attesa) return errore(404, "Questa richiesta non c'è più.")
      attese.delete(id)
      c.inAttesa = c.inAttesa.filter((r) => r.id !== id)
      emetti(c.id, { evento: "risposta", richiesta: id })
      attesa(await corpo())
      return json({ ok: true })
    }
    return errore(404, "Questa rotta non esiste.")
  }
}
