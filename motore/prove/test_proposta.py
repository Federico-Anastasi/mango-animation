import json

import pytest
from PIL import Image, ImageChops

from motore.__main__ import main
from motore.errori import Errore
from motore.proposta import anteprima_proposta

SLUG = "basilico"
RIGA = "Cosa cambia nell'orto quando arriva il primo caldo"


@pytest.fixture
def con_scheda(archivio):
    def _scrivi(titolo="Come si pota il basilico", slug=SLUG):
        cartella = archivio.radice / "video" / slug
        cartella.mkdir(parents=True)
        (cartella / "scheda.json").write_text(json.dumps({"titolo": titolo, "stato": "proposta", "creato": "2026-11-03"}), encoding="utf-8")
        return cartella

    return _scrivi


def _inchiostro(immagine, fondo):
    """Il riquadro di ciò che non è del colore del fondo."""
    diverso = Image.new("RGB", immagine.size, fondo)
    return ImageChops.difference(immagine.convert("RGB"), diverso).getbbox()


def test_scrive_materiali_anteprima_con_le_misure_dello_stile(archivio, con_scheda):
    cartella = con_scheda()
    anteprima_proposta(archivio, SLUG, RIGA, avanza=lambda *_: None)
    file = cartella / "materiali" / "anteprima.png"
    a = archivio.stile["anteprima"]
    immagine = Image.open(file)
    assert immagine.size == (a["largo"], a["alto"])
    assert immagine.convert("RGB").getpixel((0, 0)) == archivio.colore(a["fondo"])
    assert sorted(p.name for p in file.parent.iterdir()) == ["anteprima.png"]


def test_il_titolo_e_la_riga_stanno_dentro_i_margini_e_in_tre_colori(archivio, con_scheda):
    con_scheda()
    anteprima_proposta(archivio, SLUG, RIGA, avanza=lambda *_: None)
    a = archivio.stile["anteprima"]
    immagine = Image.open(archivio.video(SLUG) / "materiali" / "anteprima.png").convert("RGB")
    sinistra, alto, destra, basso = _inchiostro(immagine, archivio.colore(a["fondo"]))
    assert sinistra >= a["margine"] and destra <= a["largo"] - a["margine"]
    assert alto >= a["margine"] and basso <= a["alto"] - a["margine"]
    colori = {c for _, c in immagine.getcolors(maxcolors=100000)}
    for nome in (a["filo"]["colore"], a["titolo"]["colore"], a["riga"]["colore"]):
        assert archivio.colore(nome) in colori


def test_senza_riga_c_e_solo_il_titolo(archivio, con_scheda):
    con_scheda()
    a = archivio.stile["anteprima"]
    altezze = []
    for riga in (RIGA, None):
        anteprima_proposta(archivio, SLUG, riga, avanza=lambda *_: None)
        immagine = Image.open(archivio.video(SLUG) / "materiali" / "anteprima.png").convert("RGB")
        _, alto, _, basso = _inchiostro(immagine, archivio.colore(a["fondo"]))
        altezze.append(basso - alto)
    assert altezze[1] < altezze[0] - a["riga"]["corpo"]


def test_un_titolo_lungo_rimpicciolisce_e_sta_dentro(archivio, con_scheda):
    con_scheda("Come ho fatto girare un modello da ottanta miliardi di parametri su una scheda sola")
    anteprima_proposta(archivio, SLUG, RIGA, avanza=lambda *_: None)
    a = archivio.stile["anteprima"]
    immagine = Image.open(archivio.video(SLUG) / "materiali" / "anteprima.png").convert("RGB")
    sinistra, alto, destra, basso = _inchiostro(immagine, archivio.colore(a["fondo"]))
    assert sinistra >= a["margine"] and destra <= a["largo"] - a["margine"] and alto >= a["margine"] and basso <= a["alto"] - a["margine"]


def test_un_testo_che_non_ci_sta_e_un_errore_che_dice_cosa_accorciare(archivio, con_scheda):
    con_scheda("Titolo")
    with pytest.raises(Errore, match="accorcia"):
        anteprima_proposta(archivio, SLUG, "parola " * 200, avanza=lambda *_: None)
    assert not (archivio.video(SLUG) / "materiali" / "anteprima.png").exists()


def test_un_video_che_non_c_e_e_un_errore(archivio):
    with pytest.raises(Errore, match="non esiste"):
        anteprima_proposta(archivio, "fantasma", RIGA, avanza=lambda *_: None)


def test_rifatta_sostituisce_quella_di_prima(archivio, con_scheda):
    cartella = con_scheda()
    anteprima_proposta(archivio, SLUG, RIGA, avanza=lambda *_: None)
    prima = (cartella / "materiali" / "anteprima.png").read_bytes()
    anteprima_proposta(archivio, SLUG, "Un'altra riga", avanza=lambda *_: None)
    assert (cartella / "materiali" / "anteprima.png").read_bytes() != prima


def test_il_comando_da_riga_di_comando(archivio, con_scheda, monkeypatch, capsys):
    con_scheda()
    monkeypatch.setenv("MANGO_ANIMATION_LAVORO", str(archivio.radice.parent))
    assert main(["anteprima-proposta", SLUG, "--riga", RIGA]) == 0
    assert (archivio.video(SLUG) / "materiali" / "anteprima.png").is_file()
    assert "anteprima.png" in capsys.readouterr().out
