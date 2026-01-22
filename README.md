# AI Oral Exam System

A scalable, AI-powered oral examination system inspired by ["Fighting Fire with Fire"](https://www.behind-the-enemy-lines.com/2025/12/fighting-fire-with-fire-scalable-oral.html) by Professor Panos Ipeirotis (NYU Stern).

## Overview

This system enables educators to conduct personalized oral exams at scale using:
- **Voice AI Agent**: Conducts real-time conversational exams with students
- **Council of LLMs**: Multi-model grading system (Claude, GPT-4, Gemini) for consistent, fair assessment
- **Firebase Backend**: Authentication, database, and storage
- **Admin Dashboard**: Manage students, view transcripts, and review grades

## Features

- 🎤 **Voice-based oral exams** via browser (no phone needed)
- 🎯 **Personalized questions** based on student projects and course materials
- 🤖 **Multi-LLM grading** with consultation rounds for consistency
- 📹 **Webcam recording** for proctoring/audit trail
- 📊 **Analytics** to identify teaching gaps
- 💰 **Cost-effective**: ~$0.40-0.50 per student exam

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | Next.js, React, TypeScript, Tailwind CSS |
| Backend | Python, FastAPI |
| Database | Firebase Firestore |
| Auth | Firebase Authentication (Email + Google) |
| Storage | Firebase Storage (recordings) |
| Voice | Pipecat / Gemini Live API |
| LLMs | OpenAI GPT-4, Anthropic Claude, Google Gemini |
| Grading | LiteLLM (unified API) |

## Project Structure

```
AI-oral-exam/
├── frontend/                 # Next.js web application
│   └── src/
│       ├── app/             # Next.js app router
│       ├── components/      # React components
│       └── lib/             # Firebase config, utilities
├── backend/                  # Python FastAPI server
│   └── app/
│       ├── routers/         # API endpoints
│       ├── services/        # Business logic (grading, voice)
│       └── models/          # Pydantic schemas
├── prompts/                  # LLM prompt templates
├── docs/                     # Documentation
├── .env.example             # Environment variables template
└── README.md
```

## Setup

### Prerequisites

- Node.js 18+
- Python 3.10+
- Firebase project with Firestore and Authentication enabled

### Environment Variables

Copy `.env.example` to `.env` and fill in your API keys:

```bash
cp .env.example .env
```

Required keys:
- `OPENAI_API_KEY` - For GPT-4 grading
- `ANTHROPIC_API_KEY` - For Claude grading
- `GOOGLE_API_KEY` - For Gemini grading + voice

### Installation

```bash
# Frontend
cd frontend
npm install

# Backend
cd backend
pip install -r requirements.txt
```

### Running Locally

```bash
# Terminal 1: Frontend
cd frontend
npm run dev

# Terminal 2: Backend
cd backend
uvicorn app.main:app --reload
```

## Configuration

Firebase is pre-configured for this project. The Firestore database and Authentication (Email + Google Sign-in) are already set up.

## License

MIT

## Acknowledgments

- [Panos Ipeirotis](https://www.behind-the-enemy-lines.com/) for the original "Fighting Fire with Fire" concept
- [Brian Jabarian](https://brianjabarian.org/) for AI interview research
- [Andrej Karpathy](https://github.com/karpathy/llm-council) for the "Council of LLMs" approach
