// Aiuto, uguale in ogni app Mango: la versione e gli aggiornamenti, la guida, la segnalazione e i registri. Ciò che chiede l'app (`window.__MANGO_ANIMATION__.aiuto`)
// nel browser non c'è e non compare; la guida sì.
import { useEffect, useState } from "react"
import { Bottone } from "../comuni/Bottone"
import bottone from "../comuni/Bottone.module.css"
import { CardDiRighe, Riga } from "../comuni/CardDiRighe"
import { lavori, useCopia } from "../dati"
import { EtichettaDiStato } from "../comuni/EtichettaDiStato"
import { Interruttore } from "../comuni/Interruttore"
import { lingua, t } from "../lingua"
import { FormSegnalazione } from "../segnalazione/FormSegnalazione"
import { ponteSegnalazione } from "../segnalazione/ponte"
import { ponteAiuto } from "./ponteAiuto"
import { fraseDi } from "./rifiuto"
import { testoDi } from "./righe"
import { Testata } from "./Testata"
import styles from "./Impostazioni.module.css"

const GUIDA = "https://github.com/Federico-Anastasi/mango-animation/blob/main/docs/guida"

type Controllo = { fase: "fermo" } | { fase: "controllo" } | { fase: "fatto"; nuova: string | null }

interface Dati {
  versione: string
  aggiornaDaSolo: boolean
}

function Versione({ dati, onErrore }: { dati: Dati; onErrore: (frase: string | null) => void }) {
  const [controllo, setControllo] = useState<Controllo>({ fase: "fermo" })
  const [aggiornaDaSolo, setAggiornaDaSolo] = useState(dati.aggiornaDaSolo)
  const versione = testoDi("aiuto.versione")
  const automatico = testoDi("aiuto.aggiornaDaSolo")

  const controlla = () => {
    onErrore(null)
    setControllo({ fase: "controllo" })
    ponteAiuto()
      ?.controlla()
      .then(
        ({ nuova }) => setControllo({ fase: "fatto", nuova }),
        (e: unknown) => {
          setControllo({ fase: "fermo" })
          onErrore(fraseDi(e, t("Non riesco a controllare se c'è una versione nuova.", "I cannot check whether there is a new version.")))
        },
      )
  }

  const cambiaAutomatico = (acceso: boolean) => {
    onErrore(null)
    ponteAiuto()
      ?.aggiornaDaSolo(acceso)
      .then(
        () => setAggiornaDaSolo(acceso),
        (e: unknown) => onErrore(fraseDi(e, t("Non riesco a cambiare questa scelta.", "I cannot change this choice."))),
      )
  }

  // L'aggiornamento chiude l'app, e con lei il lavoro che gira.
  const code = useCopia(lavori).dato
  const occupato = code != null && (code.in_corso !== null || code.in_coda.length > 0)
  const riavvia = () => {
    onErrore(null)
    ponteAiuto()
      ?.riavviaEAggiorna()
      .catch((e: unknown) => onErrore(fraseDi(e, t("Non riesco a riavviare l'app.", "I cannot restart the app."))))
  }

  return (
    <CardDiRighe nome={t("Versione", "Version")}>
      <Riga nome={`Mango Animation ${dati.versione}`} spiegazione={versione.spiegazione}>
        {controllo.fase === "controllo" && <EtichettaDiStato stato="in-corso">{t("Controllo in corso…", "Checking…")}</EtichettaDiStato>}
        {controllo.fase === "fatto" && controllo.nuova === null && <EtichettaDiStato stato="pronto">{t("Hai l'ultima versione", "You have the latest version")}</EtichettaDiStato>}
        {controllo.fase === "fatto" && controllo.nuova !== null && <EtichettaDiStato stato="in-corso">{t("C'è la versione {nuova}", "Version {nuova} is out", { nuova: controllo.nuova })}</EtichettaDiStato>}
        {controllo.fase === "fatto" && controllo.nuova !== null ? (
          <Bottone
            variante="principale"
            disabled={occupato}
            titolo={occupato ? t("C'è un lavoro in corso o in attesa: aggiornare lo fermerebbe. Aspetta che finisca.", "A job is running or waiting: updating would stop it. Wait for it to finish.") : undefined}
            onClick={riavvia}
          >
            {t("Riavvia e aggiorna", "Restart and update")}
          </Bottone>
        ) : (
          <Bottone disabled={controllo.fase === "controllo"} onClick={controlla}>
            {t("Controlla ora", "Check now")}
          </Bottone>
        )}
      </Riga>
      <Riga
        nome={automatico.nome}
        spiegazione={aggiornaDaSolo ? automatico.spiegazione : t("Spento: all'avvio non cerca versioni nuove. «Controlla ora» le cerca quando vuoi.", "Off: at start it does not look for new versions. \"Check now\" looks for them whenever you like.")}
      >
        <Interruttore etichetta={automatico.nome} acceso={aggiornaDaSolo} onCambia={cambiaAutomatico} />
      </Riga>
    </CardDiRighe>
  )
}

export function Aiuto() {
  const [dati, setDati] = useState<Dati | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [scrivo, setScrivo] = useState(false)
  const guida = testoDi("aiuto.guida")
  const segnala = testoDi("aiuto.segnala")
  const registri = testoDi("aiuto.registri")

  useEffect(() => {
    ponteAiuto()
      ?.leggi()
      .then(setDati, (e: unknown) => setErrore(fraseDi(e, t("L'app non risponde.", "The app is not answering."))))
  }, [])

  const apriRegistri = () => {
    setErrore(null)
    ponteAiuto()
      ?.apriRegistri()
      .catch((e: unknown) => setErrore(fraseDi(e, t("Non riesco ad aprire la cartella dei registri.", "I cannot open the logs folder."))))
  }

  return (
    <div className={styles.sezione}>
      <Testata titolo={t("Aiuto", "Help")} />
      {dati && <Versione dati={dati} onErrore={setErrore} />}
      <CardDiRighe nome={t("Se serve una mano", "If you need a hand")}>
        <Riga nome={guida.nome} spiegazione={guida.spiegazione}>
          <a className={`${bottone.bottone} ${styles.comeBottone}`} data-variante="normale" data-comebottone href={`${GUIDA}/${lingua() === "it" ? "italiano" : "english"}.md`} target="_blank" rel="noreferrer">
            {t("Apri la guida", "Open the guide")}
          </a>
        </Riga>
        {ponteSegnalazione() && (
          <Riga nome={segnala.nome} spiegazione={segnala.spiegazione}>
            <Bottone onClick={() => setScrivo(!scrivo)}>{scrivo ? t("Chiudi", "Close") : t("Scrivi", "Write")}</Bottone>
          </Riga>
        )}
        {ponteAiuto() && (
          <Riga nome={registri.nome} spiegazione={registri.spiegazione}>
            <Bottone variante="minore" onClick={apriRegistri}>
              {t("Apri la cartella", "Open the folder")}
            </Bottone>
          </Riga>
        )}
      </CardDiRighe>
      {scrivo && ponteSegnalazione() && (
        <div className={styles.scheda}>
          <FormSegnalazione />
        </div>
      )}
      {errore && (
        <p className={styles.errore} role="alert">
          {errore}
        </p>
      )}
    </div>
  )
}
