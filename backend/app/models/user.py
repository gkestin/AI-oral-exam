"""
User Models
===========
User profile and authentication models.
"""

from pydantic import EmailStr
from typing import Optional
from datetime import datetime
from .base import FirestoreModel, CamelCaseModel


class User(FirestoreModel):
    """User profile stored in Firestore."""
    email: EmailStr
    display_name: str
    photo_url: Optional[str] = None
    
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
