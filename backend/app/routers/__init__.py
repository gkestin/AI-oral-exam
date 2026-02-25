"""
Routers Package
===============
API route handlers.
"""

from .courses import router as courses_router
from .assignments import router as assignments_router
from .sessions import router as sessions_router
from .grading import router as grading_router
from .voice import router as voice_router
from .users import router as users_router

__all__ = [
    "courses_router",
    "assignments_router",
    "sessions_router",
    "grading_router",
    "voice_router",
    "users_router",
]
