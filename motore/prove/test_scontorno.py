import threading

import pytest

from motore.scontorno import _Condiviso


def test_un_fotogramma_si_toglie_solo_quando_tutti_l_hanno_usato():
    c = _Condiviso(4, ("bordo", "flusso"))
    for n in range(3):
        c.metti(lambda: c.fotogrammi.__setitem__(n, f"f{n}"))
    c.avanza("bordo", 1)
    assert set(c.fotogrammi) == {0, 1, 2}
    c.avanza("flusso", 0)
    assert set(c.fotogrammi) == {1, 2}
    c.avanza("flusso", float("inf"))
    assert set(c.fotogrammi) == {2}


def test_chi_legge_non_va_troppo_avanti_rispetto_a_chi_e_piu_indietro():
    c = _Condiviso(4, ("bordo", "flusso"))
    c.avanza("bordo", 10)
    assert c.spazio(3) and not c.spazio(4)
    c.avanza("flusso", 2)
    assert c.spazio(6) and not c.spazio(7)


def test_un_errore_in_un_filo_arriva_a_chi_aspetta():
    c = _Condiviso(4, ("bordo",))

    def rotto():
        raise RuntimeError("la scheda video non risponde")

    c.filo(rotto)
    with pytest.raises(RuntimeError, match="non risponde"):
        c.fotogramma(0)


def test_dopo_l_ultimo_fotogramma_si_ha_none():
    c = _Condiviso(4, ("bordo",))
    c.metti(lambda: c.fotogrammi.__setitem__(0, "f0"))
    c.metti(lambda: setattr(c, "fine", 1))
    assert c.fotogramma(0) == "f0" and c.fotogramma(1) is None


def test_chi_aspetta_un_fotogramma_si_sveglia_quando_arriva():
    c = _Condiviso(4, ("bordo",))
    visto = []
    t = threading.Thread(target=lambda: visto.append(c.fotogramma(0)))
    t.start()
    c.metti(lambda: c.fotogrammi.__setitem__(0, "f0"))
    t.join(timeout=5)
    assert visto == ["f0"]
