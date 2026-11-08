import json

import pytest
from PIL import Image

from motore.__main__ import main
from motore.archivio import REPO, Archivio
from motore.carosello import carosello, nuovo
from motore.errori import Errore

SLUG = "giro"
STILE = json.loads((REPO / "stile.json").read_text(encoding="utf-8"))
C = STILE["carosello"]
# Tre slide: la prima a posto, la seconda con un testo che entra nel lato destro e uno nella zona della didascalia, la terza con
# un'immagine che non c'è. Lo sticker della prima scende apposta nella zona della didascalia: le immagini non contano.
HTML = f"""<!doctype html><html><head><meta charset="utf-8"><style>
body {{ margin: 0; background: #111; }}
.slide {{ position: relative; width: {C["largo"]}px; height: {C["alto"]}px; overflow: hidden; background: #123; color: #fff; font: 60px sans-serif; }}
.slide div {{ position: absolute; }}
.pieno {{ left: 0; top: 200px; width: {C["largo"]}px; height: 700px; background: #456; }}
</style></head><body>
<section class="slide"><div class="pieno"></div><div style="left:100px; top:400px">Una slide a posto</div>
  <img src="sticker.png" style="position:absolute; left:100px; top:{C["alto"] - 300}px; width:200px; height:400px"></section>
<section class="slide"><div class="pieno"></div><div style="left:600px; top:400px; width:{C["largo"] - 600}px">nel lato destro</div>
  <div style="left:100px; top:{C["alto"] - C["didascalia"] + 20}px">sulla didascalia</div></section>
<section class="slide"><div class="pieno"></div><div style="left:100px; top:400px">manca la foto</div><img src="non-c-e.png" style="position:absolute; left:100px; top:600px; width:100px"></section>
</body></html>"""


# I controlli sul testo e sulla slide. Ogni slide ha un blocco pieno, tranne la 4 e la 5.
# 1: due testi troppo piccoli (uno in HTML, uno in un disegno rimpicciolito) e uno grande quanto il minimo, che va bene.
# 2: tre testi tagliati (contenitore stretto, bordo della slide, fuori dal disegno) e uno che nel suo contenitore ci sta.
# 3: due testi uno sull'altro, e due righe vicine che non si toccano.
# 4: quasi vuota. 5: tutta di un colore.
CONTROLLI = f"""<!doctype html><html><head><meta charset="utf-8"><style>
body {{ margin: 0; }}
.slide {{ position: relative; width: {C["largo"]}px; height: {C["alto"]}px; overflow: hidden; background: #123; color: #fff; font: 60px/1.2 sans-serif; }}
.slide div {{ position: absolute; white-space: nowrap; }}
.pieno {{ left: 0; top: 0; width: {C["largo"]}px; height: 900px; background: #456; }}
.stretto {{ left: 100px; width: 300px; overflow: hidden; }}
</style></head><body>
<section class="slide"><div class="pieno"></div>
  <div style="left:100px; top:300px; font-size:{C["testo_minimo"] - 6}px">troppo piccolo</div>
  <div style="left:100px; top:400px; font-size:{C["testo_minimo"]}px">grande quanto il minimo</div>
  <svg style="position:absolute; left:100px; top:500px" viewBox="0 0 600 100" width="150" height="25"><text x="0" y="80" font-size="80" fill="#fff">nel disegno piccolo</text></svg></section>
<section class="slide"><div class="pieno"></div>
  <div class="stretto" style="top:300px">una frase troppo lunga per il suo riquadro</div>
  <div class="stretto" style="top:400px">ci sta</div>
  <div style="left:560px; top:500px">esce dalla slide ma dal lato</div>
  <svg style="position:absolute; left:100px; top:600px" viewBox="0 0 400 100" width="400" height="100"><text x="300" y="80" font-size="60" fill="#fff">fuori dal disegno</text></svg></section>
<section class="slide"><div class="pieno"></div>
  <div style="left:100px; top:300px">una frase</div><div style="left:130px; top:320px">un'altra frase</div>
  <div style="left:100px; top:500px; line-height:1">due righe vicine<br>come un titolo</div></section>
<section class="slide"><div style="left:100px; top:800px">quasi vuota</div></section>
<section class="slide"></section>
</body></html>"""


def _video(radice, html=HTML, formato="carosello"):
    archivio = Archivio(radice=radice)
    cartella = radice / "video" / SLUG
    (cartella / "materiali").mkdir(parents=True)
    (cartella / "scheda.json").write_text(json.dumps({"titolo": "Un giro", "stato": "proposta", "creato": "2026-11-02", "formato": formato}), encoding="utf-8")
    (cartella / "materiali" / "carosello.html").write_text(html, encoding="utf-8")
    Image.new("RGBA", (20, 40), (255, 255, 255, 255)).save(cartella / "materiali" / "sticker.png")
    return archivio, cartella


@pytest.fixture(scope="module")
def reso(tmp_path_factory):
    archivio, cartella = _video(tmp_path_factory.mktemp("archivio"))
    (cartella / "uscite").mkdir()
    Image.new("RGB", (10, 10)).save(cartella / "uscite" / "slide-7.png")
    return cartella, carosello(archivio, SLUG)


def test_ogni_slide_diventa_un_png_grande_quanto_il_telefono_e_le_vecchie_in_piu_si_tolgono(reso):
    cartella, _ = reso
    uscite = sorted(p.name for p in (cartella / "uscite").glob("slide-*.png"))
    assert uscite == ["slide-1.png", "slide-2.png", "slide-3.png"]
    assert Image.open(cartella / "uscite" / "slide-1.png").size == (C["largo"], C["alto"])
    assert Image.open(cartella / "uscite" / "slide-1.png").convert("RGB").getpixel((50, 50)) == (0x11, 0x22, 0x33)


def test_dice_il_testo_nei_lati_o_nella_didascalia_e_le_immagini_che_non_ci_sono(reso):
    _, avvisi = reso
    assert [(a["slide"], a["cosa"]) for a in avvisi] == [(2, "lato destro"), (2, "didascalia"), (3, "immagine")]
    assert avvisi[0]["testo"] == "nel lato destro"
    assert avvisi[2]["testo"] == "non-c-e.png"


def test_si_rifiuta_se_non_e_un_carosello_o_manca_la_pagina(tmp_path):
    archivio, _ = _video(tmp_path / "a", formato="video")
    with pytest.raises(Errore, match="formato"):
        carosello(archivio, SLUG)
    archivio, cartella = _video(tmp_path / "b")
    (cartella / "materiali" / "carosello.html").unlink()
    with pytest.raises(Errore, match="carosello.html"):
        carosello(archivio, SLUG)


def test_senza_slide_nella_pagina_e_un_errore(tmp_path):
    archivio, _ = _video(tmp_path, html="<!doctype html><p>niente</p>")
    with pytest.raises(Errore, match="section"):
        carosello(archivio, SLUG)


def test_il_comando_rende_le_slide(tmp_path, monkeypatch, capsys):
    archivio, cartella = _video(tmp_path / "archivio")
    monkeypatch.setenv("MANGO_ANIMATION_LAVORO", str(tmp_path))
    main(["carosello", SLUG])
    assert (cartella / "uscite" / "slide-3.png").exists()
    assert "3 slide in uscite/, avvisi: 3" in capsys.readouterr().out


@pytest.fixture(scope="module")
def controlli(tmp_path_factory):
    archivio, _ = _video(tmp_path_factory.mktemp("controlli"), html=CONTROLLI)
    return carosello(archivio, SLUG)


def _cosa(avvisi, cosa):
    return [a for a in avvisi if a["cosa"] == cosa]


def test_dice_il_testo_troppo_piccolo_anche_dentro_un_disegno_rimpicciolito(controlli):
    piccoli = _cosa(controlli, "piccolo")
    assert [(a["slide"], a["testo"]) for a in piccoli] == [(1, "troppo piccolo"), (1, "nel disegno piccolo")]
    assert [a["dettaglio"] for a in piccoli] == [str(C["testo_minimo"] - 6), "20"]


def test_dice_il_testo_tagliato_dal_riquadro_dalla_slide_o_dal_disegno(controlli):
    assert [(a["slide"], a["testo"]) for a in _cosa(controlli, "tagliato")] == [
        (2, "una frase troppo lunga per il suo riquadro"), (2, "esce dalla slide ma dal lato"), (2, "fuori dal disegno")]
    assert not [a for a in controlli if a["slide"] == 2 and a["cosa"] == "lato destro"]


def test_dice_i_testi_che_si_accavallano_ma_non_le_righe_di_un_titolo(controlli):
    accavallati = _cosa(controlli, "accavallato")
    assert [(a["slide"], a["testo"], a["dettaglio"]) for a in accavallati] == [(3, "una frase", "un'altra frase")]


def test_dice_la_slide_quasi_vuota_e_quella_di_un_solo_colore(controlli):
    assert [(a["slide"], a["cosa"]) for a in _cosa(controlli, "vuota")] == [(4, "vuota"), (5, "vuota")]
    assert _cosa(controlli, "vuota")[1]["dettaglio"] == "0"


def test_non_dice_altro_che_questo(controlli):
    assert [(a["slide"], a["cosa"]) for a in controlli] == [
        (1, "piccolo"), (1, "piccolo"), (2, "tagliato"), (2, "tagliato"), (2, "tagliato"), (3, "accavallato"), (4, "vuota"), (5, "vuota")]


def _base(radice, con_sticker):
    archivio, cartella = _video(radice)
    (cartella / "materiali" / "carosello.html").unlink()
    if con_sticker:
        (archivio.radice / "sticker").mkdir()
        Image.new("RGBA", (960, 869), (255, 255, 255, 255)).save(archivio.radice / "sticker" / "creator.png")
    return archivio, cartella


@pytest.mark.parametrize("con_sticker", [True, False])
def test_la_base_nuova_ha_tre_slide_senza_avvisi_con_o_senza_sticker(tmp_path, con_sticker):
    archivio, cartella = _base(tmp_path, con_sticker)
    nuovo(archivio, SLUG)
    pagina = (cartella / "materiali" / "carosello.html").read_text(encoding="utf-8")
    assert pagina.count('<section class="slide">') == 3
    assert ("creator.png" in pagina) == con_sticker
    assert f"--giallo: {C['colori']['giallo']}" in pagina and "@@" not in pagina
    assert carosello(archivio, SLUG) == []
    assert sorted(p.name for p in (cartella / "uscite").glob("slide-*.png")) == ["slide-1.png", "slide-2.png", "slide-3.png"]


def test_la_base_nuova_non_sovrascrive_e_vuole_un_carosello(tmp_path):
    archivio, cartella = _video(tmp_path / "a")
    with pytest.raises(Errore, match="c'è già"):
        nuovo(archivio, SLUG)
    assert (cartella / "materiali" / "carosello.html").read_text(encoding="utf-8") == HTML
    archivio, _ = _video(tmp_path / "b", formato="video")
    with pytest.raises(Errore, match="formato"):
        nuovo(archivio, SLUG)


def test_il_comando_scrive_la_base(tmp_path, monkeypatch, capsys):
    archivio, cartella = _base(tmp_path / "archivio", False)
    monkeypatch.setenv("MANGO_ANIMATION_LAVORO", str(tmp_path))
    main(["carosello", SLUG, "--nuovo"])
    assert (cartella / "materiali" / "carosello.html").exists()
    assert "materiali/carosello.html" in capsys.readouterr().out


def test_ogni_avviso_dice_cosa_non_va_in_parole(tmp_path, monkeypatch, capsys):
    archivio, _ = _video(tmp_path / "archivio", html=CONTROLLI)
    monkeypatch.setenv("MANGO_ANIMATION_LAVORO", str(tmp_path))
    main(["carosello", SLUG])
    dette = capsys.readouterr().out
    assert f"slide 1: «troppo piccolo» è troppo piccolo per il telefono: {C['testo_minimo'] - 6} px, ne servono almeno {C['testo_minimo']}" in dette
    assert "slide 2: «fuori dal disegno» non si vede intero" in dette
    assert "slide 3: «una frase» e «un'altra frase» si sovrappongono" in dette
    assert "slide 4: quasi vuota: solo il" in dette


def test_gli_avvisi_e_le_righe_escono_nella_lingua_del_lavoro(tmp_path, monkeypatch, capsys):
    archivio, _ = _video(tmp_path / "archivio", html=CONTROLLI)
    monkeypatch.setenv("MANGO_ANIMATION_LAVORO", str(tmp_path))
    monkeypatch.setenv("MANGO_ANIMATION_LINGUA", "en")
    main(["carosello", SLUG])
    dette = capsys.readouterr().out
    assert f"warning: slide 1: «troppo piccolo» is too small for the phone: {C['testo_minimo'] - 6} px, at least {C['testo_minimo']} needed" in dette
    assert "warning: slide 2: «fuori dal disegno» is not fully visible" in dette
    assert "warning: slide 3: «una frase» and «un'altra frase» overlap" in dette
    assert "warning: slide 4: almost empty: only" in dette
    assert "5 slides in uscite/, warnings: 8" in dette
    assert "attenzione" not in dette and "avvisi" not in dette


def test_la_base_nuova_dice_in_inglese_cosa_ha_scritto(tmp_path, monkeypatch, capsys):
    _base(tmp_path / "archivio", False)
    monkeypatch.setenv("MANGO_ANIMATION_LAVORO", str(tmp_path))
    monkeypatch.setenv("MANGO_ANIMATION_LINGUA", "en")
    main(["carosello", SLUG, "--nuovo"])
    assert "written materiali/carosello.html with three example slides (without the creator's sticker)" in capsys.readouterr().out
