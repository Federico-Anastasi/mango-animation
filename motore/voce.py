import numpy as np

from .media import pcm_16k

# Il livello della voce sta in onda.bin: un byte per centesimo di secondo, a passi di mezzo dB da -100.
MINIMO_DB, PASSI_PER_DB, CAMPIONI = -100.0, 2, 160
PASSO = 0.01


def livello(x):
    """Il livello (dB) di ogni centesimo di secondo di un audio a 16 kHz."""
    n = len(x) // CAMPIONI
    finestre = x[:n * CAMPIONI].reshape(n, CAMPIONI)
    return 20 * np.log10(np.sqrt((finestre ** 2).mean(axis=1)) + 1e-7)


def codifica(db):
    return np.clip(np.round((db - MINIMO_DB) * PASSI_PER_DB), 0, 255).astype(np.uint8)


def decodifica(byte):
    return byte.astype(np.float32) / PASSI_PER_DB + MINIMO_DB


def scrivi_onda(file, destinazione):
    destinazione.write_bytes(codifica(livello(pcm_16k(file))).tobytes())


def leggi_onda(percorso):
    return decodifica(np.frombuffer(percorso.read_bytes(), dtype=np.uint8))


def serie(vero):
    """I tratti consecutivi in cui `vero` vale: [(primo, ultimo + 1), ...]."""
    bordi = np.flatnonzero(np.diff(np.concatenate(([0], vero.astype(np.int8), [0]))))
    return list(zip(bordi[::2], bordi[1::2]))
