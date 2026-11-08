// Il processo che le prove mandano in un gruppo di processi suo: riabilita Ctrl+C (un gruppo nuovo lo
// ha spento) e poi parte come `bun run avvia`.
import { dlopen, FFIType } from "bun:ffi"

dlopen("kernel32.dll", { SetConsoleCtrlHandler: { args: [FFIType.ptr, FFIType.i32], returns: FFIType.i32 } }).symbols.SetConsoleCtrlHandler(null, 0)
await import("../src/avvia")
