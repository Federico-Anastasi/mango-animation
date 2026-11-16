// «Cosa fa girare il mio computer?»: le funzioni pesanti, ognuna con il suo interruttore e, dove ha una scelta, dove gira (`motori` del profilo, `PUT /api/motori`); poi ciò che l'app misura del computer.
import { useCallback, useEffect, useState } from "react"
import { Bottone } from "../comuni/Bottone"
import { CardDiRighe, Riga } from "../comuni/CardDiRighe"
import { Interruttore } from "../comuni/Interruttore"
import { Caricamento, Errore } from "../comuni/Stati"
import { useCopia } from "../dati"
import { Menu } from "../impostazioni/Controlli"
import { fraseDi } from "../impostazioni/rifiuto"
import { testoDi, type IdRiga } from "../impostazioni/righe"
import { Testata } from "../impostazioni/Testata"
import { t } from "../lingua"
import type { DoveGira, FunzioneMotore, NomeMotore } from "../tipi"
import { numero, peso } from "../testo"
import { macchina, motori } from "./copia"
import { dellaScheda, giudizioDi, ponteComputer, type ComputerLetto, type Giudizio, type MacchinaDelProfilo } from "./computer"
import { useMotori } from "./useMotori"
import pagina from "../impostazioni/Impostazioni.module.css"
import styles from "./Motori.module.css"

interface Funzione {
  nome: NomeMotore
  riga: IdRiga
  /** `false`: la funzione gira solo sul processore, non c'è niente da scegliere. */
  conDove: boolean
  /** `true`: si accende e si spegne altrove (la dettatura sta in «Generale»); qui si sceglie solo dove gira. */
  soloDove?: boolean
}

const FUNZIONI: readonly Funzione[] = [
  { nome: "trascrizione", riga: "computer.trascrizione", conDove: true },
  { nome: "allineamento", riga: "computer.allineamento", conDove: true },
  { nome: "sagoma", riga: "computer.sagoma", conDove: true },
  { nome: "segui", riga: "computer.segui", conDove: true },
  { nome: "pulizia_voce", riga: "computer.pulizia_voce", conDove: false },
  { nome: "dettatura", riga: "computer.dettatura", conDove: true, soloDove: true },
]

const AUTOMATICO = "automatico"

type Lettura = { tipo: "assente" } | { tipo: "in corso" } | { tipo: "errore"; frase: string } | { tipo: "letto"; computer: ComputerLetto }

const frase = (e: unknown): string => fraseDi(e, t("l'app non risponde", "the app is not answering"))

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
  const questo = testoDi("computer.questo")
  const spiegazioneDelControllo =
    lettura.tipo === "assente"
      ? t("Il controllo del computer c'è solo nell'app Mango Animation: da qui non si può dire se una scelta è possibile su questo computer.", "The computer check is only in the Mango Animation app: from here it cannot say whether a choice is possible on this computer.")
      : lettura.tipo === "in corso"
        ? t("Guardo cosa c'è in questo computer…", "Looking at what this computer has…")
        : lettura.tipo === "errore"
          ? t("Non è riuscito: riprova quando vuoi.", "It did not work: try again whenever you like.")
          : t("Letto adesso, dall'app.", "Read just now, by the app.")
  return (
    <>
      <CardDiRighe nome={questo.nome}>
        {lettura.tipo === "letto" && (
          <>
            {lettura.computer.schede.length === 0 ? (
              <Riga nome={t("Scheda video", "Video card")} spiegazione={t("nessuna scheda NVIDIA", "no NVIDIA card")}>
                {null}
              </Riga>
            ) : (
              lettura.computer.schede.map((s) => (
                <Riga
                  key={s.indice}
                  nome={t("Scheda video", "Video card")}
                  spiegazione={`${s.nome}: ${t("{libera} liberi su {totale}", "{libera} free of {totale}", { libera: peso(s.libera_mb * MB), totale: peso(s.memoria_mb * MB) })}${s.capacita !== null ? `, ${t("capacità di calcolo {capacita}", "compute capability {capacita}", { capacita: s.capacita })}` : ""}`}
                >
                  {null}
                </Riga>
              ))
            )}
            <Riga nome={t("Processore", "Processor")} spiegazione={t("{nome}, {thread} thread", "{nome}, {thread} threads", { nome: lettura.computer.processore, thread: lettura.computer.thread })}>
              {null}
            </Riga>
            <Riga nome={t("Memoria", "Memory")} spiegazione={peso(lettura.computer.ram_mb * MB)}>
              {null}
            </Riga>
            <Riga nome={t("Disco libero", "Free disk")} spiegazione={t("{libero} GB dove l'app scarica", "{libero} GB where the app downloads", { libero: numero(lettura.computer.disco_libero_mb / 1024, 1) })}>
              {null}
            </Riga>
          </>
        )}
        <Riga nome={t("Controllo", "Check")} spiegazione={spiegazioneDelControllo}>
          {(lettura.tipo === "letto" || lettura.tipo === "errore") && <Bottone onClick={onRileggi}>{t("Controlla di nuovo", "Check again")}</Bottone>}
        </Riga>
      </CardDiRighe>
      {lettura.tipo === "errore" && (
        <p className={pagina.errore} role="alert">
          {t("Non riesco a guardare il computer: {frase}", "I cannot look at the computer: {frase}", { frase: lettura.frase })}
        </p>
      )}
    </>
  )
}

function RigaFunzione({ funzione, scelta, occupato, giudizio, schedaPossibile, onCambia }: { funzione: Funzione; scelta: FunzioneMotore; occupato: boolean; giudizio: Giudizio | null; schedaPossibile: boolean; onCambia: (nuova: FunzioneMotore) => void }) {
  const attiva = scelta.attiva !== false
  const testo = testoDi(funzione.riga)
  const cambiaDove = (valore: string) => {
    const nuova: FunzioneMotore = { ...scelta }
    if (valore === AUTOMATICO) delete nuova.dove
    else nuova.dove = valore as DoveGira
    onCambia(nuova)
  }
  const spiegazione = funzione.soloDove && !attiva ? t("Spenta in Generale: si accende e si spegne là.", "Off in General: it is turned on and off there.") : testo.spiegazione
  return (
    <>
      <Riga nome={testo.nome} spiegazione={spiegazione}>
        {funzione.conDove && (
          <Menu etichetta={funzione.soloDove ? testo.nome : t("Dove gira: {funzione}", "Where it runs: {funzione}", { funzione: testo.nome })} valore={scelta.dove ?? AUTOMATICO} disabled={occupato || !attiva} onCambia={cambiaDove}>
            <option value={AUTOMATICO}>{t("Come decide il computer", "As the computer decides")}</option>
            <option value="scheda" disabled={!schedaPossibile && scelta.dove !== "scheda"}>
              {schedaPossibile || scelta.dove === "scheda" ? t("Scheda video", "Graphics card") : t("Scheda video (non possibile qui)", "Graphics card (not possible here)")}
            </option>
            <option value="processore">{t("Processore", "Processor")}</option>
          </Menu>
        )}
        {!funzione.soloDove && <Interruttore etichetta={testo.nome} acceso={attiva} disabled={occupato} onCambia={(acceso) => onCambia({ ...scelta, attiva: acceso })} />}
      </Riga>
      {giudizio && attiva && (
        <li className={styles.giudizio} data-stato={giudizio.stato} role={giudizio.stato === "no" ? "alert" : undefined}>
          {giudizio.frase}
        </li>
      )}
    </>
  )
}

export function Motori() {
  const { dato, errore, occupato, rifiuto, cambia } = useMotori()
  const profilo = useCopia(macchina).dato
  const { lettura, rileggi } = useComputer()

  if (errore && !dato) return <Errore messaggio={errore} onRiprova={() => void motori.rileggi()} />
  if (!dato) return <Caricamento />

  return (
    <div className={pagina.sezione}>
      <Testata
        titolo="Computer"
        sotto={t(
          "Per ogni funzione pesante: se la vuoi e dove gira. Se la scelta non può partire (la scheda manca o è occupata), il lavoro si ferma e dice cosa correggere: non passa mai da solo al processore.",
          "For each heavy function: whether you want it and where it runs. If the choice cannot start (the card is missing or busy), the job stops and says what to fix: it never falls back to the processor by itself.",
        )}
      />
      {rifiuto && (
        <p className={pagina.errore} role="alert">
          {rifiuto}
        </p>
      )}
      <CardDiRighe nome={t("Funzioni pesanti", "Heavy functions")}>
        {FUNZIONI.map((f) => {
          const scelta = dato[f.nome] ?? {}
          const computer = lettura.tipo === "letto" ? lettura.computer : null
          const della: MacchinaDelProfilo = profilo ?? {}
          const giudizio = computer && f.conDove ? giudizioDi(f.nome, scelta.dove, computer, della) : null
          const schedaPossibile = computer === null || dellaScheda(f.nome, computer, della).stato !== "no"
          return <RigaFunzione key={f.nome} funzione={f} scelta={scelta} occupato={occupato} giudizio={giudizio} schedaPossibile={schedaPossibile} onCambia={(nuova) => cambia(f.nome, nuova)} />
        })}
      </CardDiRighe>
      <QuestoComputer lettura={lettura} onRileggi={rileggi} />
    </div>
  )
}
