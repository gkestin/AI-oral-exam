"""
Session Models
==============
Voice/text session and transcript models.
"""

from pydantic import Field
from typing import Optional
from datetime import datetime
from .base import FirestoreModel, CamelCaseModel, SessionStatus


class TranscriptMessage(CamelCaseModel):
    """A single message in the session transcript."""
    role: str  # "user" | "assistant" | "system"
    content: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    audio_url: Optional[str] = None  # Storage path if audio recorded


class Session(FirestoreModel):
    """A student's session for an assignment."""
    assignment_id: str
    course_id: str
    student_id: str
    
    # Status
    status: SessionStatus = SessionStatus.PENDING
    
    # Timing
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    duration_seconds: Optional[int] = None
    
    # Content
    transcript: list[TranscriptMessage] = Field(default_factory=list)
    
    # Metadata
    attempt_number: int = 1
    client_info: Optional[dict] = None  # Browser, device info


class SessionCreate(CamelCaseModel):
    """Data for creating a new session."""
    assignment_id: str
    client_info: Optional[dict] = None


class SessionUpdate(CamelCaseModel):
    """Data for updating a session."""
    status: Optional[SessionStatus] = None
    ended_at: Optional[datetime] = None


class SessionSummary(CamelCaseModel):
    """Summary of session for list views."""
    id: str
    assignment_id: str
    student_id: str
    student_name: str
    status: SessionStatus
    started_at: Optional[datetime]
    duration_seconds: Optional[int]
    final_score: Optional[float] = None
