import { readFileSync } from "node:fs"
import { afterEach, describe, expect, it } from "vitest"
import { leggiNumero } from "../src/comuni/CampoNumero"
import { leggiIndirizzo, scriviIndirizzo } from "../src/indirizzo"
import { inseguimento } from "../src/montaggio/inseguimento"
import { problemiDelTratto, type DatiPiano } from "../src/montaggio/motore"
import { infoSorgenti, sagomaDi } from "../src/montaggio/sorgenti"
import { creaTrasporto } from "../src/montaggio/trasporto"
import { uguali } from "../src/montaggio/uguali"
import { scegliLingua } from "../src/lingua"
import { controllaStile } from "../src/stile/validazione"
import * as t from "../src/testo"
import type { GiornoGrezzo } from "../src/tipi"
import { pianoDiProva, pianoSenzaVoce, risoltoDiProva, risoltoSenzaVoce, stileDiProva } from "./fixture"

describe("i nomi dello stile di serie", () => {
  afterEach(() => scegliLingua("it"))
  const quadriDiSerie = Object.keys((JSON.parse(readFileSync("../stile.json", "utf8")) as { quadri: Record<string, unknown> }).quadri)

  it("nello studio inglese tutti i quadri dello stile di serie hanno un nome inglese, non quello dello stile", () => {
    scegliLingua("en")
    const nomi = quadriDiSerie.map(t.nomeQuadro)
    expect(quadriDiSerie.filter((q) => t.nomeQuadro(q).toLowerCase() === q.replace(/-/g, " "))).toEqual([])
    expect(new Set(nomi).size).toBe(quadriDiSerie.length)
    expect(t.nomeQuadro("sagoma-su-animazione")).toBe("Silhouette over animation")
  })

  it("i colori e i formati dello stile di serie hanno un nome inglese, e uno che non c'è resta com'è", () => {
    const stile = JSON.parse(readFileSync("../stile.json", "utf8")) as { colori: Record<string, string>; formati: Record<string, unknown> }
    scegliLingua("en")
    for (const nome of Object.keys(stile.colori)) expect(t.nomeColore(nome), nome).not.toBe(nome)
    for (const nome of Object.keys(stile.formati)) expect(t.nomeFormato(nome), nome).not.toBe(nome)
    expect([t.nomeColore("carta_scura"), t.nomeFormato("verticale")]).toEqual(["Dark background", "vertical"])
    expect([t.nomeColore("verde_acqua"), t.nomeFormato("quadrato")]).toEqual(["Verde acqua", "quadrato"])
    scegliLingua("it")
    expect(Object.keys(stile.colori).map(t.nomeColore)).toEqual(["Sfondo", "Sfondo scuro", "Grigio", "Linee", "Testo", "Rosso", "Blu", "Nero", "Bianco", "Giallo", "Verde"])
    expect([t.nomeColore("turchese"), t.nomeFormato("verticale")]).toEqual(["Turchese", "verticale"])
  })

  it("in italiano il nome viene dal nome dello stile, e un quadro del creator resta com'è in tutte e due le lingue", () => {
    expect(t.nomeQuadro("sagoma-su-animazione")).toBe("Sagoma su animazione")
    scegliLingua("en")
    expect(t.nomeQuadro("mio-quadro-nuovo")).toBe("Mio quadro nuovo")
  })
})

describe("numeri e date all'italiana", () => {
  it("numeri con la virgola e al più due decimali", () => {
    expect(t.numero(12345.5)).toBe("12.345,5")
    expect(t.numero(1810)).toBe("1.810")
    expect(t.numero(1.5, 2)).toBe("1,50")
    expect(t.numero(3)).toBe("3")
  })

  it("i grandi conteggi a parole", () => {
    expect(t.quantitaGrossa(820)).toBe("820")
    expect(t.quantitaGrossa(5240)).toBe("5.240")
    expect(t.quantitaGrossa(234_400)).toBe("234 mila")
    expect(t.quantitaGrossa(1_234_000)).toBe("1,2 milioni")
    expect(t.quantitaGrossa(130_253_512)).toBe("130 milioni")
    expect(t.quantitaGrossa(1_300_000_000)).toBe("1,3 miliardi")
    // Sul confine l'arrotondamento passa all'unità dopo, invece di «1.000 mila».
    expect(t.quantitaGrossa(999_600)).toBe("1,0 milioni")
    expect(t.quantitaGrossa(9_960_000)).toBe("10 milioni")
    expect(t.quantitaGrossa(999_999_999)).toBe("1,0 miliardi")
  })

  it("i conteggi in poche cifre, come li scrive il terminale", () => {
    expect([820, 999, 1000, 1234, 12_449, 99_949].map(t.quantitaCompatta)).toEqual(["820", "999", "1k", "1,2k", "12,4k", "99,9k"])
    expect([99_950, 234_400, 999_499].map(t.quantitaCompatta)).toEqual(["100k", "234k", "999k"])
    // Sul confine passa all'unità dopo, invece di «1.000k».
    expect([999_500, 1_234_000, 99_949_999, 130_253_512].map(t.quantitaCompatta)).toEqual(["1M", "1,2M", "99,9M", "130M"])
    scegliLingua("en")
    expect(t.quantitaCompatta(12_449)).toBe("12.4k")
  })

  it("durate e tempi come li legge chi monta", () => {
    expect(t.durata(1.5)).toBe("1,5 s")
    expect(t.durata(45)).toBe("45 s")
    expect(t.durata(125)).toBe("2 min 5 s")
    expect(t.durata(3720)).toBe("1 h 2 min")
    expect(t.durataAlSecondo(3.4)).toBe("3 s")
    expect(t.durataAlSecondo(9.9)).toBe("9 s")
    expect(t.durataAlSecondo(45.8)).toBe("45 s")
    expect(t.durataAlSecondo(125)).toBe("2 min 5 s")
    expect(t.tempoLeggibile(12.43)).toBe("0:12,4")
    expect(t.tempoLeggibile(75, false)).toBe("1:15")
    expect(t.tempoLeggibile(3725.5)).toBe("1:02:05,5")
    expect(t.centesimi(3.5)).toBe("3,50")
  })

  it("una durata stimata si dice al minuto, e l'ora a cui finisce senza secondi", () => {
    expect(t.durataCirca(20)).toBe("meno di un minuto")
    expect(t.durataCirca(250)).toBe("circa 4 min")
    expect(t.durataCirca(3720)).toBe("circa 1 h 2 min")
    expect(t.oraMinuti("2026-10-07T13:15:42")).toBe("13:15")
    expect(t.oraMinuti("dopo")).toBe("ora non valida")
  })

  it("date con il mese in lettere, mai in ISO; una data illeggibile lo dice", () => {
    expect(t.dataOra("2026-10-07T13:15")).toMatch(/^7 ott 2026,? 13:15$/)
    expect(t.data("2026-10-07")).toBe("7 ott 2026")
    expect(t.giorno("2026-10-06")).toBe("6 ott 2026")
    expect(t.dataOra("ieri")).toBe("data non valida")
    expect(t.istante("1760000000")).toBe(1760000000000)
  })

  it("pesi e plurali", () => {
    expect(t.peso(512)).toBe("512 B")
    expect(t.peso(2048)).toBe("2 KB")
    expect(t.peso(5.1 * 1024 * 1024)).toBe("5,1 MB")
    expect(t.pluralizza(1, "file", "file")).toBe("1 file")
    expect(t.pluralizza(3, "pezzo", "pezzi")).toBe("3 pezzi")
    expect(t.nomeQuadro("sagoma-su-animazione")).toBe("Sagoma su animazione")
  })

  it("un numero scritto in un campo si legge con la virgola o col punto", () => {
    expect(leggiNumero("1,5")).toBe(1.5)
    expect(leggiNumero(" 12.25 ")).toBe(12.25)
    expect(leggiNumero("")).toBeNull()
    expect(leggiNumero("abc")).toBeNull()
  })
})

describe("l'indirizzo della pagina", () => {
  it("si legge e si scrive: vista, video, scheda e parametri", () => {
    expect(leggiIndirizzo("#/video")).toMatchObject({ vista: "video", slug: null })
    expect(leggiIndirizzo("#/video/qwen/controllo?t=12.3")).toMatchObject({ vista: "video", slug: "qwen", scheda: "controllo" })
    expect(leggiIndirizzo("#/video/qwen/controllo?t=12.3").parametri.get("t")).toBe("12.3")
    expect(leggiIndirizzo("#/video/qwen/boh").scheda).toBeNull()
    expect(leggiIndirizzo("#/video/qwen").scheda).toBeNull()
    expect(leggiIndirizzo("#/video/qwen/prova").scheda).toBe("prova")
    expect(leggiIndirizzo("#/girato?file=a%2Fb.mp4").parametri.get("file")).toBe("a/b.mp4")
    expect(leggiIndirizzo("#/produzione")).toMatchObject({ vista: "produzione", slug: null, parte: null })
    expect(leggiIndirizzo("").vista).toBe("video")
    expect(scriviIndirizzo({ vista: "video", slug: "a b", scheda: "file" })).toBe("#/video/a%20b/file")
    expect(scriviIndirizzo({ vista: "video", slug: "a" })).toBe("#/video/a")
    expect(scriviIndirizzo({ vista: "girato", parametri: { file: "x/y.mp4" } })).toBe("#/girato?file=x%2Fy.mp4")
  })
})

describe("gli indirizzi del canale e delle impostazioni", () => {
  it("i vecchi indirizzi portano alla scheda o alla sezione che li ha presi con sé, con i loro parametri", () => {
    expect(leggiIndirizzo("#/pubblico")).toMatchObject({ vista: "canale", parte: "pubblico" })
    expect(leggiIndirizzo("#/pubblico?video=orto").parametri.get("video")).toBe("orto")
    expect(leggiIndirizzo("#/classifica")).toMatchObject({ vista: "canale", parte: "classifica" })
    expect(leggiIndirizzo("#/crescita")).toMatchObject({ vista: "canale", parte: "crescita" })
    expect(leggiIndirizzo("#/stile")).toMatchObject({ vista: "impostazioni", parte: "stile" })
    expect(leggiIndirizzo("#/motori")).toMatchObject({ vista: "impostazioni", parte: "computer" })
  })

  it("quelli nuovi dicono la scheda o la sezione, e senza dirla aprono la prima", () => {
    expect(leggiIndirizzo("#/canale/crescita")).toMatchObject({ vista: "canale", parte: "crescita" })
    expect(leggiIndirizzo("#/canale")).toMatchObject({ vista: "canale", parte: "pubblico" })
    expect(leggiIndirizzo("#/canale/boh")).toMatchObject({ vista: "canale", parte: "pubblico" })
    expect(leggiIndirizzo("#/impostazioni/telefono")).toMatchObject({ vista: "impostazioni", parte: "telefono" })
    expect(leggiIndirizzo("#/impostazioni")).toMatchObject({ vista: "impostazioni", parte: "profilo" })
    expect(leggiIndirizzo("#/impostazioni/boh")).toMatchObject({ vista: "impostazioni", parte: "profilo" })
  })

  it("si scrivono come si leggono", () => {
    expect(scriviIndirizzo({ vista: "canale", parte: "classifica" })).toBe("#/canale/classifica")
    expect(scriviIndirizzo({ vista: "canale", parte: "pubblico", parametri: { video: "orto" } })).toBe("#/canale/pubblico?video=orto")
    expect(scriviIndirizzo({ vista: "impostazioni", parte: "generali" })).toBe("#/impostazioni/generali")
    expect(scriviIndirizzo({ vista: "impostazioni" })).toBe("#/impostazioni")
  })
})

describe("uguali", () => {
  it("guarda il contenuto, non l'ordine delle chiavi", () => {
    expect(uguali({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true)
    expect(uguali({ a: 1 }, { a: 2 })).toBe(false)
    expect(uguali([1, 2], [2, 1])).toBe(false)
    expect(uguali({ a: 1 }, { a: 1, b: undefined })).toBe(false)
    expect(uguali(null, {})).toBe(false)
  })
})

describe("il trasporto", () => {
  it("la testina sta dentro il video e un passo è un fotogramma", () => {
    const tr = creaTrasporto(10, 30)
    tr.vai(99)
    expect(tr.t()).toBe(10)
    tr.vai(1)
    tr.passo(1)
    expect(tr.t()).toBeCloseTo(1 + 1 / 30)
    tr.passo(-100)
    expect(tr.t()).toBe(0)
  })

  it("un passo è un fotogramma del video, qualunque sia la sua frequenza, e la frequenza segue lo stile", () => {
    const tr = creaTrasporto(10, 25)
    tr.passo(1)
    expect(tr.t()).toBeCloseTo(1 / 25)
    tr.imposta(10, 60)
    expect(tr.fps()).toBe(60)
    tr.vai(1)
    tr.passo(1)
    expect(tr.t()).toBeCloseTo(1 + 1 / 60)
  })

  it("suonare dalla fine riparte dall'inizio, e a fine corsa si ferma da solo", () => {
    const tr = creaTrasporto(5, 30)
    tr.vai(5)
    tr.suona()
    expect(tr.inRiproduzione()).toBe(true)
    expect(tr.t()).toBe(0)
    tr.avanza(5)
    expect(tr.inRiproduzione()).toBe(false)
  })

  it("chi ascolta viene avvisato a ogni cambio e può smettere", () => {
    const tr = creaTrasporto(5, 30)
    let volte = 0
    const smetti = tr.iscriviti(() => volte++)
    tr.vai(1)
    tr.suona()
    smetti()
    tr.ferma()
    expect(volte).toBe(2)
  })

  it("senza durata non suona", () => {
    const tr = creaTrasporto(0, 30)
    tr.suona()
    expect(tr.inRiproduzione()).toBe(false)
  })

  it("un video che rincorre salta se è lontano, accelera se è vicino, aspetta se sta saltando", () => {
    expect(inseguimento({ attuale: 0, voluto: 5, cercando: false, ritardoSalto: 0.3 })).toEqual({ salto: 5.3, velocita: 1 })
    expect(inseguimento({ attuale: 1, voluto: 1.2, cercando: false, ritardoSalto: 0.3 }).velocita).toBeCloseTo(1.2)
    expect(inseguimento({ attuale: 1, voluto: 1.005, cercando: false, ritardoSalto: 0.3 })).toEqual({ salto: null, velocita: 1 })
    expect(inseguimento({ attuale: 0, voluto: 5, cercando: true, ritardoSalto: 0.3 }).salto).toBeNull()
  })
})

describe("lo stile", () => {
  it("quello di partenza è valido", () => {
    expect(controllaStile(stileDiProva())).toEqual([])
  })

  it("ogni valore sbagliato dice perché", () => {
    const s = stileDiProva()
    s.voce.lufs = 3
    s.sottotitoli.corpo_minimo = 99
    s.sottotitoli.fondo = "viola"
    s.titolo.largo = 4000
    s.uscita.crf = 80
    s.colori.rosso = "rosso"
    s.quadri["girato-pieno"]!.strati = [{ tipo: "girato", area: [0, 0, 2000, 100] }]
    const errori = controllaStile(s).join("\n")
    expect(errori).toMatch(/volume della voce.*decibel/)
    expect(errori).toMatch(/corpo minimo.*non può superare/)
    expect(errori).toMatch(/«viola» non è fra i colori/)
    expect(errori).toMatch(/non può essere più largo del fotogramma/)
    expect(errori).toMatch(/va da 0 a 51/)
    expect(errori).toMatch(/#RRGGBB/)
    expect(errori).toMatch(/Girato pieno.*esce dal fotogramma/)
  })
})

describe("l'anteprima sa cosa manca", () => {
  const giorni: GiornoGrezzo[] = [
    {
      giorno: "2026-10-06",
      file: [{ file: "2026-10-06/a.mp4", nome: "a.mp4", byte: 1, scheda: { tipo: "ripresa", origine: "telefono", largo: 540, alto: 960, durata: 8 }, scheda_problemi: [], preparato: { parole: "preparati/x/parole.json", sagoma: null, leggero: "preparati/x/leggero.mp4", miniatura: "preparati/x/miniatura.jpg", onda: "preparati/x/onda.bin", trascrizione: null }, usato_in: [] }],
    },
  ]

  it("le copie preparate diventano indirizzi, e un file che non c'è si segna", () => {
    const info = infoSorgenti(pianoDiProva().sorgenti, giorni)
    expect(info.a).toMatchObject({ larghezza: 540, altezza: 960, durata: 8, parole: true, trovato: true, sagoma: null })
    expect(info.a!.leggero).toBe("/media/preparati/x/leggero.mp4")
    expect(info.a!.onda).toBe("preparati/x/onda.bin")
    expect(info.b).toMatchObject({ trovato: false, leggero: null, larghezza: null })
  })

  function dati(): DatiPiano {
    return { risolto: risoltoDiProva(), piano: pianoDiProva(), stile: stileDiProva(), sorgenti: infoSorgenti(pianoDiProva().sorgenti, giorni), teste: {}, urlAnimazione: () => "", versioneScene: "" }
  }

  it("un file preparato con il suo quadro, ma senza sagoma, dice solo che la sagoma va preparata", () => {
    expect(problemiDelTratto(dati(), 0)).toEqual([{ testo: "La sagoma di questo pezzo va ancora preparata.", daPreparare: true }])
  })

  it("con la sagoma preparata ma senza le misure della testa lo dice; con le misure, tace; la sagoma di un'altra ripresa si guarda lì", () => {
    const d = dati()
    d.sorgenti.a!.sagoma = "/media/preparati/x/sagoma.webm"
    expect(problemiDelTratto(d, 0)).toEqual([{ testo: "La sagoma è posata in modo approssimato: la sua posizione esatta arriva col primo montaggio.", daPreparare: false }])
    d.teste = { a: { cima: 300, centro: 540 } }
    expect(problemiDelTratto(d, 0)).toEqual([])
    d.risolto.tratti[0]!.sagoma = { sorgente: "b", da: 3 }
    expect(problemiDelTratto(d, 0).map((p) => p.testo)).toEqual(["La sagoma di questo pezzo va ancora preparata."])
  })

  it("con i pezzi di sagoma conta solo quello che porta i secondi del tratto; senza elenco vale la sagoma di prima", () => {
    const d = dati()
    d.teste = { a: { cima: 300, centro: 540 } }
    const tratto = d.risolto.tratti[0]!
    d.sorgenti.a!.sagomaPezzi = [{ da: tratto.da + 20, a: tratto.da + 30, url: "/media/preparati/x/sagoma/1-2.webm", inizio: tratto.da + 20 }]
    expect(problemiDelTratto(d, 0).map((p) => p.testo)).toEqual(["La sagoma di questo pezzo va ancora preparata."])
    d.sorgenti.a!.sagomaPezzi = [{ da: Math.max(tratto.da - 1, 0), a: tratto.da + tratto.durata + 1, url: "/media/preparati/x/sagoma/3-4.webm", inizio: Math.max(tratto.da - 1, 0) }]
    expect(problemiDelTratto(d, 0)).toEqual([])
    d.sorgenti.a!.sagomaPezzi = null
    d.sorgenti.a!.sagoma = "/media/preparati/x/sagoma.webm"
    expect(problemiDelTratto(d, 0)).toEqual([])
  })

  it("sagomaDi dà il file e il secondo della ripresa a cui comincia, e dice di no dove nessun pezzo arriva", () => {
    const info = { ...infoSorgenti(pianoDiProva().sorgenti, giorni).a!, sagomaPezzi: [{ da: 2, a: 6, url: "u1", inizio: 1.5 }, { da: 8, a: 10, url: "u2", inizio: 8 }] }
    expect(sagomaDi(info, 2, 6)).toEqual({ url: "u1", inizio: 1.5 })
    expect(sagomaDi(info, 8.5, 9)).toEqual({ url: "u2", inizio: 8 })
    expect(sagomaDi(info, 5, 9)).toBeNull()
    expect(sagomaDi({ ...info, sagomaPezzi: null, sagoma: "vecchia" }, 0, 99)).toEqual({ url: "vecchia", inizio: 0 })
    expect(sagomaDi({ ...info, sagomaPezzi: null }, 0, 1)).toBeNull()
    expect(sagomaDi(undefined, 0, 1)).toBeNull()
  })

  it("un file non nel girato, uno da preparare, una vista mancante lo dicono", () => {
    const d = dati()
    expect(problemiDelTratto(d, 2).map((p) => p.testo)).toEqual(expect.arrayContaining(["Il file di questo pezzo non è nel girato."]))
    d.sorgenti.a!.leggero = null
    d.risolto.scene[0]!.quadro = "girato-pieno"
    expect(problemiDelTratto(d, 0)[0]).toEqual({ testo: "Il file di questo pezzo va ancora preparato.", daPreparare: true })
    d.risolto.tratti[0]!.vista = "assente"
    expect(problemiDelTratto(d, 0).map((p) => p.testo).join()).toMatch(/vista «assente»/)
  })

  it("un pezzo senza voce non ha file da preparare, ma il pezzo con la voce accanto sì", () => {
    const d: DatiPiano = { ...dati(), risolto: risoltoSenzaVoce(), piano: pianoSenzaVoce(), sorgenti: infoSorgenti(pianoSenzaVoce().sorgenti, giorni) }
    expect(problemiDelTratto(d, 0)).toEqual([])
    expect(problemiDelTratto(d, 2)).toEqual([])
    expect(problemiDelTratto(d, 1)).toEqual([{ testo: "La sagoma di questo pezzo va ancora preparata.", daPreparare: true }])
  })

  it("il quadro di una scena che non è nello stile si segnala", () => {
    const d = dati()
    d.risolto.scene[0]!.quadro = "inventato"
    expect(problemiDelTratto(d, 0)[0]!.testo).toMatch(/«inventato» non è nello stile/)
  })
})
