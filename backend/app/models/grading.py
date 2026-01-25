"""
Grading Models
==============
Individual LLM grades and final aggregated grades.
"""

from pydantic import Field
from typing import Optional
from datetime import datetime
from .base import FirestoreModel, CamelCaseModel


class CategoryScore(CamelCaseModel):
    """Score for a single rubric category."""
    category: str
    score: float
    max_score: float
    evidence: str  # Quote or reasoning from transcript
    feedback: str


class LLMGrade(FirestoreModel):
    """Grade from a single LLM."""
    session_id: str
    model: str  # e.g., "gpt-4o", "claude-3-5-sonnet"
    round: int  # 1 = independent, 2 = deliberation
    
    scores: list[CategoryScore]
    overall_feedback: str
    
    # Metadata
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
    latency_ms: Optional[int] = None


class FinalGrade(FirestoreModel):
    """Aggregated final grade from grading council."""
    session_id: str
    
    # Aggregated scores
    scores: list[CategoryScore]
    total_score: float
    max_possible_score: float
    percentage: float
    
    # Feedback
    overall_feedback: str
    strengths: list[str] = Field(default_factory=list)
    areas_for_improvement: list[str] = Field(default_factory=list)
    
    # Metadata
    models_used: list[str]
    agreement_score: float  # How much models agreed
    graded_at: datetime = Field(default_factory=datetime.utcnow)


class GradeRequest(CamelCaseModel):
    """Request to grade a session."""
    session_id: str
    force_regrade: bool = False


class GradeSummary(CamelCaseModel):
    """Summary of grades for display."""
    session_id: str
    total_score: float
    max_possible_score: float
    percentage: float
    graded_at: datetime
    status: str  # "graded" | "pending" | "error"
