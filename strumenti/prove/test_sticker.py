import json

from PIL import Image, ImageDraw

from strumenti import sticker as s

MISURE = s.misure_dello_sticker()


def persona(capello_sparso=False):
    """Un fotogramma di sagoma finto: testa tonda, spalle fino ai bordi e al fondo, fuori trasparente."""
    im = Image.new("RGBA", (1080, 1920), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse((390, 400, 690, 760), fill=(200, 150, 120, 255))
    d.rectangle((0, 820, 1079, 1919), fill=(20, 20, 20, 255))
    if capello_sparso:
        d.rectangle((300, 300, 302, 302), fill=(60, 40, 30, 255))
    return im


def test_lo_sticker_e_il_busto_con_un_bordo_bianco_pieno_e_fuori_trasparente():
    st = s.sticker(persona(), MISURE)
    alfa = st.getchannel("A")
    assert st.height < 1920, "il busto si taglia sul petto"
    assert alfa.getpixel((0, 0)) == 0
    larghezza, _ = st.size
    centro = larghezza // 2
    cima = next(y for y in range(st.height) if alfa.getpixel((centro, y)) == 255)
    assert st.getpixel((centro, cima + 3))[:3] == (255, 255, 255), "sopra la testa c'è il bordo bianco"
    assert st.getpixel((centro, cima + MISURE["bordo"] + 60))[:3] == (200, 150, 120), "dentro c'è la persona com'era"
    assert set(alfa.get_flattened_data()) <= {0, 255}, "nessun alone: il bordo è pieno o non c'è"


def test_le_misure_dello_sticker_vengono_dallo_stile():
    largo = s.sticker(persona(), {**MISURE, "bordo": 60})
    assert largo.width == s.sticker(persona(), MISURE).width + 60 and largo.height == s.sticker(persona(), MISURE).height + 60
    assert s.sticker(persona(), {**MISURE, "lati": 0.2}).width < s.sticker(persona(), MISURE).width


def test_un_ciuffo_isolato_non_si_porta_dietro_il_bordo():
    pulito, sparso = s.sticker(persona(), MISURE), s.sticker(persona(capello_sparso=True), MISURE)
    assert pulito.size == sparso.size


def test_il_comando_scrive_lo_sticker_e_da_dove_viene(tmp_path):
    destinazione = s.salva(persona(), "dubbio", tmp_path, {"file": "2026-10-20/IMG_5277.MOV", "istante": 15.0})
    assert destinazione == tmp_path / "sticker" / "dubbio.png"
    assert Image.open(destinazione).mode == "RGBA"
    origine = json.loads((tmp_path / "sticker" / "dubbio.json").read_text(encoding="utf-8"))
    assert origine == {"file": "2026-10-20/IMG_5277.MOV", "istante": 15.0}


def test_gli_istanti_dei_provini_stanno_dentro_i_tratti_scontornati_distribuiti_uniformi():
    pezzi = [{"da": 0.0, "a": 10.0}, {"da": 30.0, "a": 40.0}, {"da": 50.0, "a": float("inf")}]
    istanti = s.istanti_da_provare(pezzi, 4)
    assert istanti == [2.5, 7.5, 32.5, 37.5]


def test_i_provini_numerano_ogni_fotogramma_e_dicono_da_dove_viene(tmp_path, monkeypatch):
    for nome in ["2026-10-20/a.MOV", "2026-10-21/b.MOV"]:
        cartella = tmp_path / "preparati" / nome
        cartella.mkdir(parents=True)
        (cartella / "sagoma.webm").write_bytes(b"x")
        (cartella / "sagoma.json").write_text(json.dumps({"pezzi": [{"da": 0.0, "a": 8.0, "file": "sagoma.webm", "inizio": 0.0}]}), encoding="utf-8")
    vecchio = tmp_path / "sticker" / "provini" / "provini-9.jpg"
    vecchio.parent.mkdir(parents=True)
    vecchio.write_bytes(b"x")
    def fotogramma(file, istante, archivio):
        if istante == 7.0:
            raise s.SenzaFotogramma("il webm finisce prima")
        return persona()
    monkeypatch.setattr(s, "fotogramma_della_sagoma", fotogramma)
    fogli = s.provini(tmp_path, per_ripresa=2)
    assert fogli == [tmp_path / "sticker" / "provini" / "provini-1.jpg"]
    assert not vecchio.exists(), "i fogli di un giro prima si tolgono"
    assert Image.open(fogli[0]).mode == "RGB"
    elenco = json.loads((tmp_path / "sticker" / "provini" / "provini.json").read_text(encoding="utf-8"))
    assert elenco == {"1": {"file": "2026-10-20/a.MOV", "istante": 2.0}, "2": {"file": "2026-10-20/a.MOV", "istante": 6.0},
                      "3": {"file": "2026-10-21/b.MOV", "istante": 2.0}, "4": {"file": "2026-10-21/b.MOV", "istante": 6.0}}
    assert s.provini(tmp_path, giorno="2026-10-21", per_ripresa=1) == fogli
    s.provini(tmp_path, giorno="2026-10-21", per_ripresa=4)
    assert [v["istante"] for v in json.loads((tmp_path / "sticker" / "provini" / "provini.json").read_text(encoding="utf-8")).values()] == [1.0, 3.0, 5.0], "un istante che il webm non porta si salta"
    s.provini(tmp_path, giorno="2026-10-21", per_ripresa=1)
    assert json.loads((tmp_path / "sticker" / "provini" / "provini.json").read_text(encoding="utf-8")) == {"1": {"file": "2026-10-21/b.MOV", "istante": 4.0}}
