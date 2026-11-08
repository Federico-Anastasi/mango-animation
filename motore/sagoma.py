import math

from .archivio import leggi_json

TOLLERANZA = 1e-3


def pezzi_della_sagoma(cartella):
    """I pezzi di sagoma di una sorgente che ci sono sul disco: [{da, a, file, inizio}], dove `da`-`a` sono i secondi della sorgente che il pezzo copre,
    `file` il suo webm (relativo a `cartella`) e `inizio` il secondo della sorgente a cui il file comincia. Una sagoma in un file solo è un `sagoma.webm`,
    coi fotogrammi al loro istante della sorgente (`inizio` 0), con `sagoma.json` che ne elenca gli `intervalli` o, senza, che copre tutta la ripresa."""
    elenco = cartella / "sagoma.json"
    if elenco.exists():
        dati = leggi_json(elenco, "l'elenco della sagoma", "the list of the silhouette")
        pezzi = dati["pezzi"] if "pezzi" in dati else [{"da": da, "a": a, "file": "sagoma.webm", "inizio": 0.0} for da, a in dati["intervalli"]]
    else:
        pezzi = [{"da": 0.0, "a": math.inf, "file": "sagoma.webm", "inizio": 0.0}]
    return [p for p in pezzi if (cartella / p["file"]).exists()]


def copre(pezzo, da, a, margine):
    """Se il pezzo porta il tratto (da, a): ci arriva con `margine` secondi di scontorno prima di `da` (o dall'inizio della ripresa), perché la memoria del
    modello si sia riscaldata, e ne contiene la fine."""
    return pezzo["da"] <= max(0.0, da - margine) + TOLLERANZA and a <= pezzo["a"] + TOLLERANZA


def pezzo_della_sagoma(cartella, da, a, margine):
    """(file, secondo del file) da cui leggere i secondi `da`-`a` della sorgente, o None se nessun pezzo li porta."""
    for p in pezzi_della_sagoma(cartella):
        if copre(p, da, a, margine):
            return cartella / p["file"], da - p["inizio"]
    return None
