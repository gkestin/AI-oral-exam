"""
Course Models
=============
Course, enrollment, and access management.
"""

from pydantic import Field
from typing import Optional
from datetime import datetime
from .base import FirestoreModel, CamelCaseModel, UserRole, SessionMode, GradingTiming


class CourseDefaults(CamelCaseModel):
    """Default settings applied to new assignments."""
    grading_enabled: bool = True
    grading_timing: GradingTiming = GradingTiming.IMMEDIATE
    grading_models: list[str] = Field(
        default=["gpt-4o", "claude-3-5-sonnet-20241022", "gemini/gemini-1.5-pro"]
    )
    default_mode: SessionMode = SessionMode.ORAL_EXAM
    input_mode: str = "voice_and_text"


class Course(FirestoreModel):
    """Course container for assignments and students."""
    name: str
    description: Optional[str] = None
    owner_id: str  # User ID of creator
    
    # Access codes
    instructor_passcode: str
    student_passcode: str
    
    # Defaults for assignments
    defaults: CourseDefaults = Field(default_factory=CourseDefaults)
    
    # Status
    is_active: bool = True
    archived_at: Optional[datetime] = None


class CourseCreate(CamelCaseModel):
    """Data for creating a course."""
    name: str
    description: Optional[str] = None
    instructor_passcode: Optional[str] = None  # Auto-generate if not provided
    student_passcode: Optional[str] = None
    defaults: Optional[CourseDefaults] = None


class CourseUpdate(CamelCaseModel):
    """Data for updating a course."""
    name: Optional[str] = None
    description: Optional[str] = None
    instructor_passcode: Optional[str] = None
    student_passcode: Optional[str] = None
    defaults: Optional[CourseDefaults] = None
    is_active: Optional[bool] = None


class Enrollment(FirestoreModel):
    """User enrollment in a course with role."""
    user_id: str
    course_id: str
    role: UserRole
    joined_at: datetime = Field(default_factory=datetime.utcnow)


class EnrollmentCreate(CamelCaseModel):
    """Data for enrolling in a course."""
    course_id: str
    passcode: str  # Student or instructor passcode


class CourseWithRole(CamelCaseModel):
    """Course data with the user's role."""
    course: Course
    role: UserRole
    enrolled_at: datetime
