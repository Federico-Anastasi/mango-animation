// «Chi sono per Mango Animation?»: i campi di `profilo.json` che il creator può correggere a mano (`docs/PROFILO.md`). Si salvano insieme, e il server li controlla con lo schema.
import { useState } from "react"
import { api } from "../api"
import { avviaPrimoGiro, chiediAllaChat } from "../chat/primoGiro"
import { Bottone } from "../comuni/Bottone"
import { CardDiRighe, Riga } from "../comuni/CardDiRighe"
import { AGGIORNA_TIKTOK, LEGGI_TIKTOK } from "../comuni/PaginaVuota"
import { Segmenti } from "../comuni/Segmenti"
import { Caricamento, Errore } from "../comuni/Stati"
import { profilo, useCopia } from "../dati"
import { t } from "../lingua"
import { CANALI } from "../video/liste"
import { daProfilo, FORMATI, inSezioni, type CanaleScritto, type ProfiloScritto } from "./campiProfilo"
import { AreaDiTesto, Campo } from "./Controlli"
import { testoDi } from "./righe"
import { Testata } from "./Testata"
import styles from "./Impostazioni.module.css"

const LINGUE = [
  { id: "it", nome: "Italiano" },
  { id: "en", nome: "English" },
]

const nomeFormato = (f: string) => (f === "verticale" ? t("Verticale", "Vertical") : t("Orizzontale", "Horizontal"))

/** Una lingua fra quelle che lo studio conosce; se il profilo ne ha un'altra, si vede com'è scritta e resta quella finché non si sceglie. */
function SceltaLingua({ etichetta, valore, onCambia }: { etichetta: string; valore: string; onCambia: (nuova: string) => void }) {
  const altra = valore !== "" && !LINGUE.some((l) => l.id === valore)
  const valori = [{ id: "", nome: t("Non detta", "Not set") }, ...LINGUE, ...(altra ? [{ id: valore, nome: valore }] : [])]
  return <Segmenti etichetta={etichetta} valori={valori} scelta={valore} onScegli={onCambia} />
}

function RigaCanale({ numero, canale, onCambia, onTogli }: { numero: number; canale: CanaleScritto; onCambia: (nuovo: CanaleScritto) => void; onTogli: () => void }) {
  const nome = CANALI.find((c) => c.id === canale.piattaforma)?.nome ?? canale.piattaforma
  return (
    <Riga nome={t("Canale {numero}", "Channel {numero}", { numero })}>
      <Segmenti etichetta={t("Piattaforma", "Platform")} valori={CANALI.map((c) => ({ id: c.id, nome: c.nome }))} scelta={canale.piattaforma} onScegli={(piattaforma) => onCambia({ ...canale, piattaforma })} />
      <Campo etichetta={t("Nome del canale su {nome}", "Channel name on {nome}", { nome })} segnaposto={t("Nome del canale", "Channel name")} valore={canale.nome} onCambia={(nuovo) => onCambia({ ...canale, nome: nuovo })} />
      <Segmenti
        etichetta={t("Formato dei video su {nome}", "Video format on {nome}", { nome })}
        valori={[{ id: "", nome: t("Non detto", "Not set") }, ...FORMATI.map((f) => ({ id: f, nome: nomeFormato(f) }))]}
        scelta={canale.formato}
        onScegli={(formato) => onCambia({ ...canale, formato })}
      />
      <Bottone variante="distrugge" onClick={onTogli} etichetta={t("Togli il canale {nome}", "Remove the {nome} channel", { nome })}>
        {t("Togli", "Remove")}
      </Bottone>
    </Riga>
  )
}

export function Profilo() {
  const copia = useCopia(profilo)
  const stato = copia.dato
  // `da` è il profilo del server quando si è cominciato a scrivere: se cambia mentre si scrive (la chat lo corregge), salvando lo si sostituirebbe.
  const [bozza, setBozza] = useState<{ da: string; valori: ProfiloScritto } | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [invio, setInvio] = useState(false)
  const [salvato, setSalvato] = useState(false)

  if (!stato) return copia.errore ? <Errore messaggio={copia.errore} onRiprova={() => void profilo.rileggi()} /> : <Caricamento />

  const titolo = t("Profilo", "Profile")
  const sotto = t(
    "Chi sei, a chi parli e dove pubblichi: è ciò che leggo prima di proporre, scrivere o tagliare un video. Puoi anche dirlo in chat («cambia il mio nome», «non dico mai…»): ciò che scrive la chat compare qui.",
    "Who you are, who you talk to and where you publish: it is what I read before proposing, writing or cutting a video. You can also say it in the chat (\"change my name\", \"I never say…\"): what the chat writes shows up here.",
  )

  if (!stato.valido) {
    return (
      <div className={styles.sezione}>
        <Testata titolo={titolo} sotto={sotto} />
        <p className={styles.nota}>{t("Il profilo non passa il controllo (i motivi sono qui sopra): finché non lo correggi, da qui non si cambia niente. Chiedi nella chat di correggerlo, oppure correggi il file a mano.", "The profile does not pass the check (the reasons are above): until you fix it, nothing can be changed from here. Ask in the chat to fix it, or fix the file by hand.")}</p>
      </div>
    )
  }

  // Un profilo scritto a mano prima del primo giro lo farebbe sembrare fatto: il giro non partirebbe più e non nascerebbero le regole e lo stile che scrive.
  if (!stato.presente) {
    return (
      <div className={styles.sezione}>
        <Testata titolo={titolo} sotto={sotto} />
        <section className={styles.avviso} aria-label={t("Il primo giro", "The first round")}>
          <span>{t("Non hai ancora un profilo. Si comincia dal primo giro in chat: ti faccio qualche domanda e scrivo io il profilo, il tuo stile e le tue regole. Poi lo correggi qui.", "You do not have a profile yet. It starts with the first round in the chat: I ask a few questions and write your profile, your style and your rules. Then you can fix it here.")}</span>
          <Bottone variante="principale" onClick={() => avviaPrimoGiro(false)}>
            {t("Fai il primo giro", "Do the first round")}
          </Bottone>
        </section>
      </div>
    )
  }

  const dalServer = JSON.stringify(stato.profilo)
  const valori = bozza?.valori ?? daProfilo(stato.profilo)
  const modificato = bozza !== null && JSON.stringify(bozza.valori) !== JSON.stringify(daProfilo(stato.profilo))
  const cambiatoAltrove = bozza !== null && bozza.da !== dalServer
  const cambia = (nuovi: Partial<ProfiloScritto>) => {
    setBozza({ da: bozza?.da ?? dalServer, valori: { ...valori, ...nuovi } })
    setSalvato(false)
  }
  const cambiaCanale = (i: number, nuovo: CanaleScritto) => cambia({ canali: valori.canali.map((c, k) => (k === i ? nuovo : c)) })
  const scarta = () => {
    setBozza(null)
    setErrore(null)
  }
  const salva = () => {
    setInvio(true)
    setErrore(null)
    api
      .scriviProfilo(inSezioni(valori))
      .then(() => profilo.rileggi())
      .then(
        () => {
          setBozza(null)
          setSalvato(true)
        },
        (e: Error) => setErrore(e.message),
      )
      .finally(() => setInvio(false))
  }
  const conTikTok = stato.canali.some((c) => c.piattaforma === "tiktok")
  const nome = testoDi("profilo.nome")
  const linguaDelCreator = testoDi("profilo.lingua")
  const livello = testoDi("profilo.livello")
  const linguaDelPubblico = testoDi("profilo.linguaPubblico")
  const testate = testoDi("profilo.testate")
  const canali = testoDi("profilo.canali")
  const numeri = testoDi("profilo.numeri")
  const nonSiDice = testoDi("profilo.nonSiDice")

  return (
    <div className={styles.sezione}>
      <Testata titolo={titolo} sotto={sotto}>
        {salvato && !modificato && <span className={styles.fatto}>{t("Salvato", "Saved")}</span>}
        <Bottone variante="minore" onClick={scarta} disabled={!modificato || invio}>
          {t("Annulla le modifiche", "Discard changes")}
        </Bottone>
        <Bottone variante="principale" onClick={salva} disabled={!modificato || invio}>
          {t("Salva", "Save")}
        </Bottone>
      </Testata>
      {cambiatoAltrove && (
        <div className={styles.avviso} role="status">
          <span>{t("Il profilo è cambiato mentre lo modificavi (forse l'ha corretto la chat): se salvi, lo sostituisci con ciò che vedi qui.", "The profile changed while you were editing it (the chat may have fixed it): if you save, you replace it with what you see here.")}</span>
          <Bottone onClick={scarta}>{t("Ricarica dal profilo", "Reload from the profile")}</Bottone>
        </div>
      )}
      {errore && (
        <p className={styles.errore} role="alert">
          {errore}
        </p>
      )}

      <CardDiRighe nome={t("Chi sei", "Who you are")}>
        <Riga nome={nome.nome} spiegazione={nome.spiegazione}>
          <Campo etichetta={nome.nome} valore={valori.nome} onCambia={(nuovo) => cambia({ nome: nuovo })} />
        </Riga>
        <Riga nome={linguaDelCreator.nome} spiegazione={linguaDelCreator.spiegazione}>
          <SceltaLingua etichetta={linguaDelCreator.nome} valore={valori.lingua} onCambia={(lingua) => cambia({ lingua })} />
        </Riga>
      </CardDiRighe>

      <CardDiRighe nome={t("Il tuo pubblico", "Your audience")}>
        <Riga nome={livello.nome} spiegazione={livello.spiegazione}>
          <Campo etichetta={livello.nome} valore={valori.livello} onCambia={(nuovo) => cambia({ livello: nuovo })} />
        </Riga>
        <Riga nome={linguaDelPubblico.nome} spiegazione={linguaDelPubblico.spiegazione}>
          <SceltaLingua etichetta={linguaDelPubblico.nome} valore={valori.linguaPubblico} onCambia={(linguaPubblico) => cambia({ linguaPubblico })} />
        </Riga>
        <Riga nome={testate.nome} spiegazione={testate.spiegazione}>
          <Campo etichetta={testate.nome} valore={valori.testate} onCambia={(nuovo) => cambia({ testate: nuovo })} />
        </Riga>
      </CardDiRighe>

      <CardDiRighe nome={canali.nome}>
        {valori.canali.map((c, i) => (
          <RigaCanale key={i} numero={i + 1} canale={c} onCambia={(nuovo) => cambiaCanale(i, nuovo)} onTogli={() => cambia({ canali: valori.canali.filter((_, k) => k !== i) })} />
        ))}
        <Riga nome={t("Un altro canale", "Another channel")} spiegazione={canali.spiegazione}>
          <Bottone onClick={() => cambia({ canali: [...valori.canali, { piattaforma: "tiktok", nome: "", formato: "" }] })}>{t("Aggiungi un canale", "Add a channel")}</Bottone>
        </Riga>
        {conTikTok ? (
          <Riga nome={numeri.nome} spiegazione={numeri.spiegazione}>
            <Bottone onClick={() => chiediAllaChat(AGGIORNA_TIKTOK(), { conBrowser: true })}>{LEGGI_TIKTOK()}</Bottone>
          </Riga>
        ) : (
          <Riga nome={numeri.nome} spiegazione={t("Per ora i numeri del canale si leggono solo da TikTok.", "For now the channel numbers can only be read from TikTok.")}>
            {null}
          </Riga>
        )}
      </CardDiRighe>

      <CardDiRighe nome={nonSiDice.nome}>
        <Riga nome={t("Da evitare", "To avoid")} spiegazione={nonSiDice.spiegazione}>
          <AreaDiTesto etichetta={t("Una cosa per riga", "One thing per line")} righe={Math.max(3, valori.nonSiDice.split("\n").length + 1)} valore={valori.nonSiDice} onCambia={(nuovo) => cambia({ nonSiDice: nuovo })} />
        </Riga>
      </CardDiRighe>
    </div>
  )
}
