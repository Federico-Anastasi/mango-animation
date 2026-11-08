import numpy as np
import pytest

from motore import taglio
from motore.errori import Errore
from motore.sorgenti import Sorgente
from motore.voce import PASSO

from .conftest import PAROLE_PAROLE, PAROLE_TEMPO


@pytest.fixture
def tempo(archivio, prepara_sintetico):
    file = prepara_sintetico("tempo", PAROLE_TEMPO)
    return Sorgente(archivio, "v", "t", {"file": file}, {})


@pytest.fixture
def parole(archivio, prepara_sintetico, finto):
    file = prepara_sintetico("parole", PAROLE_PAROLE)
    return Sorgente(archivio, "v", "p", {"file": file}, {})


def vicini(trovati, attesi, tolleranza=0.03):
    assert len(trovati) == len(attesi), trovati
    for (da, a), (e_da, e_a) in zip(trovati, attesi):
        assert da == pytest.approx(e_da, abs=tolleranza) and a == pytest.approx(e_a, abs=tolleranza), (trovati, attesi)


def test_a_tempo_toglie_i_silenzi_lunghi_e_tiene_i_corti(tempo, archivio):
    # La voce va da 0,6 a 2,5, da 3,5 a 4,5 e da 6 a 7 s: i tagli stanno a un margine della voce dentro il silenzio, anche ai bordi.
    m = archivio.stile["voce"]["margine"]
    vicini(taglio.a_tempo(tempo, {}, archivio.stile), [(0.6 - m, 2.5 + m), (3.5 - m, 4.5 + m), (6.0 - m, 7.0 + m)])


def test_a_tempo_via_toglie_un_tratto(tempo, archivio):
    m = archivio.stile["voce"]["margine"]
    vicini(taglio.a_tempo(tempo, {"da": 0.5, "a": 2.4, "via": [[1.0, 1.3]]}, archivio.stile), [(0.6 - m, 1.0), (1.3, 2.4)])


def test_a_tempo_pausa_tiene_i_silenzi_piu_corti(tempo, archivio):
    m = archivio.stile["voce"]["margine"]
    vicini(taglio.a_tempo(tempo, {"pausa": 2.0}, archivio.stile), [(0.6 - m, 7.0 + m)])


def test_a_tempo_da_e_a_nella_voce_sono_quelli_dati(tempo, archivio):
    assert taglio.a_tempo(tempo, {"da": 3.7, "a": 4.2}, archivio.stile) == [(3.7, 4.2)]


def test_a_tempo_ai_bordi_non_resta_silenzio(tempo, archivio):
    """Un `da` o un `a` dato nel silenzio delimita il pezzo, ma il silenzio ai bordi si toglie fino al margine della voce, anche se
    è più corto della pausa: in testa e in coda non si aspetta."""
    m = archivio.stile["voce"]["margine"]
    vicini(taglio.a_tempo(tempo, {"da": 3.0, "a": 4.8}, archivio.stile), [(3.5 - m, 4.5 + m)])


def test_a_tempo_un_a_nel_silenzio_non_lascia_un_frammento_in_coda(tempo, archivio):
    m = archivio.stile["voce"]["margine"]
    vicini(taglio.a_tempo(tempo, {"da": 0.5, "a": 5.5}, archivio.stile), [(0.6 - m, 2.5 + m), (3.5 - m, 4.5 + m)])


def test_a_tempo_un_via_troppo_breve_in_testa_lascia_la_pausa(tempo, archivio):
    m = archivio.stile["voce"]["margine"]
    vicini(taglio.a_tempo(tempo, {"da": 0.5, "a": 1.5, "via": [[0.65, 0.8]]}, archivio.stile), [(0.6 - m, 1.5)])


def test_a_tempo_senza_voce_dice_cosa_fare(archivio, fonti, prepara_sintetico):
    import numpy as np

    file = prepara_sintetico("tempo", PAROLE_TEMPO)
    s = Sorgente(archivio, "v", "t", {"file": file}, {})
    s._db = np.full(800, -100.0, dtype=np.float32)
    with pytest.raises(Errore, match="non c'è voce"):
        taglio.a_tempo(s, {}, archivio.stile)


def trova(sorgente, dice, archivio, minuto="00:00", **resto):
    pezzo = {"minuto": minuto, "dice": dice, **resto}
    ij = sorgente.scegli(minuto, dice)
    veri = sorgente.veri([ij])[0]
    return taglio.a_parole(sorgente, pezzo, ij, veri, archivio.stile)


def test_scegli_trova_le_parole_dette_dal_minuto(parole):
    assert parole.scegli("00:00", "ciao a tutti") == (0, 3)
    assert parole.scegli("00:00", "Sera!") == (4, 5)


def test_scegli_non_spezza_una_parola(parole):
    with pytest.raises(Errore, match="dal minuto 00:00 la trascrizione non dice: ciao a tut"):
        parole.scegli("00:00", "ciao a tut")


def test_scegli_parte_dal_minuto(archivio, prepara_sintetico, finto):
    file = prepara_sintetico("parole", PAROLE_PAROLE)
    doppia = [{"p": "ciao", "da": 1.0, "a": 1.4}, {"p": "ciao", "da": 70.0, "a": 70.4}, {"p": "fine", "da": 71.0, "a": 71.4}]
    s = Sorgente(archivio, "v", "p", {"file": file}, {})
    import json

    (archivio.preparati(file) / "parole.json").write_text(json.dumps(doppia), encoding="utf-8")
    assert s.scegli("01:10", "ciao") == (1, 2)
    with pytest.raises(Errore, match="dal minuto 05:00"):
        s.scegli("05:00", "ciao")


def test_a_parole_taglia_nel_silenzio_accanto_alla_parola(parole, archivio):
    [t] = trova(parole, "ciao a tutti", archivio)
    assert t["da"] == pytest.approx(0.91, abs=1 / 30 + 0.01) and t["da"] + t["durata"] == pytest.approx(2.69, abs=1 / 30 + 0.01)
    assert t["legato"] == [None, None]
    assert round(t["da"] * 30) == pytest.approx(t["da"] * 30) and round(t["durata"] * 30) == pytest.approx(t["durata"] * 30)


def test_a_parole_toglie_il_silenzio_lungo_dentro_il_pezzo(parole, archivio):
    due = trova(parole, "tutti buona sera", archivio)
    assert len(due) == 2
    assert due[0]["da"] + due[0]["durata"] == pytest.approx(2.69, abs=0.06) and due[1]["da"] == pytest.approx(5.91, abs=0.06)


def test_a_parole_rifila_sposta_i_due_bordi(parole, archivio):
    [liscio] = trova(parole, "ciao a tutti", archivio)
    [t] = trova(parole, "ciao a tutti", archivio, rifila=[-0.1, 0.2])
    assert t["da"] == pytest.approx(liscio["da"] - 0.1, abs=0.04)
    assert t["da"] + t["durata"] == pytest.approx(liscio["da"] + liscio["durata"] + 0.2, abs=0.04)
    [t] = trova(parole, "ciao a tutti", archivio, rifila=[0.05, -0.05])
    assert t["da"] > liscio["da"] and t["da"] + t["durata"] < liscio["da"] + liscio["durata"]


def test_a_parole_rifila_che_toglie_tutto_si_dice(parole, archivio):
    with pytest.raises(Errore, match="rifila"):
        trova(parole, "ciao a tutti", archivio, rifila=[1.0, -3.0])


def test_il_bordo_senza_silenzio_cade_dove_il_suono_e_piu_basso_e_lo_dice(archivio):
    db = np.full(100, -10.0)
    db[50] = -25.0
    db[30] = -22.0
    forte = db >= archivio.stile["voce"]["silenzio_db"]
    assert taglio._bordo(db, forte, 20, 60, True, archivio.stile) == (50, -25.0)
    assert taglio._bordo(db, forte, 20, 60, False, archivio.stile) == (31, -22.0)


def test_il_bordo_nel_silenzio_tiene_il_margine_dalla_voce(archivio):
    db = np.full(100, -100.0)
    db[:30] = -10.0
    db[70:] = -10.0
    forte = db >= archivio.stile["voce"]["silenzio_db"]
    margine = round(archivio.stile["voce"]["margine"] / PASSO)
    assert taglio._bordo(db, forte, 10, 90, False, archivio.stile) == (30 + margine, None)
    assert taglio._bordo(db, forte, 10, 90, True, archivio.stile) == (70 - margine, None)


class SempreVoce:
    """Una sorgente dove non c'è mai silenzio: fra le parole si sente un'esitazione."""
    nome, parole = "v", [{"p": p} for p in ("uno", "due", "tre")]

    def livello(self, da, durata):
        return np.full(round(durata / PASSO), -10.0)


def test_a_parole_toglie_l_esitazione_fra_due_parole_anche_senza_silenzio(archivio):
    veri = {0: (1.0, 1.4, 0.9), 1: (2.6, 3.0, 0.9), 2: (3.1, 3.5, 0.9)}
    due = taglio.a_parole(SempreVoce(), {"dice": "uno due tre"}, (0, 3), veri, archivio.stile)
    margine = archivio.stile["voce"]["margine"]
    assert len(due) == 2
    assert due[0]["da"] + due[0]["durata"] == pytest.approx(1.4 + margine, abs=0.05) and due[1]["da"] == pytest.approx(2.6 - margine, abs=0.05)


def test_a_parole_non_taglia_accanto_a_una_parola_trovata_male(archivio):
    veri = {0: (1.0, 1.4, 0.9), 1: (2.6, 3.0, 0.05), 2: (3.1, 3.5, 0.9)}
    assert len(taglio.a_parole(SempreVoce(), {"dice": "uno due tre"}, (0, 3), veri, archivio.stile)) == 1


class Sonora:
    """Una sorgente a tavolino: la voce sta negli intervalli dati (secondi), il resto è silenzio."""
    nome = "v"

    def __init__(self, parole, voce, fine=10.0):
        self.parole = [{"p": p} for p in parole]
        self.db = np.full(round(fine / PASSO), -100.0)
        for da, a in voce:
            self.db[round(da / PASSO):round(a / PASSO)] = -10.0

    def livello(self, da, durata):
        return self.db[round(da / PASSO):round(da / PASSO) + round(durata / PASSO)]


def fine_di(tratti):
    return tratti[-1]["da"] + tratti[-1]["durata"]


def test_la_coda_di_un_numero_incerto_si_stringe_sulla_voce(archivio):
    # «FP16» non si scrive in lettere: l'allineatore lo stende fin dove vuole, qui quasi un secondo oltre la voce.
    s = Sonora(["ciao", "FP16"], [(0.3, 0.7), (1.0, 1.6)])
    veri = {0: (0.3, 0.7, 0.95), 1: (0.7, 2.4, 1.0)}
    [t] = taglio.a_parole(s, {"dice": "ciao FP16"}, (0, 2), veri, archivio.stile)
    margine = archivio.stile["voce"]["margine"]
    assert fine_di([t]) == pytest.approx(1.6 + margine, abs=0.04)
    assert t["legato"] == [None, None]


def test_la_coda_di_una_parola_dal_voto_basso_si_stringe_sulla_voce(archivio):
    s = Sonora(["ciao", "gb"], [(0.3, 0.7), (1.0, 1.6)])
    veri = {0: (0.3, 0.7, 0.95), 1: (1.0, 1.9, 0.0)}
    [t] = taglio.a_parole(s, {"dice": "ciao gb"}, (0, 2), veri, archivio.stile)
    assert fine_di([t]) == pytest.approx(1.6 + archivio.stile["voce"]["margine"], abs=0.04)


def test_la_voce_oltre_la_fine_allineata_non_si_taglia(archivio):
    # Il numero è detto in più parole («sette per cento») e l'allineamento si ferma alla prima.
    s = Sonora(["ciao", "7%."], [(0.3, 0.7), (1.0, 1.9)])
    veri = {0: (0.3, 0.7, 0.95), 1: (1.0, 1.3, 1.0)}
    [t] = taglio.a_parole(s, {"dice": "ciao 7%."}, (0, 2), veri, archivio.stile)
    assert fine_di([t]) == pytest.approx(1.9 + archivio.stile["voce"]["margine"], abs=0.04)


def test_un_vuoto_breve_dentro_il_numero_non_lo_chiude(archivio):
    s = Sonora(["ciao", "0,5"], [(0.3, 0.7), (1.0, 1.3), (1.4, 1.8)])
    veri = {0: (0.3, 0.7, 0.95), 1: (0.75, 2.5, 1.0)}
    [t] = taglio.a_parole(s, {"dice": "ciao 0,5"}, (0, 2), veri, archivio.stile)
    assert fine_di([t]) == pytest.approx(1.8 + archivio.stile["voce"]["margine"], abs=0.04)


def test_la_coda_incerta_non_va_oltre_la_parola_dopo(archivio):
    # Nel parlato continuo la voce non si ferma: il bordo non entra nella parola che segue.
    s = Sonora(["ciao", "gb", "e"], [(0.3, 0.7), (1.0, 3.0)])
    veri = {0: (0.3, 0.7, 0.95), 1: (1.0, 1.4, 0.0), 2: (1.6, 3.0, 0.95)}
    [t] = taglio.a_parole(s, {"dice": "ciao gb"}, (0, 2), veri, archivio.stile)
    assert fine_di([t]) <= 1.6 + 0.05


def test_l_inizio_incerto_si_stringe_sulla_voce(archivio):
    s = Sonora(["7%.", "poi"], [(1.0, 1.6), (1.9, 2.3)])
    veri = {0: (0.2, 1.7, 1.0), 1: (1.9, 2.3, 0.95)}
    [t] = taglio.a_parole(s, {"dice": "7%. poi"}, (0, 2), veri, archivio.stile)
    assert t["da"] == pytest.approx(1.0 - archivio.stile["voce"]["margine"], abs=0.04)


def test_una_parola_sicura_tiene_i_bordi_dell_allineamento(archivio):
    s = Sonora(["ciao", "mondo"], [(0.3, 0.7), (1.0, 1.6)])
    veri = {0: (0.3, 0.7, 0.95), 1: (1.0, 1.6, 0.95)}
    [t] = taglio.a_parole(s, {"dice": "ciao mondo"}, (0, 2), veri, archivio.stile)
    assert fine_di([t]) == pytest.approx(1.6 + archivio.stile["voce"]["margine"], abs=0.04)


def test_una_rifila_dentro_la_voce_lo_dice(archivio):
    s = Sonora(["ciao", "mondo"], [(0.3, 0.7), (1.0, 1.6)])
    veri = {0: (0.3, 0.7, 0.95), 1: (1.0, 1.6, 0.95)}
    [t] = taglio.a_parole(s, {"dice": "ciao mondo", "rifila": [0.0, -0.3]}, (0, 2), veri, archivio.stile)
    assert t["avvisi"][1].startswith("la fine cade nella voce a -10 dB, 0,3 s prima che la voce finisca")
    assert t["avvisi"][1].en.startswith("the end falls in the voice at -10 dB, 0.3 s before the voice ends")
    assert 0 not in t["avvisi"]


def test_una_rifila_dentro_la_voce_all_inizio_lo_dice(archivio):
    s = Sonora(["ciao", "mondo"], [(0.3, 0.7), (1.0, 1.6)])
    veri = {0: (0.3, 0.7, 0.95), 1: (1.0, 1.6, 0.95)}
    [t] = taglio.a_parole(s, {"dice": "ciao mondo", "rifila": [0.3, 0.0]}, (0, 2), veri, archivio.stile)
    assert t["avvisi"][0].startswith("l'inizio cade nella voce a -10 dB, 0,3 s dopo che la voce è cominciata")
    assert t["avvisi"][0].en.startswith("the start falls in the voice at -10 dB, 0.3 s after the voice started")


def test_una_rifila_nel_silenzio_non_dice_niente(archivio):
    s = Sonora(["ciao", "mondo"], [(0.3, 0.7), (1.0, 1.6)])
    veri = {0: (0.3, 0.7, 0.95), 1: (1.0, 1.6, 0.95)}
    [t] = taglio.a_parole(s, {"dice": "ciao mondo", "rifila": [-0.1, 0.1]}, (0, 2), veri, archivio.stile)
    assert t["avvisi"] == {}


def test_una_rifila_all_inizio_dentro_la_voce_lo_dice(archivio):
    s = Sonora(["ciao", "mondo"], [(0.3, 0.7), (1.0, 1.6)])
    veri = {0: (0.3, 0.7, 0.95), 1: (1.0, 1.6, 0.95)}
    [t] = taglio.a_parole(s, {"dice": "ciao mondo", "rifila": [0.25, 0.0]}, (0, 2), veri, archivio.stile)
    assert t["avvisi"][0].startswith("l'inizio cade nella voce a -10 dB, 0,2 s dopo che la voce è cominciata")


def test_un_fruscio_dopo_il_numero_non_ne_allunga_la_coda(archivio):
    s = Sonora(["ciao", "0,5"], [(0.3, 0.7), (1.0, 1.6)])
    s.db[round(1.75 / PASSO):round(1.83 / PASSO)] = -35.0
    veri = {0: (0.3, 0.7, 0.95), 1: (0.75, 2.5, 1.0)}
    [t] = taglio.a_parole(s, {"dice": "ciao 0,5"}, (0, 2), veri, archivio.stile)
    assert fine_di([t]) == pytest.approx(1.6 + archivio.stile["voce"]["margine"], abs=0.04)


def test_una_coda_debole_attaccata_alla_voce_resta(archivio):
    s = Sonora(["ciao", "0,5"], [(0.3, 0.7), (1.0, 1.6)])
    s.db[round(1.63 / PASSO):round(1.71 / PASSO)] = -35.0
    veri = {0: (0.3, 0.7, 0.95), 1: (0.75, 2.5, 1.0)}
    [t] = taglio.a_parole(s, {"dice": "ciao 0,5"}, (0, 2), veri, archivio.stile)
    assert fine_di([t]) == pytest.approx(1.71 + archivio.stile["voce"]["margine"], abs=0.04)


def test_l_inizio_incerto_non_torna_nella_parola_prima(archivio):
    s = Sonora(["ciao", "7%.", "poi"], [(0.3, 0.7), (0.8, 1.4), (1.7, 2.0)])
    veri = {0: (0.3, 0.7, 0.95), 1: (0.75, 1.5, 1.0), 2: (1.7, 2.0, 0.95)}
    [t] = taglio.a_parole(s, {"dice": "7%. poi"}, (1, 3), veri, archivio.stile)
    assert t["da"] >= 0.7 - 0.04


def test_a_tempo_un_a_oltre_la_fine_del_file_si_ferma_alla_fine(tempo, archivio):
    """Un `a` scritto oltre la fine della ripresa non allunga il pezzo: dopo la fine non c'è voce, e la coda si toglie come ogni silenzio."""
    m = archivio.stile["voce"]["margine"]
    fine = len(tempo.voce) / 100
    vicini(taglio.a_tempo(tempo, {"da": 5.5, "a": fine + 0.5}, archivio.stile), [(6.0 - m, 7.0 + m)])


class Muta:
    """Una sorgente a tavolino per il taglio a tempo: la voce sta negli intervalli dati (secondi), il resto è silenzio."""
    nome, sfasa = "v", 0.0
    parole = [{"da": 0.0, "a": 0.2}, {"da": 8.9, "a": 10.0}]

    def __init__(self, voce, fine=10.0):
        self.voce = np.zeros(round(fine * 100), dtype=bool)
        for da, a in voce:
            self.voce[round(da * 100):round(a * 100)] = True


def test_a_tempo_un_silenzio_lungo_dopo_un_frammento_breve_non_resta_intero(archivio):
    """Un frammento più corto del tratto minimo è un inciampo e si lascia la pausa, ma solo quella che serve a non farne un tratto troppo breve:
    il silenzio lungo che lo segue non resta tutto dentro il tratto (otto secondi, in una diretta)."""
    t, m = archivio.stile["taglio"]["a_tempo"], archivio.stile["voce"]["margine"]
    vicini(taglio.a_tempo(Muta([(0.0, 0.2), (8.9, 10.0)]), {"da": 0.0, "a": 10.0}, archivio.stile), [(0.0, t["tratto_minimo"]), (8.9 - m, 10.0)])
