"""Per ogni video con un file in uscite/: la miniatura e la durata accanto al file (uscite/miniatura.jpg, uscite/misure.json).
Uso: python -m strumenti.miniature"""
import json, subprocess

from motore.archivio import archivio_di_lavoro
from motore.errori import Errore


def main():
    try:
        archivio = archivio_di_lavoro()
    except Errore as e:
        raise SystemExit(str(e))
    for cartella in sorted((archivio / "video").iterdir()):
        uscite = cartella / "uscite"
        file = next((uscite / n for n in ("pubblicato.mp4", "finale.mp4") if (uscite / n).exists()), None)
        if file is None:
            continue
        misure, miniatura = uscite / "misure.json", uscite / "miniatura.jpg"
        if not misure.exists() or misure.stat().st_mtime < file.stat().st_mtime:
            durata = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(file)],
                                          capture_output=True, text=True, check=True).stdout)
            misure.write_text(json.dumps({"durata": round(durata, 3), "file": file.name}), encoding="utf-8")
        if not miniatura.exists() or miniatura.stat().st_mtime < file.stat().st_mtime:
            subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-y", "-ss", "0.6", "-i", str(file), "-frames:v", "1", "-vf", "scale=360:-2", "-q:v", "4", str(miniatura)], check=True)
        print(cartella.name)


if __name__ == "__main__":
    main()
