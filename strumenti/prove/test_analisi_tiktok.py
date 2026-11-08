import json

from strumenti import analisi_tiktok as a


def scrivi_lettura(tmp_path, video, profilo=None, quando="2026-10-15T19:30"):
    canale = tmp_path / "canali" / "tiktok"
    cartella = canale / "letture" / "2026-10-15-1930"
    cartella.mkdir(parents=True)
    (cartella / "video.json").write_text(json.dumps({"quando": quando, "video": video}), encoding="utf-8")
    (cartella / "profilo.json").write_text(json.dumps(profilo or {"follower": 100, "mi_piace": 10, "seguiti": 5, "video": len(video)}), encoding="utf-8")
    (canale / "ultima.json").write_text(json.dumps({"lettura": "2026-10-15-1930"}), encoding="utf-8")
    return tmp_path


def test_per_mille_e_i_rapporti_di_un_video():
    v = {"visualizzazioni": 4000, "mi_piace": 100, "commenti": 8, "condivisioni": 4, "salvati": 60, "nuovi_follower": 20, "tempo_medio": 25.0, "durata": 100}
    r = a.rapporti(v)
    assert r["mi_piace_per_mille"] == 25.0 and r["salvati_per_mille"] == 15.0 and r["nuovi_follower_per_mille"] == 5.0
    assert r["visto_in_frazione"] == 0.25


def test_senza_visualizzazioni_non_si_divide():
    assert a.per_mille(10, 0) is None and a.per_mille(10, None) is None
    assert a.rapporti({"visualizzazioni": 0, "mi_piace": 3})["mi_piace_per_mille"] is None


def test_i_totali_pesano_il_tempo_sulle_visualizzazioni():
    video = [{"visualizzazioni": 1000, "mi_piace": 10, "tempo_medio": 30.0, "tempo_riproduzione_s": 30000},
             {"visualizzazioni": 9000, "mi_piace": 90, "tempo_medio": 10.0, "tempo_riproduzione_s": 90000}]
    t = a.totali(video)
    assert t["visualizzazioni"] == 10000 and t["mi_piace"] == 100 and t["mi_piace_per_mille"] == 10.0
    assert t["tempo_medio_pesato"] == 12.0 and round(t["tempo_medio"], 1) == 20.0
    assert round(t["ore"], 2) == 33.33


def test_leggi_e_filtra_i_video_senza_visualizzazioni(tmp_path):
    archivio = scrivi_lettura(tmp_path, [{"slug": "a", "visualizzazioni": 1000}, {"slug": "b"}, {"slug": "c", "visualizzazioni": 0}])
    nome, profilo, video, quando = a.leggi(archivio, None)
    assert nome == "2026-10-15-1930" and profilo["follower"] == 100 and quando == "2026-10-15T19:30"
    assert [v["slug"] for v in a.con_numeri(video)] == ["a"]


def test_gli_ultimi_giorni_si_contano_dalla_lettura(tmp_path):
    video = [{"slug": "nuovo", "pubblicato": "2026-10-14T10:00"}, {"slug": "vecchio", "pubblicato": "2026-09-01T10:00"}]
    assert [v["slug"] for v in a.pubblicati_negli_ultimi(video, "2026-10-15T19:30", 30)] == ["nuovo"]


def test_il_markdown_scrive_i_rapporti_per_mille(tmp_path):
    archivio = scrivi_lettura(tmp_path, [{"slug": "a", "visualizzazioni": 4000, "mi_piace": 100, "durata": 100, "tempo_medio": 25.0}])
    nome, profilo, video, quando = a.leggi(archivio)
    testo = a.markdown(profilo, video, quando, nome)
    assert "25,0" in testo and "per 1000" in testo and "0:25" in testo