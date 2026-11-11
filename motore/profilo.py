import json
import os
import re
from functools import cache
from pathlib import Path

from jsonschema import Draft202012Validator

from .archivio import VARIABILE_LAVORO, leggi_json
from .errori import Errore, Frase

SCHEMA = Path(__file__).parent / "schemi" / "profilo.schema.json"

TIPI = {"string": ("un testo", "text"), "integer": ("un numero intero", "a whole number"), "number": ("un numero", "a number"),
        "boolean": ("sì o no", "yes or no"), "array": ("un elenco", "a list"), "object": ("un gruppo di voci", "a group of entries")}


def _maiuscola(testo):
    return testo[:1].upper() + testo[1:]


def _nome(nomi, parti):
    """La voce del profilo che sta in `parti` (un percorso dentro il profilo), con i numeri d'ordine al posto di {1}, {2}: `x-nomi` dello schema."""
    chiave = "/".join("*" if isinstance(p, int) else p for p in parti)
    numeri = [str(p + 1) for p in parti if isinstance(p, int)]
    nome = nomi.get(chiave) or {"it": f"una voce del profilo ({chiave})", "en": f"an entry of the profile ({chiave})", "f": True}

    def metti(testo):
        return re.sub(r"\{(\d)\}", lambda m: numeri[int(m[1]) - 1] if int(m[1]) <= len(numeri) else "", testo)

    return {**nome, "it": metti(nome["it"]), "en": metti(nome["en"])}


def _elenco(valori, o):
    return valori[0] if len(valori) < 2 else f"{', '.join(valori[:-1])} {o} {valori[-1]}"


def _come_deve_essere(tipi, nome):
    noti = [TIPI.get(t, (t, t)) for t in tipi if t != "null"]
    vuoto = "null" in tipi
    it = ", ".join(x for x in [" o ".join(t[0] for t in noti), f"o {'vuota' if nome.get('f') else 'vuoto'}" if vuoto else ""] if x)
    en = ", ".join(x for x in [" or ".join(t[1] for t in noti), "or empty" if vuoto else ""] if x)
    return f"deve essere {it}", f"must be {en}"


def problemi_del_profilo(errore, nomi):
    """Un errore di schema del profilo come lo leggerebbe chi usa l'app: quale cosa non va e com'è che deve essere, senza nomi di campi né tipi. Una `Frase` per problema."""
    parti = list(errore.absolute_path)
    nome = _nome(nomi, parti)
    maiuscolo = _maiuscola(nome["it"]), _maiuscola(nome["en"])

    def soggetto(cosa):
        return [Frase(f"{maiuscolo[0]} {cosa[0]}.", f"{maiuscolo[1]} {cosa[1]}.")]

    if errore.validator == "required":
        mancante = _nome(nomi, [*parti, re.search(r"'([^']*)' is a required", errore.message)[1]])
        return [Frase(f"Manca {mancante['it']}.", f"{_maiuscola(mancante['en'])} is missing.")]
    if errore.validator == "additionalProperties":
        dove = nome.get("dentro") or {"it": f"in {nome['it']}", "en": f"in {nome['en']}"}
        extra = sorted(k for k in errore.instance if k not in errore.schema.get("properties", {}))
        return [Frase(f"{_maiuscola(dove['it'])} c'è «{k}», che non conosco: toglila.", f"{_maiuscola(dove['en'])} there is «{k}», which I do not know: remove it.") for k in extra]
    if errore.validator == "type":
        tipi = errore.validator_value if isinstance(errore.validator_value, list) else [errore.validator_value]
        return soggetto(_come_deve_essere(tipi, nome))
    if errore.validator == "enum":
        valori = [f"«{v}»" for v in errore.validator_value]
        return [Frase(f"{maiuscolo[0]} non va bene: puoi scegliere {_elenco(valori, 'o')}.", f"{maiuscolo[1]} is not valid: you can choose {_elenco(valori, 'or')}.")]
    if errore.validator == "const":
        valore = json.dumps(errore.validator_value, ensure_ascii=False)
        return soggetto((f"deve essere {valore}", f"must be {valore}"))
    if errore.validator == "minimum":
        limite = errore.validator_value
        return soggetto((f"non può essere {'negativa' if nome.get('f') else 'negativo'}", "cannot be negative") if limite == 0
                        else (f"non può essere meno di {limite}", f"cannot be less than {limite}"))
    if errore.validator == "minLength":
        return soggetto((f"non può essere {'vuota' if nome.get('f') else 'vuoto'}", "cannot be empty"))
    if errore.validator in ("pattern", "anyOf"):
        forma = nome.get("forma")
        return soggetto((f"deve essere {forma['it']}", f"must be {forma['en']}") if forma else ("non è scritto nel modo giusto", "is not written the right way"))
    return soggetto(("non è valido", "is not valid"))


def leggi_profilo(lavoro):
    """Il profilo del creator (`<lavoro>/profilo.json`, `docs/ARCHITETTURA.md`, «Il profilo»), o `{}` se non c'è."""
    file = Path(lavoro) / "profilo.json"
    if not file.is_file():
        return {}
    dati = leggi_json(file, "il profilo del creator (profilo.json)", "the creator's profile (profilo.json)")
    schema = leggi_json(SCHEMA, "lo schema profilo", "the profile schema")
    errori = sorted(Draft202012Validator(schema).iter_errors(dati), key=lambda e: list(map(str, e.absolute_path)))
    problemi = list(dict.fromkeys(f for e in errori for f in problemi_del_profilo(e, schema["x-nomi"])))
    if problemi:
        raise Errore("il profilo del creator (profilo.json) non è valido:\n" + "\n".join(f"  {f}" for f in problemi),
                     "the creator's profile (profilo.json) is not valid:\n" + "\n".join(f"  {f.en}" for f in problemi))
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
