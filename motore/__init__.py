import os

VERSIONE = "0.1.3"

# Le barre di avanzamento e gli avvisi delle librerie di terzi finirebbero nelle righe dei lavori: si spengono prima che vengano importate.
for _nome, _valore in (("HF_HUB_DISABLE_PROGRESS_BARS", "1"), ("TQDM_DISABLE", "1"), ("TRANSFORMERS_VERBOSITY", "error"), ("OPENCV_LOG_LEVEL", "ERROR")):
    os.environ.setdefault(_nome, _valore)
