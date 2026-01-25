"""
Assignment Models
=================
Assignment configuration and knowledge base.
"""

from pydantic import Field
from typing import Optional
from datetime import datetime
from .base import FirestoreModel, CamelCaseModel, SessionMode, GradingTiming, InputMode


class RubricCategory(CamelCaseModel):
    """A single rubric category for grading."""
    name: str
    description: str
    max_points: int = 5
    weight: float = 1.0  # Relative weight in final score


class GradingConfig(CamelCaseModel):
    """Grading configuration for an assignment."""
    enabled: bool = True
    timing: GradingTiming = GradingTiming.IMMEDIATE
    models: list[str] = Field(
        default=["gpt-4.1", "claude-opus-4-5-20251101", "gemini-2.5-pro"]
    )
    rubric: list[RubricCategory] = Field(default_factory=list)
    show_live_feedback: bool = False  # For practice sessions
    agreement_threshold: float = 0.8  # Model agreement for final grade


class KnowledgeBase(CamelCaseModel):
    """Knowledge base configuration for RAG."""
    files: list[str] = Field(default_factory=list)  # Storage paths
    text: Optional[str] = None  # Pasted text content
    links: list[str] = Field(default_factory=list)  # External URLs
    allow_student_uploads: bool = False


class Assignment(FirestoreModel):
    """Assignment within a course."""
    course_id: str
    title: str
    description: Optional[str] = None
    instructions: Optional[str] = None  # Instructions shown to student
    
    # Session configuration
    mode: SessionMode = SessionMode.ORAL_EXAM
    system_prompt: Optional[str] = None  # Custom AI system prompt
    input_mode: InputMode = InputMode.VOICE_AND_TEXT
    
    # Timing
    due_date: Optional[datetime] = None
    time_limit_minutes: Optional[int] = None  # Max session duration
    
    # Grading
    grading: GradingConfig = Field(default_factory=GradingConfig)
    
    # Knowledge base
    knowledge_base: KnowledgeBase = Field(default_factory=KnowledgeBase)
    
    # Status
    is_published: bool = False
    is_active: bool = True


class AssignmentCreate(CamelCaseModel):
    """Data for creating an assignment."""
    title: str
    description: Optional[str] = None
    instructions: Optional[str] = None
    mode: SessionMode = SessionMode.ORAL_EXAM
    system_prompt: Optional[str] = None
    input_mode: InputMode = InputMode.VOICE_AND_TEXT
    due_date: Optional[datetime] = None
    time_limit_minutes: Optional[int] = None
    grading: Optional[GradingConfig] = None
    knowledge_base: Optional[KnowledgeBase] = None
    is_published: bool = False


class AssignmentUpdate(CamelCaseModel):
    """Data for updating an assignment."""
    title: Optional[str] = None
    description: Optional[str] = None
    instructions: Optional[str] = None
    mode: Optional[SessionMode] = None
    system_prompt: Optional[str] = None
    input_mode: Optional[InputMode] = None
    due_date: Optional[datetime] = None
    time_limit_minutes: Optional[int] = None
    grading: Optional[GradingConfig] = None
    knowledge_base: Optional[KnowledgeBase] = None
    is_published: Optional[bool] = None
    is_active: Optional[bool] = None


class AssignmentSummary(CamelCaseModel):
    """Summary of assignment for list views."""
    id: str
    title: str
    mode: SessionMode
    due_date: Optional[datetime]
    is_published: bool
    session_count: int = 0
    graded_count: int = 0
