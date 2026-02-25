"""
Models Package
==============
All Pydantic models for the application.
"""

from .base import (
    FirestoreModel,
    CamelCaseModel,
    TimestampMixin,
    UserRole,
    SessionStatus,
    SessionMode,
    GradingTiming,
    InputMode,
)

from .user import (
    User,
    UserCreate,
    UserUpdate,
    UserPublic,
    UserApiKeys,
    CourseTrialUsage,
)

from .course import (
    Course,
    CourseCreate,
    CourseUpdate,
    CourseDefaults,
    Enrollment,
    EnrollmentCreate,
    CourseWithRole,
)

from .assignment import (
    Assignment,
    AssignmentCreate,
    AssignmentUpdate,
    AssignmentSummary,
    RubricCategory,
    GradingConfig,
    KnowledgeBase,
)

from .session import (
    Session,
    SessionCreate,
    SessionUpdate,
    SessionSummary,
    TranscriptMessage,
)

from .grading import (
    LLMGrade,
    FinalGrade,
    CategoryScore,
    GradeRequest,
    GradeSummary,
)

__all__ = [
    # Base
    "FirestoreModel",
    "CamelCaseModel",
    "TimestampMixin",
    "UserRole",
    "SessionStatus",
    "SessionMode",
    "GradingTiming",
    "InputMode",
    # User
    "User",
    "UserCreate",
    "UserUpdate",
    "UserPublic",
    "UserApiKeys",
    "CourseTrialUsage",
    # Course
    "Course",
    "CourseCreate",
    "CourseUpdate",
    "CourseDefaults",
    "Enrollment",
    "EnrollmentCreate",
    "CourseWithRole",
    # Assignment
    "Assignment",
    "AssignmentCreate",
    "AssignmentUpdate",
    "AssignmentSummary",
    "RubricCategory",
    "GradingConfig",
    "KnowledgeBase",
    # Session
    "Session",
    "SessionCreate",
    "SessionUpdate",
    "SessionSummary",
    "TranscriptMessage",
    # Grading
    "LLMGrade",
    "FinalGrade",
    "CategoryScore",
    "GradeRequest",
    "GradeSummary",
]
