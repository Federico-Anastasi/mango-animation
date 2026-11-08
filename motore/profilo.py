import os
from functools import cache
from pathlib import Path

from jsonschema import Draft202012Validator

from .archivio import VARIABILE_LAVORO, descrivi, leggi_json
from .errori import Errore

SCHEMA = Path(__file__).parent / "schemi" / "profilo.schema.json"


def leggi_profilo(lavoro):
    """Il profilo del creator (`<lavoro>/profilo.json`, `docs/ARCHITETTURA.md`, «Il profilo»), o `{}` se non c'è."""
    file = Path(lavoro) / "profilo.json"
    if not file.is_file():
        return {}
    dati = leggi_json(file, "il profilo del creator (profilo.json)", "the creator's profile (profilo.json)")
    errori = sorted(Draft202012Validator(leggi_json(SCHEMA, "lo schema profilo", "the profile schema")).iter_errors(dati), key=lambda e: list(map(str, e.absolute_path)))
    if errori:
        raise Errore("il profilo del creator (profilo.json) non è valido:\n" + "\n".join(f"  {descrivi(e)}" for e in errori),
                     "the creator's profile (profilo.json) is not valid:\n" + "\n".join(f"  {descrivi(e).en}" for e in errori))
    return dati


def macchina_di_lavoro():
    """La sezione `macchina` del profilo della cartella di lavoro indicata dall'ambiente; `{}` se la cartella o il profilo mancano."""
    lavoro = os.environ.get(VARIABILE_LAVORO)
    return leggi_profilo(lavoro).get("macchina", {}) if lavoro else {}


@cache
def _motori_di_lavoro():
    lavoro = os.environ.get(VARIABILE_LAVORO)
    return leggi_profilo(lavoro).get("motori", {}) if lavoro else {}


def motore(funzione):
    """Ciò che il profilo scrive per una funzione pesante (`motori.<funzione>`, `docs/MOTORI.md`): `dove`, `modello`, `calcolo`, `attiva`. Letto una volta per processo."""
    return _motori_di_lavoro().get(funzione, {})


def attiva(funzione, predefinito=True):
    """Se la funzione è accesa: lo dice il profilo, se no `predefinito`."""
    return motore(funzione).get("attiva", predefinito)


def richiedi(funzione, per, per_en):
    """Ferma con la frase che dice cosa fare se la funzione è spenta nel profilo; `per` è ciò per cui serve."""
    if not attiva(funzione):
        raise Errore(f"{per}, ma «{funzione}» è spenta nel profilo (motori.{funzione}.attiva): accendila, oppure cambia ciò che si monta",
                     f"{per_en}, but «{funzione}» is switched off in the profile (motori.{funzione}.attiva): switch it on, or change what is being edited")
