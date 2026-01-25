"""
Base Models
===========
Common base classes and utilities for all models.
"""

from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime
from typing import Optional
from enum import Enum


def to_camel(string: str) -> str:
    """Convert snake_case to camelCase."""
    components = string.split('_')
    return components[0] + ''.join(x.title() for x in components[1:])


class CamelCaseModel(BaseModel):
    """Base model that serializes to camelCase for JSON API responses."""
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,  # Allow both snake_case and camelCase input
        from_attributes=True,
        use_enum_values=True,  # Serialize enums as their string values
    )


# Note: FastAPI automatically handles alias serialization for response models


class TimestampMixin(CamelCaseModel):
    """Mixin for created/updated timestamps."""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None


class FirestoreModel(TimestampMixin):
    """Base model for Firestore documents."""
    id: Optional[str] = None  # Firestore document ID
    
    def to_firestore(self) -> dict:
        """Convert to Firestore-compatible dict (excludes None values)."""
        # Use snake_case for Firestore storage
        data = self.model_dump(exclude_none=True, exclude={"id"}, by_alias=False)
        return data
    
    @classmethod
    def from_firestore(cls, doc_id: str, data: dict) -> "FirestoreModel":
        """Create instance from Firestore document."""
        return cls(id=doc_id, **data)


class UserRole(str, Enum):
    """User roles within a course."""
    ADMIN = "admin"
    INSTRUCTOR = "instructor"
    STUDENT = "student"
    
    def __eq__(self, other):
        """Allow comparison with strings."""
        if isinstance(other, str):
            return self.value == other
        return super().__eq__(other)
    
    def __hash__(self):
        return hash(self.value)


class SessionStatus(str, Enum):
    """Status of a voice session."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    GRADING = "grading"
    GRADED = "graded"
    ERROR = "error"
    
    def __eq__(self, other):
        """Allow comparison with strings."""
        if isinstance(other, str):
            return self.value == other
        return super().__eq__(other)
    
    def __hash__(self):
        return hash(self.value)


class SessionMode(str, Enum):
    """Types of AI conversation sessions."""
    ORAL_EXAM = "oral_exam"
    PRACTICE = "practice"
    AI_TUTOR = "ai_tutor"
    MOCK_INTERVIEW = "mock_interview"
    SOCRATIC = "socratic"
    CUSTOM = "custom"


class GradingTiming(str, Enum):
    """When grading should occur."""
    IMMEDIATE = "immediate"
    ON_DEMAND = "on_demand"
    STUDENT_TRIGGERED = "student_triggered"


class InputMode(str, Enum):
    """Input mode for sessions."""
    VOICE_ONLY = "voice_only"
    VOICE_AND_TEXT = "voice_and_text"
    TEXT_ONLY = "text_only"
