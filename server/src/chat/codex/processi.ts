// Ciò che resta acceso quando Codex chiude un comando: su Windows chiude la shell del comando e non i programmi che la shell ha
// lanciato, che restano vivi senza genitore. Qui si trovano e si fermano, fra i soli discendenti del programma di Codex.

export interface Sistema {
  /** Ogni processo acceso, col suo genitore. */
  processi: () => Promise<Map<number, number>>
  /** Ferma questi processi, ognuno con ciò che ha lanciato. */
  ferma: (pid: number[]) => Promise<void>
}

/**
 * Fra i discendenti che `radice` aveva in `prima`, quelli ancora vivi sotto un processo che nel frattempo è morto: i più in alto,
 * perché fermarne uno ferma ciò che ha lanciato.
 */
export function orfani(prima: ReadonlyMap<number, number>, vivi: ReadonlySet<number>, radice: number): number[] {
  /** `null` se il processo non discendeva da `radice`; altrimenti se fra lui e `radice` un genitore è morto. */
  const sottoUnMorto = (pid: number): boolean | null => {
    let morto = false
    let genitore = prima.get(pid)
    for (let passi = 0; genitore !== undefined && passi < 64; passi++) {
      if (genitore === radice) return morto
      if (!vivi.has(genitore)) morto = true
      genitore = prima.get(genitore)
    }
    return null
  }
  const rimasti = new Set([...prima.keys()].filter((pid) => vivi.has(pid) && sottoUnMorto(pid) === true))
  return [...rimasti].filter((pid) => !rimasti.has(prima.get(pid) ?? -1))
}

async function righe(comando: string[]): Promise<string[]> {
  const processo = Bun.spawn(comando, { stdin: "ignore", stdout: "pipe", stderr: "ignore", windowsHide: true })
  const uscita = await new Response(processo.stdout).text()
  if ((await processo.exited) !== 0) throw new Error(`${comando[0]} non ha dato l'elenco dei processi`)
  return uscita.split("\n")
}

export const sistemaVero: Sistema = {
  processi: async () => {
    const elenco =
      process.platform === "win32"
        ? await righe(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", "Get-CimInstance Win32_Process | ForEach-Object { \"$($_.ProcessId) $($_.ParentProcessId)\" }"])
        : await righe(["ps", "-eo", "pid=,ppid="])
    return new Map(
      elenco.flatMap((riga): [number, number][] => {
        const [pid, genitore] = riga.trim().split(/\s+/).map(Number)
        return pid !== undefined && genitore !== undefined && Number.isInteger(pid) && Number.isInteger(genitore) ? [[pid, genitore]] : []
      }),
    )
  },
  ferma: async (pid) => {
    if (process.platform !== "win32") {
      for (const p of pid) process.kill(p)
      return
    }
    await Bun.spawn(["taskkill", ...pid.flatMap((p) => ["/PID", String(p)]), "/T", "/F"], { stdin: "ignore", stdout: "ignore", stderr: "ignore", windowsHide: true }).exited
  },
}
