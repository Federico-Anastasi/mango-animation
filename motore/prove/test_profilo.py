import json
import re

import pytest

from motore.errori import Errore
from motore.profilo import leggi_profilo, macchina_di_lavoro


def test_senza_profilo_non_c_e_niente(tmp_path, monkeypatch):
    assert leggi_profilo(tmp_path) == {}
    monkeypatch.delenv("MANGO_ANIMATION_LAVORO", raising=False)
    assert macchina_di_lavoro() == {}
    monkeypatch.setenv("MANGO_ANIMATION_LAVORO", str(tmp_path))
    assert macchina_di_lavoro() == {}


def test_la_macchina_viene_dal_profilo_della_cartella_di_lavoro(tmp_path, monkeypatch):
    macchina = {"scheda_video": 0, "scheda_registrazione": None, "profilo_chrome": "D:/Chrome", "disco_quasi_pieno": True}
    (tmp_path / "profilo.json").write_text(json.dumps({"creator": {"nome": "Ada"}, "macchina": macchina}), encoding="utf-8")
    monkeypatch.setenv("MANGO_ANIMATION_LAVORO", str(tmp_path))
    assert macchina_di_lavoro() == macchina


def test_un_profilo_rotto_dice_dove_e_cosa(tmp_path):
    (tmp_path / "profilo.json").write_text("{", encoding="utf-8")
    with pytest.raises(Errore, match="profilo.*non è un JSON valido"):
        leggi_profilo(tmp_path)
    (tmp_path / "profilo.json").write_text(json.dumps({"macchina": {"scheda_vidoe": 1, "scheda_registrazione": "due"}}), encoding="utf-8")
    with pytest.raises(Errore) as e:
        leggi_profilo(tmp_path)
    assert e.value.it.split("\n")[1:] == ["  Nella parte del profilo sul computer c'è «scheda_vidoe», che non conosco: toglila.",
                                          "  La scheda che registra lo schermo deve essere un numero intero, o vuota."]
    assert e.value.en.split("\n")[1:] == ["  In the part of the profile about the computer there is «scheda_vidoe», which I do not know: remove it.",
                                          "  The card that records the screen must be a whole number, or empty."]


def test_i_motori_ammettono_solo_le_funzioni_e_le_scelte_dello_schema(tmp_path):
    giusti = {"trascrizione": {"attiva": True, "dove": "scheda", "modello": "large-v3-turbo", "calcolo": "int8"}, "allineamento": {"dove": "processore"},
              "sagoma": {"attiva": False}, "segui": {"attiva": False}, "pulizia_voce": {"attiva": False}, "dettatura": {"dove": "processore"}}
    (tmp_path / "profilo.json").write_text(json.dumps({"motori": giusti}), encoding="utf-8")
    assert leggi_profilo(tmp_path)["motori"] == giusti
    for sbagliato, atteso in (({"trascrizioni": {}}, "Nella parte del profilo sui motori del computer c'è «trascrizioni»"),
                              ({"sagoma": {"dove": "online"}}, "Il posto dove gira la sagoma sopra le animazioni non va bene"),
                              ({"trascrizione": {"modello": "base"}}, "Il modello della trascrizione del parlato non va bene"),
                              ({"pulizia_voce": {"dove": "processore"}}, "Nelle impostazioni della voce pulita c'è «dove»"),
                              ({"allineamento": {"modello": "large-v3"}}, "Nelle impostazioni dell'allineamento dei tagli sulle parole c'è «modello»")):
        (tmp_path / "profilo.json").write_text(json.dumps({"motori": sbagliato}), encoding="utf-8")
        with pytest.raises(Errore, match=atteso):
            leggi_profilo(tmp_path)


BUONO = {"versione": 1, "creator": {"nome": "Anna", "lingua": "it"}}

# Le stesse frasi di server/test/profilo-frasi.test.ts: il server e il motore dicono lo stesso.
CASI = [
    ({"macchina": {"scheda_video": "due"}}, "La scheda video del computer deve essere un numero intero, o vuota.", "The computer's video card must be a whole number, or empty."),
    ({"macchina": {"scheda_video": -1}}, "La scheda video del computer non può essere negativa.", "The computer's video card cannot be negative."),
    ({"macchina": {"disco_quasi_pieno": "sì"}}, "L'avviso che il disco è quasi pieno deve essere sì o no.", "The warning that the disk is almost full must be yes or no."),
    ({"creator": {}}, "Manca il nome del creator.", "The creator's name is missing."),
    ({"creator": {"nome": ""}}, "Il nome del creator non può essere vuoto.", "The creator's name cannot be empty."),
    ({"creator": {"nome": "Anna", "lingua": "italiano"}}, "La lingua del creator deve essere un codice di due lettere minuscole, per esempio «it» o «en».",
     "The creator's language must be a two-letter code in lowercase, for example «it» or «en»."),
    ({"canali": [{"piattaforma": "tiktok"}, {"nome": "senza"}]}, "Manca la piattaforma del canale 2.", "The platform of channel 2 is missing."),
    ({"canali": [{"piattaforma": "myspace"}]}, "La piattaforma del canale 1 non va bene: puoi scegliere «tiktok», «instagram», «youtube» o «x».",
     "The platform of channel 1 is not valid: you can choose «tiktok», «instagram», «youtube» or «x»."),
    ({"canali": "tiktok"}, "La parte del profilo sui canali deve essere un elenco.", "The part of the profile about channels must be a list."),
    ({"non_si_dice": ["parolacce", ""]}, "La voce 2 di ciò che non si dice non può essere vuota.", "Entry 2 of what is never said cannot be empty."),
    ({"pubblico": {"testate": 5}}, "La voce sulle testate del pubblico deve essere un testo, o un elenco di testi.",
     "The entry about the audience's publications must be a text, or a list of texts."),
    ({"fonti_delle_idee": [{"percorso": "D:\\p", "esclusi": ["a", ""]}]}, "Il progetto escluso 2 della fonte 1 non può essere vuoto.", "Excluded project 2 of source 1 cannot be empty."),
    ({"versione": 2}, "La versione del profilo deve essere 1.", "The profile version must be 1."),
    ({"motori": {"segui": {"attiva": "sì"}}}, "L'interruttore per il tracciamento della persona nelle riprese larghe deve essere sì o no.",
     "The switch for tracking the person in wide shots must be yes or no."),
    ({"motori": {"sagoma": {"modello": "x"}}}, "Nelle impostazioni della sagoma sopra le animazioni c'è «modello», che non conosco: toglila.",
     "In the settings of the silhouette over the animations there is «modello», which I do not know: remove it."),
    ({"creator": 5}, "La parte del profilo sul creator deve essere un gruppo di voci.", "The part of the profile about the creator must be a group of entries."),
]


@pytest.mark.parametrize("profilo, it, en", CASI)
def test_un_profilo_che_non_va_dice_cosa_in_parole_di_chi_usa_l_app(tmp_path, profilo, it, en):
    (tmp_path / "profilo.json").write_text(json.dumps({**BUONO, **profilo}), encoding="utf-8")
    with pytest.raises(Errore) as e:
        leggi_profilo(tmp_path)
    assert [riga.strip() for riga in e.value.it.split("\n")[1:]] == [it]
    assert [riga.strip() for riga in e.value.en.split("\n")[1:]] == [en]


def test_nessun_problema_del_profilo_porta_un_nome_di_campo_o_un_tipo(tmp_path):
    tecnici = re.compile(r"[a-z]+_[a-z_]+|\b(integer|string|boolean|array|object|null|None)\b|\w\.\w|\[\d+\]|\bJSON\b", re.I)
    for profilo, *_ in CASI:
        (tmp_path / "profilo.json").write_text(json.dumps({**BUONO, **profilo}), encoding="utf-8")
        with pytest.raises(Errore) as e:
            leggi_profilo(tmp_path)
        for riga in e.value.it.split("\n")[1:] + e.value.en.split("\n")[1:]:
            assert not tecnici.search(re.sub(r"«[^»]*»", "", riga)), riga
