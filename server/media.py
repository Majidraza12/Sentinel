"""
Sample clips, uploads, and browser-playable previews.

The dataset clips are MPEG-4 Part 2 ("FMP4"), which no browser can play, and
uploads can be any container/codec. Every clip shown in the UI is therefore
transcoded once to VP8 WebM with OpenCV (no ffmpeg install needed) and cached.
"""

import csv
import re
import shutil
import tempfile
import threading
import uuid
from pathlib import Path

import cv2

from inference import ROOT

TEST_DIR = ROOT / "data" / "splits" / "test"
CACHE_DIR = Path(tempfile.gettempdir()) / "incident-detection-cache"
PREVIEW_DIR = CACHE_DIR / "previews"
UPLOAD_DIR = CACHE_DIR / "uploads"

MAX_PREVIEW_SECONDS = 60
MAX_PREVIEW_SIDE = 480
MAX_UPLOADS_KEPT = 40

UPLOAD_ID_RE = re.compile(r"^[0-9a-f]{32}$")

for d in (PREVIEW_DIR, UPLOAD_DIR):
    d.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------- samples

def _load_samples():
    """Held-out test clips, keyed by a stable id like 'violent--cam1_5'.
    Only ids from this dict are ever turned into paths (no path traversal)."""
    samples = {}
    if not TEST_DIR.exists():
        return samples
    for label_dir in sorted(TEST_DIR.iterdir()):
        if not label_dir.is_dir():
            continue
        for path in sorted(label_dir.glob("*.mp4"), key=_natural_key):
            camera, _, event = path.stem.partition("_")
            sample_id = f"{label_dir.name}--{path.stem}"
            samples[sample_id] = {
                "id": sample_id,
                "label": "Violent" if label_dir.name == "violent" else "Non-Violent",
                "camera": camera,
                "event": event,
                "file": path.name,
                "path": path,
            }
    return samples


def _natural_key(path):
    return [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", path.stem)]


SAMPLES = _load_samples()


def public_sample(s):
    return {k: v for k, v in s.items() if k != "path"}


# ---------------------------------------------------------------- uploads

def save_upload(fileobj, suffix):
    upload_id = uuid.uuid4().hex
    dest = UPLOAD_DIR / f"{upload_id}{suffix}"
    with open(dest, "wb") as out:
        shutil.copyfileobj(fileobj, out, length=1024 * 1024)
    _prune_uploads()
    return upload_id, dest


def upload_path(upload_id):
    if not UPLOAD_ID_RE.match(upload_id):
        return None
    matches = list(UPLOAD_DIR.glob(f"{upload_id}.*"))
    return matches[0] if matches else None


def _prune_uploads():
    files = sorted(UPLOAD_DIR.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True)
    for old in files[MAX_UPLOADS_KEPT:]:
        old.unlink(missing_ok=True)
        (PREVIEW_DIR / f"upload-{old.stem}.webm").unlink(missing_ok=True)


# ---------------------------------------------------------------- previews

_transcode_locks = {}
_locks_guard = threading.Lock()


def _lock_for(key):
    with _locks_guard:
        return _transcode_locks.setdefault(key, threading.Lock())


def preview_for(src_path, cache_key):
    """Path to a cached VP8 WebM of src_path, transcoding on first request.
    cache_key is 'sample-<sample id>' or 'upload-<upload id>'; both are built
    from validated ids, so they are safe as filenames."""
    dest = PREVIEW_DIR / f"{cache_key}.webm"
    if dest.exists():
        return dest
    with _lock_for(cache_key):
        if dest.exists():
            return dest
        _transcode(src_path, dest)
    return dest


def _transcode(src_path, dest):
    cap = cv2.VideoCapture(str(src_path))
    if not cap.isOpened():
        raise ValueError("Could not open video for preview.")
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    scale = min(1.0, MAX_PREVIEW_SIDE / max(w, h))
    # VP8 needs even dimensions.
    out_w, out_h = int(w * scale) // 2 * 2, int(h * scale) // 2 * 2

    tmp = dest.with_suffix(".part.webm")
    writer = cv2.VideoWriter(str(tmp), cv2.VideoWriter_fourcc(*"VP80"), fps, (out_w, out_h))
    max_frames = int(fps * MAX_PREVIEW_SECONDS)
    n = 0
    try:
        while n < max_frames:
            ok, frame = cap.read()
            if not ok:
                break
            if (frame.shape[1], frame.shape[0]) != (out_w, out_h):
                frame = cv2.resize(frame, (out_w, out_h), interpolation=cv2.INTER_AREA)
            writer.write(frame)
            n += 1
    finally:
        writer.release()
        cap.release()
    if n == 0:
        tmp.unlink(missing_ok=True)
        raise ValueError("Video has no decodable frames.")
    tmp.replace(dest)


def sample_thumbnail(sample):
    """JPEG bytes of a clip's middle frame (cached)."""
    dest = PREVIEW_DIR / f"thumb-{sample['id']}.jpg"
    if dest.exists():
        return dest.read_bytes()
    cap = cv2.VideoCapture(str(sample["path"]))
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    cap.set(cv2.CAP_PROP_POS_FRAMES, max(total // 2, 0))
    ok, frame = cap.read()
    cap.release()
    if not ok:
        return None
    ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
    data = buf.tobytes()
    dest.write_bytes(data)
    return data


# ---------------------------------------------------------------- test-set verdicts

def load_test_predictions():
    """Precomputed per-clip test predictions (server/precompute.py), if present."""
    path = ROOT / "outputs" / "predictions" / "web_test_predictions.csv"
    if not path.exists():
        return {}
    out = {}
    with open(path, newline="") as f:
        for row in csv.DictReader(f):
            out.setdefault(row["sample_id"], {})[row["model_id"]] = {
                "predicted": row["predicted"],
                "p_violent": float(row["p_violent"]),
                "correct": row["correct"] == "True",
            }
    return out
