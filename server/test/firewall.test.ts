import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { giudicaFirewall, type LetturaFirewall } from "../src/arrivi/firewall"
import { avviaAmbiente, chiama, fermaTutti, aspetta, type Ambiente } from "./aiuti"

afterEach(fermaTutti)

interface StatoArrivi {
  in_ascolto: boolean
  firewall: string
  pronto: boolean
  motivo: string | null
}

const regola = (azione: string, profili: string) => ({ azione, profili })

describe("il giudizio sulle regole di Windows", () => {
  const giudica = (regole: LetturaFirewall["regole"], reti: string[]) => giudicaFirewall({ regole, reti })

  test("una regola che permette su una rete attiva: consentito; che blocca: bloccato, anche se un'altra permette", () => {
    expect(giudica([regola("Allow", "Private")], ["Private"]).stato).toBe("consentito")
    expect(giudica([regola("Allow", "Any")], ["Public"]).stato).toBe("consentito")
    expect(giudica([regola("Allow", "Private"), regola("Block", "Private")], ["Private"]).stato).toBe("bloccato")
  })

  test("una regola per un'altra rete non conta; nessuna regola: in attesa del permesso", () => {
    expect(giudica([regola("Block", "Public")], ["Private"]).stato).toBe("in-attesa")
    expect(giudica([], ["Private"]).stato).toBe("in-attesa")
    expect(giudica([regola("Allow", "Domain, Private")], ["DomainAuthenticated"]).stato).toBe("consentito")
  })

  test("tutte le reti attive pubbliche: lo dice", () => {
    expect(giudica([], ["Public"]).soloPubbliche).toBe(true)
    expect(giudica([], ["Public", "Private"]).soloPubbliche).toBe(false)
    expect(giudica([], []).soloPubbliche).toBe(false)
  })

  test("la rete di Tailscale si giudica da sola: una regola per la privata non la copre se Windows la dà per pubblica", () => {
    const regole = [regola("Allow", "Private")]
    expect(giudicaFirewall({ regole, reti: ["Private", "Public"], tailscale: ["Public"] })).toMatchObject({ stato: "consentito", tailscale: "in-attesa" })
    expect(giudicaFirewall({ regole, reti: ["Private"], tailscale: ["Private"] }).tailscale).toBe("consentito")
    expect(giudicaFirewall({ regole: [regola("Allow", "Private"), regola("Block", "Public")], reti: ["Private"], tailscale: ["Public"] }).tailscale).toBe("bloccato")
    expect(giudicaFirewall({ regole, reti: ["Private"], tailscale: [] }).tailscale).toBeNull()
    expect(giudicaFirewall({ regole, reti: ["Private"] }).tailscale).toBeNull()
  })
})

describe("cosa dice GET /api/arrivi del firewall", () => {
  /** La ricezione dal telefono sta spenta finché non si collega un telefono: la porta si apre, e il firewall si guarda, a quel punto. */
  const collega = async (a: Ambiente): Promise<Ambiente> => {
    await chiama(a, "PUT", "/api/arrivi", { acceso: true })
    return a
  }
  const conLettura = (lettura: LetturaFirewall | null | (() => LetturaFirewall | null), semina?: Parameters<typeof avviaAmbiente>[1]) => {
    const chiamate = { n: 0 }
    const ambiente = avviaAmbiente(
      {
        leggiFirewall: async () => {
          chiamate.n++
          return typeof lettura === "function" ? lettura() : lettura
        },
      },
      semina,
    ).then(collega)
    return { ambiente, chiamate }
  }

  test("consentito: pronto, senza avvertimenti", async () => {
    const { ambiente } = conLettura({ regole: [regola("Allow", "Any")], reti: ["Private"] })
    const a = await ambiente
    expect((await chiama<StatoArrivi>(a, "GET", "/api/arrivi")).corpo).toMatchObject({ in_ascolto: true, firewall: "consentito", pronto: true, motivo: null })
  })

  test("bloccato: non pronto, e dice dove sbloccare", async () => {
    const { ambiente } = conLettura({ regole: [regola("Block", "Private")], reti: ["Private"] })
    const r = (await chiama<StatoArrivi>(await ambiente, "GET", "/api/arrivi")).corpo
    expect(r).toMatchObject({ firewall: "bloccato", pronto: false })
    expect(r.motivo).toContain("Consenti app attraverso il firewall")
  })

  test("rete pubblica senza regole: non pronto, e dice di passare a «Rete privata»", async () => {
    const { ambiente } = conLettura({ regole: [], reti: ["Public"] })
    const r = (await chiama<StatoArrivi>(await ambiente, "GET", "/api/arrivi")).corpo
    expect(r).toMatchObject({ firewall: "in-attesa", pronto: false })
    expect(r.motivo).toContain("Rete privata")
  })

  test("nessuna regola ancora: pronto, con l'avvertimento sulla finestra di Windows — finché un telefono non si è visto", async () => {
    const { ambiente } = conLettura({ regole: [], reti: ["Private"] })
    const r = (await chiama<StatoArrivi>(await ambiente, "GET", "/api/arrivi")).corpo
    expect(r).toMatchObject({ firewall: "in-attesa", pronto: true })
    expect(r.motivo).toContain("finestra del firewall")

    const { ambiente: dopo } = conLettura({ regole: [], reti: ["Private"] }, async (c) => {
      await mkdir(join(c.archivio, "arrivi"), { recursive: true })
      await writeFile(join(c.archivio, "arrivi", "registro.jsonl"), `${JSON.stringify({ at: "2026-10-08T10:00:00Z", esito: "pagina", da: "192.168.1.55" })}\n`)
    })
    expect((await chiama<StatoArrivi>(await dopo, "GET", "/api/arrivi")).corpo).toMatchObject({ pronto: true, motivo: null })
  })

  test("Windows non risponde: «sconosciuto», pronto senza giudizio", async () => {
    const { ambiente } = conLettura(null)
    expect((await chiama<StatoArrivi>(await ambiente, "GET", "/api/arrivi")).corpo).toMatchObject({ firewall: "sconosciuto", pronto: true, motivo: null })
  })

  test("il controllo gira quando la porta si apre e su richiesta, mai dentro la GET", async () => {
    let lettura: LetturaFirewall = { regole: [regola("Block", "Any")], reti: ["Private"] }
    const { ambiente, chiamate } = conLettura(() => lettura)
    const a = await ambiente
    await aspetta(async () => (await chiama<StatoArrivi>(a, "GET", "/api/arrivi")).corpo.firewall === "bloccato")
    expect(chiamate.n).toBe(1)
    for (let i = 0; i < 5; i++) await chiama(a, "GET", "/api/arrivi")
    expect(chiamate.n).toBe(1)

    lettura = { regole: [regola("Allow", "Any")], reti: ["Private"] }
    expect((await chiama<StatoArrivi>(a, "GET", "/api/arrivi")).corpo.firewall).toBe("bloccato")
    const r = await chiama<StatoArrivi>(a, "POST", "/api/arrivi/controlla")
    expect(r.stato).toBe(200)
    expect(r.corpo).toMatchObject({ firewall: "consentito", pronto: true, motivo: null })
    expect(chiamate.n).toBe(2)
    expect((await chiama<StatoArrivi>(a, "GET", "/api/arrivi")).corpo.firewall).toBe("consentito")
  })

  test("prima che il controllo finisca: «non-controllato»; se la porta è occupata non si controlla niente", async () => {
    let sblocca = (): void => {}
    const fermo = new Promise<void>((risolvi) => (sblocca = risolvi))
    const chiamate = { n: 0 }
    const a = await collega(
      await avviaAmbiente({
        leggiFirewall: async () => {
          chiamate.n++
          await fermo
          return { regole: [regola("Allow", "Any")], reti: [] }
        },
      }),
    )
    expect((await chiama<StatoArrivi>(a, "GET", "/api/arrivi")).corpo).toMatchObject({ firewall: "non-controllato", pronto: true })
    sblocca()
    await aspetta(async () => (await chiama<StatoArrivi>(a, "GET", "/api/arrivi")).corpo.firewall === "consentito")

    const occupante = Bun.serve({ port: 0, hostname: "0.0.0.0", fetch: () => new Response("") })
    try {
      const b = await collega(await avviaAmbiente({ arrivi: { porta: occupante.port!, limiteByte: 1024 ** 3, indirizzo: null }, leggiFirewall: async () => (chiamate.n++, null) }))
      const prima = chiamate.n
      expect((await chiama<StatoArrivi>(b, "GET", "/api/arrivi")).corpo).toMatchObject({ in_ascolto: false, pronto: false })
      expect(chiamate.n).toBe(prima)
    } finally {
      occupante.stop(true)
    }
  })
})
