"""
Services Package
================
Business logic and external service integrations.
"""

from .firebase import (
    init_firebase,
    get_firestore,
    get_firestore_service,
    FirestoreService,
)

from .auth import (
    verify_firebase_token,
    verify_token,
    get_current_user,
    get_current_user_websocket,
    get_user_role_in_course,
    require_course_role,
    require_instructor_or_admin,
    require_any_role,
    AuthenticatedUser,
)
from .key_policy import (
    is_harvard_email,
    resolve_key_source_for_user,
    get_or_create_trial_usage,
    get_decrypted_user_llm_keys,
    increment_trial_usage_if_needed,
)

__all__ = [
    # Firebase
    "init_firebase",
    "get_firestore",
    "get_firestore_service",
    "FirestoreService",
    # Auth
    "verify_firebase_token",
    "verify_token",
    "get_current_user",
    "get_current_user_websocket",
    "get_user_role_in_course",
    "require_course_role",
    "require_instructor_or_admin",
    "require_any_role",
    "AuthenticatedUser",
    # Key policy
    "is_harvard_email",
    "resolve_key_source_for_user",
    "get_or_create_trial_usage",
    "get_decrypted_user_llm_keys",
    "increment_trial_usage_if_needed",
]
