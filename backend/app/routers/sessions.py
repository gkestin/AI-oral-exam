"""
Sessions Router
===============
Voice/text session management for assignments.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from typing import Optional
from datetime import datetime

from ..models import (
    Session, SessionCreate, SessionUpdate, SessionSummary,
    SessionStatus, Assignment, User, UserRole, TranscriptMessage,
)
from ..services import (
    get_current_user, get_firestore_service, FirestoreService,
    require_instructor_or_admin, require_any_role, get_user_role_in_course,
    resolve_key_source_for_user, increment_trial_usage_if_needed, get_decrypted_user_llm_keys,
)
from ..services.elevenlabs import create_dynamic_agent
from ..config import get_settings

router = APIRouter(prefix="/courses/{course_id}/sessions", tags=["sessions"])


def is_student(role) -> bool:
    """Check if role is student (handles both enum and string)."""
    role_value = role.value if hasattr(role, 'value') else role
    return role_value == "student"


def is_status(status, expected: str) -> bool:
    """Check if status matches expected value (handles both enum and string)."""
    status_value = status.value if hasattr(status, 'value') else status
    return status_value == expected


@router.post("", response_model=Session)
async def create_session(
    course_id: str,
    data: SessionCreate,
    user: User = Depends(get_current_user),
    db: FirestoreService = Depends(get_firestore_service),
):
    """Start a new session for an assignment."""
    role = await require_any_role(user, course_id, db)

    # Only instructors/admins can create test sessions
    creating_test = data.is_test and not is_student(role)
    
    # Get the assignment
    assignment = await db.get_subcollection_document(
        "courses", course_id, "assignments", data.assignment_id, Assignment
    )
    
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    # Students can only access published assignments; test sessions bypass this
    if is_student(role) and not assignment.is_published:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    # Check due date (skip for test sessions)
    if not creating_test and assignment.due_date and assignment.due_date < datetime.utcnow():
        if is_student(role):
            raise HTTPException(status_code=400, detail="Assignment is past due")
    
    # Count existing attempts
    existing_sessions = await db.list_subcollection(
        "courses", course_id, "sessions", Session,
        filters=[
            ("assignment_id", "==", data.assignment_id),
            ("student_id", "==", user.id),
        ],
    )
    
    attempt_number = len(existing_sessions) + 1
    api_key_source = await resolve_key_source_for_user(db, user, course_id)
    
    # Create session
    session = Session(
        assignment_id=data.assignment_id,
        course_id=course_id,
        student_id=user.id,
        status=SessionStatus.PENDING,
        attempt_number=attempt_number,
        is_test=creating_test,
        client_info=data.client_info,
        api_key_source=api_key_source,
    )
    
    session_id = await db.create_subcollection_document(
        "courses", course_id, "sessions", session
    )
    session.id = session_id
    
    return session


@router.get("", response_model=list[SessionSummary])
async def list_sessions(
    course_id: str,
    assignment_id: Optional[str] = Query(None),
    student_id: Optional[str] = Query(None),
    status: Optional[SessionStatus] = Query(None),
    is_test: Optional[bool] = Query(None),
    user: User = Depends(get_current_user),
    db: FirestoreService = Depends(get_firestore_service),
):
    """List sessions. Students see only their own; instructors see all."""
    role = await require_any_role(user, course_id, db)
    
    # Fetch all sessions without filtering to avoid needing composite indexes
    all_sessions = await db.list_subcollection(
        "courses", course_id, "sessions", Session,
        filters=None,
        order_by=None,
    )
    
    # Filter in code
    sessions = []
    for s in all_sessions:
        # Students can only see their own non-test sessions
        if is_student(role):
            if s.student_id != user.id:
                continue
            if s.is_test:
                continue
        if student_id and s.student_id != student_id:
            continue
        if assignment_id and s.assignment_id != assignment_id:
            continue
        if status and s.status != status:
            continue
        if is_test is not None and s.is_test != is_test:
            continue
        sessions.append(s)
    
    # Sort by created_at descending
    from datetime import datetime
    sessions.sort(key=lambda s: s.created_at or datetime.min, reverse=True)
    
    # Get unique student IDs for batch lookup
    student_ids = list(set(s.student_id for s in sessions))

    # Batch fetch student info
    student_names = {}
    for student_id in student_ids:
        try:
            student = await db.get_document("users", student_id, User)
            if student:
                student_names[student_id] = student.display_name or student.email or "Unknown Student"
            else:
                student_names[student_id] = "Unknown Student"
        except Exception:
            student_names[student_id] = "Unknown Student"

    # Convert to summaries
    summaries = []
    for session in sessions:
        student_name = student_names.get(session.student_id, "Unknown Student")

        summaries.append(SessionSummary(
            id=session.id,
            assignment_id=session.assignment_id,
            student_id=session.student_id,
            student_name=student_name,
            is_test=session.is_test,
            status=session.status,
            started_at=session.started_at,
            duration_seconds=session.duration_seconds,
            final_score=None,
        ))
    
    return summaries


@router.get("/{session_id}", response_model=Session)
async def get_session(
    course_id: str,
    session_id: str,
    user: User = Depends(get_current_user),
    db: FirestoreService = Depends(get_firestore_service),
):
    """Get a specific session."""
    role = await require_any_role(user, course_id, db)
    
    session = await db.get_subcollection_document(
        "courses", course_id, "sessions", session_id, Session
    )
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Students can only see their own non-test sessions
    if is_student(role):
        if session.student_id != user.id or session.is_test:
            raise HTTPException(status_code=403, detail="Not authorized")
    
    return session


@router.post("/{session_id}/start")
async def start_session(
    course_id: str,
    session_id: str,
    user: User = Depends(get_current_user),
    db: FirestoreService = Depends(get_firestore_service),
):
    """Mark a session as started."""
    session = await db.get_subcollection_document(
        "courses", course_id, "sessions", session_id, Session
    )
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if session.student_id != user.id:
        raise HTTPException(status_code=403, detail="Not your session")
    
    if not is_status(session.status, "pending"):
        raise HTTPException(status_code=400, detail="Session already started")
    
    from datetime import timezone
    doc_path = f"courses/{course_id}/sessions"
    await db.update_document(doc_path, session_id, {
        "status": SessionStatus.IN_PROGRESS.value,
        "started_at": datetime.now(timezone.utc),
    })
    
    return {"message": "Session started", "started_at": datetime.utcnow()}


@router.post("/{session_id}/gemini/token")
async def get_gemini_token(
    course_id: str,
    session_id: str,
    user: User = Depends(get_current_user),
    db: FirestoreService = Depends(get_firestore_service),
):
    """Resolve Gemini API key for frontend usage."""
    session = await db.get_subcollection_document(
        "courses", course_id, "sessions", session_id, Session
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.student_id != user.id:
        raise HTTPException(status_code=403, detail="Not your session")

    key_source = session.api_key_source or await resolve_key_source_for_user(db, user, course_id)
    gemini_key = None

    if key_source == "user_keys":
        user_keys = get_decrypted_user_llm_keys(user)
        gemini_key = user_keys.get("google")
        if not gemini_key:
            raise HTTPException(
                status_code=402,
                detail={
                    "message": "Google/Gemini key is required for voice sessions when using personal keys.",
                    "code": "google_key_required",
                },
            )
    else:
        settings = get_settings()
        gemini_key = settings.google_api_key
        if not gemini_key:
            raise HTTPException(
                status_code=500,
                detail="Server Google API key is not configured for shared voice usage",
            )

    return {"api_key": gemini_key}


@router.post("/{session_id}/elevenlabs/agent")
async def get_or_create_elevenlabs_agent(
    course_id: str,
    session_id: str,
    user: User = Depends(get_current_user),
    db: FirestoreService = Depends(get_firestore_service),
):
    """Resolve or create ElevenLabs agent ID using policy-based key source."""
    session = await db.get_subcollection_document(
        "courses", course_id, "sessions", session_id, Session
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.student_id != user.id:
        raise HTTPException(status_code=403, detail="Not your session")

    assignment = await db.get_subcollection_document(
        "courses", course_id, "assignments", session.assignment_id, Assignment
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    voice_cfg = assignment.voice_config or {}
    eleven_cfg = voice_cfg.get("elevenLabs", {})
    if voice_cfg.get("provider") != "elevenlabs":
        raise HTTPException(status_code=400, detail="Assignment is not configured for ElevenLabs")

    key_source = session.api_key_source or await resolve_key_source_for_user(db, user, course_id)

    existing_agent_id = eleven_cfg.get("agentId")
    existing_agent_key_source = eleven_cfg.get("agentKeySource")

    if existing_agent_id and key_source != "user_keys":
        if existing_agent_key_source != "user_keys":
            return {"agent_id": existing_agent_id, "created": False}

    mode = eleven_cfg.get("mode", "dynamic")
    if mode == "agent_id" and not existing_agent_id:
        raise HTTPException(status_code=400, detail="Assignment expects a pre-created ElevenLabs agent ID")
    if mode == "agent_id" and existing_agent_id:
        return {"agent_id": existing_agent_id, "created": False}

    elevenlabs_key = None
    if key_source == "user_keys":
        user_keys = get_decrypted_user_llm_keys(user)
        elevenlabs_key = user_keys.get("elevenlabs")
        if not elevenlabs_key:
            raise HTTPException(
                status_code=402,
                detail={
                    "message": "ElevenLabs key is required for voice sessions when using personal keys.",
                    "code": "elevenlabs_key_required",
                },
            )
    else:
        settings = get_settings()
        elevenlabs_key = settings.elevenlabs_api_key
        if not elevenlabs_key:
            raise HTTPException(
                status_code=500,
                detail="Server ElevenLabs key is not configured for shared voice usage",
            )

    try:
        new_agent_id = await create_dynamic_agent(assignment, elevenlabs_key)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to create ElevenLabs agent: {exc}") from exc

    if key_source != "user_keys":
        updated_voice_cfg = {
            **voice_cfg,
            "elevenLabs": {
                **eleven_cfg,
                "agentId": new_agent_id,
                "agentKeySource": key_source,
            },
        }
        await db.update_document(
            f"courses/{course_id}/assignments",
            assignment.id,
            {"voice_config": updated_voice_cfg},
        )

    return {"agent_id": new_agent_id, "created": True}


@router.post("/{session_id}/message")
async def add_message(
    course_id: str,
    session_id: str,
    message: TranscriptMessage,
    user: User = Depends(get_current_user),
    db: FirestoreService = Depends(get_firestore_service),
):
    """Add a message to the session transcript."""
    session = await db.get_subcollection_document(
        "courses", course_id, "sessions", session_id, Session
    )
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if session.student_id != user.id:
        raise HTTPException(status_code=403, detail="Not your session")
    
    if not (is_status(session.status, "pending") or is_status(session.status, "in_progress")):
        raise HTTPException(status_code=400, detail="Session is not active")
    
    # Append message to transcript - convert all items to dicts for Firestore
    transcript = [
        m.model_dump() if hasattr(m, 'model_dump') else m 
        for m in (session.transcript or [])
    ]
    transcript.append(message.model_dump())
    
    doc_path = f"courses/{course_id}/sessions"
    from datetime import timezone
    await db.update_document(doc_path, session_id, {
        "transcript": transcript,
        "status": SessionStatus.IN_PROGRESS.value,
        "started_at": session.started_at or datetime.now(timezone.utc),
    })
    
    return {"message": "Message added"}


@router.post("/{session_id}/end")
async def end_session(
    course_id: str,
    session_id: str,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: FirestoreService = Depends(get_firestore_service),
):
    """End a session and optionally trigger grading."""
    session = await db.get_subcollection_document(
        "courses", course_id, "sessions", session_id, Session
    )
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if session.student_id != user.id:
        raise HTTPException(status_code=403, detail="Not your session")
    
    if is_status(session.status, "completed"):
        raise HTTPException(status_code=400, detail="Session already ended")
    
    from datetime import timezone
    ended_at = datetime.now(timezone.utc)
    duration = None
    if session.started_at:
        # Ensure both datetimes are timezone-aware
        started = session.started_at
        if started.tzinfo is None:
            started = started.replace(tzinfo=timezone.utc)
        duration = int((ended_at - started).total_seconds())
    
    doc_path = f"courses/{course_id}/sessions"
    await db.update_document(doc_path, session_id, {
        "status": SessionStatus.COMPLETED.value,
        "ended_at": ended_at,
        "duration_seconds": duration,
    })

    # Reload to evaluate transcript-based trial counting on latest persisted data.
    updated_session = await db.get_subcollection_document(
        "courses", course_id, "sessions", session_id, Session
    )
    if updated_session:
        await increment_trial_usage_if_needed(db, updated_session)
    
    # Check if we should trigger grading
    assignment = await db.get_subcollection_document(
        "courses", course_id, "assignments", session.assignment_id, Assignment
    )
    
    if assignment and assignment.grading.enabled:
        # timing is a string (due to use_enum_values), compare directly
        timing = assignment.grading.timing
        timing_value = timing.value if hasattr(timing, 'value') else timing
        if timing_value == "immediate":
            # Trigger grading in background
            from .grading import grade_session_task
            background_tasks.add_task(
                grade_session_task, course_id, session_id, db
            )
    
    return {
        "message": "Session ended",
        "ended_at": ended_at,
        "duration_seconds": duration,
    }


@router.get("/{session_id}/transcript")
async def get_transcript(
    course_id: str,
    session_id: str,
    user: User = Depends(get_current_user),
    db: FirestoreService = Depends(get_firestore_service),
):
    """Get the transcript for a session."""
    role = await require_any_role(user, course_id, db)
    
    session = await db.get_subcollection_document(
        "courses", course_id, "sessions", session_id, Session
    )
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Students can only see their own
    if is_student(role) and session.student_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    return {"transcript": session.transcript}
