from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

Status = Literal["visible", "not_visible", "uncertain"]


class FrameIn(BaseModel):
    frame_id: str
    time_ms: int
    image_base64: str = Field(repr=False)
    mime_type: str = "image/jpeg"
    width: Optional[int] = None
    height: Optional[int] = None


class QuestionIn(BaseModel):
    id: str
    label: Optional[str] = None
    prompt: str
    allowed_answers: List[str] = Field(default_factory=lambda: ["visible", "not_visible", "uncertain"])
    hallucination_warning: Optional[str] = None
    category: Optional[str] = None
    domain: Optional[str] = None
    required_frame_evidence: bool = True


class AnalyzeBatchRequest(BaseModel):
    engine: str = "local_qwen25vl"
    record_type: str = "session"
    frames: List[FrameIn]
    questions: List[QuestionIn]
    output_schema: str = "strict"


class AnswerOut(BaseModel):
    question_id: str
    answer: Status
    confidence: float
    evidence_frames: List[str]
    reason: str
    attributes: Dict[str, Any] = Field(default_factory=dict)


class AnalyzeBatchResponse(BaseModel):
    ok: bool = True
    answers: List[AnswerOut]
    model: Dict[str, Any]
    warnings: List[str] = Field(default_factory=list)


class AskRequest(BaseModel):
    engine: str = "local_qwen25vl"
    record_type: str = "session"
    question: str
    frames: List[FrameIn]
    known_timeline: Optional[Dict[str, Any]] = None
    scale_calibration: Dict[str, Any] = Field(default_factory=dict)


class QaAnswer(BaseModel):
    short_answer: str
    confidence: float
    basis: str
    limitations: List[str] = Field(default_factory=list)
    frame_refs: List[str] = Field(default_factory=list)
    timeline_event_refs: List[str] = Field(default_factory=list)


class AskResponse(BaseModel):
    ok: bool = True
    model: Dict[str, Any]
    answer: QaAnswer
    supporting_evidence: Dict[str, Any] = Field(default_factory=dict)
    forbidden_or_not_visible: List[Dict[str, Any]] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
