"""
Model registry + inference for the web API.

Preprocessing mirrors src/dataset.py exactly (16 evenly spaced frames, resize
to 224x224, ToTensor, no ImageNet normalization) so the server scores clips the
same way the reported test metrics were produced: no train/serve skew.

On top of the final prediction, each model also exposes a per-timestep score:
  - CNN-LSTM: the classifier head applied to the LSTM hidden state after each
    frame, i.e. the model's *running* belief after seeing frames 1..t. The last
    point equals the real prediction.
  - Frame-only mean-pool: the classifier head applied to each frame's feature
    on its own, i.e. how violent that single frame looks. The real prediction
    uses the mean of these features, not the mean of these scores.
"""

import base64
import threading
import time
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import cv2
import torch
import torch.nn.functional as F
from torchvision import transforms

from model import CNNLSTM, CNNMeanPool

ROOT = Path(__file__).resolve().parents[1]
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
SEQ_LEN = 16
CLASS_NAMES = ["Non-Violent", "Violent"]
VIOLENT_IDX = 1

# Hard ceiling on frames decoded per request, so a long upload can't pin a
# worker. At 30 fps this is ~5 minutes of video.
MAX_FRAMES = 9000

TRANSFORM = transforms.Compose([
    transforms.ToPILImage(),
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
])


@dataclass(frozen=True)
class ModelSpec:
    id: str
    name: str
    short: str
    checkpoint: str
    factory: type
    timeline_kind: str  # "running" or "per_frame"
    description: str


MODEL_SPECS = [
    ModelSpec(
        id="cnn_lstm",
        name="CNN-LSTM (weighted)",
        short="CNN-LSTM",
        checkpoint="outputs/checkpoints/cnn_lstm_weighted.pth",
        factory=CNNLSTM,
        timeline_kind="running",
        description="ResNet-18 per frame, LSTM over 16 frames, class-weighted loss. "
                    "The headline model.",
    ),
    ModelSpec(
        id="frame_mean",
        name="Frame-only mean-pool (seed 0)",
        short="Mean-pool",
        checkpoint="outputs/checkpoints/ablation/frame_mean_seed0.pth",
        factory=CNNMeanPool,
        timeline_kind="per_frame",
        description="Same backbone, frame features averaged over time instead of an LSTM. "
                    "The ablation baseline that matched the LSTM.",
    ),
]


def available_specs():
    """Specs whose checkpoint exists on disk (ablation checkpoints are gitignored)."""
    return [s for s in MODEL_SPECS if (ROOT / s.checkpoint).exists()]


def get_spec(model_id):
    for spec in available_specs():
        if spec.id == model_id:
            return spec
    return None


@lru_cache(maxsize=None)
def load_model(model_id):
    spec = get_spec(model_id)
    if spec is None:
        raise KeyError(model_id)
    model = spec.factory(pretrained=False).to(DEVICE)
    model.load_state_dict(torch.load(ROOT / spec.checkpoint, map_location=DEVICE))
    model.eval()
    return model


# One forward pass at a time: torch already uses every core for a single
# ResNet batch, so parallel requests would only thrash the CPU.
_infer_lock = threading.Lock()


class VideoReadError(ValueError):
    pass


def _encode_jpeg(rgb_frame, size=160, quality=82):
    bgr = cv2.cvtColor(rgb_frame, cv2.COLOR_RGB2BGR)
    h, w = bgr.shape[:2]
    scale = size / max(h, w)
    if scale < 1:
        bgr = cv2.resize(bgr, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", bgr, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return "data:image/jpeg;base64," + base64.b64encode(buf).decode("ascii") if ok else None


def sample_frames(video_path, seq_len=SEQ_LEN):
    """Same sampling as ViolenceVideoDataset.sample_frames, plus metadata and
    a JPEG thumbnail of every sampled frame for the UI."""
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise VideoReadError("Could not open video. Is it a valid video file?")

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    if total_frames <= 0:
        cap.release()
        raise VideoReadError("Could not read any frames from this video.")
    total_frames = min(total_frames, MAX_FRAMES)

    indices = torch.linspace(0, total_frames - 1, steps=seq_len).long().tolist()
    target_set = set(indices)
    tensors, thumbs = {}, {}

    current_idx = 0
    last_target = max(indices)
    while current_idx <= last_target:
        ret, frame = cap.read()
        if not ret:
            break
        if current_idx in target_set:
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            tensors[current_idx] = TRANSFORM(rgb)
            thumbs[current_idx] = _encode_jpeg(rgb)
        current_idx += 1
    cap.release()

    if not tensors:
        raise VideoReadError("Could not decode any frames from this video.")

    frames, meta = [], []
    for i, idx in enumerate(indices):
        present = idx in tensors
        frames.append(tensors[idx] if present else torch.zeros(3, 224, 224))
        meta.append({
            "index": i,
            "frame_index": idx,
            "time_sec": round(idx / fps, 3) if fps > 0 else None,
            "thumbnail": thumbs.get(idx),
            "missing": not present,
        })

    info = {
        "total_frames": total_frames,
        "fps": round(fps, 3),
        "duration_sec": round(total_frames / fps, 3) if fps > 0 else None,
        "width": width,
        "height": height,
    }
    return torch.stack(frames), meta, info


@torch.no_grad()
def _forward_with_timeline(model, x):
    """Returns (final_probs [2], timeline_p_violent [T]) for a [1, T, C, H, W] input.
    Re-implements each model's forward() so intermediate features are exposed;
    the final logits are identical to model(x)."""
    b, t, c, h, w = x.shape
    feats = model.cnn(x.reshape(b * t, c, h, w)).reshape(b, t, 512)

    if isinstance(model, CNNLSTM):
        lstm_out, _ = model.lstm(feats)                    # [1, T, H]
        step_logits = model.classifier(lstm_out[0])        # [T, 2]
        final_logits = step_logits[-1]
    elif isinstance(model, CNNMeanPool):
        step_logits = model.classifier(feats[0])           # [T, 2], per frame
        final_logits = model.classifier(feats.mean(dim=1))[0]
    else:
        raise TypeError(type(model).__name__)

    final_probs = F.softmax(final_logits, dim=0)
    timeline = F.softmax(step_logits, dim=1)[:, VIOLENT_IDX]
    return final_probs.cpu(), timeline.cpu()


def predict(video_path, model_id):
    spec = get_spec(model_id)
    if spec is None:
        raise KeyError(model_id)

    t0 = time.perf_counter()
    frames, frame_meta, info = sample_frames(video_path)
    t1 = time.perf_counter()

    model = load_model(model_id)
    with _infer_lock:
        probs, timeline = _forward_with_timeline(model, frames.unsqueeze(0).to(DEVICE))
    t2 = time.perf_counter()

    pred_idx = int(probs.argmax())
    for m, p in zip(frame_meta, timeline.tolist()):
        m["p_violent"] = round(p, 5)

    return {
        "model": {"id": spec.id, "name": spec.name, "timeline_kind": spec.timeline_kind},
        "label": CLASS_NAMES[pred_idx],
        "label_index": pred_idx,
        "confidence": round(float(probs[pred_idx]), 5),
        "p_violent": round(float(probs[VIOLENT_IDX]), 5),
        "frames": frame_meta,
        "video": info,
        "timing_ms": {
            "decode": round((t1 - t0) * 1000, 1),
            "inference": round((t2 - t1) * 1000, 1),
            "total": round((t2 - t0) * 1000, 1),
        },
        "device": str(DEVICE),
    }
