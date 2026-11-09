import numpy as np

from . import allinea
from .archivio import leggi_json, scrivi_json
from .errori import Errore
from .media import info, pcm_16k
from .profilo import richiedi
from .sottotitoli import chiave, parole_pulite, secondi
from .voce import MINIMO_DB, leggi_onda, livello


class Sorgente:
    """Un file del girato col suo preparato: parole, livello della voce, e le scelte che servono al taglio."""

    def __init__(self, archivio, slug, nome, spec, sottotitoli):
        self.archivio, self.slug, self.nome, self.spec, self.sottotitoli = archivio, slug, nome, spec, sottotitoli
        self.file = spec["file"]
        self.percorso = archivio.grezzo(self.file)
        self.preparati = archivio.preparati(self.file)
        self.sfasa = spec.get("sfasamento", 0.0)
        self._parole = self._db = self._testo = self._info = None
        if not self.percorso.exists():
            raise Errore(f"la sorgente «{nome}» punta a {self.file}, che non c'è in {archivio.radice / 'grezzo'}: metti il file lì o correggi il piano",
                         f"the source «{nome}» points to {self.file}, which is not in {archivio.radice / 'grezzo'}: put the file there or fix the plan")

    def _manca(self, cosa, cosa_en):
        return Errore(f"la sorgente «{self.nome}» non è preparata ({cosa}): lancia `python -m motore prepara {self.slug}`",
                      f"the source «{self.nome}» is not prepared ({cosa_en}): run `python -m motore prepara {self.slug}`")

    def senza_audio(self, cosa, cosa_en):
        return Errore(f"la sorgente «{self.nome}» non ha una traccia audio: {cosa}", f"the source «{self.nome}» has no audio track: {cosa_en}")

    @property
    def info(self):
        if self._info is None:
            self._info = info(self.percorso)
        return self._info

    @property
    def parole(self):
        if self._parole is None and not self.info["ha_audio"]:
            self._parole = []
        elif self._parole is None:
            file = self.preparati / "parole.json"
            if not file.exists():
                richiedi("trascrizione", f"la sorgente «{self.nome}» non ha le parole e il video le vuole per tagliare e sottotitolare",
                         f"the source «{self.nome}» has no words and the video needs them to cut and caption")
                raise self._manca("mancano le parole", "the words are missing")
            self._parole = parole_pulite(leggi_json(file, "le parole", "the words"), self.nome, self.sottotitoli, self.archivio.stile)
        return self._parole

    @property
    def db(self):
        """Il livello della voce per centesimo di secondo, dal secondo zero del contenitore."""
        if self._db is None and not self.info["ha_audio"]:
            # Senza traccia audio non c'è voce in nessun istante.
            self._db = np.full(round(self.info["durata"] * 100), MINIMO_DB, dtype=np.float32)
        elif self._db is None:
            file = self.preparati / "onda.bin"
            if not file.exists():
                raise self._manca("manca il livello della voce", "the voice level is missing")
            self._db = leggi_onda(file)
        return self._db

    @property
    def voce(self):
        return self.db >= self.archivio.stile["voce"]["silenzio_db"]

    def livello(self, da, durata):
        """Il livello (dB, un valore per centesimo) di un pezzo di audio con i centesimi che cominciano esattamente a `da`: serve a tagliare
        al fotogramma giusto, dove la griglia fissa di `onda.bin` sbaglierebbe di qualche millisecondo. Si tiene in `livelli.json`."""
        file = self.preparati / "livelli.json"
        dimensione = self.percorso.stat().st_size
        cache = leggi_json(file, "i livelli", "the levels") if file.exists() else {}
        if cache.get("dimensione") != dimensione:
            cache = {"dimensione": dimensione, "voci": {}}
        chiave_cache = f"{da:.3f}+{durata:.3f}"
        if chiave_cache not in cache["voci"]:
            cache["voci"][chiave_cache] = [round(float(v), 3) for v in livello(pcm_16k(self.percorso, da, durata))]
            scrivi_json(file, cache)
        return np.array(cache["voci"][chiave_cache], dtype=np.float32)

    def scegli(self, minuto, dice):
        """Le parole (da, a escluso) di `dice`: la prima volta che vengono dette dal `minuto` della trascrizione."""
        ap = self.archivio.stile["taglio"]["a_parole"]
        if not self.info["ha_audio"]:
            raise self.senza_audio("un pezzo con `dice` ha bisogno della voce: dagli un `da` e un `a`", "a piece with `dice` needs the voice: give it a `da` and an `a`")
        if self._testo is None:
            self._testo = ("".join(p["chiave"] for p in self.parole), np.cumsum([0, *(len(p["chiave"]) for p in self.parole)]))
        testo, inizi = self._testo
        cerca, dal = chiave(dice), secondi(minuto) - ap["minuto_prima"]
        primo = next((k for k, p in enumerate(self.parole) if p["da"] >= dal), None)
        if not cerca or primo is None:
            raise Errore(f"dal minuto {minuto} la trascrizione non dice: {dice}",
                         f"from minute {minuto} the transcript does not say: {dice}")
        qui = int(inizi[primo])
        while True:
            qui = testo.find(cerca, qui)
            i, j = np.searchsorted(inizi, qui), np.searchsorted(inizi, qui + len(cerca))
            if qui < 0 or (inizi[i] == qui and inizi[j] == qui + len(cerca)):
                break
            qui += 1
        if qui < 0 or self.parole[i]["da"] > dal + ap["ricerca"]:
            raise Errore(f"dal minuto {minuto} la trascrizione non dice: {dice}",
                         f"from minute {minuto} the transcript does not say: {dice}")
        return int(i), int(j)

    def veri(self, pezzi):
        return allinea.allinea_pezzi(self, pezzi, self.archivio.stile)
