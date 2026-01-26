#!/bin/bash

# Simple deployment script for AI Oral Exam Platform
# This builds and deploys directly without Cloud Build

set -e

PROJECT_ID="planar-compass-485504-c0"
REGION="us-central1"

echo "🚀 Simple deployment to GCP Cloud Run"
echo "Project: $PROJECT_ID"
echo "Region: $REGION"

# Check prerequisites
if [ ! -f "backend/serviceAccountKey.json" ]; then
    echo "❌ Error: backend/serviceAccountKey.json not found!"
    echo "Please add your Firebase service account key file"
    exit 1
fi

if [ ! -f "backend/.env" ]; then
    echo "⚠️  Warning: backend/.env not found!"
    echo "Creating a basic .env file..."
    cat > backend/.env << EOF
# Add your API keys here
OPENAI_API_KEY=your-key-here
ANTHROPIC_API_KEY=your-key-here
GOOGLE_API_KEY=your-key-here
ELEVENLABS_API_KEY=your-key-here
DEEPGRAM_API_KEY=your-key-here
EOF
fi

# Build and deploy backend
echo "📦 Building backend Docker image..."
docker build -t gcr.io/$PROJECT_ID/ai-oral-exam-backend:latest ./backend

echo "🔄 Pushing backend image to GCR..."
docker push gcr.io/$PROJECT_ID/ai-oral-exam-backend:latest

echo "🚀 Deploying backend to Cloud Run..."
gcloud run deploy ai-oral-exam-backend \
    --image gcr.io/$PROJECT_ID/ai-oral-exam-backend:latest \
    --platform managed \
    --region $REGION \
    --allow-unauthenticated \
    --memory 2Gi \
    --cpu 2 \
    --timeout 60 \
    --max-instances 5 \
    --min-instances 0 \
    --port 8080

# Get backend URL
BACKEND_URL=$(gcloud run services describe ai-oral-exam-backend --region=$REGION --format='value(status.url)')
echo "✅ Backend deployed at: $BACKEND_URL"

# Build and deploy frontend
echo "📦 Building frontend Docker image..."
docker build -t gcr.io/$PROJECT_ID/ai-oral-exam-frontend:latest ./frontend

echo "🔄 Pushing frontend image to GCR..."
docker push gcr.io/$PROJECT_ID/ai-oral-exam-frontend:latest

echo "🚀 Deploying frontend to Cloud Run..."
gcloud run deploy ai-oral-exam-frontend \
    --image gcr.io/$PROJECT_ID/ai-oral-exam-frontend:latest \
    --platform managed \
    --region $REGION \
    --allow-unauthenticated \
    --memory 1Gi \
    --cpu 1 \
    --timeout 60 \
    --max-instances 5 \
    --min-instances 0 \
    --port 3000 \
    --set-env-vars="NEXT_PUBLIC_API_URL=$BACKEND_URL"

# Get frontend URL
FRONTEND_URL=$(gcloud run services describe ai-oral-exam-frontend --region=$REGION --format='value(status.url)')

echo "✅ Deployment complete!"
echo ""
echo "📱 Your application URLs:"
echo "Backend API: $BACKEND_URL"
echo "Frontend App: $FRONTEND_URL"
echo ""
echo "⚠️  Important next steps:"
echo "1. Update Firebase authorized domains with: $FRONTEND_URL"
echo "2. Add environment variables to Cloud Run backend service"
echo "3. Upload Firebase service account key as a secret (recommended)"