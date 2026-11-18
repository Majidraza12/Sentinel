"""
FastAPI backend for the incident-detection web app.

Run from the repo root:
    python -m uvicorn server.main:app --reload --port 8000

If web/dist exists (npm run build), the built frontend is served from / too,
so a single process hosts the whole app in production.
"""

import sys
from contextlib import asynccontextmanager
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# The model code lives in src/ and server modules import each other flatly.
for p in (ROOT / "src", ROOT / "server"):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

from fastapi import FastAPI, File, Form, HTTPException, UploadFile  # noqa: E402
from fastapi.responses import FileResponse, Response  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402

import inference  # noqa: E402
import media  # noqa: E402
from metrics import load_metrics  # noqa: E402

ALLOWED_SUFFIXES = {".mp4", ".avi", ".mov", ".mkv", ".webm", ".m4v"}
MAX_UPLOAD_BYTES = 100 * 1024 * 1024
DEFAULT_MODEL = "cnn_lstm"


@asynccontextmanager
async def lifespan(app):
    # Load weights up front so the first visitor doesn't pay for it.
    for spec in inference.available_specs():
        inference.load_model(spec.id)
    yield


app = FastAPI(title="Incident Detection API", version="1.0.0", lifespan=lifespan)


def _model_or_404(model_id):
    if inference.get_spec(model_id) is None:
        raise HTTPException(404, f"Unknown or unavailable model '{model_id}'.")
    return model_id


def _sample_or_404(sample_id):
    sample = media.SAMPLES.get(sample_id)
    if sample is None:
        raise HTTPException(404, f"Unknown sample '{sample_id}'.")
    return sample


def _run_prediction(path, model_id):
    try:
        return inference.predict(path, model_id)
    except inference.VideoReadError as e:
        raise HTTPException(422, str(e))


# ------------------------------------------------------------------ meta

@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "device": str(inference.DEVICE),
        "models_loaded": [s.id for s in inference.available_specs()],
        "samples": len(media.SAMPLES),
    }


@app.get("/api/models")
def models():
    return [
        {
            "id": s.id,
            "name": s.name,
            "short": s.short,
            "description": s.description,
            "timeline_kind": s.timeline_kind,
            "default": s.id == DEFAULT_MODEL,
        }
        for s in inference.available_specs()
    ]


@app.get("/api/metrics")
def metrics():
    return load_metrics()


# ------------------------------------------------------------------ samples

@app.get("/api/samples")
def samples():
    verdicts = media.load_test_predictions()
    return [
        {**media.public_sample(s), "test_predictions": verdicts.get(s["id"], {})}
        for s in media.SAMPLES.values()
    ]


@app.get("/api/samples/{sample_id}/thumbnail.jpg")
def sample_thumbnail(sample_id: str):
    data = media.sample_thumbnail(_sample_or_404(sample_id))
    if data is None:
        raise HTTPException(500, "Could not read thumbnail frame.")
    return Response(data, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"})


@app.get("/api/samples/{sample_id}/preview.webm")
def sample_preview(sample_id: str):
    sample = _sample_or_404(sample_id)
    path = media.preview_for(sample["path"], f"sample-{sample_id}")
    return FileResponse(path, media_type="video/webm", headers={"Cache-Control": "public, max-age=86400"})


@app.post("/api/samples/{sample_id}/predict")
def predict_sample(sample_id: str, model: str = DEFAULT_MODEL):
    sample = _sample_or_404(sample_id)
    result = _run_prediction(sample["path"], _model_or_404(model))
    result["source"] = {
        "kind": "sample",
        "id": sample_id,
        "name": sample["file"],
        "ground_truth": sample["label"],
        "preview_url": f"/api/samples/{sample_id}/preview.webm",
    }
    return result


# ------------------------------------------------------------------ uploads

@app.post("/api/predict")
def predict_upload(file: UploadFile = File(...), model: str = Form(DEFAULT_MODEL)):
    _model_or_404(model)
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise HTTPException(415, f"Unsupported file type '{suffix or '?'}'. "
                                 f"Use one of: {', '.join(sorted(ALLOWED_SUFFIXES))}.")
    if file.size is not None and file.size > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "File too large (limit 100 MB).")

    upload_id, path = media.save_upload(file.file, suffix)
    if path.stat().st_size > MAX_UPLOAD_BYTES:
        path.unlink(missing_ok=True)
        raise HTTPException(413, "File too large (limit 100 MB).")

    result = _run_prediction(path, model)
    result["source"] = {
        "kind": "upload",
        "id": upload_id,
        "name": file.filename,
        "ground_truth": None,
        "preview_url": f"/api/uploads/{upload_id}/preview.webm",
    }
    return result


@app.post("/api/uploads/{upload_id}/predict")
def repredict_upload(upload_id: str, model: str = DEFAULT_MODEL):
    """Re-score an already uploaded clip with another model, without re-uploading."""
    path = media.upload_path(upload_id)
    if path is None:
        raise HTTPException(404, "Upload expired or not found. Please upload again.")
    result = _run_prediction(path, _model_or_404(model))
    result["source"] = {
        "kind": "upload",
        "id": upload_id,
        "name": None,
        "ground_truth": None,
        "preview_url": f"/api/uploads/{upload_id}/preview.webm",
    }
    return result


@app.get("/api/uploads/{upload_id}/preview.webm")
def upload_preview(upload_id: str):
    path = media.upload_path(upload_id)
    if path is None:
        raise HTTPException(404, "Upload expired or not found.")
    try:
        preview = media.preview_for(path, f"upload-{upload_id}")
    except ValueError as e:
        raise HTTPException(422, str(e))
    return FileResponse(preview, media_type="video/webm")


# ------------------------------------------------------------------ frontend

DIST = ROOT / "web" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        # Real files (favicon etc.) are served as-is; every other path is a
        # client-side route, so hand back index.html.
        candidate = (DIST / full_path).resolve()
        if full_path and candidate.is_file() and DIST.resolve() in candidate.parents:
            return FileResponse(candidate)
        if full_path.startswith("api/"):
            raise HTTPException(404)
        # index.html points at content-hashed bundles; never cache it, so a
        # redeploy is picked up on the next page load.
        return FileResponse(DIST / "index.html", headers={"Cache-Control": "no-cache"})
