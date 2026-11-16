import json
import re

from .errori import Frase

TIPI = {"string": ("un testo", "text"), "integer": ("un numero intero", "a whole number"), "number": ("un numero", "a number"),
        "boolean": ("sì o no", "yes or no"), "array": ("un elenco", "a list"), "object": ("un gruppo di voci", "a group of entries")}


def _maiuscola(testo):
    return testo[:1].upper() + testo[1:]


def _sotto(chiave, nome):
    return f"{chiave}/{nome}" if chiave else nome


def _nome(nomi, parti):
    """La voce che sta in `parti` (un percorso dentro il documento), da `x-nomi` dello schema. Il numero d'ordine di un elemento di un elenco e il nome scelto da chi scrive
    (la sorgente «a» di un piano) hanno la stessa voce con `*`, e prendono il posto di {1}, {2}: il numero da 1, il nome com'è."""
    chiave, valori = "", []
    for parte in parti:
        elemento = isinstance(parte, int)
        scelto = elemento or (_sotto(chiave, parte) not in nomi and _sotto(chiave, "*") in nomi)
        chiave = _sotto(chiave, "*" if scelto else parte)
        if scelto:
            valori.append(str(parte + 1) if elemento else parte)
    nome = nomi.get(chiave) or {"it": f"una voce ({chiave})", "en": f"an entry ({chiave})", "f": True}

    def metti(testo):
        return re.sub(r"\{(\d)\}", lambda m: valori[int(m[1]) - 1] if int(m[1]) <= len(valori) else "", testo)

    return {**nome, "it": metti(nome["it"]), "en": metti(nome["en"]),
            **{k: {"it": metti(nome[k]["it"]), "en": metti(nome[k]["en"])} for k in ("dentro", "forma") if k in nome}}


def _elenco(valori, o):
    return valori[0] if len(valori) < 2 else f"{', '.join(valori[:-1])} {o} {valori[-1]}"


def _come_deve_essere(tipi, nome):
    noti = [TIPI.get(t, (t, t)) for t in tipi if t != "null"]
    vuoto = "null" in tipi
    it = ", ".join(x for x in [" o ".join(t[0] for t in noti), f"o {'vuota' if nome.get('f') else 'vuoto'}" if vuoto else ""] if x)
    en = ", ".join(x for x in [" or ".join(t[1] for t in noti), "or empty" if vuoto else ""] if x)
    return f"deve essere {it}", f"must be {en}"


def problemi_dello_schema(errore, nomi):
    """Un errore di schema come lo leggerebbe chi usa l'app: quale cosa non va e com'è che deve essere, senza nomi di campi né tipi. Una `Frase` per problema."""
    parti = list(errore.absolute_path)
    nome = _nome(nomi, parti)
    maiuscolo = _maiuscola(nome["it"]), _maiuscola(nome["en"])

    def soggetto(cosa):
        return [Frase(f"{maiuscolo[0]} {cosa[0]}.", f"{maiuscolo[1]} {cosa[1]}.")]

    limite = errore.validator_value
    if errore.validator == "required":
        mancante = _nome(nomi, [*parti, re.search(r"'([^']*)' is a required", errore.message)[1]])
        return [Frase(f"Manca {mancante['it']}.", f"{_maiuscola(mancante['en'])} is missing.")]
    if errore.validator == "additionalProperties":
        dove = nome.get("dentro") or {"it": f"in {nome['it']}", "en": f"in {nome['en']}"}
        extra = sorted(k for k in errore.instance if k not in errore.schema.get("properties", {}))
        return [Frase(f"{_maiuscola(dove['it'])} c'è «{k}», che non conosco: toglila.", f"{_maiuscola(dove['en'])} there is «{k}», which I do not know: remove it.") for k in extra]
    if errore.validator == "dependentRequired":
        mancante, presente = re.search(r"'([^']*)' is a dependency of '([^']*)'", errore.message).groups()
        presente, mancante = _nome(nomi, [*parti, presente]), _nome(nomi, [*parti, mancante])
        return [Frase(f"Con {presente['it']} serve anche {mancante['it']}.", f"With {presente['en']} you also need {mancante['en']}.")]
    if errore.validator == "type":
        tipi = limite if isinstance(limite, list) else [limite]
        return soggetto(_come_deve_essere(tipi, nome))
    if errore.validator == "enum":
        valori = [f"«{v}»" for v in limite]
        return [Frase(f"{maiuscolo[0]} non va bene: puoi scegliere {_elenco(valori, 'o')}.", f"{maiuscolo[1]} is not valid: you can choose {_elenco(valori, 'or')}.")]
    if errore.validator == "const":
        valore = json.dumps(limite, ensure_ascii=False)
        return soggetto((f"deve essere {valore}", f"must be {valore}"))
    if errore.validator == "minimum":
        return soggetto((f"non può essere {'negativa' if nome.get('f') else 'negativo'}", "cannot be negative") if limite == 0
                        else (f"non può essere meno di {limite}", f"cannot be less than {limite}"))
    if errore.validator == "maximum":
        return soggetto((f"non può essere più di {limite}", f"cannot be more than {limite}"))
    if errore.validator == "exclusiveMinimum":
        return soggetto(("deve essere più di zero", "must be more than zero") if limite == 0 else (f"deve essere più di {limite}", f"must be more than {limite}"))
    if errore.validator == "minLength":
        return soggetto((f"non può essere {'vuota' if nome.get('f') else 'vuoto'}", "cannot be empty"))
    if "propertyNames" in errore.schema_path:
        return soggetto((f"ha un nome che non va: «{errore.instance}»", f"has a name that is not valid: «{errore.instance}»"))
    if errore.validator in ("minItems", "minProperties"):
        return soggetto((f"non può essere {'vuota' if nome.get('f') else 'vuoto'}", "cannot be empty") if limite == 1
                        else (f"deve avere almeno {limite} elementi", f"must have at least {limite} items"))
    if errore.validator == "maxItems":
        return soggetto((f"deve avere al più {limite} elementi", f"must have at most {limite} items"))
    if errore.validator == "uniqueItems":
        return soggetto(("non può avere elementi ripetuti", "cannot have repeated items"))
    if errore.validator == "not":
        return soggetto(("mette insieme voci che non vanno usate insieme", "combines entries that cannot be used together"))
    if errore.validator in ("pattern", "anyOf", "oneOf"):
        forma = nome.get("forma")
        return soggetto((f"deve essere {forma['it']}", f"must be {forma['en']}") if forma else ("non è scritto nel modo giusto", "is not written the right way"))
    return soggetto(("non è valido", "is not valid"))


def problemi(errori, nomi):
    """Le frasi di tutti gli errori di uno schema, ciascuna una volta sola e nell'ordine in cui vengono."""
    return list(dict.fromkeys(f for e in errori for f in problemi_dello_schema(e, nomi)))
