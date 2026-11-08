import json
import shutil
import subprocess
from unittest import mock

import numpy as np
import pytest
from PIL import Image

from motore.archivio import REPO, Archivio
from motore.errori import Errore
from motore import animazioni, quadri
from motore.media import info
from motore.monta import leggero, monta
from motore.quadri import Compositore, inquadra
from motore.risolvi import risolvi

from .aiuti import audio, energia_a, finge_bun, fotogramma, monta_con_animazioni, rendi_animazioni, vicino
from .conftest import GIORNO, PAROLE_PAROLE, PAROLE_TEMPO, _collega, _ffmpeg

CARTA, ROSSO, BLU, ARANCIO, NERO, VERDE = (241, 240, 235), (255, 0, 0), (0, 0, 255), (255, 140, 0), (0, 0, 0), (57, 231, 95)
SCRITTA = (255, 255, 255)
WEBCAM = [1244, 26, 432, 246]
GARA = {"taglio": [720, 280, 960, 720], "inserto": [10, 105, 482, 250]}


@pytest.fixture
def tempo(prepara_sintetico):
    return prepara_sintetico("tempo", PAROLE_TEMPO)


@pytest.fixture
def larga(prepara_sintetico):
    return prepara_sintetico("larga", PAROLE_TEMPO)


def durata_attesa(archivio, slug):
    return risolvi(archivio, slug, scrivi=False)["durata"]


def test_girato_pieno(archivio, scrivi_piano, tempo, tmp_path):
    scrivi_piano("g", {"quadro": "girato-pieno", "sorgenti": {"t": {"file": tempo}}, "scene": [{"nome": "s", "pezzi": [{"sorgente": "t", "da": 0.6, "a": 2.4}]}], "sottotitoli": {"modo": "nessuno"}})
    file, i = monta_con_animazioni(archivio, "g", tmp_path)
    assert (i["largo"], i["alto"], i["fps"]) == (1080, 1920, 30) and i["ha_audio"]
    assert i["durata"] == pytest.approx(durata_attesa(archivio, "g"), abs=1 / 30 + 0.02)
    f = fotogramma(file, 0.5)
    assert vicino(f[960, 270], ROSSO) and vicino(f[960, 810], BLU)
    assert (archivio.uscite("g") / "finale.srt").exists()
    assert not (archivio.uscite("g") / "leggero.mp4").exists()
    disegno = tmp_path / "copertina.png"
    Image.new("RGB", (1080, 1920), (10, 200, 10)).save(disegno)
    scrivi_piano("g", {"quadro": "girato-pieno", "sorgenti": {"t": {"file": tempo}}, "scene": [{"nome": "s", "pezzi": [{"sorgente": "t", "da": 0.6, "a": 2.4}]}], "sottotitoli": {"modo": "nessuno"},
                       "copertina": {"disegno": str(disegno)}})
    monta_con_animazioni(archivio, "g", tmp_path)
    misure = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", str(leggero(archivio, "g", avanza=lambda *_: None))], capture_output=True, text=True).stdout
    assert "720,1280" in misure


def test_solo_animazione(archivio, scrivi_piano, tempo, tmp_path):
    scrivi_piano("a", {"quadro": "solo-animazione", "sorgenti": {"t": {"file": tempo}}, "scene": [{"nome": "s", "animazione": "uno", "pezzi": [{"sorgente": "t", "da": 0.6, "a": 2.4}]}], "sottotitoli": {"modo": "nessuno"}})
    file, i = monta_con_animazioni(archivio, "a", tmp_path)
    f = fotogramma(file, 0.5)
    assert vicino(f[100, 100], ARANCIO) and vicino(f[1800, 900], ARANCIO)


def test_l_animazione_c_e_dal_primo_fotogramma_di_ogni_tratto(archivio, scrivi_piano, tempo, tmp_path):
    # 29 e 23 fotogrammi: i tratti dopo cominciano a 0,9667 e 1,7333 s, istanti che arrotondati cadono dopo il loro fotogramma.
    pezzi = [{"sorgente": "t", "da": 0.6, "a": 1.5667}, {"sorgente": "t", "da": 1.7, "a": 2.4667}, {"sorgente": "t", "da": 3.5, "a": 4.5}]
    scrivi_piano("at", {"quadro": "solo-animazione", "sorgenti": {"t": {"file": tempo}}, "scene": [{"nome": "s", "animazione": "uno", "pezzi": pezzi}], "sottotitoli": {"modo": "nessuno"}})
    file, _ = monta_con_animazioni(archivio, "at", tmp_path)
    esito = subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-i", str(file), "-vf", "crop=2:2:100:100", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, check=True)
    punti = np.frombuffer(esito.stdout, dtype=np.uint8).reshape(-1, 2, 2, 3)[:, 0, 0]
    vuoti = [n for n, punto in enumerate(punti) if not vicino(punto, ARANCIO)]
    assert len(punti) > 60 and vuoti == []


def test_sagoma_su_animazione_mette_la_testa_alla_riga_dello_stile(archivio, scrivi_piano, tempo, tmp_path):
    scrivi_piano("s", {"quadro": "sagoma-su-animazione", "sorgenti": {"t": {"file": tempo}}, "scene": [{"nome": "s", "animazione": "uno", "pezzi": [{"sorgente": "t", "da": 0.6, "a": 2.4}]}], "sottotitoli": {"modo": "nessuno"}})
    file, _ = monta_con_animazioni(archivio, "s", tmp_path)
    f = fotogramma(file, 0.8)
    blu = (f[..., 2] > 200) & (f[..., 0] < 60) & (f[..., 1] < 60)
    righe, colonne = np.where(blu)
    stile = archivio.stile["quadri"]["sagoma-su-animazione"]["strati"][1]
    scala = (1920 - stile["testa"]) / (1920 - (600 - stile["aria"]) - stile["aria"]) + stile["scala_margine"]
    assert righe.min() == pytest.approx(stile["testa"], abs=4)
    assert colonne.min() == pytest.approx(stile["x"] + 300 * scala, abs=6)
    assert colonne.max() == pytest.approx(stile["x"] + 800 * scala, abs=10)
    assert vicino(f[300, 900], ARANCIO) and vicino(f[1500, 1000], ARANCIO) and vicino(f[880, 400], ARANCIO)


def test_sagoma_al_centro_porta_al_centro_la_testa_non_la_ripresa(archivio, scrivi_piano, prepara_sintetico, tmp_path):
    # Nella ripresa la testa sta a sinistra (colonne 200-499) e le spalle escono dai due lati: nel montato la testa va al
    # centro, e la sagoma, ingrandita quanto serve, copre lo stesso tutta la larghezza.
    file = prepara_sintetico("tempo", PAROLE_TEMPO, sagoma=False)
    _ffmpeg("-f", "lavfi", "-i", "color=c=blue:s=1080x1920:r=30:d=3,format=yuva420p,geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='if(between(X,200,499)*between(Y,600,899)+between(Y,900,1899),255,0)'",
            "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-deadline", "realtime", "-cpu-used", "8", "-b:v", "0", "-crf", "20", "-auto-alt-ref", "0", archivio.preparati(file) / "sagoma.webm")
    scrivi_piano("c", {"quadro": "sagoma-al-centro", "sorgenti": {"t": {"file": file}}, "scene": [{"nome": "s", "animazione": "uno", "pezzi": [{"sorgente": "t", "da": 0.6, "a": 2.4}]}], "sottotitoli": {"modo": "nessuno"}})
    video, _ = monta_con_animazioni(archivio, "c", tmp_path)
    f = fotogramma(video, 0.8)
    stile = archivio.stile["quadri"]["sagoma-al-centro"]["strati"][1]
    blu = (f[..., 2] > 200) & (f[..., 0] < 60) & (f[..., 1] < 60)
    riga = stile["testa"] + 60
    colonne = np.where(blu[riga])[0]
    assert (colonne.min() + colonne.max()) / 2 == pytest.approx(540, abs=8)
    assert blu[1850, 4] and blu[1850, 1075]


def test_il_bordo_della_sagoma_sfuma_nell_animazione_senza_righe_del_fondo(archivio, scrivi_piano, prepara_sintetico, tmp_path):
    # La persona esce dal lato destro del girato: lì il bordo è dritto e si ammorbidisce verso ciò che sta sotto, non verso il colore del fondo.
    file = prepara_sintetico("tempo", PAROLE_TEMPO, sagoma=False)
    _ffmpeg("-f", "lavfi", "-i", "color=c=blue:s=1080x1920:r=30:d=3,format=yuva420p,geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='if(gte(X,300)*between(Y,600,1899),255,0)'",
            "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-deadline", "realtime", "-cpu-used", "8", "-b:v", "0", "-crf", "20", "-auto-alt-ref", "0", archivio.preparati(file) / "sagoma.webm")
    scrivi_piano("b", {"quadro": "sagoma-su-animazione", "sorgenti": {"t": {"file": file}}, "scene": [{"nome": "s", "animazione": "uno", "pezzi": [{"sorgente": "t", "da": 0.6, "a": 2.4}]}], "sottotitoli": {"modo": "nessuno"}})
    video, _ = monta_con_animazioni(archivio, "b", tmp_path)
    f = fotogramma(video, 0.8)
    stile = archivio.stile["quadri"]["sagoma-su-animazione"]["strati"][1]
    scala = (1920 - stile["testa"]) / (1920 - (600 - stile["aria"]) - stile["aria"]) + stile["scala_margine"]
    bordo = stile["x"] + round(1080 * scala / 2) * 2
    sopra = round(stile["testa"] - stile["aria"] * scala) + 10
    assert all(vicino(f[sopra, x], ARANCIO) for x in range(bordo - stile["sfuma"], bordo + 2))
    assert vicino(f[1500, bordo - stile["sfuma"] - 3], BLU) and vicino(f[1500, bordo - 1], ARANCIO, 60) and vicino(f[1500, bordo + 1], ARANCIO)
    mezzo = f[1500, bordo - stile["sfuma"] // 2]
    assert not vicino(mezzo, BLU) and not vicino(mezzo, ARANCIO)


def test_schermo_e_viso(archivio, scrivi_piano, larga, tmp_path):
    scrivi_piano("d", {"quadro": "schermo-e-viso", "sorgenti": {"d": {"file": larga, "riquadri": {"webcam": WEBCAM}, "viste": {"gara": GARA}}},
                       "scene": [{"nome": "s", "pezzi": [{"sorgente": "d", "da": 0.6, "a": 2.4, "vista": "gara"}]}], "sottotitoli": {"modo": "nessuno"}})
    file, i = monta_con_animazioni(archivio, "d", tmp_path)
    assert i["durata"] == pytest.approx(durata_attesa(archivio, "d"), abs=0.07)
    f = fotogramma(file, 0.5)
    CARTA = archivio.colore("carta")
    assert vicino(f[60, 540], CARTA) and vicino(f[1050, 540], CARTA) and vicino(f[1800, 540], CARTA)
    assert vicino(f[700, 800], (230, 230, 0))
    assert vicino(f[300, 200], (220, 0, 220))
    assert vicino(f[1400, 540], (0, 200, 0))
    assert vicino(f[1171, 109], CARTA, 12) and vicino(f[1400, 107], CARTA, 12)


def test_una_vista_che_segue_tiene_la_persona_al_centro(archivio, scrivi_piano, larga, tmp_path):
    # La testa sta a 0,2 del fotogramma per i primi quattro secondi, poi a 0,75: il taglio largo 608 le va dietro.
    misure = archivio.stile["segui"]["misure_al_secondo"]
    x = [0.2 if n < 4 * misure else 0.75 for n in range(8 * misure)]
    (archivio.preparati(larga) / "persona.json").write_text(json.dumps({"misure_al_secondo": misure, "misurati": [[0, 8]], "x": x}), encoding="utf-8")
    scrivi_piano("s", {"quadro": "girato-pieno", "sorgenti": {"d": {"file": larga, "viste": {"palco": {"taglio": [656, 0, 608, 1080], "segui": True}}}},
                       "scene": [{"nome": "s", "vista": "palco", "pezzi": [{"sorgente": "d", "da": 0.6, "a": 2.4}, {"sorgente": "d", "da": 6.0, "a": 7.0}]}],
                       "sottotitoli": {"modo": "nessuno"}})
    file, i = monta_con_animazioni(archivio, "s", tmp_path)
    prima = fotogramma(file, 0.5)
    assert vicino(prima[356, 400], (220, 0, 220)) and vicino(prima[356, 900], (60, 60, 60))
    dopo = fotogramma(file, i["durata"] - 0.3)
    assert vicino(dopo[1067, 500], (230, 230, 0)) and vicino(dopo[1067, 1000], (60, 60, 60))


def test_la_persona_si_misura_solo_nei_tratti_di_una_vista_che_segue(archivio, scrivi_piano, larga, tmp_path, monkeypatch):
    chiesti = []

    def misura(sorgente, destinazione, intervalli, stile):
        chiesti.append(intervalli)
        destinazione.write_text(json.dumps({"misure_al_secondo": 5, "misurati": intervalli, "x": [0.5] * 40}), encoding="utf-8")

    monkeypatch.setattr(quadri, "misura_persona", misura)
    morbido = archivio.stile["segui"]["morbido"]
    scrivi_piano("s", {"quadro": "girato-pieno", "sorgenti": {"d": {"file": larga, "viste": {"palco": {"taglio": [656, 0, 608, 1080], "segui": True}, "fisso": {"taglio": [656, 0, 608, 1080]}}}},
                       "scene": [{"nome": "a", "vista": "palco", "pezzi": [{"sorgente": "d", "da": 0.6, "a": 2.4}]},
                                 {"nome": "b", "vista": "fisso", "pezzi": [{"sorgente": "d", "da": 6.0, "a": 7.0}]}], "sottotitoli": {"modo": "nessuno"}})
    monta_con_animazioni(archivio, "s", tmp_path)
    [[[da, a]]] = chiesti
    assert da == 0.0 and 2.4 < a < 2.4 + 3 * morbido + 0.1, "solo il tratto che segue, allargato di tre volte il passo della levigatura"
    monta_con_animazioni(archivio, "s", tmp_path)
    assert len(chiesti) == 1, "ciò che è già misurato non si rifà"


def test_una_vista_che_segue_senza_misure_dice_di_montare(archivio, scrivi_piano, larga, tmp_path):
    scrivi_piano("s", {"quadro": "girato-pieno", "sorgenti": {"d": {"file": larga, "viste": {"palco": {"taglio": [656, 0, 608, 1080], "segui": True}}}},
                       "scene": [{"nome": "s", "vista": "palco", "pezzi": [{"sorgente": "d", "da": 0.6, "a": 2.4}]}], "sottotitoli": {"modo": "nessuno"}})
    risolto = risolvi(archivio, "s")
    with pytest.raises(Errore, match="python -m motore monta s"):
        Compositore(archivio, "s", archivio.piano("s"), risolto).centri("d")


def test_schermo_pieno_contiene_il_fotogramma_senza_tagliarlo(archivio, scrivi_piano, larga, tmp_path):
    scrivi_piano("p", {"quadro": "schermo-pieno", "sorgenti": {"d": {"file": larga}}, "scene": [{"nome": "s", "pezzi": [{"sorgente": "d", "da": 0.6, "a": 2.4}]}], "sottotitoli": {"modo": "nessuno"}})
    file, _ = monta_con_animazioni(archivio, "p", tmp_path)
    f = fotogramma(file, 0.5)
    assert vicino(f[300, 540], CARTA) and vicino(f[1450, 540], CARTA)
    assert vicino(f[830, 540], (230, 230, 0)) and vicino(f[1000, 99], (60, 60, 60))
    assert vicino(f[1000, 30], CARTA), "lo schermo resta fuori dai lati che il telefono taglia"


def test_il_titolo_e_un_cartello_con_il_fondo_e_la_scritta_dello_stile_nel_suo_posto(archivio, scrivi_piano, tempo, tmp_path):
    scrivi_piano("t", {"quadro": "girato-pieno", "sorgenti": {"t": {"file": tempo}}, "scene": [{"nome": "s", "pezzi": [{"sorgente": "t", "da": 0.6, "a": 2.4}]}],
                       "sottotitoli": {"modo": "nessuno"}, "titolo": {"testo": "Un titolo", "da": 0.5, "a": 1.2}})
    file, _ = monta_con_animazioni(archivio, "t", tmp_path)
    y = archivio.stile["quadri"]["girato-pieno"]["titolo"]["y"]
    con = fotogramma(file, 0.8)[y - 38:y + 38, 400:680]
    senza = fotogramma(file, 1.5)[y - 38:y + 38, 400:680]
    fondo, scritta = (np.array(archivio.colore(archivio.stile["titolo"][c])) for c in ("fondo", "colore"))
    assert (np.abs(con - fondo).sum(axis=2) < 30).mean() > 0.5
    assert (np.abs(con - scritta).sum(axis=2) < 90).sum() > 100
    assert (np.abs(senza - fondo).sum(axis=2) < 30).mean() < 0.05
    prima = fotogramma(file, 0.3)[y - 38:y + 38, 400:680]
    assert (np.abs(prima - fondo).sum(axis=2) < 30).mean() < 0.05


def test_i_sottotitoli_parola_per_parola_non_escono_prima_della_parola(archivio, scrivi_piano, prepara_sintetico, finto, tmp_path):
    file = prepara_sintetico("parole", PAROLE_PAROLE)
    scrivi_piano("w", {"quadro": "girato-pieno", "sorgenti": {"p": {"file": file}}, "scene": [{"nome": "s", "pezzi": [{"sorgente": "p", "minuto": "00:00", "dice": "ciao a tutti"}]}],
                       "sottotitoli": {"modo": "parola per parola"}})
    video, _ = monta_con_animazioni(archivio, "w", tmp_path)
    r = json.loads((archivio.lavoro("w") / "risolto.json").read_text(encoding="utf-8"))
    parole = r["parole"]

    def riquadro_carta(t):
        f = fotogramma(video, t)[1250:1400, 100:980]
        return int((np.abs(f - np.array(SCRITTA)).sum(axis=2) < 60).sum())

    assert riquadro_carta(max(0, parole[0]["da"] - 0.08)) == 0
    assert riquadro_carta(parole[0]["da"] + 0.07) > 300
    ancora = riquadro_carta(parole[0]["da"] + 0.07)
    assert riquadro_carta(parole[1]["da"] - 0.08) == pytest.approx(ancora, abs=100)
    assert riquadro_carta(parole[1]["da"] + 0.07) > ancora
    assert riquadro_carta(parole[2]["da"] + 0.07) > riquadro_carta(parole[1]["da"] + 0.07)
    assert riquadro_carta(parole[2]["da"] - 0.08) == pytest.approx(riquadro_carta(parole[1]["da"] + 0.07), abs=100)


def test_i_sottotitoli_a_battute_escono_tutti_insieme(archivio, scrivi_piano, prepara_sintetico, finto, tmp_path):
    file = prepara_sintetico("parole", PAROLE_PAROLE)
    scrivi_piano("b", {"quadro": "girato-pieno", "sorgenti": {"p": {"file": file}}, "scene": [{"nome": "s", "pezzi": [{"sorgente": "p", "minuto": "00:00", "dice": "ciao a tutti"}]}],
                       "sottotitoli": {"modo": "a battute"}})
    video, _ = monta_con_animazioni(archivio, "b", tmp_path)
    r = json.loads((archivio.lavoro("b") / "risolto.json").read_text(encoding="utf-8"))
    b = r["battute"][0]
    carta = lambda t: int((np.abs(fotogramma(video, t)[1250:1400, 100:980] - np.array(SCRITTA)).sum(axis=2) < 60).sum())
    assert carta(b["da"] - 0.08) == 0 and carta(b["da"] + 0.08) > 1000 and carta(b["da"] + 0.08) == pytest.approx(carta(b["a"] - 0.08), abs=100)
    assert "ciao a tutti" in (archivio.uscite("b") / "finale.srt").read_text(encoding="utf-8")


def test_una_parola_in_rilievo_esce_piu_grande_nel_suo_colore_e_salta(archivio, scrivi_piano, prepara_sintetico, finto, tmp_path):
    file = prepara_sintetico("parole", PAROLE_PAROLE)
    scrivi_piano("ril", {"quadro": "girato-pieno", "sorgenti": {"p": {"file": file}}, "scene": [{"nome": "s", "pezzi": [{"sorgente": "p", "minuto": "00:00", "dice": "ciao a tutti"}]}],
                         "sottotitoli": {"modo": "parola per parola", "rilievo": ["tutti"]}})
    video, _ = monta_con_animazioni(archivio, "ril", tmp_path)
    b = next(b for b in json.loads((archivio.lavoro("ril") / "risolto.json").read_text(encoding="utf-8"))["battute"] if b.get("rilievo"))
    r = archivio.stile["sottotitoli"]["rilievo"]
    colore = np.array(archivio.colore(r["colore"]))

    def dove(t):
        f = fotogramma(video, t)[1100:1500, 60:1020]
        righe = np.nonzero((np.abs(f - colore).sum(axis=2) < 60).sum(axis=1) > 3)[0]
        return righe.min(), righe.max()

    in_salto, posata = dove(b["da"] + r["salto_durata"] / 2), dove(b["a"] - 0.05)
    assert posata[1] - posata[0] > 0.6 * r["corpo"], "la parola in rilievo è grande quanto il suo corpo"
    assert in_salto[0] < posata[0] - r["salto"] / 2, "a metà del salto la parola sta più in alto"


def test_un_suono_si_sente_dove_il_piano_lo_mette(archivio, scrivi_piano, tempo, tmp_path):
    materiali = archivio.radice / "video" / "z" / "materiali"
    materiali.mkdir(parents=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=f=2000:d=0.4", str(materiali / "bip.wav")], check=True)
    piano = {"quadro": "girato-pieno", "sorgenti": {"t": {"file": tempo}}, "scene": [{"nome": "s", "pezzi": [{"sorgente": "t", "da": 0.6, "a": 2.4}]}], "sottotitoli": {"modo": "nessuno"}}
    scrivi_piano("z", piano)
    senza, _ = monta_con_animazioni(archivio, "z", tmp_path)
    prima = energia_a(audio(senza, 0.5, 0.4), 2000)
    scrivi_piano("z", {**piano, "suoni": [{"file": "bip.wav", "sorgente": "t", "t": 1.0, "picco": -6}]})
    con, _ = monta_con_animazioni(archivio, "z", tmp_path)
    r = json.loads((archivio.lavoro("z") / "risolto.json").read_text(encoding="utf-8"))
    quando = r["suoni"][0]["esce"]
    assert energia_a(audio(con, quando, 0.4), 2000) > 30 * max(prima, 1)
    assert energia_a(audio(con, quando + 0.8, 0.4), 2000) < energia_a(audio(con, quando, 0.4), 2000) / 20


def test_uno_zoom_fisso_mostra_solo_una_parte(archivio, scrivi_piano, tempo, tmp_path):
    piano = {"quadro": "girato-pieno", "sorgenti": {"t": {"file": tempo}}, "scene": [{"nome": "s", "pezzi": [{"sorgente": "t", "da": 0.6, "a": 2.4}]}], "sottotitoli": {"modo": "nessuno"}}
    scrivi_piano("zf", piano)
    liscio, _ = monta_con_animazioni(archivio, "zf", tmp_path)
    assert vicino(fotogramma(liscio, 0.5)[960, 1000], BLU)
    piano["scene"][0]["pezzi"][0]["zoom"] = {"scala": 2, "centro": [0.25, 0.5]}
    scrivi_piano("zf", piano)
    file, _ = monta_con_animazioni(archivio, "zf", tmp_path)
    f = fotogramma(file, 0.5)
    assert vicino(f[960, 1000], ROSSO) and vicino(f[100, 1000], ROSSO) and vicino(f[1800, 50], ROSSO)


def test_uno_zoom_che_cresce_parte_da_tutto_e_arriva_alla_parte(archivio, scrivi_piano, tempo, tmp_path):
    piano = {"quadro": "girato-pieno", "sorgenti": {"t": {"file": tempo}}, "scene": [{"nome": "s", "pezzi": [{"sorgente": "t", "da": 0.6, "a": 2.4, "zoom": {"da": 1, "a": 2, "centro": [0.25, 0.5]}}]}],
             "sottotitoli": {"modo": "nessuno"}}
    scrivi_piano("zc", piano)
    file, i = monta_con_animazioni(archivio, "zc", tmp_path)
    inizio, fine = fotogramma(file, 0.05), fotogramma(file, i["durata"] - 0.1)
    assert vicino(inizio[960, 1000], BLU) and vicino(fine[960, 1000], ROSSO)
    meta = fotogramma(file, i["durata"] / 2)
    colonne_blu = int((np.abs(meta[960] - np.array(BLU)).sum(axis=1) < 90).sum())
    assert 0 < colonne_blu < int((np.abs(inizio[960] - np.array(BLU)).sum(axis=1) < 90).sum())


def test_un_quadro_nuovo_con_gli_stessi_strati_funziona_senza_toccare_il_codice(tmp_path, fonti):
    repo = tmp_path / "repo"
    repo.mkdir()
    stile = json.loads((REPO / "stile.json").read_text(encoding="utf-8"))
    sagoma = next(s for s in stile["quadri"]["sagoma-su-animazione"]["strati"] if s["tipo"] == "sagoma")
    stile["quadri"]["girato-e-sagoma"] = {"fondo": "nero", "strati": [{"tipo": "girato", "area": [0, 0, 1080, 1920]}, sagoma],
                                          "sottotitoli": {"x": 540, "y": 1500, "largo": 900, "ancora": "centro"}, "titolo": {"x": 540, "y": 200, "ancora": "centro"}}
    (repo / "stile.json").write_text(json.dumps(stile), encoding="utf-8")
    shutil.copytree(REPO / "font", repo / "font")
    archivio = Archivio(radice=tmp_path / "arc", repo=repo)
    file = f"{GIORNO}/tempo.mp4"
    _collega(fonti / "tempo.mp4", archivio.grezzo(file))
    cartella = archivio.preparati(file)
    cartella.mkdir(parents=True)
    (cartella / "parole.json").write_text(json.dumps(PAROLE_TEMPO), encoding="utf-8")
    _collega(fonti / "tempo.onda.bin", cartella / "onda.bin")
    _collega(fonti / "sagoma.webm", cartella / "sagoma.webm")
    (archivio.radice / "video" / "n").mkdir(parents=True)
    piano = {"quadro": "girato-e-sagoma", "sorgenti": {"t": {"file": file}}, "scene": [{"nome": "s", "pezzi": [{"sorgente": "t", "da": 0.6, "a": 2.4}]}], "sottotitoli": {"modo": "nessuno"}}
    (archivio.radice / "video" / "n" / "piano.json").write_text(json.dumps(piano), encoding="utf-8")
    video, _ = monta_con_animazioni(archivio, "n", tmp_path)
    f = fotogramma(video, 0.8)
    assert vicino(f[800, 300], ROSSO) and vicino(f[1500, 350], BLU) and vicino(f[1500, 950], BLU) and vicino(f[1500, 20], ROSSO)


def test_la_scena_puo_avere_un_altro_quadro(archivio, scrivi_piano, tempo, tmp_path):
    scrivi_piano("m", {"quadro": "girato-pieno", "sorgenti": {"t": {"file": tempo}},
                       "scene": [{"nome": "uno", "pezzi": [{"sorgente": "t", "da": 0.6, "a": 1.6}]}, {"nome": "due", "quadro": "solo-animazione", "animazione": "x", "pezzi": [{"sorgente": "t", "da": 0.6, "a": 1.6}]}],
                       "sottotitoli": {"modo": "nessuno"}})
    file, _ = monta_con_animazioni(archivio, "m", tmp_path)
    r = json.loads((archivio.lavoro("m") / "risolto.json").read_text(encoding="utf-8"))
    assert vicino(fotogramma(file, 0.3)[960, 810], BLU)
    assert vicino(fotogramma(file, r["scene"][1]["inizio"] + 0.3)[960, 810], ARANCIO)


def test_un_tratto_gia_reso_non_si_rifa(archivio, scrivi_piano, tempo, tmp_path):
    scrivi_piano("c", {"quadro": "girato-pieno", "sorgenti": {"t": {"file": tempo}}, "scene": [{"nome": "s", "pezzi": [{"sorgente": "t", "da": 0.6, "a": 2.4}]}], "sottotitoli": {"modo": "nessuno"}})
    monta_con_animazioni(archivio, "c", tmp_path)
    prima = {f.name: f.stat().st_mtime_ns for f in (archivio.lavoro("c") / "tratti").iterdir()}
    monta(archivio, "c", avanza=lambda *_: None)
    assert {f.name: f.stat().st_mtime_ns for f in (archivio.lavoro("c") / "tratti").iterdir()} == prima


def test_un_quadro_che_non_c_e_dice_quali_ci_sono(archivio, scrivi_piano, tempo, tmp_path):
    scrivi_piano("q", {"quadro": "inventato", "sorgenti": {"t": {"file": tempo}}, "scene": [{"nome": "s", "pezzi": [{"sorgente": "t", "da": 0.6, "a": 2.4}]}]})
    with pytest.raises(Errore, match=r"quadro «inventato» \(della scena «s»\) non c'è in stile.json: i quadri sono sagoma-su-animazione"):
        monta(archivio, "q", avanza=lambda *_: None)


def test_un_quadro_con_animazione_senza_animazione_nella_scena_si_dice(archivio, scrivi_piano, tempo):
    scrivi_piano("q", {"quadro": "solo-animazione", "sorgenti": {"t": {"file": tempo}}, "scene": [{"nome": "s", "pezzi": [{"sorgente": "t", "da": 0.6, "a": 2.4}]}], "sottotitoli": {"modo": "nessuno"}})
    with pytest.raises(Errore, match="mostra un'animazione, ma non ne dichiara una"):
        monta(archivio, "q", avanza=lambda *_: None)


def test_le_animazioni_non_rese_si_chiedono_a_chi_le_fa(archivio, scrivi_piano, tempo, monkeypatch):
    from motore import animazioni

    scrivi_piano("an", {"quadro": "solo-animazione", "sorgenti": {"t": {"file": tempo}}, "scene": [{"nome": "s", "animazione": "uno", "pezzi": [{"sorgente": "t", "da": 0.6, "a": 2.4}], "ancore": [["t", 1.0, 0.5]]}],
                        "sottotitoli": {"modo": "nessuno"}})
    chiamate = []
    finge_bun(monkeypatch, lambda comando, **resto: chiamate.append((comando, resto)) or type("R", (), {"returncode": 0, "stdout": "animazioni: rese 1, già rese 0\n", "stderr": ""})())
    r = risolvi(archivio, "an")
    with pytest.raises(Errore, match="senza scrivere «uno.mp4»"):
        animazioni.rendi(archivio, "an", r, avanza=lambda *_: None)
    [(comando, resto)] = chiamate
    assert comando[:6] == ["bun", "run", "--cwd", "animazioni", "registra", "--"] and resto["cwd"] == archivio.repo
    tempi = json.loads((archivio.lavoro("an") / "tempi.json").read_text(encoding="utf-8"))
    assert tempi == {"uno": {"durata": r["scene"][0]["durata"], "ancore": r["scene"][0]["ancore"], "tempi": {}, "formato": {"largo": 1080, "alto": 1920}, "lingua": "it"}}
    assert comando[comando.index("--tempi") + 1] == str(archivio.lavoro("an") / "tempi.json") and comando[comando.index("--uscita") + 1] == str(archivio.lavoro("an") / "scene")


def test_le_misure_di_un_video_ruotato_sono_quelle_a_schermo(tmp_path):
    """Un video girato in verticale col telefono è scritto in orizzontale e ruotato: chi lo inquadra vuole le misure che si vedono."""
    diritto, ruotato = tmp_path / "diritto.mp4", tmp_path / "ruotato.mov"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=duration=1:size=320x240:rate=10", "-pix_fmt", "yuv420p", str(diritto)], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-display_rotation", "90", "-i", str(diritto), "-c", "copy", str(ruotato)], check=True)
    assert (info(diritto)["largo"], info(diritto)["alto"]) == (320, 240)
    assert (info(ruotato)["largo"], info(ruotato)["alto"]) == (240, 320)


def test_inquadra_riempie_tenendo_il_centro_e_contiene_senza_tagliare():
    rect, misure, _ = inquadra(2160, 3840, None, (1080, 1920), "riempi")
    assert rect == (0, 0, 2160, 3840) and misure == (1080, 1920)
    rect, misure, _ = inquadra(1920, 1080, None, (1080, 1920), "riempi", (0.75, 0.5))
    assert rect[2] / rect[3] == pytest.approx(1080 / 1920, abs=0.01) and rect[0] + rect[2] / 2 == pytest.approx(0.75 * 1920, abs=2)
    rect, misure, _ = inquadra(1920, 1080, None, (1080, 1160), "contieni")
    assert rect == (0, 0, 1920, 1080) and misure == (1080, 608)
    rect, misure, _ = inquadra(1920, 1080, [720, 280, 960, 720], (1080, 810), "contieni")
    assert rect == (720, 280, 960, 720) and misure == (1080, 810)


def test_lo_zoom_resta_dentro_il_rettangolo():
    rect, _, _ = inquadra(1920, 1080, [720, 280, 960, 720], (1080, 810), "contieni", None, 2.0, (0.0, 0.0))
    assert rect == (720, 280, 480, 360)
    rect, _, _ = inquadra(1920, 1080, [720, 280, 960, 720], (1080, 810), "contieni", None, 2.0, (1.0, 1.0))
    assert rect == (1200, 640, 480, 360)


def test_il_riquadro_che_evidenzia_sta_attorno_alla_zona_indicata(archivio, scrivi_piano, tempo, tmp_path):
    scrivi_piano("e", {"quadro": "girato-pieno", "sorgenti": {"t": {"file": tempo}}, "sottotitoli": {"modo": "nessuno"},
                       "scene": [{"nome": "s", "pezzi": [{"sorgente": "t", "da": 0.6, "a": 1.4, "evidenzia": [600, 500, 400, 400]}, {"sorgente": "t", "da": 3.5, "a": 4.4}]}]})
    file, _ = monta_con_animazioni(archivio, "e", tmp_path)
    rosso = np.array(archivio.colore(archivio.stile["evidenzia"]["colore"]))
    con, senza = fotogramma(file, 0.3), fotogramma(file, 1.2)
    assert np.abs(con[503, 800] - rosso).sum() < 60 and np.abs(con[700, 603] - rosso).sum() < 60
    assert np.abs(con[700, 800] - np.array(BLU)).sum() < 60
    assert np.abs(senza[503, 800] - np.array(BLU)).sum() < 60


def test_la_scheda_animata_copre_solo_il_suo_riquadro_sopra_lo_schermo(archivio, scrivi_piano, tempo, tmp_path):
    scrivi_piano("s", {"quadro": "schermo-con-scheda", "sorgenti": {"t": {"file": tempo}}, "sottotitoli": {"modo": "nessuno"},
                       "scene": [{"nome": "s", "animazione": "uno", "pezzi": [{"sorgente": "t", "da": 0.6, "a": 2.4}]}]})
    file, _ = monta_con_animazioni(archivio, "s", tmp_path)
    x, y, largo, alto = next(s for s in archivio.stile["quadri"]["schermo-con-scheda"]["strati"] if s["tipo"] == "animazione")["ritaglio"]
    f = fotogramma(file, 0.8)
    assert vicino(f[y + alto // 2, x + largo // 2], ARANCIO) and vicino(f[y + 5, x + 5], ARANCIO) and vicino(f[y + alto - 5, x + largo - 5], ARANCIO)
    assert vicino(f[y - 20, 300], ROSSO) and vicino(f[y + alto + 20, 950], BLU) and vicino(f[300, 300], ROSSO)


def test_una_scena_trasparente_lascia_vedere_il_girato_dove_non_disegna(archivio, scrivi_piano, tempo, tmp_path):
    scrivi_piano("s", {"quadro": "schermo-con-scheda", "sorgenti": {"t": {"file": tempo}}, "sottotitoli": {"modo": "nessuno"},
                       "scene": [{"nome": "s", "animazione": "uno", "pezzi": [{"sorgente": "t", "da": 0.6, "a": 2.4}]}]})
    rendi_animazioni(archivio, "s", tmp_path)
    maschera = archivio.lavoro("s") / "scene" / "uno.alfa.mkv"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=1080x1920:r=30:d=3", "-vf", "drawbox=x=0:y=0:w=540:h=1920:color=white:t=fill,format=gray",
                    "-c:v", "ffv1", str(maschera)], check=True)
    with mock.patch.object(animazioni, "rendi"):
        file = monta(archivio, "s", avanza=lambda *_: None)
    x, y, largo, alto = next(s for s in archivio.stile["quadri"]["schermo-con-scheda"]["strati"] if s["tipo"] == "animazione")["ritaglio"]
    f = fotogramma(file, 0.8)
    assert vicino(f[y + alto // 2, 300], ARANCIO)
    assert vicino(f[y + alto // 2, 800], BLU)


def test_le_scene_che_il_piano_non_chiede_piu_si_tolgono_con_la_loro_maschera(archivio, scrivi_piano, tempo, tmp_path):
    scrivi_piano("sc", {**_piano_di_prova(tempo, [(0.6, 1.6)], [(3.4, 4.5)]), "quadro": "solo-animazione",
                        "scene": [{"nome": "s0", "animazione": "uno", "pezzi": _pezzi((0.6, 1.6))}]})
    scene = archivio.lavoro("sc") / "scene"
    scene.mkdir(parents=True, exist_ok=True)
    (scene / "due.alfa.mkv").write_bytes(b"x")
    monta_con_animazioni(archivio, "sc", tmp_path)
    assert sorted(f.name for f in scene.iterdir()) == ["uno.mp4"]


def test_la_parte_sta_in_un_cartello_suo_sotto_il_titolo(archivio, scrivi_piano, tempo, tmp_path):
    scrivi_piano("p", {"quadro": "girato-pieno", "sorgenti": {"t": {"file": tempo}}, "scene": [{"nome": "s", "pezzi": [{"sorgente": "t", "da": 0.6, "a": 2.4}]}],
                       "sottotitoli": {"modo": "nessuno"}, "titolo": {"testo": "Un titolo", "parte": "Parte 2"}})
    file, _ = monta_con_animazioni(archivio, "p", tmp_path)
    f = fotogramma(file, 0.8)
    y = archivio.stile["quadri"]["girato-pieno"]["titolo"]["y"]
    giallo = np.abs(f - np.array(archivio.colore(archivio.stile["titolo"]["parte"]["colore"]))).sum(axis=2) < 90
    righe = np.flatnonzero(giallo.any(axis=1))
    colonne = np.flatnonzero(giallo.any(axis=0))
    assert giallo.sum() > 300 and righe[0] > y + 38 and righe[-1] < y + 250
    assert (colonne[0] + colonne[-1]) / 2 == pytest.approx(540, abs=12)
    stacco = f[y + 38:righe[0], 540]
    assert (np.abs(stacco - np.array(BLU)).sum(axis=1) < 90).any() or (np.abs(stacco - np.array(ROSSO)).sum(axis=1) < 90).any()


def test_il_suono_di_un_tratto_parte_col_suo_primo_fotogramma(archivio, scrivi_piano, tempo, fonti, tmp_path):
    grezzo = archivio.grezzo(tempo)
    grezzo.unlink()
    subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-i", str(fonti / "tempo.mp4"), "-itsoffset", "0.7", "-i", str(fonti / "tempo.mp4"), "-map", "0:v", "-map", "1:a", "-c", "copy", str(grezzo)], check=True)
    scrivi_piano("r", {"quadro": "girato-pieno", "sorgenti": {"t": {"file": tempo}}, "scene": [{"nome": "s", "pezzi": [{"sorgente": "t", "da": 0.6, "a": 2.4}]}], "sottotitoli": {"modo": "nessuno"}})
    monta_con_animazioni(archivio, "r", tmp_path)
    tratti = [*(archivio.lavoro("r") / "tratti").glob("*.mkv")]
    assert tratti and all(info(f)["audio_parte"] == 0 for f in tratti)


def test_il_girato_c_e_dal_primo_fotogramma_anche_se_la_sorgente_ha_i_fotogrammi_sfasati(archivio, scrivi_piano, tempo, fonti, tmp_path):
    grezzo = archivio.grezzo(tempo)
    grezzo.unlink()
    subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-itsoffset", "0.02", "-i", str(fonti / "tempo.mp4"), "-i", str(fonti / "tempo.mp4"), "-map", "0:v", "-map", "1:a", "-c", "copy", str(grezzo)], check=True)
    scrivi_piano("f", {"quadro": "girato-pieno", "sorgenti": {"t": {"file": tempo}}, "scene": [{"nome": "s", "pezzi": [{"sorgente": "t", "da": 0.6, "a": 2.4}]}], "sottotitoli": {"modo": "nessuno"}})
    file, _ = monta_con_animazioni(archivio, "f", tmp_path)
    f = fotogramma(file, 0.0)
    assert vicino(f[960, 270], ROSSO) and vicino(f[960, 810], BLU)


QUATTRO_E_MEZZO = "geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='if(between(X,300,799)*between(Y,if(lt(T,4.5),600,300),1899),255,0)'"


def _pezzi(*intervalli):
    return [{"sorgente": "t", "da": da, "a": a} for da, a in intervalli]


def _nomi(archivio, slug, estensione="mkv"):
    r = risolvi(archivio, slug, scrivi=False)
    comp = Compositore(archivio, slug, archivio.piano(slug), r)
    return [comp.file_tratto(k, estensione).name for k in range(len(r["tratti"]))]


@pytest.fixture
def con_sagoma(archivio, scrivi_piano, tempo, animazione):
    def _prepara(slug, *intervalli):
        scrivi_piano(slug, {"quadro": "sagoma-su-animazione", "sorgenti": {"t": {"file": tempo}}, "sottotitoli": {"modo": "nessuno"},
                            "scene": [{"nome": "s", "animazione": "uno", "pezzi": _pezzi(*intervalli)}]})
        if not (archivio.lavoro(slug) / "scene" / "uno.mp4").exists():
            animazione(slug, "uno")

    return _prepara


def test_allargare_un_tratto_di_un_decimo_non_cambia_il_nome_degli_altri(archivio, con_sagoma, monkeypatch):
    # Il volume misurato su tutti i tratti di una sorgente si sposta di pochi millesimi: nel filtro entra con un decimale e basta.
    lufs = archivio.stile["voce"]["lufs"]
    monkeypatch.setattr(quadri, "misura_lufs", lambda sorgente, usi: lufs - 5.0049 - 0.02 * (sum(d for _, d in usi) - 2.8))
    con_sagoma("v", (0.6, 1.6), (1.7, 2.5), (3.5, 4.5))
    prima = _nomi(archivio, "v")
    con_sagoma("v", (0.6, 1.6), (1.7, 2.5), (3.5, 4.6))
    dopo = _nomi(archivio, "v")
    assert len(prima) == len(dopo) >= 3
    assert dopo[:-1] == prima[:-1] and dopo[-1] != prima[-1]


def test_sottotitoli_e_titolo_del_quadro_non_cambiano_i_tratti_ma_uno_strato_si(archivio, con_sagoma):
    # Sottotitoli e titolo si mettono dopo, sul video intero: spostarli non deve ricomporre un solo tratto.
    con_sagoma("v", (0.6, 1.6), (1.7, 2.5))
    prima = _nomi(archivio, "v")
    quadro = archivio.stile["quadri"]["sagoma-su-animazione"]
    quadro["sottotitoli"]["y"] += 40
    quadro["titolo"]["y"] += 40
    assert _nomi(archivio, "v") == prima
    sagoma = next(s for s in quadro["strati"] if s["tipo"] == "sagoma")
    sagoma["sfuma"] += 4
    assert not set(_nomi(archivio, "v")) & set(prima)


def test_la_testa_si_misura_solo_per_i_tratti_non_ancora_misurati(archivio, con_sagoma, monkeypatch):
    chiamate, originale = [], quadri.ffmpeg
    monkeypatch.setattr(quadri, "ffmpeg", lambda *argomenti: chiamate.append(argomenti) or originale(*argomenti))
    campioni = archivio.stile["sagoma"]["campioni"]
    con_sagoma("m", (0.6, 1.6), (1.7, 2.5), (3.5, 4.5))
    _nomi(archivio, "m")
    assert len(chiamate) == campioni
    con_sagoma("m", (0.7, 1.5), (1.7, 2.4), (3.6, 4.4))
    _nomi(archivio, "m")
    assert len(chiamate) == campioni
    con_sagoma("m", (0.6, 1.6), (1.7, 2.5), (3.5, 4.6))
    _nomi(archivio, "m")
    assert len(chiamate) == 2 * campioni
    teste = json.loads((archivio.lavoro("m") / "teste.json").read_text(encoding="utf-8"))
    # La voce finisce a 4,5 s: il tratto allargato fino a 4,6 si ferma a un margine dalla voce, al fotogramma.
    assert [v["intervalli"] for v in teste.values()] == [[[0.6, 1.6], [1.7, 2.5], [3.5, pytest.approx(4.533, abs=0.001)]]]


def test_un_tratto_con_la_testa_piu_alta_cambia_la_scala_e_i_nomi_di_tutti(archivio, con_sagoma, tempo):
    # La sagoma ha la testa a 600 fino a 4,5 s e a 300 dopo.
    sagoma = archivio.preparati(tempo) / "sagoma.webm"
    sagoma.unlink()
    _ffmpeg("-f", "lavfi", "-i", f"color=c=blue:s=1080x1920:r=30:d=8,format=yuva420p,{QUATTRO_E_MEZZO}", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-deadline", "realtime", "-cpu-used", "8",
            "-b:v", "0", "-crf", "20", "-auto-alt-ref", "0", sagoma)
    con_sagoma("a", (0.6, 1.6), (1.7, 2.5), (3.5, 4.4))
    prima = _nomi(archivio, "a")
    assert [v["cima"] for v in json.loads((archivio.lavoro("a") / "teste.json").read_text(encoding="utf-8")).values()] == [600]
    con_sagoma("a", (0.6, 1.6), (1.7, 2.5), (3.5, 4.4), (6.0, 6.8))
    dopo = _nomi(archivio, "a")
    assert [v["cima"] for v in json.loads((archivio.lavoro("a") / "teste.json").read_text(encoding="utf-8")).values()] == [300]
    assert all(n not in dopo for n in prima)


def _piano_di_prova(tempo, *scene):
    return {"quadro": "girato-pieno", "sorgenti": {"t": {"file": tempo}}, "sottotitoli": {"modo": "nessuno"}, "scene": [{"nome": f"s{n}", "pezzi": _pezzi(*intervalli)} for n, intervalli in enumerate(scene)]}


@pytest.mark.parametrize("solo_suono", [False, True])
def test_due_tratti_con_la_stessa_impronta_si_compongono_una_volta_sola(archivio, scrivi_piano, tempo, tmp_path, monkeypatch, solo_suono):
    scrivi_piano("d", _piano_di_prova(tempo, [(0.6, 2.4)], [(0.6, 2.4)], [(3.4, 4.6)]))
    nomi = _nomi(archivio, "d", "wav" if solo_suono else "mkv")
    assert len(nomi) > len(set(nomi)) >= 2
    if solo_suono:
        stile = archivio.stile
        archivio.__dict__["stile"] = {**stile, "uscita": {**stile["uscita"], "tratti_massimo_mb": 0}}
    scritti, originale = [], quadri.ffmpeg_su
    monkeypatch.setattr(quadri, "ffmpeg_su", lambda uscita, *argomenti: scritti.append(uscita.name) or originale(uscita, *argomenti))
    monta_con_animazioni(archivio, "d", tmp_path)
    assert sorted(n for n in scritti if n != ".campione.mkv") == sorted(set(nomi))
    assert {f.name for f in (archivio.lavoro("d") / "tratti").iterdir()} == set(nomi)


def test_dei_tratti_restano_i_due_montaggi_piu_recenti_e_gli_avanzi_spariscono(archivio, scrivi_piano, tempo, tmp_path):
    generazioni = []
    for fine in (2.4, 2.3, 2.2):
        scrivi_piano("p", _piano_di_prova(tempo, [(0.6, fine), (3.4, 4.6)]))
        cartella = archivio.lavoro("p") / "tratti"
        if generazioni:
            for avanzo in (".abc.parziale.mkv", ".campione.mkv", ".def.parziale.wav"):
                (cartella / avanzo).write_bytes(b"x")
        monta_con_animazioni(archivio, "p", tmp_path)
        generazioni.append(set(_nomi(archivio, "p")))
        assert {f.name for f in cartella.iterdir()} == set().union(*generazioni[-2:])
    assert generazioni[0] - generazioni[1] - generazioni[2]
    scritto = json.loads((archivio.lavoro("p") / "montaggio.json").read_text(encoding="utf-8"))
    assert set(scritto["tratti"]) == generazioni[2] and set(scritto["tratti_prima"]) == generazioni[1]


def test_rimontare_lo_stesso_piano_non_butta_il_montaggio_di_prima(archivio, scrivi_piano, tempo, tmp_path):
    scrivi_piano("r", _piano_di_prova(tempo, [(0.6, 2.4)]))
    monta_con_animazioni(archivio, "r", tmp_path)
    prima = set(_nomi(archivio, "r"))
    scrivi_piano("r", _piano_di_prova(tempo, [(0.6, 2.3)]))
    monta_con_animazioni(archivio, "r", tmp_path)
    monta(archivio, "r", avanza=lambda *_: None)
    assert prima <= {f.name for f in (archivio.lavoro("r") / "tratti").iterdir()}


def test_le_scene_che_il_piano_non_chiede_piu_si_tolgono_col_loro_file_di_impronta(archivio, scrivi_piano, tempo, tmp_path):
    def scrivi(*sigle):
        scrivi_piano("sc", {**_piano_di_prova(tempo, [(0.6, 1.6)], [(3.4, 4.5)]), "quadro": "solo-animazione",
                            "scene": [{"nome": f"s{n}", "animazione": sigla, "pezzi": _pezzi(*([(0.6, 1.6)] if n == 0 else [(3.4, 4.5)]))} for n, sigla in enumerate(sigle)]})

    scrivi("uno", "due")
    monta_con_animazioni(archivio, "sc", tmp_path)
    scene = archivio.lavoro("sc") / "scene"
    for sigla in ("uno", "due"):
        (scene / f"{sigla}.mp4.impronta").write_text("x", encoding="utf-8")
    scrivi("uno")
    monta_con_animazioni(archivio, "sc", tmp_path)
    assert sorted(f.name for f in scene.iterdir()) == ["uno.mp4", "uno.mp4.impronta"]


def test_la_riga_finale_di_monta_dice_quanto_pesa_il_lavoro(archivio, scrivi_piano, tempo, tmp_path):
    scrivi_piano("w", _piano_di_prova(tempo, [(0.6, 2.4)]))
    righe = []
    rendi_animazioni(archivio, "w", tmp_path)
    with mock.patch.object(animazioni, "rendi"):
        monta(archivio, "w", avanza=righe.append)
    peso = sum(f.stat().st_size for f in archivio.lavoro("w").rglob("*") if f.is_file()) / 1e6
    assert righe[-1].startswith("finale.mp4: ") and righe[-1].endswith(f"lavoro/ {peso:.1f} MB")


def test_ai_lati_dell_animazione_il_fondo_del_quadro_ha_lo_stesso_colore(archivio, scrivi_piano, tempo, tmp_path):
    """Le animazioni escono in bt709, come le fa `registra`: il fondo del quadro attorno deve combaciare, o si vede una riga."""
    scrivi_piano("a", {"quadro": "solo-animazione", "sorgenti": {"t": {"file": tempo}}, "scene": [{"nome": "s", "animazione": "uno", "pezzi": [{"sorgente": "t", "da": 0.6, "a": 2.4}]}], "sottotitoli": {"modo": "nessuno"}})
    r = risolvi(archivio, "a")
    cartella = archivio.lavoro("a") / "scene"
    cartella.mkdir(parents=True, exist_ok=True)
    carta = archivio.stile["colori"]["carta"].replace("#", "0x")
    for sigla, voce in animazioni.richiesta(r, archivio.stile).items():
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"color=c={carta}:s={voce['formato']['largo']}x{voce['formato']['alto']}:r=30:d={voce['durata']:.4f},format=rgb24",
                        "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p", "-c:v", "libx264", "-colorspace", "bt709", str(cartella / f"{sigla}.mp4")], check=True)
    with mock.patch.object(animazioni, "rendi"):
        file = monta(archivio, "a", avanza=lambda *_: None)
    f = fotogramma(file, 0.5)
    m = archivio.stile["telefono"]["margine_lati"]
    assert vicino(f[960, m // 2], f[960, 3 * m], 1), (f[960, m // 2], f[960, 3 * m])


@pytest.fixture(params=["png", "jpeg"])
def memo_e_foto(request, archivio, fonti):
    """Una voce registrata a parte (solo audio, coi toni di `tempo`) e una foto verde, nell'archivio di prova: torna i loro nomi."""
    memo, foto = f"{GIORNO}/memo.m4a", f"{GIORNO}/foto.{request.param}"
    archivio.grezzo(memo).parent.mkdir(parents=True, exist_ok=True)
    _ffmpeg("-i", fonti / "tempo.mp4", "-vn", "-c:a", "aac", "-b:a", "128k", archivio.grezzo(memo))
    _ffmpeg("-f", "lavfi", "-i", "color=c=0x39E75F:s=600x1200", "-frames:v", "1", archivio.grezzo(foto))
    cartella = archivio.preparati(memo)
    cartella.mkdir(parents=True, exist_ok=True)
    (cartella / "parole.json").write_text(json.dumps(PAROLE_TEMPO), encoding="utf-8")
    _collega(fonti / "tempo.onda.bin", cartella / "onda.bin")
    return memo, foto


def test_una_voce_solo_audio_si_monta_sopra_una_foto(archivio, scrivi_piano, memo_e_foto, tmp_path):
    memo, foto = memo_e_foto
    assert not info(archivio.grezzo(memo))["ha_video"] and info(archivio.grezzo(foto))["durata"] > 0
    scrivi_piano("m", {"quadro": "girato-pieno", "sorgenti": {"v": {"file": memo}, "f": {"file": foto}},
                       "scene": [{"nome": "s", "pezzi": [{"sorgente": "v", "da": 0.6, "a": 2.4, "girato": {"sorgente": "f", "fermo": 0}}]}], "sottotitoli": {"modo": "nessuno"}})
    file, i = monta_con_animazioni(archivio, "m", tmp_path)
    assert i["ha_audio"] and energia_a(audio(file, 0.3, 0.5), 440) > 10 * energia_a(audio(file, 0.3, 0.5), 1000)
    assert vicino(fotogramma(file, 0.5)[960, 540], VERDE) and vicino(fotogramma(file, i["durata"] - 0.1)[960, 540], VERDE)


def test_una_voce_solo_audio_senza_immagine_lo_dice(archivio, scrivi_piano, memo_e_foto):
    memo, _ = memo_e_foto
    scrivi_piano("n", {"quadro": "girato-pieno", "sorgenti": {"v": {"file": memo}}, "scene": [{"nome": "s", "pezzi": [{"sorgente": "v", "da": 0.6, "a": 2.4}]}],
                       "sottotitoli": {"modo": "nessuno"}})
    with pytest.raises(Errore, match="solo audio"):
        risolvi(archivio, "n")
