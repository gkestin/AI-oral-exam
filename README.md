# AI Oral Exam Platform

An AI-powered oral examination and assessment platform with voice conversations and multi-model grading.

## Features

- **Voice-First Interaction**: Natural voice conversations powered by Gemini Live API
- **Multi-Model Grading**: Fair assessment using GPT-4, Claude, and Gemini with deliberation rounds
- **Flexible Modes**: Oral exams, practice sessions, AI tutoring, mock interviews, and Socratic discussions
- **Custom Rubrics**: Define grading categories and point scales per assignment
- **Real-time Transcription**: Live transcription during voice sessions
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
