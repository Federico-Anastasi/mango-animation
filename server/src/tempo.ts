const due = (n: number): string => String(n).padStart(2, "0")

/** `2026-10-06`, all'ora di questo computer. */
export const giornoLocale = (d: Date): string => `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}`

/** `2026-10-06T22:28:01`, all'ora di questo computer, senza fuso. */
export const isoLocale = (d: Date): string => `${giornoLocale(d)}T${due(d.getHours())}:${due(d.getMinutes())}:${due(d.getSeconds())}`
