import json
import shutil

import pytest

from motore.errori import Errore
from motore.archivio import Archivio
from motore.risolvi import SEZIONI_FUORI_DAL_MONTATO, impronta_su_disco, nel_video, risolvi

from .conftest import PAROLE_PAROLE, PAROLE_TEMPO

FPS = 30


@pytest.fixture
def video(archivio, prepara_sintetico, scrivi_piano, finto):
    tempo = prepara_sintetico("tempo", PAROLE_TEMPO)
    parole = prepara_sintetico("parole", PAROLE_PAROLE)
    piano = {
        "quadro": "girato-pieno",
        "sorgenti": {"t": {"file": tempo}, "p": {"file": parole}},
        "scene": [
            {"nome": "uno", "pezzi": [{"sorgente": "t"}]},
            {"nome": "due", "pezzi": [{"sorgente": "p", "minuto": "00:00", "dice": "ciao a tutti"}, {"sorgente": "p", "minuto": "00:05", "dice": "buona sera"}]},
        ],
        "sottotitoli": {"modo": "parola per parola"},
    }
    scrivi_piano("v", piano)
    return "v", piano


def test_i_tratti_si_susseguono_senza_buchi_a_fotogrammi_interi(archivio, video):
    r = risolvi(archivio, video[0])
    assert r["formato"] == {"largo": 1080, "alto": 1920, "fps": 30, "nome": "verticale"}
    atteso = 0.0
    for t in r["tratti"]:
        assert t["esce"] == pytest.approx(atteso, abs=1e-4)
        assert t["durata"] * FPS == pytest.approx(round(t["durata"] * FPS), abs=1e-6)
        atteso += t["durata"]
    assert r["durata"] == pytest.approx(atteso, abs=1e-4)
    assert [t["scena"] for t in r["tratti"]] == [0, 0, 0, 1, 1]
    assert [s["inizio"] for s in r["scene"]] == [pytest.approx(0.0), pytest.approx(sum(t["durata"] for t in r["tratti"][:3]), abs=1e-4)]
    assert r["scene"][1]["durata"] == pytest.approx(sum(t["durata"] for t in r["tratti"][3:]), abs=1e-4)
    assert all(s["quadro"] == "girato-pieno" for s in r["scene"])


def test_ogni_parola_cade_nel_suo_tratto(archivio, video):
    r = risolvi(archivio, video[0])
    assert r["parole"]
    for w in r["parole"]:
        t = r["tratti"][w["tratto"]]
        assert t["esce"] - 1e-3 <= w["da"] <= w["a"] <= t["esce"] + t["durata"] + 1e-3, (w, t)
        assert t["da"] - 0.05 <= w["nella_sorgente"] <= t["da"] + t["durata"] + 0.05
        assert w["da"] == pytest.approx(t["esce"] + max(0, w["nella_sorgente"] - t["da"]), abs=2e-3)
    assert [w["p"] for w in r["parole"] if r["tratti"][w["tratto"]]["scena"] == 1] == ["ciao", "a", "tutti", "buona", "sera"]
    assert [w["da"] for w in r["parole"]] == sorted(w["da"] for w in r["parole"])


def test_il_voto_c_e_solo_dove_l_allineamento_l_ha_misurato(archivio, video):
    r = risolvi(archivio, video[0])
    assert {w["voto"] for w in r["parole"] if r["tratti"][w["tratto"]]["scena"] == 0} == {None}
    assert {w["voto"] for w in r["parole"] if r["tratti"][w["tratto"]]["scena"] == 1} == {0.95}


def test_le_battute_non_dicono_una_parola_prima_che_sia_detta(archivio, video):
    r = risolvi(archivio, video[0])
    detti = {round(w["da"], 3) for w in r["parole"]}
    assert r["battute"]
    for b in r["battute"]:
        assert b["da"] <= b["istanti"][0] + 1e-9 and b["a"] > b["istanti"][-1]
        assert all(i in detti for i in b["istanti"]), b
        assert len(b["testo"].split()) == len(b["istanti"])
    assert " ".join(b["testo"] for b in r["battute"] if b["da"] > r["scene"][1]["inizio"]) == "ciao a tutti buona sera"


def _traduzione(r):
    return [{"it": b["testo"], "en": f"EN {n}"} for n, b in enumerate(r["battute"], 1)]


def test_i_sottotitoli_tradotti_tengono_i_tempi_italiani(archivio, video, scrivi_piano):
    r = risolvi(archivio, video[0], scrivi=False)
    scrivi_piano("v", {**video[1], "lingua": "en", "sottotitoli": {"modo": "a battute", "traduzione": _traduzione(r)}})
    t = risolvi(archivio, "v", scrivi=False)
    assert t["lingua"] == "en"
    assert [b["testo"] for b in t["battute"]] == [f"EN {n}" for n in range(1, len(r["battute"]) + 1)]
    assert [(b["da"], b["a"]) for b in t["battute"]] == [(b["da"], b["a"]) for b in r["battute"]]


def test_una_traduzione_storta_si_ferma_invece_di_sfasare(archivio, video, scrivi_piano):
    r = risolvi(archivio, video[0], scrivi=False)
    buona = _traduzione(r)
    scrivi_piano("v", {**video[1], "lingua": "en", "sottotitoli": {"modo": "a battute", "traduzione": buona[:-1]}})
    with pytest.raises(Errore, match="righe per"):
        risolvi(archivio, "v", scrivi=False)
    storta = [{"it": f"tutt'altro {n}", "en": "x"} for n in range(1, len(buona) + 1)]
    scrivi_piano("v", {**video[1], "lingua": "en", "sottotitoli": {"modo": "a battute", "traduzione": storta}})
    with pytest.raises(Errore, match="riga 1"):
        risolvi(archivio, "v", scrivi=False)


def test_coi_sottotitoli_tradotti_non_si_va_parola_per_parola(archivio, video, scrivi_piano):
    r = risolvi(archivio, video[0], scrivi=False)
    scrivi_piano("v", {**video[1], "lingua": "en", "sottotitoli": {"modo": "parola per parola", "traduzione": _traduzione(r)}})
    with pytest.raises(Errore, match="parola per parola"):
        risolvi(archivio, "v", scrivi=False)


def test_il_risolto_si_scrive_e_l_impronta_segue_il_piano(archivio, video, scrivi_piano):
    r = risolvi(archivio, video[0])
    assert json.loads((archivio.lavoro("v") / "risolto.json").read_text(encoding="utf-8")) == r
    assert risolvi(archivio, "v", scrivi=False)["impronta"] == r["impronta"]
    scrivi_piano("v", {**video[1], "coda": 1.0})
    assert risolvi(archivio, "v")["impronta"] != r["impronta"]


def test_la_coda_si_aggiunge_all_ultimo_tratto(archivio, video, scrivi_piano):
    prima = risolvi(archivio, video[0])
    scrivi_piano("v", {**video[1], "coda": 0.7})
    dopo = risolvi(archivio, "v")
    assert dopo["durata"] - prima["durata"] == pytest.approx(round(0.7 * FPS) / FPS, abs=1e-4)
    assert dopo["tratti"][-1]["durata"] - prima["tratti"][-1]["durata"] == pytest.approx(round(0.7 * FPS) / FPS, abs=1e-4)


def test_un_pezzo_a_tempo_e_uno_a_parole_nello_stesso_video(archivio, video):
    r = risolvi(archivio, video[0])
    [uno] = [t for t in r["tratti"] if t["scena"] == 0 and t["legato"] == [None, None]][:1]
    assert uno["sorgente"] == "t" and uno["da"] == pytest.approx(0.6 - archivio.stile["voce"]["margine"], abs=0.01)
    assert {t["sorgente"] for t in r["tratti"] if t["scena"] == 1} == {"p"}


def test_ancore_e_parole_della_scena_vanno_al_tempo_del_video(archivio, scrivi_piano, prepara_sintetico, finto):
    file = prepara_sintetico("tempo", PAROLE_TEMPO)
    scrivi_piano("a", {"quadro": "solo-animazione", "sorgenti": {"t": {"file": file}},
                       "scene": [{"nome": "s", "animazione": "x", "pezzi": [{"sorgente": "t"}], "ancore": [["t", 3.6, 1.5], ["t", 0.7, 0.2]], "parole": {"due": ["t", 1.7], "quattro": ["t", 6.0]}}]})
    r = risolvi(archivio, "a")
    s = r["scene"][0]
    t0, t1, t2 = r["tratti"]
    assert s["ancore"] == [[pytest.approx(0.7 - t0["da"], abs=1e-3), 0.2], [pytest.approx(t1["esce"] + 3.6 - t1["da"], abs=1e-3), 1.5]]
    assert s["tempi"]["due"] == pytest.approx(1.72 - t0["da"], abs=0.011)
    assert s["tempi"]["quattro"] == pytest.approx(t2["esce"] + 6.02 - t2["da"], abs=0.011)
    assert s["animazione"] == "x"


def test_un_taglio_prima_di_una_scena_non_cambia_le_sue_ancore_e_i_suoi_tempi(archivio, scrivi_piano, prepara_sintetico, finto):
    file = prepara_sintetico("tempo", PAROLE_TEMPO)
    scena = {"nome": "s", "animazione": "x", "pezzi": [{"sorgente": "t"}], "ancore": [["t", 3.6, 1.5], ["t", 0.7, 0.2], ["t", 6.4, 2.5]], "parole": {"due": ["t", 1.7], "quattro": ["t", 6.0]}}

    def della_scena(fine):
        scrivi_piano("a", {"quadro": "solo-animazione", "sorgenti": {"t": {"file": file}},
                           "scene": [{"nome": "prima", "pezzi": [{"sorgente": "t", "da": 0.6, "a": fine}]}, scena]})
        r = risolvi(archivio, "a")
        return r["scene"][1]["inizio"], r["scene"][1]["ancore"], r["scene"][1]["tempi"]

    inizio0, ancore0, tempi0 = della_scena(1.5)
    inizi = {inizio0}
    for fine in [round(1.5 + k * 0.15, 4) for k in range(1, 40)]:
        inizio, ancore, tempi = della_scena(fine)
        inizi.add(inizio)
        assert (ancore, tempi) == (ancore0, tempi0), fine
    assert len(inizi) > 15


def test_un_suono_parte_sulla_sorgente_al_suo_secondo(archivio, video, scrivi_piano, fonti):
    materiali = archivio.video("v") / "materiali"
    materiali.mkdir()
    shutil.copy(fonti / "sagoma.webm", materiali / "non-un-suono.webm")
    import subprocess

    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=f=300:d=0.5", str(materiali / "bip.wav")], check=True)
    scrivi_piano("v", {**video[1], "suoni": [{"file": "bip.wav", "sorgente": "t", "t": 3.6, "picco": -10}]})
    r = risolvi(archivio, "v")
    [s] = r["suoni"]
    t = next(t for t in r["tratti"] if t["sorgente"] == "t" and t["da"] <= 3.6 < t["da"] + t["durata"])
    assert s["file"] == "bip.wav" and s["esce"] == pytest.approx(t["esce"] + 3.6 - t["da"], abs=2e-3)
    assert -30 < s["guadagno"] < 30 and s["guadagno"] != 0


def test_il_titolo_dura_quanto_dice_lo_stile_se_il_piano_non_dice_altro(archivio, video, scrivi_piano):
    durata = archivio.stile["titolo"]["durata"]
    scrivi_piano("v", {**video[1], "titolo": {"testo": "Un titolo"}})
    r = risolvi(archivio, "v")
    assert durata < r["durata"] and r["titolo"] == {"testo": "Un titolo", "parte": None, "da": 0, "a": durata}
    scrivi_piano("v", {**video[1], "titolo": {"testo": "Un titolo", "da": 2}})
    assert risolvi(archivio, "v")["titolo"]["a"] == 2 + durata
    scrivi_piano("v", {**video[1], "titolo": {"testo": "Un titolo", "da": r["durata"] - durata / 2}})
    assert risolvi(archivio, "v")["titolo"]["a"] == r["durata"]
    scrivi_piano("v", {**video[1], "titolo": {"testo": "Un titolo", "da": 1, "a": 2}})
    assert risolvi(archivio, "v")["titolo"] == {"testo": "Un titolo", "parte": None, "da": 1, "a": 2}


def test_una_sorgente_non_preparata_dice_di_lanciare_prepara(archivio, video):
    shutil.rmtree(archivio.preparati(video[1]["sorgenti"]["p"]["file"]))
    with pytest.raises(Errore, match=r"la sorgente «p» non è preparata.*python -m motore prepara v"):
        risolvi(archivio, "v")


def test_una_sorgente_non_dichiarata_si_dice(archivio, video, scrivi_piano):
    scrivi_piano("v", {**video[1], "scene": [{"nome": "uno", "pezzi": [{"sorgente": "z"}]}]})
    with pytest.raises(Errore, match="«z»"):
        risolvi(archivio, "v")


def test_il_cerchio_dei_pezzi_a_parole_che_non_si_trovano_dice_il_minuto(archivio, video, scrivi_piano):
    scrivi_piano("v", {**video[1], "scene": [{"nome": "uno", "pezzi": [{"sorgente": "p", "minuto": "00:00", "dice": "ciao a nessuno"}]}]})
    with pytest.raises(Errore, match="dal minuto 00:00 la trascrizione non dice: ciao a nessuno"):
        risolvi(archivio, "v")


def test_l_allineamento_si_fa_una_volta_e_si_tiene(archivio, video, monkeypatch):
    from motore import allinea

    chiamate = []
    vero = allinea.apri

    class Contatore:
        def allinea(self, x, parole):
            chiamate.append(list(parole))
            return vero().allinea(x, parole)

    monkeypatch.setattr(allinea, "apri", lambda: Contatore())
    risolvi(archivio, "v")
    assert len(chiamate) == 2
    risolvi(archivio, "v")
    assert len(chiamate) == 2
    assert (archivio.preparati(video[1]["sorgenti"]["p"]["file"]) / "allineate.json").exists()


def test_l_immagine_continua_corre_fino_al_tratto_dopo_invece_di_saltare(archivio, video, scrivi_piano):
    slug, piano = video
    assert all(t["immagine"] is None for t in risolvi(archivio, slug)["tratti"])
    piano["sorgenti"]["t"]["immagine"] = "continua"
    piano["scene"] = piano["scene"][:1]
    scrivi_piano(slug, piano)
    tratti = risolvi(archivio, slug)["tratti"]
    assert len(tratti) == 3
    for t, dopo in zip(tratti, tratti[1:]):
        assert t["immagine"]["da"] == pytest.approx(t["da"])
        assert t["immagine"]["passo"] > 1
        assert t["immagine"]["da"] + t["durata"] * t["immagine"]["passo"] == pytest.approx(dopo["da"], abs=1e-3)
    assert tratti[-1]["immagine"] == {"da": pytest.approx(tratti[-1]["da"]), "passo": 1.0}


def test_l_immagine_continua_non_mostra_un_lampo_fra_due_salti(archivio, video, scrivi_piano):
    slug, piano = video
    piano["sorgenti"]["t"]["immagine"] = "continua"
    piano["scene"] = [{"nome": "uno", "pezzi": [{"sorgente": "t", "da": 0.5, "a": 2.6}, {"sorgente": "t", "da": 6.0, "a": 6.4}, {"sorgente": "t", "da": 0.5, "a": 2.6}]}]
    scrivi_piano(slug, piano)
    primo, lampo, terzo = risolvi(archivio, slug)["tratti"]
    assert primo["immagine"]["passo"] == 1.0 and terzo["immagine"] == {"da": pytest.approx(terzo["da"], abs=1e-3), "passo": 1.0}
    assert lampo["immagine"] == {"da": pytest.approx(primo["da"] + primo["durata"], abs=1e-3), "passo": 1.0}


def test_una_parola_cade_nel_suo_tratto_anche_coi_pezzi_fuori_ordine():
    # La scena prende prima un pezzo detto più tardi (570-580) e poi uno detto prima (546-556).
    tratti = [{"da": 570.0, "durata": 10.0, "esce": 100.0}, {"da": 546.0, "durata": 4.0, "esce": 110.0}, {"da": 552.0, "durata": 4.0, "esce": 114.0}]
    assert nel_video(tratti, 575.0) == pytest.approx(105.0)
    assert nel_video(tratti, 547.0) == pytest.approx(111.0)
    assert nel_video(tratti, 551.0) == pytest.approx(114.0)
    assert nel_video(tratti, 540.0) == pytest.approx(110.0)
    assert nel_video(tratti, 590.0) == pytest.approx(110.0)


def test_l_impronta_su_disco_e_quella_del_risolto_e_cambia_con_il_piano_e_con_lo_stile(archivio, video, scrivi_piano, tmp_path):
    slug, piano = video
    assert impronta_su_disco(archivio, slug) == risolvi(archivio, slug, scrivi=False)["impronta"]
    repo = tmp_path / "repo"
    repo.mkdir()
    shutil.copy(archivio.repo / "stile.json", repo / "stile.json")
    mio = Archivio(radice=archivio.radice, repo=repo)
    prima = impronta_su_disco(mio, slug)
    stile = json.loads((repo / "stile.json").read_text(encoding="utf-8"))
    stile["uscita"]["crf"] += 1
    (repo / "stile.json").write_text(json.dumps(stile), encoding="utf-8")
    assert impronta_su_disco(mio, slug) != prima
    scrivi_piano(slug, {**piano, "titolo": {"testo": "Un altro"}})
    assert impronta_su_disco(archivio, slug) != prima


SEZIONI_DEL_MONTATO = {"formato", "formati", "telefono", "colori", "caratteri", "voce", "taglio", "sottotitoli", "titolo", "suoni", "copertina",
                       "uscita", "quadri", "zoom", "evidenzia", "immagine", "sagoma", "segui"}


def test_ogni_sezione_dello_stile_di_serie_e_classificata_come_del_montato_o_no(archivio):
    sezioni = set(json.loads((archivio.repo / "stile.json").read_text(encoding="utf-8")))
    assert not SEZIONI_DEL_MONTATO & SEZIONI_FUORI_DAL_MONTATO
    assert sezioni == SEZIONI_DEL_MONTATO | SEZIONI_FUORI_DAL_MONTATO,         "una sezione dello stile non è classificata: dì in `motore/risolvi.py` se cambia il montato (e aggiungila qui)"


def test_l_impronta_ignora_le_sezioni_che_non_cambiano_il_montato_e_segue_le_altre(archivio, video, tmp_path):
    slug, _ = video
    repo = tmp_path / "repo"
    repo.mkdir()
    stile = json.loads((archivio.repo / "stile.json").read_text(encoding="utf-8"))
    mio = Archivio(radice=archivio.radice, repo=repo)

    def con(cambia):
        altro = json.loads(json.dumps(stile))
        cambia(altro)
        (repo / "stile.json").write_text(json.dumps(altro), encoding="utf-8")
        return impronta_su_disco(mio, slug)

    prima = con(lambda s: None)
    assert con(lambda s: s["prova"]["copione"].update(corpo=99)) == prima
    assert con(lambda s: s.update(sezione_nuova_del_creator={"a": 1})) != prima
    assert con(lambda s: s["voce"].update(margine=s["voce"]["margine"] + 0.5)) != prima
    assert con(lambda s: s["controllo"].update(percentile=1)) == prima


def test_una_rifila_che_taglia_la_voce_finisce_negli_avvisi_col_suo_tratto(archivio, prepara_sintetico, scrivi_piano, finto):
    parole = prepara_sintetico("parole", PAROLE_PAROLE)
    scrivi_piano("w", {"quadro": "girato-pieno", "sorgenti": {"p": {"file": parole}},
                       "scene": [{"nome": "s", "pezzi": [{"sorgente": "p", "minuto": "00:00", "dice": "ciao a tutti", "rifila": [0.0, -0.2]}]}], "sottotitoli": {"modo": "nessuno"}})
    r = risolvi(archivio, "w")
    assert [a["tratto"] for a in r["avvisi"]] == [0]
    assert r["avvisi"][0]["cosa"].startswith("la fine cade nella voce a ") and "prima che la voce finisca (sorgente 2,4 s)" in r["avvisi"][0]["cosa"]
    assert r["avvisi"][0]["cosa_en"].startswith("the end falls in the voice at ") and "before the voice ends (source 2.4 s)" in r["avvisi"][0]["cosa_en"]


def test_la_coda_si_ferma_prima_della_voce_che_segue_nella_sorgente(archivio, video, scrivi_piano):
    # Nella sorgente «t» la prima voce finisce a 1,6 s e la seconda comincia a 1,7: la coda di 0,7 s farebbe sentire la seconda.
    scrivi_piano("v", {**video[1], "scene": [{"nome": "uno", "pezzi": [{"sorgente": "t", "da": 0.6, "a": 1.6}]}], "coda": 0.7})
    [t] = risolvi(archivio, "v")["tratti"]
    assert t["da"] + t["durata"] <= 1.7 - archivio.stile["voce"]["margine"] + 1e-6
    assert t["da"] + t["durata"] > 1.6 - 1e-6
    # Dopo l'ultima voce non c'è altro suono: la coda resta intera.
    scrivi_piano("v", {**video[1], "scene": [{"nome": "uno", "pezzi": [{"sorgente": "t", "da": 6.0, "a": 7.0}]}], "coda": 0.7})
    [t] = risolvi(archivio, "v")["tratti"]
    assert t["da"] + t["durata"] == pytest.approx(7.0 + round(0.7 * FPS) / FPS, abs=1e-3)


def test_due_tratti_della_stessa_sorgente_che_si_accavallano_finiscono_negli_avvisi(archivio, video, scrivi_piano):
    assert not [a for a in risolvi(archivio, video[0])["avvisi"] if "due volte" in a["cosa"]]
    scrivi_piano("v", {**video[1], "scene": [{"nome": "uno", "pezzi": [{"sorgente": "t", "da": 3.4, "a": 4.6}, {"sorgente": "t", "da": 4.0, "a": 4.6}, {"sorgente": "p", "minuto": "00:00", "dice": "ciao a tutti"}]}]})
    r = risolvi(archivio, "v")
    [avviso] = [a for a in r["avvisi"] if "due volte" in a["cosa"]]
    prima, dopo = r["tratti"][:2]
    assert avviso["tratto"] == 1 and avviso["cosa"].startswith("si accavalla col tratto prima: ")
    assert f"{prima['da'] + prima['durata'] - dopo['da']:.1f}".replace(".", ",") + " s della sorgente «t»" in avviso["cosa"]
    assert avviso["cosa_en"].startswith("overlaps the previous stretch: ") and f"{prima['da'] + prima['durata'] - dopo['da']:.1f} s of the source «t» are heard twice" in avviso["cosa_en"]
    # Tornare indietro nella stessa ripresa, su un tratto che non si sovrappone, è un cambio d'ordine, non un doppione.
    scrivi_piano("v", {**video[1], "scene": [{"nome": "uno", "pezzi": [{"sorgente": "t", "da": 4.0, "a": 4.6}, {"sorgente": "t", "da": 3.0, "a": 3.6}, {"sorgente": "p", "minuto": "00:00", "dice": "ciao a tutti"}]}]})
    assert not [a for a in risolvi(archivio, "v")["avvisi"] if "due volte" in a["cosa"]]


def test_le_parole_poco_sicure_si_leggono_coi_loro_nomi_e_la_sicurezza_in_percentuale(archivio, prepara_sintetico, scrivi_piano, monkeypatch):
    from .conftest import AllineatoreFinto
    from motore import allinea

    class Incerto(AllineatoreFinto):
        def allinea(self, x, parole):
            return [(a, b, 0.07 if p == "a" else v) for (a, b, v), p in zip(super().allinea(x, parole), parole)]

    monkeypatch.setattr(allinea, "apri", lambda: Incerto())
    parole = prepara_sintetico("parole", PAROLE_PAROLE)
    scrivi_piano("w", {"quadro": "girato-pieno", "sorgenti": {"p": {"file": parole}},
                       "scene": [{"nome": "s", "pezzi": [{"sorgente": "p", "minuto": "00:00", "dice": "ciao a tutti"}]}], "sottotitoli": {"modo": "nessuno"}})
    avvisi = risolvi(archivio, "w")["avvisi"]
    assert [a["cosa"] for a in avvisi] == ["parole poco sicure, da riascoltare: «a» (7%)"]
    assert [a["cosa_en"] for a in avvisi] == ["uncertain words, listen again: «a» (7%)"]


def test_un_taglio_nel_parlato_dice_quale_bordo_e_a_che_livello(archivio, prepara_sintetico, scrivi_piano, finto):
    # Una rifila che lascia fuori solo un soffio di voce (meno di `voce_tagliata`) non ha un avviso suo: resta quello del bordo nel parlato.
    parole = prepara_sintetico("parole", PAROLE_PAROLE)
    scrivi_piano("w", {"quadro": "girato-pieno", "sorgenti": {"p": {"file": parole}},
                       "scene": [{"nome": "s", "pezzi": [{"sorgente": "p", "minuto": "00:00", "dice": "ciao a tutti", "rifila": [0.06, -0.06]}]}], "sottotitoli": {"modo": "nessuno"}})
    r = risolvi(archivio, "w")
    [t] = r["tratti"]
    assert t["legato"][0] is not None and t["legato"][1] is not None, t
    assert [a["cosa"] for a in r["avvisi"]] == [f"il taglio all'inizio cade nella voce ({t['legato'][0]:.0f} dB)",
                                                f"il taglio alla fine cade nella voce ({t['legato'][1]:.0f} dB)"]
    assert [a["cosa_en"] for a in r["avvisi"]] == [f"the cut at the start falls in the voice ({t['legato'][0]:.0f} dB)",
                                                   f"the cut at the end falls in the voice ({t['legato'][1]:.0f} dB)"]


def test_un_pezzo_in_un_altra_lingua_ha_i_suoi_sottotitoli_tradotti_ancorati_alle_parole(archivio, video, scrivi_piano):
    """Un pezzo di un girato in inglese dentro un video italiano: le parole di ogni riga tradotta si spargono sul tempo in cui è detta
    la frase da cui comincia (`dalla`) fino alla riga dopo, e diventano battute come tutti gli altri sottotitoli, parola per parola; una parentesi entra tutta insieme."""
    piano = json.loads(json.dumps(video[1]))
    piano["scene"][1]["pezzi"][0]["sottotitoli_tradotti"] = [{"dalla": "ciao", "testo": "Hello everyone"}, {"dalla": "tutti", "testo": "all of (you here)"}]
    piano["sottotitoli"]["scrittura"] = "minuscola"
    scrivi_piano("v", piano)
    r = risolvi(archivio, "v", scrivi=False)
    dette = {w["p"]: (w["da"], w["a"]) for w in r["parole"] if r["tratti"][w["tratto"]]["scena"] == 1}
    fine = r["scene"][1]["inizio"] + r["scene"][1]["durata"]
    tradotte = [b for b in r["battute"] if r["scene"][1]["inizio"] <= b["da"] and b["istanti"][0] < dette["buona"][0]]
    assert len(tradotte) > 1, "le righe tradotte si dividono in battute corte come gli altri sottotitoli"
    assert " ".join(b["testo"] for b in tradotte) == "hello everyone all of (you here)"
    istanti = [i for b in tradotte for i in b["istanti"]]
    assert istanti[0] == pytest.approx(dette["ciao"][0], abs=1e-3) and istanti[2] == pytest.approx(dette["tutti"][0], abs=1e-3)
    assert istanti == sorted(istanti) and istanti[1] < dette["tutti"][0] and istanti[-1] < dette["tutti"][1]
    assert istanti[-1] == istanti[-2], "una parentesi entra tutta insieme"
    for b in tradotte:
        assert len(b["testo"].split()) == len(b["istanti"])
    assert [b["testo"] for b in r["battute"] if b["da"] < fine and b["istanti"][0] >= dette["buona"][0]] == ["buona sera"]


def test_una_riga_tradotta_che_non_trova_la_sua_parola_lo_dice(archivio, video, scrivi_piano):
    piano = json.loads(json.dumps(video[1]))
    piano["scene"][1]["pezzi"][0]["sottotitoli_tradotti"] = [{"dalla": "tutti", "testo": "x"}, {"dalla": "ciao", "testo": "y"}]
    scrivi_piano("v", piano)
    with pytest.raises(Errore, match="«ciao»"):
        risolvi(archivio, "v", scrivi=False)


def test_una_parola_in_rilievo_sta_da_sola_nella_sua_battuta(archivio, video, scrivi_piano):
    """Le parole di `sottotitoli.rilievo` escono da sole, segnate: il montaggio le scrive più grandi e le fa saltare."""
    piano = json.loads(json.dumps(video[1]))
    piano["sottotitoli"]["rilievo"] = ["tutti"]
    scrivi_piano("v", piano)
    r = risolvi(archivio, "v", scrivi=False)
    dopo = [b for b in r["battute"] if b["da"] > r["scene"][1]["inizio"]]
    assert [(b["testo"], bool(b.get("rilievo"))) for b in dopo] == [("ciao a", False), ("tutti", True), ("buona sera", False)]


def test_l_immagine_continua_non_corre_oltre_il_passo_massimo_dello_stile(archivio, video, scrivi_piano):
    """Un tratto breve seguito da uno lontano farebbe correre l'immagine a otto volte la velocità: corre al massimo e poi salta."""
    slug, piano = video
    piano["sorgenti"]["t"]["immagine"] = "continua"
    piano["scene"] = [{"nome": "uno", "pezzi": [{"sorgente": "t", "da": 0.6, "a": 1.0}, {"sorgente": "t", "da": 3.5, "a": 4.5}]}]
    scrivi_piano(slug, piano)
    massimo = archivio.stile["immagine"]["passo_massimo"]
    primo, secondo = risolvi(archivio, slug)["tratti"]
    assert (secondo["da"] - primo["da"]) / primo["durata"] > massimo, "senza il tetto correrebbe più veloce"
    assert primo["immagine"] == {"da": pytest.approx(primo["da"]), "passo": massimo}
