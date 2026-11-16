import os
from functools import cache
from pathlib import Path

from jsonschema import Draft202012Validator

from .archivio import VARIABILE_LAVORO, leggi_json
from .errori import Errore
from .schema import problemi

SCHEMA = Path(__file__).parent / "schemi" / "profilo.schema.json"


def leggi_profilo(lavoro):
    """Il profilo del creator (`<lavoro>/profilo.json`, `docs/ARCHITETTURA.md`, «Il profilo»), o `{}` se non c'è."""
    file = Path(lavoro) / "profilo.json"
    if not file.is_file():
        return {}
    dati = leggi_json(file, "il profilo del creator (profilo.json)", "the creator's profile (profilo.json)")
    schema = leggi_json(SCHEMA, "lo schema profilo", "the profile schema")
    errori = sorted(Draft202012Validator(schema).iter_errors(dati), key=lambda e: list(map(str, e.absolute_path)))
    frasi = problemi(errori, schema["x-nomi"])
    if frasi:
        raise Errore("il profilo del creator (profilo.json) non è valido:\n" + "\n".join(f"  {f}" for f in frasi),
                     "the creator's profile (profilo.json) is not valid:\n" + "\n".join(f"  {f.en}" for f in frasi))
    return dati


def macchina_di_lavoro():
    """La sezione `macchina` del profilo della cartella di lavoro indicata dall'ambiente; `{}` se la cartella o il profilo mancano."""
    lavoro = os.environ.get(VARIABILE_LAVORO)
    return leggi_profilo(lavoro).get("macchina", {}) if lavoro else {}


@cache
def _motori_di_lavoro():
    lavoro = os.environ.get(VARIABILE_LAVORO)
    return leggi_profilo(lavoro).get("motori", {}) if lavoro else {}


@cache
def _nomi():
    return leggi_json(SCHEMA, "lo schema profilo", "the profile schema")["x-nomi"]


def posto(chiave):
    """Dove si cambia, nell'interfaccia, la voce `chiave` del profilo (`posto` in `x-nomi` dello schema): (italiano, inglese)."""
    p = _nomi()[chiave]["posto"]
    return p["it"], p["en"]


def motore(funzione):
    """Ciò che il profilo scrive per una funzione pesante (`motori.<funzione>`, `docs/MOTORI.md`): `dove`, `modello`, `calcolo`, `attiva`. Letto una volta per processo."""
    return _motori_di_lavoro().get(funzione, {})


def attiva(funzione, predefinito=True):
    """Se la funzione è accesa: lo dice il profilo, se no `predefinito`."""
    return motore(funzione).get("attiva", predefinito)


def richiedi(funzione, per, per_en):
    """Ferma con la frase che dice cosa fare se la funzione è spenta nel profilo; `per` è ciò per cui serve."""
    if not attiva(funzione):
        it, en = posto(f"motori/{funzione}/attiva")
        raise Errore(f"{per}, ma la funzione è spenta: accendila con l'interruttore {it}, oppure cambia ciò che si monta",
                     f"{per_en}, but the feature is switched off: turn it on with the switch {en}, or change what is being edited")
