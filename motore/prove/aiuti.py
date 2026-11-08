import subprocess
from unittest import mock

import numpy as np

from motore import animazioni
from motore.media import info
from motore.monta import monta
from motore.risolvi import risolvi


def fotogramma(file, t, largo=1080, alto=1920):
    """Il fotogramma di un video al secondo `t`, come righe×colonne×RGB."""
    esito = subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-ss", f"{t:.4f}", "-i", str(file), "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True)
    assert esito.returncode == 0 and len(esito.stdout) == largo * alto * 3, esito.stderr
    return np.frombuffer(esito.stdout, dtype=np.uint8).reshape(alto, largo, 3).astype(int)


def audio(file, da=None, durata=None):
    taglio = [] if da is None else ["-ss", f"{da:.3f}", "-t", f"{durata:.3f}"]
    esito = subprocess.run(["ffmpeg", "-v", "error", "-nostdin", *taglio, "-i", str(file), "-vn", "-ac", "1", "-ar", "48000", "-f", "s16le", "-"], capture_output=True, check=True)
    return np.frombuffer(esito.stdout, dtype=np.int16).astype(np.float32) / 32768


def energia_a(x, frequenza, campioni=48000):
    """Quanta energia ha l'audio vicino a una frequenza."""
    spettro = np.abs(np.fft.rfft(x * np.hanning(len(x))))
    k = round(frequenza * len(x) / campioni)
    return float(spettro[max(0, k - 3):k + 4].sum())


def vicino(pixel, atteso, tolleranza=45):
    return all(abs(int(a) - int(b)) <= tolleranza for a, b in zip(pixel, atteso))


def rendi_animazioni(archivio, slug, tmp):
    """Mette un'animazione arancione, lunga quanto la scena, per ogni scena che ne vuole una."""
    r = risolvi(archivio, slug)
    cartella = archivio.lavoro(slug) / "scene"
    cartella.mkdir(parents=True, exist_ok=True)
    for sigla, voce in animazioni.richiesta(r, archivio.stile).items():
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"color=c=0xFF8C00:s={voce['formato']['largo']}x{voce['formato']['alto']}:r=30:d={voce['durata']:.4f}", "-c:v", "libx264", "-pix_fmt", "yuv420p", str(cartella / f"{sigla}.mp4")], check=True)
    return r


def monta_con_animazioni(archivio, slug, tmp):
    rendi_animazioni(archivio, slug, tmp)
    with mock.patch.object(animazioni, "rendi"):
        file = monta(archivio, slug, avanza=lambda *_: None)
    return file, info(file)


def finge_bun(monkeypatch, finto):
    """Al posto di chi rende le animazioni (bun) risponde `finto`; gli altri comandi (ffprobe, ffmpeg) restano veri."""
    vero = animazioni.subprocess.run
    monkeypatch.setattr(animazioni.shutil, "which", lambda nome: "bun")
    monkeypatch.setattr(animazioni.subprocess, "run", lambda comando, **k: finto(comando, **k) if comando[0] == "bun" else vero(comando, **k))
