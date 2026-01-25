"""
AI Oral Exam - Backend API
==========================
FastAPI application entry point.
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import time

from .config import get_settings
from .services.firebase import init_firebase
from .routers import (
    courses_router,
    assignments_router,
    sessions_router,
    grading_router,
    voice_router,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler for startup/shutdown."""
    # Startup
    print("🚀 Starting AI Oral Exam API...")
    init_firebase()
    print("✅ Firebase initialized")
    
    yield
    
    # Shutdown
    print("👋 Shutting down...")


# Create FastAPI app
app = FastAPI(
    title="AI Oral Exam API",
    description="Backend API for the AI-powered oral exam platform",
    version="1.0.0",
    lifespan=lifespan,
)

# Configure CORS
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request timing middleware
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = str(process_time)
    return response


# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Handle uncaught exceptions."""
    print(f"Unhandled error: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal error occurred", "error": str(exc)},
    )


# Include routers
app.include_router(courses_router, prefix="/api")
app.include_router(assignments_router, prefix="/api")
app.include_router(sessions_router, prefix="/api")
app.include_router(grading_router, prefix="/api")

# WebSocket router (no /api prefix for WebSocket)
app.include_router(voice_router)


# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "version": "1.0.0",
    }


# Root endpoint
@app.get("/")
async def root():
    """Root endpoint with API info."""
    return {
        "name": "AI Oral Exam API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
    }


# API info endpoint
@app.get("/api")
async def api_info():
    """API information endpoint."""
    return {
        "endpoints": {
            "courses": "/api/courses",
            "assignments": "/api/courses/{course_id}/assignments",
            "sessions": "/api/courses/{course_id}/sessions",
            "grading": "/api/courses/{course_id}/grading",
        },
        "authentication": "Bearer token (Firebase ID token)",
    }
