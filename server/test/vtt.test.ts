import { describe, expect, test } from "bun:test"
import { righeDaVtt } from "../src/vtt"

// Come li scrive YouTube per i sottotitoli automatici: ogni riga torna nel blocco dopo, e le parole hanno i loro istanti dentro.
const AUTOMATICI = `WEBVTT
Kind: captions
Language: en

00:00:01.040 --> 00:00:03.270 align:start position:0%

so<00:00:01.360><c> not</c><00:00:01.520><c> only</c><00:00:01.680><c> do</c><00:00:01.840><c> you</c>

00:00:03.270 --> 00:00:03.280 align:start position:0%
so not only do you


00:00:03.280 --> 00:00:65.000 align:start position:0%
so not only do you
have<00:00:03.600><c> the</c><00:00:03.760><c> open</c><00:00:04.000><c> weights</c>

01:02:05.500 --> 01:02:07.000
Thank you &amp; good night
`

describe("i sottotitoli VTT", () => {
  test("una riga per frase nuova, col minuto in cui comincia, senza istanti interni né righe ripetute", () => {
    expect(righeDaVtt(AUTOMATICI)).toEqual(["00:01 so not only do you", "00:03 have the open weights", "62:05 Thank you & good night"])
  })

  test("sottotitoli scritti a mano: ogni blocco è una riga, anche su più righe", () => {
    const manuali = "WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\nPrima riga\ne seguito\n\n2\n00:00:02.500 --> 00:00:04.000\n<i>Seconda</i>\n"
    expect(righeDaVtt(manuali)).toEqual(["00:00 Prima riga e seguito", "00:02 Seconda"])
  })

  test("la stessa frase detta più avanti resta: si toglie solo la riga ripetuta dal blocco subito prima", () => {
    const due = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nThank you\n\n00:00:05.000 --> 00:00:06.000\nnext\n\n00:00:09.000 --> 00:00:10.000\nThank you\n"
    expect(righeDaVtt(due)).toEqual(["00:01 Thank you", "00:05 next", "00:09 Thank you"])
  })

  test("un file senza blocchi dà nessuna riga", () => {
    expect(righeDaVtt("WEBVTT\n\n")).toEqual([])
  })
})
