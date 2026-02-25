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

# Load API keys from root .env file
if [ -f ".env" ]; then
    echo "📋 Loading API keys from .env..."
    export $(grep -v '^#' .env | grep -v '^\s*$' | xargs)
else
    echo "❌ Error: .env file not found in project root!"
    echo "Please create a .env file with your API keys"
    exit 1
fi

# Build and deploy backend
echo "📦 Building backend Docker image..."
docker build --platform linux/amd64 -t gcr.io/$PROJECT_ID/ai-oral-exam-backend:latest ./backend

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
    --port 8080 \
    --set-env-vars="OPENAI_API_KEY=${OPENAI_API_KEY},ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY},GOOGLE_API_KEY=${GOOGLE_API_KEY},GEMINI_API_KEY=${GEMINI_API_KEY},ELEVENLABS_API_KEY=${ELEVENLABS_API_KEY},ENCRYPTION_KEY=${ENCRYPTION_KEY}"

# Get backend URL
BACKEND_URL=$(gcloud run services describe ai-oral-exam-backend --region=$REGION --format='value(status.url)')
echo "✅ Backend deployed at: $BACKEND_URL"

# Build and deploy frontend
echo "📦 Building frontend Docker image..."
docker build --platform linux/amd64 -t gcr.io/$PROJECT_ID/ai-oral-exam-frontend:latest ./frontend

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
    --set-env-vars="NEXT_PUBLIC_API_URL=$BACKEND_URL/api"

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
echo "2. API keys have been set as Cloud Run env vars from .env"