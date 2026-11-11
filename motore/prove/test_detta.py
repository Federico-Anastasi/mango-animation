import base64
import io
import json
import sys
import types

import numpy as np
import pytest

from motore import detta as modulo
from motore.__main__ import main
from motore.archivio import REPO, leggi_stile
from motore.detta import Frasi, servi
from motore.media import FREQUENZA
from motore.errori import Errore

CFG = leggi_stile(REPO)["dettatura"]
PEZZO = FREQUENZA // 10


def voce_finta(audio, pausa):
    """I tratti dove l'audio è forte, uniti se la pausa fra loro è più corta di `pausa` secondi."""
    forte = np.abs(audio) > 0.1
    bordi = np.flatnonzero(np.diff(np.concatenate([[0], forte.astype(np.int8), [0]])))
    tratti = [[int(a), int(b)] for a, b in zip(bordi[::2], bordi[1::2])]
    uniti = []
    for tratto in tratti:
        if uniti and tratto[0] - uniti[-1][1] < pausa * FREQUENZA:
            uniti[-1][1] = tratto[1]
        else:
            uniti.append(tratto)
    return [tuple(t) for t in uniti]


class Prova:
    """Una dettatura con un modello finto: il testo di un audio è i secondi di voce che contiene."""

    def __init__(self):
        self.eventi, self.chiamate, self.fed = [], [], 0
        self.frasi = Frasi(CFG, self.trascrivi, voce_finta, lambda e: self.eventi.append((self.fed / FREQUENZA, e)))
        self.frasi.nuova(7)

    def trascrivi(self, audio, fasci):
        secondi = round(float((np.abs(audio) > 0.1).sum()) / FREQUENZA, 1)
        self.chiamate.append((len(audio) / FREQUENZA, fasci))
        return f" {secondi} s "

    def dai(self, *blocchi):
        audio = np.concatenate(blocchi)
        for i in range(0, len(audio), PEZZO):
            pezzo = audio[i:i + PEZZO]
            self.fed += len(pezzo)
            self.frasi.arriva(pezzo)
            self.frasi.passo()
        return self

    def tipi(self):
        return [e["tipo"] for _, e in self.eventi]

    def testi(self, tipo):
        return [e["testo"] for _, e in self.eventi if e["tipo"] == tipo]


def parlato(secondi):
    return np.full(int(secondi * FREQUENZA), 0.5, np.float32)


def silenzio(secondi):
    return np.zeros(int(secondi * FREQUENZA), np.float32)


def test_nuova_dettatura_dice_ascolto_con_il_suo_id():
    p = Prova()
    p.frasi.nuova(9)
    assert p.eventi == [(0.0, {"id": 7, "tipo": "ascolto"}), (0.0, {"id": 9, "tipo": "ascolto"})]


def test_senza_voce_non_si_trascrive_niente_e_non_si_tiene_audio():
    p = Prova().dai(silenzio(5))
    assert p.tipi() == ["ascolto"] and p.chiamate == []
    assert len(p.frasi.audio) <= CFG["prima"] * FREQUENZA


def test_la_frase_cresce_e_si_chiude_dopo_il_silenzio_non_prima():
    p = Prova().dai(parlato(3), silenzio(CFG["silenzio_fine"] - 0.2))
    assert p.testi("definitiva") == []
    assert len(p.testi("parziale")) >= 2
    p.dai(silenzio(0.3))
    assert p.testi("definitiva") == ["3.0 s"]
    quando = [t for t, e in p.eventi if e["tipo"] == "definitiva"][0]
    assert 3 + CFG["silenzio_fine"] - 0.05 <= quando <= 3 + CFG["silenzio_fine"] + 0.25, f"chiusa a {quando} s"
    assert p.frasi.in_frase is False and len(p.frasi.audio) <= CFG["prima"] * FREQUENZA


def test_il_parziale_arriva_ogni_secondo_di_audio_e_con_meno_fasci_della_definitiva():
    p = Prova().dai(parlato(4.5), silenzio(1.2))
    tempi = [t for t, e in p.eventi if e["tipo"] == "parziale"]
    assert len(tempi) >= 3
    assert all(b - a >= CFG["ogni_parziale"] - 0.01 for a, b in zip(tempi, tempi[1:])), tempi
    fasci = [f for _, f in p.chiamate]
    assert fasci[:-1] == [CFG["fasci_parziale"]] * (len(fasci) - 1) and fasci[-1] == CFG["fasci_definitiva"]


def test_un_parziale_uguale_al_precedente_non_si_ripete():
    p = Prova()
    p.frasi.trascrivi = lambda audio, fasci: "sempre uguale"
    p.dai(parlato(3.5))
    assert p.testi("parziale") == ["sempre uguale"]


def test_due_frasi_separate_dal_silenzio_sono_due_definitive():
    p = Prova().dai(parlato(2), silenzio(1.2), parlato(1.5), silenzio(1.2))
    assert p.testi("definitiva") == ["2.0 s", "1.5 s"]
    assert p.tipi().count("ascolto") == 1


def test_il_testo_non_comprende_il_silenzio_in_coda_oltre_il_margine():
    p = Prova().dai(parlato(2), silenzio(1.2))
    lunghezza_definitiva = [s for s, f in p.chiamate if f == CFG["fasci_definitiva"]][0]
    assert 2 <= lunghezza_definitiva <= 2 + CFG["prima"] + CFG["vad"]["margine"] + 0.01, lunghezza_definitiva


def test_una_frase_troppo_lunga_si_chiude_nella_sua_ultima_pausa():
    corta = CFG["vad"]["pausa_interna"] + 0.05
    p = Prova().dai(parlato(20), silenzio(corta), parlato(CFG["massimo_frase"] - 20 - corta + 0.2))
    assert p.testi("definitiva") == ["20.0 s"]
    # ciò che viene dopo la pausa è l'inizio della frase successiva, e non si perde
    p.dai(silenzio(1.2))
    assert p.testi("definitiva") == ["20.0 s", "4.9 s"]


def test_una_frase_troppo_lunga_senza_pause_si_chiude_dove_e_arrivata():
    p = Prova().dai(parlato(CFG["massimo_frase"]))
    assert p.testi("definitiva") == [f"{CFG['massimo_frase']:.1f} s"]
    assert len(p.frasi.audio) == 0


def test_fine_chiude_subito_la_frase_in_corso_e_dice_chiusa():
    p = Prova().dai(parlato(2.3))
    prima = len(p.testi("definitiva"))
    p.frasi.fine()
    assert prima == 0
    assert p.tipi()[-2:] == ["definitiva", "chiusa"]
    assert p.testi("definitiva") == ["2.3 s"]
    assert p.eventi[-1][1]["id"] == 7
    assert p.chiamate[-1][1] == CFG["fasci_definitiva"]


def test_fine_senza_voce_dice_solo_chiusa():
    p = Prova().dai(silenzio(2))
    p.frasi.fine()
    assert p.tipi() == ["ascolto", "chiusa"]


def test_fine_con_audio_arrivato_e_non_ancora_visto_lo_trascrive_una_volta_sola():
    p = Prova()
    p.frasi.arriva(parlato(2))
    p.frasi.fine()
    assert p.testi("definitiva") == ["2.0 s"]
    assert p.chiamate == [(p.chiamate[0][0], CFG["fasci_definitiva"])], "niente parziale sprecato prima della definitiva"


def test_dopo_fine_una_dettatura_nuova_riparte_da_capo():
    p = Prova().dai(parlato(2))
    p.frasi.fine()
    p.frasi.nuova(8)
    p.dai(parlato(1))
    p.frasi.fine()
    assert p.testi("definitiva") == ["2.0 s", "1.0 s"]
    assert [e["id"] for _, e in p.eventi if e["tipo"] == "definitiva"] == [7, 8]


# ---------------------------------------------------------------- il protocollo

def righe(*messaggi):
    return [json.dumps(m) + "\n" for m in messaggi]


def audio_b64(x):
    return base64.b64encode((x * 32767).astype(np.int16).tobytes()).decode()


def esegui(messaggi):
    eventi = []
    frasi = Frasi(CFG, lambda audio, fasci: f"{round(float((np.abs(audio) > 0.1).sum()) / FREQUENZA, 1)} s", voce_finta, eventi.append)
    servi(righe(*messaggi), frasi)
    return eventi


def test_il_protocollo_nuova_audio_fine():
    eventi = esegui([
        {"tipo": "nuova", "id": 3},
        *[{"tipo": "audio", "id": 3, "pcm": audio_b64(parlato(0.1))} for _ in range(20)],
        {"tipo": "fine", "id": 3},
    ])
    assert [e["tipo"] for e in eventi if e["tipo"] != "parziale"] == ["ascolto", "definitiva", "chiusa"]
    assert [e["testo"] for e in eventi if e["tipo"] == "definitiva"] == ["2.0 s"]
    assert all(e["id"] == 3 for e in eventi)


def test_l_audio_arrivato_insieme_si_prende_tutto_in_un_giro():
    eventi = esegui([{"tipo": "nuova", "id": 1}, {"tipo": "audio", "id": 1, "pcm": audio_b64(np.concatenate([parlato(3), silenzio(1.5)]))}])
    assert [e["tipo"] for e in eventi] == ["ascolto", "definitiva"]


def test_due_dettature_di_fila_nello_stesso_processo():
    eventi = esegui([
        {"tipo": "nuova", "id": 1}, {"tipo": "audio", "id": 1, "pcm": audio_b64(parlato(1))}, {"tipo": "fine", "id": 1},
        {"tipo": "nuova", "id": 2}, {"tipo": "audio", "id": 2, "pcm": audio_b64(parlato(2))}, {"tipo": "fine", "id": 2},
    ])
    finali = [(e["id"], e["testo"]) for e in eventi if e["tipo"] == "definitiva"]
    assert finali == [(1, "1.0 s"), (2, "2.0 s")]
    assert [e["id"] for e in eventi if e["tipo"] == "chiusa"] == [1, 2]


# ---------------------------------------------------------------- dove gira e quale modello

def finto_ctranslate2(monkeypatch, schede=1, tipi=("float16", "float32")):
    ct2 = types.SimpleNamespace(get_cuda_device_count=lambda: schede, get_supported_compute_types=lambda dove, indice=0: set(tipi) if dove == "cuda" else {"int8", "float32"})
    monkeypatch.setitem(sys.modules, "ctranslate2", ct2)
    return ct2


def test_la_dettatura_gira_sulla_scheda_se_c_e_altrimenti_sul_processore(monkeypatch, tmp_path):
    from motore.dispositivo import dispositivo_voce

    monkeypatch.delenv("MANGO_ANIMATION_LAVORO", raising=False)
    finto_ctranslate2(monkeypatch, schede=1)
    assert dispositivo_voce() == "cuda"
    finto_ctranslate2(monkeypatch, schede=0)
    assert dispositivo_voce() == "cpu"
    finto_ctranslate2(monkeypatch, schede=1)
    (tmp_path / "profilo.json").write_text('{"macchina": {"scheda_video": null}}', encoding="utf-8")
    monkeypatch.setenv("MANGO_ANIMATION_LAVORO", str(tmp_path))
    assert dispositivo_voce() == "cpu"


class ModelloFinto:
    visti = []
    prove = []
    errore = None
    errore_alla_prova = None

    def __init__(self, nome, **opzioni):
        if ModelloFinto.errore:
            raise ModelloFinto.errore
        ModelloFinto.visti.append((nome, opzioni))

    def transcribe(self, audio, **opzioni):
        """Come faster-whisper: il lavoro vero (e il suo errore) arriva leggendo i segmenti, non chiamando `transcribe`."""
        ModelloFinto.prove.append((audio, opzioni))

        def segmenti():
            if ModelloFinto.errore_alla_prova:
                raise ModelloFinto.errore_alla_prova
            yield from ()

        return segmenti(), None


@pytest.fixture
def modello_finto(monkeypatch):
    ModelloFinto.visti, ModelloFinto.prove, ModelloFinto.errore, ModelloFinto.errore_alla_prova = [], [], None, None
    monkeypatch.setitem(sys.modules, "faster_whisper", types.SimpleNamespace(WhisperModel=ModelloFinto))
    return ModelloFinto


def test_sulla_scheda_il_modello_grande_e_il_calcolo_che_la_scheda_sa_fare(monkeypatch, modello_finto):
    finto_ctranslate2(monkeypatch, schede=1, tipi=("float16", "float32"))
    _, scelta = modulo.carica(CFG)
    assert scelta == {"dispositivo": "cuda", "modello": CFG["dispositivi"]["cuda"]["modello"], "calcolo": "float16"}
    finto_ctranslate2(monkeypatch, schede=1, tipi=("float32",))
    assert modulo.carica(CFG)[1]["calcolo"] == "float32", "una scheda senza float16 usa il successivo, e lo dice"
    nome, opzioni = modello_finto.visti[-1]
    assert (nome, opzioni["device"], opzioni["compute_type"]) == (CFG["dispositivi"]["cuda"]["modello"], "cuda", "float32")


def test_sul_processore_il_modello_piccolo(monkeypatch, modello_finto):
    finto_ctranslate2(monkeypatch, schede=0)
    _, scelta = modulo.carica(CFG)
    assert scelta == {"dispositivo": "cpu", "modello": CFG["dispositivi"]["cpu"]["modello"], "calcolo": "int8"}
    assert modello_finto.visti[-1][1]["device"] == "cpu"
    assert CFG["dispositivi"]["cpu"]["modello"] != CFG["dispositivi"]["cuda"]["modello"]


def test_un_calcolo_che_il_computer_non_sa_fare_e_un_errore_che_dice_cosa_cambiare(monkeypatch, modello_finto):
    finto_ctranslate2(monkeypatch, schede=1, tipi=("int8",))
    with pytest.raises(Errore, match=r"float16, float32.*stile.json"):
        modulo.carica(CFG)


def test_scheda_piena_modello_non_trovato_e_pacchetto_mancante_hanno_la_loro_frase(monkeypatch, modello_finto):
    finto_ctranslate2(monkeypatch, schede=1)
    modello_finto.errore = RuntimeError("CUDA failed with error out of memory")
    with pytest.raises(Errore, match=r"non ha memoria libera.*macchina.scheda_video"):
        modulo.carica(CFG)
    modello_finto.errore = OSError("rete assente")
    with pytest.raises(Errore, match=r"non si trova e non si riesce a scaricarlo.*rete"):
        modulo.carica(CFG)
    monkeypatch.setitem(sys.modules, "faster_whisper", None)
    with pytest.raises(Errore, match="faster-whisper"):
        modulo.carica(CFG)


def test_il_comando_detta_parla_su_stdout_in_json_e_non_chiede_la_cartella_di_lavoro(monkeypatch):
    monkeypatch.delenv("MANGO_ANIMATION_LAVORO", raising=False)
    monkeypatch.setattr(modulo, "carica", lambda cfg: (object(), {"dispositivo": "cpu", "modello": "finto", "calcolo": "int8"}))
    monkeypatch.setattr(modulo, "funzioni", lambda modello, cfg: (lambda audio, fasci: "ciao", voce_finta))
    ingresso = "".join(righe({"tipo": "nuova", "id": 5}, {"tipo": "audio", "id": 5, "pcm": audio_b64(parlato(0.5))}, {"tipo": "fine", "id": 5}))
    stdout = io.TextIOWrapper(io.BytesIO(), encoding="utf-8", write_through=True)
    monkeypatch.setattr(sys, "stdin", io.StringIO(ingresso))
    monkeypatch.setattr(sys, "stdout", stdout)
    assert main(["detta"]) == 0
    eventi = [json.loads(r) for r in stdout.buffer.getvalue().decode("utf-8").splitlines()]
    assert eventi[0] == {"tipo": "pronto", "dispositivo": "cpu", "modello": "finto", "calcolo": "int8"}
    assert [e["tipo"] for e in eventi[1:]] == ["ascolto", "definitiva", "chiusa"]
    assert eventi[2]["testo"] == "ciao"


def test_se_il_modello_non_si_carica_lo_dice_come_evento_e_il_processo_esce_con_errore(monkeypatch):
    def non_si_carica(cfg):
        raise Errore("manca il modello", "the model is missing")

    monkeypatch.setattr(modulo, "carica", non_si_carica)
    stdout = io.StringIO()
    monkeypatch.setattr(sys, "stdin", io.StringIO(""))
    monkeypatch.setattr(sys, "stdout", stdout)
    with pytest.raises(SystemExit) as uscita:
        modulo.detta()
    assert uscita.value.code == 1
    assert json.loads(stdout.getvalue()) == {"tipo": "errore", "messaggio": "Non riesco a preparare la dettatura: manca il modello", "fatale": True}


def test_l_errore_della_dettatura_esce_nella_lingua_di_chi_la_chiede(monkeypatch):
    def non_si_carica(cfg):
        raise Errore("manca il modello", "the model is missing")

    monkeypatch.setattr(modulo, "carica", non_si_carica)
    monkeypatch.setenv("MANGO_ANIMATION_LINGUA", "en")
    stdout = io.StringIO()
    monkeypatch.setattr(sys, "stdin", io.StringIO(""))
    monkeypatch.setattr(sys, "stdout", stdout)
    with pytest.raises(SystemExit):
        modulo.detta()
    assert json.loads(stdout.getvalue())["messaggio"] == "Cannot prepare dictation: the model is missing"


# ---------------------------------------------------------------- la scheda prima di dire «pronto»

def test_sulla_scheda_prima_di_dire_pronto_si_trascrive_mezzo_secondo_di_silenzio(monkeypatch, modello_finto):
    finto_ctranslate2(monkeypatch, schede=1)
    modulo.carica(CFG)
    (audio, opzioni), = modello_finto.prove
    assert len(audio) == FREQUENZA // 2 and not audio.any() and audio.dtype == np.float32
    assert opzioni["language"] == CFG["lingua"] and opzioni["vad_filter"] is False


def test_sul_processore_non_c_e_niente_da_provare(monkeypatch, modello_finto):
    finto_ctranslate2(monkeypatch, schede=0)
    modulo.carica(CFG)
    assert modello_finto.prove == []


def test_le_librerie_di_cuda_si_rendono_trovabili_prima_di_caricare_il_modello(monkeypatch, modello_finto):
    finto_ctranslate2(monkeypatch, schede=1)
    ordine = []
    monkeypatch.setattr(modulo, "librerie_cuda", lambda: ordine.append("librerie"))
    monkeypatch.setitem(sys.modules, "faster_whisper", types.SimpleNamespace(WhisperModel=lambda *a, **k: ordine.append("modello") or ModelloFinto(*a, **k)))
    modulo.carica(CFG)
    assert ordine == ["librerie", "modello"]
    ordine.clear()
    finto_ctranslate2(monkeypatch, schede=0)
    modulo.carica(CFG)
    assert ordine == ["modello"], "sul processore non servono"


def test_una_libreria_di_cuda_che_non_si_carica_e_un_errore_che_dice_cosa_fare_non_un_traceback(monkeypatch, modello_finto):
    finto_ctranslate2(monkeypatch, schede=1)
    modello_finto.errore_alla_prova = RuntimeError("Library cublas64_12.dll is not found or cannot be loaded")
    with pytest.raises(Errore, match=r"scheda video.*cublas64_12\.dll.*macchina.scheda_video") as e:
        modulo.carica(CFG)
    assert "Traceback" not in str(e.value) and "RuntimeError" not in str(e.value)
    monkeypatch.setenv("MANGO_ANIMATION_LINGUA", "en")
    with pytest.raises(Errore, match=r"video card.*cublas64_12\.dll.*macchina.scheda_video"):
        modulo.carica(CFG)


def test_la_scheda_che_non_ha_memoria_per_la_prima_trascrizione_dice_la_frase_della_memoria(monkeypatch, modello_finto):
    finto_ctranslate2(monkeypatch, schede=1)
    modello_finto.errore_alla_prova = RuntimeError("CUDA failed with error out of memory")
    with pytest.raises(Errore, match=r"non ha memoria libera.*macchina.scheda_video"):
        modulo.carica(CFG)


def test_un_errore_della_prova_che_non_conosciamo_non_si_nasconde(monkeypatch, modello_finto):
    finto_ctranslate2(monkeypatch, schede=1)
    modello_finto.errore_alla_prova = RuntimeError("un guaio nuovo")
    with pytest.raises(RuntimeError, match="un guaio nuovo"):
        modulo.carica(CFG)
