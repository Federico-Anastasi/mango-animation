// «Com'è montato, e cosa cambio?»: l'anteprima, il pannello del tratto scelto, il parlato e la timeline. Ogni
// gesto passa da `ritocchi.ts` e si manda al server come piano nuovo; il montaggio ricalcolato torna da sé.
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { api, ErroreApi, urlMedia, urlUscita } from "../api"
import { Bottone } from "../comuni/Bottone"
import { Colonne } from "../comuni/Colonne"
import { Icona } from "../comuni/icone"
import { t } from "../lingua"
import { Caricamento, Errore, Vuoto } from "../comuni/Stati"
import { animazioni, copiaVideo, grezzo, lavori, stile as copiaStile, useCopia } from "../dati"
import { dataOra, tempoLeggibile } from "../testo"
import type { DettaglioVideo, GiornoGrezzo, Piano, PianoCompleto, Stile, Zoom } from "../tipi"
import { FILE_FINITI, uscitaDi } from "../video/liste"
import { AnteprimaPiano } from "./AnteprimaPiano"
import type { DatiPiano, ZoomProvvisorio } from "./motore"
import type { Azione } from "./azione"
import { soloAnimazione } from "./composizione"
import { ritocchiTra } from "./differenze"
import { ElencoParole } from "./ElencoParole"
import { PannelloParole } from "./PannelloParole"
import { PannelloScena } from "./PannelloScena"
import { PannelloTratto } from "./PannelloTratto"
import { PannelloVideo } from "./PannelloVideo"
import { bordo, dividi, muoviPezzo, portaPezzoInScena, togliParole, togliTratto, zoomPezzo, type Contesto, type Esito } from "./ritocchi"
import { indiceDelTratto, selezioneDelTratto, selezioneValida, type Selezione } from "./selezione"
import { dellaSorgente, infoSorgenti } from "./sorgenti"
import { Timeline } from "./Timeline"
import { Versioni } from "./Versioni"
import { uguali } from "./uguali"
import { useSorgentiPreparate } from "./useSorgentiPreparate"
import { useTeste } from "./teste"
import { useTempo, useTrasporto, useInRiproduzione, type Trasporto } from "./trasporto"
import styles from "./Montaggio.module.css"

function Orologio({ trasporto, durata }: { trasporto: Trasporto; durata: number }) {
  const t = useTempo(trasporto)
  return (
    <span className={styles.orologio} data-testid="orologio">
      {tempoLeggibile(t)} / {tempoLeggibile(durata)}
    </span>
  )
}

function Trasporti({ trasporto }: { trasporto: Trasporto }) {
  const suona = useInRiproduzione(trasporto)
  return (
    <div className={styles.trasporti}>
      <button type="button" onClick={() => trasporto.passo(-1)} aria-label={t("Un fotogramma indietro", "One frame back")} title={t("Un fotogramma indietro (freccia sinistra)", "One frame back (left arrow)")}>
        <Icona nome="indietro" />
      </button>
      <button type="button" className={styles.suona} onClick={() => trasporto.alterna()} aria-label={suona ? t("Ferma", "Pause") : t("Avvia", "Play")} title={suona ? t("Ferma (barra spaziatrice)", "Pause (space bar)") : t("Avvia (barra spaziatrice)", "Play (space bar)")}>
        <Icona nome={suona ? "pausa" : "play"} />
      </button>
      <button type="button" onClick={() => trasporto.passo(1)} aria-label={t("Un fotogramma avanti", "One frame forward")} title={t("Un fotogramma avanti (freccia destra)", "One frame forward (right arrow)")}>
        <Icona nome="avanti" />
      </button>
    </div>
  )
}

/** Dopo un salvataggio riuscito, quanto si aspetta il piano nuovo prima di rileggerlo. */
const ATTESA_DEL_PIANO_MS = 5000

function dopoIlMontaggio(video: DettaglioVideo): string {
  return video.piano_cambiato ? ` (${dataOra(video.piano_cambiato)})` : ""
}

function SenzaPiano({ video }: { video: DettaglioVideo }) {
  const [misure, setMisure] = useState<{ largo: number; alto: number } | null>(null)
  const finito = FILE_FINITI.map((nome) => uscitaDi(video, nome)).find((u) => u !== undefined)
  if (!finito) {
    return (
      <div className={styles.senza}>
        <Vuoto>{video.scheda.stato === "pronto" || video.scheda.stato === "pubblicato" ? t("Il file di questo video non è nell'archivio.", "The file of this video is not in the archive.") : video.fase ? t("Questo video non ha ancora un montaggio: la riga dei passi qui sopra dice cosa viene prima.", "This video has no edit yet: the row of steps above says what comes first.") : t("Questo video non ha ancora un montaggio. Prima viene il copione, nella scheda «Scheda».", "This video has no edit yet. The script comes first, in the «Card» tab.")}</Vuoto>
      </div>
    )
  }
  const largo = misure ? misure.largo >= misure.alto : false
  return (
    <div className={styles.montato}>
      <video
        className={styles.video}
        style={misure ? { aspectRatio: `${misure.largo} / ${misure.alto}`, maxWidth: largo ? "100%" : undefined } : undefined}
        src={urlUscita(finito)}
        controls
        preload="metadata"
        onLoadedMetadata={(e) => setMisure({ largo: e.currentTarget.videoWidth, alto: e.currentTarget.videoHeight })}
      />
    </div>
  )
}

/** Una maniglia che si allarga con le frecce le usa per sé: la testina non si muove. */
const eUnaManiglia = (el: EventTarget | null) => el instanceof Element && el.closest('[role="separator"]') !== null
const eUnCampo = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))

export function Montaggio({ video, tempoIniziale }: { video: DettaglioVideo; tempoIniziale: string | null }) {
  const { slug, risolto } = video
  const datiStile = useCopia(copiaStile)
  const datiGirato = useCopia(grezzo)
  const datiAnimazioni = useCopia(animazioni).dato
  const statoLavori = useCopia(lavori).dato

  if (video.piano === null) return <SenzaPiano video={video} />
  if (datiStile.errore && !datiStile.dato) return <Errore messaggio={datiStile.errore} onRiprova={() => void copiaStile.rileggi()} />
  if (datiGirato.errore && !datiGirato.dato) return <Errore messaggio={datiGirato.errore} onRiprova={() => void grezzo.rileggi()} />
  if (!datiStile.dato || !datiGirato.dato) return <Caricamento />
  if (video.piano_risolto_da_base === null && video.problemi.piano.length > 0) {
    return (
      <div className={styles.senza}>
        <Vuoto>{t("Il piano di questo video ha un errore (è scritto sopra). Appena è sistemato il montaggio riappare.", "The plan of this video has an error (written above). As soon as it is fixed the edit reappears.")}</Vuoto>
        <Versioni video={video} />
      </div>
    )
  }
  if (video.piano_risolto_da_base === null) {
    return (
      <div className={styles.senza}>
        <Vuoto>{t("Il video di base di questo montaggio non c'è, oppure ne dipende a sua volta in giro. Correggi la base e il montaggio riappare.", "The base video of this edit is missing, or it depends on this one in a loop. Fix the base and the edit reappears.")}</Vuoto>
      </div>
    )
  }
  if (!risolto) {
    return (
      <div className={styles.senza}>
        <Vuoto>{t("Il montaggio di questo video non è ancora stato calcolato: ci vuole qualche secondo. Se non arriva, chiedi nella chat di calcolarlo.", "The edit of this video has not been calculated yet: it takes a few seconds. If it does not arrive, ask in the chat to calculate it.")}</Vuoto>
      </div>
    )
  }

  const faIlLavoro = (comando: string): boolean =>
    video.lavoro?.comando === comando || Boolean(statoLavori?.in_corso?.slug === slug && statoLavori.in_corso.comando === comando) || Boolean(statoLavori?.in_coda.some((l) => l.slug === slug && l.comando === comando))

  return <Aperto video={video} risolto={risolto} stile={datiStile.dato} giorni={datiGirato.dato} animazioni={(datiAnimazioni?.[slug] ?? []).map((a) => a.sigla)} occupato={faIlLavoro("monta")} ricalcolando={faIlLavoro("risolvi")} tempoIniziale={tempoIniziale} />
}

function Aperto({
  video: dettaglio,
  risolto,
  stile,
  giorni,
  animazioni: sigle,
  occupato,
  ricalcolando,
  tempoIniziale,
}: {
  video: DettaglioVideo
  risolto: NonNullable<DettaglioVideo["risolto"]>
  stile: Stile
  giorni: GiornoGrezzo[]
  animazioni: string[]
  occupato: boolean
  /** Un `risolvi` di questo video gira o aspetta. */
  ricalcolando: boolean
  tempoIniziale: string | null
}) {
  // Il piano e la base ci sono: `Montaggio` non apre questa vista altrimenti.
  const video = dettaglio as DettaglioVideo & { piano: Piano; piano_risolto_da_base: PianoCompleto }
  const { slug } = video
  const trasporto = useTrasporto(risolto.durata, risolto.formato.fps)
  const [modo, setModo] = useState<"piano" | "montato">(() => (dettaglio.montato ? "montato" : "piano"))
  const [selezione, setSelezione] = useState<Selezione | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [invio, setInvio] = useState(false)
  const [attesa, setAttesa] = useState<string | null>(null)
  const [zoomProv, setZoomProv] = useState<ZoomProvvisorio | null>(null)
  const [correggi, setCorreggi] = useState(0)
  const [stretta, setStretta] = useState(false)

  const sorgenti = useMemo(() => infoSorgenti(video.piano_risolto_da_base.sorgenti, giorni), [video.piano_risolto_da_base.sorgenti, giorni])
  const preparate = useSorgentiPreparate(Object.values(sorgenti))
  const finale = uscitaDi(video, "finale.mp4")
  const montato = video.uscite.find((u) => u.file === video.montato?.file)
  const conSagoma = risolto.scene.some((sc) => stile.quadri[sc.quadro]?.strati.some((x) => x.tipo === "sagoma"))
  const teste = useTeste(slug, finale?.cambiato ?? "", video.piano_risolto_da_base.sorgenti, conSagoma && finale !== undefined)

  const ctx: Contesto = useMemo(() => ({ proprio: video.piano, effettivo: video.piano_risolto_da_base, risolto }), [video.piano, video.piano_risolto_da_base, risolto])
  const dati: DatiPiano = useMemo(
    () => ({
      risolto,
      piano: video.piano_risolto_da_base,
      stile,
      sorgenti,
      teste,
      urlAnimazione: (sigla) => urlMedia(`video/${slug}/lavoro/scene/${sigla}.mp4`),
      versioneScene: finale?.cambiato ?? "",
    }),
    [risolto, video.piano_risolto_da_base, stile, sorgenti, teste, finale?.cambiato, slug],
  )

  const sceltaValida = selezioneValida(risolto, selezione)
  const indiceScelto = indiceDelTratto(risolto, sceltaValida)
  const impronta = risolto.impronta
  const pianoAdesso = JSON.stringify(video.piano)
  const inAttesa = attesa !== null && attesa === pianoAdesso
  const bloccato = invio || inAttesa || !video.risolto_aggiornato
  const inViaggio = invio || inAttesa

  useEffect(() => {
    setZoomProv(null)
    setSelezione((s) => (s?.tipo === "parole" ? null : s))
  }, [impronta])

  useEffect(() => {
    if (attesa !== null && attesa !== pianoAdesso) setAttesa(null)
  }, [attesa, pianoAdesso])

  // Il piano salvato non è arrivato (l'evento si è perso, o il server ha tenuto lo stesso testo): si rilegge e i gesti si riaprono.
  useEffect(() => {
    if (attesa === null) return
    const scaduta = setTimeout(() => void copiaVideo(slug).rileggi().finally(() => setAttesa(null)), ATTESA_DEL_PIANO_MS)
    return () => clearTimeout(scaduta)
  }, [attesa, slug])

  useEffect(() => {
    const secondi = tempoIniziale === null ? NaN : Number(tempoIniziale)
    if (Number.isFinite(secondi)) trasporto.vai(secondi)
  }, [tempoIniziale, trasporto])

  const esegui = useCallback(
    (esito: Esito) => {
      if (!esito.ok) {
        setErrore(esito.motivo)
        return
      }
      setErrore(null)
      if (uguali(esito.piano, video.piano)) return
      setInvio(true)
      // Solo ciò che il gesto ha cambiato, sul piano che c'è nel file adesso: se Claude (o altro) ha scritto nel frattempo, il suo cambio resta.
      api
        .ritoccaPiano(slug, ritocchiTra(video.piano, esito.piano))
        .then(() => setAttesa(JSON.stringify(video.piano)))
        .catch((e: Error) => {
          const cambiato = e instanceof ErroreApi && e.codice === 409
          setErrore(cambiato ? t("Il piano è cambiato nel frattempo: l'ho riletto, rifai il gesto.", "The plan changed in the meantime: I have read it again, redo the gesture.") : e.message)
          if (cambiato) void copiaVideo(slug).rileggi()
          setZoomProv(null)
        })
        .finally(() => setInvio(false))
    },
    [slug, video.piano],
  )

  const viaServer = useCallback(
    (chiamata: () => Promise<unknown>) => {
      setErrore(null)
      setInvio(true)
      chiamata()
        .then(() => setAttesa(JSON.stringify(video.piano)))
        .catch((e: Error) => setErrore(e.message))
        .finally(() => setInvio(false))
    },
    [video.piano],
  )

  const azione: Azione = { ctx, esegui, bloccato }

  const ultimo = useRef({ ctx, esegui, bloccato, inViaggio, sceltaValida, indiceScelto, viaServer, video })
  ultimo.current = { ctx, esegui, bloccato, inViaggio, sceltaValida, indiceScelto, viaServer, video }

  useEffect(() => {
    const tasto = (e: KeyboardEvent) => {
      if (eUnCampo(e.target) || e.altKey) return
      const u = ultimo.current
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault()
        if (e.shiftKey && u.video.puo_rifare && !u.inViaggio) u.viaServer(() => api.rifai(u.video.slug))
        if (!e.shiftKey && u.video.puo_annullare && !u.inViaggio) u.viaServer(() => api.annulla(u.video.slug))
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault()
        if (u.video.puo_rifare && !u.inViaggio) u.viaServer(() => api.rifai(u.video.slug))
        return
      }
      if (e.ctrlKey || e.metaKey) return
      if (e.key === " ") {
        if (e.target instanceof HTMLButtonElement) return
        e.preventDefault()
        trasporto.alterna()
      } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !eUnaManiglia(e.target)) {
        e.preventDefault()
        trasporto.ferma()
        trasporto.passo((e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? Math.round(trasporto.fps() / 2) : 1))
      } else if (e.key.toLowerCase() === "s") {
        if (!u.bloccato) u.esegui(dividi(u.ctx, trasporto.t()))
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault()
        if (u.bloccato) return
        if (u.sceltaValida?.tipo === "tratto") u.esegui(togliTratto(u.ctx, u.indiceScelto))
        if (u.sceltaValida?.tipo === "parole") {
          u.esegui(togliParole(u.ctx, u.sceltaValida.da, u.sceltaValida.a))
          setSelezione(null)
        }
      }
    }
    window.addEventListener("keydown", tasto)
    return () => window.removeEventListener("keydown", tasto)
  }, [trasporto])

  const tratto = risolto.tratti[indiceScelto]
  const conZoom = tratto?.zoom || (zoomProv && zoomProv.tratto === indiceScelto)
  const modificaZoom =
    tratto && conZoom && !bloccato
      ? {
          tratto: indiceScelto,
          onProvvisorio: (zoom: Zoom) => setZoomProv({ tratto: indiceScelto, zoom }),
          onFinale: (zoom: Zoom) => {
            setZoomProv({ tratto: indiceScelto, zoom })
            esegui(zoomPezzo(ctx, tratto.scena, tratto.pezzo, zoom))
          },
        }
      : null

  const vaiAlTratto = (i: number) => {
    const t = risolto.tratti[i]
    if (!t) return
    trasporto.ferma()
    trasporto.vai(t.esce)
    setSelezione(selezioneDelTratto(risolto, i))
  }

  const anteprima = (
    <div className={styles.anteprima}>
      <div className={styles.modi} role="group" aria-label={t("Che anteprima vedere", "Which preview to show")}>
        <button type="button" aria-pressed={modo === "piano"} onClick={() => setModo("piano")}>
          {t("Piano", "Plan")}
        </button>
        <button type="button" aria-pressed={modo === "montato"} onClick={() => setModo("montato")}>
          {t("Montato", "Edited")}
        </button>
      </div>
      {modo === "piano" ? (
        <>
          <AnteprimaPiano dati={dati} trasporto={trasporto} zoomProvvisorio={zoomProv} modificaZoom={modificaZoom} />
          <div className={styles.comandi}>
            <Trasporti trasporto={trasporto} />
            <Orologio trasporto={trasporto} durata={risolto.durata} />
          </div>
        </>
      ) : (
        <div className={styles.montato}>
          {montato ? <video className={styles.video} style={{ aspectRatio: `${risolto.formato.largo} / ${risolto.formato.alto}`, maxWidth: risolto.formato.largo >= risolto.formato.alto ? "100%" : undefined }} src={urlUscita(montato)} controls preload="metadata" /> : <Vuoto>{t("Non c'è ancora un video montato: chiedilo nella chat.", "There is no edited video yet: ask for it in the chat.")}</Vuoto>}
          {montato && video.piano_dopo_montato && (
            <div className={styles.avviso}>
              <p>{occupato ? t("Il piano o lo stile sono cambiati dopo l'ultimo montaggio{quando}: il montaggio nuovo è in corso.", "The plan or the style changed after the last edit{quando}: the new edit is in progress.", { quando: dopoIlMontaggio(video) }) : t("Il piano o lo stile sono cambiati dopo l'ultimo montaggio{quando}: questo video non li segue ancora. Chiedi nella chat di rimontarlo.", "The plan or the style changed after the last edit{quando}: this video does not follow them yet. Ask in the chat to re-edit it.", { quando: dopoIlMontaggio(video) })}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )

  const pannello = (
    <div className={styles.pannelli} data-accanto={!stretta}>
      <div className={styles.scelta}>
      {sceltaValida?.tipo === "tratto" && tratto && (
        <PannelloTratto
          azione={azione}
          indice={indiceScelto}
          info={dellaSorgente(sorgenti, tratto)}
          stile={stile}
          trasporto={trasporto}
          zoomProvvisorio={zoomProv?.tratto === indiceScelto ? zoomProv.zoom : null}
          onZoomProvvisorio={(zoom) => setZoomProv(zoom ? { tratto: indiceScelto, zoom } : null)}
          onDeseleziona={() => setSelezione(null)}
        />
      )}
      {sceltaValida?.tipo === "scena" && <PannelloScena azione={azione} indice={sceltaValida.scena} stile={stile} animazioni={sigle} />}
      {sceltaValida?.tipo === "parole" && <PannelloParole azione={azione} da={sceltaValida.da} a={sceltaValida.a} correggi={correggi} onDeseleziona={() => setSelezione(null)} />}
      {sceltaValida === null && <PannelloVideo azione={azione} stile={stile} onVaiA={vaiAlTratto} />}
      {sceltaValida !== null && (
        <Bottone variante="vuoto" onClick={() => setSelezione(null)}>
          {t("Torna al video intero", "Back to the whole video")}
        </Bottone>
      )}
      </div>
      <section className={styles.parlato}>
        <h3>{t("Il parlato", "Speech")}</h3>
        <ElencoParole
          risolto={risolto}
          trasporto={trasporto}
          selezione={sceltaValida}
          onSeleziona={setSelezione}
          onModifica={(i) => {
            setSelezione({ tipo: "parole", da: i, a: i })
            setCorreggi((n) => n + 1)
          }}
        />
      </section>
    </div>
  )

  const timeline = (
    <Timeline
      risolto={risolto}
      piano={video.piano_risolto_da_base}
      proprio={video.piano}
      sorgenti={sorgenti}
      trasporto={trasporto}
      selezione={sceltaValida}
      onSeleziona={setSelezione}
      bloccata={bloccato}
      paroleSorgente={preparate.parole}
      onde={preparate.onda}
      fotogrammi={video.fotogrammi}
      minimoTratto={stile.taglio.a_tempo.tratto_minimo}
      onBordo={(i, lato, secondo) => esegui(bordo(ctx, i, lato, secondo, { durataSorgente: dellaSorgente(sorgenti, risolto.tratti[i])?.durata ?? undefined, minimo: stile.taglio.a_tempo.tratto_minimo }))}
      onSposta={(scena, pezzo, posizione) => esegui(muoviPezzo(ctx, scena, pezzo, posizione))}
      onPortaInScena={(scena, pezzo, destinazione, posizione) => {
        const esito = portaPezzoInScena(ctx, scena, pezzo, destinazione, { posizione, soloAnimazione: (quadro) => soloAnimazione(stile, quadro) })
        esegui(esito)
        if (esito.ok) setSelezione(null)
      }}
      onModificaParola={(i) => {
        setSelezione({ tipo: "parole", da: i, a: i })
        setCorreggi((n) => n + 1)
      }}
    />
  )

  return (
    <div className={styles.montaggio}>
      <div className={styles.barra}>
        <Bottone variante="vuoto" onClick={() => viaServer(() => api.annulla(slug))} disabled={!video.puo_annullare || inViaggio} titolo={t("Annulla (Ctrl+Z)", "Undo (Ctrl+Z)")}>
          <Icona nome="annulla" />
          {t("Annulla", "Undo")}
        </Bottone>
        <Bottone variante="vuoto" onClick={() => viaServer(() => api.rifai(slug))} disabled={!video.puo_rifare || inViaggio} titolo={t("Rifai (Ctrl+Maiusc+Z)", "Redo (Ctrl+Shift+Z)")}>
          <Icona nome="rifai" />
          {t("Rifai", "Redo")}
        </Bottone>
        {occupato && <span className={styles.suggerimento}>{t("Sto montando…", "Editing…")}</span>}
      </div>
      <Versioni video={video} />
      {!video.risolto_aggiornato && (
        <p className={styles.avviso} role="status">
          {ricalcolando
            ? t("Il montaggio si sta ricalcolando dopo l'ultimo ritocco: i pezzi che vedi sono quelli di prima. Finché non è pronto non si possono fare altri ritocchi.", "The edit is being recalculated after the last tweak: the clips you see are the previous ones. Until it is ready no more tweaks can be made.")
            : t("Il montaggio non segue ancora il piano o lo stile di adesso: i pezzi che vedi sono quelli di prima. Per ricalcolarlo chiedilo nella chat. Finché non è pronto non si possono fare altri ritocchi.", "The edit does not follow the current plan or style yet: the clips you see are the previous ones. To recalculate it, ask in the chat. Until it is ready no more tweaks can be made.")}
        </p>
      )}
      {errore && (
        <p className={styles.errore} role="alert">
          {errore}
        </p>
      )}
      {preparate.fallite.length > 0 && (
        <Errore messaggio={t("Le parole di questo video non si sono caricate: i bordi non si agganciano alle parole.", "The words of this video did not load: the edges do not snap to the words.")} onRiprova={preparate.riprova} />
      )}
      <Colonne chiave="montaggio" fissa="prima" iniziale={420} minimaFissa={250} minimaLibera={320} unaSolaSotto={820} sotto="impila" onStretta={setStretta} etichetta={t("Larghezza dell'anteprima", "Preview width")} prima={<div className={styles.colonna}>{anteprima}{stretta && timeline}</div>} seconda={pannello} />
      {!stretta && timeline}
    </div>
  )
}
