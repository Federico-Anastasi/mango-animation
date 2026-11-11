import { Bottone } from "../comuni/Bottone"
import { CampoNumero } from "../comuni/CampoNumero"
import { Icona } from "../comuni/icone"
import { frasePerLingua, t } from "../lingua"
import { centesimi, giorno, numero } from "../testo"
import type { Stile, Zoom } from "../tipi"
import type { Azione } from "./azione"
import { soloAnimazione } from "./composizione"
import { trattoA, bordo, dividi, muoviPezzo, portaPezzoInScena, togliTratto, vistaDelPezzo, zoomPezzo, ereditata, staccaDallaBase, ZOOM_MASSIMO } from "./ritocchi"
import { dellaSorgente, type InfoSorgente } from "./sorgenti"
import { useDiscreto, type Trasporto } from "./trasporto"
import styles from "./Pannelli.module.css"

const CENTRO_PREDEFINITO: [number, number] = [0.5, 0.5]

function ControlloZoom({ zoom, bloccato, onProvvisorio, onFinale }: { zoom: Zoom | null; bloccato: boolean; onProvvisorio: (z: Zoom) => void; onFinale: (z: Zoom | null) => void }) {
  const modo = !zoom ? "nessuno" : zoom.scala !== undefined ? "fisso" : "cresce"
  const centro = zoom?.centro ?? CENTRO_PREDEFINITO
  const scegli = (nuovo: string) => {
    if (nuovo === "nessuno") onFinale(null)
    if (nuovo === "fisso") onFinale({ scala: 1.5, centro })
    if (nuovo === "cresce") onFinale({ da: 1, a: 1.5, centro })
  }
  return (
    <div className={styles.blocco}>
      <label className={styles.campo}>
        <span className={styles.etichetta}>{t("Ingrandimento", "Zoom")}</span>
        <select value={modo} disabled={bloccato} onChange={(e) => scegli(e.target.value)}>
          <option value="nessuno">{t("Nessuno", "None")}</option>
          <option value="fisso">{t("Fisso per tutto il pezzo", "Fixed for the whole clip")}</option>
          <option value="cresce">{t("Cresce lungo il pezzo", "Grows along the clip")}</option>
        </select>
      </label>
      {zoom && (
        <>
          <div className={styles.coppia}>
            {zoom.scala !== undefined ? (
              <CampoNumero etichetta={t("Scala", "Scale")} valore={zoom.scala} unita="×" disabled={bloccato} onConferma={(n) => onFinale({ ...zoom, scala: n })} />
            ) : (
              <>
                <CampoNumero etichetta={t("Scala all'inizio", "Scale at the start")} valore={zoom.da ?? 1} unita="×" disabled={bloccato} onConferma={(n) => onFinale({ ...zoom, da: n })} />
                <CampoNumero etichetta={t("Scala alla fine", "Scale at the end")} valore={zoom.a ?? 1} unita="×" disabled={bloccato} onConferma={(n) => onFinale({ ...zoom, a: n })} />
              </>
            )}
          </div>
          {zoom.scala !== undefined && (
            <input
              type="range"
              className={styles.cursore}
              min={1}
              max={ZOOM_MASSIMO}
              step={0.05}
              value={zoom.scala}
              disabled={bloccato}
              aria-label={t("Scala dell'ingrandimento", "Zoom scale")}
              onChange={(e) => onProvvisorio({ ...zoom, scala: Number(e.target.value) })}
              onPointerUp={(e) => onFinale({ ...zoom, scala: Number(e.currentTarget.value) })}
              onKeyUp={(e) => onFinale({ ...zoom, scala: Number(e.currentTarget.value) })}
            />
          )}
          <div className={styles.coppia}>
            <CampoNumero etichetta={t("Centro, da sinistra", "Center, from the left")} valore={centro[0] * 100} cifre={0} unita="%" disabled={bloccato} onConferma={(n) => onFinale({ ...zoom, centro: [n / 100, centro[1]] })} />
            <CampoNumero etichetta={t("Centro, dall'alto", "Center, from the top")} valore={centro[1] * 100} cifre={0} unita="%" disabled={bloccato} onConferma={(n) => onFinale({ ...zoom, centro: [centro[0], n / 100] })} />
          </div>
          <p className={styles.nota}>{t("Per spostare l'ingrandimento trascina il girato sull'anteprima.", "To move the zoom, drag the footage on the preview.")}</p>
        </>
      )}
    </div>
  )
}

export function PannelloTratto({
  azione,
  indice,
  info,
  stile,
  trasporto,
  zoomProvvisorio,
  onZoomProvvisorio,
  onDeseleziona,
}: {
  azione: Azione
  indice: number
  info: InfoSorgente | undefined
  stile: Stile
  trasporto: Trasporto
  zoomProvvisorio: Zoom | null
  onZoomProvvisorio: (zoom: Zoom | null) => void
  onDeseleziona: () => void
}) {
  const { ctx, esegui, bloccato } = azione
  const tratto = ctx.risolto.tratti[indice]!
  const scena = ctx.effettivo.scene[tratto.scena]
  const pezzi = scena?.pezzi.length ?? 0
  const inEredita = ereditata(ctx.proprio, ctx.effettivo, tratto.scena)
  const sotto = useDiscreto(trasporto, (t) => trattoA(ctx.risolto, t)) === indice
  const senzaVoce = tratto.sorgente === null
  const sorgente = dellaSorgente(ctx.effettivo.sorgenti, tratto)
  const viste = Object.keys(sorgente?.viste ?? {})
  const pezzo = scena?.pezzi[tratto.pezzo]
  const minimo = stile.taglio.a_tempo.tratto_minimo
  const avvisi = ctx.risolto.avvisi.filter((a) => a.tratto === indice)
  const zoom = zoomProvvisorio ?? tratto.zoom
  const fine = tratto.da + tratto.durata

  return (
    <div className={styles.pannello}>
      <h2>{t("Pezzo scelto", "Selected clip")}</h2>
      <p className={styles.nota}>
        {senzaVoce ? t("Senza voce", "No voice") : info ? info.file.split("/").pop() : t("File sconosciuto", "Unknown file")}
        {info && <> · {t("girato il {giorno}", "recorded on {giorno}", { giorno: giorno(info.file.split("/")[0] ?? "") })}</>}
        <br />
        {t("Scena «{scena}», pezzo {n} di {tot}", "Scene «{scena}», clip {n} of {tot}", { scena: scena?.nome ?? "", n: tratto.pezzo + 1, tot: pezzi })}
        {senzaVoce ? "" : pezzo?.dice !== undefined ? t(", scelto a parole", ", chosen by words") : t(", scelto a tempo", ", chosen by time")}
      </p>

      {inEredita && (
        <div className={styles.avviso}>
          <p>{t("Questo pezzo viene dal video «{base}»: da qui non si cambia.", "This clip comes from the video «{base}»: it cannot be changed from here.", { base: ctx.proprio.base ?? "" })}</p>
          <Bottone variante="vuoto" onClick={() => esegui(staccaDallaBase(ctx))} disabled={bloccato}>
            {t("Stacca dalla base", "Detach from base")}
          </Bottone>
        </div>
      )}

      {senzaVoce ? (
        <p className={styles.nota}>
          {tratto.girato
            ? t("Dura {durata} s: il girato «{girato}», muto.", "Lasts {durata} s: the footage «{girato}», muted.", { durata: numero(tratto.durata, 2), girato: tratto.girato.sorgente })
            : t("Dura {durata} s: non ha girato, solo l'animazione della scena.", "Lasts {durata} s: no footage, just the scene's animation.", { durata: numero(tratto.durata, 2) })}
        </p>
      ) : (
        <>
          <div className={styles.coppia}>
            <CampoNumero etichetta={t("Da", "From")} valore={tratto.da} unita="s" disabled={bloccato || inEredita} onConferma={(n) => esegui(bordo(ctx, indice, "inizio", n, { durataSorgente: info?.durata ?? undefined, minimo }))} />
            <CampoNumero etichetta={t("A", "To")} valore={fine} unita="s" disabled={bloccato || inEredita} onConferma={(n) => esegui(bordo(ctx, indice, "fine", n, { durataSorgente: info?.durata ?? undefined, minimo }))} />
          </div>
          <p className={styles.nota}>
            {t("Dura {durata} s, dal secondo {da} al {a} del girato.", "Lasts {durata} s, from second {da} to {a} of the footage.", { durata: numero(tratto.durata, 2), da: centesimi(tratto.da), a: centesimi(fine) })}
          </p>
        </>
      )}

      {viste.length > 0 && (
        <label className={styles.campo}>
          <span className={styles.etichetta}>{t("Vista del girato", "View of the footage")}</span>
          <select value={pezzo?.vista ?? ""} disabled={bloccato || inEredita} onChange={(e) => esegui(vistaDelPezzo(ctx, tratto.scena, tratto.pezzo, e.target.value === "" ? null : e.target.value))}>
            <option value="">{t("Quella della scena{vista}", "The scene's{vista}", { vista: scena?.vista ? ` (${scena.vista})` : "" })}</option>
            {viste.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
      )}

      {!senzaVoce && (
        <ControlloZoom
          zoom={zoom}
          bloccato={bloccato || inEredita}
          onProvvisorio={onZoomProvvisorio}
          onFinale={(z) => {
            onZoomProvvisorio(null)
            esegui(zoomPezzo(ctx, tratto.scena, tratto.pezzo, z))
          }}
        />
      )}

      {ctx.effettivo.scene.length > 1 && (
        <label className={styles.campo}>
          <span className={styles.etichetta}>{t("Porta in un'altra scena", "Move to another scene")}</span>
          <select
            value=""
            disabled={bloccato || inEredita}
            onChange={(e) => {
              const esito = portaPezzoInScena(ctx, tratto.scena, tratto.pezzo, Number(e.target.value), { soloAnimazione: (quadro) => soloAnimazione(stile, quadro) })
              esegui(esito)
              if (esito.ok) onDeseleziona()
            }}
          >
            <option value="">{t("Scegli la scena", "Choose the scene")}</option>
            {ctx.effettivo.scene.map((s, i) =>
              i === tratto.scena ? null : (
                <option key={`${s.nome}-${i}`} value={i}>
                  {s.nome}
                </option>
              ),
            )}
          </select>
        </label>
      )}

      <div className={styles.azioni}>
        {!senzaVoce && (
          <Bottone variante="vuoto" onClick={() => esegui(dividi(ctx, trasporto.t()))} disabled={bloccato || inEredita || !sotto} titolo={sotto ? undefined : t("Porta la linea rossa dentro questo pezzo", "Move the red line inside this clip")}>
            <Icona nome="dividi" />
            {t("Dividi qui", "Split here")}
          </Bottone>
        )}
        <Bottone
          variante="vuoto"
          onClick={() => {
            esegui(togliTratto(ctx, indice))
            onDeseleziona()
          }}
          disabled={bloccato || inEredita}
        >
          <Icona nome="togli" />
          {t("Togli", "Remove")}
        </Bottone>
        <Bottone variante="vuoto" onClick={() => esegui(muoviPezzo(ctx, tratto.scena, tratto.pezzo, tratto.pezzo - 1))} disabled={bloccato || inEredita || tratto.pezzo === 0} titolo={tratto.pezzo === 0 ? t("È già il primo pezzo della scena", "It is already the first clip of the scene") : undefined}>
          <Icona nome="sinistra" />
          {t("Sposta prima", "Move earlier")}
        </Bottone>
        <Bottone variante="vuoto" onClick={() => esegui(muoviPezzo(ctx, tratto.scena, tratto.pezzo, tratto.pezzo + 1))} disabled={bloccato || inEredita || tratto.pezzo >= pezzi - 1} titolo={tratto.pezzo >= pezzi - 1 ? t("È già l'ultimo pezzo della scena", "It is already the last clip of the scene") : undefined}>
          {t("Sposta dopo", "Move later")}
          <Icona nome="destra" />
        </Bottone>
      </div>

      {(avvisi.length > 0 || tratto.legato[0] !== null || tratto.legato[1] !== null) && (
        <ul className={styles.avvisi}>
          {tratto.legato[0] !== null && <li>{t("Il taglio d'inizio cade dentro una parola: riascoltalo.", "The start cut falls inside a word: listen to it again.")}</li>}
          {tratto.legato[1] !== null && <li>{t("Il taglio di fine cade dentro una parola: riascoltalo.", "The end cut falls inside a word: listen to it again.")}</li>}
          {avvisi.map((a) => (
            <li key={a.cosa}>{frasePerLingua(a.cosa, a.cosa_en)}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
