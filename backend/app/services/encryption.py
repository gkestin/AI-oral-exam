"""
Encryption Service
==================
Encrypt/decrypt user API keys for Firestore storage.
"""

import base64
import hashlib
from cryptography.fernet import Fernet, InvalidToken

from ..config import get_settings


def _get_fernet() -> Fernet:
    """Build Fernet using ENCRYPTION_KEY, with deterministic fallback."""
    settings = get_settings()
    raw_key = settings.encryption_key

    if raw_key:
        key = raw_key.encode("utf-8")
    else:
        # Fallback keeps existing deployments functional, but ENCRYPTION_KEY is strongly recommended.
        digest = hashlib.sha256(settings.firebase_project_id.encode("utf-8")).digest()
        key = base64.urlsafe_b64encode(digest)

    return Fernet(key)


def encrypt_secret(value: str) -> str:
    """Encrypt a plaintext secret."""
    return _get_fernet().encrypt(value.encode("utf-8")).decode("utf-8")


def decrypt_secret(value: str) -> str:
    """Decrypt an encrypted secret."""
    try:
        return _get_fernet().decrypt(value.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise ValueError("Unable to decrypt stored secret") from exc
