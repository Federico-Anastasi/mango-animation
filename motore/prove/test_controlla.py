import json
import os
import shutil
import subprocess
import time
from pathlib import Path
from unittest import mock

import numpy as np
import pytest
from PIL import Image

from motore import animazioni
from motore.controlla import battute_fissate, colpi, contro_il_testo, controlla, doppioni, esitazioni
from motore.errori import Errore
from motore.monta import monta
from motore.risolvi import risolvi

from .aiuti import monta_con_animazioni
from .conftest import GIORNO, AllineatoreFinto, PAROLE_PAROLE

STILE = json.loads((Path(__file__).parent.parent.parent / "stile.json").read_text(encoding="utf-8"))
AL_SECONDO = 16000


def _tempo(secondi):
    return np.arange(round(secondi * AL_SECONDO)) / AL_SECONDO


def _vocale(secondi, sfuma=0.03):
    """Una vocale sintetica: armoniche di 120 Hz che salgono e scendono piano."""
    t = _tempo(secondi)
    suono = sum(np.sin(2 * np.pi * 120 * k * t) / k for k in range(1, 12))
    busta = np.minimum(1, np.minimum(t, secondi - t) / sfuma)
    return (0.2 * suono * busta).astype(np.float32)


def _fruscio(secondi, livello=0.0005, seme=0):
    return (livello * np.random.default_rng(seme).standard_normal(round(secondi * AL_SECONDO))).astype(np.float32)


def _clic():
    """Un colpo di tasto: rumore secco che si spegne in pochi millesimi."""
    t = _tempo(0.012)
    return (0.4 * np.random.default_rng(1).standard_normal(len(t)) * np.exp(-t / 0.002)).astype(np.float32)


def _risolto(parole, durata):
    return {"parole": [{"p": p, "da": da, "a": a, "tratto": 0, "voto": 1.0} for p, da, a in parole], "tratti": [{"esce": 0.0, "durata": durata}]}


def test_esitazioni_segna_i_vuoti_accanto_a_un_numero_da_riascoltare():
    """Un numero scritto in cifre («67», «10,5 GB», «7%») l'allineamento non sa quanto dura: il vuoto accanto è spesso il numero detto."""
    dette = [{"p": p, "da": da, "a": a} for p, da, a in [("passa", 0.0, 0.3), ("da", 0.4, 0.5), ("67", 1.8, 2.0), ("GB", 2.1, 2.2),
                                                         ("e", 3.5, 3.6), ("poi", 4.6, 4.8)]]
    assert esitazioni(dette, 0.3) == [{"a": 0.5, "dura": 1.3, "fra": ["da", "67"], "numero": True},
                                      {"a": 2.2, "dura": 1.3, "fra": ["GB", "e"], "numero": True},
                                      {"a": 3.6, "dura": 1.0, "fra": ["e", "poi"], "numero": False}]


def test_colpi_trova_il_tasto_dopo_l_ultima_vocale():
    x = np.concatenate([_fruscio(0.2), _vocale(0.4), _fruscio(0.25, seme=2), _clic(), _fruscio(0.3, seme=3)])
    trovati = colpi(x, _risolto([("sette", 0.2, 0.6)], len(x) / AL_SECONDO), STILE)
    assert [c["a"] for c in trovati] == [pytest.approx(0.85, abs=0.01)]


def test_colpi_non_scambia_per_tasto_la_vocale_che_si_spegne_ne_la_doppia_t():
    """«otto»: la vocale, il silenzio della doppia «t», lo scoppio della «t» e un'altra vocale. Lo scoppio è seguito dalla voce: non è un tasto."""
    x = np.concatenate([_fruscio(0.2), _vocale(0.25), _fruscio(0.08, seme=2), _clic(), _vocale(0.3), _fruscio(0.3, seme=3)])
    assert colpi(x, _risolto([("otto", 0.2, 0.9)], len(x) / AL_SECONDO), STILE) == []


def test_colpi_guarda_solo_dopo_l_ultima_parola_di_ogni_tratto():
    """Un tasto prima dell'ultima parola del tratto (fra due parole) lo contano le esitazioni, non i colpi."""
    x = np.concatenate([_fruscio(0.2), _vocale(0.3), _fruscio(0.1, seme=2), _clic(), _fruscio(0.1, seme=3), _vocale(0.3), _fruscio(0.2, seme=4)])
    assert colpi(x, _risolto([("uno", 0.2, 0.5), ("due", 0.81, 1.11)], len(x) / AL_SECONDO), STILE) == []


def test_colpi_non_scambia_per_tasto_la_voce_del_tratto_dopo():
    """Nel montato la voce del tratto dopo può cominciare qualche millesimo prima del bordo scritto nel risolto: non è un colpo."""
    x = np.concatenate([_fruscio(0.2), _vocale(0.3), _fruscio(0.29, seme=2), _vocale(0.3), _fruscio(0.2, seme=3)])
    risolto = {"parole": [{"p": "uno", "da": 0.2, "a": 0.5, "tratto": 0, "voto": 1.0}, {"p": "due", "da": 0.8, "a": 1.09, "tratto": 1, "voto": 1.0}],
               "tratti": [{"esce": 0.0, "durata": 0.8}, {"esce": 0.8, "durata": len(x) / AL_SECONDO - 0.8}]}
    assert colpi(x, risolto, STILE) == []


DETTE = [{"p": p, "da": i * 0.5, "a": i * 0.5 + 0.4} for i, p in enumerate(["poi", "abbiamo", "27", "miliardi", "di", "parametri", "molto", "molto", "grandi"])]


def test_doppioni_trova_le_parole_ripetute_che_il_testo_non_ha():
    assert doppioni(DETTE, "poi poi abbiamo 27 miliardi 27 miliardi di parametri molto molto grandi") == [
        {"a": 0.0, "parole": "poi poi"}, {"a": 1.0, "parole": "27 miliardi 27 miliardi"}]
    assert doppioni(DETTE, "poi abbiamo 27 27 miliardi di parametri molto molto grandi") == [{"a": 1.0, "parole": "27 27"}]
    assert doppioni(DETTE, "poi abbiamo 27 miliardi di parametri molto molto grandi") == []


TESTO = """# Testo registrato

Approvato dal creator l'1 novembre 2026. In MAIUSCOLO le parole su cui entra ciò che la scena mostra.

| # | battuta | ripresa | animazione |
|---|---|---|---|
| 1 | Notizia CLAMOROSA, il COMITATO sostiene di aver risolto il PROBLEMA. | 5405 1.8–13.3 | il titolo |
| 2 | Ha fatto delle IPOTESI | per arrivare al suo OBIETTIVO. | 5419 ~36–~38 \\| ~40–44.6 | segni lungo la strada |
| 3 | E tu cosa ne PENSI? Ti \\| CONVINCE? | 5422 86.8–95.0 \\| 96–97 | la bilancia |

## Lasciato fuori
- 5409 «Il motivo è semplice».
"""


def test_il_testo_fissato_si_legge_dalla_tabella():
    assert battute_fissate(TESTO) == ("Notizia CLAMOROSA, il COMITATO sostiene di aver risolto il PROBLEMA. Ha fatto delle IPOTESI per arrivare al suo OBIETTIVO. "
                                    "E tu cosa ne PENSI? Ti CONVINCE?")


def test_i_sottotitoli_si_confrontano_col_testo_fissato():
    giuste = [{"da": 0.0, "testo": "notizia clamorosa"}, {"da": 1.0, "testo": "il comitato sostiene di"}, {"da": 2.0, "testo": "aver risolto il problema"},
              {"da": 3.0, "testo": "ha fatto delle ipotesi"}, {"da": 4.0, "testo": "per arrivare al suo"}, {"da": 5.0, "testo": "obiettivo"},
              {"da": 6.0, "testo": "e tu cosa ne pensi?"}, {"da": 7.0, "testo": "ti convince?"}]
    testo = battute_fissate(TESTO)
    assert contro_il_testo(giuste, testo) == []
    sbagliate = [*giuste[:2], {"da": 2.0, "testo": "aver risolto il programma"}, *giuste[3:6], {"da": 6.0, "testo": "e tu cosa ne pensi"}, giuste[7]]
    assert contro_il_testo([], "Ciao a tutti?") == [{"a": 0.0, "voluto": "Ciao a tutti ?", "scritto": ""}]
    assert contro_il_testo(sbagliate, testo) == [{"a": 2.0, "voluto": "PROBLEMA.", "scritto": "programma"}, {"a": 6.0, "voluto": "?", "scritto": ""}]


def _monta(archivio, scrivi_piano, prepara_sintetico, tmp_path, slug="k", **altro):
    file = f"{GIORNO}/parole.mp4"
    if not archivio.grezzo(file).exists():
        file = prepara_sintetico("parole", PAROLE_PAROLE)
    scrivi_piano(slug, {"quadro": "girato-pieno", "sorgenti": {"p": {"file": file}}, "scene": [{"nome": "s", "pezzi": [{"sorgente": "p", "minuto": "00:00", "dice": "ciao a tutti"}]}],
                        "sottotitoli": {"modo": "nessuno"}, **altro})
    monta_con_animazioni(archivio, slug, tmp_path)


def _controlla(archivio, slug="k", sentito="ciao a tutti"):
    return controlla(archivio, slug, avanza=lambda *_: None, allineatore=AllineatoreFinto(), trascrittore=lambda audio, lingua: sentito)


def test_un_pezzo_in_un_altra_lingua_si_riascolta_nella_sua(archivio, scrivi_piano, prepara_sintetico, finto, tmp_path):
    """Un keynote in inglese dentro un video italiano: riascoltato in italiano non si sente niente, e ogni sua parola sembra persa.
    Ogni tratto si riascolta nella lingua del suo girato (la scheda del file nel grezzo), e le parole si confrontano dentro la stessa lingua."""
    nostro = prepara_sintetico("parole", PAROLE_PAROLE)
    altrui = prepara_sintetico("parole", PAROLE_PAROLE, come="keynote")
    archivio.grezzo(altrui).with_name(archivio.grezzo(altrui).name + ".scheda.json").write_text(
        json.dumps({"tipo": "altro", "origine": "scaricato", "lingua": "en"}), encoding="utf-8")
    scrivi_piano("k", {"quadro": "girato-pieno", "sorgenti": {"p": {"file": nostro}, "k": {"file": altrui}}, "sottotitoli": {"modo": "nessuno"},
                       "scene": [{"nome": "s", "pezzi": [{"sorgente": "p", "minuto": "00:00", "dice": "ciao a tutti"}, {"sorgente": "k", "minuto": "00:00", "dice": "buona sera"}]}]})
    monta_con_animazioni(archivio, "k", tmp_path)
    ascolti = []

    def trascrittore(audio, lingua):
        ascolti.append((lingua, len(audio)))
        return {"it": "ciao a tutti", "en": "buona sera"}[lingua]

    esito = controlla(archivio, "k", avanza=lambda *_: None, allineatore=AllineatoreFinto(), trascrittore=trascrittore)
    assert [l for l, _ in ascolti] == [archivio.stile["preparati"]["lingua"], "en"]
    assert sum(n for _, n in ascolti) == pytest.approx(esito["durata"] * 16000, abs=16000 * 0.05), "si riascolta tutto il montato, una volta"
    assert esito["differenze"] == [] and esito["sentito"] == "ciao a tutti buona sera"


def test_controlla_segnala_una_parola_molto_lunga_e_dice_cosa_ci_sente(archivio, scrivi_piano, prepara_sintetico, finto, tmp_path):
    """Una falsa partenza fusa con la frase ridetta è una parola sola di qualche secondo, e il montato riascoltato intero la fonde di
    nuovo: né `differenze` né `doppioni` la vedono. La sua finestra si riascolta da sola."""
    _monta(archivio, scrivi_piano, prepara_sintetico, tmp_path)
    assert _controlla(archivio)["parole_lunghe"] == []
    file_risolto = archivio.lavoro("k") / "risolto.json"
    r = json.loads(file_risolto.read_text(encoding="utf-8"))
    w = r["parole"][1]
    w["a"] = round(w["da"] + archivio.stile["preparati"]["parola_lunga"] + 0.5, 2)
    file_risolto.write_text(json.dumps(r), encoding="utf-8")
    ascolti = []

    def trascrittore(audio, lingua):
        ascolti.append(len(audio))
        return "ciao a tutti" if len(ascolti) == 1 else "a… ciao a tutti"

    esito = controlla(archivio, "k", avanza=lambda *_: None, allineatore=AllineatoreFinto(), trascrittore=trascrittore)
    assert esito["parole_lunghe"] == [{"a": round(w["da"], 2), "parola": w["p"], "dura": round(w["a"] - w["da"], 2), "sentito": "a… ciao a tutti"}]
    assert len(ascolti) == 2 and ascolti[1] == pytest.approx((min(w["a"], esito["durata"]) - w["da"]) * AL_SECONDO, abs=AL_SECONDO * 0.05), "si riascolta la sola finestra della parola"


def test_controlla_trova_il_girato_senza_parole_in_testa_e_in_coda(archivio, scrivi_piano, prepara_sintetico, finto, tmp_path):
    _monta(archivio, scrivi_piano, prepara_sintetico, tmp_path)
    file_risolto = archivio.lavoro("k") / "risolto.json"
    r = json.loads(file_risolto.read_text(encoding="utf-8"))
    assert _controlla(archivio)["senza_parole"] == []
    r["parole"][0]["da"] += 0.5
    r["parole"][-1]["a"] -= 0.5
    file_risolto.write_text(json.dumps(r), encoding="utf-8")
    esito = _controlla(archivio)
    assert [(s["a"], s["dura"]) for s in esito["senza_parole"]] == [(0.0, pytest.approx(r["parole"][0]["da"], abs=0.01)),
                                                                   (round(r["parole"][-1]["a"], 2), pytest.approx(esito["durata"] - r["parole"][-1]["a"], abs=0.01))]


def test_controlla_si_ferma_se_il_montato_e_di_un_altro_piano(archivio, scrivi_piano, prepara_sintetico, finto, tmp_path):
    """Un montato vecchio confrontato col risolto nuovo darebbe ogni parola fuori posto: si dice di rimontare."""
    _monta(archivio, scrivi_piano, prepara_sintetico, tmp_path)
    piano = json.loads((archivio.video("k") / "piano.json").read_text(encoding="utf-8"))
    piano["scene"][0]["pezzi"][0]["dice"] = "ciao a"
    scrivi_piano("k", piano)
    risolvi(archivio, "k")
    with pytest.raises(Errore, match="monta k"):
        _controlla(archivio)


def test_controlla_si_ferma_se_il_montato_senza_impronta_dura_diverso_dal_risolto(archivio, scrivi_piano, prepara_sintetico, finto, tmp_path):
    """Un montato senza `montaggio.json`: di quale piano sia lo dice la durata."""
    _monta(archivio, scrivi_piano, prepara_sintetico, tmp_path)
    file = archivio.lavoro("k") / "montaggio.json"
    m = json.loads(file.read_text(encoding="utf-8"))
    del m["uscite"]
    file.write_text(json.dumps(m), encoding="utf-8")
    assert _controlla(archivio)["silenzi"] == []
    file_risolto = archivio.lavoro("k") / "risolto.json"
    r = json.loads(file_risolto.read_text(encoding="utf-8"))
    r["impronta"], r["durata"] = "altra", r["durata"] - 0.5
    file_risolto.write_text(json.dumps(r), encoding="utf-8")
    with pytest.raises(Errore, match="monta k"):
        _controlla(archivio)


def test_controlla_trova_i_doppioni_in_cio_che_sente(archivio, scrivi_piano, prepara_sintetico, finto, tmp_path):
    _monta(archivio, scrivi_piano, prepara_sintetico, tmp_path)
    esito = _controlla(archivio, sentito="ciao a a tutti")
    assert [d["parole"] for d in esito["doppioni"]] == ["a a"]


def test_controlla_confronta_i_sottotitoli_col_testo_fissato_solo_se_c_e(archivio, scrivi_piano, prepara_sintetico, finto, tmp_path):
    _monta(archivio, scrivi_piano, prepara_sintetico, tmp_path)
    righe = []
    assert controlla(archivio, "k", avanza=righe.append, allineatore=AllineatoreFinto(), trascrittore=lambda audio, lingua: "ciao a tutti")["sottotitoli"] is None
    assert any("testo fissato" in r for r in righe)
    materiali = archivio.video("k") / "materiali"
    materiali.mkdir()
    (materiali / "testo-registrato.md").write_text("| # | battuta | ripresa | animazione |\n|---|---|---|---|\n| 1 | Ciao a TUTTI? | p 1–2.6 | niente |\n", encoding="utf-8")
    assert _controlla(archivio)["sottotitoli"] == [{"a": pytest.approx(0.0, abs=0.1), "voluto": "?", "scritto": ""}]


def test_controlla_dice_se_la_copertina_manca_e_vecchia_o_vuota(archivio, scrivi_piano, prepara_sintetico, finto, tmp_path):
    _monta(archivio, scrivi_piano, prepara_sintetico, tmp_path)
    assert _controlla(archivio)["copertina"] == [{"cosa": "manca"}]
    piena = tmp_path / "piena.png"
    disegno = Image.new("RGB", (1080, 1920), (250, 250, 250))
    disegno.paste((20, 20, 20), (0, 0, 540, 1920))
    disegno.save(piena)
    _monta(archivio, scrivi_piano, prepara_sintetico, tmp_path, copertina={"disegno": str(piena)})
    esito = _controlla(archivio)
    assert esito["copertina"] == []
    assert esito["lampi"] == [] and esito["parole_fuori_posto"] == [] and esito["differenze"] == [] and esito["esitazioni"] == [] and esito["senza_parole"] == []
    assert esito["durata"] == pytest.approx(risolvi(archivio, "k", scrivi=False)["durata"], abs=0.02), "la copertina in testa non conta nella durata del video"
    con, finale = archivio.uscite("k") / "con-copertina.mp4", archivio.uscite("k") / "finale.mp4"
    vecchia = tmp_path / "vecchia.mp4"
    shutil.copy(finale, vecchia)
    con.unlink()
    shutil.copy(vecchia, con)
    dopo = time.time() + 5
    os.utime(finale, (dopo, dopo))
    assert _controlla(archivio)["copertina"] == [{"cosa": "vecchia"}]
    bianca = tmp_path / "bianca.png"
    Image.new("RGB", (1080, 1920), (250, 250, 250)).save(bianca)
    _monta(archivio, scrivi_piano, prepara_sintetico, tmp_path, copertina={"disegno": str(bianca)})
    assert [c["cosa"] for c in _controlla(archivio)["copertina"]] == ["vuota"]


def _scene_che_si_muovono(archivio, slug):
    """Al posto delle scene arancioni ferme, un disegno vario che si muove (testsrc2)."""
    r = risolvi(archivio, slug)
    cartella = archivio.lavoro(slug) / "scene"
    cartella.mkdir(parents=True, exist_ok=True)
    for sigla, voce in animazioni.richiesta(r, archivio.stile).items():
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"testsrc2=s={voce['formato']['largo']}x{voce['formato']['alto']}:r=30:d={voce['durata']:.4f}",
                        "-c:v", "libx264", "-pix_fmt", "yuv420p", str(cartella / f"{sigla}.mp4")], check=True)


def test_controlla_trova_la_zona_sopra_la_sagoma_ferma_e_vuota(archivio, scrivi_piano, prepara_sintetico, finto, tmp_path):
    file = prepara_sintetico("parole", PAROLE_PAROLE)
    scrivi_piano("z", {"quadro": "sagoma-su-animazione", "sorgenti": {"p": {"file": file}}, "scene": [{"nome": "s", "animazione": "uno", "pezzi": [{"sorgente": "p", "minuto": "00:00", "dice": "ciao a tutti"}]}],
                       "sottotitoli": {"modo": "nessuno"}, "coda": 1.5})
    monta_con_animazioni(archivio, "z", tmp_path)
    esito = _controlla(archivio, "z")
    assert sorted(z["cosa"] for z in esito["zona_alta"]) == ["ferma", "vuota"]
    assert all(z["a"] == pytest.approx(0, abs=0.05) and z["dura"] == pytest.approx(esito["durata"], abs=0.1) for z in esito["zona_alta"])
    _scene_che_si_muovono(archivio, "z")
    with mock.patch.object(animazioni, "rendi"):
        monta(archivio, "z", avanza=lambda *_: None)
    assert _controlla(archivio, "z")["zona_alta"] == []


class AllineatoreConVoti(AllineatoreFinto):
    """Come il finto, ma dà ad ogni parola il voto che si vuole (per numero d'ordine, il resto 0,95)."""

    def __init__(self, voti):
        self.voti = voti

    def allinea(self, x, parole):
        return [(da, a, self.voti.get(n, 0.95)) for n, (da, a, _) in enumerate(super().allinea(x, parole))]


def test_controlla_non_segnala_una_parola_il_cui_voto_e_sceso_ma_resta_sopra_il_minimo(archivio, scrivi_piano, prepara_sintetico, finto, tmp_path):
    """Le parole brevi dette in fretta hanno un voto più basso nel montato che nella ripresa: non è una parola fuori posto, lo è solo quella che non si ritrova."""
    _monta(archivio, scrivi_piano, prepara_sintetico, tmp_path)
    minimo = archivio.stile["controllo"]["voto_minimo"]
    esito = controlla(archivio, "k", avanza=lambda *_: None, allineatore=AllineatoreConVoti(dict.fromkeys(range(3), minimo + 0.1)), trascrittore=lambda audio, lingua: "ciao a tutti")
    assert esito["parole_fuori_posto"] == []
    esito = controlla(archivio, "k", avanza=lambda *_: None, allineatore=AllineatoreConVoti({1: minimo - 0.1}), trascrittore=lambda audio, lingua: "ciao a tutti")
    assert [(p["parola"], p["voto"]) for p in esito["parole_fuori_posto"]] == [("a", pytest.approx(minimo - 0.1))]


def test_controlla_guarda_anche_le_parole_dei_pezzi_a_tempo(archivio, scrivi_piano, prepara_sintetico, finto, tmp_path):
    """I tempi di un pezzo a tempo sono quelli della trascrizione, senza il confine vero: della parola si guarda solo se si ritrova, non dove."""
    file = prepara_sintetico("parole", PAROLE_PAROLE)
    scrivi_piano("t", {"quadro": "girato-pieno", "sorgenti": {"p": {"file": file}}, "scene": [{"nome": "s", "pezzi": [{"sorgente": "p"}]}], "sottotitoli": {"modo": "nessuno"}})
    monta_con_animazioni(archivio, "t", tmp_path)
    parole = json.loads((archivio.lavoro("t") / "risolto.json").read_text(encoding="utf-8"))["parole"]
    assert parole and all(p["voto"] is None for p in parole)
    sentito = lambda audio, lingua: " ".join(p["p"] for p in parole)
    assert controlla(archivio, "t", avanza=lambda *_: None, allineatore=AllineatoreConVoti({}), trascrittore=sentito)["parole_fuori_posto"] == []
    esito = controlla(archivio, "t", avanza=lambda *_: None, allineatore=AllineatoreConVoti({2: 0.05}), trascrittore=sentito)
    assert [p["parola"] for p in esito["parole_fuori_posto"]] == [parole[2]["p"]]
