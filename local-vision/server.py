import os
from typing import Any, Dict

from fastapi import FastAPI

from analyze import analyze_batch
from model_loader import load_model, model_info
from qa import ask_video
from schemas import AnalyzeBatchRequest, AnalyzeBatchResponse, AskRequest, AskResponse

app = FastAPI(title="PulsePoint Local Qwen Vision", version="1.0.0")


@app.get("/health")
def health() -> Dict[str, Any]:
    load_on_health = os.getenv("LOCAL_VISION_LOAD_ON_HEALTH", "false").strip().lower() in {"1", "true", "yes"}
    if load_on_health:
        _, _, info = load_model()
        return {
            "ok": True,
            "engine": "local_qwen25vl",
            "model": {**info, "loaded": True},
            "privacy": {"localOnly": True, "cloudUpload": False},
        }
    return {
        "ok": True,
        "engine": "local_qwen25vl",
        "model": model_info(loaded=False),
        "privacy": {"localOnly": True, "cloudUpload": False},
        "warning": "Model is not loaded until first analysis. Set LOCAL_VISION_LOAD_ON_HEALTH=true to load during health check.",
    }


@app.post("/analyze-batch", response_model=AnalyzeBatchResponse)
def analyze_batch_endpoint(request: AnalyzeBatchRequest) -> AnalyzeBatchResponse:
    return analyze_batch(request)


@app.post("/ask", response_model=AskResponse)
def ask_endpoint(request: AskRequest) -> AskResponse:
    return ask_video(request)
