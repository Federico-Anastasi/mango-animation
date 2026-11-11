import json
import os
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from .archivio import scrivi_con
from .errori import Errore

# La frequenza dell'audio che il motore ascolta (livello della voce, trascrizione, allineamento, dettatura).
FREQUENZA = 16000


def ffmpeg(*argomenti):
    try:
        esito = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", *map(str, argomenti)], capture_output=True, encoding="utf-8", errors="replace")
    except FileNotFoundError:
        raise Errore("ffmpeg non c'è nel PATH: serve ffmpeg 7.1",
                     "ffmpeg is not in the PATH: ffmpeg 7.1 is needed")
    if esito.returncode != 0:
        raise Errore(f"ffmpeg non è riuscito: {esito.stderr.strip()[-600:]}",
                     f"ffmpeg failed: {esito.stderr.strip()[-600:]}")


def ffmpeg_su(uscita, *argomenti):
    """Come `ffmpeg`, ma l'uscita si scrive a parte e va al suo posto solo a lavoro finito: un lavoro interrotto non lascia un file a metà."""
    scrivi_con(uscita, lambda dest: ffmpeg(*argomenti, "-y", dest))


def scrivi_elenco(elenco, file):
    """L'elenco di file per il `-f concat` di ffmpeg, una riga `file '<percorso>'` ciascuno: un apostrofo nel percorso (una cartella D'Angelo) si scrive `'\''`."""
    elenco.write_text("".join("file '" + f.as_posix().replace("'", "'\\''") + "'\n" for f in file), encoding="utf-8")


def pcm_16k(file, da=None, durata=None):
    """L'audio di un file a 16 kHz mono, in secondi del contenitore: se la traccia parte dopo lo zero, il vuoto è riempito di silenzio."""
    import numpy as np

    taglio = [] if da is None else ["-ss", f"{da:.3f}", "-t", f"{durata:.3f}"]
    esito = subprocess.run(["ffmpeg", "-v", "error", "-nostdin", *taglio, "-i", str(file), "-vn", "-ac", "1", "-ar", str(FREQUENZA), "-f", "s16le", "-"], capture_output=True)
    if esito.returncode != 0 and not info(file)["ha_audio"]:
        raise Errore(f"{Path(file).name} non ha una traccia audio", f"{Path(file).name} has no audio track")
    if esito.returncode != 0:
        raise Errore(f"non riesco a leggere l'audio di {file}: {esito.stderr.decode(errors='replace').strip()[-300:]}",
                     f"I cannot read the audio of {file}: {esito.stderr.decode(errors='replace').strip()[-300:]}")
    x = np.frombuffer(esito.stdout, dtype=np.int16).astype(np.float32) / 32768
    if da is None:
        x = np.concatenate([np.zeros(round(info(file)["audio_parte"] * FREQUENZA), dtype=np.float32), x])
    return x


def info(file):
    """Formato, durata e fotogrammi di un file video, di una foto o di un audio (senza video `largo`, `alto` e `fps` sono None);
    `audio_parte` è il secondo in cui comincia la traccia audio.
    `largo` e `alto` sono quelli a schermo: un video del telefono girato in verticale è scritto in orizzontale e ruotato, e ffmpeg lo raddrizza da sé."""
    esito = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,width,height,r_frame_rate,start_time,duration:stream_side_data=rotation:stream_tags=rotate:format=duration", "-of", "json", str(file)],
                           capture_output=True, encoding="utf-8", errors="replace")
    if esito.returncode != 0:
        raise Errore(f"non riesco a leggere {file}: {esito.stderr.strip()[-300:]}",
                     f"I cannot read {file}: {esito.stderr.strip()[-300:]}")
    dati = json.loads(esito.stdout)
    video = next((s for s in dati["streams"] if s["codec_type"] == "video"), None)
    audio = next((s for s in dati["streams"] if s["codec_type"] == "audio"), None)
    durata = dati["format"].get("duration")
    if video is None:
        if audio is None:
            raise Errore(f"{Path(file).name} non ha né video né audio",
                         f"{Path(file).name} has neither video nor audio")
        return {"largo": None, "alto": None, "fps": None, "durata": float(durata), "ha_video": False, "ha_audio": True,
                "audio_parte": max(0.0, float(audio.get("start_time", 0) or 0))}
    n, d = video["r_frame_rate"].split("/")
    rotazione = next((r["rotation"] for r in video.get("side_data_list", []) if "rotation" in r), video.get("tags", {}).get("rotate", 0))
    largo, alto = (int(video["height"]), int(video["width"])) if abs(int(rotazione)) in (90, 270) else (int(video["width"]), int(video["height"]))
    return {
        "largo": largo, "alto": alto, "fps": int(n) / int(d) if int(d) else 0.0,
        # Una foto PNG non dichiara una durata: vale un fotogramma.
        "durata": float(durata) if durata else (int(d) / int(n) if int(n) else 0.0), "ha_video": True, "ha_audio": audio is not None,
        # Una traccia AAC può dichiarare un inizio di pochi millesimi prima dello zero (l'avvio del codificatore): non è un vuoto da riempire.
        "audio_parte": max(0.0, float(audio.get("start_time", 0) or 0)) if audio else 0.0,
    }


def paralleli(stile):
    """Quanti lavori insieme: uno ogni `parallelismo.processori_per_lavoro` processori, perché ffmpeg e x264 ne usano già più d'uno ciascuno."""
    return max(1, (os.cpu_count() or 1) // stile["parallelismo"]["processori_per_lavoro"])


def in_parallelo(funzione, voci, quanti):
    """`funzione` su ogni voce, `quanti` alla volta; i risultati escono nell'ordine delle voci, il primo errore si ripropaga."""
    with ThreadPoolExecutor(max_workers=quanti) as gruppo:
        yield from gruppo.map(funzione, voci)
