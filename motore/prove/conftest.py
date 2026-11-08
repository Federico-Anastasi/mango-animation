import json
import os
import shutil
import subprocess

import pytest

from motore import allinea, dispositivo, profilo, pulizia
from motore.archivio import Archivio
from motore.voce import livello, scrivi_onda, serie

GIORNO = "2026-10-09"
# Dove parla ciascuna sorgente sintetica (secondi): toni a 440 Hz e silenzio digitale in mezzo.
TONI_TEMPO = [(0.6, 1.6), (1.7, 2.5), (3.5, 4.5), (6.0, 7.0)]
TONI_PAROLE = [(1.0, 1.4), (1.6, 2.0), (2.2, 2.6), (6.0, 6.4), (6.6, 7.0)]
PAROLE_TEMPO = [{"p": "uno", "da": 0.55, "a": 1.5}, {"p": "due", "da": 1.7, "a": 2.5}, {"p": "tre", "da": 3.5, "a": 4.5}, {"p": "quattro", "da": 6.0, "a": 7.0}]
PAROLE_PAROLE = [{"p": p, "da": da, "a": a} for p, (da, a) in zip(["ciao", "a", "tutti", "buona", "sera"], TONI_PAROLE)]
DURATA = 8


def _ffmpeg(*argomenti):
    esito = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y", *map(str, argomenti)], capture_output=True, text=True)
    assert esito.returncode == 0, esito.stderr


def _audio(toni):
    espressione = "+".join(f"between(t,{a},{b})" for a, b in toni)
    return ["-f", "lavfi", "-i", f"aevalsrc=exprs='0.3*sin(2*PI*440*t)*({espressione})':s=48000:d={DURATA}"]


def _video_a_blocchi(largo, alto, sfondo, blocchi, durata=DURATA):
    filtri = ",".join(f"drawbox=x={x}:y={y}:w={w}:h={h}:color={c}:t=fill" for (x, y, w, h), c in blocchi)
    return ["-f", "lavfi", "-i", f"color=c={sfondo}:s={largo}x{alto}:r=30:d={durata},{filtri}" if blocchi else f"color=c={sfondo}:s={largo}x{alto}:r=30:d={durata}"]


@pytest.fixture(scope="session")
def fonti(tmp_path_factory):
    """Il girato sintetico, fatto una volta sola: due sorgenti con la voce a toni, un'animazione, una sagoma."""
    cartella = tmp_path_factory.mktemp("fonti")
    codifica = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "12", "-g", "10", "-c:a", "aac", "-b:a", "128k", "-shortest"]
    for nome, toni in (("tempo", TONI_TEMPO), ("parole", TONI_PAROLE)):
        _ffmpeg(*_video_a_blocchi(1080, 1920, "red", [((540, 0, 540, 1920), "blue")]), *_audio(toni), *codifica, cartella / f"{nome}.mp4")
    _ffmpeg(*_video_a_blocchi(1920, 1080, "0x3C3C3C", [((1244, 26, 432, 246), "0x00C800"), ((720, 280, 960, 720), "0xE6E600"), ((10, 105, 482, 250), "0xDC00DC")]), *_audio(TONI_TEMPO), *codifica, cartella / "larga.mp4")
    _ffmpeg(*_video_a_blocchi(1080, 1920, "0xFF8C00", [], 6), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "12", cartella / "anim.mp4")
    _ffmpeg("-f", "lavfi", "-i", f"color=c=blue:s=1080x1920:r=30:d={DURATA},format=yuva420p,geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='if(between(X,300,799)*between(Y,600,1899),255,0)'",
            "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-deadline", "realtime", "-cpu-used", "8", "-b:v", "0", "-crf", "20", "-auto-alt-ref", "0", cartella / "sagoma.webm")
    for nome in ("tempo", "parole", "larga"):
        scrivi_onda(cartella / f"{nome}.mp4", cartella / f"{nome}.onda.bin")
    return cartella


class AllineatoreFinto:
    """Trova le parole dai toni: la n-esima voce dell'audio è la n-esima parola."""

    def allinea(self, x, parole):
        attivo = livello(x) > -39
        voci = [list(v) for v in serie(attivo)]
        unite = []
        for a, b in voci:
            if unite and a - unite[-1][1] < 5:
                unite[-1][1] = b
            else:
                unite.append([a, b])
        assert len(unite) == len(parole), f"{len(unite)} voci per {len(parole)} parole: {parole}"
        return [(a * 0.01, b * 0.01, 0.95) for a, b in unite]


@pytest.fixture(autouse=True)
def impostazioni_di_ogni_prova():
    """Il profilo e il posto dove girano i modelli si leggono una volta per processo: ogni prova ricomincia da capo."""
    for letto in (profilo._motori_di_lavoro, dispositivo.dispositivo, dispositivo._della_macchina):
        letto.cache_clear()


@pytest.fixture(autouse=True)
def voce_senza_programma(monkeypatch):
    """Le prove non usano il programma che pulisce la voce: la voce «pulita» è quella vera."""
    monkeypatch.setattr(pulizia, "filtra", lambda grezza, pulita, stile: shutil.copy(grezza, pulita))


@pytest.fixture
def finto(monkeypatch):
    monkeypatch.setattr(allinea, "apri", lambda: AllineatoreFinto())


@pytest.fixture
def archivio(tmp_path):
    return Archivio(radice=tmp_path / "archivio")


def _collega(da, a):
    a.parent.mkdir(parents=True, exist_ok=True)
    try:
        os.link(da, a)
    except OSError:
        shutil.copy2(da, a)


@pytest.fixture
def prepara_sintetico(archivio, fonti):
    """Mette nell'archivio di prova un file sintetico già preparato (parole, livello della voce, sagoma): torna il suo nome per i piani."""

    def _prepara(nome, parole, come=None, sagoma=True, onda=None):
        file = f"{GIORNO}/{come or nome}.mp4"
        _collega(fonti / f"{nome}.mp4", archivio.grezzo(file))
        cartella = archivio.preparati(file)
        cartella.mkdir(parents=True, exist_ok=True)
        (cartella / "parole.json").write_text(json.dumps(parole), encoding="utf-8")
        _collega(fonti / f"{onda or nome}.onda.bin", cartella / "onda.bin")
        if sagoma:
            _collega(fonti / "sagoma.webm", cartella / "sagoma.webm")
        return file

    return _prepara


@pytest.fixture
def scrivi_piano(archivio):
    def _scrivi(slug, piano):
        cartella = archivio.radice / "video" / slug
        cartella.mkdir(parents=True, exist_ok=True)
        (cartella / "piano.json").write_text(json.dumps(piano), encoding="utf-8")
        return slug

    return _scrivi


@pytest.fixture
def animazione(archivio, fonti):
    """Mette un'animazione già resa nel lavoro di un video, come se fosse stata resa per i suoi tempi."""

    def _metti(slug, sigla):
        destinazione = archivio.lavoro(slug) / "scene" / f"{sigla}.mp4"
        _collega(fonti / "anim.mp4", destinazione)
        return destinazione

    return _metti
