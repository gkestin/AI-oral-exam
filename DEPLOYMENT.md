# AI Oral Exam Platform - GCP Deployment Guide

## Prerequisites

1. **Google Cloud Account**: Create a GCP account and project
2. **gcloud CLI**: Install the Google Cloud SDK
   ```bash
   # macOS
   brew install google-cloud-sdk

   # Or download from: https://cloud.google.com/sdk/docs/install
   ```

3. **Project Configuration**:
   - Project ID: `planar-compass-485504-c0`
   - Region: `us-central1`

4. **Required Files**:
   - `backend/serviceAccountKey.json` - Firebase Admin SDK service account key
   - `backend/.env` - Backend environment variables

## Environment Variables

### Backend (.env)
```env
# Firebase (if not using serviceAccountKey.json)
FIREBASE_PROJECT_ID=your-firebase-project
FIREBASE_CLIENT_EMAIL=your-service-account-email
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# API Keys
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key
GOOGLE_API_KEY=your-google-api-key
ELEVENLABS_API_KEY=your-elevenlabs-key
DEEPGRAM_API_KEY=your-deepgram-key

# CORS (will be set automatically during deployment)
CORS_ORIGINS=https://your-frontend-url.run.app
```

### Frontend Environment
Create `frontend/.env.production`:
```env
NEXT_PUBLIC_API_URL=https://ai-oral-exam-backend-planar-compass-485504-c0.a.run.app
NEXT_PUBLIC_FIREBASE_CONFIG={"apiKey":"...","authDomain":"...","projectId":"..."}
```

## Quick Deployment

1. **Authenticate with GCP**:
   ```bash
   gcloud auth login
   gcloud config set project planar-compass-485504-c0
   ```

2. **Run the deployment script**:
   ```bash
   ./deploy.sh
   ```

## Manual Deployment Steps

### 1. Enable Required APIs
```bash
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  containerregistry.googleapis.com \
  secretmanager.googleapis.com \
  firebase.googleapis.com \
  firestore.googleapis.com
```

### 2. Build and Deploy Backend
```bash
# Build Docker image
cd backend
gcloud builds submit --tag gcr.io/planar-compass-485504-c0/ai-oral-exam-backend

# Deploy to Cloud Run
gcloud run deploy ai-oral-exam-backend \
  --image gcr.io/planar-compass-485504-c0/ai-oral-exam-backend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars="CORS_ORIGINS=https://ai-oral-exam-frontend-*.run.app" \
  --memory 2Gi \
  --cpu 2 \
  --max-instances 10 \
  --min-instances 1
```

### 3. Build and Deploy Frontend
```bash
# Build Docker image
cd frontend
gcloud builds submit --tag gcr.io/planar-compass-485504-c0/ai-oral-exam-frontend

# Deploy to Cloud Run
gcloud run deploy ai-oral-exam-frontend \
  --image gcr.io/planar-compass-485504-c0/ai-oral-exam-frontend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars="NEXT_PUBLIC_API_URL=https://ai-oral-exam-backend-*.run.app" \
  --memory 1Gi \
  --cpu 1 \
  --max-instances 10 \
  --min-instances 1
```

### 4. Set Up Secrets (Recommended for Production)
```bash
# Create secrets for sensitive data
gcloud secrets create firebase-service-account --data-file=backend/serviceAccountKey.json
gcloud secrets create api-keys --data-file=backend/.env

# Grant Cloud Run access to secrets
gcloud secrets add-iam-policy-binding firebase-service-account \
  --member=serviceAccount:PROJECT-NUMBER-compute@developer.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor

# Mount secrets in Cloud Run (update deployment)
gcloud run services update ai-oral-exam-backend \
  --update-secrets=/app/serviceAccountKey.json=firebase-service-account:latest \
  --update-secrets=/app/.env=api-keys:latest
```

## Post-Deployment Configuration

### 1. Update Firebase Settings
- Go to Firebase Console → Project Settings
- Add your Cloud Run domain to authorized domains:
  - `ai-oral-exam-frontend-*.run.app`
  - Your custom domain (if applicable)

### 2. Configure CORS for Storage
If using Firebase Storage:
```bash
# Create cors.json
echo '[
  {
    "origin": ["https://ai-oral-exam-frontend-*.run.app"],
    "method": ["GET", "POST", "PUT", "DELETE"],
    "maxAgeSeconds": 3600
  }
]' > cors.json

# Apply CORS configuration
gsutil cors set cors.json gs://your-storage-bucket
```

### 3. Set Up Custom Domain (Optional)
```bash
gcloud run domain-mappings create \
  --service ai-oral-exam-frontend \
  --domain your-domain.com \
  --region us-central1
```

## Monitoring and Logs

### View Logs
```bash
# Backend logs
gcloud run logs read ai-oral-exam-backend --region=us-central1

# Frontend logs
gcloud run logs read ai-oral-exam-frontend --region=us-central1
```

### Monitor Performance
- Cloud Console: https://console.cloud.google.com/run
- View metrics: CPU, memory, request count, latency

## CI/CD with Cloud Build

The `cloudbuild.yaml` file is configured for automatic deployments:

1. **Connect GitHub Repository**:
   ```bash
   gcloud builds connect \
     --repository=github_gkestin_ai-oral-exam \
     --region=us-central1
   ```

2. **Create Build Trigger**:
   ```bash
   gcloud builds triggers create github \
     --repo-name=ai-oral-exam \
     --repo-owner=gkestin \
     --branch-pattern="^main$" \
     --build-config=cloudbuild.yaml
   ```

## Troubleshooting

### Common Issues

1. **CORS Errors**:
   - Verify CORS_ORIGINS env variable in backend
   - Check Firebase authorized domains
   - Ensure frontend URL is correctly set

2. **Authentication Issues**:
   - Verify Firebase service account key is valid
   - Check Firebase project configuration in frontend
   - Ensure Firebase Auth is enabled

3. **Build Failures**:
   - Check Cloud Build logs: `gcloud builds list`
   - Verify Docker images build locally
   - Ensure all dependencies are in requirements.txt/package.json

4. **Performance Issues**:
   - Increase memory/CPU allocation
   - Set appropriate min-instances for cold start prevention
   - Use Cloud CDN for static assets

## Cost Optimization

1. **Set Budget Alerts**:
   ```bash
   gcloud billing budgets create \
     --billing-account=YOUR_BILLING_ACCOUNT \
     --display-name="AI Oral Exam Budget" \
     --budget-amount=100 \
     --threshold-rule=percent=90
   ```

2. **Optimize Resources**:
   - Use min-instances=0 for development
   - Implement request caching
   - Use Cloud CDN for frontend assets
   - Set max-instances to prevent runaway scaling

## Security Best Practices

1. **Use Secret Manager** for all sensitive data
2. **Enable Cloud Armor** for DDoS protection
3. **Implement rate limiting** in the application
4. **Regular security scans** with Cloud Security Scanner
5. **Enable audit logs** for compliance

## Support

For issues or questions:
- Check Cloud Run logs for errors
- Review Firebase Console for authentication issues
- Consult GCP documentation: https://cloud.google.com/run/docs