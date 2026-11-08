
import json
from pathlib import Path

import pytest

from motore.archivio import Archivio, leggi_stile, scrivi_json, unisci_stile, valida
from motore.errori import Errore

BASE = {
    "quadro": "girato-pieno",
    "sorgenti": {"a": {"file": "2026-10-09/tempo.mp4", "viste": {"x": {"taglio": [0, 0, 10, 10]}}}},
    "scene": [{"nome": "uno", "pezzi": [{"sorgente": "a"}]}, {"nome": "due", "pezzi": [{"sorgente": "a", "da": 1, "a": 2}]}],
    "sottotitoli": {"modo": "parola per parola", "nomi": ["Alfa"], "correzioni": [{"sentite": ["a"], "giuste": "b"}]},
    "coda": 0.5,
}


def test_un_piano_giusto_passa(archivio, scrivi_piano):
    scrivi_piano("base", BASE)
    assert archivio.piano("base") == BASE


def test_un_piano_sbagliato_dice_dove_e_cosa(archivio, scrivi_piano):
    scrivi_piano("rotto", {"quadro": "girato-pieno", "sorgenti": {"a": {}}, "scene": [{"nome": "x", "pezzi": [{"sorgente": "a", "minuto": "1:00"}]}], "coso": 1})
    with pytest.raises(Errore) as e:
        archivio.piano("rotto")
    testo = str(e.value)
    assert "sorgenti.a: manca «file»" in testo
    assert "«coso» non è una chiave" in testo
    assert "scene[0].pezzi[0]" in testo


def test_la_base_porta_cio_che_il_piano_non_dichiara(archivio, scrivi_piano):
    scrivi_piano("base", BASE)
    scrivi_piano("figlio", {"base": "base", "coda": 1.0, "scene": [{"nome": "due", "pezzi": [{"sorgente": "a", "da": 3, "a": 4}]}, {"nome": "tre", "pezzi": [{"sorgente": "a"}]}],
                            "sorgenti": {"a": {"file": "2026-10-09/tempo.mp4", "viste": {"y": {"taglio": [1, 1, 5, 5]}}}},
                            "sottotitoli": {"nomi": ["Marta"], "correzioni": [{"sentite": ["c"], "giuste": "d"}], "scrittura": "come trascritta"}})
    p = archivio.piano("figlio")
    assert p["quadro"] == "girato-pieno" and p["coda"] == 1.0 and "base" not in p
    assert [s["nome"] for s in p["scene"]] == ["uno", "due", "tre"]
    assert p["scene"][1]["pezzi"][0]["da"] == 3
    assert set(p["sorgenti"]["a"]["viste"]) == {"x", "y"}
    assert p["sottotitoli"]["modo"] == "parola per parola" and p["sottotitoli"]["scrittura"] == "come trascritta"
    assert p["sottotitoli"]["nomi"] == ["Alfa", "Marta"]
    assert [c["sentite"] for c in p["sottotitoli"]["correzioni"]] == [["a"], ["c"]]


def test_la_base_non_cambia_il_piano_della_base(archivio, scrivi_piano):
    scrivi_piano("base", BASE)
    scrivi_piano("figlio", {"base": "base", "sottotitoli": {"nomi": ["Marta"]}})
    archivio.piano("figlio")
    assert archivio.piano("base")["sottotitoli"]["nomi"] == ["Alfa"]


def test_le_basi_in_cerchio_si_dicono(archivio, scrivi_piano):
    scrivi_piano("a", {"base": "b"})
    scrivi_piano("b", {"base": "a"})
    with pytest.raises(Errore, match="in cerchio"):
        archivio.piano("a")


def test_la_base_che_manca_si_dice(archivio, scrivi_piano):
    scrivi_piano("figlio", {"base": "non-c-e"})
    with pytest.raises(Errore, match="non-c-e"):
        archivio.piano("figlio")


def test_lo_stile_ha_i_cinque_quadri_di_partenza(archivio):
    assert {"sagoma-su-animazione", "schermo-e-viso", "girato-pieno", "solo-animazione", "schermo-pieno"} <= set(archivio.stile["quadri"])


def test_valida_trova_i_riferimenti_rotti(archivio, scrivi_piano, prepara_sintetico):
    prepara_sintetico("larga", [{"p": "ciao", "da": 0.5, "a": 0.9}])
    scrivi_piano("v", {
        "quadro": "schermo-e-viso",
        "sorgenti": {"d": {"file": "2026-10-09/larga.mp4", "riquadri": {"webcam": [1244, 26, 432, 246]}, "viste": {"gara": {"taglio": [720, 280, 960, 720]}}}, "mancante": {"file": "2026-10-09/non-c-e.mp4"}},
        "scene": [{"nome": "s", "animazione": "x", "pezzi": [{"sorgente": "d", "vista": "boh"}, {"sorgente": "d", "minuto": "00:00", "dice": "parole che non esistono", "vista": "gara"}, {"sorgente": "fantasma"}]},
                  {"nome": "t", "quadro": "inventato", "pezzi": [{"sorgente": "d"}]}],
        "suoni": [{"file": "non-c-e.wav", "sorgente": "d", "t": 1, "picco": -10}],
    })
    errori, _ = valida(archivio, "v", controlla_animazioni=False)
    testo = "\n".join(errori)
    assert "non-c-e.mp4" in testo
    assert "ha un'animazione ma il quadro «schermo-e-viso» non ne mostra" in testo
    assert "vista «boh»" in testo
    assert "dal minuto 00:00 la trascrizione non dice: parole che non esistono" in testo
    assert "sorgente «fantasma»" in testo
    assert "quadro «inventato»" in testo
    assert "non-c-e.wav" in testo


def test_valida_dice_di_preparare(archivio, scrivi_piano, fonti):
    import os

    os.makedirs(archivio.radice / "grezzo" / "2026-10-09")
    os.link(fonti / "larga.mp4", archivio.grezzo("2026-10-09/larga.mp4"))
    scrivi_piano("v", {"quadro": "girato-pieno", "sorgenti": {"d": {"file": "2026-10-09/larga.mp4"}}, "scene": [{"nome": "s", "pezzi": [{"sorgente": "d", "minuto": "00:01", "dice": "ciao"}]}]})
    errori, _ = valida(archivio, "v", controlla_animazioni=False)
    assert any("non è preparata" in e and "python -m motore prepara v" in e for e in errori)


def test_valida_un_piano_buono(archivio, scrivi_piano, prepara_sintetico):
    prepara_sintetico("tempo", [{"p": "ciao", "da": 0.5, "a": 0.9}])
    scrivi_piano("v", {"quadro": "girato-pieno", "sorgenti": {"d": {"file": "2026-10-09/tempo.mp4"}}, "scene": [{"nome": "s", "pezzi": [{"sorgente": "d", "minuto": "00:00", "dice": "ciao"}]}]})
    assert valida(archivio, "v", controlla_animazioni=False) == ([], [])


def test_valida_controlla_la_sagoma_presa_da_un_altra_ripresa(archivio, scrivi_piano, prepara_sintetico):
    voce = prepara_sintetico("parole", [{"p": "ciao", "da": 1.0, "a": 1.4}])
    muta = prepara_sintetico("tempo", [{"p": "uno", "da": 0.55, "a": 1.5}], come="muta")
    scrivi_piano("v", {"quadro": "sagoma-su-animazione", "sorgenti": {"v": {"file": voce}, "m": {"file": muta}},
                       "scene": [{"nome": "s", "animazione": "x", "pezzi": [{"sorgente": "v", "sagoma": {"sorgente": "m", "scarto": 1.0}}]},
                                 {"nome": "t", "animazione": "y", "pezzi": [{"sorgente": "v", "sagoma": {"sorgente": "fantasma", "scarto": 1.0}}]},
                                 {"nome": "u", "quadro": "girato-pieno", "pezzi": [{"sorgente": "v", "sagoma": {"sorgente": "m", "scarto": 1.0}}]}]})
    errori, avvisi = valida(archivio, "v", controlla_animazioni=False)
    testo = "\n".join(errori)
    assert "prende la sagoma da «fantasma», che il piano non dichiara" in testo
    assert "il quadro «girato-pieno» non mostra una sagoma" in testo
    assert not any("«m»" in a for a in avvisi)


def test_un_json_scritto_a_meta_non_sostituisce_quello_buono(tmp_path, monkeypatch):
    file = tmp_path / "preparati" / "livelli.json"
    scrivi_json(file, {"a": 1})
    scrivi = Path.write_text

    def a_meta(self, testo, **opzioni):
        scrivi(self, testo[:5], **opzioni)
        raise OSError("disco pieno")

    monkeypatch.setattr(Path, "write_text", a_meta)
    with pytest.raises(OSError):
        scrivi_json(file, {"a": 2, "b": [1, 2, 3]}, indent=1)
    assert json.loads(file.read_text(encoding="utf-8")) == {"a": 1}


def test_scrivi_json_scrive_i_dati_e_non_lascia_file_accanto(tmp_path):
    file = tmp_path / "nuova" / "x.json"
    scrivi_json(file, {"è": [1, 2]}, indent=1)
    assert json.loads(file.read_text(encoding="utf-8")) == {"è": [1, 2]}
    assert [f.name for f in file.parent.iterdir()] == ["x.json"]


def test_la_cartella_di_lavoro_viene_dall_ambiente_e_l_archivio_sta_dentro(tmp_path, monkeypatch):
    lavoro = tmp_path / "lavoro"
    (lavoro / "archivio" / "video" / "uno").mkdir(parents=True)
    monkeypatch.setenv("MANGO_ANIMATION_LAVORO", str(lavoro))
    codice = tmp_path / "codice"
    codice.mkdir()
    (codice / "stile.json").write_text('{"formati": {}}', encoding="utf-8")
    a = Archivio(repo=codice)
    assert a.radice == (lavoro / "archivio").resolve()
    assert a.video("uno") == a.radice / "video" / "uno"
    assert a.stile == {"formati": {}}


def test_senza_cartella_di_lavoro_l_errore_dice_cosa_fare(monkeypatch):
    monkeypatch.delenv("MANGO_ANIMATION_LAVORO", raising=False)
    with pytest.raises(Errore) as e:
        Archivio()
    assert "cartella di lavoro" in str(e.value) and "MANGO_ANIMATION_LAVORO" in str(e.value)


def test_una_cartella_di_lavoro_che_non_c_e_lo_dice(tmp_path, monkeypatch):
    monkeypatch.setenv("MANGO_ANIMATION_LAVORO", str(tmp_path / "non-c-e"))
    with pytest.raises(Errore, match="non c'è"):
        Archivio()


def test_un_comando_trova_i_dati_nella_cartella_di_lavoro_anche_con_il_codice_altrove(tmp_path, monkeypatch, capsys):
    """Il codice è questo repo, i dati stanno in una cartella temporanea: `valida` legge il piano da lì e cerca il girato lì."""
    from motore.__main__ import main
    lavoro = tmp_path / "lavoro"
    cartella = lavoro / "archivio" / "video" / "base"
    cartella.mkdir(parents=True)
    (cartella / "piano.json").write_text(json.dumps(BASE), encoding="utf-8")
    monkeypatch.setenv("MANGO_ANIMATION_LAVORO", str(lavoro))
    assert main(["valida", "base"]) == 1
    assert str(lavoro / "archivio" / "grezzo") in capsys.readouterr().err


def test_un_comando_senza_cartella_di_lavoro_esce_con_l_errore_in_italiano(monkeypatch, capsys):
    from motore.__main__ import main
    monkeypatch.delenv("MANGO_ANIMATION_LAVORO", raising=False)
    assert main(["valida", "base"]) == 1
    assert "MANGO_ANIMATION_LAVORO" in capsys.readouterr().err


def test_lo_stile_del_creator_si_sovrappone_a_quello_di_serie_chiave_per_chiave():
    serie = {"colori": {"carta": "#fff", "rosso": "#f00"}, "titolo": {"corpo": 64, "parte": {"colore": "giallo", "stacco": 18}}, "licenze": ["a", "b"], "fps": 30, "solo_serie": {"x": 1}}
    creator = {"colori": {"rosso": "#c00", "verde": "#0f0"}, "titolo": {"parte": {"colore": "blu"}}, "licenze": ["c"], "fps": None, "solo_creator": True}
    assert unisci_stile(serie, creator) == {
        "colori": {"carta": "#fff", "rosso": "#c00", "verde": "#0f0"},
        "titolo": {"corpo": 64, "parte": {"colore": "blu", "stacco": 18}},
        "licenze": ["c"], "fps": None, "solo_serie": {"x": 1}, "solo_creator": True}
    assert list(unisci_stile(serie, creator)) == ["colori", "titolo", "licenze", "fps", "solo_serie", "solo_creator"]


def test_unire_gli_stili_non_cambia_nessuno_dei_due():
    serie, creator = {"a": {"b": [1]}}, {"a": {"b": [2], "c": {"d": 1}}}
    unito = unisci_stile(serie, creator)
    unito["a"]["c"]["d"] = 9
    unito["a"]["b"].append(3)
    assert serie == {"a": {"b": [1]}} and creator == {"a": {"b": [2], "c": {"d": 1}}}


def test_l_archivio_legge_lo_stile_unito_se_la_cartella_di_lavoro_ne_ha_uno(tmp_path):
    codice = tmp_path / "codice"
    codice.mkdir()
    (codice / "stile.json").write_text('{"colori": {"carta": "#fff", "rosso": "#f00"}, "formati": {"verticale": {"largo": 1}}}', encoding="utf-8")
    (tmp_path / "lavoro").mkdir()
    a = Archivio(radice=tmp_path / "lavoro" / "archivio", repo=codice)
    assert a.stile["colori"]["rosso"] == "#f00"
    (tmp_path / "lavoro" / "stile.json").write_text('{"colori": {"rosso": "#c00"}}', encoding="utf-8")
    a.rileggi_stile()
    assert a.stile == {"colori": {"carta": "#fff", "rosso": "#c00"}, "formati": {"verticale": {"largo": 1}}}


def test_uno_stile_del_creator_rotto_dice_quale_file_correggere(tmp_path):
    codice, lavoro = tmp_path / "codice", tmp_path / "lavoro"
    codice.mkdir()
    lavoro.mkdir()
    (codice / "stile.json").write_text("{}", encoding="utf-8")
    (lavoro / "stile.json").write_text("{", encoding="utf-8")
    with pytest.raises(Errore, match="stile del creator.*non è un JSON valido"):
        leggi_stile(codice, lavoro)
    (lavoro / "stile.json").write_text("[1]", encoding="utf-8")
    with pytest.raises(Errore, match="stile del creator.*oggetto"):
        leggi_stile(codice, lavoro)
