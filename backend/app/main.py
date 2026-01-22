"""
AI Oral Exam - Backend API
==========================
FastAPI server for managing oral exams, grading, and data.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="AI Oral Exam API",
    description="Backend API for the AI-powered oral examination system",
    version="0.1.0",
)

# CORS configuration - allow frontend to communicate with backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # Next.js dev server
        "https://ai-oral-exam.web.app",  # Firebase hosting (if used)
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """Health check endpoint."""
    return {"status": "ok", "message": "AI Oral Exam API is running"}


@app.get("/health")
async def health_check():
    """Detailed health check."""
    return {
        "status": "healthy",
        "version": "0.1.0",
        "services": {
            "api": "ok",
            "firebase": "not_configured",  # Will be updated when Firebase is connected
            "llm": "not_configured",  # Will be updated when LLM is connected
        }
    }


# TODO: Add routers
# from .routers import students, exams, grading
# app.include_router(students.router, prefix="/api/students", tags=["Students"])
# app.include_router(exams.router, prefix="/api/exams", tags=["Exams"])
# app.include_router(grading.router, prefix="/api/grading", tags=["Grading"])
