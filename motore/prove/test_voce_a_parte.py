import json

import numpy as np
import pytest

from motore.archivio import valida
from motore.errori import Errore
from motore.media import info
from motore.prepara import prepara_piano
from motore.risolvi import risolvi

from .aiuti import audio, energia_a, fotogramma, monta_con_animazioni, vicino
from .conftest import GIORNO, PAROLE_PAROLE, _collega, _ffmpeg

ROSSO, VERDE, BLU, GIALLO, ARANCIO = (255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 0), (255, 140, 0)
# Il girato muto cambia colore ogni due secondi: dal colore si legge a che secondo della ripresa è il fotogramma.
COLORI = [("red", ROSSO), ("0x00FF00", VERDE), ("blue", BLU), ("yellow", GIALLO)]


@pytest.fixture
def memo_e_muto(archivio, fonti):
    """Una voce registrata a parte (solo audio, «ciao a tutti … buona sera») e un girato muto di otto secondi, nell'archivio di prova."""
    memo, muto = f"{GIORNO}/memo.m4a", f"{GIORNO}/muto.mp4"
    archivio.grezzo(memo).parent.mkdir(parents=True, exist_ok=True)
    _ffmpeg("-i", fonti / "parole.mp4", "-vn", "-c:a", "aac", "-b:a", "128k", archivio.grezzo(memo))
    colori = ",".join(f"drawbox=x=0:y=0:w=iw:h=ih:color={c}:t=fill:enable='between(t,{2 * n},{2 * n + 2})'" for n, (c, _) in enumerate(COLORI))
    _ffmpeg("-f", "lavfi", "-i", f"color=c=black:s=1080x1920:r=30:d=8,{colori}", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "12", "-g", "10", archivio.grezzo(muto))
    cartella = archivio.preparati(memo)
    cartella.mkdir(parents=True, exist_ok=True)
    (cartella / "parole.json").write_text(json.dumps(PAROLE_PAROLE), encoding="utf-8")
    _collega(fonti / "parole.onda.bin", cartella / "onda.bin")
    return memo, muto


def scritta_bianca(f):
    """Quanti pixel quasi bianchi ci sono nella fascia dei sottotitoli: il girato di prova non ne ha."""
    return int((f[1200:1440] > 220).all(axis=2).sum())


def test_una_voce_registrata_a_parte_si_monta_sopra_un_girato_muto_che_scorre(archivio, scrivi_piano, memo_e_muto, finto, tmp_path):
    memo, muto = memo_e_muto
    assert not info(archivio.grezzo(memo))["ha_video"] and not info(archivio.grezzo(muto))["ha_audio"]
    scrivi_piano("mac", {"quadro": "girato-pieno", "sorgenti": {"voce": {"file": memo}, "muto": {"file": muto}}, "sottotitoli": {"modo": "parola per parola"}, "scene": [
        {"nome": "uno", "pezzi": [{"sorgente": "voce", "minuto": "00:00", "dice": "ciao a tutti", "girato": {"sorgente": "muto", "da": 3.0}}]},
        {"nome": "due", "pezzi": [{"sorgente": "voce", "minuto": "00:00", "dice": "buona sera", "girato": {"sorgente": "muto", "da": 0.0, "a": 8.0}}]}]})
    file, montato = monta_con_animazioni(archivio, "mac", tmp_path)
    r = json.loads((archivio.lavoro("mac") / "risolto.json").read_text(encoding="utf-8"))
    uno, due = r["scene"]

    # Lungo quanto la voce, non quanto il girato.
    assert abs(montato["durata"] - r["durata"]) < 0.1 and r["durata"] < 3.5
    # Il girato scorre: la prima scena parte a 3 s del muto (verde) e passa i 4 s (blu); la seconda corre tutti gli otto secondi nella sua durata.
    assert vicino(fotogramma(file, 0.1)[300, 540], VERDE)
    assert vicino(fotogramma(file, uno["durata"] - 0.1)[300, 540], BLU)
    assert vicino(fotogramma(file, due["inizio"] + 0.05)[300, 540], ROSSO)
    assert vicino(fotogramma(file, due["inizio"] + due["durata"] - 0.1)[300, 540], GIALLO)
    # La voce c'è, e ogni parola del sottotitolo compare mentre la voce la dice: il cartello cresce di parola in parola.
    assert [w["p"] for w in r["parole"]] == ["ciao", "a", "tutti", "buona", "sera"]
    scritte = []
    for w in r["parole"]:
        mezzo = (w["da"] + w["a"]) / 2
        x = audio(file, mezzo - 0.1, 0.2)
        assert energia_a(x, 440) > 10 * energia_a(x, 1000), w
        scritte.append(scritta_bianca(fotogramma(file, mezzo)))
    assert 0 < scritte[0] < scritte[1] < scritte[2] and 0 < scritte[3] < scritte[4], scritte


def test_una_voce_registrata_a_parte_si_monta_sopra_la_sola_animazione(archivio, scrivi_piano, memo_e_muto, tmp_path):
    memo, _ = memo_e_muto
    scrivi_piano("an", {"quadro": "solo-animazione", "sorgenti": {"voce": {"file": memo}}, "sottotitoli": {"modo": "nessuno"},
                        "scene": [{"nome": "s", "animazione": "uno", "pezzi": [{"sorgente": "voce", "da": 0.8, "a": 2.8}]}]})
    file, montato = monta_con_animazioni(archivio, "an", tmp_path)
    assert vicino(fotogramma(file, 0.3)[960, 540], ARANCIO)
    x = audio(file, 0.1, montato["durata"] - 0.2)
    assert energia_a(x, 440) > 10 * energia_a(x, 1000)


def test_un_girato_che_scorre_oltre_la_ripresa_e_un_errore(archivio, scrivi_piano, memo_e_muto, finto):
    memo, muto = memo_e_muto
    scrivi_piano("oltre", {"quadro": "girato-pieno", "sorgenti": {"voce": {"file": memo}, "muto": {"file": muto}}, "sottotitoli": {"modo": "nessuno"},
                           "scene": [{"nome": "s", "pezzi": [{"sorgente": "voce", "minuto": "00:00", "dice": "ciao a tutti", "girato": {"sorgente": "muto", "da": 7.5}}]}]})
    with pytest.raises(Errore, match="oltre la fine"):
        risolvi(archivio, "oltre")


@pytest.fixture
def tono(archivio):
    """Un suono di mezzo secondo a 1000 Hz nei materiali del video «film»."""
    file = archivio.radice / "video" / "film" / "materiali" / "tono.wav"
    file.parent.mkdir(parents=True, exist_ok=True)
    _ffmpeg("-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=48000:duration=0.5", file)
    return file


def test_un_video_senza_girato_ne_voce_e_fatto_di_animazioni_e_suoni(archivio, scrivi_piano, tono, tmp_path):
    scrivi_piano("film", {"quadro": "solo-animazione", "sorgenti": {}, "scene": [
        {"nome": "a", "animazione": "a1", "pezzi": [{"durata": 1.5}]},
        {"nome": "b", "animazione": "b1", "pezzi": [{"durata": 1.0}]}],
        "suoni": [{"file": "tono.wav", "scena": "b", "t": 0.2, "picco": -6}]})
    file, montato = monta_con_animazioni(archivio, "film", tmp_path)
    r = json.loads((archivio.lavoro("film") / "risolto.json").read_text(encoding="utf-8"))
    assert [t["sorgente"] for t in r["tratti"]] == [None, None] and r["parole"] == [] and r["battute"] == []
    assert abs(montato["durata"] - 2.5) < 0.1 and montato["ha_audio"]
    assert vicino(fotogramma(file, 0.5)[960, 540], ARANCIO) and vicino(fotogramma(file, 2.2)[960, 540], ARANCIO)
    # Nessuna voce: prima del suono il video tace; il suono parte 0,2 s dopo l'inizio della scena «b».
    assert np.abs(audio(file, 0.0, 1.6)).max() < 0.01
    x = audio(file, 1.75, 0.4)
    assert energia_a(x, 1000) > 10 * energia_a(x, 440) and np.abs(x).max() > 0.2


def test_un_pezzo_senza_voce_vuole_un_quadro_di_sola_animazione(archivio, scrivi_piano):
    scrivi_piano("g", {"quadro": "girato-pieno", "sorgenti": {}, "scene": [{"nome": "a", "pezzi": [{"durata": 1.5}]}]})
    with pytest.raises(Errore, match="senza voce"):
        risolvi(archivio, "g")


def test_un_pezzo_con_sorgente_e_durata_insieme_si_dice_in_italiano(archivio, scrivi_piano):
    scrivi_piano("g", {"quadro": "solo-animazione", "sorgenti": {}, "scene": [{"nome": "a", "animazione": "a1", "pezzi": [{"sorgente": "x", "durata": 1.5}]}]})
    with pytest.raises(Errore, match=r"scene\[0\]\.pezzi\[0\]: va scritto in una sola delle sue forme \(docs/PIANO\.md\), e ha durata, sorgente"):
        risolvi(archivio, "g")


def test_prepara_un_video_senza_sorgenti_non_ha_niente_da_fare(archivio, scrivi_piano):
    scrivi_piano("film", {"quadro": "solo-animazione", "sorgenti": {}, "scene": [{"nome": "a", "animazione": "a1", "pezzi": [{"durata": 1.5}]}]})
    prepara_piano(archivio, "film", avanza=lambda *_: None)


def test_valida_conosce_i_pezzi_senza_voce_i_suoni_di_una_scena_e_il_girato_che_scorre(archivio, scrivi_piano, tono, memo_e_muto):
    memo, muto = memo_e_muto
    film = {"quadro": "solo-animazione", "sorgenti": {}, "scene": [{"nome": "a", "animazione": "a1", "pezzi": [{"durata": 1.5}]}],
            "suoni": [{"file": "tono.wav", "scena": "a", "t": 0.2, "picco": -6}]}
    scrivi_piano("film", film)
    assert valida(archivio, "film", controlla_animazioni=False) == ([], [])
    scrivi_piano("film", {**film, "quadro": "girato-pieno", "suoni": [{"file": "tono.wav", "scena": "b", "t": 0, "picco": -6}]})
    errori, _ = valida(archivio, "film", controlla_animazioni=False)
    assert any("senza voce" in e for e in errori) and any("«b»" in e for e in errori), errori
    scrivi_piano("mac", {"quadro": "girato-pieno", "sorgenti": {"voce": {"file": memo}, "muto": {"file": muto}},
                         "scene": [{"nome": "s", "pezzi": [{"sorgente": "voce", "da": 0.6, "a": 2.4, "girato": {"sorgente": "muto", "da": 3.0, "a": 2.0}}]}]})
    errori, _ = valida(archivio, "mac", controlla_animazioni=False)
    assert errori == ["la scena «s», pezzo 1: il girato va da 3.0 a 2.0 s di «muto»: `a` dev'essere dopo `da`"]


def test_un_pezzo_senza_voce_mostra_muto_il_suo_girato(archivio, scrivi_piano, memo_e_muto, tmp_path):
    """Il primo montaggio di una ripresa muta, con la voce da registrare dopo: due secondi a velocità vera, poi sei secondi stretti in uno."""
    _, muto = memo_e_muto
    scrivi_piano("muto", {"quadro": "girato-pieno", "sorgenti": {"muto": {"file": muto}}, "scene": [
        {"nome": "vero", "pezzi": [{"durata": 1.5, "girato": {"sorgente": "muto", "da": 0.0}}]},
        {"nome": "svelto", "pezzi": [{"durata": 1.0, "girato": {"sorgente": "muto", "da": 2.0, "a": 8.0}, "zoom": {"scala": 1.2, "centro": [0.5, 0.5]}}]}]})
    assert valida(archivio, "muto", controlla_animazioni=False) == ([], [])
    r = risolvi(archivio, "muto")
    assert [t["sorgente"] for t in r["tratti"]] == [None, None] and r["parole"] == [] and r["battute"] == []
    assert [t["girato"] for t in r["tratti"]] == [{"sorgente": "muto", "da": 0.0, "passo": 1.0}, {"sorgente": "muto", "da": 2.0, "passo": 6.0}]
    assert r["tratti"][1]["zoom"] == {"scala": 1.2, "centro": [0.5, 0.5]} and abs(r["durata"] - 2.5) < 1e-6

    file, montato = monta_con_animazioni(archivio, "muto", tmp_path)
    assert abs(montato["durata"] - 2.5) < 0.1
    # Il primo pezzo corre a velocità vera (rosso fino ai 2 s del muto); il secondo passa in un secondo dal verde dei 2 s al giallo dei 6.
    assert vicino(fotogramma(file, 0.2)[300, 540], ROSSO) and vicino(fotogramma(file, 1.3)[300, 540], ROSSO)
    assert vicino(fotogramma(file, 1.55)[300, 540], VERDE)
    assert vicino(fotogramma(file, 2.4)[300, 540], GIALLO)
    # Niente voce e niente sottotitoli: il video tace.
    assert np.abs(audio(file)).max() < 0.01
    assert scritta_bianca(fotogramma(file, 0.8)) == 0


def test_un_pezzo_senza_voce_col_girato_si_scrive_solo_nelle_sue_forme(archivio, scrivi_piano, memo_e_muto):
    memo, muto = memo_e_muto
    sorgenti = {"voce": {"file": memo}, "muto": {"file": muto}}

    def piano(quadro, pezzo, **scena):
        scrivi_piano("forme", {"quadro": quadro, "sorgenti": sorgenti, "scene": [{"nome": "s", "pezzi": [pezzo], **scena}]})
        return valida(archivio, "forme", controlla_animazioni=False)[0]

    girato = {"sorgente": "muto", "fermo": 3.0}
    assert piano("girato-pieno", {"durata": 2, "girato": girato, "evidenzia": [0, 0, 100, 100]}) == []
    # Zoom, vista ed evidenzia vanno su ciò che si vede: senza `girato` un pezzo senza voce non li ha.
    errori = piano("solo-animazione", {"durata": 2, "zoom": {"scala": 1.2}}, animazione="a1")
    assert len(errori) == 1 and errori[0].endswith("scene[0].pezzi[0]: va scritto in una sola delle sue forme (docs/PIANO.md), e ha durata, zoom"), errori
    for di_troppo in ({"dice": "ciao"}, {"da": 1.0}, {"sagoma": {"sorgente": "voce", "scarto": 0}}, {"sorgente": "voce"}):
        errori = piano("girato-pieno", {"durata": 2, "girato": girato, **di_troppo})
        assert len(errori) == 1 and "una sola delle sue forme" in errori[0], (di_troppo, errori)
    # Senza voce non c'è la sagoma di chi parla, e un girato che il quadro non mostra non si vedrebbe.
    errori = piano("girato-e-sagoma", {"durata": 2, "girato": girato})
    assert errori == ["la scena «s», pezzo 1: un pezzo senza voce (`durata`) non ha la ripresa di chi parla, e il quadro «girato-e-sagoma» mostra la sagoma: "
                      "scegli un quadro senza sagoma (come girato-pieno)"], errori
    with pytest.raises(Errore, match="mostra la sagoma"):
        risolvi(archivio, "forme")
    errori = piano("solo-animazione", {"durata": 2, "girato": girato}, animazione="a1")
    assert any("non mostra un girato" in e for e in errori), errori
    assert piano("girato-pieno", {"durata": 2, "girato": {"sorgente": "altro", "da": 0}}) == [
        "la scena «s», pezzo 1 prende il girato da «altro», che il piano non dichiara fra le `sorgenti`"]
    # Un girato che corre oltre la fine della ripresa si ferma come nei pezzi con la voce: qui 6 s da 3 s di una ripresa di 8.
    piano("girato-pieno", {"durata": 6, "girato": {"sorgente": "muto", "da": 3.0}})
    with pytest.raises(Errore, match="oltre la fine"):
        risolvi(archivio, "forme")
