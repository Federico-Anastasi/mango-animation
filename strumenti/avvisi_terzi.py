"""Gli avvisi di terzi: `AVVISI-DI-TERZI.md` alla radice, con licenza e fonte di tutto ciò che il prodotto porta o scarica.

    python -m strumenti.avvisi_terzi              # riscrive il file
    python -m strumenti.avvisi_terzi --controlla  # esce con 1 se il file non è quello che le dipendenze di oggi darebbero

Non si scrive a mano, tranne le due tabelle che nessun file di blocco descrive (`PACCHETTI_PYTHON`, `LIMITI`). Il resto si legge da dove le dipendenze sono dichiarate:
- pacchetti npm: `bun.lock` di `server/`, `studio/`, `animazioni/` e la licenza dichiarata da ogni pacchetto in `node_modules/` (serve `bun install`);
- crate dell'app: `cargo metadata` su `app/Cargo.lock` (serve `cargo`);
- ciò che l'app scarica dalla sua fonte (programmi e modelli): `app/src/computer/manifesto.json`;
- pacchetti Python: i nomi che `app/src/computer/piano.rs` installa, ognuno con la sua riga in `PACCHETTI_PYTHON`.
Una dipendenza che manca da una tabella, o una licenza che pone limiti e non ha la sua nota in `LIMITI`, fa fallire la generazione: il file non esce incompleto.
"""

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

RADICE = Path(__file__).resolve().parent.parent
FILE = RADICE / "AVVISI-DI-TERZI.md"
SPAZI_DI_LAVORO = ("server", "studio", "animazioni")
PIANO = RADICE / "app" / "src" / "computer" / "piano.rs"
MANIFESTO = RADICE / "app" / "src" / "computer" / "manifesto.json"
PIATTAFORMA = "x86_64-pc-windows-msvc"

# Licenza e fonte dei pacchetti Python, letti dai pacchetti stessi (metadati e file LICENSE) con le versioni in uso.
PACCHETTI_PYTHON: dict[str, tuple[str, str]] = {
    "jsonschema": ("MIT", "https://pypi.org/project/jsonschema/"),
    "nvidia-cublas-cu12": ("Licenza proprietaria di NVIDIA (CUDA Toolkit EULA); l'app lo scarica da PyPI sul computer di chi lo usa, solo per la trascrizione sulla scheda NVIDIA senza PyTorch, e non lo ridistribuisce", "https://pypi.org/project/nvidia-cublas-cu12/"),
    "numpy": ("BSD-3-Clause (e le licenze di ciò che porta: 0BSD, MIT, Zlib, CC0-1.0)", "https://pypi.org/project/numpy/"),
    "pillow": ("MIT-CMU (HPND)", "https://pypi.org/project/pillow/"),
    "pillow-heif": ("BSD-3-Clause (la ruota porta librerie a parte: libheif e libde265 LGPL-3.0, x265 GPL-2.0)", "https://pypi.org/project/pillow-heif/"),
    "yt-dlp": ("Unlicense", "https://github.com/yt-dlp/yt-dlp"),
    "playwright": ("Apache-2.0 (la ruota porta il driver di Playwright e Node.js, con le loro licenze; i browser non si scaricano: `leggi_tiktok` pilota il Chrome del creator)", "https://pypi.org/project/playwright/"),
    "faster-whisper": ("MIT", "https://pypi.org/project/faster-whisper/"),
    "requests": ("Apache-2.0", "https://pypi.org/project/requests/"),
    "transformers": ("Apache-2.0", "https://pypi.org/project/transformers/"),
    "opencv-python-headless": ("Apache-2.0 (la ruota porta librerie a parte, FFmpeg fra queste, con le loro licenze LGPL)", "https://pypi.org/project/opencv-python-headless/"),
    "huggingface-hub": ("Apache-2.0", "https://pypi.org/project/huggingface-hub/"),
    "torch": ("BSD-3-Clause", "https://pytorch.org"),
    "torchaudio": ("BSD-2-Clause", "https://pytorch.org"),
    "torchvision": ("BSD-3-Clause", "https://pytorch.org"),
}

# I pacchetti che l'app installa senza versione, e perché: ogni altro è fissato, e uno senza versione fuori da qui ferma la generazione.
SENZA_VERSIONE: dict[str, str] = {
    "yt-dlp": "l’ultima, di proposito: i siti cambiano",
}

# Ciò che pone limiti a chi ridistribuisce o usa il prodotto. La chiave è il nome di ciò che li pone: una licenza di questo genere senza la sua nota ferma la generazione.
LIMITI: dict[str, str] = {
    "mms-fa": (
        "**L'allineamento delle parole (MMS_FA) è per uso non commerciale** (CC-BY-NC-4.0). I pesi si scaricano dalla fonte, non sono nel prodotto; il prodotto con l'allineamento acceso "
        "non si può usare per guadagnare. Si spegne dalle impostazioni (`motori.allineamento`): i pezzi a parole restano, meno precisi."
    ),
    "ffmpeg": (
        "**ffmpeg è un programma a parte, in versione GPL-3.0** (la «full build» di gyan.dev): l'app lo scarica dalla sua fonte e lo lancia come processo; non è linkato né incluso nel codice. "
        "Chi ridistribuisce quel programma deve darne i sorgenti (la fonte li pubblica)."
    ),
    "pillow-heif": (
        "**La ruota di pillow-heif (le foto HEIC dell'iPhone) porta x265, GPL-2.0, e libheif e libde265, LGPL-3.0**, come librerie a parte (`LICENSES_bundled.txt` del pacchetto). "
        "L'app le scarica da PyPI sul computer del creator e il codice del prodotto non le include; chi ridistribuisse l'ambiente Python già fatto dovrebbe rispettare quelle licenze."
    ),
    "claude-agent-sdk": (
        "**Claude Agent SDK** è sotto le condizioni commerciali di Anthropic (`SEE LICENSE`), non una licenza aperta: il server lo usa per la chat, lanciando il `claude` che il creator ha installato: l'accesso lo fa Claude Code da sé, il nostro codice non legge né usa credenziali. "
        "Claude Code non è parte del prodotto. Il permesso aggiuntivo dell'AGPL per usarli insieme è in `NOTICE.md`."
    ),
    "MPL-2.0": (
        "**Pacchetti MPL-2.0** (copyleft sui file): il loro codice non è modificato qui; se un file di quei pacchetti si modifica, quel file resta MPL-2.0 e se ne pubblica il sorgente."
    ),
    "font": (
        "**Caratteri OFL-1.1** (Archivo in `font/`, i pacchetti `@fontsource/*`): si ridistribuiscono liberamente ma non si vendono da soli."
    ),
}

NON_PERMISSIVE = re.compile(r"(?i)\bNC\b|-NC-|AGPL|(?<!L)GPL|LGPL|MPL|SEE LICENSE|OFL")


class Mancanza(Exception):
    pass


def _pulisci_virgole(testo: str) -> str:
    return re.sub(r",(\s*[}\]])", r"\1", testo)


def _cartella_npm(base: Path, chiave: str, pacchetti: dict) -> Path:
    """Un pacchetto che vuole un'altra versione di quella in cima sta nel `node_modules/` del pacchetto che lo vuole: nel blocco la sua chiave è `padre/nome`."""
    nome = pacchetti[chiave][0].rsplit("@", 1)[0]
    if chiave == nome:
        return base / "node_modules" / nome
    return _cartella_npm(base, chiave[: -len(nome) - 1], pacchetti) / "node_modules" / nome


def npm(spazio: str) -> list[tuple[str, str, str]]:
    """(nome, versione, licenza) di ciò che `bun install` mette in `node_modules/` su questo computer."""
    lock = json.loads(_pulisci_virgole((RADICE / spazio / "bun.lock").read_text(encoding="utf-8")))
    righe = []
    for chiave, voce in sorted(lock["packages"].items()):
        nome, versione = voce[0].rsplit("@", 1)
        pacchetto = _cartella_npm(RADICE / spazio, chiave, lock["packages"]) / "package.json"
        if not pacchetto.is_file():
            meta = voce[2] if len(voce) > 2 and isinstance(voce[2], dict) else {}
            if "os" in meta or "cpu" in meta:
                continue  # il binario di un altro sistema: bun non lo scarica qui
            raise Mancanza(f"{spazio}: «{nome}» è nel bun.lock ma non in node_modules/: lancia `bun install` in {spazio}/.")
        dichiarata = json.loads(pacchetto.read_text(encoding="utf-8")).get("license")
        if not dichiarata:
            raise Mancanza(f"{spazio}: «{nome}» non dichiara una licenza: va letta a mano e messa in una nota.")
        righe.append((nome, versione, str(dichiarata)))
    return righe


def portati(grafo: dict) -> set[str]:
    """Gli id dei crate che l'app porta: quelli a cui si arriva dalla radice senza passare da una dipendenza delle sole prove."""
    archi = {n["id"]: [d["pkg"] for d in n["deps"] if any(t["kind"] != "dev" for t in d["dep_kinds"])] for n in grafo["nodes"]}
    visti: set[str] = set()
    da_vedere = list(archi[grafo["root"]])
    while da_vedere:
        crate = da_vedere.pop()
        if crate not in visti:
            visti.add(crate)
            da_vedere.extend(archi[crate])
    return visti


def crate() -> list[tuple[str, str, str]]:
    """(nome, versione, licenza) dei crate dell'app per Windows, con `cargo metadata` sul blocco."""
    if shutil.which("cargo") is None:
        raise Mancanza("manca `cargo` nel PATH: serve per leggere i crate dell'app (docs/NUOVO-COMPUTER.md).")
    uscita = subprocess.run(
        ["cargo", "metadata", "--locked", "--offline", "--format-version", "1", "--filter-platform", PIATTAFORMA],
        cwd=RADICE / "app", capture_output=True, text=True, encoding="utf-8",
    )
    if uscita.returncode != 0:
        raise Mancanza(f"`cargo metadata` non è riuscito: {uscita.stderr.strip()[:400]}")
    dati = json.loads(uscita.stdout)
    radice = dati["resolve"]["root"]
    nel_grafo = portati(dati["resolve"])
    righe = []
    for p in sorted(dati["packages"], key=lambda p: (p["name"], p["version"])):
        if p["id"] == radice or p["id"] not in nel_grafo:
            continue
        if not p.get("license"):
            raise Mancanza(f"crate «{p['name']}» {p['version']} non dichiara una licenza: va letta a mano e messa in una nota.")
        righe.append((p["name"], p["version"], p["license"]))
    return righe


def scaricato() -> list[dict]:
    return json.loads(MANIFESTO.read_text(encoding="utf-8"))["elementi"]


def _nome_python(nome: str) -> str:
    return re.sub(r"[-_.]+", "-", nome).lower()


def pacchetti_installati() -> list[tuple[str, str]]:
    """(nome, versione o «») dei pacchetti Python che `piano.rs` installa: i letterali dei suoi elenchi di pacchetti."""
    codice = PIANO.read_text(encoding="utf-8")
    elenchi = re.findall(r"PACCHETTI_BASE: &\[&str\] = &\[(.*?)\];|(?:extend|semplici)\(&?\[(.*?)\]\)", codice, flags=re.S)
    trovati = []
    for a, b in elenchi:
        for letterale in re.findall(r'"([^"]+)"', a or b):
            nome, _, versione = letterale.partition("==")
            trovati.append((nome, versione))
    if not trovati:
        raise Mancanza("non trovo in piano.rs l'elenco dei pacchetti Python: la forma del file è cambiata, aggiorna `pacchetti_installati`.")
    return sorted(set(trovati), key=lambda t: _nome_python(t[0]))


def _riga_limite_se_serve(chiave: str, usati: set[str]) -> None:
    usati.add(chiave)
    if chiave not in LIMITI:
        raise Mancanza(f"«{chiave}» pone limiti e non ha la sua nota: aggiungila a LIMITI in strumenti/avvisi_terzi.py.")


def genera() -> str:
    usati: set[str] = set()
    sezioni_npm = {s: npm(s) for s in SPAZI_DI_LAVORO}
    crates = crate()
    elementi = scaricato()
    python = pacchetti_installati()

    for e in elementi:
        if e["id"] in LIMITI:
            usati.add(e["id"])
        elif NON_PERMISSIVE.search(e["licenza"]) and "non incluso" not in e["licenza"]:
            _riga_limite_se_serve(e["id"], usati)
    if "ffmpeg" in {e["id"] for e in elementi}:
        usati.add("ffmpeg")
    for nome, _ in python:
        if _nome_python(nome) not in PACCHETTI_PYTHON:
            raise Mancanza(f"il pacchetto Python «{nome}» che l'app installa non ha la sua riga: aggiungila a PACCHETTI_PYTHON in strumenti/avvisi_terzi.py (licenza letta dal pacchetto).")
    for spazio, righe in sezioni_npm.items():
        for nome, _, licenza in righe:
            if licenza.startswith("SEE LICENSE"):
                _riga_limite_se_serve("claude-agent-sdk" if "claude-agent-sdk" in nome else nome, usati)
            elif "MPL" in licenza:
                usati.add("MPL-2.0")
            elif "OFL" in licenza:
                usati.add("font")
            elif NON_PERMISSIVE.search(licenza):
                _riga_limite_se_serve(nome, usati)
    if any("MPL" in lic for _, _, lic in crates):
        usati.add("MPL-2.0")
    for _, _, lic in crates:
        if re.search(r"(?<!L)GPL|LGPL|\bNC\b", lic):
            raise Mancanza(f"un crate ha una licenza GPL o non commerciale ({lic}): serve una nota in LIMITI e una decisione.")
    usati.add("pillow-heif")
    usati.add("font")

    r: list[str] = []
    r.append("# Avvisi di terzi\n")
    r.append(
        "Questo file è generato da `python -m strumenti.avvisi_terzi` (non si scrive a mano): elenca la licenza e la fonte di ciò che il prodotto porta con sé o scarica dalla sua fonte. "
        "Il codice del prodotto è sotto AGPL-3.0-or-later (`LICENSE`, `NOTICE.md`); nome e logo seguono `TRADEMARKS.md`. I modelli e i programmi pesanti **non si distribuiscono col prodotto**: l'app li scarica dalla fonte indicata, con la licenza della fonte.\n"
    )
    r.append("## Ciò che pone limiti\n")
    for chiave in LIMITI:
        if chiave in usati:
            r.append(f"- {LIMITI[chiave]}")
    r.append("")

    r.append("## Ciò che l'app scarica dalla sua fonte\n")
    r.append("Da `app/src/computer/manifesto.json`: programmi e modelli, con l'impronta e la dimensione pubblicate dalla fonte.\n")
    r.append("| Cosa | A cosa serve | Licenza | Fonte |")
    r.append("|---|---|---|---|")
    for e in elementi:
        r.append(f"| {e['nome']} | {e['scopo']} | {e['licenza']} | <{e['fonte']}> |")
    r.append("")
    r.append("Il browser per le animazioni (Chromium di Playwright) si scarica con `bunx playwright install chromium`: licenza BSD-3-Clause, più quelle dei suoi componenti, <https://playwright.dev>.\n")

    r.append("## Pacchetti Python del motore\n")
    r.append("Installati dall'app in un ambiente suo (`app/src/computer/piano.rs`).\n")
    r.append("| Pacchetto | Versione | Licenza | Fonte |")
    r.append("|---|---|---|---|")
    for nome, versione in python:
        licenza, fonte = PACCHETTI_PYTHON[_nome_python(nome)]
        if not versione and nome not in SENZA_VERSIONE:
            raise Mancanza(f"«{nome}» è installato senza versione in piano.rs: fissala, o aggiungilo a SENZA_VERSIONE con il motivo.")
        r.append(f"| {nome} | {versione or SENZA_VERSIONE[nome]} | {licenza} | <{fonte}> |")
    r.append("")
    r.append("Solo per chi sviluppa o usa gli strumenti: `pytest` (MIT). Non lo installa l'app.\n")

    r.append("## Caratteri\n")
    r.append("`font/Archivo-700.ttf`: Archivo, SIL Open Font License 1.1, <https://github.com/Omnibus-Type/Archivo>. `font/Metropolis-Medium.ttf`: Metropolis, Unlicense (pubblico dominio), <https://github.com/dw5/Metropolis>; il testo è in `font/Metropolis-UNLICENSE.txt`. "
        "Il carattere della sigla, `animazioni/src/scene/sigla/caratteri/space-grotesk.typeface.json`, è ricavato da Space Grotesk (SIL Open Font License 1.1, <https://github.com/floriankarsten/space-grotesk>); il testo della licenza è accanto, in `OFL-SpaceGrotesk.txt`. "
        "Gli altri caratteri arrivano dai pacchetti `@fontsource/*` qui sotto.\n")

    nomi_loghi = ", ".join(f.stem for f in sorted((RADICE / "animazioni" / "src" / "standard" / "loghi").glob("*.svg")))
    r.append("## Marchi\n")
    r.append(
        f"I loghi in `animazioni/src/standard/loghi/` ({nomi_loghi}) sono marchi dei rispettivi proprietari e non sono coperti dalla licenza del progetto (AGPL-3.0-or-later): compaiono solo per indicare i prodotti di cui un video parla. "
        "Accanto a ogni file, un `.txt` dice da dove viene e con quale licenza è pubblicato il disegno; la licenza del disegno non dà alcun diritto sul marchio.\n"
    )

    for spazio, righe in sezioni_npm.items():
        r.append(f"## Pacchetti npm di `{spazio}/`\n")
        r.append("Da `bun.lock`, con la licenza che ogni pacchetto dichiara. Compresi gli strumenti di costruzione e di prova, che `bun install` scarica.\n")
        r.append("| Pacchetto | Versione | Licenza |")
        r.append("|---|---|---|")
        for nome, versione, licenza in righe:
            r.append(f"| {nome} | {versione} | {licenza} |")
        r.append("")

    r.append("## Crate Rust dell'app\n")
    r.append(f"Da `app/Cargo.lock` (`cargo metadata` per `{PIATTAFORMA}`), con la licenza che ogni crate dichiara.\n")
    r.append("| Crate | Versione | Licenza |")
    r.append("|---|---|---|")
    for nome, versione, licenza in crates:
        r.append(f"| {nome} | {versione} | {licenza} |")
    r.append("")
    return "\n".join(r)


def main(argomenti: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Genera AVVISI-DI-TERZI.md dalle dipendenze di oggi.")
    parser.add_argument("--controlla", action="store_true", help="non scrive: esce con 1 se il file non è aggiornato")
    opzioni = parser.parse_args(argomenti)
    try:
        nuovo = genera()
    except Mancanza as errore:
        print(f"avvisi_terzi: {errore}", file=sys.stderr)
        return 2
    if opzioni.controlla:
        attuale = FILE.read_text(encoding="utf-8") if FILE.is_file() else ""
        if attuale != nuovo:
            print("avvisi_terzi: AVVISI-DI-TERZI.md non è aggiornato: lancia `python -m strumenti.avvisi_terzi`.", file=sys.stderr)
            return 1
        return 0
    FILE.write_text(nuovo, encoding="utf-8", newline="\n")
    print(f"{FILE.name} scritto.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
