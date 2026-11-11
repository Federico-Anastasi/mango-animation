import json
import sys
from datetime import datetime

import pytest

from motore.errori import Errore
from strumenti import leggi_tiktok as t


def test_i_numeri_come_li_scrive_tiktok():
    assert t.numero("30K") == 30000
    assert t.numero("1,092") == 1092
    assert t.numero("30.3K") == 30300
    assert t.numero("1K") == 1000
    assert t.numero("847") == 847
    assert t.numero("Fissato") is None


def test_i_decimali_e_i_percentuali():
    assert t.decimale("7.6%") == 7.6
    assert t.decimale("92,8%") == 92.8


def test_ore_minuti_e_secondi():
    assert t.secondi_da("286h:16m") == 286 * 3600 + 16 * 60
    assert t.secondi_da("1h:2m") == 3720
    assert t.secondi_da("34s") == 34
    assert t.secondi_da("31.55s") == 31.55


def test_il_giorno_e_la_durata():
    assert t.quando("4 ott 13:25", datetime(2026, 11, 10)) == "2026-10-04T13:25"
    assert t.quando("Niente") is None
    # Letto a gennaio, un video di dicembre è dell'anno prima; un mese in un'altra lingua non è un errore grezzo.
    assert t.quando("28 dic 10:00", datetime(2027, 1, 5)) == "2026-12-28T10:00"
    assert t.quando("5 gen 10:00", datetime(2027, 1, 5, 10, 0)) == "2027-01-05T10:00"
    with pytest.raises(Errore, match="mese «Dec».*italiano"):
        t.quando("28 Dec 10:00")
    assert t.durata("02:10") == 130


def test_una_riga_dell_elenco_si_legge_anche_col_fissato():
    normale = "01:57\nUna prova\n4 ott 13:25\nTutti\n30K\n1,092\n72\n"
    fissata = "03:20\nUna prova\nFissato\n6 ott 13:07\nTutti\n8,345\n337\n37\n"
    righe = list(t.RIGA_ELENCO.finditer(normale + fissata))
    assert len(righe) == 2
    assert (righe[0]["durata"], righe[0]["visite"], righe[0]["piacciono"], righe[0]["commenti"]) == ("01:57", "30K", "1,092", "72")
    assert righe[1]["didascalia"] == "Una prova" and righe[1]["data"] == "6 ott 13:07"


def test_i_video_si_prendono_dall_ultima_lettura(tmp_path):
    canale = tmp_path / "canali" / "tiktok"
    (canale / "letture" / "2026-10-13-1919").mkdir(parents=True)
    (canale / "ultima.json").write_text(json.dumps({"lettura": "2026-10-13-1919", "quando": "2026-10-13T19:19"}), encoding="utf-8")
    (canale / "letture" / "2026-10-13-1919" / "video.json").write_text(json.dumps(
        {"quando": "2026-10-13T19:19", "video": [{"id": "111", "url": "https://x/111", "slug": "uno", "pubblicato": "2026-10-04T13:25",
                                                  "didascalia": "ciao", "durata": 117, "visualizzazioni": 10}]}), encoding="utf-8")
    voci = t.voci_dall_archivio(tmp_path)
    assert voci[0]["id"] == "111" and voci[0]["slug"] == "uno" and voci[0]["durata"] == 117
    assert "visualizzazioni" not in voci[0]

def test_il_profilo_di_chrome_viene_dal_profilo_della_macchina(tmp_path, monkeypatch):
    (tmp_path / "profilo.json").write_text(json.dumps({"macchina": {"profilo_chrome": str(tmp_path / "chrome")}}), encoding="utf-8")
    monkeypatch.setenv("MANGO_ANIMATION_LAVORO", str(tmp_path))
    assert t.profilo_chrome() == tmp_path / "chrome"


def test_senza_profilo_chrome_si_cerca_dove_windows_lo_mette(tmp_path, monkeypatch):
    monkeypatch.setenv("MANGO_ANIMATION_LAVORO", str(tmp_path))
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "locale"))
    assert t.profilo_chrome() == tmp_path / "locale" / "Google" / "Chrome" / "User Data"


def test_chrome_non_in_ascolto_dice_come_aprirlo_e_dove_cambiare_il_profilo(tmp_path):
    with pytest.raises(Errore, match=r"--remote-debugging-port.*macchina\.profilo_chrome"):
        t.connetti(tmp_path)
    (tmp_path / "DevToolsActivePort").write_text("9222\n/devtools/browser/abc", encoding="utf-8")
    assert t.connetti(tmp_path) == "ws://127.0.0.1:9222/devtools/browser/abc"


def test_il_canale_viene_dal_profilo_del_creator(tmp_path):
    (tmp_path / "profilo.json").write_text(json.dumps({"canali": [{"piattaforma": "youtube", "nome": "@altro"}, {"piattaforma": "tiktok", "nome": "@una_creator"}]}), encoding="utf-8")
    assert t.account_tiktok(tmp_path) == "una_creator"
    (tmp_path / "profilo.json").write_text(json.dumps({"canali": [{"piattaforma": "youtube", "nome": "@altro"}]}), encoding="utf-8")
    with pytest.raises(Errore, match="canali"):
        t.account_tiktok(tmp_path)


def test_un_commento_e_una_risposta_come_li_da_tiktok():
    grezzi = {"dichiarati": 3, "errore": None, "commenti": [
        {"cid": "1", "autore": "anna", "testo": "bello", "create_time": 1762300000, "digg_count": 4, "risposta_a": None},
        {"cid": "2", "autore": "una_creator", "testo": "grazie!", "create_time": 1762300600, "digg_count": 0, "risposta_a": "1"},
        {"cid": "2", "autore": "una_creator", "testo": "grazie!", "create_time": 1762300600, "digg_count": 0, "risposta_a": "1"}]}
    commenti, mancano = t.commenti_letti("777", grezzi, "una_creator")
    assert commenti == [
        {"id": "1", "autore": "anna", "testo": "bello", "quando_scritto": datetime.fromtimestamp(1762300000).strftime("%Y-%m-%dT%H:%M"), "mi_piace": 4, "risposta_a": None, "del_creator": False},
        {"id": "2", "autore": "una_creator", "testo": "grazie!", "quando_scritto": datetime.fromtimestamp(1762300600).strftime("%Y-%m-%dT%H:%M"), "mi_piace": 0, "risposta_a": "1", "del_creator": True}]
    assert mancano == ["commenti del video 777: letti 2 contro 3 dichiarati"]
    assert t.commenti_letti("777", {**grezzi, "dichiarati": 2}, "una_creator")[1] == []
    assert t.commenti_letti("777", {**grezzi, "dichiarati": 2, "errore": "risposte"}, "una_creator")[1] == ["commenti del video 777: TikTok non ha dato le risposte, la lettura è a metà"]


def test_i_numeri_esatti_dalla_pagina_pubblica_del_video():
    def pagina(voce):
        return '<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">' + json.dumps(
            {"__DEFAULT_SCOPE__": {"webapp.video-detail": {"itemInfo": {"itemStruct": voce}}}}) + "</script>"
    video = {"desc": "ciao", "createTime": "1762300000", "video": {"duration": 117},
             "stats": {"playCount": 30312, "diggCount": 1092, "commentCount": 72, "shareCount": 40, "collectCount": "310"}}
    assert t.numeri_del_video(pagina(video)) == {"didascalia": "ciao", "durata": 117, "pubblicato": datetime.fromtimestamp(1762300000).strftime("%Y-%m-%dT%H:%M"),
                                                 "visualizzazioni": 30312, "mi_piace": 1092, "commenti": 72, "condivisioni": 40, "salvati": 310}
    carosello = {**video, "video": {"duration": 0}, "imagePost": {"images": [{}, {}]}}
    assert t.numeri_del_video(pagina(carosello))["durata"] == 0
    assert t.numeri_del_video("<html></html>") is None



def test_una_voce_dell_elenco_dei_messaggi():
    oggi = datetime(2026, 11, 5, 21, 0)
    voce = {"con": "Account Prova", "righe": ["Account Prova", "Ciao Marco, non l'ho provato", "29/10/2026"], "non_letti": False}
    assert t.voce_di_conversazione(voce, oggi) == {"con": "Account Prova", "anteprima": "Ciao Marco, non l'ho provato", "ultimo_giorno": "2026-10-29"}
    assert t.voce_di_conversazione({**voce, "righe": ["Account Prova", "ok", "21:05"]}, oggi)["ultimo_giorno"] == "2026-11-05"
    assert t.voce_di_conversazione({**voce, "righe": ["Account Prova", "ok", "Ieri"]}, oggi)["ultimo_giorno"] == "2026-11-04"
    assert t.voce_di_conversazione({**voce, "righe": ["Account Prova", "ok", "lun"]}, oggi) == {"con": "Account Prova", "anteprima": "ok lun", "ultimo_giorno": None}


def test_si_riapre_solo_la_conversazione_cambiata():
    voce = {"con": "A", "anteprima": "ciao", "ultimo_giorno": "2026-10-29"}
    assert not t.cambiata(voce, {**voce, "messaggi": [{"da": "lui", "testo": "ciao"}]})
    assert t.cambiata({**voce, "anteprima": "nuovo"}, voce)
    assert t.cambiata({**voce, "ultimo_giorno": "2026-11-05"}, voce)
    assert t.cambiata(voce, None)


def test_i_messaggi_presi_salendo_si_uniscono_in_ordine_senza_doppioni():
    m = [{"da": "lui", "testo": str(i), "quando_scritto": None} for i in range(8)]
    # la prima vista è la più recente; salendo arrivano i messaggi più vecchi, e la pagina tiene in memoria solo un tratto
    assert t.unisci_finestre([m[4:8], m[2:6], m[2:6], m[0:3], []]) == m
    assert t.unisci_finestre([m[5:8], m[6:8]]) == m[5:8]
    assert t.unisci_finestre([]) == []


def test_le_conversazioni_di_prima_vengono_dall_ultima_lettura(tmp_path):
    canale = tmp_path / "canali" / "tiktok"
    (canale / "letture" / "2026-11-05-2122").mkdir(parents=True)
    (canale / "ultima.json").write_text(json.dumps({"lettura": "2026-11-05-2122"}), encoding="utf-8")
    (canale / "letture" / "2026-11-05-2122" / "messaggi.json").write_text(json.dumps({"conversazioni": [{"con": "A", "messaggi": []}]}), encoding="utf-8")
    assert t.conversazioni_precedenti(tmp_path) == {"A": {"con": "A", "messaggi": []}}
    assert t.conversazioni_precedenti(tmp_path / "vuoto") == {}


def test_senza_playwright_la_frase_dice_come_installarlo(monkeypatch):
    monkeypatch.setitem(sys.modules, "playwright", None)
    with pytest.raises(Errore, match=r"manca il pacchetto Python playwright.*uv pip install --python"):
        t.playwright()
