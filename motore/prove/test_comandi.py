import json
import os
import shutil
import subprocess
from pathlib import Path
from unittest import mock

import numpy as np
import pytest
from PIL import Image

from motore import animazioni, prepara
from motore import monta as monta_modulo
from motore import risolvi as risolvi_modulo
from motore.__main__ import main
from motore.controlla import controlla
from motore.copertina import copertina
from motore.errori import Errore
from motore.media import info
from motore.monta import leggero, monta
from motore.risolvi import risolvi
from motore.voce import leggi_onda

from .aiuti import finge_bun, fotogramma, monta_con_animazioni, rendi_animazioni, vicino
from .conftest import AllineatoreFinto, GIORNO, PAROLE_PAROLE, PAROLE_TEMPO, TONI_TEMPO, _collega, _ffmpeg


@pytest.fixture
def grezzo(archivio, fonti):
    file = f"{GIORNO}/tempo.mp4"
    _collega(fonti / "tempo.mp4", archivio.grezzo(file))
    return file


@pytest.fixture
def senza_modelli(monkeypatch, fonti):
    chiamate = {"trascrivi": 0, "scontorna": 0}

    def trascrivi(sorgente, stile, nomi=(), lingua=None):
        chiamate["trascrivi"] += 1
        return PAROLE_TEMPO, ["00:00 uno due", "00:03 tre quattro"]

    def scontornatore(stile):
        chiamate["scontorna"] += 1
        raise AssertionError("prepara non scontorna: la sagoma la fa monta, coi soli tratti montati")

    monkeypatch.setattr(prepara, "trascrivi", trascrivi)
    monkeypatch.setattr(prepara, "scontornatore", scontornatore)
    return chiamate


def test_prepara_un_file_fa_onda_miniatura_leggero_e_parole(archivio, grezzo, senza_modelli):
    cartella = prepara.prepara_file(archivio, grezzo, avanza=lambda *_: None)
    assert sorted(f.name for f in cartella.iterdir()) == ["leggero.mp4", "miniatura.jpg", "onda.bin", "parole.json"]
    assert json.loads((cartella / "parole.json").read_text(encoding="utf-8")) == PAROLE_TEMPO
    db = leggi_onda(cartella / "onda.bin")
    assert len(db) == pytest.approx(800, abs=2)
    for da, a in TONI_TEMPO:
        assert (db[int(da * 100) + 2:int(a * 100) - 2] > -20).all()
    assert (db[260:340] < -90).all()
    assert Image.open(cartella / "miniatura.jpg").size == (202, 360)
    i = info(cartella / "leggero.mp4")
    assert (i["largo"], i["alto"]) == (406, 720) and i["durata"] == pytest.approx(8, abs=0.1)


def test_cio_che_c_e_gia_non_si_rifa(archivio, grezzo, senza_modelli):
    cartella = prepara.prepara_file(archivio, grezzo, avanza=lambda *_: None)
    visti = {f.name: f.stat().st_mtime_ns for f in cartella.iterdir()}
    righe = []
    prepara.prepara_file(archivio, grezzo, avanza=righe.append)
    assert righe == [] and senza_modelli["trascrivi"] == 1
    assert {f.name: f.stat().st_mtime_ns for f in cartella.iterdir()} == visti


def test_i_file_lunghi_hanno_anche_il_parlato_col_minuto(archivio, grezzo, senza_modelli):
    archivio.stile["preparati"]["trascrizione_oltre"] = 5
    cartella = prepara.prepara_file(archivio, grezzo, avanza=lambda *_: None)
    assert (cartella / "trascrizione.txt").read_text(encoding="utf-8") == "00:00 uno due\n00:03 tre quattro\n"


class _Parola:
    def __init__(self, word, start, end):
        self.word, self.start, self.end = word, start, end


class _Segmento:
    def __init__(self, parole):
        self.words, self.start, self.text = parole, parole[0].start, " ".join(p.word for p in parole)


def test_la_trascrizione_va_a_tratti_di_voce_uno_per_uno(archivio, monkeypatch):
    """Ogni tratto di voce si trascrive da solo, senza il testo di prima: su un file lungo whisper altrimenti cade in loop, e
    unisce le false partenze in una frase sola. I tempi tornano quelli del file."""
    chiamate = []

    class Finto:
        def transcribe(self, audio, **opzioni):
            chiamate.append((len(audio), opzioni))
            return iter([_Segmento([_Parola(" ciao", 0.1, 0.4), _Parola(" tutti", 0.5, 0.9)])]), None

    monkeypatch.setattr(prepara, "_voci", {prepara.dispositivo("trascrizione"): Finto()})
    monkeypatch.setattr(prepara, "pcm_16k", lambda file: np.zeros(16000 * 70, dtype=np.float32))
    monkeypatch.setattr(prepara, "tratti_di_voce", lambda x, stile: [(16000, 32000), (16000 * 65, 16000 * 66)])
    parole, righe = prepara.trascrivi(archivio.grezzo(f"{GIORNO}/memo.m4a"), archivio.stile, nomi=["Bellini", "Rossetti"])
    assert [campioni for campioni, _ in chiamate] == [16000, 16000]
    assert all(o["condition_on_previous_text"] is False and o["vad_filter"] is False for _, o in chiamate)
    assert all("Bellini" in o["initial_prompt"] and "Rossetti" in o["initial_prompt"] for _, o in chiamate)
    assert parole == [{"p": "ciao", "da": 1.1, "a": 1.4}, {"p": "tutti", "da": 1.5, "a": 1.9}, {"p": "ciao", "da": 65.1, "a": 65.4}, {"p": "tutti", "da": 65.5, "a": 65.9}]
    assert righe == ["00:01 ciao tutti", "01:05 ciao tutti"]


def test_una_parola_molto_lunga_si_ritrascrive_da_sola(archivio, monkeypatch):
    """Una falsa partenza seguita dalla frase ridetta, nello stesso tratto di voce: whisper la scrive come una parola sola di
    qualche secondo («migliorare», 4,6 s su IMG_5464). Riascoltata da sola, la sua finestra dà le parole vere."""
    lunga = archivio.stile["preparati"]["parola_lunga"]
    chiamate = []

    class Finto:
        def transcribe(self, audio, **opzioni):
            chiamate.append(len(audio))
            if len(audio) == 16000 * 10:
                return iter([_Segmento([_Parola(" per", 0.0, 0.5), _Parola(" migliorare", 0.5, 1.0 + lunga), _Parola(" i", 1.0 + lunga, 1.2 + lunga),
                                        _Parola(" ciao", 2.0 + lunga, 3.0 + lunga * 2)])]), None
            if len(audio) == 16000 * (0.5 + lunga):
                return iter([_Segmento([_Parola(" il", 0.1, 0.3), _Parola(" piano", 0.3, 0.6), _Parola(" migliorare", 0.7, 1.0)])]), None
            return iter([_Segmento([_Parola(" ciao", 0.0, 0.4)])]), None

    monkeypatch.setattr(prepara, "_voci", {prepara.dispositivo("trascrizione"): Finto()})
    monkeypatch.setattr(prepara, "pcm_16k", lambda file: np.zeros(16000 * 20, dtype=np.float32))
    monkeypatch.setattr(prepara, "tratti_di_voce", lambda x, stile: [(16000, 16000 * 11)])
    parole, righe = prepara.trascrivi(archivio.grezzo(f"{GIORNO}/memo.m4a"), archivio.stile)
    assert chiamate == [16000 * 10, 16000 * (0.5 + lunga), 16000 * (1.0 + lunga)]
    assert [w["p"] for w in parole] == ["per", "il", "piano", "migliorare", "i", "ciao"], "una ritrascrizione che dà una parola sola la lascia com'era"
    assert parole[1:4] == [{"p": "il", "da": 1.6, "a": 1.8}, {"p": "piano", "da": 1.8, "a": 2.1}, {"p": "migliorare", "da": 2.2, "a": 2.5}]
    assert righe == ["00:01 per il piano migliorare i ciao"]


def test_senza_nomi_non_si_suggerisce_niente(archivio, monkeypatch):
    chiamate = []

    class Finto:
        def transcribe(self, audio, **opzioni):
            chiamate.append(opzioni)
            return iter([]), None

    monkeypatch.setattr(prepara, "_voci", {prepara.dispositivo("trascrizione"): Finto()})
    monkeypatch.setattr(prepara, "pcm_16k", lambda file: np.zeros(16000 * 3, dtype=np.float32))
    monkeypatch.setattr(prepara, "tratti_di_voce", lambda x, stile: [(0, 16000)])
    assert prepara.trascrivi(archivio.grezzo(f"{GIORNO}/memo.m4a"), archivio.stile) == ([], [])
    assert chiamate[0]["initial_prompt"] is None


def test_le_parole_nel_silenzio_non_entrano(archivio, grezzo, monkeypatch, senza_modelli):
    """Whisper inventa parole nel silenzio («Grazie» in coda a una ripresa): una parola sotto la soglia del silenzio dalla sua
    prima sillaba fino a poco dopo la sua fine si toglie. Fra 2,5 e 3,5 s la sorgente sintetica tace."""
    inventata = {"p": "Grazie.", "da": 2.6, "a": 3.0}
    monkeypatch.setattr(prepara, "trascrivi", lambda sorgente, stile, nomi=(), lingua=None: ([*PAROLE_TEMPO[:2], inventata, *PAROLE_TEMPO[2:]], []))
    cartella = prepara.prepara_file(archivio, grezzo, avanza=lambda *_: None)
    assert json.loads((cartella / "parole.json").read_text(encoding="utf-8")) == PAROLE_TEMPO


def test_i_nomi_del_piano_arrivano_alla_trascrizione(archivio, scrivi_piano, grezzo, monkeypatch, senza_modelli):
    visti = []
    monkeypatch.setattr(prepara, "trascrivi", lambda sorgente, stile, nomi=(), lingua=None: (visti.append(list(nomi)), (PAROLE_TEMPO, []))[1])
    scrivi_piano("nomi", {"quadro": "girato-pieno", "sorgenti": {"t": {"file": grezzo}}, "scene": [{"nome": "s", "pezzi": [{"sorgente": "t"}]}],
                          "sottotitoli": {"nomi": ["Navier-Stokes"]}})
    prepara.prepara_piano(archivio, "nomi", avanza=lambda *_: None)
    assert visti == [["Navier-Stokes"]]


def test_prepara_trascrive_le_riprese_prima_delle_scene(archivio, scrivi_piano, grezzo, senza_modelli):
    """Le riprese si trascrivono appena arrivano, per scegliere quali montare: il piano non ha ancora scene."""
    scrivi_piano("nuovo", {"quadro": "girato-pieno", "sorgenti": {"t": {"file": grezzo}}, "scene": []})
    prepara.prepara_piano(archivio, "nuovo", avanza=lambda *_: None)
    assert (archivio.preparati(grezzo) / "parole.json").exists()


def test_prepara_non_scontorna_mai_il_girato(archivio, scrivi_piano, grezzo, senza_modelli):
    scrivi_piano("con", {"quadro": "sagoma-su-animazione", "sorgenti": {"t": {"file": grezzo}}, "scene": [{"nome": "s", "animazione": "x", "pezzi": [{"sorgente": "t"}]}]})
    prepara.prepara_piano(archivio, "con", avanza=lambda *_: None)
    assert senza_modelli["scontorna"] == 0 and not (archivio.preparati(grezzo) / "sagoma.webm").exists()


def test_un_file_che_non_c_e_dice_dove_metterlo(archivio):
    with pytest.raises(Errore, match=r"il file «2026-10-09/nulla.mp4» non c'è in .*grezzo"):
        prepara.prepara_file(archivio, "2026-10-09/nulla.mp4")


def test_il_piano_con_una_sorgente_non_dichiarata_non_si_prepara(archivio, scrivi_piano, grezzo):
    scrivi_piano("x", {"quadro": "girato-pieno", "sorgenti": {"t": {"file": grezzo}}, "scene": [{"nome": "s", "pezzi": [{"sorgente": "z"}]}]})
    with pytest.raises(Errore, match="«z»"):
        prepara.prepara_piano(archivio, "x", avanza=lambda *_: None)


@pytest.fixture
def cli(archivio, monkeypatch, capsys):
    monkeypatch.setenv("MANGO_ANIMATION_LAVORO", str(archivio.radice.parent))

    def lancia(*argomenti):
        codice = main(list(argomenti))
        fuori = capsys.readouterr()
        return codice, fuori.out, fuori.err

    return lancia


def test_da_riga_di_comando_valida_dice_si_o_cosa_non_va(cli, scrivi_piano, prepara_sintetico):
    file = prepara_sintetico("tempo", PAROLE_TEMPO)
    scrivi_piano("buono", {"quadro": "girato-pieno", "sorgenti": {"t": {"file": file}}, "scene": [{"nome": "s", "pezzi": [{"sorgente": "t"}]}]})
    codice, fuori, errori = cli("valida", "buono")
    assert codice == 0 and "il piano va" in fuori and errori == ""
    scrivi_piano("rotto", {"quadro": "girato-pieno", "sorgenti": {"t": {"file": file}}, "scene": [{"nome": "s", "pezzi": [{"sorgente": "z", "vista": "boh"}]}]})
    codice, fuori, errori = cli("valida", "rotto")
    assert codice == 1 and "il piano non va" in errori and "«z»" in errori and "il piano va" not in fuori


def test_un_video_che_non_c_e_si_dice(cli):
    codice, _, errori = cli("risolvi", "nessuno")
    assert codice == 1 and "il video «nessuno» non esiste" in errori


def test_risolvi_e_parole_da_riga_di_comando(cli, archivio, scrivi_piano, prepara_sintetico, finto):
    file = prepara_sintetico("parole", PAROLE_PAROLE)
    scrivi_piano("p", {"quadro": "girato-pieno", "sorgenti": {"p": {"file": file}}, "scene": [{"nome": "s", "pezzi": [{"sorgente": "p", "minuto": "00:00", "dice": "ciao a tutti"}]}]})
    codice, fuori, _ = cli("risolvi", "p")
    assert codice == 0 and "risolto: 1 tratti" in fuori and (archivio.lavoro("p") / "risolto.json").exists()
    (archivio.lavoro("p") / "risolto.json").unlink()
    codice, fuori, _ = cli("parole", "p")
    assert codice == 0 and "tratto 0: s · p" in fuori and "ciao (1.00→" in fuori and "tutti (2.20→" in fuori
    assert not (archivio.lavoro("p") / "risolto.json").exists()


def test_un_errore_di_prepara_arriva_in_italiano_su_stderr(cli, scrivi_piano):
    scrivi_piano("x", {"quadro": "girato-pieno", "sorgenti": {"t": {"file": "2026-10-09/nulla.mp4"}}, "scene": [{"nome": "s", "pezzi": [{"sorgente": "t"}]}]})
    codice, _, errori = cli("risolvi", "x")
    assert codice == 1 and "nulla.mp4" in errori and "metti il file lì" in errori


def test_foto_scrive_un_fotogramma_per_secondo_chiesto(cli, archivio, scrivi_piano, prepara_sintetico, tmp_path):
    file = prepara_sintetico("tempo", PAROLE_TEMPO)
    scrivi_piano("f", {"quadro": "girato-pieno", "sorgenti": {"t": {"file": file}}, "scene": [{"nome": "s", "pezzi": [{"sorgente": "t", "da": 0.6, "a": 2.4}]}], "sottotitoli": {"modo": "nessuno"}})
    codice, _, errori = cli("foto", "f", "0.5")
    assert codice == 1 and "non è ancora montato" in errori
    monta_con_animazioni(archivio, "f", tmp_path)
    codice, fuori, _ = cli("foto", "f", "0.5", "1")
    assert codice == 0 and Image.open(archivio.lavoro("f") / "foto" / "0.5.jpg").size == (1080, 1920) and (archivio.lavoro("f") / "foto" / "1.jpg").exists()
    codice, _, errori = cli("foto", "f", "99")
    assert codice == 1 and "non arriva al secondo 99" in errori and "dura 1.8" in errori


def test_foto_della_prova_coi_suoi_secondi(cli, archivio):
    (archivio.radice / "video" / "p").mkdir(parents=True)
    uscite = archivio.uscite("p")
    uscite.mkdir()
    codice, _, errori = cli("foto", "p", "1", "--prova")
    assert codice == 1 and "non c'è la prova" in errori
    _ffmpeg("-f", "lavfi", "-i", "color=c=green:s=1080x1920:r=30:d=3", "-c:v", "libx264", "-pix_fmt", "yuv420p", uscite / "prova.mp4")
    codice, fuori, _ = cli("foto", "p", "1", "--prova")
    assert codice == 0 and Image.open(archivio.lavoro("p") / "foto" / "prova-1.jpg").getpixel((540, 960))[1] > 100
    codice, _, errori = cli("foto", "p", "5", "--prova")
    assert codice == 1 and "dura 3.0" in errori
    with pytest.raises(SystemExit):
        cli("foto", "p", "1", "--prova", "--anteprima")


def test_foto_di_un_file_del_girato_coi_suoi_secondi(cli, archivio, prepara_sintetico):
    file = prepara_sintetico("tempo", PAROLE_TEMPO)
    codice, fuori, _ = cli("foto-girato", file, "0.5", "2")
    cartella = archivio.preparati(file) / "foto"
    assert codice == 0 and fuori.split() == [str(cartella / "0.5.jpg"), str(cartella / "2.jpg")]
    assert Image.open(cartella / "0.5.jpg").size == (1080, 1920)
    codice, _, errori = cli("foto-girato", file, "99")
    assert codice == 1 and "non arriva al secondo 99" in errori
    codice, _, errori = cli("foto-girato", f"{GIORNO}/non-c-e.mp4", "1")
    assert codice == 1 and "non c'è" in errori


def test_prepara_file_vuole_un_percorso_dentro_grezzo(cli, archivio, tmp_path):
    fuori = tmp_path / "altrove.mp4"
    fuori.touch()
    codice, _, errori = cli("prepara-file", str(fuori))
    assert codice == 1 and "non sta in" in errori


def test_le_animazioni_chiedono_sempre_tutte_le_scene_a_registra_che_salta_le_gia_rese(archivio, scrivi_piano, prepara_sintetico, tmp_path, monkeypatch):
    file = prepara_sintetico("tempo", PAROLE_TEMPO)
    piano = {"quadro": "solo-animazione", "sorgenti": {"t": {"file": file}}, "scene": [{"nome": "s", "animazione": "uno", "pezzi": [{"sorgente": "t", "da": 0.6, "a": 2.4}], "ancore": [["t", 1.0, 0.5]]}],
             "sottotitoli": {"modo": "nessuno"}}
    scrivi_piano("an", piano)
    r = rendi_animazioni(archivio, "an", tmp_path)
    chiamate = []

    def registra(comando, **k):
        chiamate.append(json.loads(open(comando[comando.index("--tempi") + 1], encoding="utf-8").read()))
        return type("R", (), {"returncode": 0, "stdout": "[1/1] uno: già resa con questi tempi e questi sorgenti\nanimazioni: rese 0, già rese 1\n", "stderr": ""})()

    finge_bun(monkeypatch, registra)
    righe = []
    animazioni.rendi(archivio, "an", r, avanza=righe.append)
    assert chiamate == [animazioni.richiesta(r, archivio.stile)] and righe == ["animazioni: rese 0, già rese 1"]
    scrivi_piano("an", {**piano, "scene": [{**piano["scene"][0], "ancore": [["t", 1.2, 0.5]]}]})
    animazioni.rendi(archivio, "an", risolvi(archivio, "an"), avanza=lambda *_: None)
    assert len(chiamate) == 2 and chiamate[1]["uno"]["ancore"] != chiamate[0]["uno"]["ancore"]
    finge_bun(monkeypatch, lambda comando, **k: type("R", (), {"returncode": 0, "stdout": "", "stderr": ""})())
    with pytest.raises(Errore, match="non hanno detto quante scene"):
        animazioni.rendi(archivio, "an", risolvi(archivio, "an"), avanza=lambda *_: None)
    finge_bun(monkeypatch, lambda comando, **k: type("R", (), {"returncode": 1, "stdout": "", "stderr": "scena rotta"})())
    with pytest.raises(Errore, match="non sono state rese: scena rotta"):
        animazioni.rendi(archivio, "an", risolvi(archivio, "an"), avanza=lambda *_: None)


def test_le_animazioni_vedono_la_cartella_di_lavoro_dell_archivio_anche_senza_la_variabile(archivio, tmp_path, monkeypatch):
    monkeypatch.delenv("MANGO_ANIMATION_LAVORO", raising=False)
    visti = []
    finge_bun(monkeypatch, lambda comando, **k: visti.append(k["env"]["MANGO_ANIMATION_LAVORO"]) or type("R", (), {"returncode": 0, "stdout": "animazioni: rese 0, già rese 0\n", "stderr": ""})())
    animazioni.registra(archivio, {}, tmp_path / "tempi.json", tmp_path / "scene")
    assert visti == [str(archivio.radice.parent)]


def test_due_scene_con_la_stessa_animazione_si_dicono(archivio, scrivi_piano, prepara_sintetico):
    file = prepara_sintetico("tempo", PAROLE_TEMPO)
    scrivi_piano("an", {"quadro": "solo-animazione", "sorgenti": {"t": {"file": file}},
                        "scene": [{"nome": "uno", "animazione": "x", "pezzi": [{"sorgente": "t", "da": 0.6, "a": 1.6}]}, {"nome": "due", "animazione": "x", "pezzi": [{"sorgente": "t", "da": 0.6, "a": 1.6}]}]})
    with pytest.raises(Errore, match="le scene uno, due usano la stessa animazione «x»"):
        animazioni.rendi(archivio, "an", risolvi(archivio, "an"), avanza=lambda *_: None)


def durata_audio(file):
    esito = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=duration", "-of", "csv=p=0", str(file)], capture_output=True, text=True, check=True)
    return float(esito.stdout.strip())


def test_la_copertina_mette_la_sagoma_del_primo_fotogramma_sul_disegno(archivio, scrivi_piano, prepara_sintetico, tmp_path):
    file = prepara_sintetico("tempo", PAROLE_TEMPO)
    piano = {"quadro": "sagoma-su-animazione", "sorgenti": {"t": {"file": file}}, "scene": [{"nome": "s", "animazione": "uno", "pezzi": [{"sorgente": "t", "da": 0.6, "a": 2.4}]}],
             "sottotitoli": {"modo": "nessuno"}, "titolo": {"testo": "Un titolo"}}
    scrivi_piano("cp", piano)
    disegno = tmp_path / "disegno.png"
    Image.new("RGB", (1080, 1920), (10, 200, 10)).save(disegno)
    Image.new("RGB", (100, 100)).save(tmp_path / "piccolo.png")
    with pytest.raises(Errore, match="la copertina dev'essere 1080×1920"):
        copertina(archivio, "cp", tmp_path / "piccolo.png", avanza=lambda *_: None)
    with pytest.raises(Errore, match="dì quale disegno"):
        copertina(archivio, "cp", avanza=lambda *_: None)
    righe = []
    copertina(archivio, "cp", disegno, avanza=righe.append)
    assert any("il piano dichiara `copertina`" in r for r in righe)
    c = np.asarray(Image.open(archivio.uscite("cp") / "copertina.png")).astype(int)
    assert vicino(c[1500, 350], (0, 0, 255)) and vicino(c[1500, 950], (10, 200, 10)) and vicino(c[880, 400], (10, 200, 10))
    y = archivio.stile["quadri"]["sagoma-su-animazione"]["titolo"]["y"]
    assert (np.abs(c[y - 38:y + 38, 400:680] - np.array([0, 0, 0])).sum(axis=2) < 30).mean() > 0.3
    assert not (archivio.uscite("cp") / "con-copertina.mp4").exists(), "il video con la copertina lo fa monta"
    scrivi_piano("cp", {**piano, "copertina": {"disegno": str(disegno)}})
    finale, i = monta_con_animazioni(archivio, "cp", tmp_path)
    con = archivio.uscite("cp") / "con-copertina.mp4"
    assert con.samefile(finale), "il video con la copertina è lo stesso file, non una seconda codifica"
    assert i["durata"] == pytest.approx(risolvi(archivio, "cp", scrivi=False)["durata"] + 1 / 30, abs=0.04)
    assert durata_audio(finale) == pytest.approx(i["durata"], abs=0.03)
    assert vicino(fotogramma(finale, 0.0)[1500, 950], (10, 200, 10), 20) and vicino(fotogramma(finale, 0.0)[1500, 350], (0, 0, 255), 60)
    assert not vicino(fotogramma(finale, 0.2)[1500, 950], (10, 200, 10), 60), "dal secondo fotogramma c'è il video"
    assert json.loads((archivio.uscite("cp").parent / "lavoro" / "risolto.json").read_text(encoding="utf-8"))["copertina"] == {"disegno": str(disegno)}


def test_la_copertina_puo_prendere_la_sagoma_da_un_altro_istante_del_video(archivio, scrivi_piano, prepara_sintetico, tmp_path):
    # Nella ripresa la persona sta a destra (colonne 300-799) fino a 1,5 s, poi a sinistra (100-599): il primo fotogramma
    # la mostra a destra, la copertina chiesta a 0,8 s del video (dentro il secondo pezzo) la mostra a sinistra.
    file = prepara_sintetico("tempo", PAROLE_TEMPO, sagoma=False)
    _ffmpeg("-f", "lavfi", "-i", "color=c=blue:s=1080x1920:r=30:d=3,format=yuva420p,geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='if(if(lt(T,1.5),between(X,300,799),between(X,100,599))*between(Y,600,1899),255,0)'",
            "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-deadline", "realtime", "-cpu-used", "8", "-b:v", "0", "-crf", "20", "-auto-alt-ref", "0", archivio.preparati(file) / "sagoma.webm")
    scrivi_piano("ci", {"quadro": "sagoma-su-animazione", "sorgenti": {"t": {"file": file}}, "scene": [{"nome": "s", "animazione": "uno", "pezzi": [{"sorgente": "t", "da": 0.6, "a": 1.2}, {"sorgente": "t", "da": 2.0, "a": 2.4}]}],
                        "sottotitoli": {"modo": "nessuno"}})
    disegno = tmp_path / "disegno.png"
    Image.new("RGB", (1080, 1920), (10, 200, 10)).save(disegno)
    copertina(archivio, "ci", disegno, istante=0.8, avanza=lambda *_: None)
    c = np.asarray(Image.open(archivio.uscite("ci") / "copertina.png")).astype(int)
    stile = archivio.stile["quadri"]["sagoma-su-animazione"]["strati"][1]
    scala = (1920 - stile["testa"]) / (1920 - (600 - stile["aria"]) - stile["aria"]) + stile["scala_margine"]
    assert vicino(c[1500, round(stile["x"] + 200 * scala)], (0, 0, 255), 40)
    assert vicino(c[1500, round(stile["x"] + 700 * scala)], (10, 200, 10), 40)


def test_la_copertina_di_un_video_senza_viso_e_l_immagine_col_titolo_e_la_parte(archivio, scrivi_piano, prepara_sintetico, tmp_path):
    file = prepara_sintetico("tempo", PAROLE_TEMPO)
    disegno = tmp_path / "pagina.png"
    Image.new("RGB", (1080, 1920), (10, 200, 10)).save(disegno)
    scrivi_piano("sv", {"quadro": "girato-pieno", "sorgenti": {"t": {"file": file}}, "scene": [{"nome": "s", "pezzi": [{"sorgente": "t", "da": 0.6, "a": 2.4}]}],
                        "sottotitoli": {"modo": "nessuno"}, "titolo": {"testo": "Un titolo", "parte": "Parte 2", "da": 0, "a": 1}, "copertina": {"disegno": str(disegno)}})
    monta_con_animazioni(archivio, "sv", tmp_path)
    c = np.asarray(Image.open(archivio.uscite("sv") / "copertina.png")).astype(int)
    y = archivio.stile["quadri"]["girato-pieno"]["titolo"]["y"]
    giallo = np.abs(c - np.array(archivio.colore(archivio.stile["titolo"]["parte"]["colore"]))).sum(axis=2) < 60
    assert vicino(c[1500, 540], (10, 200, 10)) and (np.abs(c[y - 38:y + 38, 400:680]).sum(axis=2) < 30).mean() > 0.3
    assert giallo.sum() > 300 and np.flatnonzero(giallo.any(axis=1))[0] > y + 38
    assert vicino(fotogramma(archivio.uscite("sv") / "con-copertina.mp4", 0.0)[1500, 540], (10, 200, 10), 30)


def test_la_copertina_cerca_il_disegno_anche_nella_cartella_del_video(archivio, scrivi_piano, prepara_sintetico, tmp_path):
    file = prepara_sintetico("tempo", PAROLE_TEMPO)
    scrivi_piano("cd", {"quadro": "girato-pieno", "sorgenti": {"t": {"file": file}}, "scene": [{"nome": "s", "pezzi": [{"sorgente": "t", "da": 0.6, "a": 2.4}]}], "sottotitoli": {"modo": "nessuno"},
                        "copertina": {"disegno": "materiali/pagina.png"}})
    (archivio.video("cd") / "materiali").mkdir()
    Image.new("RGB", (1080, 1920), (10, 200, 10)).save(archivio.video("cd") / "materiali" / "pagina.png")
    with pytest.raises(Errore, match=r"il disegno «materiali/manca\.png» non c'è"):
        copertina(archivio, "cd", "materiali/manca.png", avanza=lambda *_: None)
    copertina(archivio, "cd", avanza=lambda *_: None)
    assert vicino(np.asarray(Image.open(archivio.uscite("cd") / "copertina.png")).astype(int)[1500, 540], (10, 200, 10))
    altrove = tmp_path / "altrove.png"
    Image.new("RGB", (1080, 1920), (200, 10, 10)).save(altrove)
    copertina(archivio, "cd", str(altrove), avanza=lambda *_: None)
    assert vicino(np.asarray(Image.open(archivio.uscite("cd") / "copertina.png")).astype(int)[1500, 540], (200, 10, 10))


def test_la_copia_leggera_e_il_video_completo_con_la_copertina(archivio, scrivi_piano, prepara_sintetico, tmp_path):
    """Il video completo è quello con la copertina: la copia leggera parte da lì, e senza copertina nel piano non si fa."""
    file = prepara_sintetico("tempo", PAROLE_TEMPO)
    piano = {"quadro": "girato-pieno", "sorgenti": {"t": {"file": file}}, "scene": [{"nome": "s", "pezzi": [{"sorgente": "t", "da": 0.6, "a": 2.4}]}], "sottotitoli": {"modo": "nessuno"}}
    scrivi_piano("lg", piano)
    monta_con_animazioni(archivio, "lg", tmp_path)
    with pytest.raises(Errore, match="dichiara `copertina` nel piano"):
        leggero(archivio, "lg", avanza=lambda *_: None)
    disegno = tmp_path / "verde.png"
    Image.new("RGB", (1080, 1920), (10, 200, 10)).save(disegno)
    scrivi_piano("lg", {**piano, "copertina": {"disegno": str(disegno)}})
    monta_con_animazioni(archivio, "lg", tmp_path)
    copia = leggero(archivio, "lg", avanza=lambda *_: None)
    assert vicino(fotogramma(copia, 0.0, 720, 1280)[1000, 360], (10, 200, 10), 30)
    assert info(copia)["durata"] == pytest.approx(info(archivio.uscite("lg") / "con-copertina.mp4")["durata"], abs=0.05)


def test_controlla_riascolta_il_montato(archivio, scrivi_piano, prepara_sintetico, finto, tmp_path):
    file = prepara_sintetico("parole", PAROLE_PAROLE)
    scrivi_piano("k", {"quadro": "girato-pieno", "sorgenti": {"p": {"file": file}}, "scene": [{"nome": "s", "pezzi": [{"sorgente": "p", "minuto": "00:00", "dice": "ciao a tutti"}]}], "sottotitoli": {"modo": "nessuno"}})
    with pytest.raises(Errore, match="per controllare servono il risolto e il montato"):
        controlla(archivio, "k", avanza=lambda *_: None)
    monta_con_animazioni(archivio, "k", tmp_path)
    esito = controlla(archivio, "k", avanza=lambda *_: None, allineatore=AllineatoreFinto(), trascrittore=lambda audio, lingua: "ciao a tutti")
    scritto = json.loads((archivio.lavoro("k") / "controllo.json").read_text(encoding="utf-8"))
    assert scritto == esito
    assert set(esito) == {"quando", "del_finale", "durata", "silenzi", "esitazioni", "senza_parole", "colpi", "parole_fuori_posto", "sentito", "differenze", "doppioni", "parole_lunghe",
                          "sottotitoli", "tagli_nel_parlato", "lampi", "bordi", "zona_alta", "copertina", "spente"}
    assert esito["spente"] == []
    assert esito["bordi"] == [] and esito["lampi"] == [] and esito["silenzi"] == [] and esito["esitazioni"] == [] and esito["parole_fuori_posto"] == [] and esito["differenze"] == [] and esito["tagli_nel_parlato"] == []
    assert esito["senza_parole"] == [] and esito["colpi"] == [] and esito["doppioni"] == [] and esito["zona_alta"] == [] and esito["sottotitoli"] is None and esito["copertina"] == [{"cosa": "manca"}]
    assert esito["durata"] == pytest.approx(risolvi(archivio, "k", scrivi=False)["durata"], abs=0.1)
    storto = controlla(archivio, "k", avanza=lambda *_: None, allineatore=AllineatoreFinto(), trascrittore=lambda audio, lingua: "ciao a tanti")
    assert [(d["voluto"], d["sentito"]) for d in storto["differenze"]] == [("tutti", "tanti")]


def test_controlla_trova_il_fotogramma_che_lampeggia(archivio, scrivi_piano, prepara_sintetico, finto, tmp_path):
    file = prepara_sintetico("parole", PAROLE_PAROLE)
    scrivi_piano("k", {"quadro": "girato-pieno", "sorgenti": {"p": {"file": file}}, "scene": [{"nome": "s", "pezzi": [{"sorgente": "p", "minuto": "00:00", "dice": "ciao a tutti"}]}], "sottotitoli": {"modo": "nessuno"}})
    monta_con_animazioni(archivio, "k", tmp_path)
    finale, col_lampo = archivio.uscite("k") / "finale.mp4", tmp_path / "lampo.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-i", str(finale), "-vf", "drawbox=c=white:t=fill:enable='eq(n,12)'", "-c:a", "copy", str(col_lampo)], check=True)
    os.replace(col_lampo, finale)
    esito = controlla(archivio, "k", avanza=lambda *_: None, allineatore=AllineatoreFinto(), trascrittore=lambda audio, lingua: "ciao a tutti")
    assert [l["a"] for l in esito["lampi"]] == [0.4]


def test_controlla_trova_le_parole_spostate_e_i_silenzi_rimasti(archivio, scrivi_piano, prepara_sintetico, finto, tmp_path):
    file = prepara_sintetico("parole", PAROLE_PAROLE)
    scrivi_piano("k", {"quadro": "girato-pieno", "sorgenti": {"p": {"file": file}}, "scene": [{"nome": "s", "pezzi": [{"sorgente": "p", "minuto": "00:00", "dice": "tutti buona sera"}]}], "sottotitoli": {"modo": "nessuno"}})
    monta_con_animazioni(archivio, "k", tmp_path)
    r = json.loads((archivio.lavoro("k") / "risolto.json").read_text(encoding="utf-8"))
    r["parole"][0]["da"] += 0.5
    r["parole"][0]["a"] += 0.5
    (archivio.lavoro("k") / "risolto.json").write_text(json.dumps(r), encoding="utf-8")
    esito = controlla(archivio, "k", avanza=lambda *_: None, allineatore=AllineatoreFinto(), trascrittore=lambda audio, lingua: "tutti buona sera")
    assert [p["parola"] for p in esito["parole_fuori_posto"]] == ["tutti"]
    assert esito["parole_fuori_posto"][0]["trovata"][0] == pytest.approx(esito["parole_fuori_posto"][0]["attesa"][0] - 0.5, abs=0.05)


def test_controlla_trova_i_bordi_muti(archivio, scrivi_piano, prepara_sintetico, finto, tmp_path, monkeypatch):
    """Il taglio a tempo toglie il silenzio ai bordi: qui lo si salta, per avere due bordi muti da trovare."""
    monkeypatch.setattr(risolvi_modulo, "a_tempo", lambda sorgente, pezzo, stile: [(pezzo["da"], pezzo["a"])])
    file = prepara_sintetico("tempo", PAROLE_TEMPO)
    scrivi_piano("k", {"quadro": "girato-pieno", "sorgenti": {"t": {"file": file}},
                       "scene": [{"nome": "s", "pezzi": [{"sorgente": "t", "da": 0.5, "a": 3.4, "pausa": 5}, {"sorgente": "t", "da": 5.0, "a": 7.1, "pausa": 5}]}], "sottotitoli": {"modo": "nessuno"}})
    monta_con_animazioni(archivio, "k", tmp_path)
    esito = controlla(archivio, "k", avanza=lambda *_: None, allineatore=AllineatoreFinto(), trascrittore=lambda audio, lingua: "uno due tre quattro")
    assert [(b["tratto"], b["lato"], b["cosa"]) for b in esito["bordi"]] == [(0, "coda", "muto"), (1, "testa", "muto")]
    assert [b["dura"] for b in esito["bordi"]] == [pytest.approx(0.9, abs=0.05), pytest.approx(1.0, abs=0.05)]
    assert esito["bordi"][0]["a"] == pytest.approx(2.9, abs=0.05) and esito["bordi"][1]["a"] == pytest.approx(2.9, abs=0.05)


def test_controlla_trova_il_suono_dopo_l_ultima_parola_e_i_tagli_nella_voce(archivio, scrivi_piano, prepara_sintetico, finto, tmp_path):
    file = prepara_sintetico("parole", PAROLE_PAROLE)
    scrivi_piano("k", {"quadro": "girato-pieno", "sorgenti": {"p": {"file": file}}, "scene": [{"nome": "s", "pezzi": [{"sorgente": "p", "minuto": "00:00", "dice": "ciao a tutti"}]}], "sottotitoli": {"modo": "nessuno"}})
    monta_con_animazioni(archivio, "k", tmp_path)
    r = json.loads((archivio.lavoro("k") / "risolto.json").read_text(encoding="utf-8"))
    r["parole"][2]["a"] -= 0.5
    r["tratti"][0]["legato"] = [-12.0, None]
    (archivio.lavoro("k") / "risolto.json").write_text(json.dumps(r), encoding="utf-8")
    esito = controlla(archivio, "k", avanza=lambda *_: None, allineatore=AllineatoreFinto(), trascrittore=lambda audio, lingua: "ciao a tutti")
    assert [(b["tratto"], b["lato"], b["cosa"]) for b in esito["bordi"]] == [(0, "testa", "voce"), (0, "coda", "rumore")]
    assert esito["bordi"][0]["db"] == -12.0 and esito["bordi"][1]["dura"] == pytest.approx(0.5 + 0.04, abs=0.1)


def test_controlla_trova_il_vuoto_pieno_di_suono_fra_due_parole(archivio, scrivi_piano, prepara_sintetico, finto, tmp_path):
    file = prepara_sintetico("parole", PAROLE_PAROLE)
    scrivi_piano("k", {"quadro": "girato-pieno", "sorgenti": {"p": {"file": file}}, "scene": [{"nome": "s", "pezzi": [{"sorgente": "p", "minuto": "00:00", "dice": "ciao a tutti"}]}], "sottotitoli": {"modo": "nessuno"}})
    monta_con_animazioni(archivio, "k", tmp_path)
    r = json.loads((archivio.lavoro("k") / "risolto.json").read_text(encoding="utf-8"))
    fine = r["parole"][1]["a"]
    r["parole"][2]["da"] = fine + 0.9
    r["parole"][2]["a"] = fine + 1.2
    (archivio.lavoro("k") / "risolto.json").write_text(json.dumps(r), encoding="utf-8")
    esito = controlla(archivio, "k", avanza=lambda *_: None, allineatore=AllineatoreFinto(), trascrittore=lambda audio, lingua: "ciao a tutti")
    assert esito["esitazioni"] == [{"a": round(fine, 2), "dura": 0.9, "fra": ["a", "tutti"], "numero": False}]


FASI_DI_MONTA = ["animazioni", "sagoma", "tratti", "uscita"]


def _fasi(archivio, slug):
    scritto = json.loads((archivio.lavoro(slug) / "montaggio.json").read_text(encoding="utf-8"))
    return scritto, {f["nome"]: f for f in scritto["fasi"]}


def test_monta_scrive_i_tempi_di_ogni_fase_e_a_piano_uguale_non_rifa_niente(archivio, fonti, scrivi_piano, prepara_sintetico, monkeypatch):
    file = prepara_sintetico("tempo", PAROLE_TEMPO, sagoma=False)
    scrivi_piano("mt", {"quadro": "sagoma-su-animazione", "sorgenti": {"t": {"file": file}}, "scene": [{"nome": "s", "animazione": "uno", "pezzi": [{"sorgente": "t", "da": 0.6, "a": 2.4}]}], "sottotitoli": {"modo": "nessuno"}})
    vero = subprocess.run

    def bun(comando, **k):
        if comando[0] != "bun":
            return vero(comando, **k)
        tempi = json.loads(open(comando[comando.index("--tempi") + 1], encoding="utf-8").read())
        uscita = Path(comando[comando.index("--uscita") + 1])
        rese = [s for s in tempi if not (uscita / f"{s}.mp4").exists()]
        for sigla, voce in ((s, tempi[s]) for s in rese):
            vero(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"color=c=0xFF8C00:s={voce['formato']['largo']}x{voce['formato']['alto']}:r=30:d={voce['durata']:.4f}", "-c:v", "libx264", "-pix_fmt", "yuv420p", str(Path(comando[comando.index("--uscita") + 1]) / f"{sigla}.mp4")], check=True)
        return type("R", (), {"returncode": 0, "stdout": f"animazioni: rese {len(rese)}, già rese {len(tempi) - len(rese)}\n", "stderr": ""})()

    monkeypatch.setattr(animazioni.shutil, "which", lambda nome: "bun")
    monkeypatch.setattr(subprocess, "run", bun)
    def scontorno(sorgente, cartella, intervalli, stile, scritto):
        cartella.mkdir(parents=True, exist_ok=True)
        for n, (da, a) in enumerate(intervalli):
            shutil.copy(fonti / "sagoma.webm", cartella / f"{n}.webm")
            scritto({"da": da, "a": a, "file": f"sagoma/{n}.webm", "inizio": da})

    monkeypatch.setattr(prepara, "scontorna_intervalli", scontorno)
    righe = []
    monta(archivio, "mt", avanza=righe.append)
    scritto, fasi = _fasi(archivio, "mt")
    quanti = len(risolvi(archivio, "mt", scrivi=False)["tratti"])
    assert scritto["impronta"] == risolvi(archivio, "mt", scrivi=False)["impronta"] and scritto["quando"]
    assert list(fasi) == FASI_DI_MONTA and all(f["secondi"] >= 0 for f in fasi.values())
    assert [(f["fatti"], f["saltati"]) for f in fasi.values()] == [(1, 0), (1, 0), (quanti, 0), (1, 0)]
    assert [r for r in righe if r.startswith("fase ")] == [f"fase {n}: {f['secondi']:.1f} s, fatti {f['fatti']}, saltati {f['saltati']}" for n, f in fasi.items()]
    monta(archivio, "mt", avanza=lambda *_: None)
    scritto, fasi = _fasi(archivio, "mt")
    assert list(fasi) == FASI_DI_MONTA
    assert [(f["fatti"], f["saltati"]) for f in fasi.values()] == [(0, 1), (0, 1), (0, quanti), (1, 0)]


def test_controlla_aggiunge_le_sue_fasi_e_un_piano_nuovo_riparte_da_capo(archivio, scrivi_piano, prepara_sintetico, finto, tmp_path):
    file = prepara_sintetico("parole", PAROLE_PAROLE)
    piano = {"quadro": "sagoma-su-animazione", "sorgenti": {"p": {"file": file}}, "scene": [{"nome": "s", "animazione": "uno", "pezzi": [{"sorgente": "p", "minuto": "00:00", "dice": "ciao a tutti"}]}],
             "sottotitoli": {"modo": "nessuno"}, "titolo": {"testo": "Un titolo"}}
    scrivi_piano("cf", piano)
    monta_con_animazioni(archivio, "cf", tmp_path)
    controlla(archivio, "cf", avanza=lambda *_: None, allineatore=AllineatoreFinto(), trascrittore=lambda audio, lingua: "ciao a tutti")
    scritto, fasi = _fasi(archivio, "cf")
    assert list(fasi) == [*FASI_DI_MONTA, "ascolto", "parole", "trascrizione", "fotogrammi"] and fasi["parole"]["fatti"] == 3
    assert scritto["impronta"] == risolvi(archivio, "cf", scrivi=False)["impronta"]
    controlla(archivio, "cf", avanza=lambda *_: None, allineatore=AllineatoreFinto(), trascrittore=lambda audio, lingua: "ciao a tutti")
    assert list(_fasi(archivio, "cf")[1]) == [*FASI_DI_MONTA, "ascolto", "parole", "trascrizione", "fotogrammi"]
    scrivi_piano("cf", {**piano, "titolo": {"testo": "Un altro titolo"}})
    monta_con_animazioni(archivio, "cf", tmp_path)
    nuovo, fasi = _fasi(archivio, "cf")
    assert list(fasi) == FASI_DI_MONTA and nuovo["impronta"] != scritto["impronta"]


FRASE_PIANO_CAMBIATO = "il piano è cambiato mentre montavo: riparto con quello nuovo"


def _piano_con_titolo(file, titolo):
    return {"quadro": "sagoma-su-animazione", "sorgenti": {"p": {"file": file}}, "scene": [{"nome": "s", "animazione": "uno", "pezzi": [{"sorgente": "p", "minuto": "00:00", "dice": "ciao a tutti"}]}],
            "sottotitoli": {"modo": "nessuno"}, "titolo": {"testo": titolo}}


def _rendi_che_riscrive_il_piano(archivio, slug, file, scrivi_piano, tmp_path, quante, chiamate):
    """Un finto `rendi` che a ogni chiamata, finché `quante` non basta, riscrive il piano con un titolo nuovo: come un agente che lo ritocca a montaggio in corso."""
    rendi_animazioni(archivio, slug, tmp_path)

    def rendi(archivio_, slug_, risolto, avanza):
        chiamate.append((archivio.uscite(slug) / "finale.mp4").exists())
        if len(chiamate) <= quante:
            scrivi_piano(slug, _piano_con_titolo(file, f"Titolo {len(chiamate)}"))

    return rendi


def test_se_il_piano_cambia_a_meta_il_montaggio_lo_dice_e_riparte_con_quello_nuovo(archivio, scrivi_piano, prepara_sintetico, finto, tmp_path, monkeypatch):
    file = prepara_sintetico("parole", PAROLE_PAROLE)
    scrivi_piano("pc", _piano_con_titolo(file, "Titolo 0"))
    chiamate, righe = [], []
    monkeypatch.setattr(animazioni, "rendi", _rendi_che_riscrive_il_piano(archivio, "pc", file, scrivi_piano, tmp_path, 1, chiamate))
    finale = monta(archivio, "pc", avanza=righe.append)
    assert chiamate == [False, False] and righe.count(FRASE_PIANO_CAMBIATO) == 1
    assert finale.exists() and not (finale.parent / ".finale.parziale.mp4").exists()
    atteso = risolvi(archivio, "pc", scrivi=False)
    assert json.loads((archivio.lavoro("pc") / "risolto.json").read_text(encoding="utf-8"))["impronta"] == atteso["impronta"] == _fasi(archivio, "pc")[0]["impronta"]
    assert atteso["titolo"]["testo"] == "Titolo 1"


def test_dopo_tre_cambi_il_montaggio_si_ferma_e_non_scrive_il_finale(archivio, scrivi_piano, prepara_sintetico, finto, tmp_path, monkeypatch):
    file = prepara_sintetico("parole", PAROLE_PAROLE)
    scrivi_piano("pc", _piano_con_titolo(file, "Titolo 0"))
    chiamate, righe = [], []
    monkeypatch.setattr(animazioni, "rendi", _rendi_che_riscrive_il_piano(archivio, "pc", file, scrivi_piano, tmp_path, 3, chiamate))
    with pytest.raises(Errore, match="il piano è cambiato mentre montavo"):
        monta(archivio, "pc", avanza=righe.append)
    assert len(chiamate) == 3 and righe.count(FRASE_PIANO_CAMBIATO) == 2
    assert not (archivio.uscite("pc") / "finale.mp4").exists()


def test_un_piano_cambiato_durante_la_codifica_non_prende_il_posto_del_finale_buono(archivio, scrivi_piano, prepara_sintetico, finto, tmp_path, monkeypatch):
    file = prepara_sintetico("parole", PAROLE_PAROLE)
    scrivi_piano("pc", _piano_con_titolo(file, "Titolo 0"))
    buono, _ = monta_con_animazioni(archivio, "pc", tmp_path)
    prima = buono.read_bytes()
    scrivi_piano("pc", _piano_con_titolo(file, "Titolo 1"))
    chiamate = []
    vero = monta_modulo._fotogrammi

    def durante_la_codifica(comandi, passo, attesi):
        for n, dati in enumerate(vero(comandi, passo, attesi)):
            if n == 2:
                chiamate.append(n)
                scrivi_piano("pc", _piano_con_titolo(file, f"Titolo {len(chiamate) + 1}"))
            yield dati

    monkeypatch.setattr(monta_modulo, "_fotogrammi", durante_la_codifica)
    with mock.patch.object(animazioni, "rendi"), pytest.raises(Errore, match="il piano è cambiato mentre montavo"):
        monta(archivio, "pc", avanza=lambda *_: None)
    assert len(chiamate) == 3
    assert buono.read_bytes() == prima and not (buono.parent / ".finale.parziale.mp4").exists()


def test_gli_orari_del_srt_sono_al_millisecondo():
    from motore.monta import orario

    assert orario(0) == "00:00:00,000" and orario(3.35) == "00:00:03,350" and orario(3599.9996) == "01:00:00,000" and orario(61.2504) == "00:01:01,250"


def test_un_girato_in_un_altra_lingua_si_trascrive_nella_sua(archivio, grezzo, monkeypatch, senza_modelli):
    """La lingua di un file è scritta nella sua scheda nel grezzo (un keynote in inglese): senza, quella dello stile."""
    viste = []
    monkeypatch.setattr(prepara, "trascrivi", lambda sorgente, stile, nomi=(), lingua=None: (viste.append(lingua), (PAROLE_TEMPO, []))[1])
    prepara.prepara_file(archivio, grezzo, avanza=lambda *_: None)
    (archivio.preparati(grezzo) / "parole.json").unlink()
    archivio.grezzo(grezzo).with_name(archivio.grezzo(grezzo).name + ".scheda.json").write_text(
        json.dumps({"tipo": "altro", "origine": "scaricato", "lingua": "en"}), encoding="utf-8")
    prepara.prepara_file(archivio, grezzo, avanza=lambda *_: None)
    assert viste == [None, "en"]


def test_la_lingua_arriva_a_whisper(archivio, monkeypatch):
    chiamate = []

    class Finto:
        def transcribe(self, audio, **opzioni):
            chiamate.append(opzioni["language"])
            return iter([]), None

    monkeypatch.setattr(prepara, "_voci", {prepara.dispositivo("trascrizione"): Finto()})
    monkeypatch.setattr(prepara, "pcm_16k", lambda file: np.zeros(16000 * 3, dtype=np.float32))
    monkeypatch.setattr(prepara, "tratti_di_voce", lambda x, stile: [(0, 16000)])
    prepara.trascrivi(archivio.grezzo(f"{GIORNO}/memo.m4a"), archivio.stile)
    prepara.trascrivi(archivio.grezzo(f"{GIORNO}/memo.m4a"), archivio.stile, lingua="en")
    assert chiamate == [archivio.stile["preparati"]["lingua"], "en"]


def test_ritrascrivere_un_file_rifa_le_parole_e_tiene_il_resto(cli, archivio, grezzo, senza_modelli):
    """Cambiata la scheda di un file (la sua lingua), le parole si rifanno: il livello della voce e la copia leggera restano."""
    assert cli("prepara-file", grezzo)[0] == 0
    cartella = archivio.preparati(grezzo)
    onda = (cartella / "onda.bin").stat().st_mtime_ns
    assert cli("prepara-file", grezzo)[0] == 0 and senza_modelli["trascrivi"] == 1
    assert cli("prepara-file", grezzo, "--ritrascrivi")[0] == 0
    assert senza_modelli["trascrivi"] == 2 and (cartella / "parole.json").exists() and (cartella / "onda.bin").stat().st_mtime_ns == onda


def test_ascolta_un_pezzo_del_girato_dice_il_livello_i_tratti_di_voce_e_lo_spettrogramma(cli, archivio, prepara_sintetico):
    """Nel file sintetico la voce (un tono) sta fra 0,6 e 1,6 s e fra 1,7 e 2,5 s."""
    file = prepara_sintetico("tempo", PAROLE_TEMPO)
    codice, fuori, _ = cli("ascolta", "0.5", "3", "--file", file)
    assert codice == 0
    esito = json.loads(fuori)
    assert esito["da"] == 0.5 and esito["passo"] == 0.01 and len(esito["livello"]) == 250
    assert [[round(a, 1), round(b, 1)] for a, b in esito["voce"]] == [[0.6, 1.6], [1.7, 2.5]]
    assert Image.open(esito["spettrogramma"]).size[0] > 600
    assert esito["spettrogramma"].startswith(str(archivio.preparati(file)))
    codice, _, errori = cli("ascolta", "2", "1", "--file", file)
    assert codice == 1 and "dopo" in errori


def test_ascolta_un_pezzo_del_montato(cli, archivio):
    (archivio.radice / "video" / "m").mkdir(parents=True)
    archivio.uscite("m").mkdir()
    codice, _, errori = cli("ascolta", "0", "1", "--video", "m")
    assert codice == 1 and "non è ancora montato" in errori
    _ffmpeg("-f", "lavfi", "-i", "aevalsrc=exprs='0.3*sin(2*PI*440*t)*between(t,1,2)':s=48000:d=3", "-f", "lavfi", "-i", "color=c=black:s=320x240:r=30:d=3",
            "-c:a", "aac", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-shortest", archivio.uscite("m") / "finale.mp4")
    codice, fuori, _ = cli("ascolta", "0", "3", "--video", "m")
    esito = json.loads(fuori)
    assert codice == 0 and [[round(a, 1), round(b, 1)] for a, b in esito["voce"]] == [[1.0, 2.0]]
    assert esito["spettrogramma"].startswith(str(archivio.lavoro("m")))


def test_il_montato_ha_tanti_fotogrammi_quanti_ne_chiede_il_risolto(archivio, scrivi_piano, prepara_sintetico, tmp_path):
    """Due tratti di 1,73 e 1,13 s (52 e 34 fotogrammi): l'audio dei tratti, sommato, è un soffio più corto dei fotogrammi, e il video non deve accorciarsi per questo."""
    file = prepara_sintetico("tempo", PAROLE_TEMPO)
    scrivi_piano("fr", {"quadro": "girato-pieno", "sorgenti": {"t": {"file": file}}, "sottotitoli": {"modo": "nessuno"},
                        "scene": [{"nome": "s", "pezzi": [{"sorgente": "t", "da": 0.65, "a": 2.38}, {"sorgente": "t", "da": 1.0, "a": 2.13}]}]})
    risolto = risolvi(archivio, "fr")
    assert [t["durata"] for t in risolto["tratti"]] == pytest.approx([52 / 30, 34 / 30])
    finale, _ = monta_con_animazioni(archivio, "fr", tmp_path)
    contati = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v", "-count_frames", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", str(finale)], capture_output=True, text=True, check=True)
    assert int(contati.stdout.strip()) == 86 and durata_audio(finale) == pytest.approx(86 / 30, abs=0.03)


def test_una_scena_collegata_a_un_altro_video_si_rende_senza_toccare_l_altro(archivio, tmp_path, monkeypatch):
    """Due video che condividono i file di `lavoro/scene/` con un collegamento: rendere la scena in uno riscrive il file in un posto solo, e l'altro video la vedrebbe cambiare."""
    mio, altro = tmp_path / "mio" / "scene", tmp_path / "altro" / "scene"
    mio.mkdir(parents=True)
    altro.mkdir(parents=True)
    (altro / "t9.mp4").write_bytes(b"scena vecchia")
    (altro / "t9.mp4.impronta").write_text("vecchia", encoding="utf-8")
    for nome in ("t9.mp4", "t9.mp4.impronta"):
        os.link(altro / nome, mio / nome)

    def registra(comando, **k):
        (mio / "t9.mp4").open("r+b").write(b"scena rifatta")
        return type("R", (), {"returncode": 0, "stdout": "animazioni: rese 1, già rese 0\n", "stderr": ""})()

    finge_bun(monkeypatch, registra)
    animazioni.registra(archivio, {"t9": {}}, tmp_path / "tempi.json", mio)
    assert (mio / "t9.mp4").read_bytes().startswith(b"scena rifatta") and (altro / "t9.mp4").read_bytes() == b"scena vecchia"
    assert (mio / "t9.mp4.impronta").read_text(encoding="utf-8") == "vecchia" and not os.path.samefile(mio / "t9.mp4.impronta", altro / "t9.mp4.impronta")


def test_le_animazioni_ricevono_la_fascia_del_quadro_della_loro_scena(archivio, scrivi_piano, prepara_sintetico):
    """La fascia utile non è una sola: `sagoma-al-centro` finisce più in alto di `sagoma-su-animazione`, e la scena deve disegnare dentro quella del suo quadro."""
    file = prepara_sintetico("tempo", PAROLE_TEMPO)
    pezzo = {"sorgente": "t", "da": 0.6, "a": 1.6}
    scrivi_piano("scene", {"quadro": "sagoma-su-animazione", "sorgenti": {"t": {"file": file}}, "scene": [
        {"nome": "uno", "animazione": "a", "pezzi": [pezzo]}, {"nome": "due", "quadro": "sagoma-al-centro", "animazione": "b", "pezzi": [pezzo]}, {"nome": "tre", "quadro": "girato-pieno", "animazione": "c", "pezzi": [pezzo]}]})
    chieste = animazioni.richiesta(risolvi(archivio, "scene"), archivio.stile)
    quadri = archivio.stile["quadri"]
    assert chieste["a"]["fascia"] == quadri["sagoma-su-animazione"]["fascia_animazione"] and chieste["b"]["fascia"] == quadri["sagoma-al-centro"]["fascia_animazione"]
    assert chieste["a"]["fascia"] != chieste["b"]["fascia"] and "fascia" not in chieste["c"]


def _piano_lungo(larga, verticale, **copertina):
    return {"quadro": "lungo-girato", "sorgenti": {"l": {"file": larga}, "v": {"file": verticale}}, "sottotitoli": {"modo": "nessuno"}, "titolo": {"testo": "Un vaso di 98 grammi mi batte"},
            "scene": [{"nome": "s", "pezzi": [{"sorgente": "l", "da": 0.6, "a": 2.4}]}], "copertina": {"disegno": "materiali/gioco.png", **copertina}}


def test_la_copertina_orizzontale_ha_la_sagoma_di_un_altro_girato_col_bordo_e_il_titolo_a_righe_a_destra(archivio, scrivi_piano, prepara_sintetico, tmp_path):
    """Un video lungo non mostra il creator: la sagoma viene da una ripresa verticale (`copertina.sagoma`), col bordo bianco, a sinistra; il titolo sta a destra, una riga per cartello."""
    larga, verticale = prepara_sintetico("larga", PAROLE_TEMPO), prepara_sintetico("tempo", PAROLE_TEMPO)
    scrivi_piano("yt", _piano_lungo(larga, verticale, sagoma={"sorgente": "v", "istante": 1.0}, righe=["Un vaso di 98 grammi", "mi batte"]))
    (archivio.video("yt") / "materiali").mkdir()
    Image.new("RGB", (1920, 1080), (10, 200, 10)).save(archivio.video("yt") / "materiali" / "gioco.png")
    copertina(archivio, "yt", avanza=lambda *_: None)
    c = np.asarray(Image.open(archivio.uscite("yt") / "copertina.png")).astype(int)
    assert c.shape == (1080, 1920, 3)
    o = archivio.stile["copertina"]["orizzontale"]["sagoma"]
    # la persona sintetica è il blu delle colonne 300-799, dalla riga 600: ritagliata dalla testa e rimpicciolita
    scala = o["altezza"] / o["righe"]
    assert vicino(c[o["y"] + o["altezza"] // 2, round(o["x"] + 550 * scala)], (0, 0, 255), 40)
    assert vicino(c[o["y"] + o["altezza"] // 2, round(o["x"] + 300 * scala) - 4], (255, 255, 255), 40), "il bordo bianco attorno alla sagoma"
    assert vicino(c[500, 1500], (10, 200, 10), 20), "a destra c'è il disegno, dove non c'è un cartello"
    nero = (np.abs(c).sum(axis=2) < 30)
    altezza_riga = archivio.stile["copertina"]["orizzontale"]["titolo"]["altezza_riga"]
    y0 = archivio.stile["copertina"]["orizzontale"]["titolo"]["y"]
    destra = 1920 - archivio.stile["copertina"]["orizzontale"]["titolo"]["margine_destro"]
    assert nero[y0 + 30:y0 + altezza_riga - 30, destra - 40:destra - 10].mean() > 0.95 and not nero[y0 + 4:y0 + altezza_riga - 4, destra + 4:].any(), "il cartello della prima riga arriva al margine destro"
    assert nero[y0 + altezza_riga + 40:y0 + 2 * altezza_riga - 10, 1700:1900].any() and not nero[y0 + 3 * altezza_riga:, 1000:].any(), "due righe, non di più"


def test_la_copertina_orizzontale_senza_righe_va_a_capo_da_sola_e_senza_sagoma_non_ne_mette(archivio, scrivi_piano, prepara_sintetico):
    larga, verticale = prepara_sintetico("larga", PAROLE_TEMPO), prepara_sintetico("tempo", PAROLE_TEMPO)
    scrivi_piano("yt", _piano_lungo(larga, verticale))
    (archivio.video("yt") / "materiali").mkdir()
    Image.new("RGB", (1920, 1080), (10, 200, 10)).save(archivio.video("yt") / "materiali" / "gioco.png")
    copertina(archivio, "yt", avanza=lambda *_: None)
    c = np.asarray(Image.open(archivio.uscite("yt") / "copertina.png")).astype(int)
    assert vicino(c[540, 100], (10, 200, 10), 20) and (np.abs(c).sum(axis=2) < 30).any()
    scrivi_piano("yt", _piano_lungo(larga, verticale, sagoma={"sorgente": "x", "istante": 1.0}))
    with pytest.raises(Errore, match="sorgente «x»"):
        copertina(archivio, "yt", avanza=lambda *_: None)
