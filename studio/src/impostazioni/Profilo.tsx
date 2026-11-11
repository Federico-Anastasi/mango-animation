// «Chi sono per Mango Animation?»: i campi di `profilo.json` che il creator può correggere a mano (`docs/PROFILO.md`). Si salvano insieme, e il server li controlla con lo schema.
import { useState, type ReactNode } from "react"
import { api } from "../api"
import { avviaPrimoGiro, chiediAClaude } from "../chat/primoGiro"
import { Bottone } from "../comuni/Bottone"
import { AGGIORNA_TIKTOK, LEGGI_TIKTOK } from "../comuni/PaginaVuota"
import { Caricamento, Errore } from "../comuni/Stati"
import { profilo, useCopia } from "../dati"
import { t } from "../lingua"
import { CANALI } from "../video/liste"
import campi from "../comuni/CampoTesto.module.css"
import { daProfilo, FORMATI, inSezioni, type CanaleScritto, type ProfiloScritto } from "./campiProfilo"
import pagina from "./Impostazioni.module.css"
import styles from "./Profilo.module.css"

const LINGUE = [
  { id: "it", nome: "Italiano" },
  { id: "en", nome: "English" },
]

const nomeFormato = (f: string) => (f === "verticale" ? t("Verticale", "Vertical") : t("Orizzontale", "Horizontal"))

/** Una lingua fra quelle che lo studio conosce; se il profilo ne ha un'altra, si vede com'è scritta e resta quella finché non si sceglie. */
function SceltaLingua({ etichetta, valore, onCambia }: { etichetta: string; valore: string; onCambia: (nuova: string) => void }) {
  const altra = valore !== "" && !LINGUE.some((l) => l.id === valore)
  return (
    <select className={campi.riga} aria-label={etichetta} value={valore} onChange={(e) => onCambia(e.target.value)}>
      <option value="">{t("Non detta", "Not set")}</option>
      {LINGUE.map((l) => (
        <option key={l.id} value={l.id}>
          {l.nome}
        </option>
      ))}
      {altra && <option value={valore}>{valore}</option>}
    </select>
  )
}

function Campo({ etichetta, aiuto, children }: { etichetta: string; aiuto?: string; children: ReactNode }) {
  return (
    <label className={campi.campo}>
      <span className={campi.etichetta}>{etichetta}</span>
      {children}
      {aiuto && <span className={styles.aiuto}>{aiuto}</span>}
    </label>
  )
}

function RigaCanale({ canale, onCambia, onTogli }: { canale: CanaleScritto; onCambia: (nuovo: CanaleScritto) => void; onTogli: () => void }) {
  const nome = CANALI.find((c) => c.id === canale.piattaforma)?.nome ?? canale.piattaforma
  return (
    <li className={styles.canale}>
      <select className={campi.riga} aria-label={t("Piattaforma", "Platform")} value={canale.piattaforma} onChange={(e) => onCambia({ ...canale, piattaforma: e.target.value })}>
        {CANALI.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </select>
      <input className={campi.riga} aria-label={t("Nome del canale su {nome}", "Channel name on {nome}", { nome })} placeholder={t("Nome del canale", "Channel name")} value={canale.nome} onChange={(e) => onCambia({ ...canale, nome: e.target.value })} />
      <select className={campi.riga} aria-label={t("Formato dei video su {nome}", "Video format on {nome}", { nome })} value={canale.formato} onChange={(e) => onCambia({ ...canale, formato: e.target.value })}>
        <option value="">{t("Formato non detto", "Format not set")}</option>
        {FORMATI.map((f) => (
          <option key={f} value={f}>
            {nomeFormato(f)}
          </option>
        ))}
      </select>
      <Bottone variante="vuoto" onClick={onTogli} etichetta={t("Togli il canale {nome}", "Remove the {nome} channel", { nome })}>
        {t("Togli", "Remove")}
      </Bottone>
    </li>
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

  const intestazione = (
    <header className={styles.intestazione}>
      <h1>{t("Profilo", "Profile")}</h1>
      <p className={styles.sotto}>
        {t("Chi sei, a chi parli e dove pubblichi: è ciò che leggo prima di proporre, scrivere o tagliare un video. Puoi anche dirlo in chat («cambia il mio nome», «non dico mai…»): ciò che scrive la chat compare qui.", "Who you are, who you talk to and where you publish: it is what I read before proposing, writing or cutting a video. You can also say it in the chat (\"change my name\", \"I never say…\"): what the chat writes shows up here.")}
      </p>
    </header>
  )

  if (!stato.valido) {
    return (
      <div className={pagina.contenuto}>
        {intestazione}
        <p className={styles.sotto}>{t("Il profilo non passa il controllo (i motivi sono qui sopra): finché non lo correggi, da qui non si cambia niente. Chiedi nella chat di correggerlo, oppure correggi il file a mano.", "The profile does not pass the check (the reasons are above): until you fix it, nothing can be changed from here. Ask in the chat to fix it, or fix the file by hand.")}</p>
      </div>
    )
  }

  // Un profilo scritto a mano prima del primo giro lo farebbe sembrare fatto: il giro non partirebbe più e non nascerebbero le regole e lo stile che scrive.
  if (!stato.presente) {
    return (
      <div className={pagina.contenuto}>
        {intestazione}
        <section className={styles.primoGiro} aria-label={t("Il primo giro", "The first round")}>
          <p>{t("Non hai ancora un profilo. Si comincia dal primo giro in chat: ti faccio qualche domanda e scrivo io il profilo, il tuo stile e le tue regole. Poi lo correggi qui.", "You do not have a profile yet. It starts with the first round in the chat: I ask a few questions and write your profile, your style and your rules. Then you can fix it here.")}</p>
          <Bottone onClick={() => avviaPrimoGiro(false)}>{t("Fai il primo giro", "Do the first round")}</Bottone>
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

  return (
    <div className={pagina.contenuto}>
      {intestazione}
      <div className={styles.salva}>
        {salvato && !modificato && <span className={styles.ok}>{t("Salvato", "Saved")}</span>}
        <Bottone variante="vuoto" onClick={scarta} disabled={!modificato || invio}>
          {t("Annulla le modifiche", "Discard changes")}
        </Bottone>
        <Bottone onClick={salva} disabled={!modificato || invio}>
          {t("Salva", "Save")}
        </Bottone>
      </div>
      {cambiatoAltrove && (
        <p className={styles.avviso} role="status">
          {t("Il profilo è cambiato mentre lo modificavi (forse l'ha corretto la chat): se salvi, lo sostituisci con ciò che vedi qui.", "The profile changed while you were editing it (the chat may have fixed it): if you save, you replace it with what you see here.")}{" "}
          <button type="button" className={styles.link} onClick={scarta}>
            {t("Ricarica dal profilo", "Reload from the profile")}
          </button>
        </p>
      )}
      {errore && (
        <p className={styles.errore} role="alert">
          {errore}
        </p>
      )}

      <section className={styles.sezione} aria-labelledby="profilo-chi">
        <h2 id="profilo-chi">{t("Chi sei", "Who you are")}</h2>
        <div className={styles.griglia}>
          <Campo etichetta={t("Il tuo nome", "Your name")}>
            <input className={campi.riga} value={valori.nome} onChange={(e) => cambia({ nome: e.target.value })} />
          </Campo>
          <Campo etichetta={t("La lingua in cui parli e scrivi", "The language you speak and write in")}>
            <SceltaLingua etichetta={t("La lingua in cui parli e scrivi", "The language you speak and write in")} valore={valori.lingua} onCambia={(lingua) => cambia({ lingua })} />
          </Campo>
        </div>
      </section>

      <section className={styles.sezione} aria-labelledby="profilo-pubblico">
        <h2 id="profilo-pubblico">{t("Il tuo pubblico", "Your audience")}</h2>
        <div className={styles.griglia}>
          <Campo etichetta={t("Che livello ha", "Their level")} aiuto={t("Per esempio «non tecnico»: decide se uso sigle e numeri a schermo.", "For example \"non-technical\": it decides whether I use acronyms and numbers on screen.")}>
            <input className={campi.riga} value={valori.livello} onChange={(e) => cambia({ livello: e.target.value })} />
          </Campo>
          <Campo etichetta={t("La lingua del pubblico", "The audience's language")}>
            <SceltaLingua etichetta={t("La lingua del pubblico", "The audience's language")} valore={valori.linguaPubblico} onCambia={(linguaPubblico) => cambia({ linguaPubblico })} />
          </Campo>
          <Campo etichetta={t("Le testate che citi", "The newspapers you cite")} aiuto={t("Separale con una virgola: i loro articoli possono comparire a schermo.", "Separate them with a comma: their articles may appear on screen.")}>
            <input className={campi.riga} value={valori.testate} onChange={(e) => cambia({ testate: e.target.value })} />
          </Campo>
        </div>
      </section>

      <section className={styles.sezione} aria-labelledby="profilo-canali">
        <h2 id="profilo-canali">{t("I tuoi canali", "Your channels")}</h2>
        {valori.canali.length > 0 && (
          <ul className={styles.canali}>
            {valori.canali.map((c, i) => (
              <RigaCanale key={i} canale={c} onCambia={(nuovo) => cambiaCanale(i, nuovo)} onTogli={() => cambia({ canali: valori.canali.filter((_, k) => k !== i) })} />
            ))}
          </ul>
        )}
        <div>
          <Bottone variante="vuoto" onClick={() => cambia({ canali: [...valori.canali, { piattaforma: "tiktok", nome: "", formato: "" }] })}>
            {t("Aggiungi un canale", "Add a channel")}
          </Bottone>
        </div>
        {conTikTok ? (
          <div className={styles.lettura}>
            <Bottone variante="vuoto" onClick={() => chiediAClaude(AGGIORNA_TIKTOK(), { soloClaudeCode: true })}>
              {LEGGI_TIKTOK()}
            </Bottone>
            <p className={styles.sotto}>{t("La chat legge i numeri dal tuo profilo: poi compare «Canale» nella barra.", "The chat reads the numbers from your profile: then \"Channel\" shows up in the bar.")}</p>
          </div>
        ) : (
          <p className={styles.sotto}>{t("Per ora i numeri del canale si leggono solo da TikTok.", "For now the channel numbers can only be read from TikTok.")}</p>
        )}
      </section>

      <section className={styles.sezione} aria-labelledby="profilo-non-dici">
        <h2 id="profilo-non-dici">{t("Cosa non dici", "What you never say")}</h2>
        <Campo etichetta={t("Una cosa per riga", "One thing per line")} aiuto={t("Proposte, copioni, didascalie e risposte lo rispettano.", "Proposals, scripts, captions and answers respect it.")}>
          <textarea className={styles.elenco} rows={Math.max(3, valori.nonSiDice.split("\n").length + 1)} value={valori.nonSiDice} onChange={(e) => cambia({ nonSiDice: e.target.value })} />
        </Campo>
      </section>
    </div>
  )
}
