import json
from datetime import datetime
from pathlib import Path

from strumenti import leggi_tiktok as t

PAGINE = Path(__file__).parent / "pagine"
PROFILO = (PAGINE / "preferiti-profilo.html").read_text(encoding="utf-8")


class FintaPagina:
    """Una pagina di Chrome che risponde con le pagine salvate: nessun browser, nessuna rete."""

    def __init__(self, profilo=PROFILO, scheda_trovata=True):
        self.profilo, self.scheda_trovata = profilo, scheda_trovata
        self.indirizzi, self.script, self.url = [], [], ""

    def goto(self, url, **_):
        self.indirizzi.append(url)
        self.url = url

    def wait_for_timeout(self, _):
        pass

    def evaluate(self, script):
        self.script.append(script)
        return self.scheda_trovata if "click" in script else None

    def content(self):
        if "/video/" in self.url:
            return (PAGINE / f"video-{self.url.rsplit('/', 1)[1].split('?')[0]}.html").read_text(encoding="utf-8")
        return self.profilo


def test_i_link_sono_quelli_dei_preferiti_nell_ordine_della_pagina_e_senza_doppioni():
    link = t.link_preferiti(PROFILO)
    assert [(v["autore"], v["id"]) for v in link] == [("autore.uno", "7700000000000000001"), ("autore_due", "7700000000000000002"), ("autore_tre", "7700000000000000004")]
    assert link[1]["url"] == "https://www.tiktok.com/@autore_due/video/7700000000000000002"


def test_i_miei_video_non_sono_preferiti():
    assert t.link_preferiti((PAGINE / "profilo-senza-preferiti.html").read_text(encoding="utf-8")) == []


def test_un_video_si_legge_dai_dati_che_la_pagina_porta():
    v = t.video_da_pagina((PAGINE / "video-7700000000000000001.html").read_text(encoding="utf-8"))
    assert v["autore"] == "autore.uno" and v["durata"] == 102 and v["visualizzazioni"] == 9570
    assert v["didascalia"].startswith("Una didascalia inventata") and v["didascalia"].endswith("#uno #due")
    assert v["pubblicato"] == datetime.fromtimestamp(1793412241).strftime("%Y-%m-%dT%H:%M")
    assert (v["larghezza"], v["altezza"]) == (576, 1024)


def test_un_video_senza_dati_non_si_inventa():
    assert t.video_da_pagina("<html><body>Questo video non è disponibile</body></html>") is None


def test_i_preferiti_si_leggono_in_ordine_con_la_posizione_e_dicono_cosa_manca():
    pagina, mancano = FintaPagina(), []
    letti = t.leggi_preferiti(pagina, "una_creator", 10, mancano)
    assert [(v["posizione"], v["id"], v["autore"]) for v in letti[:2]] == [(1, "7700000000000000001", "autore.uno"), (2, "7700000000000000002", "autore_due")]
    assert letti[1]["didascalia"] == "Una didascalia inventata con una e commerciale & dentro"
    assert letti[2] == {"posizione": 3, "id": "7700000000000000004", "autore": "autore_tre", "url": "https://www.tiktok.com/@autore_tre/video/7700000000000000004"}
    assert any("7700000000000000004" in m and "non ho letto" in m for m in mancano)
    assert pagina.indirizzi[0].startswith("https://www.tiktok.com/@") and all("tiktokstudio" not in i for i in pagina.indirizzi)


def test_se_ne_chiedono_meno_se_ne_aprono_meno():
    pagina = FintaPagina()
    letti = t.leggi_preferiti(pagina, "una_creator", 1, [])
    assert len(letti) == 1 and len([i for i in pagina.indirizzi if "/video/" in i]) == 1


def test_senza_la_scheda_o_con_la_scheda_vuota_lo_dice_e_non_scrive_niente():
    mancano = []
    assert t.leggi_preferiti(FintaPagina(scheda_trovata=False), "una_creator", 5, mancano) == []
    assert any("scheda Preferiti" in m for m in mancano)
    mancano = []
    assert t.leggi_preferiti(FintaPagina(profilo=(PAGINE / "profilo-senza-preferiti.html").read_text(encoding="utf-8")), "una_creator", 5, mancano) == []
    assert any("elenco" in m for m in mancano)


def test_il_file_dei_preferiti_si_riscrive_intero_e_non_tocca_le_letture(tmp_path):
    canale = tmp_path / "canali" / "tiktok"
    t.scrivi_preferiti(tmp_path, "2026-11-05T20:00", [{"posizione": 1, "id": "1", "autore": "a", "url": "https://x/1"}])
    t.scrivi_preferiti(tmp_path, "2026-11-05T21:00", [{"posizione": 1, "id": "2", "autore": "b", "url": "https://x/2"}])
    dati = json.loads((canale / "preferiti.json").read_text(encoding="utf-8"))
    assert dati == {"quando": "2026-11-05T21:00", "preferiti": [{"posizione": 1, "id": "2", "autore": "b", "url": "https://x/2"}]}
    assert not (canale / "letture").exists() and not (canale / "ultima.json").exists()


def solo_preferiti(tmp_path, monkeypatch, letti, mancano=()):
    chiamato = {}
    monkeypatch.setattr(t, "profilo_chrome", lambda: tmp_path)
    monkeypatch.setattr(t, "leggi_preferiti_da_chrome", lambda chrome, account, quanti, grezzi: chiamato.update(quanti=quanti, account=account) or (letti, list(mancano)))
    monkeypatch.setenv("MANGO_ANIMATION_LAVORO", str(tmp_path))
    (tmp_path / "profilo.json").write_text(json.dumps({"canali": [{"piattaforma": "tiktok", "nome": "@una_creator"}]}), encoding="utf-8")
    (tmp_path / "archivio").mkdir(exist_ok=True)
    return t.main(["--solo-preferiti", "--preferiti", "3"]), chiamato, tmp_path / "archivio" / "canali" / "tiktok" / "preferiti.json"


def test_solo_preferiti_non_serve_un_ultima_lettura_e_scrive_i_preferiti(tmp_path, monkeypatch):
    esito, chiamato, file = solo_preferiti(tmp_path, monkeypatch, [{"posizione": 1, "id": "9", "autore": "z", "url": "https://x/9"}], ["preferiti: non ho letto il video 8"])
    assert esito == 0 and chiamato == {"quanti": 3, "account": "una_creator"}
    dati = json.loads(file.read_text(encoding="utf-8"))
    assert dati["preferiti"][0]["id"] == "9" and dati["mancano"] == ["preferiti: non ho letto il video 8"]


def test_se_non_ne_legge_nessuno_il_file_di_prima_resta(tmp_path, monkeypatch):
    file = tmp_path / "archivio" / "canali" / "tiktok" / "preferiti.json"
    file.parent.mkdir(parents=True)
    file.write_text('{"quando": "ieri", "preferiti": [{"id": "1"}]}', encoding="utf-8")
    esito, _, _ = solo_preferiti(tmp_path, monkeypatch, [], ["preferiti: l'elenco dei Preferiti è vuoto, privato o TikTok ha cambiato la pagina"])
    assert esito == 1 and json.loads(file.read_text(encoding="utf-8"))["quando"] == "ieri"
