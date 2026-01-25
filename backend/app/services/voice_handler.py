"""
Gemini Live Voice Handler
==========================
Real-time voice conversation handling using Gemini Live API.
"""

import asyncio
import json
import logging
import base64
from typing import Optional, Dict, Any, List, AsyncGenerator
from datetime import datetime, timezone
import wave
import io
try:
    import numpy as np
    NUMPY_AVAILABLE = True
except ImportError:
    NUMPY_AVAILABLE = False
    np = None

import google.generativeai as genai
try:
    from google.cloud import speech_v1, texttospeech_v1
    GOOGLE_CLOUD_AVAILABLE = True
except ImportError:
    GOOGLE_CLOUD_AVAILABLE = False
    speech_v1 = None
    texttospeech_v1 = None
from fastapi import WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from ..config import get_settings
from ..models import TranscriptMessage, SessionStatus
from .firebase import get_firestore_service

logger = logging.getLogger(__name__)

class VoiceConfig(BaseModel):
    """Voice conversation configuration."""
    language_code: str = "en-US"
    voice_name: str = "en-US-Neural2-F"  # Natural female voice
    speaking_rate: float = 1.0
    pitch: float = 0.0
    volume_gain_db: float = 0.0
    sample_rate: int = 16000
    audio_encoding: str = "LINEAR16"
    enable_interruption: bool = True
    silence_threshold_ms: int = 1000  # Detect end of speech after 1s silence


class GeminiLiveHandler:
    """Handler for Gemini Live voice conversations."""

    def __init__(self):
        settings = get_settings()

        # Check if we're in development mode with mock keys
        self.is_mock = settings.google_api_key == "mock-google-api-key"

        if not self.is_mock:
            # Initialize Gemini with real key
            genai.configure(api_key=settings.google_api_key)

            # Model configuration for Gemini
            self.model = genai.GenerativeModel(
                model_name="gemini-1.5-pro",
                generation_config={
                    "temperature": 0.7,
                    "top_p": 0.95,
                    "max_output_tokens": 500,  # Keep responses concise for voice
                }
            )
        else:
            logger.info("Using mock Gemini model for development")
            self.model = None

        # Initialize Google Cloud Speech and TTS if available
        if GOOGLE_CLOUD_AVAILABLE and not self.is_mock:
            try:
                # Check if credentials are available before initializing clients
                import google.auth
                try:
                    credentials, project = google.auth.default()
                    self.speech_client = speech_v1.SpeechAsyncClient()
                    self.tts_client = texttospeech_v1.TextToSpeechAsyncClient()
                    logger.info("Google Cloud Speech/TTS clients initialized")
                except google.auth.exceptions.DefaultCredentialsError:
                    logger.warning("Google Cloud credentials not found. Using mock mode for development.")
                    self.speech_client = None
                    self.tts_client = None
                    self.is_mock = True
            except Exception as e:
                logger.warning(f"Could not initialize Google Cloud clients: {e}")
                logger.info("Falling back to mock voice services for development")
                self.speech_client = None
                self.tts_client = None
                self.is_mock = True
        else:
            self.speech_client = None
            self.tts_client = None
            if not self.is_mock:
                logger.warning("Google Cloud Speech/TTS not available. Voice features limited.")

        self.active_sessions: Dict[str, Dict] = {}

    async def start_session(
        self,
        session_id: str,
        assignment_context: Dict[str, Any],
        student_context: Dict[str, Any],
        voice_config: Optional[VoiceConfig] = None
    ) -> Dict[str, Any]:
        """Initialize a voice session with context."""

        config = voice_config or VoiceConfig()

        # Build the system prompt with context
        system_prompt = self._build_system_prompt(assignment_context, student_context)

        # Initialize conversation with Gemini or use mock
        if self.model:
            chat = self.model.start_chat(history=[])
        else:
            chat = None  # Mock chat for development

        # Store session state
        self.active_sessions[session_id] = {
            "chat": chat,
            "config": config,
            "assignment": assignment_context,
            "student": student_context,
            "system_prompt": system_prompt,
            "transcript": [],
            "start_time": datetime.now(timezone.utc),
            "audio_buffer": bytearray(),
            "is_processing": False,
            "current_agent": "authentication",  # Start with auth agent
            "agent_state": {}
        }

        # Generate initial greeting
        initial_response = await self._generate_initial_greeting(session_id)

        return {
            "session_id": session_id,
            "status": "active",
            "initial_message": initial_response,
            "config": config.model_dump()
        }

    def _build_system_prompt(
        self,
        assignment: Dict[str, Any],
        student: Dict[str, Any]
    ) -> str:
        """Build comprehensive system prompt for the examiner."""

        prompt = f"""You are an AI oral examiner conducting a voice-based assessment.

STUDENT CONTEXT:
- Name: {student.get('name', 'Student')}
- ID: {student.get('id', 'Unknown')}
- Course: {assignment.get('course_name', 'Unknown Course')}

ASSIGNMENT CONTEXT:
- Title: {assignment.get('title', 'Oral Examination')}
- Type: {assignment.get('type', 'oral_exam')}
- Topics to Cover: {', '.join(assignment.get('topics', ['General knowledge']))}
- Duration Target: {assignment.get('duration_minutes', 15)} minutes

INSTRUCTIONS:
1. You are conducting a 3-phase examination:
   - Phase 1 (Authentication): Verify student identity by asking for their name and student ID
   - Phase 2 (Project Discussion): Ask about their specific project work and decisions
   - Phase 3 (Case Analysis): Present a case and probe their understanding

2. Voice Interaction Guidelines:
   - Keep responses concise (2-3 sentences max)
   - Ask one question at a time
   - Allow for natural pauses
   - If student seems stuck, offer hints or rephrase
   - Be encouraging but maintain academic rigor

3. Assessment Focus:
   - Depth of understanding over memorization
   - Application of concepts
   - Critical thinking
   - Clear articulation of ideas

4. Behavioral Notes:
   - Be professional but approachable
   - Adjust difficulty based on student responses
   - Acknowledge good answers before moving on
   - If detecting stress, offer brief encouragement

Remember: This is a voice conversation. Be natural, clear, and conversational."""

        # Add rubric if provided
        if rubric := assignment.get('rubric'):
            prompt += f"\n\nGRADING RUBRIC:\n{self._format_rubric(rubric)}"

        return prompt

    def _format_rubric(self, rubric: Dict) -> str:
        """Format rubric for prompt."""
        formatted = []
        for category, details in rubric.items():
            formatted.append(f"- {category}: {details.get('description', '')} (Weight: {details.get('weight', 1.0)})")
        return "\n".join(formatted)

    async def _generate_initial_greeting(self, session_id: str) -> str:
        """Generate contextual initial greeting."""
        session = self.active_sessions[session_id]
        student_name = session['student'].get('name', 'there')

        greeting = f"Hello {student_name}! Welcome to your oral examination. I'm your AI examiner today. Before we begin, I need to verify your identity. Could you please state your full name and student ID number?"

        # Add to transcript
        session['transcript'].append(TranscriptMessage(
            role="assistant",
            content=greeting,
            timestamp=datetime.now(timezone.utc)
        ))

        return greeting

    async def process_audio_stream(
        self,
        session_id: str,
        audio_chunk: bytes
    ) -> Optional[Dict[str, Any]]:
        """Process incoming audio chunk and generate response."""

        if session_id not in self.active_sessions:
            return {"error": "Session not found"}

        session = self.active_sessions[session_id]

        # Prevent concurrent processing
        if session['is_processing']:
            return None

        # Add to audio buffer
        session['audio_buffer'].extend(audio_chunk)

        # Check if we have enough audio to process (e.g., 1 second worth)
        config = session['config']
        bytes_per_second = config.sample_rate * 2  # 16-bit = 2 bytes

        if len(session['audio_buffer']) >= bytes_per_second:
            session['is_processing'] = True

            try:
                # Convert audio to text
                transcript = await self._transcribe_audio(
                    bytes(session['audio_buffer']),
                    config
                )

                if transcript:
                    # Clear buffer after successful transcription
                    session['audio_buffer'] = bytearray()

                    # Add to conversation transcript
                    session['transcript'].append(TranscriptMessage(
                        role="user",
                        content=transcript,
                        timestamp=datetime.now(timezone.utc)
                    ))

                    # Generate response based on current agent phase
                    response = await self._generate_agent_response(
                        session_id,
                        transcript
                    )

                    # Add response to transcript
                    session['transcript'].append(TranscriptMessage(
                        role="assistant",
                        content=response['text'],
                        timestamp=datetime.now(timezone.utc)
                    ))

                    # Convert response to speech
                    audio_response = await self._synthesize_speech(
                        response['text'],
                        config
                    )

                    return {
                        "type": "response",
                        "transcript": transcript,
                        "response_text": response['text'],
                        "response_audio": base64.b64encode(audio_response).decode('utf-8'),
                        "agent_phase": response.get('agent_phase'),
                        "phase_complete": response.get('phase_complete', False)
                    }

            except Exception as e:
                logger.error(f"Error processing audio: {e}")
                return {"error": str(e)}
            finally:
                session['is_processing'] = False

        return None

    async def _transcribe_audio(
        self,
        audio_data: bytes,
        config: VoiceConfig
    ) -> Optional[str]:
        """Transcribe audio to text using Google Speech-to-Text."""

        try:
            # Configure recognition
            recognition_config = speech_v1.RecognitionConfig(
                encoding=speech_v1.RecognitionConfig.AudioEncoding.LINEAR16,
                sample_rate_hertz=config.sample_rate,
                language_code=config.language_code,
                enable_automatic_punctuation=True,
                model="latest_long"
            )

            # Create request
            request = speech_v1.RecognizeRequest(
                config=recognition_config,
                audio=speech_v1.RecognitionAudio(content=audio_data)
            )

            # Perform recognition
            response = await self.speech_client.recognize(request=request)

            # Extract transcript
            if response.results:
                transcript = ' '.join(
                    result.alternatives[0].transcript
                    for result in response.results
                )
                return transcript.strip()

            return None

        except Exception as e:
            logger.error(f"Transcription error: {e}")
            return None

    async def _generate_agent_response(
        self,
        session_id: str,
        user_input: str
    ) -> Dict[str, Any]:
        """Generate response based on current agent phase."""

        session = self.active_sessions[session_id]
        current_agent = session['current_agent']
        agent_state = session['agent_state']

        # Route to appropriate agent
        if current_agent == "authentication":
            return await self._authentication_agent(session, user_input, agent_state)
        elif current_agent == "project_discussion":
            return await self._project_discussion_agent(session, user_input, agent_state)
        elif current_agent == "case_analysis":
            return await self._case_analysis_agent(session, user_input, agent_state)
        else:
            return {
                "text": "Thank you for completing the examination. Your responses have been recorded.",
                "agent_phase": "completed",
                "phase_complete": True
            }

    async def _authentication_agent(
        self,
        session: Dict,
        user_input: str,
        state: Dict
    ) -> Dict[str, Any]:
        """Handle authentication phase."""

        # Check if we have both name and ID
        if 'name_verified' not in state:
            # Look for name in input
            expected_name = session['student'].get('name', '').lower()
            if expected_name in user_input.lower():
                state['name_verified'] = True
                return {
                    "text": "Thank you. Now, could you please provide your student ID number?",
                    "agent_phase": "authentication"
                }
            else:
                return {
                    "text": "I didn't catch your full name clearly. Could you please repeat your full name?",
                    "agent_phase": "authentication"
                }

        if 'id_verified' not in state:
            # Look for ID in input
            expected_id = session['student'].get('id', '').lower()
            if expected_id in user_input.lower().replace(' ', ''):
                state['id_verified'] = True
                session['current_agent'] = 'project_discussion'
                session['agent_state'] = {}

                project_name = session['assignment'].get('project_name', 'your project')
                return {
                    "text": f"Perfect, thank you for confirming. Now let's discuss {project_name}. Could you start by giving me a brief overview of what you built and why?",
                    "agent_phase": "project_discussion",
                    "phase_complete": True
                }
            else:
                return {
                    "text": "Could you please repeat your student ID? Make sure to speak clearly.",
                    "agent_phase": "authentication"
                }

        return {
            "text": "Authentication complete. Moving to project discussion.",
            "agent_phase": "authentication",
            "phase_complete": True
        }

    async def _project_discussion_agent(
        self,
        session: Dict,
        user_input: str,
        state: Dict
    ) -> Dict[str, Any]:
        """Handle project discussion phase with adaptive questioning."""

        questions_asked = state.get('questions_asked', 0)
        max_questions = 5

        # Use Gemini to generate contextual follow-up
        chat = session['chat']

        prompt = f"""Based on the student's response about their project: "{user_input}"

        Generate a follow-up question that:
        1. Probes deeper into their technical decisions
        2. Is specific and cannot be answered with yes/no
        3. Tests understanding, not memorization
        4. Is conversational and encouraging

        Keep the question under 40 words."""

        response = await chat.send_message_async(prompt)
        follow_up = response.text.strip()

        state['questions_asked'] = questions_asked + 1

        # Check if we should move to next phase
        if questions_asked >= max_questions - 1:
            session['current_agent'] = 'case_analysis'
            session['agent_state'] = {}
            return {
                "text": follow_up + " And this will be our last question about your project before we move on.",
                "agent_phase": "project_discussion",
                "phase_complete": True
            }

        return {
            "text": follow_up,
            "agent_phase": "project_discussion"
        }

    async def _case_analysis_agent(
        self,
        session: Dict,
        user_input: str,
        state: Dict
    ) -> Dict[str, Any]:
        """Handle case analysis phase."""

        if 'case_presented' not in state:
            # Present a case
            cases = session['assignment'].get('cases', [
                {
                    "title": "Recommendation System",
                    "context": "An e-commerce platform wants to improve their product recommendations."
                }
            ])

            # Select a case (could be random or specific)
            case = cases[0] if cases else {"title": "Default Case", "context": "A company needs to solve a problem."}

            state['case_presented'] = True
            state['current_case'] = case

            case_intro = f"Excellent work on discussing your project. Now let's analyze a case. {case['context']} How would you approach designing a solution for this?"

            return {
                "text": case_intro,
                "agent_phase": "case_analysis"
            }

        questions_asked = state.get('questions_asked', 0)
        max_questions = 4

        # Generate case-specific follow-up
        chat = session['chat']
        case = state['current_case']

        prompt = f"""The student is analyzing this case: "{case['context']}"
        Their response: "{user_input}"

        Generate a follow-up question that:
        1. Tests their analytical thinking
        2. Relates to course concepts
        3. Is practical and specific

        Keep under 40 words."""

        response = await chat.send_message_async(prompt)
        follow_up = response.text.strip()

        state['questions_asked'] = questions_asked + 1

        if questions_asked >= max_questions - 1:
            session['current_agent'] = 'completed'
            return {
                "text": "That's a thoughtful analysis. We've completed the examination. Thank you for your responses, and good luck!",
                "agent_phase": "completed",
                "phase_complete": True
            }

        return {
            "text": follow_up,
            "agent_phase": "case_analysis"
        }

    async def _synthesize_speech(
        self,
        text: str,
        config: VoiceConfig
    ) -> bytes:
        """Convert text to speech using Google Text-to-Speech."""

        try:
            # Configure voice
            voice = texttospeech_v1.VoiceSelectionParams(
                language_code=config.language_code,
                name=config.voice_name
            )

            # Configure audio
            audio_config = texttospeech_v1.AudioConfig(
                audio_encoding=texttospeech_v1.AudioEncoding.LINEAR16,
                speaking_rate=config.speaking_rate,
                pitch=config.pitch,
                volume_gain_db=config.volume_gain_db,
                sample_rate_hertz=config.sample_rate
            )

            # Create synthesis request
            synthesis_input = texttospeech_v1.SynthesisInput(text=text)

            request = texttospeech_v1.SynthesizeSpeechRequest(
                input=synthesis_input,
                voice=voice,
                audio_config=audio_config
            )

            # Perform synthesis
            response = await self.tts_client.synthesize_speech(request=request)

            return response.audio_content

        except Exception as e:
            logger.error(f"Speech synthesis error: {e}")
            # Return empty audio on error
            return b''

    async def end_session(self, session_id: str) -> Dict[str, Any]:
        """End a voice session and clean up."""

        if session_id not in self.active_sessions:
            return {"error": "Session not found"}

        session = self.active_sessions[session_id]

        # Calculate duration
        duration = (datetime.now(timezone.utc) - session['start_time']).total_seconds()

        # Prepare final data
        result = {
            "session_id": session_id,
            "duration_seconds": int(duration),
            "transcript": [msg.model_dump(mode='json') for msg in session['transcript']],
            "final_agent": session['current_agent'],
            "completed": session['current_agent'] == 'completed'
        }

        # Clean up
        del self.active_sessions[session_id]

        return result

    async def handle_websocket_connection(
        self,
        websocket: WebSocket,
        session_id: str,
        course_id: str,
        assignment_id: str,
        student_id: str
    ):
        """Handle WebSocket connection for real-time voice streaming."""

        # WebSocket is already accepted in the router, don't accept again

        try:
            # Check if in dev mode with mock user
            if student_id == 'dev-user-001' or self.is_mock:
                # Use mock data for development
                assignment_context = {
                    "title": "AI Oral Examination - Development Mode",
                    "type": "oral_exam",
                    "topics": ["Introduction", "Project Overview", "Technical Implementation", "Challenges", "Future Work"],
                    "duration_minutes": 15,
                    "course_name": "CS101 - Development",
                    "project_name": "Development Project",
                    "cases": ["Case Study 1", "Case Study 2"]
                }

                student_context = {
                    "name": "Development User",
                    "id": "dev-user-001",
                    "email": "dev@example.com"
                }
            else:
                # Get assignment and student context
                db = get_firestore_service()

                # Fetch assignment details
                from ..models import Assignment
                assignment = await db.get_subcollection_document(
                    "courses", course_id, "assignments", assignment_id, Assignment
                )

                if not assignment:
                    await websocket.send_json({"error": "Assignment not found"})
                    return

                # Fetch student details
                from ..models import User
                student = await db.get_document("users", student_id, User)

                if not student:
                    await websocket.send_json({"error": "Student not found"})
                    return

                # Prepare contexts
                assignment_context = {
                    "title": assignment.title,
                    "type": assignment.type,
                    "topics": assignment.prompt.split('\n')[:5],  # Extract main topics
                    "duration_minutes": assignment.duration_minutes,
                    "course_name": course_id,  # Could fetch actual course name
                    "project_name": "your capstone project",  # Could be dynamic
                    "cases": []  # Could load from assignment
                }

                student_context = {
                    "name": student.display_name,
                    "id": student.id,
                    "email": student.email
                }

            # Initialize voice session
            session_info = await self.start_session(
                session_id,
                assignment_context,
                student_context
            )

            # Send initial greeting
            await websocket.send_json({
                "type": "greeting",
                "text": session_info['initial_message'],
                "audio": base64.b64encode(
                    await self._synthesize_speech(
                        session_info['initial_message'],
                        VoiceConfig()
                    )
                ).decode('utf-8')
            })

            # Handle incoming messages
            while True:
                data = await websocket.receive()

                if data['type'] == 'websocket.disconnect':
                    break

                if data['type'] == 'websocket.receive':
                    message = json.loads(data['text']) if 'text' in data else None

                    if message:
                        if message.get('type') == 'audio':
                            # Decode base64 audio
                            audio_data = base64.b64decode(message['data'])

                            # Process audio
                            result = await self.process_audio_stream(
                                session_id,
                                audio_data
                            )

                            if result:
                                await websocket.send_json(result)

                        elif message.get('type') == 'end_session':
                            # End session
                            final_data = await self.end_session(session_id)
                            await websocket.send_json({
                                "type": "session_ended",
                                "data": final_data
                            })
                            break

        except WebSocketDisconnect:
            logger.info(f"WebSocket disconnected for session {session_id}")
        except Exception as e:
            logger.error(f"WebSocket error: {e}")
            await websocket.send_json({"error": str(e)})
        finally:
            # Clean up session if still active
            if session_id in self.active_sessions:
                await self.end_session(session_id)


# Singleton instance
_voice_handler: Optional[GeminiLiveHandler] = None

def get_voice_handler() -> GeminiLiveHandler:
    """Get or create voice handler instance."""
    global _voice_handler
    if _voice_handler is None:
        _voice_handler = GeminiLiveHandler()
    return _voice_handler