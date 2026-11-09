import builtins
import json
import subprocess
import sys

import pytest
from PIL import Image

from motore import animazioni, prepara
from motore.archivio import scrivi_con, valida
from motore import dispositivo as modulo_dispositivo
from motore.dispositivo import dispositivo
from motore.errori import Errore
from motore.monta import leggero, monta
from motore.risolvi import risolvi

from .aiuti import fotogramma, monta_con_animazioni, vicino
from .conftest import PAROLE_TEMPO

VERDE_WEBCAM, GIALLO, ARANCIO, GRIGIO = (0, 200, 0), (230, 230, 0), (255, 140, 0), (60, 60, 60)
L, A = 1920, 1080


@pytest.fixture
def larga(prepara_sintetico):
    return prepara_sintetico("larga", PAROLE_TEMPO, sagoma=False)


def piano(quadro, sorgenti, scene):
    return {"quadro": quadro, "sorgenti": sorgenti, "scene": scene, "sottotitoli": {"modo": "nessuno"}}


def pezzo(sorgente="l"):
    return {"sorgente": sorgente, "da": 0.6, "a": 2.4}


def test_lo_stile_ha_i_due_formati_e_il_verticale_e_quello_di_prima(archivio):
    assert archivio.stile["formati"]["verticale"] == archivio.stile["formato"]
    assert archivio.stile["formati"]["orizzontale"] == {"largo": 1920, "alto": 1080, "fps": 30}


def test_lungo_girato_e_il_girato_a_tutto_fotogramma_con_la_leggera_proporzionata(archivio, scrivi_piano, larga, tmp_path):
    scrivi_piano("g", piano("lungo-girato", {"l": {"file": larga}}, [{"nome": "s", "pezzi": [pezzo()]}]))
    file, i = monta_con_animazioni(archivio, "g", tmp_path)
    assert (i["largo"], i["alto"], i["fps"]) == (L, A, 30)
    f = fotogramma(file, 0.5, L, A)
    assert vicino(f[150, 1400], VERDE_WEBCAM) and vicino(f[600, 1000], GIALLO) and vicino(f[1000, 100], GRIGIO)
    assert not (archivio.uscite("g") / "leggero.mp4").exists()
    disegno = tmp_path / "copertina.png"
    Image.new("RGB", (1920, 1080), (10, 200, 10)).save(disegno)
    scrivi_piano("g", {**piano("lungo-girato", {"l": {"file": larga}}, [{"nome": "s", "pezzi": [pezzo()]}]), "copertina": {"disegno": str(disegno)}})
    monta_con_animazioni(archivio, "g", tmp_path)
    misure = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", str(leggero(archivio, "g", avanza=lambda *_: None))], capture_output=True, text=True).stdout
    assert "1280,720" in misure


def test_lungo_schermo_porta_il_viso_in_un_angolo_da_un_riquadro_della_stessa_sorgente(archivio, scrivi_piano, larga, tmp_path):
    scrivi_piano("s", piano("lungo-schermo", {"l": {"file": larga, "riquadri": {"viso": [1244, 26, 432, 246]}}}, [{"nome": "s", "pezzi": [pezzo()]}]))
    file, _ = monta_con_animazioni(archivio, "s", tmp_path)
    f = fotogramma(file, 0.5, L, A)
    assert vicino(f[A - 36 - 120, L - 36 - 210], VERDE_WEBCAM) and vicino(f[600, 1000], GIALLO) and vicino(f[A - 8, L - 8], GRIGIO)


def test_lungo_schermo_porta_il_viso_in_un_angolo_da_una_seconda_sorgente(archivio, scrivi_piano, larga, prepara_sintetico, tmp_path):
    camera = prepara_sintetico("larga", PAROLE_TEMPO, come="camera", sagoma=False)
    scrivi_piano("c", piano("lungo-schermo", {"l": {"file": larga, "viso": {"sorgente": "cam"}}, "cam": {"file": camera}}, [{"nome": "s", "pezzi": [pezzo()]}]))
    assert valida(archivio, "c", controlla_animazioni=False)[0] == []
    file, _ = monta_con_animazioni(archivio, "c", tmp_path)
    f = fotogramma(file, 0.5, L, A)
    assert vicino(f[A - 36 - 118, L - 36 - 210], GIALLO) and vicino(f[A - 8, L - 8], GRIGIO)


def test_il_viso_che_non_c_e_si_dice(archivio, scrivi_piano, larga):
    scrivi_piano("v", piano("lungo-schermo", {"l": {"file": larga}}, [{"nome": "s", "pezzi": [pezzo()]}]))
    errori, _ = valida(archivio, "v", controlla_animazioni=False)
    assert any("mostra il viso" in e and "`viso`" in e for e in errori)


def test_lungo_animazione_riempie_il_fotogramma_con_l_animazione(archivio, scrivi_piano, larga, tmp_path):
    scrivi_piano("a", piano("lungo-animazione", {"l": {"file": larga}}, [{"nome": "s", "animazione": "uno", "pezzi": [pezzo()]}]))
    r = risolvi(archivio, "a")
    assert animazioni.richiesta(r, archivio.stile)["uno"]["formato"] == {"largo": L, "alto": A}
    file, _ = monta_con_animazioni(archivio, "a", tmp_path)
    f = fotogramma(file, 0.5, L, A)
    assert vicino(f[100, 100], ARANCIO) and vicino(f[A - 100, L - 100], ARANCIO)


def test_i_formati_mescolati_si_rifiutano_con_una_frase_chiara(archivio, scrivi_piano, larga):
    scrivi_piano("m", piano("lungo-girato", {"l": {"file": larga}}, [{"nome": "uno", "pezzi": [pezzo()]}, {"nome": "due", "quadro": "girato-pieno", "pezzi": [pezzo()]}]))
    errori, _ = valida(archivio, "m", controlla_animazioni=False)
    assert any("mescolano formati" in e and "«uno»" in e and "«due»" in e for e in errori)
    with pytest.raises(Errore, match="mescolano formati"):
        risolvi(archivio, "m")


def test_i_capitoli_escono_nel_risolto_e_nel_file_per_youtube(archivio, scrivi_piano, larga, tmp_path):
    scene = [{"nome": "uno", "capitolo": "La partenza", "pezzi": [pezzo()]}, {"nome": "due", "pezzi": [pezzo()]},
             {"nome": "tre", "capitolo": "La gara", "pezzi": [{"sorgente": "l", "da": 3.4, "a": 4.6}]}]
    scrivi_piano("k", piano("lungo-girato", {"l": {"file": larga}}, scene))
    r = risolvi(archivio, "k")
    assert [c["titolo"] for c in r["capitoli"]] == ["La partenza", "La gara"] and r["capitoli"][0]["da"] == 0
    monta_con_animazioni(archivio, "k", tmp_path)
    righe = (archivio.uscite("k") / "capitoli.txt").read_text(encoding="utf-8").splitlines()
    assert righe[0] == "0:00 La partenza" and righe[1] == f"0:{int(r['capitoli'][1]['da']):02d} La gara"
    scrivi_piano("k", piano("lungo-girato", {"l": {"file": larga}}, [{"nome": "uno", "pezzi": [pezzo()]}]))
    monta_con_animazioni(archivio, "k", tmp_path)
    assert not (archivio.uscite("k") / "capitoli.txt").exists()


def test_con_il_modo_nessuno_il_srt_esce_lo_stesso_e_non_si_disegna_niente(archivio, scrivi_piano, larga, tmp_path):
    scrivi_piano("n", piano("lungo-girato", {"l": {"file": larga}}, [{"nome": "s", "pezzi": [pezzo()]}]))
    assert risolvi(archivio, "n")["battute"]
    file, _ = monta_con_animazioni(archivio, "n", tmp_path)
    srt = (archivio.uscite("n") / "finale.srt").read_text(encoding="utf-8")
    assert "uno" in srt and "-->" in srt
    assert vicino(fotogramma(file, 0.5, L, A)[A - 20, L // 2], GRIGIO)


def test_la_scrittura_con_rinomina_non_lascia_mai_un_file_a_meta(tmp_path):
    destinazione = tmp_path / "finale.srt"
    destinazione.write_text("vecchio", encoding="utf-8")

    def rotta(dest):
        dest.write_text("a meta", encoding="utf-8")
        raise Errore("interrotto", "interrupted")

    with pytest.raises(Errore):
        scrivi_con(destinazione, rotta)
    assert destinazione.read_text(encoding="utf-8") == "vecchio"
    scrivi_con(destinazione, lambda dest: dest.write_text("nuovo", encoding="utf-8"))
    assert destinazione.read_text(encoding="utf-8") == "nuovo"


def test_monta_non_lascia_file_parziali_nelle_uscite(archivio, scrivi_piano, larga, tmp_path):
    scrivi_piano("p", piano("lungo-girato", {"l": {"file": larga}}, [{"nome": "s", "capitolo": "Uno", "pezzi": [pezzo()]}]))
    monta_con_animazioni(archivio, "p", tmp_path)
    assert sorted(f.name for f in archivio.uscite("p").iterdir()) == ["capitoli.txt", "finale.mp4", "finale.srt"]


def test_se_i_tratti_non_stanno_nello_spazio_si_compone_mentre_si_codifica(archivio, scrivi_piano, larga, tmp_path):
    scrivi_piano("u", piano("lungo-girato", {"l": {"file": larga}}, [{"nome": "s", "pezzi": [pezzo(), {"sorgente": "l", "da": 3.4, "a": 4.6}]}]))
    normale, _ = monta_con_animazioni(archivio, "u", tmp_path)
    prima = fotogramma(normale, 0.5, L, A)
    for f in (archivio.lavoro("u") / "tratti").glob("*"):
        f.unlink()
    stile = archivio.stile
    archivio.__dict__["stile"] = {**stile, "uscita": {**stile["uscita"], "tratti_massimo_mb": 0}}
    file = monta(archivio, "u", avanza=lambda *_: None)
    assert sorted(f.suffix for f in (archivio.lavoro("u") / "tratti").glob("*")) == [".wav", ".wav"]
    assert abs(fotogramma(file, 0.5, L, A) - prima).max() <= 20


def test_la_sigla_che_non_esiste_dice_quali_ci_sono(archivio, scrivi_piano, larga, monkeypatch):
    scrivi_piano("z", piano("lungo-animazione", {"l": {"file": larga}}, [{"nome": "s", "animazione": "non-esiste", "pezzi": [pezzo()]}]))
    monkeypatch.setattr("motore.archivio._animazioni_note", lambda archivio: {"a1", "a2"})
    errori, _ = valida(archivio, "z")
    assert errori == ["l'animazione «non-esiste» non esiste fra le scene di `animazioni/`: ci sono a1, a2"]


class ModelloVuoto:
    """Un modello di trascrizione finto, che come quello vero fa il lavoro (e dà l'errore) leggendo i segmenti."""

    def __init__(self, errore=None):
        self.errore, self.provato = errore, []

    def transcribe(self, audio, **opzioni):
        self.provato.append((len(audio), opzioni))

        def segmenti():
            if self.errore:
                raise self.errore
            yield from ()

        return segmenti(), None


def test_torch_si_carica_prima_della_trascrizione(archivio, monkeypatch):
    monkeypatch.setattr(modulo_dispositivo, "cuda_disponibile", lambda: True)
    ordine = []
    vero = builtins.__import__

    def registra(nome, *a, **k):
        if nome in ("torch", "faster_whisper"):
            ordine.append(nome)
        return vero(nome, *a, **k)

    class Finto:
        WhisperModel = staticmethod(lambda *a, **k: ModelloVuoto())

    monkeypatch.setitem(sys.modules, "faster_whisper", Finto)
    monkeypatch.setattr(prepara, "_voci", {})
    monkeypatch.setattr(builtins, "__import__", registra)
    prepara.modello_voce(archivio.stile)
    assert ordine.index("torch") < ordine.index("faster_whisper")


def trascrizione_sulla_scheda(archivio, monkeypatch, modello, con_torch):
    """La trascrizione del girato sulla scheda, con il modello dato; torna l'ordine in cui sono arrivati torch, le librerie di CUDA e il modello."""
    monkeypatch.setattr(modulo_dispositivo, "cuda_disponibile", lambda: True)
    monkeypatch.setattr(prepara, "attiva", lambda funzione: con_torch or funzione not in ("sagoma", "allineamento"))
    ordine = []
    vero = builtins.__import__

    def registra(nome, *a, **k):
        if nome == "torch":
            ordine.append(nome)
        return vero(nome, *a, **k)

    class Finto:
        WhisperModel = staticmethod(lambda *a, **k: ordine.append("modello") or modello)

    monkeypatch.setitem(sys.modules, "faster_whisper", Finto)
    monkeypatch.setattr(prepara, "librerie_cuda", lambda: ordine.append("librerie"))
    monkeypatch.setattr(prepara, "_voci", {})
    monkeypatch.setattr(builtins, "__import__", registra)
    prepara.modello_voce(archivio.stile)
    return ordine


@pytest.mark.parametrize("con_torch, atteso", [(True, ["torch", "librerie", "modello"]), (False, ["librerie", "modello"])])
def test_le_librerie_di_cuda_si_trovano_prima_del_modello_con_torch_e_senza(archivio, monkeypatch, con_torch, atteso):
    modello = ModelloVuoto()
    assert trascrizione_sulla_scheda(archivio, monkeypatch, modello, con_torch) == atteso
    assert [lunghezza for lunghezza, _ in modello.provato] == [8000], "la scheda si prova con mezzo secondo di silenzio"


def test_una_libreria_di_cuda_che_non_si_carica_nella_trascrizione_dice_cosa_fare(archivio, monkeypatch):
    modello = ModelloVuoto(RuntimeError("Library cublas64_12.dll is not found or cannot be loaded"))
    with pytest.raises(Errore, match=r"cublas64_12\.dll.*macchina.scheda_video"):
        trascrizione_sulla_scheda(archivio, monkeypatch, modello, con_torch=False)


def test_sul_processore_la_trascrizione_non_prova_niente(archivio, monkeypatch, tmp_path):
    (tmp_path / "profilo.json").write_text(json.dumps({"macchina": {"scheda_video": None}}), encoding="utf-8")
    monkeypatch.setenv("MANGO_ANIMATION_LAVORO", str(tmp_path))
    modello = ModelloVuoto()

    class Finto:
        WhisperModel = staticmethod(lambda *a, **k: modello)

    monkeypatch.setitem(sys.modules, "faster_whisper", Finto)
    monkeypatch.setattr(prepara, "_voci", {})
    prepara.modello_voce(archivio.stile)
    assert modello.provato == []


@pytest.mark.parametrize("scheda, atteso", [(0, "cuda"), (None, "cpu")])
def test_i_modelli_vanno_sul_processore_se_il_profilo_lo_chiede(archivio, monkeypatch, tmp_path, scheda, atteso):
    monkeypatch.setenv("CUDA_VISIBLE_DEVICES", "")
    (tmp_path / "profilo.json").write_text(json.dumps({"macchina": {"scheda_video": scheda}}), encoding="utf-8")
    monkeypatch.setenv("MANGO_ANIMATION_LAVORO", str(tmp_path))
    monkeypatch.setattr("motore.dispositivo.cuda_disponibile", lambda: True)
    chiesti = []

    class Finto:
        WhisperModel = staticmethod(lambda *a, **k: chiesti.append(k) or ModelloVuoto())

    monkeypatch.setitem(sys.modules, "faster_whisper", Finto)
    monkeypatch.setattr(prepara, "_voci", {})
    prepara.modello_voce(archivio.stile)
    assert dispositivo("trascrizione") == atteso and chiesti[0]["device"] == atteso and chiesti[0]["compute_type"] == archivio.stile["preparati"]["calcolo_trascrizione"][atteso]
