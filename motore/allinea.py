import hashlib
import json
import re
import sys
import unicodedata

from .archivio import leggi_json, scrivi_json
from .dispositivo import dispositivo
from .errori import Errore
from .media import pcm_16k
from .profilo import attiva

UNITA = "zero uno due tre quattro cinque sei sette otto nove dieci undici dodici tredici quattordici quindici sedici diciassette diciotto diciannove".split()
DECINE = " . venti trenta quaranta cinquanta sessanta settanta ottanta novanta".split(" ")


def in_lettere(n):
    if n < 20:
        return UNITA[n]
    if n < 100:
        decina, resto = DECINE[n // 10], n % 10
        return (decina[:-1] if resto in (1, 8) else decina) + (UNITA[resto] if resto else "")
    if n < 1000:
        return ("" if n < 200 else UNITA[n // 100]) + "cento" + (in_lettere(n % 100) if n % 100 else "")
    return ("mille" if n < 2000 else in_lettere(n // 1000) + "mila") + (in_lettere(n % 1000) if n % 1000 else "")


def suoni(parola):
    """La parola come la vuole l'allineatore: lettere senza accenti; `*` (qualunque suono) se non si può scrivere."""
    nuda = parola.lstrip("*").strip("?.,!:;")
    if nuda.isdigit() and int(nuda) < 1000000:
        return in_lettere(int(nuda))
    piana = "".join(c for c in unicodedata.normalize("NFD", nuda.lower()) if unicodedata.category(c) != "Mn")
    return "*" if re.search(r"[^a-z']", piana) or not piana.strip("'") else piana.strip("'")


class Allineatore:
    """Dove cade ogni parola in un audio di cui si sa già il testo (allineamento forzato, torchaudio MMS_FA)."""

    def __init__(self):
        import torch
        import torchaudio

        self.torch, self.audio, self.dove = torch, torchaudio, dispositivo("allineamento")
        self.modello = torchaudio.pipelines.MMS_FA.get_model(with_star=True).to(self.dove)
        self.lettere = torchaudio.pipelines.MMS_FA.get_dict(star="*")

    def allinea(self, x, parole):
        """[(inizio, fine, voto)] per parola, in secondi dall'inizio di `x`. Prima e dopo può esserci altro parlato."""
        testi = ["*", *(suoni(p) for p in parole), "*"]
        with self.torch.inference_mode():
            emissione, _ = self.modello(self.torch.from_numpy(x.copy()).unsqueeze(0).to(self.dove))
            gettoni = self.torch.tensor([[self.lettere[c] for t in testi for c in t]], device=self.dove)
            percorso, voti = self.audio.functional.forced_align(emissione, gettoni)
        pezzi = self.audio.functional.merge_tokens(percorso[0], voti[0].exp())
        passo = len(x) / emissione.shape[1] / 16000
        fuori, k = [], 1
        for t in testi[1:-1]:
            suoi = pezzi[k:k + len(t)]
            k += len(t)
            voto = sum(s.score * (s.end - s.start) for s in suoi) / sum(s.end - s.start for s in suoi)
            fuori.append((round(suoi[0].start * passo, 3), round(suoi[-1].end * passo, 3), round(float(voto), 2)))
        return fuori


_aperto = None


def apri():
    """L'allineatore, caricato una volta sola per processo; le prove lo sostituiscono con uno finto."""
    global _aperto
    if _aperto is None:
        _aperto = Allineatore()
    return _aperto


def chiudi():
    global _aperto
    _aperto = None
    if "torch" in sys.modules:
        sys.modules["torch"].cuda.empty_cache()


def vicine(parole, i, j, stile):
    ap = stile["taglio"]["a_parole"]
    return [k for k in range(max(0, i - ap["vicine"]), min(len(parole), j + ap["vicine"]))
            if parole[i]["da"] - ap["raggio_vicine"] <= parole[k]["da"] and parole[k]["a"] <= parole[j - 1]["a"] + ap["raggio_vicine"]]


def allinea_pezzi(sorgente, pezzi, stile):
    """Per ogni pezzo (i, j) i confini veri delle sue parole e delle vicine: {indice: (da, a, voto)}, secondi del contenitore.
    Ciò che è già stato allineato con le stesse parole sta in `allineate.json` accanto alla sorgente preparata."""
    if not attiva("allineamento"):
        # Spento nel profilo: i tempi sono quelli della trascrizione, con voto zero, e i bordi dei pezzi si cercano sul livello della voce.
        parole = sorgente.parole
        return [{k: (round(parole[k]["da"] + sorgente.sfasa, 3), round(parole[k]["a"] + sorgente.sfasa, 3), 0.0) for k in vicine(parole, i, j, stile)} for i, j in pezzi]
    cache_file = sorgente.preparati / "allineate.json"
    cache = leggi_json(cache_file, "la cache degli allineamenti", "the alignment cache") if cache_file.exists() else {}
    ap, parole, fuori, mutato = stile["taglio"]["a_parole"], sorgente.parole, [], False
    for i, j in pezzi:
        ks = vicine(parole, i, j, stile)
        ingredienti = [sorgente.sfasa, sorgente.percorso.stat().st_size, [(parole[k]["p"], parole[k]["da"], parole[k]["a"]) for k in ks], ap["allinea_prima"], ap["allinea_dopo"]]
        impronta = hashlib.md5(json.dumps(ingredienti, ensure_ascii=False).encode()).hexdigest()[:16]
        if impronta not in cache:
            da = max(0.0, parole[ks[0]]["da"] + sorgente.sfasa - ap["allinea_prima"])
            x = pcm_16k(sorgente.percorso, da, parole[ks[-1]]["a"] + sorgente.sfasa + ap["allinea_dopo"] - da)
            risultato = apri().allinea(x, [parole[k]["p"] for k in ks])
            if len(risultato) != len(ks):
                raise Errore(f"l'allineamento di «{sorgente.nome}» ha dato {len(risultato)} parole per {len(ks)}",
                             f"the alignment of «{sorgente.nome}» gave {len(risultato)} words for {len(ks)}")
            cache[impronta] = [[round(da + v[0], 3), round(da + v[1], 3), v[2]] for v in risultato]
            mutato = True
        fuori.append({k: tuple(v) for k, v in zip(ks, cache[impronta])})
    if mutato:
        scrivi_json(cache_file, cache)
    return fuori
