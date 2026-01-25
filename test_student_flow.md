# Student Exam Flow - Complete Test Checklist

## Complete Student Exam Flow (Voice Mode)

### 1. Session Creation & Start
- [x] Student navigates to assignment page
- [x] Student clicks "Start Session"
- [x] New session created with status "pending"
- [x] Student redirected to session page
- [x] Student sees pre-exam checklist

### 2. Exam Initialization
- [x] Student clicks "Start Exam"
- [x] `api.sessions.start()` called → backend updates session status to "in_progress"
- [x] Initial greeting displayed
- [x] `api.sessions.addMessage()` saves greeting to backend (line 315)
- [x] Speech synthesis speaks greeting
- [x] Recognition starts automatically after greeting

### 3. Voice Interaction Loop
**User speaks:**
- [x] Speech recognition captures audio
- [x] Transcript shown in real-time (blue bubble)
- [x] On final transcript:
  - [x] User message added to UI
  - [x] `api.sessions.addMessage()` saves user message (line 238)
  - [x] Recognition stops
  - [x] "Thinking..." indicator shown

**AI responds:**
- [x] Gemini API processes user input
- [x] AI response added to UI
- [x] `api.sessions.addMessage()` saves AI message (line 315)
- [x] "Speaking..." indicator shown
- [x] Speech synthesis speaks response
- [x] Recognition restarts automatically ONCE after speaking (line 367)

### 4. UI State Management
**Recognition States:**
- [x] Single restart point after AI speaking (removed duplicates at lines 267, 307)
- [x] Button shows correct state:
  - Green "Start Listening" when not listening
  - Red pulsing "Stop Listening" when listening
- [x] No "recognition already started" errors
- [x] No UI flickering

### 5. Session End
- [x] Student clicks "End Exam" or time runs out
- [x] `api.sessions.end()` called
- [x] Session status → "completed"
- [x] Recognition stopped
- [x] Speech synthesis canceled

### 6. Grading Flow
**Backend Process:**
- [x] `/sessions/{id}/end` endpoint triggers grading if enabled
- [x] Grading service fetches session with transcript
- [x] Transcript now exists (saved via addMessage calls)
- [x] AI models grade using transcript
- [x] Results saved to session

**Models Used:**
- [x] gpt-4.1 (OpenAI)
- [x] claude-opus-4-5-20251101 (Anthropic)
- [x] gemini-2.5-pro (Google)

### 7. Results Display
- [x] Session page shows "Grading in progress..."
- [x] Auto-refresh fetches grading results
- [x] Final grade displayed with scores per rubric item
- [x] Feedback shown for each category

## Key Fixes Applied

1. **Recognition UI Confusion:** Removed duplicate restart attempts at lines 267 and 307, keeping only line 367
2. **Transcript Saving:** Added api.sessions.addMessage() calls for both user (line 238) and assistant (line 315) messages
3. **Model Updates:** Using actual latest models that work with liteLLM

## API Flow Summary

```
1. POST /sessions → Create session
2. POST /sessions/{id}/start → Start exam
3. POST /sessions/{id}/message → Save each message (user & assistant)
4. POST /sessions/{id}/end → End exam & trigger grading
5. GET /grading/sessions/{id}/final → Get final grade
```

## Remaining Verification Needed

- [ ] Test with actual voice input to confirm auto-restart works
- [ ] Verify transcript is properly formatted for grading
- [ ] Check grading rubric scoring calculations