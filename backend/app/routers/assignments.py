"""
Assignments Router
==================
CRUD operations for assignments within courses.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from datetime import datetime

from ..models import (
    Assignment, AssignmentCreate, AssignmentUpdate, AssignmentSummary,
    User, UserRole, SessionStatus,
)
from ..services import (
    get_current_user, get_firestore_service, FirestoreService,
    require_instructor_or_admin, require_any_role, get_user_role_in_course,
)

router = APIRouter(prefix="/courses/{course_id}/assignments", tags=["assignments"])


def is_student(role) -> bool:
    """Check if role is student (handles both enum and string)."""
    role_value = role.value if hasattr(role, 'value') else role
    return role_value == "student"


def is_status(status, expected: str) -> bool:
    """Check if status matches expected value (handles both enum and string)."""
    status_value = status.value if hasattr(status, 'value') else status
    return status_value == expected


@router.post("", response_model=Assignment)
async def create_assignment(
    course_id: str,
    data: AssignmentCreate,
    user: User = Depends(get_current_user),
    db: FirestoreService = Depends(get_firestore_service),
):
    """Create a new assignment (instructors/admins only)."""
    await require_instructor_or_admin(user, course_id, db)
    
    assignment = Assignment(
        course_id=course_id,
        title=data.title,
        description=data.description,
        instructions=data.instructions,
        mode=data.mode,
        system_prompt=data.system_prompt,
        input_mode=data.input_mode,
        due_date=data.due_date,
        time_limit_minutes=data.time_limit_minutes,
        grading=data.grading or Assignment.model_fields["grading"].default,
        knowledge_base=data.knowledge_base or Assignment.model_fields["knowledge_base"].default,
        voice_config=data.voice_config,  # Add voice configuration
        is_published=data.is_published,
    )
    
    assignment_id = await db.create_subcollection_document(
        "courses", course_id, "assignments", assignment
    )
    assignment.id = assignment_id
    
    return assignment


@router.get("", response_model=list[AssignmentSummary])
async def list_assignments(
    course_id: str,
    include_unpublished: bool = Query(False),
    user: User = Depends(get_current_user),
    db: FirestoreService = Depends(get_firestore_service),
):
    """List assignments in a course."""
    role = await require_any_role(user, course_id, db)
    
    # Fetch all assignments without filtering to avoid needing composite indexes
    all_assignments = await db.list_subcollection(
        "courses", course_id, "assignments", Assignment,
        filters=None,  # No filters to avoid index requirements
        order_by=None,  # Sort in code
    )
    
    # Filter in code
    assignments = [
        a for a in all_assignments 
        if a.is_active and (
            include_unpublished or 
            not is_student(role) or 
            a.is_published
        )
    ]
    
    # Sort by created_at descending
    assignments.sort(key=lambda a: a.created_at or datetime.min, reverse=True)
    
    # Convert to summaries (skip session counts for now to avoid more queries)
    summaries = []
    for assignment in assignments:
        summaries.append(AssignmentSummary(
            id=assignment.id,
            title=assignment.title,
            mode=assignment.mode,
            due_date=assignment.due_date,
            is_published=assignment.is_published,
            session_count=0,  # Skip counting for now
            graded_count=0,
        ))
    
    return summaries


@router.get("/{assignment_id}", response_model=Assignment)
async def get_assignment(
    course_id: str,
    assignment_id: str,
    user: User = Depends(get_current_user),
    db: FirestoreService = Depends(get_firestore_service),
):
    """Get a specific assignment."""
    role = await require_any_role(user, course_id, db)
    
    assignment = await db.get_subcollection_document(
        "courses", course_id, "assignments", assignment_id, Assignment
    )
    
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    # Students can't see unpublished assignments
    if is_student(role) and not assignment.is_published:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    return assignment


@router.patch("/{assignment_id}", response_model=Assignment)
async def update_assignment(
    course_id: str,
    assignment_id: str,
    data: AssignmentUpdate,
    user: User = Depends(get_current_user),
    db: FirestoreService = Depends(get_firestore_service),
):
    """Update an assignment (instructors/admins only)."""
    await require_instructor_or_admin(user, course_id, db)
    
    # Convert Pydantic model to dict, excluding None values
    update_data = {}
    for key, value in data.model_dump().items():
        if value is not None:
            # Convert nested models
            if hasattr(value, "model_dump"):
                update_data[key] = value.model_dump()
            else:
                update_data[key] = value
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No update data provided")
    
    # Get the document path for subcollection
    doc_path = f"courses/{course_id}/assignments"
    success = await db.update_document(doc_path, assignment_id, update_data)
    
    if not success:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    return await db.get_subcollection_document(
        "courses", course_id, "assignments", assignment_id, Assignment
    )


@router.delete("/{assignment_id}")
async def delete_assignment(
    course_id: str,
    assignment_id: str,
    user: User = Depends(get_current_user),
    db: FirestoreService = Depends(get_firestore_service),
):
    """Soft delete an assignment (instructors/admins only)."""
    await require_instructor_or_admin(user, course_id, db)
    
    doc_path = f"courses/{course_id}/assignments"
    success = await db.update_document(doc_path, assignment_id, {
        "is_active": False,
        "updated_at": datetime.utcnow(),
    })
    
    if not success:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    return {"message": "Assignment deleted"}


@router.post("/{assignment_id}/publish")
async def publish_assignment(
    course_id: str,
    assignment_id: str,
    user: User = Depends(get_current_user),
    db: FirestoreService = Depends(get_firestore_service),
):
    """Publish an assignment to make it visible to students."""
    await require_instructor_or_admin(user, course_id, db)
    
    doc_path = f"courses/{course_id}/assignments"
    success = await db.update_document(doc_path, assignment_id, {
        "is_published": True,
        "updated_at": datetime.utcnow(),
    })
    
    if not success:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    return {"message": "Assignment published"}


@router.post("/{assignment_id}/unpublish")
async def unpublish_assignment(
    course_id: str,
    assignment_id: str,
    user: User = Depends(get_current_user),
    db: FirestoreService = Depends(get_firestore_service),
):
    """Unpublish an assignment."""
    await require_instructor_or_admin(user, course_id, db)
    
    doc_path = f"courses/{course_id}/assignments"
    success = await db.update_document(doc_path, assignment_id, {
        "is_published": False,
        "updated_at": datetime.utcnow(),
    })
    
    if not success:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    return {"message": "Assignment unpublished"}
