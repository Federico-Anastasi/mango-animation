"""AVVISI-DI-TERZI.md dice la verità sulle dipendenze di oggi."""
import json
import re
import shutil

import pytest

from strumenti import avvisi_terzi as avvisi

pytestmark = pytest.mark.skipif(
    shutil.which("cargo") is None or not (avvisi.RADICE / "server" / "node_modules").is_dir(),
    reason="servono cargo e `bun install` per leggere le dipendenze",
)


def test_il_file_e_quello_che_le_dipendenze_di_oggi_danno():
    assert avvisi.main(["--controlla"]) == 0


def test_la_licenza_e_alla_radice_ed_e_agpl_col_copyright_nel_notice():
    testo = (avvisi.RADICE / "LICENSE").read_text(encoding="utf-8")
    assert "GNU AFFERO GENERAL PUBLIC LICENSE" in testo and "Version 3, 19 November 2007" in testo
    notice = (avvisi.RADICE / "NOTICE.md").read_text(encoding="utf-8")
    assert re.search(r"Copyright \(C\) \d{4} \S+", notice) and "AGPL-3.0-or-later" in notice
    assert (avvisi.RADICE / "TRADEMARKS.md").is_file()


def test_il_file_avverte_in_cima_dell_allineamento_non_commerciale():
    testo = avvisi.FILE.read_text(encoding="utf-8")
    limiti = testo.split("## Ciò che pone limiti")[1].split("## ")[0]
    assert "MMS_FA" in limiti and "CC-BY-NC" in limiti


def test_ogni_cosa_che_lapp_scarica_e_ogni_pacchetto_python_installato_ha_la_sua_riga():
    testo = avvisi.FILE.read_text(encoding="utf-8")
    for e in avvisi.scaricato():
        assert f"| {e['nome']} |" in testo and f"<{e['fonte']}>" in testo
    for nome, _ in avvisi.pacchetti_installati():
        assert f"| {nome} |" in testo


def test_un_pacchetto_python_senza_riga_ferma_la_generazione(monkeypatch):
    monkeypatch.setattr(avvisi, "pacchetti_installati", lambda: [("pacchetto-nuovo", "1.0")])
    with pytest.raises(avvisi.Mancanza, match="pacchetto-nuovo"):
        avvisi.genera()


def test_un_modello_non_commerciale_senza_nota_ferma_la_generazione(monkeypatch):
    nuovo = [{"id": "modello-nc", "nome": "M", "scopo": "x", "licenza": "CC-BY-NC-4.0", "fonte": "https://x"}]
    monkeypatch.setattr(avvisi, "scaricato", lambda: nuovo)
    with pytest.raises(avvisi.Mancanza, match="modello-nc"):
        avvisi.genera()


def test_un_crate_gpl_ferma_la_generazione(monkeypatch):
    monkeypatch.setattr(avvisi, "crate", lambda: [("brutto", "1.0", "GPL-3.0-only")])
    with pytest.raises(avvisi.Mancanza, match="GPL"):
        avvisi.genera()


def test_un_crate_che_serve_solo_alle_prove_non_e_fra_quelli_che_l_app_porta():
    def arco(crate, *tipi):
        return {"pkg": crate, "dep_kinds": [{"kind": tipo, "target": None} for tipo in tipi]}

    grafo = {
        "root": "app",
        "nodes": [
            {"id": "app", "deps": [arco("portato", None), arco("di-prova", "dev"), arco("tutti-e-due", None, "dev"), arco("di-costruzione", "build")]},
            {"id": "portato", "deps": [arco("sotto", None)]},
            {"id": "di-prova", "deps": [arco("sotto", None), arco("sotto-di-prova", None)]},
            {"id": "tutti-e-due", "deps": []},
            {"id": "di-costruzione", "deps": []},
            {"id": "sotto", "deps": []},
            {"id": "sotto-di-prova", "deps": []},
        ],
    }
    assert avvisi.portati(grafo) == {"portato", "tutti-e-due", "di-costruzione", "sotto"}


def test_il_manifesto_si_legge():
    assert json.loads(avvisi.MANIFESTO.read_text(encoding="utf-8"))["elementi"]


def test_il_file_non_dice_che_il_codice_usa_le_credenziali_del_creator():
    testo = avvisi.FILE.read_text(encoding="utf-8")
    assert "credenziali del creator" not in testo and "non legge né usa credenziali" in testo


def test_il_file_nomina_il_carattere_della_sigla_e_i_marchi_dei_loghi():
    testo = avvisi.FILE.read_text(encoding="utf-8")
    assert "space-grotesk.typeface.json" in testo and "OFL-SpaceGrotesk.txt" in testo
    marchi = testo.split("## Marchi")[1].split("\n## ")[0]
    assert "animazioni/src/standard/loghi/" in marchi and "marchi dei rispettivi proprietari" in marchi
    assert (avvisi.RADICE / "animazioni" / "src" / "scene" / "sigla" / "caratteri" / "OFL-SpaceGrotesk.txt").is_file()
