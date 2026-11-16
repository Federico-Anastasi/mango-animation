// Ciò che vale per lo studio e non per un video, uguale in ogni app Mango: lingua, tema, grandezza, dettatura. Sotto, ciò che è solo di questo prodotto.
import { useEffect, useState } from "react"
import { Bottone } from "../comuni/Bottone"
import { CardDiRighe, Riga } from "../comuni/CardDiRighe"
import { Interruttore } from "../comuni/Interruttore"
import { PiuMeno } from "../comuni/PiuMeno"
import { Segmenti } from "../comuni/Segmenti"
import { t, scegliLingua, useLingua, type SceltaLingua } from "../lingua"
import { motori } from "../motori/copia"
import { useMotori } from "../motori/useMotori"
import { scegliTema, useTema, type Tema } from "../tema"
import { CartellaDeiDati } from "./CartellaDeiDati"
import { GRANDEZZA_MASSIMA, GRANDEZZA_MINIMA, GRANDEZZA_PASSO, percentualeDi, ponteGrandezza } from "./ponteGrandezza"
import { fraseDi } from "./rifiuto"
import { testoDi } from "./righe"
import { Testata } from "./Testata"
import styles from "./Impostazioni.module.css"

const lingue = (): Array<{ id: SceltaLingua; nome: string }> => [
  { id: "sistema", nome: t("Del sistema", "System") },
  { id: "it", nome: "Italiano" },
  { id: "en", nome: "English" },
]

const temi = (): Array<{ id: Tema; nome: string }> => [
  { id: "sistema", nome: t("Del sistema", "System") },
  { id: "chiaro", nome: t("Chiaro", "Light") },
  { id: "scuro", nome: t("Scuro", "Dark") },
]

function RigaGrandezza({ onErrore }: { onErrore: (frase: string | null) => void }) {
  const [percentuale, setPercentuale] = useState<number | null>(null)

  useEffect(() => {
    ponteGrandezza()
      ?.leggi()
      .then(
        (zoom) => setPercentuale(percentualeDi(zoom)),
        (e: unknown) => onErrore(fraseDi(e, t("Non riesco a leggere la grandezza.", "I cannot read the size."))),
      )
  }, [onErrore])

  const imposta = (nuova: number) => {
    onErrore(null)
    ponteGrandezza()
      ?.imposta(nuova / 100)
      .then(
        () => setPercentuale(nuova),
        (e: unknown) => onErrore(fraseDi(e, t("Non riesco a cambiare la grandezza.", "I cannot change the size."))),
      )
  }

  const riga = testoDi("generale.grandezza")
  if (percentuale === null) return null
  return (
    <Riga nome={riga.nome} spiegazione={riga.spiegazione}>
      <PiuMeno etichetta={riga.nome} valore={percentuale} minimo={GRANDEZZA_MINIMA} massimo={GRANDEZZA_MASSIMA} passo={GRANDEZZA_PASSO} mostra={(v) => `${v}%`} onCambia={imposta} />
    </Riga>
  )
}

function RigaDettatura({ motoriDelProfilo }: { motoriDelProfilo: ReturnType<typeof useMotori> }) {
  const { dato, errore, occupato, cambia } = motoriDelProfilo
  const riga = testoDi("generale.dettatura")
  const scelta = dato?.dettatura ?? {}
  return (
    <Riga nome={riga.nome} spiegazione={riga.spiegazione}>
      {dato ? (
        <Interruttore etichetta={riga.nome} acceso={scelta.attiva !== false} disabled={occupato} onCambia={(attiva) => cambia("dettatura", { ...scelta, attiva })} />
      ) : errore ? (
        <Bottone variante="minore" onClick={() => void motori.rileggi()}>
          {t("Riprova", "Try again")}
        </Bottone>
      ) : null}
    </Riga>
  )
}

export function Generale() {
  const { scelta: sceltaLingua } = useLingua()
  const tema = useTema()
  const [erroreGrandezza, setErroreGrandezza] = useState<string | null>(null)
  const motoriDelProfilo = useMotori()
  const frasi = [erroreGrandezza, motoriDelProfilo.rifiuto ?? motoriDelProfilo.errore].filter((f): f is string => f !== null)
  const lingua = testoDi("generale.lingua")
  const aspetto = testoDi("generale.tema")
  return (
    <div className={styles.sezione}>
      <Testata titolo={t("Generale", "General")} />
      <CardDiRighe nome={t("Come lo usi", "How you use it")}>
        <Riga nome={lingua.nome} spiegazione={lingua.spiegazione}>
          <Segmenti etichetta={lingua.nome} valori={lingue()} scelta={sceltaLingua} onScegli={scegliLingua} />
        </Riga>
        <Riga nome={aspetto.nome} spiegazione={aspetto.spiegazione}>
          <Segmenti etichetta={aspetto.nome} valori={temi()} scelta={tema} onScegli={scegliTema} />
        </Riga>
        {ponteGrandezza() && <RigaGrandezza onErrore={setErroreGrandezza} />}
        <RigaDettatura motoriDelProfilo={motoriDelProfilo} />
      </CardDiRighe>
      {frasi.map((frase) => (
        <p key={frase} className={styles.errore} role="alert">
          {frase}
        </p>
      ))}
      <CartellaDeiDati />
    </div>
  )
}
