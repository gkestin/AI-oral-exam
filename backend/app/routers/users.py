"""
Users Router
============
User settings, key management, and key-source policy status.
"""

from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends

from ..models import User, UserApiKeys, CamelCaseModel
from ..services import (
    get_current_user,
    get_firestore_service,
    FirestoreService,
    get_or_create_trial_usage,
)
from ..services.encryption import encrypt_secret
from ..services.key_policy import resolve_key_source_for_user

router = APIRouter(prefix="/users/me", tags=["users"])


class ApiKeysUpdateRequest(CamelCaseModel):
    openai_key: Optional[str] = None
    anthropic_key: Optional[str] = None
    google_key: Optional[str] = None
    elevenlabs_key: Optional[str] = None


class SharedKeyPreferenceRequest(CamelCaseModel):
    use_harvard_keys: bool = True


class KeyPolicyResponse(CamelCaseModel):
    is_harvard_eligible: bool
    email_verified: bool
    use_harvard_keys: bool
    has_personal_keys: bool
    active_source: Optional[str] = None
    trial_limit: Optional[int] = None
    trial_used: Optional[int] = None
    trial_remaining: Optional[int] = None
    trial_exhausted: Optional[bool] = None


@router.get("")
async def get_my_profile(user: User = Depends(get_current_user)):
    """Get current user profile for settings."""
    return user


@router.post("/shared-keys")
async def set_shared_key_preference(
    request: SharedKeyPreferenceRequest,
    user: User = Depends(get_current_user),
    db: FirestoreService = Depends(get_firestore_service),
):
    await db.update_document("users", user.id, {"use_harvard_keys": request.use_harvard_keys})
    return {"message": "Preference updated", "use_harvard_keys": request.use_harvard_keys}


@router.get("/api-keys")
async def get_api_keys(user: User = Depends(get_current_user)):
    keys = user.api_keys
    return {
        "openai_configured": bool(keys and keys.openai_encrypted),
        "anthropic_configured": bool(keys and keys.anthropic_encrypted),
        "google_configured": bool(keys and keys.google_encrypted),
        "elevenlabs_configured": bool(keys and keys.elevenlabs_encrypted),
    }


@router.post("/api-keys")
async def upsert_api_keys(
    request: ApiKeysUpdateRequest,
    user: User = Depends(get_current_user),
    db: FirestoreService = Depends(get_firestore_service),
):
    current = user.api_keys or UserApiKeys(updated_at=datetime.utcnow())

    if request.openai_key is not None:
        current.openai_encrypted = encrypt_secret(request.openai_key) if request.openai_key.strip() else None
    if request.anthropic_key is not None:
        current.anthropic_encrypted = encrypt_secret(request.anthropic_key) if request.anthropic_key.strip() else None
    if request.google_key is not None:
        current.google_encrypted = encrypt_secret(request.google_key) if request.google_key.strip() else None
    if request.elevenlabs_key is not None:
        current.elevenlabs_encrypted = encrypt_secret(request.elevenlabs_key) if request.elevenlabs_key.strip() else None
    current.updated_at = datetime.utcnow()

    await db.update_document("users", user.id, {"api_keys": current.model_dump(exclude_none=True)})
    return {"message": "API keys updated"}


@router.get("/key-policy", response_model=KeyPolicyResponse)
async def get_key_policy(
    course_id: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: FirestoreService = Depends(get_firestore_service),
):
    has_personal_keys = bool(
        user.api_keys and (
            user.api_keys.openai_encrypted
            or user.api_keys.anthropic_encrypted
            or user.api_keys.google_encrypted
        )
    )
    response = KeyPolicyResponse(
        is_harvard_eligible=user.is_harvard_eligible,
        email_verified=user.email_verified,
        use_harvard_keys=user.use_harvard_keys,
        has_personal_keys=has_personal_keys,
    )

    if course_id:
        usage = await get_or_create_trial_usage(db, course_id)
        response.trial_limit = usage.conversation_limit
        response.trial_used = usage.conversations_used
        response.trial_remaining = max(usage.conversation_limit - usage.conversations_used, 0)
        response.trial_exhausted = usage.conversations_used >= usage.conversation_limit
        try:
            response.active_source = await resolve_key_source_for_user(db, user, course_id)
        except Exception:
            response.active_source = "api_keys_required"

    return response
