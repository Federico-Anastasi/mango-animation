import numpy as np

from .errori import Errore


def liscia(misure, morbido):
    """Il centro da tenere, misura per misura: la testa misurata, coi vuoti riempiti dalle misure accanto e levigata su `morbido` secondi,
    come una camera che segue senza inseguire ogni gesto."""
    passo = 1 / misure["misure_al_secondo"]
    x = np.array([np.nan if v is None else v for v in misure["x"]], dtype=float)
    viste = ~np.isnan(x)
    if not viste.any():
        raise Errore("nella sorgente non si vede nessuno da seguire",
                     "no one is visible in the source to follow")
    x = np.interp(np.arange(len(x)), np.flatnonzero(viste), x[viste])
    n = max(1, round(3 * morbido / passo))
    nucleo = np.exp(-0.5 * (np.arange(-n, n + 1) * passo / morbido) ** 2)
    return np.convolve(np.pad(x, n, mode="edge"), nucleo / nucleo.sum(), mode="valid")


def espressione(centro, misure_al_secondo, inizio, passo_immagine, durata, largo, taglio, scarto):
    """La `x` del crop di ffmpeg per un tratto, in funzione di `t`: il taglio largo `taglio` centrato sulla persona, dentro il fotogramma largo `largo`,
    spostato di `scarto` (lo zoom dentro il taglio). `inizio` è il secondo della sorgente al primo fotogramma, `passo_immagine` quanti secondi
    della sorgente passano in uno del tratto. Fra due misure il taglio scorre dritto."""
    passo = 1 / misure_al_secondo
    nodi = np.arange(int(np.ceil(durata / passo)) + 2) * passo
    x = np.clip(np.interp((inizio + nodi * passo_immagine) * misure_al_secondo, np.arange(len(centro)), centro) * largo - taglio / 2, 0, largo - taglio) + scarto
    pendenze = np.diff(x) / passo
    return f"{x[0]:.1f}" + "".join(f"{p:+.2f}*clip(t-{t:.3f},0,{passo:.3f})" for p, t in zip(pendenze, nodi) if round(p, 2))
