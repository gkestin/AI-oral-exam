#!/bin/bash

# AI Oral Exam Platform - GCP Deployment Script
# Project: planar-compass-485504-c0

set -e

PROJECT_ID="planar-compass-485504-c0"
REGION="us-central1"

echo "🚀 Deploying AI Oral Exam Platform to GCP..."
echo "Project ID: $PROJECT_ID"
echo "Region: $REGION"

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI is not installed. Please install it first:"
    echo "https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Set the project
echo "📋 Setting project..."
gcloud config set project $PROJECT_ID

# Enable required APIs
echo "🔧 Enabling required APIs..."
gcloud services enable cloudbuild.googleapis.com \
    run.googleapis.com \
    containerregistry.googleapis.com \
    secretmanager.googleapis.com \
    firebase.googleapis.com \
    firestore.googleapis.com

# Create secrets for sensitive environment variables
echo "🔐 Setting up secrets..."
echo "Please ensure you have the following files ready:"
echo "1. backend/serviceAccountKey.json - Firebase service account key"
echo "2. backend/.env - Environment variables"

read -p "Press Enter to continue once you have these files ready..."

# Upload Firebase service account key as a secret
if [ -f "backend/serviceAccountKey.json" ]; then
    echo "Uploading Firebase service account key..."
    gcloud secrets create firebase-service-account --data-file=backend/serviceAccountKey.json 2>/dev/null || \
    gcloud secrets versions add firebase-service-account --data-file=backend/serviceAccountKey.json
else
    echo "⚠️  Warning: backend/serviceAccountKey.json not found"
fi

# Submit build to Cloud Build
echo "🏗️  Starting Cloud Build..."
gcloud builds submit --config=cloudbuild.yaml

# Get service URLs
echo "✅ Deployment complete!"
echo ""
echo "📱 Your application URLs:"
BACKEND_URL=$(gcloud run services describe ai-oral-exam-backend --region=$REGION --format='value(status.url)')
FRONTEND_URL=$(gcloud run services describe ai-oral-exam-frontend --region=$REGION --format='value(status.url)')

echo "Backend: $BACKEND_URL"
echo "Frontend: $FRONTEND_URL"
echo ""
echo "🎯 Next steps:"
echo "1. Update your Firebase project settings to allow the domain: $FRONTEND_URL"
echo "2. Configure CORS in your Firebase Storage bucket if using file uploads"
echo "3. Set up custom domain if desired"
echo ""
echo "To view logs:"
echo "Backend: gcloud run logs read ai-oral-exam-backend --region=$REGION"
echo "Frontend: gcloud run logs read ai-oral-exam-frontend --region=$REGION"