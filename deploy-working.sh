#!/bin/bash

# AI Oral Exam Platform - Working GCP Deployment Script
# This script uses source-based deployment which is simpler and more reliable

set -e

PROJECT_ID="planar-compass-485504-c0"
REGION="us-central1"

echo "🚀 AI Oral Exam Platform - GCP Cloud Run Deployment"
echo "=================================================="
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo ""

# Function to check command status
check_status() {
    if [ $? -eq 0 ]; then
        echo "✅ $1 successful"
    else
        echo "❌ $1 failed"
        exit 1
    fi
}

# Step 1: Deploy Frontend (simpler, no secrets needed)
echo "📦 Step 1: Deploying Frontend..."
echo "This will build and deploy the Next.js application"
echo ""

cd frontend

# Create a production env file for the frontend
echo "Creating production environment file..."
cat > .env.production.local << EOF
NEXT_PUBLIC_API_URL=https://ai-oral-exam-backend-${REGION}-${PROJECT_ID}.cloudfunctions.net
NEXT_PUBLIC_FIREBASE_CONFIG={}
EOF

# Deploy frontend using source-based deployment
gcloud run deploy ai-oral-exam-frontend \
    --source . \
    --region $REGION \
    --allow-unauthenticated \
    --port 3000 \
    --memory 1Gi \
    --cpu 1 \
    --max-instances 5 \
    --project $PROJECT_ID \
    --quiet

check_status "Frontend deployment"

# Get frontend URL
FRONTEND_URL=$(gcloud run services describe ai-oral-exam-frontend \
    --region=$REGION \
    --project=$PROJECT_ID \
    --format='value(status.url)')

echo "✅ Frontend deployed at: $FRONTEND_URL"
echo ""

# Step 2: Prepare Backend for Deployment
echo "📦 Step 2: Preparing Backend..."
cd ../backend

# Create a .gcloudignore file to exclude unnecessary files
cat > .gcloudignore << EOF
.gcloudignore
.git
.gitignore
__pycache__/
*.pyc
*.pyo
*.pyd
.Python
env/
venv/
.venv/
pip-log.txt
.coverage
.pytest_cache
.mypy_cache
test_*.py
tests/
*.md
EOF

# Create a simplified main.py that handles missing credentials gracefully
cat > app/main_cloud.py << 'EOF'
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
EOF

# Step 3: Deploy Backend
echo "📦 Step 3: Deploying Backend..."
echo "Note: Backend will start in limited mode without Firebase credentials"
echo ""

# Deploy backend using source-based deployment
gcloud run deploy ai-oral-exam-backend \
    --source . \
    --region $REGION \
    --allow-unauthenticated \
    --port 8080 \
    --memory 2Gi \
    --cpu 2 \
    --max-instances 5 \
    --set-env-vars="CORS_ORIGINS=$FRONTEND_URL" \
    --project $PROJECT_ID \
    --quiet

check_status "Backend deployment"

# Get backend URL
BACKEND_URL=$(gcloud run services describe ai-oral-exam-backend \
    --region=$REGION \
    --project=$PROJECT_ID \
    --format='value(status.url)')

echo "✅ Backend deployed at: $BACKEND_URL"
echo ""

# Step 4: Update Frontend with Backend URL
echo "📦 Step 4: Updating Frontend with Backend URL..."
cd ../frontend

# Update the environment file with the actual backend URL
cat > .env.production.local << EOF
NEXT_PUBLIC_API_URL=$BACKEND_URL
NEXT_PUBLIC_FIREBASE_CONFIG={}
EOF

# Redeploy frontend with correct backend URL
gcloud run deploy ai-oral-exam-frontend \
    --source . \
    --region $REGION \
    --allow-unauthenticated \
    --port 3000 \
    --memory 1Gi \
    --set-env-vars="NEXT_PUBLIC_API_URL=$BACKEND_URL" \
    --project $PROJECT_ID \
    --quiet

check_status "Frontend update"

# Final Summary
echo ""
echo "=========================================="
echo "✅ DEPLOYMENT COMPLETE!"
echo "=========================================="
echo ""
echo "🌐 Your application is live at:"
echo "   Frontend: $FRONTEND_URL"
echo "   Backend API: $BACKEND_URL"
echo ""
echo "📝 Next Steps:"
echo "1. Add Firebase credentials to the backend:"
echo "   - Go to Cloud Console > Cloud Run > ai-oral-exam-backend"
echo "   - Click 'Edit & Deploy New Revision'"
echo "   - Add environment variables or mount secrets"
echo ""
echo "2. Update Firebase authorized domains:"
echo "   - Add $FRONTEND_URL to Firebase Console > Authentication > Settings"
echo ""
echo "3. Test the deployment:"
echo "   - Visit $FRONTEND_URL"
echo "   - Check $BACKEND_URL/health for API status"
echo ""
echo "📊 View logs:"
echo "   gcloud run logs read ai-oral-exam-frontend --region=$REGION"
echo "   gcloud run logs read ai-oral-exam-backend --region=$REGION"
echo ""
echo "🔄 To redeploy, simply run this script again!"