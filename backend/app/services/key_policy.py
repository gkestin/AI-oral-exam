"""
Key Policy Service
==================
Resolve API-key source and enforce course-level shared-key trial usage.
"""

from fastapi import HTTPException
from datetime import datetime

from google.cloud.firestore_v1 import Increment

from ..config import get_settings
from ..models import User, CourseTrialUsage, Session
from .firebase import FirestoreService
from .encryption import decrypt_secret


def is_harvard_email(email: str) -> bool:
    """Allow harvard.edu and subdomains like fas.harvard.edu."""
    if "@" not in email:
        return False
    domain = email.split("@", 1)[1].strip().lower()
    return domain == "harvard.edu" or domain.endswith(".harvard.edu")


def _has_personal_llm_key(user: User) -> bool:
    if not user.api_keys:
        return False
    return bool(
        user.api_keys.openai_encrypted
        or user.api_keys.anthropic_encrypted
        or user.api_keys.google_encrypted
    )


def _trial_doc_id(course_id: str) -> str:
    return course_id


async def get_or_create_trial_usage(db: FirestoreService, course_id: str) -> CourseTrialUsage:
    settings = get_settings()
    usage = await db.get_document("course_trial_usage", _trial_doc_id(course_id), CourseTrialUsage)
    if usage:
        return usage

    usage = CourseTrialUsage(
        course_id=course_id,
        conversation_limit=settings.non_harvard_trial_limit_per_course,
        conversations_used=0,
    )
    await db.create_document("course_trial_usage", usage, doc_id=_trial_doc_id(course_id))
    usage.id = _trial_doc_id(course_id)
    return usage


async def resolve_key_source_for_user(
    db: FirestoreService,
    user: User,
    course_id: str,
) -> str:
    """
    Returns one of:
    - user_keys
    - harvard_unlimited
    - course_trial
    Raises 402 when keys are required.
    """
    if _has_personal_llm_key(user):
        return "user_keys"

    if not user.use_harvard_keys:
        raise HTTPException(
            status_code=402,
            detail={
                "message": "API keys are required. Add your keys in Settings to continue.",
                "code": "api_keys_required",
            },
        )

    if user.is_harvard_eligible and user.email_verified:
        return "harvard_unlimited"

    usage = await get_or_create_trial_usage(db, course_id)

    try:
        from ..models import Session as SessionModel, SessionStatus
        all_sessions = await db.list_subcollection(
            "courses", course_id, "sessions", SessionModel,
            filters=None,
        )
        uncounted_trial = sum(
            1 for s in all_sessions
            if (s.api_key_source == "course_trial"
                and not s.trial_counted
                and s.status in (
                    SessionStatus.PENDING,
                    SessionStatus.IN_PROGRESS,
                    "pending",
                    "in_progress",
                ))
        )
    except Exception:
        uncounted_trial = 0

    effective_used = usage.conversations_used + uncounted_trial
    if effective_used >= usage.conversation_limit:
        raise HTTPException(
            status_code=402,
            detail={
                "message": "This course has used all shared trial conversations. Add personal API keys in Settings.",
                "code": "trial_quota_exhausted",
                "trial_limit": usage.conversation_limit,
                "trial_used": effective_used,
            },
        )

    return "course_trial"


def get_decrypted_user_llm_keys(user: User) -> dict[str, str]:
    """Return decrypted user keys for providers that are configured."""
    keys: dict[str, str] = {}
    if not user.api_keys:
        return keys

    if user.api_keys.openai_encrypted:
        keys["openai"] = decrypt_secret(user.api_keys.openai_encrypted)
    if user.api_keys.anthropic_encrypted:
        keys["anthropic"] = decrypt_secret(user.api_keys.anthropic_encrypted)
    if user.api_keys.google_encrypted:
        keys["google"] = decrypt_secret(user.api_keys.google_encrypted)
    if user.api_keys.elevenlabs_encrypted:
        keys["elevenlabs"] = decrypt_secret(user.api_keys.elevenlabs_encrypted)
    return keys


def should_count_trial_conversation(session: Session) -> bool:
    """Count only completed trial sessions with at least 3 user messages."""
    if session.api_key_source != "course_trial":
        return False
    if session.trial_counted:
        return False
    user_message_count = 0
    for msg in session.transcript or []:
        role = msg.get("role") if isinstance(msg, dict) else getattr(msg, "role", None)
        if role == "user":
            user_message_count += 1
    return user_message_count >= 3


async def increment_trial_usage_if_needed(db: FirestoreService, session: Session) -> None:
    """Increment course trial usage once for qualifying sessions."""
    if not should_count_trial_conversation(session):
        return

    await get_or_create_trial_usage(db, session.course_id)

    doc_ref = db.db.collection("course_trial_usage").document(_trial_doc_id(session.course_id))
    doc_ref.update({
        "conversations_used": Increment(1),
        "updated_at": datetime.utcnow(),
    })

    if session.id:
        await db.update_document(
            f"courses/{session.course_id}/sessions",
            session.id,
            {"trial_counted": True},
        )
