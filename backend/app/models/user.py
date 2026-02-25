"""
User Models
===========
User profile and authentication models.
"""

from pydantic import EmailStr
from typing import Optional
from datetime import datetime
from .base import FirestoreModel, CamelCaseModel


class UserApiKeys(CamelCaseModel):
    """Encrypted user-provided API keys."""
    openai_encrypted: Optional[str] = None
    anthropic_encrypted: Optional[str] = None
    google_encrypted: Optional[str] = None
    elevenlabs_encrypted: Optional[str] = None
    updated_at: datetime


class User(FirestoreModel):
    """User profile stored in Firestore."""
    email: EmailStr
    display_name: str
    photo_url: Optional[str] = None
    email_verified: bool = False
    is_harvard_eligible: bool = False
    use_harvard_keys: bool = True
    api_keys: Optional[UserApiKeys] = None
    
    # Computed/cached fields
    last_login: Optional[datetime] = None


class UserCreate(CamelCaseModel):
    """Data for creating a new user."""
    email: EmailStr
    display_name: str
    photo_url: Optional[str] = None


class UserUpdate(CamelCaseModel):
    """Data for updating a user."""
    display_name: Optional[str] = None
    photo_url: Optional[str] = None


class UserPublic(CamelCaseModel):
    """Public user data (safe to expose)."""
    id: str
    display_name: str
    photo_url: Optional[str] = None


class CourseTrialUsage(FirestoreModel):
    """Course-level usage of shared trial keys for non-Harvard users."""
    course_id: str
    conversation_limit: int = 10
    conversations_used: int = 0
