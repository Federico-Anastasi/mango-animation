import os


def lingua():
    """La lingua delle frasi: quella di chi ha chiesto il lavoro (`MANGO_ANIMATION_LINGUA`, che mette il server), italiano senza."""
    return "en" if os.environ.get("MANGO_ANIMATION_LINGUA") == "en" else "it"


def dice(it, en):
    """La frase nella lingua in uso."""
    return en if lingua() == "en" else it


class Errore(Exception):
    """Un guaio che chi lancia il comando può rimediare: il messaggio dice cosa manca e cosa fare, in italiano e in inglese; `str` dà quello della lingua in uso."""

    def __init__(self, it, en):
        super().__init__(it, en)
        self.it, self.en = it, en

    def __str__(self):
        return dice(self.it, self.en)


class Frase(str):
    """Una frase che si legge in italiano (è la stringa) e porta l'inglese in `en`: per gli elenchi di problemi e avvisi."""

    def __new__(cls, it, en):
        frase = super().__new__(cls, it)
        frase.en = en
        return frase

    def detta(self):
        return dice(str(self), self.en)
