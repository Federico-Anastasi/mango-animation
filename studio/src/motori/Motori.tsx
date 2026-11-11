import { useCallback, useEffect, useState } from "react"
import { Caricamento, Errore } from "../comuni/Stati"
import { useCopia } from "../dati"
import { t } from "../lingua"
import type { DoveGira, FunzioneMotore, NomeMotore, Motori as MotoriDelProfilo } from "../tipi"
import { numero, peso } from "../testo"
import { macchina, motori, scriviMotori } from "./copia"
import { dellaScheda, giudizioDi, ponteComputer, type ComputerLetto, type Giudizio, type MacchinaDelProfilo } from "./computer"
import styles from "./Motori.module.css"

interface Funzione {
  nome: NomeMotore
  titolo: string
  cosaFa: string
  /** `false`: la funzione gira solo sul processore, non c'è niente da scegliere. */
  conDove: boolean
}

const funzioni = (): Funzione[] => [
  { nome: "trascrizione", conDove: true, titolo: t("Capire cosa dico", "Understanding what I say"), cosaFa: t("Trascrive il parlato: servono i sottotitoli parola per parola e i pezzi scelti a parole.", "Transcribes your speech: needed for subtitles that appear word by word and for clips picked by words.") },
  { nome: "allineamento", conDove: true, titolo: t("Tagli precisi sulle parole", "Precise cuts on words"), cosaFa: t("Trova dove comincia e dove finisce ogni parola. Spento, i tagli si cercano sul livello della voce.", "Finds where each word starts and ends. Off, cuts are found from the level of the voice.") },
  { nome: "sagoma", conDove: true, titolo: t("La mia sagoma sopra le animazioni", "My silhouette over the animations"), cosaFa: t("Ritaglia la persona dallo sfondo. Spenta, le sagome già fatte restano, ma non ne parte una nuova.", "Cuts the person out of the background. Off, silhouettes already made stay, but no new one starts.") },
  { nome: "segui", conDove: true, titolo: t("Seguire la persona nelle riprese larghe", "Following the person in wide shots"), cosaFa: t("Tiene la persona al centro nelle viste che la seguono. Serve solo a chi riprende da lontano.", "Keeps the person centred in views that follow them. Only needed when you film from far away.") },
  { nome: "pulizia_voce", conDove: false, titolo: t("Voce pulita", "Clean voice"), cosaFa: t("Toglie il rumore di fondo dalla voce del video montato. Gira sul processore.", "Removes background noise from the voice in the edited video. Runs on the processor.") },
  { nome: "dettatura", conDove: true, titolo: t("Dettare alla chat", "Dictating to the chat"), cosaFa: t("Il microfono nella chat: le parole si scrivono mentre parli.", "The microphone in the chat: words are written while you speak.") },
]

const AUTOMATICO = "automatico"

type Lettura = { tipo: "assente" } | { tipo: "in corso" } | { tipo: "errore"; frase: string } | { tipo: "letto"; computer: ComputerLetto }

const frase = (e: unknown): string => {
  const messaggio = typeof e === "object" && e !== null ? (e as { message?: unknown }).message : e
  return typeof messaggio === "string" && messaggio !== "" ? messaggio : t("l'app non risponde", "the app is not answering")
}

function useComputer(): { lettura: Lettura; rileggi: () => void } {
  const [lettura, setLettura] = useState<Lettura>(() => (ponteComputer() ? { tipo: "in corso" } : { tipo: "assente" }))
  const rileggi = useCallback(() => {
    const ponte = ponteComputer()
    if (!ponte) return setLettura({ tipo: "assente" })
    setLettura({ tipo: "in corso" })
    ponte.leggi().then(
      (computer) => setLettura({ tipo: "letto", computer }),
      (e: unknown) => setLettura({ tipo: "errore", frase: frase(e) }),
    )
  }, [])
  useEffect(rileggi, [rileggi])
  return { lettura, rileggi }
}

const MB = 1024 * 1024

function QuestoComputer({ lettura, onRileggi }: { lettura: Lettura; onRileggi: () => void }) {
  return (
    <section className={styles.computer} aria-label={t("Questo computer", "This computer")}>
      <div className={styles.testataComputer}>
        <h2>{t("Questo computer", "This computer")}</h2>
        {(lettura.tipo === "letto" || lettura.tipo === "errore") && (
          <button type="button" className={styles.rileggi} onClick={onRileggi}>
            {t("Controlla di nuovo", "Check again")}
          </button>
        )}
      </div>
      {lettura.tipo === "assente" && <p className={styles.nota}>{t("Il controllo del computer c'è solo nell'app Mango Animation: da qui non si può dire se una scelta è possibile su questo computer.", "The computer check is only in the Mango Animation app: from here it cannot say whether a choice is possible on this computer.")}</p>}
      {lettura.tipo === "in corso" && <p className={styles.nota}>{t("Guardo cosa c'è in questo computer…", "Looking at what this computer has…")}</p>}
      {lettura.tipo === "errore" && (
        <p className={styles.errore} role="alert">
          {t("Non riesco a guardare il computer: {frase}", "I cannot look at the computer: {frase}", { frase: lettura.frase })}
        </p>
      )}
      {lettura.tipo === "letto" && (
        <dl className={styles.misure}>
          <div>
            <dt>{t("Scheda video", "Video card")}</dt>
            <dd>
              {lettura.computer.schede.length === 0 ? (
                t("nessuna scheda NVIDIA", "no NVIDIA card")
              ) : (
                <ul>
                  {lettura.computer.schede.map((s) => (
                    <li key={s.indice}>
                      {s.nome}: {t("{libera} liberi su {totale}", "{libera} free of {totale}", { libera: peso(s.libera_mb * MB), totale: peso(s.memoria_mb * MB) })}
                      {s.capacita !== null && <>, {t("capacità di calcolo {capacita}", "compute capability {capacita}", { capacita: s.capacita })}</>}
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
          <div>
            <dt>{t("Processore", "Processor")}</dt>
            <dd>{t("{nome}, {thread} thread", "{nome}, {thread} threads", { nome: lettura.computer.processore, thread: lettura.computer.thread })}</dd>
          </div>
          <div>
            <dt>{t("Memoria", "Memory")}</dt>
            <dd>{peso(lettura.computer.ram_mb * MB)}</dd>
          </div>
          <div>
            <dt>{t("Disco libero", "Free disk")}</dt>
            <dd>{t("{libero} GB dove l'app scarica", "{libero} GB where the app downloads", { libero: numero(lettura.computer.disco_libero_mb / 1024, 1) })}</dd>
          </div>
        </dl>
      )}
    </section>
  )
}

function RigaFunzione({ funzione, scelta, occupato, giudizio, schedaPossibile, onCambia }: { funzione: Funzione; scelta: FunzioneMotore; occupato: boolean; giudizio: Giudizio | null; schedaPossibile: boolean; onCambia: (nuova: FunzioneMotore) => void }) {
  const attiva = scelta.attiva !== false
  const idTitolo = `motore-${funzione.nome}`
  const cambiaDove = (valore: string) => {
    const nuova: FunzioneMotore = { ...scelta }
    if (valore === AUTOMATICO) delete nuova.dove
    else nuova.dove = valore as DoveGira
    onCambia(nuova)
  }
  return (
    <li className={styles.funzione}>
      <div className={styles.testo}>
        <h3 id={idTitolo}>{funzione.titolo}</h3>
        <p>{funzione.cosaFa}</p>
      </div>
      <label className={styles.interruttore}>
        <input type="checkbox" role="switch" aria-labelledby={idTitolo} checked={attiva} disabled={occupato} onChange={(e) => onCambia({ ...scelta, attiva: e.target.checked })} />
        <span>{attiva ? t("La voglio", "I want it") : t("Spenta", "Off")}</span>
      </label>
      {funzione.conDove && (
        <label className={styles.dove}>
          <span>{t("Dove gira", "Where it runs")}</span>
          <select value={scelta.dove ?? AUTOMATICO} disabled={occupato || !attiva} aria-label={t("Dove gira: {funzione}", "Where it runs: {funzione}", { funzione: funzione.titolo })} onChange={(e) => cambiaDove(e.target.value)}>
            <option value={AUTOMATICO}>{t("Come decide il computer", "As the computer decides")}</option>
            <option value="scheda" disabled={!schedaPossibile && scelta.dove !== "scheda"}>
              {schedaPossibile || scelta.dove === "scheda" ? t("Scheda video", "Graphics card") : t("Scheda video (non possibile qui)", "Graphics card (not possible here)")}
            </option>
            <option value="processore">{t("Processore", "Processor")}</option>
          </select>
        </label>
      )}
      {giudizio && attiva && (
        <p className={styles.giudizio} data-stato={giudizio.stato} role={giudizio.stato === "no" ? "alert" : undefined}>
          {giudizio.frase}
        </p>
      )}
    </li>
  )
}

export function Motori() {
  const { dato, errore } = useCopia(motori)
  const profilo = useCopia(macchina).dato
  const { lettura, rileggi } = useComputer()
  const [occupato, setOccupato] = useState(false)
  const [rifiuto, setRifiuto] = useState<string | null>(null)

  if (errore && !dato) return <Errore messaggio={errore} onRiprova={() => void motori.rileggi()} />
  if (!dato) return <Caricamento />

  const cambia = (nome: NomeMotore, nuova: FunzioneMotore) => {
    const nuovi: MotoriDelProfilo = { ...dato, [nome]: nuova }
    setOccupato(true)
    setRifiuto(null)
    scriviMotori(nuovi)
      .then(() => motori.rileggi())
      .catch((e: Error) => setRifiuto(e.message))
      .finally(() => setOccupato(false))
  }

  return (
    <div className={styles.pagina}>
      <header>
        <h1>Computer</h1>
        <p className={styles.sotto}>
          {t(
            "Per ogni funzione pesante: se la vuoi e dove gira. Se la scelta non può partire (la scheda manca o è occupata), il lavoro si ferma e dice cosa correggere: non passa mai da solo al processore.",
            "For each heavy function: whether you want it and where it runs. If the choice cannot start (the card is missing or busy), the job stops and says what to fix: it never falls back to the processor by itself.",
          )}
        </p>
      </header>
      {rifiuto && (
        <p className={styles.errore} role="alert">
          {rifiuto}
        </p>
      )}
      <QuestoComputer lettura={lettura} onRileggi={rileggi} />
      <ul className={styles.elenco} aria-label={t("Le funzioni", "The functions")}>
        {funzioni().map((f) => {
          const scelta = dato[f.nome] ?? {}
          const computer = lettura.tipo === "letto" ? lettura.computer : null
          const della: MacchinaDelProfilo = profilo ?? {}
          const giudizio = computer && f.conDove ? giudizioDi(f.nome, scelta.dove, computer, della) : null
          const schedaPossibile = computer === null || dellaScheda(f.nome, computer, della).stato !== "no"
          return <RigaFunzione key={f.nome} funzione={f} scelta={scelta} occupato={occupato} giudizio={giudizio} schedaPossibile={schedaPossibile} onCambia={(nuova) => cambia(f.nome, nuova)} />
        })}
      </ul>
    </div>
  )
}
