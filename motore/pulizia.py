"""La voce senza il rumore di fondo (DeepFilterNet3, il programma da riga di comando): si pulisce la voce già montata, una volta, così
tagli, allineamento e controlli restano sull'audio vero e la voce pulita ha gli stessi istanti."""

import hashlib
import json
import os
import subprocess
from pathlib import Path

import numpy as np

from .errori import Errore
from .media import ffmpeg, ffmpeg_su, info, pcm_16k
from .voce import livello

PROGRAMMA = Path.home() / ".cache" / "mango-animation" / "modelli" / "deep-filter-0.5.6-x86_64-pc-windows-msvc.exe"
# DeepFilterNet lavora solo a 48 kHz.
CAMPIONI = 48000


def filtra(grezza, pulita, stile):
    """Scrive in `pulita` la voce di `grezza` senza rumore. Il programma la restituisce allineata (`-D`) ma qualche centesimo più corta."""
    if not PROGRAMMA.exists():
        raise Errore(f"manca il programma che pulisce la voce (DeepFilterNet): scaricalo in {PROGRAMMA} da github.com/Rikorose/DeepFilterNet/releases (v0.5.6)",
                     f"the program that cleans the voice (DeepFilterNet) is missing: download it to {PROGRAMMA} from github.com/Rikorose/DeepFilterNet/releases (v0.5.6)")
    cartella = pulita.parent / ".deepfilter"
    cartella.mkdir(exist_ok=True)
    esito = subprocess.run([str(PROGRAMMA), "-D", "-a", str(stile["voce"]["pulizia"]["attenuazione_massima"]), "-o", str(cartella), str(grezza)],
                           capture_output=True, encoding="utf-8", errors="replace")
    uscita = cartella / Path(grezza).name
    if esito.returncode != 0 or not uscita.exists():
        raise Errore(f"la pulizia della voce non è riuscita: {(esito.stderr or esito.stdout).strip()[-400:]}",
                     f"cleaning the voice failed: {(esito.stderr or esito.stdout).strip()[-400:]}")
    os.replace(uscita, pulita)


def livello_della_voce(file):
    """Il livello medio (dB) del terzo più forte dei centesimi di secondo: la voce, senza le pause. La pulizia abbassa un po' anche la voce,
    e il video deve restare al livello dello stile."""
    db = livello(pcm_16k(file))
    return float(np.sort(db)[-max(1, len(db) // 3):].mean())


def voce_pulita(elenco, cartella, stile):
    """La voce dei tratti di `elenco` (un elenco per il concat di ffmpeg) in un wav solo, pulita e lunga quanto quella vera. Si rifà solo se
    cambiano i tratti o le misure della pulizia; nella `cartella` resta solo l'ultima."""
    impronta = hashlib.md5(json.dumps([Path(elenco).read_text(encoding="utf-8"), stile["voce"]["pulizia"]], sort_keys=True).encode()).hexdigest()[:12]
    uscita = cartella / f"{impronta}.wav"
    if uscita.exists():
        return uscita
    cartella.mkdir(parents=True, exist_ok=True)
    grezza, filtrata = cartella / f".{impronta}.grezza.wav", cartella / f".{impronta}.filtrata.wav"
    try:
        ffmpeg("-f", "concat", "-safe", "0", "-i", elenco, "-vn", "-c:a", "pcm_s16le", "-ar", CAMPIONI, "-y", grezza)
        filtra(grezza, filtrata, stile)
        campioni = round(info(grezza)["durata"] * CAMPIONI)
        guadagno = livello_della_voce(grezza) - livello_della_voce(filtrata)
        ffmpeg_su(uscita, "-i", filtrata, "-af", f"volume={guadagno:.2f}dB,apad=whole_len={campioni}", "-c:a", "pcm_s16le", "-ar", CAMPIONI)
    finally:
        grezza.unlink(missing_ok=True)
        filtrata.unlink(missing_ok=True)
    for vecchia in cartella.glob("*.wav"):
        if vecchia != uscita:
            vecchia.unlink(missing_ok=True)
    return uscita
