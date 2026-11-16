// Le righe delle impostazioni: il nome, a cosa serve e le parole che uno scriverebbe per trovarle, nelle due lingue.
// Le sezioni disegnano le righe da qui, e «Cerca» le trova da qui: un testo cambiato in un punto cambia anche nell'altro.
import type { SezioneImpostazioni } from "../indirizzo"
import { lingua } from "../lingua"
import { ponteCartella } from "./cartellaDati"
import { ponteAiuto } from "./ponteAiuto"
import { ponteGrandezza } from "./ponteGrandezza"
import { ponteSegnalazione } from "../segnalazione/ponte"

interface Coppia {
  it: string
  en: string
}

const due = (it: string, en: string): Coppia => ({ it, en })

interface Definizione {
  sezione: SezioneImpostazioni
  nome: Coppia
  spiegazione?: Coppia
  /** Le parole in più, separate da spazi: quelle che uno scrive senza sapere come si chiama la riga. */
  parole?: Coppia
  /** Una riga che c'è solo con l'app non si cerca nel browser. */
  disponibile?: () => boolean
}

const RIGHE = {
  "profilo.nome": { sezione: "profilo", nome: due("Il tuo nome", "Your name"), spiegazione: due("Come ti chiamo nei testi e nelle conversazioni.", "How I call you in texts and conversations."), parole: due("chiamo cognome", "surname") },
  "profilo.lingua": { sezione: "profilo", nome: due("La lingua in cui parli e scrivi", "The language you speak and write in"), spiegazione: due("È la lingua dei tuoi video e delle conversazioni.", "It is the language of your videos and conversations."), parole: due("italiano inglese parlo", "italian english") },
  "profilo.livello": { sezione: "profilo", nome: due("Che livello ha", "Their level"), spiegazione: due("Per esempio «non tecnico»: decide se uso sigle e numeri a schermo.", "For example \"non-technical\": it decides whether I use acronyms and numbers on screen."), parole: due("pubblico tecnico esperti", "audience technical") },
  "profilo.linguaPubblico": { sezione: "profilo", nome: due("La lingua del pubblico", "The audience's language"), spiegazione: due("La lingua in cui scrivo testi e didascalie.", "The language I write texts and captions in."), parole: due("pubblico italiano inglese", "audience italian english") },
  "profilo.testate": { sezione: "profilo", nome: due("Le testate che citi", "The newspapers you cite"), spiegazione: due("Separale con una virgola: i loro articoli possono comparire a schermo.", "Separate them with a comma: their articles may appear on screen."), parole: due("giornali articoli fonti riviste", "press sources magazines") },
  "profilo.canali": { sezione: "profilo", nome: due("I tuoi canali", "Your channels"), spiegazione: due("Dove pubblichi e con che formato.", "Where you publish and in what format."), parole: due("tiktok youtube instagram piattaforma formato verticale orizzontale aggiungi togli", "tiktok youtube instagram platform format vertical horizontal add remove") },
  "profilo.numeri": { sezione: "profilo", nome: due("Numeri del canale", "Channel numbers"), spiegazione: due("La chat legge i numeri dal tuo profilo: poi compare «Canale» nella barra.", "The chat reads the numbers from your profile: then \"Channel\" shows up in the bar."), parole: due("tiktok leggi dati statistiche visualizzazioni commenti aggiorna", "tiktok read data statistics views comments update") },
  "profilo.nonSiDice": { sezione: "profilo", nome: due("Cosa non dici", "What you never say"), spiegazione: due("Una cosa per riga: proposte, copioni, didascalie e risposte la rispettano.", "One thing per line: proposals, scripts, captions and answers respect it."), parole: due("parole vietate evitare parolacce", "banned words avoid") },

  "stile.partenza": { sezione: "stile", nome: due("Parti da uno stile", "Start from a style"), spiegazione: due("Scegline uno: poi cambi colori, sottotitoli e titolo.", "Choose one: then change the colors, subtitles and title."), parole: due("cartoline scuro caldo aspetto modello", "cards dark warm look template") },
  "stile.colori": { sezione: "stile", nome: due("I colori", "Colors"), spiegazione: due("I colori che i tuoi video usano.", "The colors your videos use."), parole: due("tavolozza sfondo testo accento", "palette background text accent") },
  "stile.carattere": { sezione: "stile", nome: due("Carattere", "Font"), spiegazione: due("Dei sottotitoli, delle animazioni e del titolo.", "Of the subtitles, the animations and the title."), parole: due("font ttf otf woff2 aggiungi scrittura", "ttf otf woff2 add lettering") },
  "stile.sottotitoli": { sezione: "stile", nome: due("Sottotitoli", "Subtitles"), spiegazione: due("Modo, corpo, stacco, bordo e colori.", "Mode, size, gap, border and colors."), parole: due("parola per parola battute corpo caratteri contorno correzioni fondo", "word by word lines size characters outline corrections background") },
  "stile.titolo": { sezione: "stile", nome: due("Titolo", "Title"), spiegazione: due("Corpo, margine, larghezza e colori del titolo.", "Size, margin, width and colors of the title."), parole: due("cartello corpo margine larghezza fondo testo", "sign size margin width background text") },
  "stile.voce": { sezione: "stile", nome: due("La voce", "The voice"), spiegazione: due("Il margine attorno alle parole e i livelli in decibel.", "The margin around the words and the levels in decibels."), parole: due("audio decibel lufs volume silenzio soglia suoni fondo accento", "audio decibels lufs volume silence threshold sounds background accent") },
  "stile.tagli": { sezione: "stile", nome: due("I tagli", "Cuts"), spiegazione: due("Quanto lasciare prima e dopo la voce, e le pause.", "How much to leave before and after the voice, and the pauses."), parole: due("tempo parole pausa pezzo minimo stacco vicine montaggio", "time words pause minimum clip gap close edit") },
  "stile.uscita": { sezione: "stile", nome: due("Il video che esce", "The output video"), spiegazione: due("Formato, qualità, copia leggera e copertina.", "Format, quality, light copy and cover."), parole: due("larghezza altezza fotogrammi fps crf audio kbit risoluzione titolo in alto persona", "width height frames fps crf audio kbit resolution title at the top person") },
  "stile.quadri": { sezione: "stile", nome: due("I quadri", "Layouts"), spiegazione: due("Il modo in cui il fotogramma è composto, in scala.", "The way the frame is composed, drawn to scale."), parole: due("layout misure sfondo sagoma riquadro viso inserto fascia animazione", "measures background silhouette box face inset band animation") },

  "computer.questo": { sezione: "computer", nome: due("Questo computer", "This computer"), spiegazione: due("Cosa ha: scheda video, processore, memoria e disco.", "What it has: video card, processor, memory and disk."), parole: due("nvidia gpu ram spazio controlla", "nvidia gpu ram space check") },
  "computer.trascrizione": { sezione: "computer", nome: due("Capire cosa dico", "Understanding what I say"), spiegazione: due("Trascrive il parlato: servono i sottotitoli parola per parola e i pezzi scelti a parole.", "Transcribes your speech: needed for subtitles that appear word by word and for clips picked by words."), parole: due("trascrizione sottotitoli whisper scheda video processore dove gira", "transcription subtitles whisper video card processor where it runs") },
  "computer.allineamento": { sezione: "computer", nome: due("Tagli precisi sulle parole", "Precise cuts on words"), spiegazione: due("Trova dove comincia e dove finisce ogni parola. Spento, i tagli si cercano sul livello della voce.", "Finds where each word starts and ends. Off, cuts are found from the level of the voice."), parole: due("allineamento tagli parole scheda video processore dove gira", "alignment cuts words video card processor where it runs") },
  "computer.sagoma": { sezione: "computer", nome: due("La mia sagoma sopra le animazioni", "My silhouette over the animations"), spiegazione: due("Ritaglia la persona dallo sfondo. Spenta, le sagome già fatte restano, ma non ne parte una nuova.", "Cuts the person out of the background. Off, silhouettes already made stay, but no new one starts."), parole: due("ritaglio sfondo persona scheda video processore dove gira", "cutout background person video card processor where it runs") },
  "computer.segui": { sezione: "computer", nome: due("Seguire la persona nelle riprese larghe", "Following the person in wide shots"), spiegazione: due("Tiene la persona al centro nelle viste che la seguono. Serve solo a chi riprende da lontano.", "Keeps the person centred in views that follow them. Only needed when you film from far away."), parole: due("inquadratura centro scheda video processore dove gira", "framing centre video card processor where it runs") },
  "computer.pulizia_voce": { sezione: "computer", nome: due("Voce pulita", "Clean voice"), spiegazione: due("Toglie il rumore di fondo dalla voce del video montato. Gira sul processore.", "Removes background noise from the voice in the edited video. Runs on the processor."), parole: due("rumore audio disturbo pulizia", "noise audio cleaning") },
  "computer.dettatura": { sezione: "computer", nome: due("Dove gira la dettatura", "Where dictation runs"), spiegazione: due("Il microfono nella chat. Si accende e si spegne in Generale.", "The microphone in the chat. It is turned on and off in General."), parole: due("microfono scheda video processore", "microphone video card processor") },

  "telefono.arrivi": { sezione: "telefono", nome: due("Arrivi dal telefono", "Files from your phone"), spiegazione: due("Il computer ascolta la rete e il telefono gli manda i video.", "The computer listens on the network and your phone sends it videos."), parole: due("collega scollega scorciatoia iphone codice qr wifi caricare mandare video indirizzo", "connect disconnect shortcut iphone code qr wifi upload send video address") },
  "telefono.studio": { sezione: "telefono", nome: due("Lo studio dal telefono", "The studio on your phone"), spiegazione: due("Si usa lo studio intero dal telefono: i video, il montaggio e la chat.", "You use the whole studio from your phone: the videos, the edit and the chat."), parole: due("tailscale link chiave codice qr fuori casa accesso rifai", "tailscale link key code qr away from home access renew") },

  "generale.lingua": { sezione: "generale", nome: due("Lingua", "Language"), spiegazione: due("Vale per questo schermo: sul telefono si sceglie da lì.", "It applies to this screen: on your phone you choose it there."), parole: due("italiano inglese english traduzione", "italiano translation") },
  "generale.tema": { sezione: "generale", nome: due("Tema", "Theme"), spiegazione: due("Chiaro, scuro o quello del sistema.", "Light, dark or the system's."), parole: due("chiaro scuro notte colori aspetto", "light dark night colors look") },
  "generale.grandezza": { sezione: "generale", nome: due("Grandezza", "Size"), spiegazione: due("Ingrandisce o rimpicciolisce tutto ciò che si vede.", "Makes everything you see larger or smaller."), parole: due("zoom ingrandisci rimpicciolisci testo piccolo grande", "zoom enlarge shrink text small big"), disponibile: () => ponteGrandezza() !== null },
  "generale.dettatura": { sezione: "generale", nome: due("Dettatura", "Dictation"), spiegazione: due("Il microfono nella chat: le parole si scrivono mentre parli.", "The microphone in the chat: words are written while you speak."), parole: due("microfono voce parlare dettare", "microphone voice speak dictate") },
  "generale.cartella": { sezione: "generale", nome: due("Cartella dei dati", "Data folder"), spiegazione: due("Qui stanno i tuoi video e il girato.", "Your videos and footage are here."), parole: due("sposta percorso disco archivio dove sono i video", "move path disk archive where the videos are"), disponibile: () => ponteCartella() !== null },

  "aiuto.versione": { sezione: "aiuto", nome: due("Versione", "Version"), spiegazione: due("Controlla se è uscita una versione nuova.", "Checks whether a new version is out."), parole: due("aggiornamento aggiorna controlla ora nuova ultima riavvia", "update check now new latest restart"), disponibile: () => ponteAiuto() !== null },
  "aiuto.aggiornaDaSolo": { sezione: "aiuto", nome: due("Aggiorna da solo", "Update by itself"), spiegazione: due("All'avvio cerca le versioni nuove e propone di aggiornare.", "At start it looks for new versions and offers to update."), parole: due("aggiornamenti automatico avvio scarica", "updates automatic start download"), disponibile: () => ponteAiuto() !== null },
  "aiuto.guida": { sezione: "aiuto", nome: due("Come si usa", "How to use it"), spiegazione: due("La guida: dall'installazione al primo video pubblicato.", "The guide: from installing to the first published video."), parole: due("guida istruzioni manuale aiuto", "guide instructions manual help") },
  "aiuto.segnala": { sezione: "aiuto", nome: due("Segnala un problema", "Report a problem"), spiegazione: due("Scrivi cosa è successo; puoi includere una schermata della finestra.", "Write what happened; you can include a screenshot of the window."), parole: due("errore bug non funziona schermata invia", "error bug not working screenshot send"), disponibile: () => ponteSegnalazione() !== null },
  "aiuto.registri": { sezione: "aiuto", nome: due("Registri", "Logs"), spiegazione: due("Per chi ti aiuta a capire un errore.", "For whoever helps you understand an error."), parole: due("log cartella errori apri", "folder errors open"), disponibile: () => ponteAiuto() !== null },
} as const satisfies Record<string, Definizione>

export type IdRiga = keyof typeof RIGHE

const nellaLingua = (c: Coppia): string => (lingua() === "it" ? c.it : c.en)

/** Il nome e a cosa serve una riga, nella lingua in uso. */
export function testoDi(id: IdRiga): { nome: string; spiegazione: string } {
  const r: Definizione = RIGHE[id]
  return { nome: nellaLingua(r.nome), spiegazione: r.spiegazione ? nellaLingua(r.spiegazione) : "" }
}

const semplice = (testo: string): string => testo.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

const parole = (testo: string): string[] => semplice(testo).split(/[^a-z0-9]+/).filter((p) => p !== "")

export interface Trovata {
  id: IdRiga
  sezione: SezioneImpostazioni
  nome: string
}

/** Le righe che hanno tutte le parole scritte (anche solo l'inizio di una parola), in italiano o in inglese, senza badare a maiuscole e accenti. Prima quelle che le hanno nel nome. */
export function cerca(domanda: string): Trovata[] {
  const volute = parole(domanda)
  if (volute.length === 0) return []
  const trovate = (Object.keys(RIGHE) as IdRiga[]).flatMap((id) => {
    const r: Definizione = RIGHE[id]
    if (r.disponibile && !r.disponibile()) return []
    const nome = parole(`${r.nome.it} ${r.nome.en}`)
    const tutto = [...nome, ...parole([r.spiegazione?.it, r.spiegazione?.en, r.parole?.it, r.parole?.en].filter(Boolean).join(" "))]
    const hanno = (nelle: string[]) => volute.every((v) => nelle.some((p) => p.startsWith(v)))
    if (!hanno(tutto)) return []
    return [{ trovata: { id, sezione: r.sezione, nome: nellaLingua(r.nome) }, nelNome: hanno(nome), paroleDelNome: parole(nellaLingua(r.nome)).length }]
  })
  const nelNome = trovate.filter((x) => x.nelNome).sort((a, b) => a.paroleDelNome - b.paroleDelNome)
  return [...nelNome, ...trovate.filter((x) => !x.nelNome)].map((x) => x.trovata)
}
