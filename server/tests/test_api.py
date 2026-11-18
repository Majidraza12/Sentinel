"""API tests. Run from the repo root: python -m pytest server/tests -q"""

import io

import pytest
from fastapi.testclient import TestClient

from server.main import app
import media


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def sample_id():
    return next(sid for sid, s in media.SAMPLES.items() if s["label"] == "Violent")


def test_health(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert "cnn_lstm" in body["models_loaded"]
    assert body["samples"] == 53


def test_models_has_exactly_one_default(client):
    models = client.get("/api/models").json()
    assert sum(m["default"] for m in models) == 1


def test_samples_listing_hides_filesystem_paths(client):
    samples = client.get("/api/samples").json()
    assert len(samples) == 53
    assert all("path" not in s for s in samples)
    assert {s["label"] for s in samples} == {"Violent", "Non-Violent"}


def test_predict_sample_shape(client, sample_id):
    r = client.post(f"/api/samples/{sample_id}/predict?model=cnn_lstm")
    assert r.status_code == 200
    body = r.json()
    assert body["label"] in ("Violent", "Non-Violent")
    assert 0.5 <= body["confidence"] <= 1.0
    assert len(body["frames"]) == 16
    assert body["source"]["ground_truth"] == "Violent"
    # For the CNN-LSTM, the running belief after the last frame IS the prediction.
    assert body["frames"][-1]["p_violent"] == pytest.approx(body["p_violent"], abs=1e-4)


def test_unknown_sample_and_model_404(client, sample_id):
    assert client.post("/api/samples/nope/predict").status_code == 404
    assert client.post(f"/api/samples/{sample_id}/predict?model=nope").status_code == 404


def test_sample_ids_cannot_traverse_paths(client):
    assert client.get("/api/samples/..%2F..%2Fsrc%2Fmodel/preview.webm").status_code == 404
    assert client.get("/api/uploads/..%2F..%2Fx/preview.webm").status_code == 404


def test_sample_preview_is_webm(client, sample_id):
    r = client.get(f"/api/samples/{sample_id}/preview.webm")
    assert r.status_code == 200
    assert r.headers["content-type"] == "video/webm"
    assert r.content[:4] == b"\x1a\x45\xdf\xa3"  # EBML magic


def test_upload_roundtrip_and_rescore(client, sample_id):
    raw = media.SAMPLES[sample_id]["path"].read_bytes()
    r = client.post("/api/predict", files={"file": ("clip.mp4", raw, "video/mp4")},
                    data={"model": "cnn_lstm"})
    assert r.status_code == 200
    body = r.json()
    direct = client.post(f"/api/samples/{sample_id}/predict?model=cnn_lstm").json()
    assert body["p_violent"] == pytest.approx(direct["p_violent"], abs=1e-5)

    upload_id = body["source"]["id"]
    assert client.get(f"/api/uploads/{upload_id}/preview.webm").status_code == 200
    again = client.post(f"/api/uploads/{upload_id}/predict?model=cnn_lstm")
    assert again.status_code == 200


def test_upload_rejects_bad_type(client):
    r = client.post("/api/predict", files={"file": ("notes.txt", b"hello", "text/plain")})
    assert r.status_code == 415


def test_upload_rejects_undecodable_video(client):
    r = client.post("/api/predict", files={"file": ("fake.mp4", io.BytesIO(b"\x00" * 2048), "video/mp4")})
    assert r.status_code == 422


def test_metrics_confusion_matches_report(client):
    m = client.get("/api/metrics").json()
    cm = m["headline"]["confusion"]
    report = m["headline"]["report"]
    assert sum(map(sum, cm)) == report["support"] == 53
    accuracy = (cm[0][0] + cm[1][1]) / 53
    assert accuracy == pytest.approx(report["accuracy"], abs=0.006)
    assert len(m["ablation"]) == 2
