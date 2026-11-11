import json
import subprocess

import pytest

from motore import prova
from motore.errori import Errore
from motore.media import info

import numpy as np

from .aiuti import audio, finge_bun, fotogramma, vicino
from .conftest import PAROLE_PAROLE

CENTRO = "Seconda frase qui.\n\nTerza frase, più lunga della seconda.\n\nQuarta."


@pytest.fixture
def scheda(archivio):
    def _scrivi(slug, proposta, titolo="Un titolo"):
        cartella = archivio.radice / "video" / slug
        cartella.mkdir(parents=True, exist_ok=True)
        (cartella / "scheda.json").write_text(json.dumps({"titolo": titolo, "stato": "proposta", "creato": "2026-10-31", "proposta": proposta}), encoding="utf-8")
        return slug

    return _scrivi


def test_il_copione_e_aggancio_centro_e_chiusa_una_frase_per_riga():
    frasi = prova.frasi_del_copione({"aggancio": "Prima frase.", "centro": CENTRO, "chiusa": "E tu?"})
    assert frasi == ["Prima frase.", "Seconda frase qui.", "Terza frase, più lunga della seconda.", "Quarta.", "E tu?"]


def test_i_tempi_stimati_seguono_la_lunghezza_e_non_si_accavallano(archivio):
    frasi = prova.tempi(["Una frase.", "Un'altra frase molto più lunga della prima."], archivio.stile)
    p = archivio.stile["prova"]
    assert frasi[0]["da"] == 0 and frasi[1]["da"] == pytest.approx(frasi[0]["a"] + p["pausa"])
    assert frasi[1]["a"] - frasi[1]["da"] > 2 * (frasi[0]["a"] - frasi[0]["da"])
    for f in frasi:
        assert [w["p"] for w in f["parole"]] == f["testo"].split()
        assert f["parole"][0]["da"] == f["da"] and f["parole"][-1]["a"] == pytest.approx(f["a"])


def test_le_scene_cominciano_dalla_frase_che_dicono_e_coprono_fino_alla_scena_dopo(archivio):
    frasi = prova.tempi(["Prima frase.", "Seconda frase qui.", "Terza frase.", "Quarta."], archivio.stile)
    sequenze = prova.sequenze(frasi, [{"animazione": "a1", "dalla": "seconda frase"}, {"animazione": None, "dalla": "Quarta"}])
    assert [(s["animazione"], [f["testo"] for f in s["frasi"]]) for s in sequenze] == [
        (None, ["Prima frase."]), ("a1", ["Seconda frase qui.", "Terza frase."]), (None, ["Quarta."])]
    assert sequenze[0]["da"] == 0 and sequenze[1]["da"] == sequenze[0]["a"] == frasi[1]["da"] and sequenze[2]["a"] == frasi[-1]["a"]


def test_una_scena_che_non_trova_la_sua_frase_lo_dice(archivio):
    frasi = prova.tempi(["Prima frase."], archivio.stile)
    with pytest.raises(Errore, match="«non c'è»"):
        prova.sequenze(frasi, [{"animazione": "a1", "dalla": "non c'è"}])


def test_le_scene_vanno_in_ordine(archivio):
    frasi = prova.tempi(["Prima.", "Seconda.", "Terza."], archivio.stile)
    with pytest.raises(Errore, match="ordine"):
        prova.sequenze(frasi, [{"animazione": "a1", "dalla": "Terza"}, {"animazione": "a2", "dalla": "Seconda"}])


def test_la_prova_e_un_video_con_le_scene_e_la_frase_intera(archivio, scheda, monkeypatch):
    """Le scene si rendono coi tempi stimati in una cartella a parte (non quella del montaggio), e sotto c'è la frase intera."""
    chieste = {}

    def finto(comando, **k):
        tempi = json.loads(open(comando[comando.index("--tempi") + 1], encoding="utf-8").read())
        uscita = comando[comando.index("--uscita") + 1]
        chieste.update(tempi)
        for sigla, voce in tempi.items():
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"color=c=0x1F4B99:s=1080x1920:r=30:d={voce['durata']:.3f}",
                            "-c:v", "libx264", "-pix_fmt", "yuv420p", f"{uscita}/{sigla}.mp4"], check=True)
        return subprocess.CompletedProcess(comando, 0, f"animazioni: rese {len(tempi)}, già rese 0\n", "")

    finge_bun(monkeypatch, finto)
    scheda("p", {"aggancio": "Prima frase.", "centro": CENTRO, "chiusa": "E tu?", "quadro": "sagoma-al-centro",
                 "scene": [{"animazione": "a1", "dalla": "Seconda"}, {"animazione": None, "dalla": "E tu"}]})
    file = prova.prova(archivio, "p", avanza=lambda *_: None)
    assert file == archivio.uscite("p") / "prova.mp4"
    frasi = prova.tempi(prova.frasi_del_copione(json.loads((archivio.video("p") / "scheda.json").read_text(encoding="utf-8"))["proposta"]), archivio.stile)
    i = info(file)
    assert (i["largo"], i["alto"]) == (1080, 1920) and i["durata"] == pytest.approx(frasi[-1]["a"], abs=0.1)
    assert set(chieste) == {"a1"} and chieste["a1"]["durata"] == pytest.approx(frasi[4]["da"] - frasi[1]["da"], abs=0.01)
    assert not (archivio.lavoro("p") / "scene").exists()
    area = archivio.stile["quadri"]["sagoma-al-centro"]["strati"][0]["area"]
    dentro = fotogramma(file, frasi[2]["da"] + 0.2)
    assert vicino(dentro[area[1] + 20, area[0] + 20], (0x1F, 0x4B, 0x99))
    senza = fotogramma(file, frasi[0]["da"] + 0.2)
    assert vicino(senza[area[1] + 20, area[0] + 20], archivio.colore(archivio.stile["prova"]["fondo_senza_scena"]))
    # Nel posto dei sottotitoli c'è la frase intera: alla prima parola le altre sono già scritte, in grigio; all'ultima le dette sono scure.
    y, colori = archivio.stile["quadri"]["sagoma-al-centro"]["sottotitoli"]["y"], archivio.stile["prova"]["colori"]
    grigio, scuro = archivio.colore(colori["da_dire"]), archivio.colore(colori["detta"])

    def quanti(t, colore):
        riga = fotogramma(file, t)[y - 60:y + 60, 60:1020]
        return int((abs(riga - colore).max(axis=2) < 30).sum())

    assert quanti(frasi[2]["parole"][0]["da"] + 0.05, grigio) > 1500
    assert quanti(frasi[2]["parole"][-1]["da"] + 0.05, scuro) > 1500


def test_una_scena_trasparente_lascia_vedere_il_posto_della_ripresa_e_la_frase_non_tocca_il_titolo(archivio, scheda, monkeypatch):
    """Nel quadro col girato sotto una scena trasparente: dove la scena non disegna si vede il posto della ripresa, non il nero;
    la frase sta in un riquadro che si legge su qualunque fondo e comincia sotto il titolo."""

    def finto(comando, **k):
        tempi = json.loads(open(comando[comando.index("--tempi") + 1], encoding="utf-8").read())
        uscita = comando[comando.index("--uscita") + 1]
        for sigla, voce in tempi.items():
            d = f"{voce['durata']:.3f}"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"color=c=black:s=1080x1920:r=30:d={d},drawbox=x=0:y=0:w=1080:h=300:color=0x1F4B99:t=fill",
                            "-c:v", "libx264", "-pix_fmt", "yuv420p", f"{uscita}/{sigla}.mp4"], check=True)
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"color=c=black:s=1080x1920:r=30:d={d},drawbox=x=0:y=0:w=1080:h=300:color=white:t=fill",
                            "-c:v", "ffv1", "-pix_fmt", "gray", f"{uscita}/{sigla}.alfa.mkv"], check=True)
        return subprocess.CompletedProcess(comando, 0, f"animazioni: rese {len(tempi)}, già rese 0\n", "")

    finge_bun(monkeypatch, finto)
    scheda("t", {"aggancio": "Una frase abbastanza lunga da andare a capo almeno una volta sotto il titolo del video.", "chiusa": "E tu?",
                 "quadro": "girato-con-animazione", "scene": [{"animazione": "a1", "dalla": "Una frase"}]}, titolo="Un titolo lungo che va su due righe")
    file = prova.prova(archivio, "t", avanza=lambda *_: None)
    q, p = archivio.stile["quadri"]["girato-con-animazione"], archivio.stile["prova"]
    girato = next(s["area"] for s in q["strati"] if s["tipo"] == "girato")
    f = fotogramma(file, 0.5)
    assert vicino(f[100, 540], (0x1F, 0x4B, 0x99))
    assert vicino(f[girato[1] + girato[3] - 40, 540], archivio.colore(p["fondo_senza_scena"]))
    # Sopra la riga dei sottotitoli, a metà del titolo, non c'è il riquadro della frase.
    assert not vicino(f[q["titolo"]["y"], 100], archivio.colore(p["fondo_frase"]), 8)
    assert (abs(f[q["sottotitoli"]["y"]:q["sottotitoli"]["y"] + 120, 60:1020] - archivio.colore(p["fondo_frase"])).max(axis=2) < 8).sum() > 20000


def test_senza_proposta_non_c_e_prova(archivio, scheda):
    scheda("vuota", {"note": "solo un'idea"})
    with pytest.raises(Errore, match="aggancio"):
        prova.prova(archivio, "vuota", avanza=lambda *_: None)


def test_uno_spezzone_dura_quanto_lui_e_sposta_le_frasi_dopo(archivio):
    voci = prova.tempi([{"file": "s", "tratti": [(1, 2.5), (2.9, 3.4)]}, "Prima frase.", {"file": "t", "tratti": [(3, 4)]}, "Seconda."], archivio.stile)
    pausa = archivio.stile["prova"]["pausa"]
    assert [v["testo"] if "testo" in v else v["spezzone"]["file"] for v in voci] == ["s", "Prima frase.", "t", "Seconda."]
    assert voci[0]["da"] == 0 and voci[0]["a"] == 2.0 and voci[1]["da"] == pytest.approx(2.0 + pausa)
    assert voci[2]["da"] == pytest.approx(voci[1]["a"] + pausa) and voci[3]["da"] == pytest.approx(voci[2]["a"] + pausa)


def test_il_copione_mette_gli_spezzoni_prima_della_frase_che_dicono():
    proposta = {"centro": "Prima frase del creator.\n\nSeconda.", "chiusa": "E tu?",
                "spezzoni": [{"file": "f.mp4", "da": 1, "a": 3, "prima": "Prima frase"}, {"file": "f.mp4", "da": 3, "a": 4, "prima": "seconda"}]}
    voci = prova.frasi_del_copione(proposta)
    assert [v if isinstance(v, str) else v["prima"] for v in voci] == ["Prima frase", "Prima frase del creator.", "seconda", "Seconda.", "E tu?"]


def test_senza_aggancio_il_copione_deve_aprire_con_uno_spezzone():
    with pytest.raises(Errore, match="aggancio"):
        prova.frasi_del_copione({"centro": "Una.", "chiusa": "E tu?", "spezzoni": [{"file": "f.mp4", "da": 0, "a": 1, "prima": "E tu"}]})
    with pytest.raises(Errore, match="«non c'è»"):
        prova.frasi_del_copione({"aggancio": "Una.", "chiusa": "E tu?", "spezzoni": [{"file": "f.mp4", "da": 0, "a": 1, "prima": "non c'è"}]})


def test_la_prova_con_gli_spezzoni_li_mostra_sopra_col_loro_audio_e_li_tiene_fermi_mentre_parla_fa(archivio, scheda):
    """Uno spezzone si vede nel posto del girato, con la sua voce e la sua traduzione intera dove stanno le frasi; mentre il creator parla resta
    fermo, sotto c'è il posto vuoto per la sua faccia e non si sente niente."""
    file_talk = "2026-10-31/talk.mp4"
    archivio.grezzo(file_talk).parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=red:s=1920x1080:r=30:d=5", "-f", "lavfi", "-i", "sine=frequency=440:duration=5",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(archivio.grezzo(file_talk))], check=True)
    scheda("s", {"centro": "Prima frase del creator.\n\nSeconda frase.", "chiusa": "E tu?", "quadro": "girato-e-sagoma",
                 "spezzoni": [{"file": file_talk, "da": 1, "a": 3, "testo": "Un sottotitolo tradotto.", "prima": "Prima frase"},
                              {"file": file_talk, "da": 3, "a": 4, "prima": "Seconda"}]})
    file = prova.prova(archivio, "s", avanza=lambda *_: None)
    voci = prova.tempi(prova.copione(archivio, "s", json.loads((archivio.video("s") / "scheda.json").read_text(encoding="utf-8"))["proposta"]), archivio.stile)
    i = info(file)
    assert i["durata"] == pytest.approx(voci[-1]["a"], abs=0.15)
    q, p = archivio.stile["quadri"]["girato-e-sagoma"], archivio.stile["prova"]
    girato = next(s["area"] for s in q["strati"] if s["tipo"] == "girato")
    centro, sotto = (girato[1] + girato[3] // 2, girato[0] + girato[2] // 2), (1600, 540)
    nello, fa = fotogramma(file, 1.0), fotogramma(file, voci[1]["da"] + 0.3)
    assert vicino(nello[centro], (255, 0, 0)) and vicino(fa[centro], (255, 0, 0))
    assert vicino(nello[sotto], archivio.colore(q["fondo"])) and vicino(fa[sotto], archivio.colore(q["fondo"]))
    assert np.abs(audio(file, 0.5, 1.0)).max() > 0.05
    assert np.abs(audio(file, voci[1]["da"] + 0.2, 0.5)).max() < 0.01
    y = q["sottotitoli"]["y"]
    colore = archivio.colore(p["colori"]["spezzone"])
    assert int((abs(nello[y - 60:y + 60, 60:1020] - colore).max(axis=2) < 30).sum()) > 1500


def test_uno_spezzone_a_parole_prende_la_voce_di_quelle_parole_senza_le_pause(archivio, prepara_sintetico, finto):
    """Come un pezzo del piano: le parole si cercano dal minuto, i bordi si trovano sulla voce, e le pause in mezzo si tolgono.
    Nel file sintetico «tutti» finisce a 2,6 s e «buona» comincia a 6,0 s."""
    file = prepara_sintetico("parole", PAROLE_PAROLE)
    unito = prova.tratti_dello_spezzone(archivio, "s", {"file": file, "minuto": "00:00", "dice": "ciao a tutti", "prima": "x"})
    assert len(unito) == 1 and unito[0][0] == pytest.approx(1.0, abs=0.1) and unito[0][1] == pytest.approx(2.6, abs=0.1)
    staccato = prova.tratti_dello_spezzone(archivio, "s", {"file": file, "minuto": "00:00", "dice": "tutti buona", "prima": "x"})
    assert len(staccato) == 2
    assert staccato[0][1] == pytest.approx(2.6, abs=0.1) and staccato[1][0] == pytest.approx(6.0, abs=0.1)
    assert prova.tratti_dello_spezzone(archivio, "s", {"file": file, "da": 1, "a": 3, "prima": "x"}) == [(1, 3)]
    with pytest.raises(Errore, match="non dice"):
        prova.tratti_dello_spezzone(archivio, "s", {"file": file, "minuto": "00:00", "dice": "arrivederci", "prima": "x"})


def test_la_prova_con_uno_spezzone_a_parole_lo_fa_sentire_senza_la_pausa_in_mezzo(archivio, scheda, prepara_sintetico, finto):
    file = prepara_sintetico("parole", PAROLE_PAROLE)
    scheda("w", {"centro": "Prima frase del creator.", "chiusa": "E tu?", "quadro": "girato-e-sagoma",
                 "spezzoni": [{"file": file, "minuto": "00:00", "dice": "tutti buona", "prima": "Prima frase"}]})
    uscita = prova.prova(archivio, "w", avanza=lambda *_: None)
    voci = prova.tempi(prova.copione(archivio, "w", json.loads((archivio.video("w") / "scheda.json").read_text(encoding="utf-8"))["proposta"]), archivio.stile)
    spezzone = voci[0]
    assert spezzone["a"] - spezzone["da"] < 1.5, "i 3,4 s di silenzio fra «tutti» e «buona» non ci sono"
    assert info(uscita)["durata"] == pytest.approx(voci[-1]["a"], abs=0.15)
    assert np.abs(audio(uscita, 0.1, 0.25)).max() > 0.05 and np.abs(audio(uscita, spezzone["a"] - 0.35, 0.25)).max() > 0.05


def test_una_scena_legata_alle_parole_riceve_il_secondo_stimato_di_ognuna(archivio):
    """`parole` di una scena della proposta dice quale parola del copione fa entrare cosa: il secondo, dall'inizio della scena, in cui il copione stimato la dice."""
    frasi = prova.tempi(["Prima frase.", "Seconda frase qui.", "Terza frase."], archivio.stile)
    [_, gruppo] = prova.sequenze(frasi, [{"animazione": "a1", "dalla": "Seconda", "parole": {"qui": "frase qui", "terza": "Terza"}}])
    assert gruppo["tempi"]["qui"] == pytest.approx(frasi[1]["parole"][1]["da"] - frasi[1]["da"], abs=0.001)
    assert gruppo["tempi"]["terza"] == pytest.approx(frasi[2]["da"] - frasi[1]["da"], abs=0.001)
    assert prova.sequenze(frasi, [{"animazione": "a1", "dalla": "Seconda"}])[1]["tempi"] == {}


def test_una_parola_che_il_copione_non_dice_dalla_sua_scena_in_poi_lo_dice(archivio):
    frasi = prova.tempi(["Prima frase.", "Seconda frase qui.", "Terza frase."], archivio.stile)
    with pytest.raises(Errore, match="«a1» aspetta «frase prima», che il copione non dice dalla sua frase in poi"):
        prova.sequenze(frasi, [{"animazione": "a1", "dalla": "Seconda", "parole": {"x": "frase prima"}}])


def test_la_prova_rende_la_scena_con_i_tempi_delle_sue_parole(archivio, scheda, monkeypatch):
    chieste = {}

    def finto(comando, **k):
        tempi = json.loads(open(comando[comando.index("--tempi") + 1], encoding="utf-8").read())
        uscita = comando[comando.index("--uscita") + 1]
        chieste.update(tempi)
        for sigla, voce in tempi.items():
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"color=c=0x1F4B99:s=1080x1920:r=30:d={voce['durata']:.3f}", "-c:v", "libx264", "-pix_fmt", "yuv420p", f"{uscita}/{sigla}.mp4"], check=True)
        return subprocess.CompletedProcess(comando, 0, f"animazioni: rese {len(tempi)}, già rese 0\n", "")

    finge_bun(monkeypatch, finto)
    scheda("p", {"aggancio": "Prima frase.", "centro": CENTRO, "chiusa": "E tu?", "quadro": "sagoma-al-centro", "scene": [{"animazione": "a1", "dalla": "Seconda", "parole": {"lunga": "più lunga"}}]})
    prova.prova(archivio, "p", avanza=lambda *_: None)
    frasi = prova.tempi(prova.frasi_del_copione(json.loads((archivio.video("p") / "scheda.json").read_text(encoding="utf-8"))["proposta"]), archivio.stile)
    assert chieste["a1"]["tempi"] == {"lunga": pytest.approx(frasi[2]["parole"][2]["da"] - frasi[1]["da"], abs=0.001)}


def test_la_prova_scrive_anche_il_copione_da_leggere_sul_telefono(archivio, scheda):
    """`uscite/copione.html`: una pagina sola, senza niente di esterno, con il titolo e le frasi in ordine, una per riga, coi colori e le misure dello stile."""
    (archivio.radice.parent / "profilo.json").write_text(json.dumps({"creator": {"nome": "Ada", "lingua": "en"}}), encoding="utf-8")
    scheda("c", {"aggancio": "Prima <frase> & basta.", "centro": CENTRO, "chiusa": "E tu?", "quadro": "sagoma-al-centro"}, titolo="Un titolo & mezzo")
    prova.prova(archivio, "c", avanza=lambda *_: None)
    pagina = (archivio.uscite("c") / "copione.html").read_text(encoding="utf-8")
    frasi = ["Prima &lt;frase&gt; &amp; basta.", "Seconda frase qui.", "Terza frase, più lunga della seconda.", "Quarta.", "E tu?"]
    assert [pagina.index(f">{f}<") for f in frasi] == sorted(pagina.index(f">{f}<") for f in frasi)
    assert "<h1>Un titolo &amp; mezzo</h1>" in pagina and '<html lang="en">' in pagina and 'name="viewport"' in pagina
    p = archivio.stile["prova"]
    assert archivio.stile["colori"][p["fondo_frase"]] in pagina and archivio.stile["colori"][p["colori"]["detta"]] in pagina
    assert f"{p['copione']['corpo']}px" in pagina
    assert "http" not in pagina and "<script" not in pagina and "src=" not in pagina


def test_il_copione_senza_profilo_non_dichiara_una_lingua_e_mostra_gli_spezzoni(archivio, scheda):
    archivio.grezzo("2026-10-31/talk.mp4").parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=red:s=1920x1080:r=30:d=5", "-f", "lavfi", "-i", "sine=frequency=440:duration=5",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(archivio.grezzo("2026-10-31/talk.mp4"))], check=True)
    scheda("s", {"centro": "Prima frase.", "chiusa": "E tu?", "quadro": "girato-e-sagoma",
                 "spezzoni": [{"file": "2026-10-31/talk.mp4", "da": 1, "a": 3, "testo": "Un sottotitolo tradotto.", "prima": "Prima frase"}]})
    prova.prova(archivio, "s", avanza=lambda *_: None)
    pagina = (archivio.uscite("s") / "copione.html").read_text(encoding="utf-8")
    assert "<html>" in pagina and "lang=" not in pagina
    assert pagina.index(">Un sottotitolo tradotto.<") < pagina.index(">Prima frase.<") < pagina.index(">E tu?<")


def test_una_scena_col_girato_lo_fa_scorrere_muto_sotto_le_frasi_nel_posto_del_suo_quadro(archivio, scheda, monkeypatch):
    """Un girato d'altri che il creator racconta con la sua voce: sotto le frasi della scena scorre dal secondo `da`, senza audio, nel posto
    del girato del quadro della scena; le altre frasi restano col cartello del creator."""
    file_podcast = "2026-11-09/podcast.mp4"
    archivio.grezzo(file_podcast).parent.mkdir(parents=True, exist_ok=True)
    # Rosso nei primi 2 secondi, verde dopo: dal secondo 2 deve vedersi il verde.
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=red:s=1920x1080:r=30:d=2", "-f", "lavfi", "-i", "color=c=green:s=1920x1080:r=30:d=8",
                    "-f", "lavfi", "-i", "sine=frequency=440:duration=10", "-filter_complex", "[0:v][1:v]concat=n=2:v=1[v]", "-map", "[v]", "-map", "2:a",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", str(archivio.grezzo(file_podcast))], check=True)
    scheda("g", {"aggancio": "Prima frase.", "centro": CENTRO, "chiusa": "E tu?", "quadro": "sagoma-al-centro",
                 "scene": [{"animazione": None, "dalla": "Seconda", "quadro": "girato-e-sagoma", "girato": {"file": file_podcast, "da": 2}},
                           {"animazione": None, "dalla": "E tu"}]})
    file = prova.prova(archivio, "g", avanza=lambda *_: None)
    frasi = prova.tempi(prova.frasi_del_copione(json.loads((archivio.video("g") / "scheda.json").read_text(encoding="utf-8"))["proposta"]), archivio.stile)
    girato = next(s["area"] for s in archivio.stile["quadri"]["girato-e-sagoma"]["strati"] if s["tipo"] == "girato")
    centro = (girato[1] + girato[3] // 2, girato[0] + girato[2] // 2)
    fondo_creator = archivio.colore(archivio.stile["prova"]["fondo_senza_scena"])
    assert vicino(fotogramma(file, frasi[1]["da"] + 0.3)[centro], (0, 128, 0))
    assert vicino(fotogramma(file, frasi[0]["da"] + 0.3)[centro], fondo_creator)
    assert vicino(fotogramma(file, frasi[4]["da"] + 0.3)[centro], fondo_creator)
    assert not info(file)["ha_audio"]


def test_una_scena_con_animazione_e_girato_insieme_lo_dice(archivio):
    frasi = prova.tempi(["Una frase.", "Un'altra."], archivio.stile)
    with pytest.raises(Errore, match="sia un'animazione sia un girato"):
        prova.sequenze(frasi, [{"animazione": "a1", "dalla": "Un'altra", "girato": {"file": "x.mp4", "da": 0}}])


def test_il_quadro_di_una_scena_senza_girato_non_e_una_scheda_valida(archivio, scheda):
    scheda("q", {"aggancio": "Prima frase.", "centro": CENTRO, "chiusa": "E tu?", "scene": [{"animazione": None, "dalla": "Seconda", "quadro": "girato-e-sagoma"}]})
    with pytest.raises(Errore, match="non è valid"):
        archivio.scheda("q")


@pytest.mark.parametrize("fermo", [True, False])
def test_il_suono_di_uno_spezzone_ha_i_campioni_dello_stile(archivio, monkeypatch, tmp_path, fermo):
    archivio.stile["voce"]["campioni_audio"] = 44100
    comandi = []
    monkeypatch.setattr(prova, "ffmpeg", lambda *argomenti: comandi.append(" ".join(map(str, argomenti))))
    prova._pezzo_di_spezzone(archivio, {"fondo": "nero"}, [0, 0, 1080, 1920], {"largo": 1080, "alto": 1920, "fps": 30}, tmp_path, 1, 1.0, "f.mp4", 0.0, fermo)
    assert "44100" in comandi[0] and "48000" not in comandi[0]
