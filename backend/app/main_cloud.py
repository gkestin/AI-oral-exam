"""Cloud Run compatible main application."""
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(title="AI Oral Exam API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"status": "healthy", "service": "AI Oral Exam Backend"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}

# Import routes only if Firebase is configured
try:
    from .main import app as full_app
    app = full_app
    print("✅ Full application loaded with Firebase")
except Exception as e:
    print(f"⚠️ Running in limited mode: {e}")
    print("Add Firebase credentials to enable full functionality")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
