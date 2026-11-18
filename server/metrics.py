"""
Reads the experiment outputs already in outputs/ and serves them as JSON, so
the Results page renders the real logged numbers rather than copies of them.
"""

import csv
import re
from functools import lru_cache

from inference import ROOT

METRICS_DIR = ROOT / "outputs" / "metrics"
ABLATION_DIR = METRICS_DIR / "ablation"


def _read_csv(path):
    if not path.exists():
        return []
    with open(path, newline="") as f:
        return [{k: _num(v) for k, v in row.items()} for row in csv.DictReader(f)]


def _num(v):
    try:
        f = float(v)
        return int(f) if f.is_integer() and "." not in v else f
    except (TypeError, ValueError):
        return v


def _parse_classification_report(path):
    """sklearn text report -> {class: {precision, recall, f1, support}, accuracy}."""
    if not path.exists():
        return None
    out = {}
    for line in path.read_text().splitlines():
        parts = line.split()
        if not parts:
            continue
        if parts[0] == "accuracy":
            out["accuracy"] = float(parts[1])
            out["support"] = int(parts[2])
        elif len(parts) >= 5 and re.fullmatch(r"[\d.]+", parts[-1]):
            name = " ".join(parts[:-4])
            p, r, f1, s = parts[-4:]
            out[name] = {"precision": float(p), "recall": float(r), "f1": float(f1), "support": int(s)}
    return out


def _confusion_from_predictions(test_predictions, model_id):
    """2x2 [actual][predicted] counts, order (Non-Violent, Violent)."""
    idx = {"Non-Violent": 0, "Violent": 1}
    from media import SAMPLES  # local import: media imports inference too
    cm = [[0, 0], [0, 0]]
    n = 0
    for sample_id, by_model in test_predictions.items():
        pred = by_model.get(model_id)
        sample = SAMPLES.get(sample_id)
        if pred is None or sample is None:
            continue
        cm[idx[sample["label"]]][idx[pred["predicted"]]] += 1
        n += 1
    return cm if n else None


def _split_counts():
    splits_dir = ROOT / "data" / "splits"
    counts = {}
    for split in ("train", "val", "test"):
        counts[split] = {
            label: len(list((splits_dir / split / folder).glob("*.mp4")))
            for label, folder in (("Violent", "violent"), ("Non-Violent", "non-violent"))
        }
    return counts


@lru_cache(maxsize=1)
def load_metrics():
    from media import load_test_predictions
    test_predictions = load_test_predictions()

    histories = {}
    for path in sorted(ABLATION_DIR.glob("history_*_seed*.csv")):
        histories[path.stem.removeprefix("history_")] = _read_csv(path)

    return {
        "ablation": _read_csv(ABLATION_DIR / "ablation.csv"),
        "runs": [
            {k: v for k, v in r.items() if k not in ("checkpoint_path", "history_csv")}
            for r in _read_csv(ABLATION_DIR / "runs_summary.csv")
        ],
        "histories": histories,
        "headline": {
            "model": "CNN-LSTM (weighted)",
            "report": _parse_classification_report(METRICS_DIR / "classification_report.txt"),
            "training": _read_csv(METRICS_DIR / "training_metrics_weighted.csv"),
            "confusion": _confusion_from_predictions(test_predictions, "cnn_lstm"),
        },
        "frame_mean_confusion": _confusion_from_predictions(test_predictions, "frame_mean"),
        "dataset": {"splits": _split_counts()},
    }
