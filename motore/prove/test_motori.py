import builtins
import json
import sys
import types

import pytest

from motore import allinea, detta, prepara, profilo, sorgenti
from motore import dispositivo as modulo
from motore.errori import Errore

from .conftest import GIORNO, PAROLE_TEMPO, _collega


def scrivi_profilo(tmp_path, monkeypatch, motori, macchina=None):
    (tmp_path / "profilo.json").write_text(json.dumps({"motori": motori, **({"macchina": macchina} if macchina is not None else {})}), encoding="utf-8")
    monkeypatch.setenv("MANGO_ANIMATION_LAVORO", str(tmp_path))
    for nome in ("CUDA_VISIBLE_DEVICES", "CUDA_DEVICE_ORDER"):
        monkeypatch.setenv(nome, "")
        monkeypatch.delenv(nome)
    profilo._motori_di_lavoro.cache_clear()


def scheda(monkeypatch, c):
    monkeypatch.setattr(modulo, "cuda_disponibile", lambda: c)


def test_senza_motori_ogni_funzione_e_accesa_e_non_dice_dove(tmp_path, monkeypatch):
    monkeypatch.setenv("MANGO_ANIMATION_LAVORO", str(tmp_path))
    assert profilo.motore("sagoma") == {} and profilo.attiva("sagoma") and not profilo.attiva("pulizia_voce", False)


def test_il_profilo_si_legge_una_volta_per_processo(tmp_path, monkeypatch):
    scrivi_profilo(tmp_path, monkeypatch, {"sagoma": {"attiva": False}})
    assert not profilo.attiva("sagoma")
    (tmp_path / "profilo.json").write_text(json.dumps({"motori": {"sagoma": {"attiva": True}}}), encoding="utf-8")
    assert not profilo.attiva("sagoma")


def test_dove_processore_non_guarda_la_scheda(tmp_path, monkeypatch):
    scrivi_profilo(tmp_path, monkeypatch, {"allineamento": {"dove": "processore"}}, {"scheda_video": 0})
    monkeypatch.setattr(modulo, "cuda_disponibile", lambda: pytest.fail("non serve chiedere se c'è una scheda"))
    assert modulo.dispositivo("allineamento") == "cpu"


def test_ogni_funzione_sceglie_il_suo_posto(tmp_path, monkeypatch):
    scrivi_profilo(tmp_path, monkeypatch, {"sagoma": {"dove": "processore"}, "trascrizione": {"dove": "scheda"}})
    scheda(monkeypatch, True)
    assert modulo.dispositivo("sagoma") == "cpu" and modulo.dispositivo("trascrizione") == "cuda" and modulo.dispositivo("allineamento") == "cuda"


def test_dove_scheda_senza_scheda_e_un_errore_e_non_un_ripiego(tmp_path, monkeypatch):
    scrivi_profilo(tmp_path, monkeypatch, {"sagoma": {"dove": "scheda"}})
    scheda(monkeypatch, False)
    with pytest.raises(Errore, match="«sagoma».*motori.sagoma.dove.*non c'è una scheda NVIDIA.*processore"):
        modulo.dispositivo("sagoma")


def test_dove_scheda_con_la_scheda_esclusa_dalla_macchina_e_un_errore(tmp_path, monkeypatch):
    scrivi_profilo(tmp_path, monkeypatch, {"sagoma": {"dove": "scheda"}}, {"scheda_video": None})
    with pytest.raises(Errore, match=r"motori.sagoma.dove.*macchina.scheda_video è null"):
        modulo.dispositivo("sagoma")


def test_la_dettatura_segue_il_suo_dove(tmp_path, monkeypatch):
    for dove, schede, atteso in (("processore", 1, "cpu"), ("scheda", 1, "cuda")):
        scrivi_profilo(tmp_path, monkeypatch, {"dettatura": {"dove": dove}})
        monkeypatch.setitem(sys.modules, "ctranslate2", types.SimpleNamespace(get_cuda_device_count=lambda schede=schede: schede))
        assert modulo.dispositivo_voce() == atteso
    scrivi_profilo(tmp_path, monkeypatch, {"dettatura": {"dove": "scheda"}})
    monkeypatch.setitem(sys.modules, "ctranslate2", types.SimpleNamespace(get_cuda_device_count=lambda: 0))
    with pytest.raises(Errore, match="«dettatura».*motori.dettatura.dove"):
        modulo.dispositivo_voce()


def test_la_dettatura_spenta_non_parte(tmp_path, monkeypatch, capsys):
    scrivi_profilo(tmp_path, monkeypatch, {"dettatura": {"attiva": False}})
    monkeypatch.setattr(detta, "carica", lambda cfg: pytest.fail("il modello non si carica"))
    with pytest.raises(SystemExit):
        detta.detta()
    evento = json.loads(capsys.readouterr().out.splitlines()[0])
    assert evento["fatale"] and "motori.dettatura.attiva" in evento["messaggio"]


class FasterWhisperFinto:
    def __init__(self, errore=None):
        self.chiesti, self.errore = [], errore
        self.WhisperModel = self.crea

    def crea(self, nome, **opzioni):
        self.chiesti.append((nome, opzioni))
        if self.errore:
            raise self.errore
        return object()


def test_modello_e_calcolo_del_profilo_prendono_il_posto_di_quelli_dello_stile(archivio, tmp_path, monkeypatch):
    scrivi_profilo(tmp_path, monkeypatch, {"trascrizione": {"dove": "processore", "modello": "small", "calcolo": "float32"}})
    finto = FasterWhisperFinto()
    monkeypatch.setitem(sys.modules, "faster_whisper", finto)
    monkeypatch.setattr(prepara, "_voci", {})
    prepara.modello_voce(archivio.stile)
    assert finto.chiesti == [("small", {"device": "cpu", "device_index": 0, "compute_type": "float32"})]


def test_un_calcolo_che_la_scheda_non_sa_fare_dice_quale_chiave_cambiare(archivio, tmp_path, monkeypatch):
    scrivi_profilo(tmp_path, monkeypatch, {"trascrizione": {"dove": "scheda", "calcolo": "float16"}})
    scheda(monkeypatch, True)
    monkeypatch.setitem(sys.modules, "faster_whisper", FasterWhisperFinto(ValueError("Requested float16 compute type")))
    monkeypatch.setattr(prepara, "_voci", {})
    with pytest.raises(Errore, match="calcolo float16.*questa scheda.*motori.trascrizione.calcolo"):
        prepara.modello_voce(archivio.stile)


def test_un_modello_che_non_si_scarica_dice_cosa_fare(archivio, tmp_path, monkeypatch):
    scrivi_profilo(tmp_path, monkeypatch, {"trascrizione": {"dove": "processore", "modello": "large-v3-turbo"}})
    monkeypatch.setitem(sys.modules, "faster_whisper", FasterWhisperFinto(OSError("rete assente")))
    monkeypatch.setattr(prepara, "_voci", {})
    with pytest.raises(Errore, match="large-v3-turbo.*serve la rete"):
        prepara.modello_voce(archivio.stile)


def test_sul_processore_senza_sagoma_ne_allineamento_torch_non_si_carica(archivio, tmp_path, monkeypatch):
    scrivi_profilo(tmp_path, monkeypatch, {"trascrizione": {"dove": "processore"}, "sagoma": {"attiva": False}, "allineamento": {"attiva": False}, "segui": {"attiva": False}})
    caricati = []
    vero = builtins.__import__

    def registra(nome, *a, **k):
        caricati.append(nome)
        return vero(nome, *a, **k)

    monkeypatch.setitem(sys.modules, "faster_whisper", FasterWhisperFinto())
    monkeypatch.delitem(sys.modules, "torch", raising=False)
    monkeypatch.setattr(prepara, "_voci", {})
    monkeypatch.setattr(builtins, "__import__", registra)
    prepara.modello_voce(archivio.stile)
    prepara.libera()
    assert "torch" not in caricati


@pytest.fixture
def grezzo(archivio, fonti):
    file = f"{GIORNO}/tempo.mp4"
    _collega(fonti / "tempo.mp4", archivio.grezzo(file))
    return file


def test_la_trascrizione_spenta_non_scrive_le_parole_e_il_video_che_le_vuole_lo_dice(archivio, grezzo, tmp_path, monkeypatch):
    scrivi_profilo(tmp_path, monkeypatch, {"trascrizione": {"attiva": False}})
    monkeypatch.setattr(prepara, "trascrivi", lambda *a, **k: pytest.fail("la trascrizione è spenta"))
    detto = []
    cartella = prepara.prepara_file(archivio, grezzo, avanza=detto.append)
    assert not (cartella / "parole.json").exists() and any("trascrizione spenta" in r and "motori.trascrizione.attiva" in r for r in detto)
    with pytest.raises(Errore, match=r"non ha le parole.*«trascrizione» è spenta nel profilo.*motori.trascrizione.attiva"):
        _ = sorgenti.Sorgente(archivio, "v", "t", {"file": grezzo}, {}).parole


def test_l_allineamento_spento_da_i_tempi_della_trascrizione_con_voto_zero(archivio, grezzo, tmp_path, monkeypatch):
    scrivi_profilo(tmp_path, monkeypatch, {"allineamento": {"attiva": False}})
    monkeypatch.setattr(allinea, "apri", lambda: pytest.fail("l'allineamento è spento"))
    cartella = archivio.preparati(grezzo)
    cartella.mkdir(parents=True)
    (cartella / "parole.json").write_text(json.dumps(PAROLE_TEMPO), encoding="utf-8")
    sorgente = sorgenti.Sorgente(archivio, "v", "t", {"file": grezzo, "sfasamento": 0.5}, {})
    veri, = sorgente.veri([(0, 2)])
    assert veri[0] == (1.05, 2.0, 0.0) and veri[1][2] == 0.0 and not (cartella / "allineate.json").exists()


def test_la_voce_pulita_la_decide_il_profilo_se_lo_dice_altrimenti_lo_stile(tmp_path, monkeypatch):
    monkeypatch.setenv("MANGO_ANIMATION_LAVORO", str(tmp_path))
    assert profilo.attiva("pulizia_voce", True) and not profilo.attiva("pulizia_voce", False)
    scrivi_profilo(tmp_path, monkeypatch, {"pulizia_voce": {"attiva": False}})
    assert not profilo.attiva("pulizia_voce", True)


def test_la_sagoma_spenta_ferma_il_montaggio_che_ne_vuole_una_nuova(archivio, scrivi_piano, prepara_sintetico, tmp_path, monkeypatch):
    from .aiuti import monta_con_animazioni

    scrivi_profilo(tmp_path, monkeypatch, {"sagoma": {"attiva": False}})
    file = prepara_sintetico("tempo", PAROLE_TEMPO, sagoma=False)
    scrivi_piano("s", {"quadro": "sagoma-su-animazione", "sorgenti": {"t": {"file": file}}, "sottotitoli": {"modo": "nessuno"},
                       "scene": [{"nome": "s", "animazione": "uno", "pezzi": [{"sorgente": "t", "da": 0.6, "a": 2.4}]}]})
    with pytest.raises(Errore, match=r"che non l'hanno, ma «sagoma» è spenta nel profilo \(motori.sagoma.attiva\)"):
        monta_con_animazioni(archivio, "s", tmp_path)


def test_la_vista_che_segue_spenta_ferma_il_montaggio_che_deve_misurare(archivio, scrivi_piano, prepara_sintetico, tmp_path, monkeypatch):
    from .aiuti import monta_con_animazioni

    scrivi_profilo(tmp_path, monkeypatch, {"segui": {"attiva": False}})
    larga = prepara_sintetico("larga", PAROLE_TEMPO)
    scrivi_piano("s", {"quadro": "girato-pieno", "sorgenti": {"d": {"file": larga, "viste": {"palco": {"taglio": [656, 0, 608, 1080], "segui": True}}}},
                       "scene": [{"nome": "s", "vista": "palco", "pezzi": [{"sorgente": "d", "da": 0.6, "a": 2.4}]}], "sottotitoli": {"modo": "nessuno"}})
    with pytest.raises(Errore, match=r"segue la persona.*«segui» è spenta nel profilo \(motori.segui.attiva\)"):
        monta_con_animazioni(archivio, "s", tmp_path)


def test_controlla_con_trascrizione_e_allineamento_spenti_non_li_carica_e_lo_dice(archivio, scrivi_piano, prepara_sintetico, tmp_path, monkeypatch):
    from motore.controlla import controlla

    from .aiuti import monta_con_animazioni
    from .conftest import PAROLE_PAROLE

    file = prepara_sintetico("parole", PAROLE_PAROLE)
    scrivi_piano("k", {"quadro": "girato-pieno", "sorgenti": {"p": {"file": file}}, "scene": [{"nome": "s", "pezzi": [{"sorgente": "p", "minuto": "00:00", "dice": "ciao a tutti"}]}], "sottotitoli": {"modo": "nessuno"}})
    scrivi_profilo(tmp_path, monkeypatch, {"allineamento": {"attiva": False}})
    monta_con_animazioni(archivio, "k", tmp_path)
    scrivi_profilo(tmp_path, monkeypatch, {"allineamento": {"attiva": False}, "trascrizione": {"attiva": False}})
    monkeypatch.setattr(allinea, "apri", lambda: pytest.fail("l'allineamento è spento"))
    monkeypatch.setattr(prepara, "modello_voce", lambda stile: pytest.fail("la trascrizione è spenta"))
    detto = []
    esito = controlla(archivio, "k", avanza=detto.append)
    assert esito["spente"] == ["allineamento", "trascrizione"] and esito["sentito"] == "" and esito["differenze"] == [] and esito["parole_fuori_posto"] == []
    assert any("motori.allineamento.attiva" in r and "motori.trascrizione.attiva" in r for r in detto)


def test_la_testa_si_misura_solo_negli_intervalli_chiesti_e_le_misure_si_sommano(archivio, fonti, tmp_path, monkeypatch):
    visti = []

    class ViFinti:
        def __init__(self, soglia):
            assert soglia == archivio.stile["segui"]["soglia_viso"]

        def x(self, rgb):
            visti.append(rgb.shape)
            return None if len(visti) == 2 else 0.25

    monkeypatch.setattr(prepara, "Visi", ViFinti)
    file = tmp_path / "persona.json"
    passo = archivio.stile["segui"]["misure_al_secondo"]
    prepara.misura_persona(fonti / "larga.mp4", file, [[1.0, 2.0]], archivio.stile)
    scritto = json.loads(file.read_text(encoding="utf-8"))
    assert visti[0] == (540, 960, 3) and len(visti) == passo
    assert scritto == {"misure_al_secondo": passo, "misurati": [[1.0, 2.0]], "x": [None] * passo + [0.25, None, 0.25, 0.25, 0.25]}
    prepara.misura_persona(fonti / "larga.mp4", file, [[3.0, 4.0]], archivio.stile)
    scritto = json.loads(file.read_text(encoding="utf-8"))
    assert scritto["misurati"] == [[1.0, 2.0], [3.0, 4.0]] and len(scritto["x"]) == 4 * passo and scritto["x"][2 * passo:3 * passo] == [None] * passo and len(visti) == 2 * passo


def test_una_persona_misurata_alla_vecchia_maniera_si_rifa(archivio, fonti, tmp_path, monkeypatch):
    monkeypatch.setattr(prepara, "Visi", lambda soglia: types.SimpleNamespace(x=lambda rgb: 0.5))
    file = tmp_path / "persona.json"
    file.write_text(json.dumps({"misure_al_secondo": 5, "x": [0.9] * 40}), encoding="utf-8")
    prepara.misura_persona(fonti / "larga.mp4", file, [[1.0, 2.0]], archivio.stile)
    assert json.loads(file.read_text(encoding="utf-8"))["x"] == [None] * 5 + [0.5] * 5
