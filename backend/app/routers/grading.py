"""
Grading Router
==============
Grading operations and grade retrieval.
"""

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from typing import Optional
from datetime import datetime

from ..models import (
    Session, Assignment, User, UserRole, SessionStatus,
    LLMGrade, FinalGrade, GradeRequest, GradeSummary, CategoryScore,
)
from ..services import (
    get_current_user, get_firestore_service, FirestoreService,
    require_instructor_or_admin, require_any_role, get_user_role_in_course,
    resolve_key_source_for_user,
)
from ..services.llm import grade_with_council

router = APIRouter(prefix="/courses/{course_id}/grading", tags=["grading"])


def is_student(role) -> bool:
    """Check if role is student (handles both enum and string)."""
    role_value = role.value if hasattr(role, 'value') else role
    return role_value == "student"


def is_status(status, expected: str) -> bool:
    """Check if status matches expected value (handles both enum and string)."""
    status_value = status.value if hasattr(status, 'value') else status
    return status_value == expected


async def grade_session_task(
    course_id: str,
    session_id: str,
    db: FirestoreService,
):
    """Background task to grade a session."""
    try:
        # Get session
        session = await db.get_subcollection_document(
            "courses", course_id, "sessions", session_id, Session
        )
        
        if not session:
            print(f"Session {session_id} not found")
            return
        
        # Get assignment for grading config
        assignment = await db.get_subcollection_document(
            "courses", course_id, "assignments", session.assignment_id, Assignment
        )
        
        if not assignment:
            print(f"Assignment {session.assignment_id} not found")
            return
        
        # Update status to grading
        doc_path = f"courses/{course_id}/sessions"
        await db.update_document(doc_path, session_id, {
            "status": SessionStatus.GRADING.value,
        })
        
        # Format transcript for grading
        transcript_text = "\n".join([
            f"[{msg['role'].upper() if isinstance(msg, dict) else msg.role.upper()}]: "
            f"{msg['content'] if isinstance(msg, dict) else msg.content}"
            for msg in session.transcript
        ])
        
        if not transcript_text.strip():
            transcript_text = "[Empty transcript - no conversation recorded]"
        
        # Run grading council
        student_user = await db.get_document("users", session.student_id, User)
        key_source = session.api_key_source
        if student_user and not key_source:
            try:
                key_source = await resolve_key_source_for_user(db, student_user, course_id)
            except Exception:
                # Backward-compatible fallback for pre-policy sessions.
                key_source = "harvard_unlimited"

        result = await grade_with_council(
            transcript=transcript_text,
            rubric=assignment.grading.rubric,
            models=assignment.grading.models,
            agreement_threshold=assignment.grading.agreement_threshold,
            user=student_user,
            key_source=key_source,
        )
        
        # Save individual LLM grades
        for round_num, grades in [(1, result["round1_grades"]), (2, result.get("round2_grades"))]:
            if not grades:
                continue
            for grade_data in grades:
                llm_grade = LLMGrade(
                    session_id=session_id,
                    model=grade_data["model"],
                    round=round_num,
                    scores=[CategoryScore(**s) for s in grade_data["scores"]],
                    overall_feedback=grade_data["overall_feedback"],
                    prompt_tokens=grade_data.get("prompt_tokens"),
                    completion_tokens=grade_data.get("completion_tokens"),
                    latency_ms=grade_data.get("latency_ms"),
                )
                await db.create_subcollection_document(
                    f"courses/{course_id}/sessions", session_id, "grades", llm_grade
                )
        
        # Save final grade
        final = result["final_grade"]
        final_grade = FinalGrade(
            session_id=session_id,
            scores=[CategoryScore(**s) for s in final["scores"]],
            total_score=final["total_score"],
            max_possible_score=final["max_possible_score"],
            percentage=final["percentage"],
            overall_feedback=final["overall_feedback"],
            strengths=[],  # TODO: Extract from feedback
            areas_for_improvement=[],
            models_used=assignment.grading.models,
            agreement_score=result["agreement_score"],
        )
        
        await db.create_subcollection_document(
            f"courses/{course_id}/sessions", session_id, "final_grade", final_grade,
            doc_id="final"
        )
        
        # Update session status
        await db.update_document(doc_path, session_id, {
            "status": SessionStatus.GRADED.value,
        })
        
        print(f"Successfully graded session {session_id}")
        
    except Exception as e:
        print(f"Error grading session {session_id}: {e}")
        import traceback
        traceback.print_exc()
        # Update status to error
        doc_path = f"courses/{course_id}/sessions"
        try:
            await db.update_document(doc_path, session_id, {
                "status": SessionStatus.ERROR.value,
            })
            print(f"Updated session {session_id} status to ERROR")
        except Exception as update_err:
            print(f"Failed to update session status to ERROR: {update_err}")


@router.post("/grade")
async def trigger_grading(
    course_id: str,
    request: GradeRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: FirestoreService = Depends(get_firestore_service),
):
    """Trigger grading for a session."""
    role = await require_any_role(user, course_id, db)
    
    session = await db.get_subcollection_document(
        "courses", course_id, "sessions", request.session_id, Session
    )
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Check permissions
    if is_student(role):
        if session.student_id != user.id:
            raise HTTPException(status_code=403, detail="Not your session")
        
        # Check if student-triggered grading is allowed
        assignment = await db.get_subcollection_document(
            "courses", course_id, "assignments", session.assignment_id, Assignment
        )
        if assignment:
            timing = assignment.grading.timing
            timing_value = timing.value if hasattr(timing, 'value') else timing
            if timing_value != "student_triggered":
                raise HTTPException(
                    status_code=403, 
                    detail="Student-triggered grading is not enabled for this assignment"
                )
    
    # Check if already graded (unless force regrade)
    if is_status(session.status, "graded") and not request.force_regrade:
        raise HTTPException(status_code=400, detail="Session already graded")
    
    if is_status(session.status, "grading"):
        raise HTTPException(status_code=400, detail="Grading already in progress")
    
    # Trigger grading
    background_tasks.add_task(grade_session_task, course_id, request.session_id, db)
    
    return {"message": "Grading started", "session_id": request.session_id}


@router.get("/sessions/{session_id}/grades", response_model=list[LLMGrade])
async def get_session_grades(
    course_id: str,
    session_id: str,
    user: User = Depends(get_current_user),
    db: FirestoreService = Depends(get_firestore_service),
):
    """Get individual LLM grades for a session."""
    role = await require_any_role(user, course_id, db)
    
    session = await db.get_subcollection_document(
        "courses", course_id, "sessions", session_id, Session
    )
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Students can only see their own
    if is_student(role) and session.student_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    grades = await db.list_subcollection(
        f"courses/{course_id}/sessions", session_id, "grades", LLMGrade,
        order_by="created_at",
    )
    
    return grades


@router.get("/sessions/{session_id}/final", response_model=FinalGrade)
async def get_final_grade(
    course_id: str,
    session_id: str,
    user: User = Depends(get_current_user),
    db: FirestoreService = Depends(get_firestore_service),
):
    """Get the final aggregated grade for a session."""
    role = await require_any_role(user, course_id, db)
    
    session = await db.get_subcollection_document(
        "courses", course_id, "sessions", session_id, Session
    )
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Students can only see their own
    if is_student(role) and session.student_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    final_grade = await db.get_subcollection_document(
        f"courses/{course_id}/sessions", session_id, "final_grade", "final", FinalGrade
    )
    
    if not final_grade:
        raise HTTPException(status_code=404, detail="Grade not found")
    
    return final_grade


@router.get("/assignment/{assignment_id}/summary")
async def get_assignment_grade_summary(
    course_id: str,
    assignment_id: str,
    user: User = Depends(get_current_user),
    db: FirestoreService = Depends(get_firestore_service),
):
    """Get grading summary for an assignment (instructors only)."""
    await require_instructor_or_admin(user, course_id, db)
    
    # Get all non-test sessions for this assignment
    all_sessions = await db.list_subcollection(
        "courses", course_id, "sessions", Session,
        filters=[("assignment_id", "==", assignment_id)],
    )
    sessions = [s for s in all_sessions if not s.is_test]
    
    total_sessions = len(sessions)
    graded_sessions = sum(1 for s in sessions if is_status(s.status, "graded"))
    pending_sessions = sum(1 for s in sessions if is_status(s.status, "completed") or is_status(s.status, "pending"))
    in_progress = sum(1 for s in sessions if is_status(s.status, "in_progress"))
    errors = sum(1 for s in sessions if is_status(s.status, "error"))
    
    # TODO: Calculate average score, score distribution, etc.
    
    return {
        "assignment_id": assignment_id,
        "total_sessions": total_sessions,
        "graded": graded_sessions,
        "pending_grading": pending_sessions,
        "in_progress": in_progress,
        "errors": errors,
        "completion_rate": graded_sessions / total_sessions if total_sessions > 0 else 0,
    }


@router.post("/assignment/{assignment_id}/grade-all")
async def grade_all_pending(
    course_id: str,
    assignment_id: str,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: FirestoreService = Depends(get_firestore_service),
):
    """Grade all pending sessions for an assignment (instructors only)."""
    await require_instructor_or_admin(user, course_id, db)
    
    # Get all completed but ungraded student sessions (exclude test sessions)
    all_sessions = await db.list_subcollection(
        "courses", course_id, "sessions", Session,
        filters=[
            ("assignment_id", "==", assignment_id),
            ("status", "==", SessionStatus.COMPLETED.value),
        ],
    )
    sessions = [s for s in all_sessions if not s.is_test]
    
    # Queue grading for each
    for session in sessions:
        background_tasks.add_task(grade_session_task, course_id, session.id, db)
    
    return {
        "message": f"Queued {len(sessions)} sessions for grading",
        "session_count": len(sessions),
    }
