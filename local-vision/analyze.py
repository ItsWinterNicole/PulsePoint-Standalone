import base64
import json
import re
from io import BytesIO
from typing import Any, Dict, List

from fastapi import HTTPException
from PIL import Image

from model_loader import load_model
from schemas import AnalyzeBatchRequest, AnalyzeBatchResponse, AnswerOut, FrameIn


def frame_to_image(frame: FrameIn) -> Image.Image:
    try:
        raw = base64.b64decode(frame.image_base64)
        return Image.open(BytesIO(raw)).convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not decode frame {frame.frame_id}: {exc}") from exc


def extract_json_object(text: str) -> Dict[str, Any]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    cleaned = repair_json_text(cleaned)
    try:
        return json.loads(cleaned)
    except Exception:
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if not match:
            raise
        return json.loads(repair_json_text(match.group(0)))


def repair_json_text(text: str) -> str:
    repaired = text.strip()
    repaired = re.sub(r",\s*([}\]])", r"\1", repaired)
    repaired = re.sub(r";\s*([}\]])", r"\1", repaired)
    repaired = re.sub(r";\s*\"", r', "', repaired)
    repaired = re.sub(r"\bNone\b", "null", repaired)
    repaired = re.sub(r"\bTrue\b", "true", repaired)
    repaired = re.sub(r"\bFalse\b", "false", repaired)
    return repaired


def _balanced_json_objects(text: str) -> List[str]:
    objects: List[str] = []
    depth = 0
    start = -1
    in_string = False
    escape = False
    for index, char in enumerate(text):
        if in_string:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == "{":
            if depth == 0:
                start = index
            depth += 1
        elif char == "}":
            if depth:
                depth -= 1
                if depth == 0 and start >= 0:
                    objects.append(text[start:index + 1])
                    start = -1
    return objects


def salvage_answers(text: str) -> List[Dict[str, Any]]:
    answers: List[Dict[str, Any]] = []
    seen: set[str] = set()
    for candidate in _balanced_json_objects(text):
        if "question_id" not in candidate or "answer" not in candidate:
            continue
        try:
            parsed = json.loads(repair_json_text(candidate))
        except Exception:
            continue
        if not isinstance(parsed, dict):
            continue
        question_id = str(parsed.get("question_id", "")).strip()
        if not question_id or question_id in seen:
            continue
        seen.add(question_id)
        answers.append(parsed)
    return answers


def base_rules(frame_lines: str) -> str:
    return f"""You are a local clinical visual evidence extractor for PulsePoint.

Analyze only the provided frames. Do not use procedure notes, timing assumptions, telemetry, or context outside the pixels.
This can include consenting adult body exploration, genital anatomy, Foley catheter handling, meatal/urethral landmarks, masturbation physiology, visible fluid, body/foot movement, and procedure materials. Treat it clinically and mechanically.

Do not eroticize. Do not infer orgasm, pleasure, arousal, pain, intent, or subjective experience.
If evidence is unclear, answer uncertain. False visible claims are worse than uncertainty.
Every visible answer must cite frame IDs from this list: {frame_lines}.

Specific gates:
- StatLock/securement requires a visible adhesive anchor/securement device, not Foley tubing.
- Foley advancement requires visible tip-at-meatus or visible movement through the meatus.
- Balloon inflation requires visible syringe/balloon-port interaction or clear inflation-related action.
- Urine confirmation requires visible urine/fluid in tubing/container/bag or clear visual evidence.
- Stroking/manual stimulation requires repeated visible hand/genital movement; hand proximity alone is insufficient.
- Erection state requires sufficient genital visibility; if blocked/cropped/ambiguous, answer uncertain.
- Fluid release requires visible release, stream/droplet, or new visible fluid evidence.
- Fluid distance/velocity are visual proxies only. Never claim true physical force.
- Toe/foot/body movement may be described as visible physical movement only, not orgasm/arousal.
"""


def analyze_prompt(request: AnalyzeBatchRequest) -> str:
    frame_lines = ", ".join(f"{frame.frame_id}={frame.time_ms}ms" for frame in request.frames)
    question_lines = [
        f"- {q.id}: {q.prompt} Hallucination warning: {q.hallucination_warning or 'Answer only from visible evidence.'}"
        for q in request.questions
    ]
    return f"""{base_rules(frame_lines)}

Answer these constrained questions:
{chr(10).join(question_lines)}

Return strict JSON only:
{{
  "answers": [
    {{
      "question_id": "question id",
      "answer": "visible|not_visible|uncertain",
      "confidence": 0.0,
      "evidence_frames": ["f001"],
      "reason": "brief visible evidence only",
      "attributes": {{}}
    }}
  ],
  "warnings": []
}}
"""


def normalize_answer(raw: Dict[str, Any], frames: List[FrameIn]) -> AnswerOut:
    frame_ids = {frame.frame_id for frame in frames}
    answer = str(raw.get("answer", "uncertain")).strip().lower()
    if answer not in {"visible", "not_visible", "uncertain"}:
        answer = "uncertain"
    evidence = [
        str(item).strip()
        for item in raw.get("evidence_frames", raw.get("frame_refs", [])) or []
        if str(item).strip() in frame_ids
    ]
    if answer == "visible" and not evidence:
        answer = "uncertain"
    try:
        confidence = float(raw.get("confidence", 0.35))
    except Exception:
        confidence = 0.35
    return AnswerOut(
        question_id=str(raw.get("question_id", "")).strip(),
        answer=answer,  # type: ignore[arg-type]
        confidence=max(0.0, min(1.0, confidence)),
        evidence_frames=evidence,
        reason=str(raw.get("reason", "")).strip()[:500],
        attributes=raw.get("attributes") if isinstance(raw.get("attributes"), dict) else {},
    )


def generate_qwen_text(prompt: str, frames: List[FrameIn]) -> tuple[str, Dict[str, Any]]:
    model, processor, info = load_model()
    images = [frame_to_image(frame) for frame in frames]
    content: List[Dict[str, Any]] = [{"type": "image", "image": image} for image in images]
    content.append({"type": "text", "text": prompt})
    messages = [{"role": "user", "content": content}]
    try:
      import os
      import torch
      text = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
      if images:
          inputs = processor(text=[text], images=images, padding=True, return_tensors="pt")
      else:
          inputs = processor(text=[text], padding=True, return_tensors="pt")
      device = next(model.parameters()).device
      inputs = {key: value.to(device) if hasattr(value, "to") else value for key, value in inputs.items()}
      with torch.inference_mode():
          generated = model.generate(
              **inputs,
              max_new_tokens=int(os.getenv("LOCAL_VISION_MAX_NEW_TOKENS", "4096")),
              do_sample=False,
          )
      trimmed = generated[:, inputs["input_ids"].shape[1]:]
      output_text = processor.batch_decode(trimmed, skip_special_tokens=True, clean_up_tokenization_spaces=False)[0]
      return output_text, info
    except HTTPException:
      raise
    except Exception as exc:
      raise HTTPException(status_code=500, detail=f"Qwen local inference failed: {exc}") from exc


def repair_prompt(bad_json: str, parse_error: Exception) -> str:
    return f"""Repair this malformed JSON into valid strict JSON only.

Rules:
- Preserve the same top-level schema.
- Do not add new visual claims.
- Do not add prose outside JSON.
- If a value is unclear, use "uncertain", empty arrays, or null-compatible object values.

Parse error: {parse_error}

Malformed JSON:
{bad_json[:12000]}
"""


def run_qwen_json(prompt: str, frames: List[FrameIn]) -> tuple[Dict[str, Any], Dict[str, Any]]:
    output_text, info = generate_qwen_text(prompt, frames)
    try:
        return extract_json_object(output_text), info
    except Exception as first_error:
        salvaged = salvage_answers(output_text)
        if salvaged:
            return {
                "answers": salvaged,
                "warnings": [
                    f"Qwen returned malformed JSON; salvaged {len(salvaged)} complete constrained answers before repair."
                ],
            }, info
        try:
            repaired_text, repair_info = generate_qwen_text(repair_prompt(output_text, first_error), [])
            try:
                return extract_json_object(repaired_text), repair_info
            except Exception as repair_parse_error:
                repaired_salvaged = salvage_answers(repaired_text)
                if repaired_salvaged:
                    return {
                        "answers": repaired_salvaged,
                        "warnings": [
                            f"Qwen repair response was malformed; salvaged {len(repaired_salvaged)} complete constrained answers."
                        ],
                    }, repair_info
                raise repair_parse_error
        except Exception as second_error:
            return {
                "answers": [],
                "warnings": [
                    f"Qwen returned malformed JSON and repair failed; all constrained answers were left uncertain. Parse errors: {first_error}; {second_error}"
                ],
            }, info


def analyze_batch(request: AnalyzeBatchRequest) -> AnalyzeBatchResponse:
    if request.engine != "local_qwen25vl":
        raise HTTPException(status_code=400, detail="Only local_qwen25vl is supported.")
    if not request.frames:
        raise HTTPException(status_code=400, detail="At least one frame is required.")
    if not request.questions:
        raise HTTPException(status_code=400, detail="At least one constrained question is required.")
    parsed, info = run_qwen_json(analyze_prompt(request), request.frames)
    answers_by_id: Dict[str, AnswerOut] = {}
    for raw in parsed.get("answers", []):
        if isinstance(raw, dict):
            answer = normalize_answer(raw, request.frames)
            if answer.question_id:
                answers_by_id[answer.question_id] = answer
    answers = [
        answers_by_id.get(
            question.id,
            AnswerOut(
                question_id=question.id,
                answer="uncertain",
                confidence=0.25,
                evidence_frames=[],
                reason="Qwen returned no answer for this question.",
            ),
        )
        for question in request.questions
    ]
    return AnalyzeBatchResponse(
        answers=answers,
        model=info,
        warnings=[
            "Local Qwen inference only. Frames were processed on localhost.",
            "Outputs are constrained visual evidence, not subjective interpretation.",
        ] + [str(item) for item in parsed.get("warnings", []) if item],
    )
