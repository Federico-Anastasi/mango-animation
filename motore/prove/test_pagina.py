import json
import subprocess
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

import pytest
from PIL import Image

from motore.__main__ import main
from motore.archivio import Archivio
from motore.errori import Errore
from motore.pagina import pagina

SLUG = "notizia"
RIEMPITIVO = "Testo della notizia che riempie la pagina come un articolo vero. " * 40
# Una pagina in formato telefono, con le frasi in posti fissi (px CSS): «in alto» a 400, «in fondo» a 3200, oltre la finestra, e sotto
# di lei la pagina continua a lungo. Il testo nascosto basta a far credere a `pagina.mjs` che la pagina sia arrivata. «la frase in alto»
# torna prima anche nascosta, come nell'indice e nelle sezioni chiuse di Wikipedia da telefono: conta solo quella che si vede.
HTML = f"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>La notizia</title><style>body{{margin:0;font:18px sans-serif;position:relative;height:7200px}} p{{position:absolute;left:16px;margin:0}}
.rossa{{background:#ff0000}}</style></head>
<body><div style="display:none">la frase in alto</div><section hidden="until-found"><p style="position:static">la frase in alto</p></section><div style="height:300px;overflow:hidden">{RIEMPITIVO}</div>
<p style="top:400px">Qui c'è <span class="rossa">la frase in alto</span> da cerchiare.</p>
<p style="top:3200px">E poi <span class="rossa">la frase in fondo</span> da cerchiare.</p></body></html>"""


@pytest.fixture(scope="module")
def sito(tmp_path_factory):
    cartella = tmp_path_factory.mktemp("sito")
    (cartella / "notizia.html").write_text(HTML, encoding="utf-8")
    (cartella / "animata.html").write_text(ANIMATA, encoding="utf-8")
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(type("Zitto", (SimpleHTTPRequestHandler,), {"log_message": lambda *a: None}), directory=cartella))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()


def _video(radice, pagine):
    archivio = Archivio(radice=radice)
    materiali = radice / "video" / SLUG / "materiali"
    materiali.mkdir(parents=True)
    (materiali / "pagine.json").write_text(json.dumps(pagine), encoding="utf-8")
    return archivio, materiali


@pytest.fixture(scope="module")
def presa(sito, tmp_path_factory):
    """Una pagina vera presa una volta sola col browser, coi ritagli."""
    archivio, materiali = _video(tmp_path_factory.mktemp("archivio"), {
        "giornale": {
            "url": f"{sito}/notizia.html",
            "frasi": {"alto": "la frase in alto", "fondo": "la frase in fondo", "assente": "una frase che non c'è"},
            "ritagli": {"testa": [0, 0, 600, 400], "fondo": [0, 7500, 900, 1000], "tutta": "tutta"},
        }
    })
    pagina(archivio, SLUG)
    return archivio, materiali


def _rossa(immagine, riquadro):
    x, y, w, h = riquadro
    r, g, b = immagine.convert("RGB").getpixel((x + w // 2, y + h // 2))
    return r > 200 and g < 80 and b < 80


def test_la_pagina_si_prende_in_formato_telefono_lunga_abbastanza_per_l_ultima_frase(presa):
    archivio, materiali = presa
    p = archivio.stile["pagina"]
    misure = json.loads((materiali / "screen-giornale.json").read_text(encoding="utf-8"))
    cattura = Image.open(materiali / "screen-giornale.png")
    assert cattura.size == (misure["larghezza"], misure["altezza"])
    assert misure["larghezza"] == round(p["larghezza"] * p["densita"])
    x, y, w, h = misure["frasi"]["fondo"]
    assert y > p["finestra"] * p["densita"], "la frase in fondo sta oltre la finestra: la prova non prova niente"
    assert misure["altezza"] >= y + h + p["sotto_le_frasi"], "sotto l'ultima frase resta abbastanza pagina per portarla nella metà alta"
    assert misure["altezza"] < 7200 * p["densita"], "non è la pagina intera"
    assert _rossa(cattura, misure["frasi"]["alto"]) and _rossa(cattura, misure["frasi"]["fondo"])
    assert "assente" not in misure["frasi"]


def test_accanto_alla_cattura_la_provenienza(presa):
    _, materiali = presa
    url, stato, quando = (materiali / "screen-giornale.txt").read_text(encoding="utf-8").splitlines()
    assert url.endswith("/notizia.html")
    assert stato == "200 · La notizia"
    assert quando.startswith("presa il 20")


def test_i_ritagli_portano_le_frasi_che_contengono_nelle_loro_coordinate(presa):
    archivio, materiali = presa
    misure = json.loads((materiali / "screen-giornale.json").read_text(encoding="utf-8"))
    fondo = json.loads((materiali / "ritagli" / "giornale-fondo.json").read_text(encoding="utf-8"))
    immagine = Image.open(materiali / "ritagli" / "giornale-fondo.jpg")
    assert immagine.size == (900, 1000) == (fondo["larghezza"], fondo["altezza"])
    x, y, w, h = misure["frasi"]["fondo"]
    assert fondo["frasi"] == {"fondo": [x, y - 7500, w, h]}
    assert _rossa(immagine, fondo["frasi"]["fondo"])
    testa = json.loads((materiali / "ritagli" / "giornale-testa.json").read_text(encoding="utf-8"))
    assert testa["frasi"] == {}
    tutta = json.loads((materiali / "ritagli" / "giornale-tutta.json").read_text(encoding="utf-8"))
    assert (tutta["larghezza"], tutta["altezza"]) == (misure["larghezza"], misure["altezza"])
    assert tutta["frasi"] == misure["frasi"]


def _cattura_finta(materiali, nome, altezza, frasi):
    """Una cattura già fatta, senza browser: bianca, con le frasi in rosso."""
    immagine = Image.new("RGB", (400, altezza), "white")
    for x, y, w, h in frasi.values():
        immagine.paste((255, 0, 0), (x, y, x + w, y + h))
    immagine.save(materiali / f"screen-{nome}.png")
    (materiali / f"screen-{nome}.json").write_text(json.dumps({"larghezza": 400, "altezza": altezza, "frasi": frasi}), encoding="utf-8")


def test_solo_ritagli_rifà_i_ritagli_senza_riprendere_la_pagina(tmp_path, monkeypatch, capsys):
    archivio, materiali = _video(tmp_path / "archivio", {"giornale": {"url": "http://127.0.0.1:9/irraggiungibile", "frasi": {"a": "a"}, "ritagli": {"pezzo": [0, 100, 400, 300]}}})
    _cattura_finta(materiali, "giornale", 2000, {"a": [10, 150, 50, 20]})
    monkeypatch.setenv("MANGO_ANIMATION_LAVORO", str(archivio.radice.parent))
    assert main(["pagina", SLUG, "--solo-ritagli"]) == 0
    assert json.loads((materiali / "ritagli" / "giornale-pezzo.json").read_text(encoding="utf-8"))["frasi"] == {"a": [10, 50, 50, 20]}
    assert "giornale-pezzo.jpg: 400×300, 1 frasi" in capsys.readouterr().out


def test_una_frase_troppo_in_basso_per_la_metà_alta_si_dice(tmp_path, capsys):
    archivio, materiali = _video(tmp_path / "archivio", {"giornale": {"url": "http://127.0.0.1:9/x", "frasi": {"bassa": "b", "fuori": "f"}}})
    sotto = archivio.stile["pagina"]["sotto_le_frasi"]
    _cattura_finta(materiali, "giornale", 1000 + sotto // 2, {"bassa": [10, 980, 50, 20]})
    misure = json.loads((materiali / "screen-giornale.json").read_text(encoding="utf-8"))
    misure["frasi"]["fuori"] = [-2, 133, 3, 3]
    (materiali / "screen-giornale.json").write_text(json.dumps(misure), encoding="utf-8")
    pagina(archivio, SLUG, solo_ritagli=True)
    uscita = capsys.readouterr().out
    assert f"sotto «bassa» restano {sotto // 2} px di pagina" in uscita
    assert "«fuori» sta fuori dalla cattura" in uscita


def test_un_ritaglio_che_esce_dalla_cattura_si_ferma(tmp_path):
    archivio, materiali = _video(tmp_path / "archivio", {"giornale": {"url": "http://127.0.0.1:9/x", "ritagli": {"lungo": [0, 1500, 400, 900]}}})
    _cattura_finta(materiali, "giornale", 2000, {})
    with pytest.raises(Errore, match="«lungo».*esce dalla cattura, che è 400×2000"):
        pagina(archivio, SLUG, solo_ritagli=True)


def test_una_pagina_che_non_c_e_nell_elenco(tmp_path):
    archivio, _ = _video(tmp_path / "archivio", {"giornale": {"url": "http://127.0.0.1:9/x"}})
    with pytest.raises(Errore, match="non c'è «rivista».*giornale"):
        pagina(archivio, SLUG, ["rivista"], solo_ritagli=True)


def test_senza_elenco_dice_come_scriverlo(tmp_path):
    archivio = Archivio(radice=tmp_path / "archivio")
    (archivio.radice / "video" / SLUG).mkdir(parents=True)
    with pytest.raises(Errore, match=r"pagine\.json: scrivi lì le pagine da prendere"):
        pagina(archivio, SLUG)


def test_un_elenco_scritto_male_si_ferma_prima_del_browser(tmp_path):
    archivio, _ = _video(tmp_path / "archivio", {"giornale": {"indirizzo": "http://127.0.0.1:9/x"}})
    with pytest.raises(Errore, match="manca «url»"):
        pagina(archivio, SLUG)


def test_una_cattura_vecchia_senza_misure_chiede_di_riprendere(tmp_path):
    archivio, materiali = _video(tmp_path / "archivio", {"giornale": {"url": "http://127.0.0.1:9/x"}})
    Image.new("RGB", (40, 40), "white").save(materiali / "screen-giornale.png")
    (materiali / "screen-giornale.json").write_text(json.dumps({"titolo": [1, 2, 3, 4]}), encoding="utf-8")
    with pytest.raises(Errore, match="riprendi la pagina"):
        pagina(archivio, SLUG, solo_ritagli=True)


def test_una_pagina_irraggiungibile_fa_fallire_il_comando_e_non_tocca_i_file_di_prima(tmp_path):
    archivio, materiali = _video(tmp_path / "archivio", {"giornale": {"url": "http://127.0.0.1:9/irraggiungibile"}})
    _cattura_finta(materiali, "giornale", 2000, {})
    prima = (materiali / "screen-giornale.png").read_bytes()
    with pytest.raises(Errore, match="non tutte le pagine"):
        pagina(archivio, SLUG)
    assert (materiali / "screen-giornale.png").read_bytes() == prima



# Una pagina che si muove: una barra larga quanto il tempo (requestAnimationFrame e performance.now), un timer a 600 ms che la fa
# verde, e due animazioni in catena (la seconda parte quando la prima finisce, come le palette di un tabellone) che alla fine accendono
# un quadrato. Filmata da 0,2 s a 1,2 s del suo tempo: trenta fotogrammi a un trentesimo l'uno, qualunque cosa costino.
ANIMATA = """<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Animata</title><style>body{margin:0;background:#fff} #barra{height:100px;background:#f00} #fine{width:100px;height:100px}</style></head>
<body><div id="barra"></div><div id="fine"></div><script>
const barra = document.getElementById("barra"), fine = document.getElementById("fine");
const giro = () => { barra.style.width = (performance.now() / 4) + "px"; requestAnimationFrame(giro); };
requestAnimationFrame(giro);
setTimeout(() => { barra.style.background = "#0a0"; }, 600);
const a = fine.animate([{ opacity: 1 }, { opacity: 1 }], { duration: 200 });
a.onfinish = () => { fine.animate([{ opacity: 1 }, { opacity: 1 }], { duration: 200 }).onfinish = () => { fine.style.background = "#00f"; }; };
</script></body></html>"""


def _fotogrammi(filmato):
    grezzi = subprocess.run(["ffmpeg", "-v", "error", "-c:v", "libvpx-vp9", "-i", str(filmato), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                            capture_output=True, check=True).stdout
    lato = 1080 * 1920 * 3
    return [Image.frombytes("RGB", (1080, 1920), grezzi[i:i + lato]) for i in range(0, len(grezzi), lato)]


def _larghezza_rossa_o_verde(immagine):
    riga = [immagine.getpixel((x, 120)) for x in range(1080)]
    return sum(1 for r, g, b in riga if (r > 200 and g < 80) or (g > 120 and r < 80))


def test_una_pagina_che_si_muove_si_filma_un_trentesimo_alla_volta(sito, tmp_path):
    archivio, materiali = _video(tmp_path, {"animata": {"url": f"{sito}/animata.html", "filmato": [0.2, 1.2]}})
    pagina(archivio, SLUG)
    fotogrammi = _fotogrammi(materiali / "filmato-animata.webm")
    assert len(fotogrammi) == 30
    assert Image.open(materiali / "screen-animata.png").size == (1080, 1920)
    assert "filmata da 0.2 s a 1.2 s" in (materiali / "screen-animata.txt").read_text(encoding="utf-8")
    # La barra cresce di 1000/30/4 px CSS a fotogramma, cioè 2,5 volte tanto nell'immagine: dal primo all'ultimo, 29 passi.
    crescita = _larghezza_rossa_o_verde(fotogrammi[-1]) - _larghezza_rossa_o_verde(fotogrammi[0])
    assert abs(crescita - 29 * 1000 / 30 / 4 * 2.5) < 12
    assert fotogrammi[0].getpixel((5, 50))[0] > 200 and fotogrammi[-1].getpixel((5, 50))[1] > 120
    # Il quadrato sta sotto la barra: 100-200 px CSS, cioè 250-500 nell'immagine. Spento all'inizio, blu alla fine della catena.
    assert fotogrammi[0].getpixel((125, 375))[2] > 200 and fotogrammi[0].getpixel((125, 375))[0] > 200
    assert fotogrammi[-1].getpixel((125, 375))[2] > 200 and fotogrammi[-1].getpixel((125, 375))[0] < 80


def test_un_filmato_che_finisce_prima_di_cominciare_si_ferma(tmp_path):
    archivio, _ = _video(tmp_path, {"animata": {"url": "http://127.0.0.1:9/a.html", "filmato": [3, 2]}})
    with pytest.raises(Errore, match="finisce prima di cominciare"):
        pagina(archivio, SLUG)
