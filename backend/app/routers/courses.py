"""
Courses Router
==============
CRUD operations for courses and enrollments.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
import secrets
from datetime import datetime
import time
import logging

logger = logging.getLogger(__name__)

from ..models import (
    Course, CourseCreate, CourseUpdate, CourseWithRole,
    Enrollment, EnrollmentCreate, UserRole, User,
)
from ..services import (
    get_current_user, get_firestore_service, FirestoreService,
    require_instructor_or_admin, get_user_role_in_course,
)

router = APIRouter(prefix="/courses", tags=["courses"])


def generate_passcode(length: int = 6) -> str:
    """Generate a random alphanumeric passcode."""
    return secrets.token_urlsafe(length)[:length].upper()


@router.post("", response_model=Course)
async def create_course(
    data: CourseCreate,
    user: User = Depends(get_current_user),
    db: FirestoreService = Depends(get_firestore_service),
):
    """Create a new course. Creator becomes the owner and instructor."""
    # Generate passcodes if not provided
    instructor_passcode = data.instructor_passcode or generate_passcode()
    student_passcode = data.student_passcode or generate_passcode()
    
    course = Course(
        name=data.name,
        description=data.description,
        owner_id=user.id,
        instructor_passcode=instructor_passcode,
        student_passcode=student_passcode,
        defaults=data.defaults or Course.model_fields["defaults"].default,
    )
    
    # Create course document
    course_id = await db.create_document("courses", course)
    course.id = course_id
    
    # Enroll creator as instructor
    enrollment = Enrollment(
        user_id=user.id,
        course_id=course_id,
        role=UserRole.INSTRUCTOR,
    )
    await db.create_subcollection_document(
        "courses", course_id, "enrollments", enrollment
    )
    
    return course


@router.get("", response_model=list[CourseWithRole])
async def list_my_courses(
    user: User = Depends(get_current_user),
    db: FirestoreService = Depends(get_firestore_service),
):
    """List all courses the current user is enrolled in."""
    start_time = time.time()
    logger.info(f"[COURSES] Starting list_my_courses for user {user.id}")

    # Get all active courses first
    fetch_start = time.time()
    all_courses = await db.list_documents("courses", Course, filters=[("is_active", "==", True)])
    logger.info(f"[COURSES] Fetched {len(all_courses)} active courses in {time.time() - fetch_start:.3f}s")

    # For each course, check enrollment in parallel (batched approach)
    enrollment_check_start = time.time()
    result = []
    for course in all_courses:
        # Quick check: query this specific course's enrollments for this user
        enrollments = await db.list_subcollection(
            parent_collection="courses",
            parent_id=course.id,
            subcollection="enrollments",
            model_class=Enrollment,
            filters=[("user_id", "==", user.id)],
            limit=1,
        )

        if enrollments:
            result.append(CourseWithRole(
                course=course,
                role=enrollments[0].role,
                enrolled_at=enrollments[0].created_at or datetime.utcnow(),
            ))

    logger.info(f"[COURSES] Checked enrollments for {len(result)} courses in {time.time() - enrollment_check_start:.3f}s")

    total_time = time.time() - start_time
    logger.info(f"[COURSES] Total time: {total_time:.3f}s - returned {len(result)} enrolled courses")
    return result


@router.get("/{course_id}", response_model=Course)
async def get_course(
    course_id: str,
    user: User = Depends(get_current_user),
    db: FirestoreService = Depends(get_firestore_service),
):
    """Get a specific course (must be enrolled)."""
    # Verify enrollment
    role = await get_user_role_in_course(user.id, course_id, db)
    if not role:
        raise HTTPException(status_code=403, detail="Not enrolled in this course")
    
    course = await db.get_document("courses", course_id, Course)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    # Hide passcodes for students
    role_value = role.value if hasattr(role, 'value') else role
    if role_value == "student":
        course.instructor_passcode = "***"
    
    return course


@router.patch("/{course_id}", response_model=Course)
async def update_course(
    course_id: str,
    data: CourseUpdate,
    user: User = Depends(get_current_user),
    db: FirestoreService = Depends(get_firestore_service),
):
    """Update a course (instructors/admins only)."""
    await require_instructor_or_admin(user, course_id, db)
    
    update_data = data.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No update data provided")
    
    success = await db.update_document("courses", course_id, update_data)
    if not success:
        raise HTTPException(status_code=404, detail="Course not found")
    
    return await db.get_document("courses", course_id, Course)


@router.delete("/{course_id}")
async def delete_course(
    course_id: str,
    user: User = Depends(get_current_user),
    db: FirestoreService = Depends(get_firestore_service),
):
    """Archive a course (owner only)."""
    course = await db.get_document("courses", course_id, Course)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    if course.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Only the course owner can delete")
    
    # Soft delete by archiving
    await db.update_document("courses", course_id, {
        "is_active": False,
        "archived_at": datetime.utcnow(),
    })
    
    return {"message": "Course archived successfully"}


# ==================== ENROLLMENT ====================

@router.post("/enroll", response_model=Enrollment)
async def enroll_in_course(
    data: EnrollmentCreate,
    user: User = Depends(get_current_user),
    db: FirestoreService = Depends(get_firestore_service),
):
    """Enroll in a course using a passcode."""
    course = await db.get_document("courses", data.course_id, Course)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    if not course.is_active:
        raise HTTPException(status_code=400, detail="Course is archived")
    
    # Check passcode and determine role
    if data.passcode == course.instructor_passcode:
        role = UserRole.INSTRUCTOR
    elif data.passcode == course.student_passcode:
        role = UserRole.STUDENT
    else:
        raise HTTPException(status_code=403, detail="Invalid passcode")
    
    # Check if already enrolled
    existing_role = await get_user_role_in_course(user.id, data.course_id, db)
    if existing_role:
        raise HTTPException(
            status_code=400, 
            detail=f"Already enrolled as {existing_role.value}"
        )
    
    # Create enrollment
    enrollment = Enrollment(
        user_id=user.id,
        course_id=data.course_id,
        role=role,
    )
    enrollment_id = await db.create_subcollection_document(
        "courses", data.course_id, "enrollments", enrollment
    )
    enrollment.id = enrollment_id
    
    return enrollment


@router.get("/{course_id}/enrollments", response_model=list[Enrollment])
async def list_enrollments(
    course_id: str,
    role: Optional[UserRole] = Query(None),
    user: User = Depends(get_current_user),
    db: FirestoreService = Depends(get_firestore_service),
):
    """List enrollments in a course (instructors/admins only)."""
    await require_instructor_or_admin(user, course_id, db)
    
    filters = []
    if role:
        filters.append(("role", "==", role.value))
    
    enrollments = await db.list_subcollection(
        "courses", course_id, "enrollments", Enrollment,
        filters=filters if filters else None,
    )
    
    return enrollments


@router.delete("/{course_id}/enrollments/{user_id}")
async def remove_enrollment(
    course_id: str,
    user_id: str,
    user: User = Depends(get_current_user),
    db: FirestoreService = Depends(get_firestore_service),
):
    """Remove a user from a course (instructors/admins, or self)."""
    # Check permissions
    if user_id != user.id:
        await require_instructor_or_admin(user, course_id, db)
    
    # Find and delete enrollment
    enrollments = await db.list_subcollection(
        "courses", course_id, "enrollments", Enrollment,
        filters=[("user_id", "==", user_id)],
        limit=1,
    )
    
    if not enrollments:
        raise HTTPException(status_code=404, detail="Enrollment not found")
    
    # Can't remove the owner
    course = await db.get_document("courses", course_id, Course)
    if user_id == course.owner_id:
        raise HTTPException(status_code=400, detail="Cannot remove course owner")
    
    # Delete from subcollection
    await db.delete_document(
        f"courses/{course_id}/enrollments",
        enrollments[0].id,
    )
    
    return {"message": "Enrollment removed"}
