"""
Voice Session Router
=====================
WebSocket endpoints for real-time voice conversations.
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException
from typing import Optional
import json
import logging

from ..models import User, Session, SessionStatus
from ..services import get_current_user_websocket, get_firestore_service, FirestoreService
from datetime import datetime, timezone
from ..services.voice_handler import get_voice_handler
from ..services.key_policy import increment_trial_usage_if_needed

router = APIRouter(prefix="/ws", tags=["voice"])
logger = logging.getLogger(__name__)


@router.websocket("/voice/{course_id}/{session_id}")
async def voice_session_websocket(
    websocket: WebSocket,
    course_id: str,
    session_id: str,
):
    """WebSocket endpoint for real-time voice conversation."""

    voice_handler = get_voice_handler()
    db = get_firestore_service()

    try:
        await websocket.accept()

        # Authenticate via first message (should contain auth token)
        auth_message = await websocket.receive_json()

        if not auth_message.get('token'):
            await websocket.send_json({"error": "Authentication required"})
            await websocket.close()
            return

        # Verify token and get user
        from ..services.auth import verify_token
        import os

        # Development mode: Accept mock token
        if auth_message['token'] == 'dev-mock-token' and os.getenv('ENV', 'development') == 'development':
            user_id = 'dev-user-001'
            logger.info("Using development mock authentication")
        else:
            try:
                user_data = await verify_token(auth_message['token'])
                user_id = user_data['uid']
            except Exception as e:
                await websocket.send_json({"error": "Invalid token"})
                await websocket.close()
                return

        # Get session from database
        session = await db.get_subcollection_document(
            "courses", course_id, "sessions", session_id, Session
        )

        # In dev mode, create a mock session if not found
        if not session and user_id == 'dev-user-001':
            session = Session(
                id=session_id,
                course_id=course_id,
                assignment_id="mock-assignment-001",
                student_id=user_id,
                status=SessionStatus.PENDING,
                created_at=datetime.now(timezone.utc),
            )
            logger.info("Using mock session for development")
        elif not session:
            await websocket.send_json({"error": "Session not found"})
            await websocket.close()
            return

        # Verify session belongs to user (skip in dev mode)
        if session.student_id != user_id and user_id != 'dev-user-001':
            await websocket.send_json({"error": "Not authorized"})
            await websocket.close()
            return

        # Update session status to in_progress (skip for dev mode)
        if user_id != 'dev-user-001':
            await db.update_document(
                f"courses/{course_id}/sessions",
                session_id,
                {
                    "status": SessionStatus.IN_PROGRESS.value,
                    "started_at": datetime.now(timezone.utc)
                }
            )
        else:
            logger.info("Skipping database update in development mode")

        # Handle voice conversation
        await voice_handler.handle_websocket_connection(
            websocket,
            session_id,
            course_id,
            session.assignment_id,
            user_id
        )

    except WebSocketDisconnect:
        logger.info(f"Client disconnected from session {session_id}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        try:
            await websocket.send_json({"error": str(e)})
        except:
            pass
    finally:
        # Update session status to completed if it was in progress
        try:
            current_session = await db.get_subcollection_document(
                "courses", course_id, "sessions", session_id, Session
            )

            if current_session and current_session.status == SessionStatus.IN_PROGRESS:
                ended_at = datetime.now(timezone.utc)
                duration = None

                if current_session.started_at:
                    started = current_session.started_at
                    if started.tzinfo is None:
                        started = started.replace(tzinfo=timezone.utc)
                    duration = int((ended_at - started).total_seconds())

                await db.update_document(
                    f"courses/{course_id}/sessions",
                    session_id,
                    {
                        "status": SessionStatus.COMPLETED.value,
                        "ended_at": ended_at,
                        "duration_seconds": duration
                    }
                )
                refreshed = await db.get_subcollection_document(
                    "courses", course_id, "sessions", session_id, Session
                )
                if refreshed:
                    await increment_trial_usage_if_needed(db, refreshed)
        except Exception as e:
            logger.error(f"Failed to update session status: {e}")


@router.websocket("/voice/test")
async def voice_test_websocket(websocket: WebSocket):
    """Test WebSocket endpoint for voice functionality."""

    await websocket.accept()

    try:
        await websocket.send_json({
            "type": "connected",
            "message": "Voice WebSocket test endpoint connected"
        })

        while True:
            data = await websocket.receive_json()

            # Echo back with type
            response = {
                "type": "echo",
                "received": data,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }

            await websocket.send_json(response)

            if data.get('type') == 'close':
                break

    except WebSocketDisconnect:
        logger.info("Test client disconnected")
    except Exception as e:
        logger.error(f"Test WebSocket error: {e}")
        await websocket.send_json({"error": str(e)})