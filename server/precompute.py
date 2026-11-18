"""
Scores every held-out test clip with every available model and writes
outputs/predictions/web_test_predictions.csv.

The web app uses it to (a) badge each sample clip with whether the model got
it right on the test set and (b) draw exact confusion matrices on the Results
page. Run from the repo root:
    python server/precompute.py
"""

import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "src"), str(ROOT / "server")]

import inference  # noqa: E402
import media  # noqa: E402

OUT = ROOT / "outputs" / "predictions" / "web_test_predictions.csv"


def main():
    specs = inference.available_specs()
    rows = []
    for spec in specs:
        correct = 0
        for i, sample in enumerate(media.SAMPLES.values(), 1):
            r = inference.predict(sample["path"], spec.id)
            ok = r["label"] == sample["label"]
            correct += ok
            rows.append({
                "sample_id": sample["id"],
                "model_id": spec.id,
                "actual": sample["label"],
                "predicted": r["label"],
                "p_violent": r["p_violent"],
                "correct": ok,
            })
            print(f"[{spec.id}] {i:>2}/{len(media.SAMPLES)} {sample['id']:<28} -> {r['label']}")
        print(f"[{spec.id}] accuracy {correct}/{len(media.SAMPLES)} = {correct / len(media.SAMPLES):.3f}")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    print(f"wrote {OUT.relative_to(ROOT)} ({len(rows)} rows)")


if __name__ == "__main__":
    main()
