@echo off
setlocal
cd /d "%~dp0"
if not defined LOCAL_VISION_MODEL set LOCAL_VISION_MODEL=Qwen/Qwen2.5-VL-7B-Instruct
if not defined LOCAL_VISION_DEVICE set LOCAL_VISION_DEVICE=cuda
if not defined LOCAL_VISION_QUANTIZATION set LOCAL_VISION_QUANTIZATION=4bit
if not defined LOCAL_VISION_ALLOW_CPU set LOCAL_VISION_ALLOW_CPU=false
if not defined LOCAL_VISION_HOST set LOCAL_VISION_HOST=127.0.0.1
if not defined LOCAL_VISION_PORT set LOCAL_VISION_PORT=8765
py -3 -m uvicorn server:app --host %LOCAL_VISION_HOST% --port %LOCAL_VISION_PORT%
