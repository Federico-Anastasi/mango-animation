// «Quali sono i miei standard?»: ogni quadro in scala, i colori, i cartelli resi col testo di prova, le soglie
// della voce e dei tagli. Si cambia e si salva; ciò che non è valido dice perché.
import { useState, type ReactNode } from "react"
import { api } from "../api"
import { Bottone } from "../comuni/Bottone"
import { CampoNumero } from "../comuni/CampoNumero"
import { Caricamento, Errore } from "../comuni/Stati"
import { stile as copiaStile, useCopia } from "../dati"
import { t } from "../lingua"
import { aspettoDelCartello, colore } from "../montaggio/composizione"
import { uguali } from "../montaggio/uguali"
import { nomeColore, nomeFormato, nomeQuadro } from "../testo"
import type { Quadro, Rettangolo, Stile } from "../tipi"
import { QuadroInScala } from "./QuadroInScala"
import { controllaStile } from "./validazione"
import styles from "./PaginaStile.module.css"

type Modifica = (fn: (s: Stile) => void) => void

function Numeri({ campi }: { campi: Array<{ etichetta: string; valore: number; onConferma: (n: number) => void; cifre?: number; unita?: string }> }) {
  return (
    <div className={styles.numeri}>
      {campi.map((c) => (
        <CampoNumero key={c.etichetta} etichetta={c.etichetta} valore={c.valore} cifre={c.cifre ?? 2} unita={c.unita} onConferma={c.onConferma} />
      ))}
    </div>
  )
}

function Scelta({ etichetta, valore, opzioni, onCambia }: { etichetta: string; valore: string; opzioni: Array<[string, string]>; onCambia: (v: string) => void }) {
  return (
    <label className={styles.scelta}>
      <span>{etichetta}</span>
      <select value={valore} onChange={(e) => onCambia(e.target.value)}>
        {opzioni.map(([v, nome]) => (
          <option key={v} value={v}>
            {nome}
          </option>
        ))}
      </select>
    </label>
  )
}

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

function MisureQuadro({ nome, quadro, colori, modifica }: { nome: string; quadro: Quadro; colori: string[]; modifica: Modifica }) {
  const su = (fn: (q: Quadro) => void) => modifica((s) => fn(s.quadri[nome]!))
  const px = (etichetta: string, valore: number, scrivi: (n: number) => void, cifre = 0) => ({ etichetta, valore, cifre, unita: "px", onConferma: scrivi })
  const ancora = (valore: string, scrivi: (v: "sinistra" | "centro") => void) => <Scelta etichetta={t("Il punto indica", "The point marks")} valore={valore} opzioni={[["sinistra", t("il bordo sinistro", "the left edge")], ["centro", t("il centro", "the center")]]} onCambia={(v) => scrivi(v === "sinistra" ? "sinistra" : "centro")} />

  return (
    <div className={styles.misure}>
      <Scelta etichetta={t("Sfondo", "Background")} valore={quadro.fondo} opzioni={colori.map((c) => [c, c])} onCambia={(v) => su((q) => (q.fondo = v))} />
      {quadro.strati.map((s, i) => (
        <div key={i} className={styles.strato}>
          <h3>{titoloStrato(s)}</h3>
          {(s.tipo === "animazione" || s.tipo === "girato") && <Numeri campi={areaCampi(s.area, (r) => su((q) => ((q.strati[i] as typeof s).area = r)))} />}
          {s.tipo === "girato" && <Scelta etichetta={t("Come sta nell'area", "How it fits the area")} valore={s.adatta ?? "automatico"} opzioni={[["automatico", t("come richiede la vista", "as the view requires")], ["riempi", t("riempie l'area", "fills the area")], ["contieni", t("si vede intero", "shown whole")]]} onCambia={(v) => su((q) => { const g = q.strati[i] as typeof s; if (v === "contieni" || v === "riempi") g.adatta = v; else delete g.adatta })} />}
          {s.tipo === "sagoma" && (
            <>
              <Scelta
                etichetta={t("Posizione della persona", "Position of the person")}
                valore={s.x === "testa" ? "testa" : "a mano"}
                opzioni={[["testa", t("la testa al centro", "head in the center")], ["a mano", t("spostata a mano", "moved by hand")]]}
                onCambia={(v) => su((q) => ((q.strati[i] as typeof s).x = v === "testa" ? "testa" : 0))}
              />
              <Numeri
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
            <Numeri
              campi={[
                px(t("Dall'alto", "From the top"), s.y, (n) => su((q) => ((q.strati[i] as typeof s).y = n))),
                { etichetta: t("Ingrandimento", "Zoom"), valore: s.scala, unita: "×", onConferma: (n) => su((q) => ((q.strati[i] as typeof s).scala = n)) },
                px(t("Angoli tondi", "Rounded corners"), s.raggio, (n) => su((q) => ((q.strati[i] as typeof s).raggio = n))),
              ]}
            />
          )}
          {s.tipo === "viso" && (
            <>
              <Numeri
                campi={[
                  px(t("Larghezza", "Width"), s.largo, (n) => su((q) => ((q.strati[i] as typeof s).largo = n))),
                  px(t("Distanza dal bordo", "Distance from the edge"), s.margine, (n) => su((q) => ((q.strati[i] as typeof s).margine = n))),
                  px(t("Angoli tondi", "Rounded corners"), s.raggio, (n) => su((q) => ((q.strati[i] as typeof s).raggio = n))),
                ]}
              />
              <Scelta
                etichetta={t("In che angolo", "Which corner")}
                valore={s.angolo}
                opzioni={[["alto-sinistra", t("in alto a sinistra", "top left")], ["alto-destra", t("in alto a destra", "top right")], ["basso-sinistra", t("in basso a sinistra", "bottom left")], ["basso-destra", t("in basso a destra", "bottom right")]]}
                onCambia={(v) => su((q) => ((q.strati[i] as typeof s).angolo = v as typeof s.angolo))}
              />
            </>
          )}
          {s.tipo === "inserto" && (
            <Numeri campi={[px(t("Larghezza", "Width"), s.largo, (n) => su((q) => ((q.strati[i] as typeof s).largo = n))), px(t("Distanza dall'angolo", "Distance from the corner"), s.bordo, (n) => su((q) => ((q.strati[i] as typeof s).bordo = n)))]} />
          )}
        </div>
      ))}
      <div className={styles.strato}>
        <h3>{t("Sottotitoli", "Subtitles")}</h3>
        <Numeri campi={[px(t("Punto, da sinistra", "Point, from the left"), quadro.sottotitoli.x, (n) => su((q) => (q.sottotitoli.x = n))), px(t("Centro, dall'alto", "Center, from the top"), quadro.sottotitoli.y, (n) => su((q) => (q.sottotitoli.y = n))), px(t("Larghezza", "Width"), quadro.sottotitoli.largo, (n) => su((q) => (q.sottotitoli.largo = n)))]} />
        {ancora(quadro.sottotitoli.ancora, (v) => su((q) => (q.sottotitoli.ancora = v)))}
      </div>
      <div className={styles.strato}>
        <h3>{t("Titolo", "Title")}</h3>
        <Numeri campi={[px(t("Punto, da sinistra", "Point, from the left"), quadro.titolo.x, (n) => su((q) => (q.titolo.x = n))), px(t("Centro, dall'alto", "Center, from the top"), quadro.titolo.y, (n) => su((q) => (q.titolo.y = n)))]} />
        {ancora(quadro.titolo.ancora, (v) => su((q) => (q.titolo.ancora = v)))}
      </div>
      {quadro.fascia_animazione && (
        <div className={styles.strato}>
          <h3>{t("Fascia dell'animazione", "Animation band")}</h3>
          <Numeri campi={areaCampi(quadro.fascia_animazione, (r) => su((q) => (q.fascia_animazione = r)))} />
        </div>
      )}
    </div>
  )
}

function CartelloDiProva({ stile }: { stile: Stile }) {
  const k = 0.45
  const b = stile.sottotitoli
  const tit = stile.titolo
  return (
    <div className={styles.prove}>
      <figure>
        <div className={styles.cornicina}>
          <span className={styles.cartello} style={{ fontSize: b.corpo * k, ...aspettoDelCartello(stile, k), padding: `${10 * k}px ${18 * k}px` }}>
            {t("Questa è", "This is")} <span style={{ color: colore(stile, b.colore_correzione) }}>{t("una prova", "a test")}</span>
          </span>
        </div>
        <figcaption>{t("Un sottotitolo, con una parola nel colore delle correzioni", "A subtitle, with one word in the corrections color")}</figcaption>
      </figure>
      <figure>
        <div className={styles.cornicina}>
          <span className={styles.titolo} style={{ fontSize: tit.corpo * k, color: colore(stile, tit.colore), background: colore(stile, tit.fondo), padding: tit.margine * k }}>
            {t("Un titolo di prova", "A test title")}
          </span>
        </div>
        <figcaption>{t("Il titolo", "The title")}</figcaption>
      </figure>
    </div>
  )
}

export function PaginaStile() {
  const copia = useCopia(copiaStile)
  const [bozza, setBozza] = useState<Stile | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [salvato, setSalvato] = useState(false)
  const [invio, setInvio] = useState(false)
  const originale = copia.dato

  if (!originale) return copia.errore ? <Errore messaggio={copia.errore} onRiprova={() => void copiaStile.rileggi()} /> : <Caricamento />

  const stile = bozza ?? originale
  const modificato = bozza !== null && !uguali(bozza, originale)
  const problemi = controllaStile(stile)
  const nomiColori = Object.keys(stile.colori)

  const modifica: Modifica = (fn) => {
    const nuova = structuredClone(stile)
    fn(nuova)
    setBozza(nuova)
    setSalvato(false)
    setErrore(null)
  }
  const num = (etichetta: string, valore: number, scrivi: (s: Stile, n: number) => void, opzioni: { cifre?: number; unita?: string } = {}) => ({ etichetta, valore, cifre: opzioni.cifre ?? 2, unita: opzioni.unita, onConferma: (n: number) => modifica((s) => scrivi(s, n)) })
  const colorePer = (etichetta: string, valore: string, scrivi: (s: Stile, v: string) => void) => <Scelta etichetta={etichetta} valore={valore} opzioni={nomiColori.map((c) => [c, nomeColore(c)])} onCambia={(v) => modifica((s) => scrivi(s, v))} />
  const coloreONiente = (etichetta: string, valore: string | null, scrivi: (s: Stile, v: string | null) => void) => (
    <Scelta etichetta={etichetta} valore={valore ?? ""} opzioni={[["", t("nessuno", "none")], ...nomiColori.map((c): [string, string] => [c, nomeColore(c)])]} onCambia={(v) => modifica((s) => scrivi(s, v === "" ? null : v))} />
  )

  const salva = () => {
    setInvio(true)
    setErrore(null)
    api.scriviStile(stile).then(
      () => {
        setBozza(null)
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
    <div className={styles.pagina}>
      <div className={styles.testata}>
        <h1>{t("Stile", "Style")}</h1>
        <div className={styles.salva}>
          {salvato && !modificato && <span className={styles.ok}>{t("Salvato", "Saved")}</span>}
          <Bottone variante="vuoto" onClick={() => { setBozza(null); setErrore(null) }} disabled={!modificato}>
            {t("Annulla le modifiche", "Discard changes")}
          </Bottone>
          <Bottone onClick={salva} disabled={!modificato || problemi.length > 0 || invio}>
            {t("Salva", "Save")}
          </Bottone>
        </div>
      </div>
      {problemi.length > 0 && (
        <ul className={styles.problemi} role="alert">
          {problemi.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {errore && (
        <p className={styles.errore} role="alert">
          {errore}
        </p>
      )}

      <Sezione titolo={t("I quadri", "Layouts")}>
        <p className={styles.nota}>{t("Ogni quadro è il modo in cui il fotogramma è composto, disegnato in scala. Le aree tratteggiate sono i sottotitoli e il titolo.", "Each layout is the way the frame is composed, drawn to scale. The dashed areas are the subtitles and the title.")}</p>
        <div className={styles.quadri}>
          {Object.entries(stile.quadri).map(([nome, quadro]) => (
            <div key={nome} className={styles.quadro}>
              <QuadroInScala nome={nome} quadro={quadro} stile={stile} />
              <details className={styles.dettagli}>
                <summary>{t("Misure di «{nome}»", "Measures of «{nome}»", { nome: nomeQuadro(nome) })}</summary>
                <MisureQuadro nome={nome} quadro={quadro} colori={nomiColori} modifica={modifica} />
              </details>
            </div>
          ))}
        </div>
      </Sezione>

      <Sezione titolo={t("I colori", "Colors")}>
        <ul className={styles.colori}>
          {Object.entries(stile.colori).map(([nome, valore]) => (
            <li key={nome}>
              <input type="color" aria-label={t("Colore {nome}", "Color {nome}", { nome: nomeColore(nome) })} value={/^#[0-9a-fA-F]{6}$/.test(valore) ? valore.toLowerCase() : "#000000"} onChange={(e) => modifica((s) => (s.colori[nome] = e.target.value.toUpperCase()))} />
              <span>{nomeColore(nome)}</span>
              <code>{valore}</code>
            </li>
          ))}
        </ul>
      </Sezione>

      <Sezione titolo={t("Sottotitoli e titolo", "Subtitles and title")}>
        <CartelloDiProva stile={stile} />
        <div className={styles.gruppo}>
          <h3>{t("Sottotitoli", "Subtitles")}</h3>
          <Scelta etichetta={t("Modo", "Mode")} valore={stile.sottotitoli.modo} opzioni={[["parola per parola", t("Parola per parola", "Word by word")], ["a battute", t("A battute", "By lines")], ["nessuno", t("Nessuno", "None")]]} onCambia={(v) => modifica((s) => (s.sottotitoli.modo = v as Stile["sottotitoli"]["modo"]))} />
          <Numeri
            campi={[
              num(t("Corpo", "Size"), stile.sottotitoli.corpo, (s, n) => (s.sottotitoli.corpo = n), { cifre: 0 }),
              num(t("Corpo minimo", "Minimum size"), stile.sottotitoli.corpo_minimo, (s, n) => (s.sottotitoli.corpo_minimo = n), { cifre: 0 }),
              num(t("Caratteri per battuta", "Characters per line"), stile.sottotitoli.caratteri_per_battuta, (s, n) => (s.sottotitoli.caratteri_per_battuta = n), { cifre: 0 }),
              num(t("Stacco fra battute", "Gap between lines"), stile.sottotitoli.stacco, (s, n) => (s.sottotitoli.stacco = n), { unita: "s" }),
              num(t("Bordo", "Border"), stile.sottotitoli.bordo, (s, n) => (s.sottotitoli.bordo = n), { cifre: 0, unita: "px" }),
              ...(stile.sottotitoli.contorno === undefined ? [] : [num(t("Contorno", "Outline"), stile.sottotitoli.contorno, (s, n) => (s.sottotitoli.contorno = n), { cifre: 0, unita: "px" })]),
            ]}
          />
          <div className={styles.numeri}>
            {coloreONiente(t("Fondo", "Background"), stile.sottotitoli.fondo, (s, v) => (s.sottotitoli.fondo = v))}
            {colorePer(t("Testo e bordo", "Text and border"), stile.sottotitoli.colore, (s, v) => (s.sottotitoli.colore = v))}
            {stile.sottotitoli.colore_contorno !== undefined && colorePer(t("Colore del contorno", "Outline color"), stile.sottotitoli.colore_contorno, (s, v) => (s.sottotitoli.colore_contorno = v))}
            {colorePer(t("Correzioni", "Corrections"), stile.sottotitoli.colore_correzione, (s, v) => (s.sottotitoli.colore_correzione = v))}
          </div>
        </div>
        <div className={styles.gruppo}>
          <h3>{t("Titolo", "Title")}</h3>
          <Numeri
            campi={[
              num(t("Corpo", "Size"), stile.titolo.corpo, (s, n) => (s.titolo.corpo = n), { cifre: 0 }),
              num(t("Margine", "Margin"), stile.titolo.margine, (s, n) => (s.titolo.margine = n), { cifre: 0, unita: "px" }),
              num(t("Larghezza", "Width"), stile.titolo.largo, (s, n) => (s.titolo.largo = n), { cifre: 0, unita: "px" }),
            ]}
          />
          <div className={styles.numeri}>
            {colorePer(t("Fondo", "Background"), stile.titolo.fondo, (s, v) => (s.titolo.fondo = v))}
            {colorePer(t("Testo", "Text"), stile.titolo.colore, (s, v) => (s.titolo.colore = v))}
          </div>
        </div>
      </Sezione>

      <Sezione titolo={t("La voce", "The voice")}>
        <Numeri
          campi={[
            num(t("Volume della voce", "Voice volume"), stile.voce.lufs, (s, n) => (s.voce.lufs = n), { unita: "LUFS" }),
            num(t("Soglia del silenzio", "Silence threshold"), stile.voce.silenzio_db, (s, n) => (s.voce.silenzio_db = n), { unita: "dB" }),
            num(t("Margine attorno alle parole", "Margin around the words"), stile.voce.margine, (s, n) => (s.voce.margine = n), { unita: "s" }),
            num(t("Suoni di fondo", "Background sounds"), stile.suoni.fondo_db, (s, n) => (s.suoni.fondo_db = n), { unita: "dB" }),
            num(t("Suoni d'accento", "Accent sounds"), stile.suoni.accento_db, (s, n) => (s.suoni.accento_db = n), { unita: "dB" }),
          ]}
        />
      </Sezione>

      <Sezione titolo={t("I tagli", "Cuts")}>
        <div className={styles.gruppo}>
          <h3>{t("Pezzi scelti a tempo", "Clips chosen by time")}</h3>
          <Numeri
            campi={[
              num(t("Prima della voce", "Before the voice"), stile.taglio.a_tempo.prima, (s, n) => (s.taglio.a_tempo.prima = n), { unita: "s" }),
              num(t("Dopo la voce", "After the voice"), stile.taglio.a_tempo.dopo, (s, n) => (s.taglio.a_tempo.dopo = n), { unita: "s" }),
              num(t("Pausa che resta", "Pause that stays"), stile.taglio.a_tempo.pausa, (s, n) => (s.taglio.a_tempo.pausa = n), { unita: "s" }),
              num(t("Tratto minimo", "Minimum segment"), stile.taglio.a_tempo.tratto_minimo, (s, n) => (s.taglio.a_tempo.tratto_minimo = n), { unita: "s" }),
            ]}
          />
        </div>
        <div className={styles.gruppo}>
          <h3>{t("Pezzi scelti a parole", "Clips chosen by words")}</h3>
          <Numeri
            campi={[
              num(t("Pausa che resta", "Pause that stays"), stile.taglio.a_parole.pausa, (s, n) => (s.taglio.a_parole.pausa = n), { unita: "s" }),
              num(t("Stacco", "Gap"), stile.taglio.a_parole.stacco, (s, n) => (s.taglio.a_parole.stacco = n), { unita: "s" }),
              num(t("Parole vicine", "Close words"), stile.taglio.a_parole.vicine, (s, n) => (s.taglio.a_parole.vicine = n), { cifre: 0 }),
            ]}
          />
        </div>
      </Sezione>

      <Sezione titolo={t("Il video che esce", "The output video")}>
        <Numeri
          campi={[
            num(t("Larghezza", "Width"), stile.formato.largo, (s, n) => (s.formato.largo = n), { cifre: 0, unita: "px" }),
            num(t("Altezza", "Height"), stile.formato.alto, (s, n) => (s.formato.alto = n), { cifre: 0, unita: "px" }),
            num(t("Fotogrammi al secondo", "Frames per second"), stile.formato.fps, (s, n) => (s.formato.fps = n), { cifre: 0 }),
            ...Object.entries(stile.formati ?? {}).flatMap(([nome, f]) => [
              num(t("Formato {nome}, larghezza", "Format ({nome}), width", { nome: nomeFormato(nome) }), f.largo, (s, n) => (s.formati![nome]!.largo = n), { cifre: 0, unita: "px" }),
              num(t("Formato {nome}, altezza", "Format ({nome}), height", { nome: nomeFormato(nome) }), f.alto, (s, n) => (s.formati![nome]!.alto = n), { cifre: 0, unita: "px" }),
            ]),
            num(t("Qualità del video", "Video quality"), stile.uscita.crf, (s, n) => (s.uscita.crf = n), { cifre: 0 }),
            num(t("Qualità dell'audio", "Audio quality"), stile.uscita.audio_kbit, (s, n) => (s.uscita.audio_kbit = n), { cifre: 0, unita: "kbit/s" }),
            num(t("Copia leggera, larghezza", "Light copy, width"), stile.uscita.leggero.largo, (s, n) => (s.uscita.leggero.largo = n), { cifre: 0, unita: "px" }),
            num(t("Copia leggera, altezza", "Light copy, height"), stile.uscita.leggero.alto, (s, n) => (s.uscita.leggero.alto = n), { cifre: 0, unita: "px" }),
            num(t("Copia leggera, qualità", "Light copy, quality"), stile.uscita.leggero.crf, (s, n) => (s.uscita.leggero.crf = n), { cifre: 0 }),
          ]}
        />
        <div className={styles.spunte}>
          <label>
            <input type="checkbox" checked={stile.copertina.titolo_in_alto} onChange={(e) => modifica((s) => (s.copertina.titolo_in_alto = e.target.checked))} />
            {t("Nella copertina il titolo sta in alto", "On the cover the title is at the top")}
          </label>
          <label>
            <input type="checkbox" checked={stile.copertina.sagoma_del_primo_fotogramma} onChange={(e) => modifica((s) => (s.copertina.sagoma_del_primo_fotogramma = e.target.checked))} />
            {t("Nella copertina c'è la persona del primo fotogramma", "The cover shows the person from the first frame")}
          </label>
        </div>
      </Sezione>
    </div>
  )
}
