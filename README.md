# AI Oral Exam Platform

An AI-powered oral examination and assessment platform with voice conversations and multi-model grading.

## 🚀 Production Deployment

The platform is fully deployed and operational on Google Cloud Platform:

- **Live Application**: https://ai-oral-exam-frontend-254272019109.us-central1.run.app
- **Backend API**: https://ai-oral-exam-backend-254272019109.us-central1.run.app
- **GCP Project**: planar-compass-485504-c0
- **Firebase Project**: ai-oral-exam
- **Last Deployment**: February 3, 2026
  - Frontend: Revision 00005-qjs
  - Backend: Revision 00013-nnn

## Recent Updates

- **Enhanced Voice Experience**: Implemented real-time interim transcripts during voice conversations using browser Speech Recognition API
- **Seamless Transcription**: Interim transcripts now smoothly transition to final transcripts without gaps
- **Improved UI**: Simplified landing page with professional academic design
- **Deployment Fixes**: Resolved CORS configuration issues for reliable deployments

## Features

- **Voice-First Interaction**: Natural voice conversations powered by ElevenLabs Conversational AI
- **Real-time Interim Transcripts**: Live transcription feedback during voice sessions
- **Multi-Model Grading**: Fair assessment using GPT-4, Claude, and Gemini with deliberation rounds
- **Flexible Modes**: Oral exams, practice sessions, AI tutoring, mock interviews, and Socratic discussions
- **Custom Rubrics**: Define grading categories and point scales per assignment
- **Course Management**: Create courses, enroll students, manage assignments

## Tech Stack

### Frontend
- Next.js 14 (App Router)
- React 18
- TypeScript
- Tailwind CSS
- Firebase Auth

### Backend
- FastAPI (Python)
- Firebase Admin SDK
- LiteLLM (unified LLM interface)
- Pydantic v2

### Infrastructure
- Firebase (Auth, Firestore, Storage)
- Google Cloud Platform

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.11+
- Firebase project with Auth and Firestore enabled

### Environment Setup

1. Create a `.env` file in the root directory:

```env
# LLM API Keys
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
GOOGLE_API_KEY=your_google_key

# Firebase (optional - for local service account)
FIREBASE_CREDENTIALS_PATH=path/to/serviceAccountKey.json
```

2. Update Firebase config in `frontend/src/lib/firebase.ts`

### Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run development server
uvicorn app.main:app --reload --port 8000
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev
```

The frontend will be available at http://localhost:3000
The backend API will be available at http://localhost:8000

## 🚀 Deployment to Google Cloud Platform

### Prerequisites
1. Install Google Cloud SDK
2. Create a GCP project
3. Enable Cloud Run and Cloud Build APIs
4. Set up Firebase project with Firestore

### Quick Deploy

Use the provided deployment scripts:

**Full deployment (frontend + backend):**
```bash
./deploy-working.sh
```

**Frontend only deployment:**
```bash
./deploy-frontend.sh
```

This will:
- Build and deploy frontend to Cloud Run
- Build and deploy backend to Cloud Run (if using full deployment)
- Configure environment variables
- Set up proper CORS configuration

### Manual Deployment

1. **Deploy Frontend:**
```bash
cd frontend
gcloud run deploy ai-oral-exam-frontend \
  --source . \
  --region us-central1 \
  --project YOUR-PROJECT-ID \
  --allow-unauthenticated
```

2. **Deploy Backend:**
```bash
cd backend
gcloud run deploy ai-oral-exam-backend \
  --source . \
  --region us-central1 \
  --project YOUR-PROJECT-ID \
  --allow-unauthenticated \
  --set-env-vars="OPENAI_API_KEY=$OPENAI_API_KEY,ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY,GOOGLE_API_KEY=$GOOGLE_API_KEY"
```

3. **Configure Firebase:**
- Add Cloud Run URLs to Firebase authorized domains
- Grant Cloud Run service account Firestore access:
```bash
gcloud projects add-iam-policy-binding FIREBASE-PROJECT \
  --member="serviceAccount:YOUR-SERVICE-ACCOUNT@developer.gserviceaccount.com" \
  --role="roles/datastore.user"
```

## Project Structure

```
AI-oral-exam/
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI entry point
│   │   ├── config.py         # Settings from env
│   │   ├── models/           # Pydantic models
│   │   ├── routers/          # API endpoints
│   │   └── services/         # Business logic
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── app/              # Next.js pages
│   │   ├── components/       # React components
│   │   ├── lib/              # Utilities, hooks, API client
│   │   └── types/            # TypeScript types
│   └── package.json
│
└── prompts/                  # Prompt templates
```

## API Endpoints

### Courses
- `GET /api/courses` - List enrolled courses
- `POST /api/courses` - Create a course
- `GET /api/courses/{id}` - Get course details
- `POST /api/courses/enroll` - Enroll with passcode

### Assignments
- `GET /api/courses/{id}/assignments` - List assignments
- `POST /api/courses/{id}/assignments` - Create assignment
- `GET /api/courses/{id}/assignments/{id}` - Get assignment

### Sessions
- `POST /api/courses/{id}/sessions` - Start session
- `POST /api/courses/{id}/sessions/{id}/start` - Mark started
- `POST /api/courses/{id}/sessions/{id}/message` - Add message
- `POST /api/courses/{id}/sessions/{id}/end` - End session

### Grading
- `POST /api/courses/{id}/grading/grade` - Trigger grading
- `GET /api/courses/{id}/grading/sessions/{id}/final` - Get final grade

## Grading Council

The platform uses a multi-model grading approach:

1. **Round 1 (Independent)**: Each selected LLM grades the session independently
2. **Agreement Check**: Calculate agreement score between models
3. **Round 2 (Deliberation)**: If agreement is below threshold, models see each other's grades and re-grade
4. **Aggregation**: Final scores are calculated as weighted averages

## Future Features

- [ ] Webcam/audio recording (proctoring)
- [ ] Code/document evaluation
- [ ] LMS integration (Canvas, etc.)
- [ ] Analytics dashboard
- [ ] Project check-ins
- [ ] Retention policies

## License

MIT
