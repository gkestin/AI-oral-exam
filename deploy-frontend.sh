#!/bin/bash

# Frontend-only deployment script
set -e

PROJECT_ID="planar-compass-485504-c0"
REGION="us-central1"
BACKEND_URL="https://ai-oral-exam-backend-254272019109.us-central1.run.app"

echo "🚀 Deploying Frontend Only"
echo "========================="
echo ""

cd frontend

# Create production env file
cat > .env.production.local << EOF
NEXT_PUBLIC_API_URL=$BACKEND_URL
NEXT_PUBLIC_FIREBASE_CONFIG={}
EOF

# Deploy frontend
gcloud run deploy ai-oral-exam-frontend \
    --source . \
    --region $REGION \
    --allow-unauthenticated \
    --port 3000 \
    --memory 1Gi \
    --cpu 1 \
    --max-instances 5 \
    --set-env-vars="NEXT_PUBLIC_API_URL=$BACKEND_URL" \
    --project $PROJECT_ID \
    --quiet

if [ $? -eq 0 ]; then
    echo "✅ Frontend deployed successfully!"
    FRONTEND_URL=$(gcloud run services describe ai-oral-exam-frontend \
        --region=$REGION \
        --project=$PROJECT_ID \
        --format='value(status.url)')
    echo "🌐 Frontend URL: $FRONTEND_URL"
else
    echo "❌ Frontend deployment failed"
    exit 1
fi