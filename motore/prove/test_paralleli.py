import threading
import time

import pytest

from motore import media
from motore.media import in_parallelo, paralleli


def test_in_parallelo_tiene_l_ordine_e_non_supera_quanti():
    insieme, massimo, chiave = 0, 0, threading.Lock()

    def lavoro(v):
        nonlocal insieme, massimo
        with chiave:
            insieme += 1
            massimo = max(massimo, insieme)
        time.sleep(0.01 * (3 - v % 3))
        with chiave:
            insieme -= 1
        return v * 10

    assert list(in_parallelo(lavoro, range(7), 3)) == [0, 10, 20, 30, 40, 50, 60]
    assert massimo == 3


def test_in_parallelo_restituisce_l_errore():
    def lavoro(v):
        if v == 1:
            raise ValueError("rotto")
        return v

    with pytest.raises(ValueError, match="rotto"):
        list(in_parallelo(lavoro, range(3), 2))


def test_ffmpeg_su_scrive_il_file_solo_a_lavoro_finito(tmp_path):
    from motore.errori import Errore
    from motore.media import ffmpeg_su

    rotto = tmp_path / "rotto.mkv"
    with pytest.raises(Errore):
        ffmpeg_su(rotto, "-i", tmp_path / "non-esiste.mkv", "-c", "copy")
    assert not rotto.exists()

    buono = tmp_path / "buono.wav"
    ffmpeg_su(buono, "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", "0.2")
    assert buono.exists() and buono.stat().st_size > 0
    assert [f.name for f in tmp_path.iterdir()] == ["buono.wav"]


def test_i_lavori_insieme_sono_i_processori_divisi_per_quelli_di_ogni_lavoro_dello_stile_e_mai_meno_di_uno(archivio, monkeypatch):
    monkeypatch.setattr(media.os, "cpu_count", lambda: 16)
    assert archivio.stile["parallelismo"]["processori_per_lavoro"] == 4 and paralleli(archivio.stile) == 4
    assert paralleli({"parallelismo": {"processori_per_lavoro": 2}}) == 8
    monkeypatch.setattr(media.os, "cpu_count", lambda: None)
    assert paralleli(archivio.stile) == 1
