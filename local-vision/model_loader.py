import os
from functools import lru_cache
from typing import Any, Dict, Tuple

from fastapi import HTTPException


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def model_name() -> str:
    return os.getenv("LOCAL_VISION_MODEL", "Qwen/Qwen2.5-VL-7B-Instruct")


def requested_device() -> str:
    return os.getenv("LOCAL_VISION_DEVICE", "cuda").strip().lower() or "cuda"


def requested_quantization() -> str:
    return os.getenv("LOCAL_VISION_QUANTIZATION", "4bit").strip().lower() or "4bit"


@lru_cache(maxsize=1)
def load_model() -> Tuple[Any, Any, Dict[str, Any]]:
    try:
        import torch
        from transformers import AutoProcessor, BitsAndBytesConfig, Qwen2_5_VLForConditionalGeneration
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Qwen/PyTorch dependencies are not installed: {exc}") from exc

    cuda_available = bool(torch.cuda.is_available())
    allow_cpu = _env_bool("LOCAL_VISION_ALLOW_CPU", False)
    device = requested_device()
    if device == "cuda" and not cuda_available and not allow_cpu:
        raise HTTPException(
            status_code=503,
            detail="CUDA is not available and LOCAL_VISION_ALLOW_CPU=false. Install NVIDIA drivers/CUDA PyTorch or explicitly allow CPU for slow testing.",
        )

    quantization = requested_quantization()
    quant_config = None
    torch_dtype = torch.float16 if cuda_available else torch.float32
    if cuda_available and quantization in {"4bit", "8bit"}:
        try:
            quant_config = BitsAndBytesConfig(
                load_in_4bit=quantization == "4bit",
                load_in_8bit=quantization == "8bit",
                bnb_4bit_compute_dtype=torch.float16,
            )
        except Exception as exc:
            raise HTTPException(status_code=503, detail=f"bitsandbytes quantization is not available: {exc}") from exc

    processor = AutoProcessor.from_pretrained(model_name(), trust_remote_code=True)
    model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
        model_name(),
        torch_dtype=torch_dtype if quant_config is None else None,
        quantization_config=quant_config,
        device_map="auto" if cuda_available else None,
        trust_remote_code=True,
    )
    model.eval()
    info = {
        "name": model_name(),
        "device": "cuda" if cuda_available else "cpu",
        "quantization": quantization if quant_config is not None else ("fp16" if cuda_available else "fp32"),
    }
    return model, processor, info


def model_info(loaded: bool = False) -> Dict[str, Any]:
    info = {
        "name": model_name(),
        "device": requested_device(),
        "quantization": requested_quantization(),
        "loaded": loaded,
    }
    try:
        import torch
        info["cuda_available"] = bool(torch.cuda.is_available())
        if torch.cuda.is_available():
            info["cuda_device"] = torch.cuda.get_device_name(0)
    except Exception:
        info["cuda_available"] = False
    return info
