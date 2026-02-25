"""
ElevenLabs Service
==================
Backend-side dynamic agent creation to avoid exposing API keys in the client.
"""

from typing import Any
import httpx


ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1"


def _build_agent_prompt(assignment: Any) -> str:
    system_prompt = assignment.system_prompt or (
        "You are an AI examiner conducting an oral examination.\n"
        "Be professional but friendly. Ask follow-up questions to assess understanding.\n"
        "Keep responses concise for natural conversation."
    )

    prompt = system_prompt
    if assignment.instructions:
        prompt += f"\n\nINSTRUCTIONS TO FOLLOW:\n{assignment.instructions}"
    prompt += f"\n\nExam Title: {assignment.title}"
    if assignment.description:
        prompt += f"\nExam Description: {assignment.description}"
    if assignment.knowledge_base and assignment.knowledge_base.text:
        prompt += f"\n\nEXAM QUESTIONS AND ANSWERS:\n{assignment.knowledge_base.text}"
    if assignment.grading and assignment.grading.enabled and assignment.grading.rubric:
        prompt += "\n\nGrading Criteria:"
        for criteria in assignment.grading.rubric:
            prompt += f"\n- {criteria.name}: {criteria.description} (Max Points: {criteria.max_points})"

    if assignment.mode == "mock_interview":
        prompt += "\n\nThis is a MOCK INTERVIEW. Focus on assessing relevant skills and experience."
    elif assignment.mode == "ai_tutor":
        prompt += "\n\nYou are an AI TUTOR. Be helpful and provide hints when needed."
    elif assignment.mode == "socratic":
        prompt += "\n\nUse the SOCRATIC METHOD. Ask probing questions to guide understanding."
    elif assignment.mode == "oral_exam":
        prompt += "\n\nThis is a FORMAL EXAM. Maintain professionalism."

    if assignment.time_limit_minutes:
        prompt += f"\n\nTime Limit: {assignment.time_limit_minutes} minutes."

    return prompt


async def create_dynamic_agent(assignment: Any, api_key: str) -> str:
    eleven_cfg = (assignment.voice_config or {}).get("elevenLabs", {})
    payload = {
        "conversation_config": {
            "agent": {
                "name": f"Exam Agent - {assignment.title}",
                "first_message": assignment.instructions or (
                    f"Hello! I'm your AI examiner for \"{assignment.title}\". "
                    "Let's begin with your identity verification. Please state your full name."
                ),
                "language": eleven_cfg.get("language", "en"),
                "prompt": {
                    "prompt": _build_agent_prompt(assignment),
                    "llm": eleven_cfg.get("llmModel", "gpt-4o"),
                    "temperature": eleven_cfg.get("temperature", 0.7),
                },
            },
            "tts": {
                "model_id": "eleven_turbo_v2",
                "voice_id": eleven_cfg.get("voiceId", "21m00Tcm4TlvDq8ikWAM"),
                "stability": 0.5,
                "similarity_boost": 0.8,
                "speed": 1.0,
            },
            "asr": {
                "quality": "high",
                "provider": "scribe_realtime",
            },
        }
    }

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            f"{ELEVENLABS_API_URL}/convai/agents/create",
            headers={"xi-api-key": api_key, "Content-Type": "application/json"},
            json=payload,
        )
    if response.status_code >= 400:
        raise ValueError(f"Failed to create ElevenLabs agent: {response.status_code} {response.text}")

    data = response.json()
    agent_id = data.get("agent_id")
    if not agent_id:
        raise ValueError("ElevenLabs did not return an agent_id")
    return agent_id
