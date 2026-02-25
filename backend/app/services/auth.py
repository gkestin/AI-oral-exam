"""
Authentication Service
======================
Firebase Auth token verification and user management.
"""

from fastapi import HTTPException, Security, Depends, WebSocket
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from firebase_admin import auth
from typing import Optional, Dict, Any
from pydantic import BaseModel

from .firebase import init_firebase, get_firestore_service, FirestoreService
from ..models import User, UserCreate, UserRole, Enrollment
from .key_policy import is_harvard_email

# Security scheme
security = HTTPBearer()


class AuthenticatedUser(BaseModel):
    """Authenticated user with decoded token info."""
    uid: str
    email: str
    display_name: Optional[str] = None
    photo_url: Optional[str] = None
    email_verified: bool = False


async def verify_firebase_token(
    credentials: HTTPAuthorizationCredentials = Security(security)
) -> AuthenticatedUser:
    """Verify Firebase ID token from Authorization header."""
    init_firebase()
    
    try:
        # Verify the token
        decoded_token = auth.verify_id_token(credentials.credentials)
        
        return AuthenticatedUser(
            uid=decoded_token["uid"],
            email=decoded_token.get("email", ""),
            display_name=decoded_token.get("name"),
            photo_url=decoded_token.get("picture"),
            email_verified=decoded_token.get("email_verified", False),
        )
    except auth.InvalidIdTokenError:
        raise HTTPException(status_code=401, detail="Invalid authentication token")
    except auth.ExpiredIdTokenError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")


async def get_current_user(
    auth_user: AuthenticatedUser = Depends(verify_firebase_token),
    db: FirestoreService = Depends(get_firestore_service),
) -> User:
    """Get or create user document for authenticated user."""
    # Try to get existing user
    user = await db.get_document("users", auth_user.uid, User)
    harvard_eligible = is_harvard_email(auth_user.email)
    
    if user is None:
        # Create new user document
        user = User(
            id=auth_user.uid,
            email=auth_user.email,
            display_name=auth_user.display_name or auth_user.email.split("@")[0],
            photo_url=auth_user.photo_url,
            email_verified=auth_user.email_verified,
            is_harvard_eligible=harvard_eligible,
            # Backward-compatible default: existing product behavior allows shared keys by default.
            use_harvard_keys=True,
        )
        await db.create_document("users", user, doc_id=auth_user.uid)
    else:
        updates = {}
        if user.email != auth_user.email:
            updates["email"] = auth_user.email
        if user.display_name != (auth_user.display_name or auth_user.email.split("@")[0]):
            updates["display_name"] = auth_user.display_name or auth_user.email.split("@")[0]
        if user.photo_url != auth_user.photo_url:
            updates["photo_url"] = auth_user.photo_url
        if user.email_verified != auth_user.email_verified:
            updates["email_verified"] = auth_user.email_verified
        if user.is_harvard_eligible != harvard_eligible:
            updates["is_harvard_eligible"] = harvard_eligible

        if updates:
            await db.update_document("users", auth_user.uid, updates)
            user = await db.get_document("users", auth_user.uid, User) or user
    
    return user


async def get_user_role_in_course(
    user_id: str,
    course_id: str,
    db: FirestoreService,
) -> Optional[UserRole]:
    """Get user's role in a specific course."""
    enrollments = await db.list_subcollection(
        parent_collection="courses",
        parent_id=course_id,
        subcollection="enrollments",
        model_class=Enrollment,
        filters=[("user_id", "==", user_id)],
        limit=1,
    )
    
    if not enrollments:
        return None
    
    return enrollments[0].role


async def require_course_role(
    user: User,
    course_id: str,
    required_roles: list[UserRole],
    db: FirestoreService,
) -> UserRole:
    """Require user to have one of the specified roles in a course."""
    role = await get_user_role_in_course(user.id, course_id, db)
    
    if role is None:
        raise HTTPException(
            status_code=403,
            detail="You are not enrolled in this course"
        )
    
    # Compare as string values to handle both enum and string role types
    role_value = role.value if hasattr(role, 'value') else role
    required_values = [r.value for r in required_roles]
    
    if role_value not in required_values:
        raise HTTPException(
            status_code=403,
            detail=f"This action requires one of these roles: {required_values}"
        )
    
    return role


async def require_instructor_or_admin(
    user: User,
    course_id: str,
    db: FirestoreService,
) -> UserRole:
    """Require user to be instructor or admin in course."""
    return await require_course_role(
        user, course_id, [UserRole.INSTRUCTOR, UserRole.ADMIN], db
    )


async def require_any_role(
    user: User,
    course_id: str,
    db: FirestoreService,
) -> UserRole:
    """Require user to have any role in course."""
    return await require_course_role(
        user, course_id, [UserRole.ADMIN, UserRole.INSTRUCTOR, UserRole.STUDENT], db
    )


async def verify_token(token: str) -> Dict[str, Any]:
    """Verify a Firebase ID token directly."""
    init_firebase()

    try:
        decoded_token = auth.verify_id_token(token)
        return decoded_token
    except auth.InvalidIdTokenError:
        raise ValueError("Invalid authentication token")
    except auth.ExpiredIdTokenError:
        raise ValueError("Token has expired")
    except Exception as e:
        raise ValueError(f"Authentication failed: {str(e)}")


async def get_current_user_websocket(token: str) -> User:
    """Get current user from WebSocket token."""
    try:
        decoded = await verify_token(token)

        db = get_firestore_service()
        user = await db.get_document("users", decoded["uid"], User)

        if user is None:
            # Create new user
            user = User(
                id=decoded["uid"],
                email=decoded.get("email", ""),
                display_name=decoded.get("name") or decoded.get("email", "").split("@")[0],
                photo_url=decoded.get("picture"),
                email_verified=decoded.get("email_verified", False),
                is_harvard_eligible=is_harvard_email(decoded.get("email", "")),
                use_harvard_keys=True,
            )
            await db.create_document("users", user, doc_id=decoded["uid"])

        return user
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))
