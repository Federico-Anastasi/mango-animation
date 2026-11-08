// Su Windows i figli di un processo ucciso a forza (Gestione attività, `taskkill /F`) restano vivi: un montaggio finirebbe da solo,
// sulla scheda video, senza che nessuno lo veda. Il processo entra in un Job Object che Windows chiude con lui, e con la chiusura
// spegne tutti i processi che ne fanno parte, figli compresi (anche quelli lanciati dopo).
import { dlopen, FFIType, ptr } from "bun:ffi"

const KILL_ON_JOB_CLOSE = 0x2000
const JOB_OBJECT_EXTENDED_LIMIT_INFORMATION = 9
/** `JOBOBJECT_EXTENDED_LIMIT_INFORMATION` a 64 bit: `LimitFlags` sta a 16 byte dall'inizio. */
const BYTE_DELLA_STRUTTURA = 144
const POSTO_DEI_FLAG = 16

/** Dice cosa non ha funzionato; senza, i figli sono legati al processo. Fuori da Windows non fa niente. */
export function legaIFigliAlProcesso(): void {
  if (process.platform !== "win32") return
  const { symbols } = dlopen("kernel32.dll", {
    CreateJobObjectW: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.ptr },
    SetInformationJobObject: { args: [FFIType.ptr, FFIType.i32, FFIType.ptr, FFIType.u32], returns: FFIType.i32 },
    AssignProcessToJobObject: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
    GetCurrentProcess: { args: [], returns: FFIType.ptr },
    GetLastError: { args: [], returns: FFIType.u32 },
  })
  const fallito = (chiamata: string): Error => new Error(`${chiamata} è fallita (codice ${symbols.GetLastError()}): se il server viene ucciso a forza i suoi lavori restano vivi.`)
  const job = symbols.CreateJobObjectW(null, null)
  if (!job) throw fallito("CreateJobObjectW")
  const struttura = new Uint8Array(BYTE_DELLA_STRUTTURA)
  new DataView(struttura.buffer).setUint32(POSTO_DEI_FLAG, KILL_ON_JOB_CLOSE, true)
  if (!symbols.SetInformationJobObject(job, JOB_OBJECT_EXTENDED_LIMIT_INFORMATION, ptr(struttura), BYTE_DELLA_STRUTTURA)) throw fallito("SetInformationJobObject")
  if (!symbols.AssignProcessToJobObject(job, symbols.GetCurrentProcess())) throw fallito("AssignProcessToJobObject")
}
