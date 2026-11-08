import json
import os
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from motore.__main__ import main
from motore.errori import Errore
from motore.media import info
from unittest import mock

from motore.monta import anteprima, anteprima_foto, monta
from motore.risolvi import risolvi

from .aiuti import fotogramma, monta_con_animazioni
from .conftest import PAROLE_TEMPO


def _piano(file, fine_seconda=7.0):
    return {"quadro": "girato-pieno", "sorgenti": {"t": {"file": file}},
            "scene": [{"nome": "uno", "pezzi": [{"sorgente": "t", "da": 0.6, "a": 2.5}]},
                      {"nome": "due", "pezzi": [{"sorgente": "t", "da": 3.5, "a": fine_seconda}]}],
            "sottotitoli": {"modo": "parola per parola"}, "titolo": {"testo": "Un titolo", "da": 0, "a": 1}}


def test_l_anteprima_di_una_scena_e_quel_pezzo_del_montato(archivio, scrivi_piano, prepara_sintetico, tmp_path):
    """Gli stessi fotogrammi del montato agli stessi secondi, sottotitoli compresi; il finale non si tocca."""
    file = prepara_sintetico("tempo", PAROLE_TEMPO, sagoma=False)
    scrivi_piano("ap", _piano(file))
    finale, _ = monta_con_animazioni(archivio, "ap", tmp_path)
    prima = finale.stat().st_mtime_ns
    uscita = anteprima(archivio, "ap", scena="due", avanza=lambda *_: None)
    assert uscita == archivio.uscite("ap") / "anteprima.mp4" and finale.stat().st_mtime_ns == prima
    scena = next(s for s in risolvi(archivio, "ap", scrivi=False)["scene"] if s["nome"] == "due")
    assert info(uscita)["durata"] == pytest.approx(scena["durata"], abs=0.07)
    for t in (0.2, 1.0, scena["durata"] - 0.3):
        differenza = np.abs(fotogramma(uscita, t) - fotogramma(finale, scena["inizio"] + t)).mean()
        assert differenza < 4, f"a {t} s l'anteprima differisce dal montato di {differenza:.1f}"


def test_l_anteprima_fa_i_tratti_che_poi_il_montaggio_usa(archivio, scrivi_piano, prepara_sintetico, tmp_path):
    file = prepara_sintetico("tempo", PAROLE_TEMPO, sagoma=False)
    scrivi_piano("ap", _piano(file))
    monta_con_animazioni(archivio, "ap", tmp_path)
    scrivi_piano("ap", _piano(file, fine_seconda=6.5))
    anteprima(archivio, "ap", scena="due", avanza=lambda *_: None)
    usati = [Path(r.split("'")[1]) for r in (archivio.lavoro("ap") / "anteprima.txt").read_text(encoding="utf-8").splitlines()]
    fatti = {f: f.stat().st_mtime_ns for f in usati}
    monta_con_animazioni(archivio, "ap", tmp_path)
    montati = json.loads((archivio.lavoro("ap") / "montaggio.json").read_text(encoding="utf-8"))["tratti"]
    assert all(f.name in montati and f.stat().st_mtime_ns == fatti[f] for f in usati)


def test_un_pezzo_fuori_dal_video_lo_dice(archivio, scrivi_piano, prepara_sintetico):
    file = prepara_sintetico("tempo", PAROLE_TEMPO, sagoma=False)
    scrivi_piano("ap", _piano(file))
    with pytest.raises(Errore, match="la scena «tre»"):
        anteprima(archivio, "ap", scena="tre", avanza=lambda *_: None)
    with pytest.raises(Errore, match="dura"):
        anteprima(archivio, "ap", da=100, a=110, avanza=lambda *_: None)


def test_accanto_all_anteprima_c_e_il_tratto_del_video_che_copre(archivio, scrivi_piano, prepara_sintetico):
    file = prepara_sintetico("tempo", PAROLE_TEMPO, sagoma=False)
    scrivi_piano("ap", _piano(file))
    uscita = anteprima(archivio, "ap", scena="due", avanza=lambda *_: None)
    scena = next(s for s in risolvi(archivio, "ap", scrivi=False)["scene"] if s["nome"] == "due")
    tratto = json.loads((archivio.uscite("ap") / "anteprima.json").read_text(encoding="utf-8"))
    assert tratto["da"] == pytest.approx(scena["inizio"], abs=0.04)
    assert tratto["a"] - tratto["da"] == pytest.approx(info(uscita)["durata"], abs=0.07)


def test_foto_dell_anteprima_coi_secondi_del_video(archivio, scrivi_piano, prepara_sintetico, tmp_path, monkeypatch, capsys):
    """I secondi chiesti sono quelli del montato: la foto dell'anteprima è lo stesso fotogramma del montato a quel secondo."""
    monkeypatch.setenv("MANGO_ANIMATION_LAVORO", str(archivio.radice.parent))

    def cli(*argomenti):
        codice = main(list(argomenti))
        fuori = capsys.readouterr()
        return codice, fuori.out, fuori.err

    file = prepara_sintetico("tempo", PAROLE_TEMPO, sagoma=False)
    scrivi_piano("ap", _piano(file))
    codice, _, errori = cli("foto", "ap", "3", "--anteprima")
    assert codice == 1 and "non c'è un'anteprima" in errori and "python -m motore anteprima ap" in errori
    monta_con_animazioni(archivio, "ap", tmp_path)
    anteprima(archivio, "ap", scena="due", avanza=lambda *_: None)
    tratto = json.loads((archivio.uscite("ap") / "anteprima.json").read_text(encoding="utf-8"))
    secondo = round(tratto["da"] + 1.0, 2)

    codice, fuori, errori = cli("foto", "ap", str(secondo), "--anteprima")
    assert codice == 0, errori
    dall_anteprima = Path(fuori.strip())
    assert dall_anteprima == archivio.lavoro("ap") / "foto" / f"anteprima-{secondo:g}.jpg"
    codice, fuori, _ = cli("foto", "ap", str(secondo))
    dal_montato = Path(fuori.strip())
    assert codice == 0 and dal_montato != dall_anteprima
    differenza = np.abs(np.asarray(Image.open(dall_anteprima), dtype=int) - np.asarray(Image.open(dal_montato), dtype=int)).mean()
    assert differenza < 4, f"la foto dell'anteprima differisce dal montato di {differenza:.1f}"

    for fuori_tratto in (round(tratto["da"] - 0.5, 2), round(tratto["a"] + 0.5, 2)):
        codice, fuori, errori = cli("foto", "ap", str(fuori_tratto), "--anteprima")
        assert codice == 1 and fuori == ""
        assert f"l'anteprima copre il video da {tratto['da']:.1f} a {tratto['a']:.1f} s" in errori and f"secondo {fuori_tratto:g} " in errori


def test_un_anteprima_senza_il_suo_tratto_non_si_fotografa(archivio, scrivi_piano, prepara_sintetico, monkeypatch, capsys):
    """Senza `anteprima.json`, o con uno più vecchio del video (l'anteprima rifatta e il tratto no), i secondi non si sanno tradurre."""
    monkeypatch.setenv("MANGO_ANIMATION_LAVORO", str(archivio.radice.parent))
    file = prepara_sintetico("tempo", PAROLE_TEMPO, sagoma=False)
    scrivi_piano("ap", _piano(file))
    video = anteprima(archivio, "ap", scena="due", avanza=lambda *_: None)
    tratto = archivio.uscite("ap") / "anteprima.json"
    adesso = tratto.stat().st_mtime
    os.utime(video, (adesso + 10, adesso + 10))
    assert main(["foto", "ap", "4", "--anteprima"]) == 1
    assert "rifai l'anteprima" in capsys.readouterr().err
    tratto.unlink()
    assert main(["foto", "ap", "4", "--anteprima"]) == 1
    assert "rifai l'anteprima" in capsys.readouterr().err


def _piano_con_scena(file):
    return {"quadro": "sagoma-su-animazione", "sorgenti": {"t": {"file": file}}, "sottotitoli": {"modo": "parola per parola"}, "titolo": {"testo": "Un titolo", "da": 0, "a": 1},
            "scene": [{"nome": "uno", "animazione": "uno", "ancore": [["t", 1.0, 0.5]], "pezzi": [{"sorgente": "t", "da": 0.6, "a": 2.5}]}, {"nome": "due", "quadro": "girato-pieno", "pezzi": [{"sorgente": "t", "da": 3.5, "a": 4.6}]}]}


def test_il_fotogramma_composto_e_quello_del_montato_senza_rendere_la_scena_intera(archivio, scrivi_piano, prepara_sintetico, tmp_path, monkeypatch):
    """Il fotogramma si compone dal quadro, dalla sagoma, dai sottotitoli e dal titolo, con il solo fotogramma della scena (un'immagine), senza scrivere un tratto né una scena."""
    from motore import animazioni

    from .aiuti import finge_bun, rendi_animazioni

    file = prepara_sintetico("tempo", PAROLE_TEMPO)
    scrivi_piano("fc", _piano_con_scena(file))
    chiesti = []

    def finto(comando, **k):
        chiesti.append(comando)
        tempi = json.loads(Path(comando[comando.index("--tempi") + 1]).read_text(encoding="utf-8"))
        for sigla in tempi:
            Image.new("RGB", (1080, 1920), (255, 140, 0)).save(Path(comando[comando.index("--uscita") + 1]) / f"{sigla}.foto.png")
        return type("R", (), {"returncode": 0, "stdout": "animazioni: fotogrammi 1\n", "stderr": ""})()

    finge_bun(monkeypatch, finto)
    composto = anteprima_foto(archivio, "fc", 0.8, avanza=lambda *_: None)
    assert composto == archivio.lavoro("fc") / "foto" / "composta-0.8.jpg"
    assert not (archivio.lavoro("fc") / "tratti").exists() and not (archivio.lavoro("fc") / "scene").exists() and not (archivio.uscite("fc") / "finale.mp4").exists()
    [comando] = chiesti
    scena = risolvi(archivio, "fc", scrivi=False)["scene"][0]
    assert float(comando[comando.index("--foto") + 1]) == pytest.approx(0.8 - scena["inizio"], abs=1e-3)
    rendi_animazioni(archivio, "fc", tmp_path)
    with mock.patch.object(animazioni, "rendi"):
        finale = monta(archivio, "fc", avanza=lambda *_: None)
    montato = fotogramma(finale, 0.8)
    assert np.abs(np.asarray(Image.open(composto)).astype(int) - montato).mean() < 4
    with pytest.raises(Errore, match="il secondo 99 non c'è"):
        anteprima_foto(archivio, "fc", 99, avanza=lambda *_: None)
    monkeypatch.setenv("MANGO_ANIMATION_LAVORO", str(archivio.radice.parent))
    assert main(["anteprima", "fc", "--foto", "2.4"]) == 0 and (archivio.lavoro("fc") / "foto" / "composta-2.4.jpg").exists()


def test_la_scena_trasparente_non_ha_un_fotogramma_solo_e_lo_dice(archivio, scrivi_piano, prepara_sintetico, monkeypatch):
    from .aiuti import finge_bun

    file = prepara_sintetico("tempo", PAROLE_TEMPO)
    scrivi_piano("ft", _piano_con_scena(file))
    finge_bun(monkeypatch, lambda comando, **k: type("R", (), {"returncode": 1, "stdout": "", "stderr": "La scena «uno» è trasparente: il suo fotogramma ha bisogno della maschera"})())
    with pytest.raises(Errore, match="è trasparente"):
        anteprima_foto(archivio, "ft", 0.8, avanza=lambda *_: None)
