// «Quali sono i miei standard?»: ogni quadro in scala, i colori, i cartelli resi col testo di prova, le soglie
// della voce e dei tagli. Si cambia e si salva; ciò che non è valido dice perché.
import { useState, type ReactNode } from "react"
import { api } from "../api"
import { Bottone } from "../comuni/Bottone"
import { CampoNumero } from "../comuni/CampoNumero"
import { CardDiRighe, Riga } from "../comuni/CardDiRighe"
import { Interruttore } from "../comuni/Interruttore"
import { Segmenti } from "../comuni/Segmenti"
import { Caricamento, Errore } from "../comuni/Stati"
import { elencoVideo, stile as copiaStile, stiliDiPartenza, useCopia } from "../dati"
import { Menu } from "../impostazioni/Controlli"
import { Testata } from "../impostazioni/Testata"
import { lingua, t } from "../lingua"
import { uguali } from "../montaggio/uguali"
import { nomeColore, nomeFormato, nomeQuadro } from "../testo"
import type { Quadro, Rettangolo, Stile, StileDiPartenza } from "../tipi"
import { ConfineErrore } from "../comuni/ConfineErrore"
import { AnteprimaDelCartello, ASPETTO, CartolineDiStile, eInUso } from "./CartolineDiStile"
import { QuadroInScala } from "./QuadroInScala"
import { ScelteDelCarattere } from "./ScelteDelCarattere"
import { controllaStile } from "./validazione"
import pagina from "../impostazioni/Impostazioni.module.css"
import styles from "./PaginaStile.module.css"

type Modifica = (fn: (s: Stile) => void) => void

interface CampoNumerico {
  etichetta: string
  valore: number
  onConferma: (n: number) => void
  cifre?: number
  unita?: string
}

/** Un numero per riga: il nome a sinistra, il campo a destra. */
function RigheNumeri({ campi }: { campi: CampoNumerico[] }) {
  return (
    <>
      {campi.map((c) => (
        <Riga key={c.etichetta} nome={c.etichetta}>
          <span className={styles.numero}>
            <CampoNumero etichetta={c.etichetta} valore={c.valore} cifre={c.cifre ?? 2} unita={c.unita} onConferma={c.onConferma} />
          </span>
        </Riga>
      ))}
    </>
  )
}

/** Una scelta per riga: fra poche e brevi come segmenti, altrimenti in un menu. */
function RigaScelta({ etichetta, valore, opzioni, onCambia, segmenti = false }: { etichetta: string; valore: string; opzioni: Array<[string, string]>; onCambia: (v: string) => void; segmenti?: boolean }) {
  return (
    <Riga nome={etichetta}>
      {segmenti ? (
        <Segmenti etichetta={etichetta} valori={opzioni.map(([id, nome]) => ({ id, nome }))} scelta={valore} onScegli={onCambia} />
      ) : (
        <Menu etichetta={etichetta} valore={valore} onCambia={onCambia}>
          {opzioni.map(([v, nome]) => (
            <option key={v} value={v}>
              {nome}
            </option>
          ))}
        </Menu>
      )}
    </Riga>
  )
}

/** Un'etichetta di gruppo che apre una parte della pagina fatta di altro che righe (le cartoline, i quadri). */
function Sezione({ titolo, children }: { titolo: string; children: ReactNode }) {
  return (
    <section className={styles.sezione}>
      <h2>{titolo}</h2>
      {children}
    </section>
  )
}

function titoloStrato(s: Quadro["strati"][number]): string {
  switch (s.tipo) {
    case "animazione":
      return t("Animazione", "Animation")
    case "girato":
      return t("Girato", "Footage")
    case "sagoma":
      return t("Persona (sagoma)", "Person (silhouette)")
    case "riquadro":
      return t("Riquadro «{nome}»", "Box «{nome}»", { nome: s.nome })
    case "inserto":
      return t("Inserto", "Inset")
    case "viso":
      return t("Viso «{nome}»", "Face «{nome}»", { nome: s.nome })
  }
}

const areaCampi = (area: Rettangolo, scrivi: (r: Rettangolo) => void) =>
  ([t("Da sinistra", "From the left"), t("Dall'alto", "From the top"), t("Larghezza", "Width"), t("Altezza", "Height")]).map((etichetta, i) => ({
    etichetta,
    valore: area[i]!,
    cifre: 0,
    unita: "px",
    onConferma: (n: number) => scrivi(area.map((v, j) => (j === i ? n : v)) as Rettangolo),
  }))

function MisureQuadro({ quadro, colori, nome, modifica }: { quadro: Quadro; colori: string[]; nome: string; modifica: Modifica }) {
  const su = (fn: (q: Quadro) => void) => modifica((s) => fn(s.quadri[nome]!))
  const px = (etichetta: string, valore: number, scrivi: (n: number) => void, cifre = 0) => ({ etichetta, valore, cifre, unita: "px", onConferma: scrivi })
  const ancora = (valore: string, scrivi: (v: "sinistra" | "centro") => void) => (
    <RigaScelta etichetta={t("Il punto indica", "The point marks")} valore={valore} segmenti opzioni={[["sinistra", t("il bordo sinistro", "the left edge")], ["centro", t("il centro", "the center")]]} onCambia={(v) => scrivi(v === "sinistra" ? "sinistra" : "centro")} />
  )

  return (
    <div className={styles.misure}>
      <CardDiRighe nome={t("Sfondo", "Background")}>
        <RigaScelta etichetta={t("Sfondo", "Background")} valore={quadro.fondo} opzioni={colori.map((c) => [c, nomeColore(c)])} onCambia={(v) => su((q) => (q.fondo = v))} />
      </CardDiRighe>
      {quadro.strati.map((s, i) => (
        <CardDiRighe key={i} nome={titoloStrato(s)}>
          {(s.tipo === "animazione" || s.tipo === "girato") && <RigheNumeri campi={areaCampi(s.area, (r) => su((q) => ((q.strati[i] as typeof s).area = r)))} />}
          {s.tipo === "girato" && (
            <RigaScelta
              etichetta={t("Come sta nell'area", "How it fits the area")}
              valore={s.adatta ?? "automatico"}
              opzioni={[["automatico", t("come richiede la vista", "as the view requires")], ["riempi", t("riempie l'area", "fills the area")], ["contieni", t("si vede intero", "shown whole")]]}
              onCambia={(v) => su((q) => { const g = q.strati[i] as typeof s; if (v === "contieni" || v === "riempi") g.adatta = v; else delete g.adatta })}
            />
          )}
          {s.tipo === "sagoma" && (
            <>
              <RigaScelta
                etichetta={t("Posizione della persona", "Position of the person")}
                valore={s.x === "testa" ? "testa" : "a mano"}
                segmenti
                opzioni={[["testa", t("la testa al centro", "head in the center")], ["a mano", t("spostata a mano", "moved by hand")]]}
                onCambia={(v) => su((q) => ((q.strati[i] as typeof s).x = v === "testa" ? "testa" : 0))}
              />
              <RigheNumeri
                campi={[
                  { etichetta: t("Altezza minima", "Minimum height"), valore: s.scala_minima, unita: "× fotogramma", onConferma: (n) => su((q) => ((q.strati[i] as typeof s).scala_minima = n)) },
                  px(t("Cima della testa", "Top of the head"), s.testa, (n) => su((q) => ((q.strati[i] as typeof s).testa = n))),
                  ...(s.x === "testa" ? [] : [px(t("Spostamento", "Offset"), s.x, (n) => su((q) => ((q.strati[i] as typeof s).x = n)))]),
                  px(t("Aria sopra", "Space above"), s.aria, (n) => su((q) => ((q.strati[i] as typeof s).aria = n))),
                  px(t("Bordo sfumato", "Soft edge"), s.sfuma, (n) => su((q) => ((q.strati[i] as typeof s).sfuma = n))),
                ]}
              />
            </>
          )}
          {s.tipo === "riquadro" && (
            <RigheNumeri
              campi={[
                px(t("Dall'alto", "From the top"), s.y, (n) => su((q) => ((q.strati[i] as typeof s).y = n))),
                { etichetta: t("Ingrandimento", "Zoom"), valore: s.scala, unita: "×", onConferma: (n) => su((q) => ((q.strati[i] as typeof s).scala = n)) },
                px(t("Angoli tondi", "Rounded corners"), s.raggio, (n) => su((q) => ((q.strati[i] as typeof s).raggio = n))),
              ]}
            />
          )}
          {s.tipo === "viso" && (
            <>
              <RigheNumeri
                campi={[
                  px(t("Larghezza", "Width"), s.largo, (n) => su((q) => ((q.strati[i] as typeof s).largo = n))),
                  px(t("Distanza dal bordo", "Distance from the edge"), s.margine, (n) => su((q) => ((q.strati[i] as typeof s).margine = n))),
                  px(t("Angoli tondi", "Rounded corners"), s.raggio, (n) => su((q) => ((q.strati[i] as typeof s).raggio = n))),
                ]}
              />
              <RigaScelta
                etichetta={t("In che angolo", "Which corner")}
                valore={s.angolo}
                opzioni={[["alto-sinistra", t("in alto a sinistra", "top left")], ["alto-destra", t("in alto a destra", "top right")], ["basso-sinistra", t("in basso a sinistra", "bottom left")], ["basso-destra", t("in basso a destra", "bottom right")]]}
                onCambia={(v) => su((q) => ((q.strati[i] as typeof s).angolo = v as typeof s.angolo))}
              />
            </>
          )}
          {s.tipo === "inserto" && (
            <RigheNumeri campi={[px(t("Larghezza", "Width"), s.largo, (n) => su((q) => ((q.strati[i] as typeof s).largo = n))), px(t("Distanza dall'angolo", "Distance from the corner"), s.bordo, (n) => su((q) => ((q.strati[i] as typeof s).bordo = n)))]} />
          )}
        </CardDiRighe>
      ))}
      <CardDiRighe nome={t("Sottotitoli", "Subtitles")}>
        <RigheNumeri campi={[px(t("Punto, da sinistra", "Point, from the left"), quadro.sottotitoli.x, (n) => su((q) => (q.sottotitoli.x = n))), px(t("Centro, dall'alto", "Center, from the top"), quadro.sottotitoli.y, (n) => su((q) => (q.sottotitoli.y = n))), px(t("Larghezza", "Width"), quadro.sottotitoli.largo, (n) => su((q) => (q.sottotitoli.largo = n)))]} />
        {ancora(quadro.sottotitoli.ancora, (v) => su((q) => (q.sottotitoli.ancora = v)))}
      </CardDiRighe>
      <CardDiRighe nome={t("Titolo", "Title")}>
        <RigheNumeri campi={[px(t("Punto, da sinistra", "Point, from the left"), quadro.titolo.x, (n) => su((q) => (q.titolo.x = n))), px(t("Centro, dall'alto", "Center, from the top"), quadro.titolo.y, (n) => su((q) => (q.titolo.y = n)))]} />
        {ancora(quadro.titolo.ancora, (v) => su((q) => (q.titolo.ancora = v)))}
      </CardDiRighe>
      {quadro.fascia_animazione && (
        <CardDiRighe nome={t("Fascia dell'animazione", "Animation band")}>
          <RigheNumeri campi={areaCampi(quadro.fascia_animazione, (r) => su((q) => (q.fascia_animazione = r)))} />
        </CardDiRighe>
      )}
    </div>
  )
}

export function PaginaStile() {
  const copia = useCopia(copiaStile)
  const video = useCopia(elencoVideo).dato
  const partenze = useCopia(stiliDiPartenza)
  const [bozza, setBozza] = useState<Stile | null>(null)
  /** Lo stile del file com'era quando è cominciata la bozza (o quando si è scelto di tenerla): se il file ora è un altro, qualcuno l'ha cambiato. */
  const [partenza, setPartenza] = useState<Stile | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [salvato, setSalvato] = useState(false)
  const [invio, setInvio] = useState(false)
  /** Lo stile di partenza che il creator ha scelto mentre aveva modifiche all'aspetto non salvate: si applica solo dopo la sua conferma. */
  const [daConfermare, setDaConfermare] = useState<StileDiPartenza | null>(null)
  const originale = copia.dato

  if (!originale) return copia.errore ? <Errore messaggio={copia.errore} onRiprova={() => void copiaStile.rileggi()} /> : <Caricamento />

  const stile = bozza ?? originale
  const modificato = bozza !== null && !uguali(bozza, originale)
  const cambiatoNelFrattempo = modificato && partenza !== null && !uguali(partenza, originale)
  const problemi = controllaStile(stile)
  const nomiColori = Object.keys(stile.colori)
  // Un colore o un formato che lo stile nomina e non ha non si può disegnare: la frase prende il posto del disegno finché lo stile non cambia.
  const versione = JSON.stringify(stile)

  const modifica: Modifica = (fn) => {
    const nuova = structuredClone(stile)
    fn(nuova)
    if (bozza === null) setPartenza(originale)
    setBozza(nuova)
    setSalvato(false)
    setErrore(null)
  }
  const applica = (p: StileDiPartenza) => {
    setDaConfermare(null)
    modifica((s) => {
      s.colori = { ...s.colori, ...p.stile.colori }
      s.caratteri = { ...s.caratteri, ...p.stile.caratteri }
      s.sottotitoli = { ...s.sottotitoli, ...p.stile.sottotitoli }
      s.titolo = { ...s.titolo, ...p.stile.titolo }
    })
  }
  // Un aspetto che è già uno di quelli di partenza non perde niente di suo se lo si sostituisce: confrontando le cartoline non si chiede conferma ogni volta.
  const aspettoNonSalvato = bozza !== null && !ASPETTO.every((sezione) => uguali(bozza[sezione], originale[sezione])) && !(partenze.dato ?? []).some((p) => eInUso(bozza, p))
  const num = (etichetta: string, valore: number, scrivi: (s: Stile, n: number) => void, opzioni: { cifre?: number; unita?: string } = {}) => ({ etichetta, valore, cifre: opzioni.cifre ?? 2, unita: opzioni.unita, onConferma: (n: number) => modifica((s) => scrivi(s, n)) })
  const colorePer = (etichetta: string, valore: string, scrivi: (s: Stile, v: string) => void) => <RigaScelta etichetta={etichetta} valore={valore} opzioni={nomiColori.map((c) => [c, nomeColore(c)])} onCambia={(v) => modifica((s) => scrivi(s, v))} />
  const coloreONiente = (etichetta: string, valore: string | null, scrivi: (s: Stile, v: string | null) => void) => (
    <RigaScelta etichetta={etichetta} valore={valore ?? ""} opzioni={[["", t("nessuno", "none")], ...nomiColori.map((c): [string, string] => [c, nomeColore(c)])]} onCambia={(v) => modifica((s) => scrivi(s, v === "" ? null : v))} />
  )

  // I quadri che i video del creator usano vengono prima; senza l'elenco dei video, o se non si legge, stanno tutti sotto «Tutti i quadri».
  const usati = new Set((video ?? []).flatMap((v) => v.quadri))
  const quadri = Object.entries(stile.quadri)
  const inUso = quadri.filter(([nome]) => usati.has(nome))
  const altri = quadri.filter(([nome]) => !usati.has(nome))
  const carta = ([nome, quadro]: [string, Quadro]) => (
    <div key={nome} className={styles.quadro}>
      <ConfineErrore locale reimposta={versione}>
        <QuadroInScala nome={nome} quadro={quadro} stile={stile} />
      </ConfineErrore>
      <details className={styles.dettagli}>
        <summary>{t("Misure di «{nome}»", "Measures of «{nome}»", { nome: nomeQuadro(nome) })}</summary>
        <MisureQuadro nome={nome} quadro={quadro} colori={nomiColori} modifica={modifica} />
      </details>
    </div>
  )

  const salva = () => {
    setInvio(true)
    setErrore(null)
    api.scriviStile(stile).then(
      () => {
        setBozza(null)
        setPartenza(null)
        setSalvato(true)
        setInvio(false)
      },
      (e: Error) => {
        setErrore(e.message)
        setInvio(false)
      },
    )
  }

  return (
    <div className={`${pagina.sezione} ${styles.pagina}`}>
      <div className={styles.testata}>
        <Testata titolo={t("Stile", "Style")}>
          {salvato && !modificato && <span className={pagina.fatto}>{t("Salvato", "Saved")}</span>}
          <Bottone
            variante="minore"
            onClick={() => {
              setBozza(null)
              setPartenza(null)
              setErrore(null)
            }}
            disabled={!modificato}
          >
            {t("Annulla le modifiche", "Discard changes")}
          </Bottone>
          <Bottone variante="principale" onClick={salva} disabled={!modificato || problemi.length > 0 || invio || cambiatoNelFrattempo}>
            {t("Salva", "Save")}
          </Bottone>
        </Testata>
      </div>
      {problemi.length > 0 && (
        <ul className={styles.problemi} role="alert">
          {problemi.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {errore && (
        <p className={pagina.errore} role="alert">
          {errore}
        </p>
      )}
      {cambiatoNelFrattempo && (
        <div className={pagina.avviso} role="alert">
          <span>{t("Lo stile è cambiato nel frattempo: salvando senza guardare toglieresti quelle modifiche.", "The style changed in the meantime: saving without looking would remove those changes.")}</span>
          <Bottone onClick={() => setPartenza(originale)}>{t("Tieni le mie", "Keep mine")}</Bottone>
          <Bottone
            onClick={() => {
              setBozza(null)
              setPartenza(null)
            }}
          >
            {t("Prendi le nuove", "Take the new ones")}
          </Bottone>
        </div>
      )}

      <Sezione titolo={t("Parti da uno stile", "Start from a style")}>
        <p className={pagina.nota}>{t("Scegline uno: poi cambi i colori, i sottotitoli e il titolo qui sotto, e premi «Salva».", "Choose one: then change the colors, the subtitles and the title below, and press \"Save\".")}</p>
        {daConfermare && (
          <div className={pagina.avviso} role="alert">
            <span>{t("Hai cambiato colori, sottotitoli o titolo e non hai salvato: usando lo stile «{nome}» li perdi.", "You changed the colors, subtitles or title and did not save: using the \"{nome}\" style you lose them.", { nome: daConfermare.nome[lingua()] })}</span>
            <Bottone onClick={() => applica(daConfermare)}>{t("Usa «{nome}»", "Use \"{nome}\"", { nome: daConfermare.nome[lingua()] })}</Bottone>
            <Bottone variante="minore" onClick={() => setDaConfermare(null)}>
              {t("Lascia stare", "Never mind")}
            </Bottone>
          </div>
        )}
        {partenze.dato ? (
          <ConfineErrore locale reimposta={versione}>
            <CartolineDiStile stile={stile} partenze={partenze.dato} onUsa={(p) => (aspettoNonSalvato ? setDaConfermare(p) : applica(p))} />
          </ConfineErrore>
        ) : partenze.errore ? (
          <Errore messaggio={partenze.errore} onRiprova={() => void stiliDiPartenza.rileggi()} />
        ) : (
          <Caricamento />
        )}
      </Sezione>

      <CardDiRighe nome={t("I colori", "Colors")}>
        {Object.entries(stile.colori).map(([nome, valore]) => (
          <Riga key={nome} nome={nomeColore(nome)}>
            <code className={styles.valoreDelColore}>{valore}</code>
            <input
              type="color"
              className={styles.colore}
              title={valore}
              aria-label={t("Colore {nome}", "Color {nome}", { nome: nomeColore(nome) })}
              value={/^#[0-9a-fA-F]{6}$/.test(valore) ? valore.toLowerCase() : "#000000"}
              onChange={(e) => modifica((s) => (s.colori[nome] = e.target.value.toUpperCase()))}
            />
          </Riga>
        ))}
      </CardDiRighe>

      <Sezione titolo={t("Sottotitoli e titolo", "Subtitles and title")}>
        <div className={styles.prova}>
          <ConfineErrore locale reimposta={versione}>
            <AnteprimaDelCartello stile={stile} />
          </ConfineErrore>
        </div>
      </Sezione>
      <ScelteDelCarattere stile={stile} modifica={modifica} />
      <CardDiRighe nome={t("Sottotitoli", "Subtitles")}>
        <RigaScelta
          etichetta={t("Modo", "Mode")}
          valore={stile.sottotitoli.modo}
          segmenti
          opzioni={[["parola per parola", t("Parola per parola", "Word by word")], ["a battute", t("A battute", "By lines")], ["nessuno", t("Nessuno", "None")]]}
          onCambia={(v) => modifica((s) => (s.sottotitoli.modo = v as Stile["sottotitoli"]["modo"]))}
        />
        <RigheNumeri
          campi={[
            num(t("Corpo", "Size"), stile.sottotitoli.corpo, (s, n) => (s.sottotitoli.corpo = n), { cifre: 0 }),
            num(t("Corpo minimo", "Minimum size"), stile.sottotitoli.corpo_minimo, (s, n) => (s.sottotitoli.corpo_minimo = n), { cifre: 0 }),
            num(t("Caratteri per battuta", "Characters per line"), stile.sottotitoli.caratteri_per_battuta, (s, n) => (s.sottotitoli.caratteri_per_battuta = n), { cifre: 0 }),
            num(t("Stacco fra battute", "Gap between lines"), stile.sottotitoli.stacco, (s, n) => (s.sottotitoli.stacco = n), { unita: "s" }),
            num(t("Bordo", "Border"), stile.sottotitoli.bordo, (s, n) => (s.sottotitoli.bordo = n), { cifre: 0, unita: "px" }),
            ...(stile.sottotitoli.contorno === undefined ? [] : [num(t("Contorno", "Outline"), stile.sottotitoli.contorno, (s, n) => (s.sottotitoli.contorno = n), { cifre: 0, unita: "px" })]),
          ]}
        />
        {coloreONiente(t("Fondo", "Background"), stile.sottotitoli.fondo, (s, v) => (s.sottotitoli.fondo = v))}
        {colorePer(t("Testo e bordo", "Text and border"), stile.sottotitoli.colore, (s, v) => (s.sottotitoli.colore = v))}
        {stile.sottotitoli.colore_contorno !== undefined && colorePer(t("Colore del contorno", "Outline color"), stile.sottotitoli.colore_contorno, (s, v) => (s.sottotitoli.colore_contorno = v))}
        {colorePer(t("Correzioni", "Corrections"), stile.sottotitoli.colore_correzione, (s, v) => (s.sottotitoli.colore_correzione = v))}
      </CardDiRighe>
      <CardDiRighe nome={t("Titolo", "Title")}>
        <RigheNumeri
          campi={[
            num(t("Corpo", "Size"), stile.titolo.corpo, (s, n) => (s.titolo.corpo = n), { cifre: 0 }),
            num(t("Margine", "Margin"), stile.titolo.margine, (s, n) => (s.titolo.margine = n), { cifre: 0, unita: "px" }),
            num(t("Larghezza", "Width"), stile.titolo.largo, (s, n) => (s.titolo.largo = n), { cifre: 0, unita: "px" }),
          ]}
        />
        {colorePer(t("Fondo", "Background"), stile.titolo.fondo, (s, v) => (s.titolo.fondo = v))}
        {colorePer(t("Testo", "Text"), stile.titolo.colore, (s, v) => (s.titolo.colore = v))}
      </CardDiRighe>

      <CardDiRighe nome={t("La voce", "The voice")}>
        <RigheNumeri campi={[num(t("Margine attorno alle parole", "Margin around the words"), stile.voce.margine, (s, n) => (s.voce.margine = n), { unita: "s" })]} />
      </CardDiRighe>
      <details className={styles.dettagli}>
        <summary>{t("Avanzate: livelli in decibel", "Advanced: levels in decibels")}</summary>
        <CardDiRighe nome={t("Livelli", "Levels")}>
          <RigheNumeri
            campi={[
              num(t("Volume della voce", "Voice volume"), stile.voce.lufs, (s, n) => (s.voce.lufs = n), { unita: "LUFS" }),
              num(t("Soglia del silenzio", "Silence threshold"), stile.voce.silenzio_db, (s, n) => (s.voce.silenzio_db = n), { unita: "dB" }),
              num(t("Suoni di fondo", "Background sounds"), stile.suoni.fondo_db, (s, n) => (s.suoni.fondo_db = n), { unita: "dB" }),
              num(t("Suoni d'accento", "Accent sounds"), stile.suoni.accento_db, (s, n) => (s.suoni.accento_db = n), { unita: "dB" }),
            ]}
          />
        </CardDiRighe>
      </details>

      <CardDiRighe nome={t("I tagli: pezzi scelti a tempo", "Cuts: clips chosen by time")}>
        <RigheNumeri
          campi={[
            num(t("Prima della voce", "Before the voice"), stile.taglio.a_tempo.prima, (s, n) => (s.taglio.a_tempo.prima = n), { unita: "s" }),
            num(t("Dopo la voce", "After the voice"), stile.taglio.a_tempo.dopo, (s, n) => (s.taglio.a_tempo.dopo = n), { unita: "s" }),
            num(t("Pausa che resta", "Pause that stays"), stile.taglio.a_tempo.pausa, (s, n) => (s.taglio.a_tempo.pausa = n), { unita: "s" }),
            num(t("Pezzo minimo", "Minimum clip"), stile.taglio.a_tempo.tratto_minimo, (s, n) => (s.taglio.a_tempo.tratto_minimo = n), { unita: "s" }),
          ]}
        />
      </CardDiRighe>
      <CardDiRighe nome={t("I tagli: pezzi scelti a parole", "Cuts: clips chosen by words")}>
        <RigheNumeri
          campi={[
            num(t("Pausa che resta", "Pause that stays"), stile.taglio.a_parole.pausa, (s, n) => (s.taglio.a_parole.pausa = n), { unita: "s" }),
            num(t("Stacco", "Gap"), stile.taglio.a_parole.stacco, (s, n) => (s.taglio.a_parole.stacco = n), { unita: "s" }),
            num(t("Parole vicine", "Close words"), stile.taglio.a_parole.vicine, (s, n) => (s.taglio.a_parole.vicine = n), { cifre: 0 }),
          ]}
        />
      </CardDiRighe>

      <CardDiRighe nome={t("Il video che esce", "The output video")}>
        <RigheNumeri
          campi={[
            ...Object.entries(stile.formati).flatMap(([nome, f]) => [
              num(t("Formato {nome}, larghezza", "Format ({nome}), width", { nome: nomeFormato(nome) }), f.largo, (s, n) => (s.formati[nome]!.largo = n), { cifre: 0, unita: "px" }),
              num(t("Formato {nome}, altezza", "Format ({nome}), height", { nome: nomeFormato(nome) }), f.alto, (s, n) => (s.formati[nome]!.alto = n), { cifre: 0, unita: "px" }),
              num(t("Formato {nome}, fotogrammi al secondo", "Format ({nome}), frames per second", { nome: nomeFormato(nome) }), f.fps, (s, n) => (s.formati[nome]!.fps = n), { cifre: 0 }),
            ]),
            num(t("Qualità del video", "Video quality"), stile.uscita.crf, (s, n) => (s.uscita.crf = n), { cifre: 0 }),
            num(t("Qualità dell'audio", "Audio quality"), stile.uscita.audio_kbit, (s, n) => (s.uscita.audio_kbit = n), { cifre: 0, unita: "kbit/s" }),
            num(t("Copia leggera, larghezza", "Light copy, width"), stile.uscita.leggero.largo, (s, n) => (s.uscita.leggero.largo = n), { cifre: 0, unita: "px" }),
            num(t("Copia leggera, altezza", "Light copy, height"), stile.uscita.leggero.alto, (s, n) => (s.uscita.leggero.alto = n), { cifre: 0, unita: "px" }),
            num(t("Copia leggera, qualità", "Light copy, quality"), stile.uscita.leggero.crf, (s, n) => (s.uscita.leggero.crf = n), { cifre: 0 }),
          ]}
        />
        <Riga nome={t("Nella copertina il titolo sta in alto", "On the cover the title is at the top")}>
          <Interruttore etichetta={t("Nella copertina il titolo sta in alto", "On the cover the title is at the top")} acceso={stile.copertina.titolo_in_alto} onCambia={(acceso) => modifica((s) => (s.copertina.titolo_in_alto = acceso))} />
        </Riga>
        <Riga nome={t("Nella copertina c'è la persona del primo fotogramma", "The cover shows the person from the first frame")}>
          <Interruttore etichetta={t("Nella copertina c'è la persona del primo fotogramma", "The cover shows the person from the first frame")} acceso={stile.copertina.sagoma_del_primo_fotogramma} onCambia={(acceso) => modifica((s) => (s.copertina.sagoma_del_primo_fotogramma = acceso))} />
        </Riga>
      </CardDiRighe>

      <Sezione titolo={t("I quadri", "Layouts")}>
        <p className={pagina.nota}>
          {t("Ogni quadro è il modo in cui il fotogramma è composto, disegnato in scala. Le aree tratteggiate sono i sottotitoli e il titolo.", "Each layout is the way the frame is composed, drawn to scale. The dashed areas are the subtitles and the title.")}{" "}
          {inUso.length > 0 ? t("Qui sono aperti quelli che i tuoi video usano.", "The ones your videos use are open here.") : t("Nessun video usa ancora un quadro.", "No video uses a layout yet.")}
        </p>
        {inUso.length > 0 && <div className={styles.quadri}>{inUso.map(carta)}</div>}
        {altri.length > 0 && (
          <details className={styles.altriQuadri}>
            <summary>{t("Tutti i quadri", "All layouts")}</summary>
            <div className={styles.quadri}>{altri.map(carta)}</div>
          </details>
        )}
      </Sezione>
    </div>
  )
}
