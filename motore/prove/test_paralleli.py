import threading
import time

import pytest

from motore.media import in_parallelo


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
