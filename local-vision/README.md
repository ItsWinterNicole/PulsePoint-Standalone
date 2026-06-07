# PulsePoint Local Qwen Vision Service

Local-only FastAPI service for PulsePoint video interpretation.

This service loads Qwen2.5-VL locally and never calls cloud APIs. If the model or CUDA runtime is unavailable, analysis endpoints return a clear error. There is no mock mode and no cloud fallback.

## Windows + NVIDIA Setup

From `C:\PulsePoint-Standalone\local-vision`:

```powershell
py -3.11 -m venv .venv-qwen
.\.venv-qwen\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

Recommended environment:

```powershell
$env:LOCAL_VISION_MODEL="Qwen/Qwen2.5-VL-7B-Instruct"
$env:LOCAL_VISION_DEVICE="cuda"
$env:LOCAL_VISION_QUANTIZATION="4bit"
$env:LOCAL_VISION_ALLOW_CPU="false"
$env:LOCAL_VISION_HOST="127.0.0.1"
$env:LOCAL_VISION_PORT="8765"
```

Run:

```powershell
.\run_local_vision_server.bat
```

Health:

```powershell
Invoke-RestMethod http://127.0.0.1:8765/health
```

Set `LOCAL_VISION_LOAD_ON_HEALTH=true` before starting the service if you want `/health` to force-load the model.

## PulsePoint Backend Config

```ini
LOCAL_VISION_ENABLED=true
LOCAL_VISION_ENGINE=local_qwen25vl
LOCAL_VISION_URL=http://127.0.0.1:8765
LOCAL_VISION_TIMEOUT_MS=180000
LOCAL_VISION_MAX_FRAMES=8
LOCAL_VISION_CONTINUOUS_MAX_SCAN_FRAMES=600
```

If another PulsePoint helper is already using port `8765`, move either that helper or this service and update `LOCAL_VISION_URL`.

## Endpoints

- `GET /health`
- `POST /analyze-batch`
- `POST /ask`

`/analyze-batch` receives sampled frames plus constrained visual questions and returns strict JSON answers with frame references.

`/ask` receives sampled frames plus a natural-language video question and returns an evidence-grounded answer with frame references.

## Evidence Rules

- Use visible frame evidence only.
- Do not use notes/procedure context as visual evidence.
- Do not infer orgasm, arousal, pleasure, pain, or intent.
- StatLock/securement requires a visible adhesive/securement device.
- Foley advancement requires visible tip-at-meatus or visible advancement motion.
- Stroking requires repeated visible hand/genital movement.
- Fluid release requires visible release, stream/droplet, or new visible fluid.
- Fluid distance and velocity are visual proxies only unless scale calibration is supplied.
- Every visible claim must cite frame IDs.
