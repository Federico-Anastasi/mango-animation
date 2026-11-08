import json
import os
import re
import subprocess
import sys
from pathlib import Path

RADICE = Path(__file__).resolve().parents[2]
SPENTE = ("HF_HUB_DISABLE_PROGRESS_BARS", "TQDM_DISABLE", "TRANSFORMERS_VERBOSITY", "OPENCV_LOG_LEVEL")


def _in_un_processo_pulito(programma):
    ambiente = {k: v for k, v in os.environ.items() if k not in SPENTE}
    fatto = subprocess.run([sys.executable, "-c", programma], cwd=RADICE, env=ambiente, capture_output=True, text=True, timeout=300)
    assert fatto.returncode == 0, fatto.stderr
    return fatto.stdout.strip()


def test_le_librerie_di_terzi_non_scrivono_barre_ne_avvisi_nelle_righe_dei_lavori():
    fuori = _in_un_processo_pulito(
        "import motore, cv2, transformers.utils.logging as l\n"
        "print(l.is_progress_bar_enabled(), cv2.utils.logging.getLogLevel() == cv2.utils.logging.LOG_LEVEL_ERROR)")
    assert fuori == "False True"


def test_la_versione_del_prodotto_e_quella_dell_app():
    from motore import VERSIONE

    app = RADICE / "app"
    conf = json.loads((app / "tauri.conf.json").read_text(encoding="utf-8"))["version"]
    cargo = re.search(r'^version = "([^"]+)"', (app / "Cargo.toml").read_text(encoding="utf-8"), re.M).group(1)
    assert VERSIONE == conf == cargo
