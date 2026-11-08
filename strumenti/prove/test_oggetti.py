import io
import json
import urllib.error
from urllib.parse import parse_qs, urlparse

import pytest
from PIL import Image

from motore import VERSIONE
from strumenti import oggetti as o

STILE = {**o.stile_degli_oggetti(), "risultati": 3, "colonne": 2, "cella": 120, "attese_429": [1, 2]}


def jpeg(colore=(200, 40, 40), misura=(400, 300)):
    dati = io.BytesIO()
    Image.new("RGB", misura, colore).save(dati, "JPEG")
    return dati.getvalue()


def pagina(indice, titolo, licenza, mime="image/jpeg", autore="<a href='x'>Mario Rossi</a>"):
    return {
        "title": f"File:{titolo}", "index": indice,
        "imageinfo": [{"thumburl": f"https://upload.example/{titolo}.jpg", "descriptionurl": f"https://commons.example/wiki/File:{titolo}", "mime": mime,
                       "extmetadata": {"LicenseShortName": {"value": licenza}, "Artist": {"value": autore}}}],
    }


class Rete:
    """Commons finto: risponde all'API con le pagine date e a ogni altro indirizzo con una foto."""

    def __init__(self, pagine):
        self.pagine, self.richieste = pagine, []

    def __call__(self, url):
        self.richieste.append(url)
        if "api.php" in url:
            return json.dumps({"query": {"pages": {str(i): p for i, p in enumerate(self.pagine)}}}).encode()
        return jpeg()


PAGINE = [
    pagina(3, "terza.jpg", "CC BY-SA 3.0 de"),
    pagina(1, "prima.jpg", "CC BY-SA 4.0"),
    pagina(2, "seconda.jpg", "CC0"),
    pagina(4, "quarta.jpg", "Public domain"),
]


@pytest.fixture
def archivio(tmp_path):
    (tmp_path / "video" / "caro").mkdir(parents=True)
    return tmp_path


def cartella(archivio):
    return archivio / "video" / "caro" / "materiali" / "oggetti"


def finto_scontorno(img):
    fuori = Image.new("RGBA", img.size, (0, 0, 0, 0))
    fuori.paste(Image.new("RGBA", (img.width // 2, img.height // 2), (10, 200, 30, 255)), (img.width // 4, img.height // 4))
    return fuori


def test_si_tengono_solo_le_licenze_libere_nell_ordine_della_ricerca_e_fino_al_numero_chiesto(archivio):
    rete = Rete([
        pagina(5, "nc.jpg", "CC BY-NC 4.0"), pagina(6, "gfdl.jpg", "GFDL"), pagina(7, "fair.jpg", "Fair use"),
        pagina(8, "nd.jpg", "CC BY-ND 2.0"), pagina(9, "vettore.svg", "CC0", mime="image/svg+xml"), *PAGINE,
    ])
    o.cerca(archivio, "caro", "tazza", "tazza di caffè", STILE, rete)
    scelti = json.loads((cartella(archivio) / "provini-tazza.json").read_text(encoding="utf-8"))["risultati"]
    assert [v["file"] for v in scelti.values()] == ["File:prima.jpg", "File:seconda.jpg", "File:terza.jpg"]
    assert list(scelti) == ["1", "2", "3"]
    assert [v["licenza"] for v in scelti.values()] == ["CC BY-SA 4.0", "CC0", "CC BY-SA 3.0 de"]


def test_la_ricerca_chiede_solo_file_immagine_con_le_parole_date(archivio):
    rete = Rete(PAGINE)
    o.cerca(archivio, "caro", "tazza", "tazza di caffè", STILE, rete)
    chiesta = parse_qs(urlparse(rete.richieste[0]).query)
    assert chiesta["gsrnamespace"] == ["6"]
    assert "tazza di caffè" in chiesta["gsrsearch"][0]
    assert chiesta["gsrlimit"] == [str(STILE["candidati"])]
    assert chiesta["iiurlwidth"] == [str(STILE["lato_scarico"])]


def test_il_foglio_e_il_json_dei_provini(archivio):
    foglio = o.cerca(archivio, "caro", "tazza", "tazza", STILE, Rete(PAGINE))
    assert foglio == cartella(archivio) / "provini-tazza.jpg"
    immagine = Image.open(foglio)
    assert immagine.format == "JPEG" and immagine.width == 2 * STILE["cella"]
    assert immagine.height > STILE["cella"], "due righe: tre provini su due colonne"
    prima = json.loads((cartella(archivio) / "provini-tazza.json").read_text(encoding="utf-8"))["risultati"]["1"]
    assert prima == {"file": "File:prima.jpg", "pagina": "https://commons.example/wiki/File:prima.jpg", "scarico": "https://upload.example/prima.jpg.jpg",
                     "autore": "Mario Rossi", "licenza": "CC BY-SA 4.0"}


def test_senza_risultati_liberi_l_errore_lo_dice(archivio):
    with pytest.raises(SystemExit, match="nessuna foto con licenza libera"):
        o.cerca(archivio, "caro", "tazza", "tazza", STILE, Rete([pagina(1, "x.jpg", "CC BY-NC 4.0")]))
    assert not cartella(archivio).exists() or not list(cartella(archivio).glob("provini-*"))


def test_un_video_che_non_c_e_si_dice(archivio):
    with pytest.raises(SystemExit, match="il video «altro» non c'è"):
        o.cerca(archivio, "altro", "tazza", "tazza", STILE, Rete(PAGINE))


def test_prendi_scrive_il_png_ritagliato_stretto_e_la_fonte(archivio):
    rete = Rete(PAGINE)
    o.cerca(archivio, "caro", "tazza", "tazza", STILE, rete)
    png = o.prendi(archivio, "caro", "tazza", 2, False, STILE, rete, finto_scontorno)
    assert png == cartella(archivio) / "tazza.png"
    immagine = Image.open(png)
    assert immagine.mode == "RGBA"
    margine = STILE["margine_ritaglio"]
    assert immagine.size == (200 + 2 * margine, 150 + 2 * margine), "400×300 con l'oggetto a metà: ritaglio stretto più il margine"
    assert immagine.getchannel("A").getpixel((0, 0)) == 0
    assert json.loads((cartella(archivio) / "fonti.json").read_text(encoding="utf-8")) == {
        "tazza": {"file": "File:seconda.jpg", "pagina": "https://commons.example/wiki/File:seconda.jpg", "licenza": "CC0", "autore": "Mario Rossi"}}


def test_prendi_non_perde_le_fonti_gia_scritte_e_aggiorna_la_stessa_voce(archivio):
    rete = Rete(PAGINE)
    cartella(archivio).mkdir(parents=True)
    vecchie = {"macbook": {"file": "File:M.jpg", "pagina": "p", "licenza": "CC BY 4.0", "autore": "A"}, "tazza": {"file": "File:vecchia.jpg"}}
    (cartella(archivio) / "fonti.json").write_text(json.dumps(vecchie), encoding="utf-8")
    o.cerca(archivio, "caro", "tazza", "tazza", STILE, rete)
    o.prendi(archivio, "caro", "tazza", 1, False, STILE, rete, finto_scontorno)
    fonti = json.loads((cartella(archivio) / "fonti.json").read_text(encoding="utf-8"))
    assert list(fonti) == ["macbook", "tazza"]
    assert fonti["macbook"] == vecchie["macbook"]
    assert fonti["tazza"]["file"] == "File:prima.jpg"


def test_con_intero_la_foto_resta_intera_in_jpg_senza_scontorno_e_toglie_il_png_di_prima(archivio):
    rete = Rete(PAGINE)
    o.cerca(archivio, "caro", "tazza", "tazza", STILE, rete)
    vecchio = o.prendi(archivio, "caro", "tazza", 1, False, STILE, rete, finto_scontorno)

    def vietato(img):
        raise AssertionError("con --intero non si scontorna")

    jpg = o.prendi(archivio, "caro", "tazza", 1, True, STILE, rete, vietato)
    assert jpg == cartella(archivio) / "tazza.jpg"
    assert Image.open(jpg).size == (400, 300) and Image.open(jpg).mode == "RGB"
    assert not vecchio.exists()


def test_un_numero_che_non_c_e_si_dice_con_quelli_che_ci_sono(archivio):
    rete = Rete(PAGINE)
    o.cerca(archivio, "caro", "tazza", "tazza", STILE, rete)
    with pytest.raises(SystemExit, match="il numero 7 non c'è.*da 1 a 3"):
        o.prendi(archivio, "caro", "tazza", 7, False, STILE, rete, finto_scontorno)
    assert not (cartella(archivio) / "fonti.json").exists()


def test_senza_provini_si_dice_di_cercare_prima(archivio):
    with pytest.raises(SystemExit, match="prima `cerca caro tazza"):
        o.prendi(archivio, "caro", "tazza", 1, False, STILE, Rete(PAGINE), finto_scontorno)


def blocca(monkeypatch, risposte):
    """urlopen finto: ogni chiamata consuma una risposta (un'eccezione o i byte)."""
    chiamate, attese = [], []

    class Risposta:
        def __init__(self, dati):
            self.dati = dati

        def read(self):
            return self.dati

        def __enter__(self):
            return self

        def __exit__(self, *_):
            return False

    def apri(richiesta, timeout):
        chiamate.append(richiesta)
        r = risposte.pop(0)
        if isinstance(r, Exception):
            raise r
        return Risposta(r)

    monkeypatch.setattr(o.urllib.request, "urlopen", apri)
    monkeypatch.setattr(o.time, "sleep", attese.append)
    return chiamate, attese


def errore_http(codice):
    return urllib.error.HTTPError("https://commons.example", codice, "x", {}, None)


def test_un_429_persistente_dopo_le_attese_da_un_errore_chiaro(monkeypatch):
    chiamate, attese = blocca(monkeypatch, [errore_http(429)] * 3)
    with pytest.raises(SystemExit, match="429.*riprova"):
        o.richiedi("https://commons.example/x", STILE)
    assert attese == [1, 2] and len(chiamate) == 3


def test_un_429_passeggero_si_supera_aspettando_e_lo_user_agent_e_generico(monkeypatch):
    chiamate, attese = blocca(monkeypatch, [errore_http(429), b"ok"])
    assert o.richiedi("https://commons.example/x", STILE) == b"ok"
    assert attese == [1]
    assert chiamate[0].get_header("User-agent") == f"mango-animation/{VERSIONE}"


def test_un_altro_errore_http_non_si_ritenta(monkeypatch):
    chiamate, attese = blocca(monkeypatch, [errore_http(404)])
    with pytest.raises(SystemExit, match="404"):
        o.richiedi("https://commons.example/x", STILE)
    assert attese == [] and len(chiamate) == 1


def test_una_rete_che_non_risponde_si_ritenta_e_poi_da_un_errore_chiaro(monkeypatch):
    chiamate, attese = blocca(monkeypatch, [TimeoutError("scaduto"), urllib.error.URLError("irraggiungibile"), TimeoutError("scaduto")])
    with pytest.raises(SystemExit, match="errore di rete.*riprova"):
        o.richiedi("https://commons.example/x", STILE)
    assert attese == [1, 2] and len(chiamate) == 3


def test_una_maschera_che_tocca_il_bordo_e_lo_sfondo_e_si_rovescia():
    import numpy as np

    sfondo = np.ones((100, 120), bool)
    sfondo[30:70, 40:80] = False
    oggetto = o.isola(sfondo, STILE)
    assert oggetto[30:70, 40:80].all() and oggetto.sum() == 40 * 40


def test_una_maschera_dell_oggetto_resta_com_e_e_i_pezzi_minuscoli_si_tolgono():
    import numpy as np

    maschera = np.zeros((100, 120), bool)
    maschera[30:70, 40:80] = True
    maschera[5, 5] = True
    assert o.isola(maschera, STILE).sum() == 40 * 40


def test_senza_niente_nella_maschera_l_errore_lo_dice():
    import numpy as np

    with pytest.raises(SystemExit, match="non ha trovato niente"):
        o.isola(np.ones((50, 50), bool), STILE)
