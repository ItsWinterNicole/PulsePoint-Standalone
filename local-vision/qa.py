from typing import Any, Dict

from fastapi import HTTPException

from analyze import base_rules, run_qwen_json
from schemas import AskRequest, AskResponse, QaAnswer


def qa_prompt(request: AskRequest) -> str:
    frame_lines = ", ".join(f"{frame.frame_id}={frame.time_ms}ms" for frame in request.frames)
    timeline = request.known_timeline or {}
    return f"""{base_rules(frame_lines)}

User video question:
{request.question}

You may use this existing local structured timeline only as already-extracted visual evidence, not as a replacement for frame evidence:
{timeline}

Answer only from visible evidence in the supplied frames and local timeline. Do not infer from notes, procedure context, timing, or telemetry.
If frame evidence is insufficient, say that clearly. Cite frame_refs and timestamps where possible.
For ejaculation/fluid questions, distinguish visible fluid release from subjective orgasm. For Foley securement, require a visible adhesive/securement device.

Return strict JSON only:
{{
  "answer": {{
    "short_answer": "clinical concise answer",
    "confidence": 0.0,
    "basis": "brief visual basis with timestamps",
    "limitations": [],
    "frame_refs": ["f001"],
    "timeline_event_refs": []
  }},
  "supporting_evidence": {{
    "visible_objects": [],
    "visible_actions": [],
    "fluid_dynamics": [],
    "frame_evidence": []
  }},
  "forbidden_or_not_visible": [],
  "warnings": []
}}
"""


def ask_video(request: AskRequest) -> AskResponse:
    if request.engine != "local_qwen25vl":
        raise HTTPException(status_code=400, detail="Only local_qwen25vl is supported.")
    if not request.frames:
        raise HTTPException(status_code=400, detail="At least one frame is required.")
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="question is required.")

    parsed, info = run_qwen_json(qa_prompt(request), request.frames)
    raw_answer: Dict[str, Any] = parsed.get("answer") if isinstance(parsed.get("answer"), dict) else {}
    frame_ids = {frame.frame_id for frame in request.frames}
    frame_refs = [
        str(item).strip()
        for item in raw_answer.get("frame_refs", []) or []
        if str(item).strip() in frame_ids
    ]
    try:
        confidence = float(raw_answer.get("confidence", 0.25))
    except Exception:
        confidence = 0.25
    if not frame_refs and confidence > 0.4:
        confidence = 0.35
    answer = QaAnswer(
        short_answer=str(raw_answer.get("short_answer") or "The local visual evidence is insufficient to answer that confidently.").strip(),
        confidence=max(0.0, min(1.0, confidence)),
        basis=str(raw_answer.get("basis") or "Answer constrained to sampled visible frame evidence.").strip(),
        limitations=[str(item) for item in raw_answer.get("limitations", []) if item],
        frame_refs=frame_refs,
        timeline_event_refs=[str(item) for item in raw_answer.get("timeline_event_refs", []) if item],
    )
    if not frame_refs:
        answer.limitations.append("No frame references were cited by the model; treat the answer as low confidence.")

    return AskResponse(
        model=info,
        answer=answer,
        supporting_evidence=parsed.get("supporting_evidence") if isinstance(parsed.get("supporting_evidence"), dict) else {},
        forbidden_or_not_visible=parsed.get("forbidden_or_not_visible") if isinstance(parsed.get("forbidden_or_not_visible"), list) else [],
        warnings=[
            "Local Qwen video Q&A only. Frames were processed on localhost.",
            "Answer is constrained to visible evidence and cited frame references.",
        ] + [str(item) for item in parsed.get("warnings", []) if item],
    )
