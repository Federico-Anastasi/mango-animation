// Un processo che fa come il server: lancia il motore (Python), che a sua volta lancia un processo lungo (come ffmpeg), e ne scrive il PID.
// Con «lega» chiede a Windows di spegnere tutti i discendenti quando lui muore.
import { legaIFigliAlProcesso } from "../src/figli"

const [, , file, modo] = Bun.argv
if (modo === "lega") legaIFigliAlProcesso()
const motore = `import subprocess, sys, time
nipote = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(120)"])
open(sys.argv[1], "w").write(str(nipote.pid))
time.sleep(120)`
Bun.spawn(["python", "-c", motore, file!], { stdin: "ignore", stdout: "ignore", stderr: "ignore" })
await Bun.sleep(120_000)
