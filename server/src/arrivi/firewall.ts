// Windows chiede il permesso la prima volta che un programma si mette in ascolto sulla rete: chi
// risponde «Annulla» lascia le connessioni in arrivo bloccate, e il telefono non arriva. Da fuori
// non si può provarlo (un collegamento del computer a sé stesso non passa dal firewall), quindi si
// leggono le regole che Windows ha scritto per questo programma.
import { jsonDaTesto } from "../disco"

export type StatoFirewall = "consentito" | "bloccato" | "in-attesa" | "sconosciuto"

export interface LetturaFirewall {
  regole: { azione: string; profili: string }[]
  reti: string[]
  /** Il tipo di rete che Windows dà all'interfaccia di Tailscale; vuoto se non c'è. */
  tailscale?: string[]
}

export interface GiudizioFirewall {
  stato: StatoFirewall
  /** Tutte le reti attive sono pubbliche: Windows non chiede nemmeno il permesso. */
  soloPubbliche: boolean
  /** Lo stesso giudizio guardando solo la rete di Tailscale; `null` se Windows non ne vede una. */
  tailscale: StatoFirewall | null
}

export type LeggiFirewall = (programma: string) => Promise<LetturaFirewall | null>

const PROFILO_DELLA_RETE: Record<string, string> = { Public: "Public", Private: "Private", DomainAuthenticated: "Domain" }

function statoPer(regole: LetturaFirewall["regole"], profiliAttivi: string[]): StatoFirewall {
  const copre = (profili: string): boolean => {
    const elenco = profili.split(",").map((p) => p.trim())
    if (elenco.includes("Any")) return true
    return profiliAttivi.length === 0 ? elenco.length > 0 : profiliAttivi.some((p) => elenco.includes(p))
  }
  const rilevanti = regole.filter((r) => copre(r.profili))
  if (rilevanti.some((r) => r.azione === "Block")) return "bloccato"
  return rilevanti.some((r) => r.azione === "Allow") ? "consentito" : "in-attesa"
}

const profiliDi = (reti: string[]): string[] => reti.map((r) => PROFILO_DELLA_RETE[r] ?? r)

export function giudicaFirewall(lettura: LetturaFirewall): GiudizioFirewall {
  const profiliAttivi = profiliDi(lettura.reti)
  const profiliTailscale = profiliDi(lettura.tailscale ?? [])
  return {
    stato: statoPer(lettura.regole, profiliAttivi),
    soloPubbliche: profiliAttivi.length > 0 && profiliAttivi.every((p) => p === "Public"),
    tailscale: profiliTailscale.length > 0 ? statoPer(lettura.regole, profiliTailscale) : null,
  }
}

const comando = (programma: string): string => `
$ErrorActionPreference = 'Stop'
$programma = '${programma.replace(/'/g, "''")}'
$regole = @(Get-NetFirewallApplicationFilter -Program $programma -ErrorAction SilentlyContinue | Get-NetFirewallRule | Where-Object { $_.Direction -eq 'Inbound' -and $_.Enabled -eq 'True' } | ForEach-Object { [pscustomobject]@{ azione = [string]$_.Action; profili = [string]$_.Profile } })
$profili = @(Get-NetConnectionProfile)
$reti = @($profili | ForEach-Object { [string]$_.NetworkCategory })
$tailscale = @($profili | Where-Object { $_.InterfaceAlias -like '*Tailscale*' } | ForEach-Object { [string]$_.NetworkCategory })
[pscustomobject]@{ regole = $regole; reti = $reti; tailscale = $tailscale } | ConvertTo-Json -Compress -Depth 4
`

const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === null || v === undefined ? [] : [v])

export const leggiConPowerShell: LeggiFirewall = async (programma) => {
  try {
    const processo = Bun.spawn(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", comando(programma)], { stdin: "ignore", stdout: "pipe", stderr: "ignore", windowsHide: true, timeout: 15_000 })
    const [uscita, codice] = await Promise.all([new Response(processo.stdout).text(), processo.exited])
    if (codice !== 0) return null
    const dato = jsonDaTesto(uscita)?.valore as { regole?: unknown; reti?: unknown; tailscale?: unknown } | undefined
    if (!dato) return null
    return { regole: lista(dato.regole).map((r) => r as { azione: string; profili: string }), reti: lista(dato.reti).map(String), tailscale: lista(dato.tailscale).map(String) }
  } catch {
    return null
  }
}

/** L'ultimo giudizio sul firewall per `programma`: si rifà all'avvio e quando lo si chiede, mai da una lettura. */
export class ControlloFirewall {
  giudizio: GiudizioFirewall | null = null

  constructor(
    private readonly programma: string,
    private readonly leggi: LeggiFirewall,
  ) {}

  async controlla(): Promise<GiudizioFirewall> {
    const lettura = await this.leggi(this.programma)
    this.giudizio = lettura ? giudicaFirewall(lettura) : { stato: "sconosciuto", soloPubbliche: false, tailscale: null }
    return this.giudizio
  }
}
