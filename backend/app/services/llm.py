"""
LLM Service
===========
Unified LLM interface using LiteLLM for multi-provider support.
"""

import asyncio
import json
import time
from typing import Optional
import os
import litellm
from pydantic import BaseModel
from tenacity import retry, stop_after_attempt, wait_exponential

from ..config import get_settings
from ..models import CategoryScore, RubricCategory, User
from .key_policy import get_decrypted_user_llm_keys


class LLMResponse(BaseModel):
    """Standardized response from any LLM."""
    content: str
    model: str
    prompt_tokens: int
    completion_tokens: int
    latency_ms: int


class GradingResult(BaseModel):
    """Structured grading result from LLM."""
    scores: list[CategoryScore]
    overall_feedback: str
    confidence: float


def init_llm(user: Optional[User] = None, key_source: Optional[str] = None):
    """Initialize LiteLLM with API keys."""
    settings = get_settings()
    user_keys = get_decrypted_user_llm_keys(user) if (user and key_source == "user_keys") else {}

    if key_source == "user_keys":
        openai_key = user_keys.get("openai")
        anthropic_key = user_keys.get("anthropic")
        google_key = user_keys.get("google")
    else:
        openai_key = settings.openai_api_key
        anthropic_key = settings.anthropic_api_key
        google_key = settings.google_api_key

    # Set API keys for LiteLLM
    litellm.openai_key = openai_key
    litellm.anthropic_key = anthropic_key

    # For Gemini, set both environment variables (LiteLLM might read either)
    if google_key:
        os.environ["GOOGLE_API_KEY"] = google_key
        os.environ["GEMINI_API_KEY"] = google_key
    else:
        os.environ.pop("GOOGLE_API_KEY", None)
        os.environ.pop("GEMINI_API_KEY", None)

    # Enable caching for development
    if settings.debug:
        litellm.cache = litellm.Cache()


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=10),
)
async def call_llm(
    model: str,
    messages: list[dict],
    json_mode: bool = False,
    max_tokens: int = 2000,
    temperature: float = 0.7,
    user: Optional[User] = None,
    key_source: Optional[str] = None,
) -> LLMResponse:
    """Call an LLM with retry logic.

    Args:
        model: Model identifier (e.g., "gpt-4o", "claude-3-5-sonnet-20241022", "gemini/gemini-1.5-pro")
        messages: List of message dicts with "role" and "content"
        json_mode: Whether to request JSON output
        max_tokens: Maximum tokens in response
        temperature: Sampling temperature

    Returns:
        LLMResponse with content and metadata
    """
    init_llm(user=user, key_source=key_source)
    if key_source == "user_keys" and user:
        user_keys = get_decrypted_user_llm_keys(user)
        if model.startswith("gpt") and not user_keys.get("openai"):
            raise ValueError("OpenAI API key is required for selected grading model")
        if "claude" in model and not user_keys.get("anthropic"):
            raise ValueError("Anthropic API key is required for selected grading model")
        if "gemini" in model and not user_keys.get("google"):
            raise ValueError("Google API key is required for selected grading model")

    start_time = time.time()

    # Handle Gemini models - add gemini/ prefix if not present
    if "gemini" in model and not model.startswith("gemini/"):
        model = f"gemini/{model}"

    kwargs = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }

    # For Gemini models, pass the API key directly
    if model.startswith("gemini/"):
        settings = get_settings()
        user_keys = get_decrypted_user_llm_keys(user) if (user and key_source == "user_keys") else {}
        kwargs["api_key"] = user_keys.get("google") if key_source == "user_keys" else settings.google_api_key

    # JSON mode handling varies by provider
    if json_mode:
        if model.startswith("gpt"):
            kwargs["response_format"] = {"type": "json_object"}
        # Claude and Gemini handle JSON via prompt instructions

    response = await litellm.acompletion(**kwargs)
    
    latency_ms = int((time.time() - start_time) * 1000)
    
    return LLMResponse(
        content=response.choices[0].message.content,
        model=model,
        prompt_tokens=response.usage.prompt_tokens,
        completion_tokens=response.usage.completion_tokens,
        latency_ms=latency_ms,
    )


def build_grading_prompt(
    transcript: str,
    rubric: list[RubricCategory],
    round_num: int = 1,
    previous_grades: Optional[list[dict]] = None,
) -> str:
    """Build the grading prompt for an LLM.
    
    Args:
        transcript: The session transcript to grade
        rubric: List of rubric categories
        round_num: 1 for independent grading, 2 for deliberation
        previous_grades: Previous round grades (for round 2)
    
    Returns:
        Formatted prompt string
    """
    rubric_text = "\n".join([
        f"- **{cat.name}** (max {cat.max_points} points, weight {cat.weight}): {cat.description}"
        for cat in rubric
    ])
    
    if round_num == 1:
        prompt = f"""You are an expert grader evaluating a student's oral exam performance.

## Rubric Categories
{rubric_text}

## Student Transcript
{transcript}

## Instructions
Grade the student's performance on each rubric category. For each category:
1. Assign a score from 0 to the max points
2. Quote specific evidence from the transcript
3. Provide brief feedback

Respond ONLY with valid JSON in this exact format:
{{
    "scores": [
        {{
            "category": "Category Name",
            "score": 4,
            "max_score": 5,
            "evidence": "Direct quote from transcript...",
            "feedback": "Brief constructive feedback..."
        }}
    ],
    "overall_feedback": "2-3 sentences summarizing overall performance...",
    "confidence": 0.85
}}

Be fair, constructive, and base scores on evidence from the transcript."""

    else:
        # Round 2: Deliberation with other grades visible
        other_grades_text = "\n".join([
            f"**{g['model']}**: {json.dumps(g['scores'], indent=2)}"
            for g in (previous_grades or [])
        ])
        
        prompt = f"""You are an expert grader in a deliberation round. You've seen other graders' assessments.

## Other Graders' Scores
{other_grades_text}

## Rubric Categories
{rubric_text}

## Student Transcript
{transcript}

## Instructions
Consider the other graders' perspectives. You may adjust your scores if you find their reasoning compelling, but maintain your independent judgment where you believe you are correct.

Respond ONLY with valid JSON in this exact format:
{{
    "scores": [
        {{
            "category": "Category Name",
            "score": 4,
            "max_score": 5,
            "evidence": "Direct quote from transcript...",
            "feedback": "Brief constructive feedback..."
        }}
    ],
    "overall_feedback": "2-3 sentences summarizing overall performance...",
    "confidence": 0.90
}}"""

    return prompt


async def grade_with_model(
    model: str,
    transcript: str,
    rubric: list[RubricCategory],
    round_num: int = 1,
    previous_grades: Optional[list[dict]] = None,
    user: Optional[User] = None,
    key_source: Optional[str] = None,
) -> tuple[GradingResult, LLMResponse]:
    """Grade a transcript with a specific model.
    
    Returns:
        Tuple of (GradingResult, LLMResponse) for scoring and metadata
    """
    prompt = build_grading_prompt(transcript, rubric, round_num, previous_grades)
    
    messages = [
        {"role": "system", "content": "You are an expert educational assessor. Always respond with valid JSON."},
        {"role": "user", "content": prompt},
    ]
    
    response = await call_llm(
        model,
        messages,
        json_mode=True,
        temperature=0.3,
        user=user,
        key_source=key_source,
    )
    
    # Parse the JSON response
    try:
        data = json.loads(response.content)
        
        scores = [
            CategoryScore(
                category=s["category"],
                score=s["score"],
                max_score=s["max_score"],
                evidence=s["evidence"],
                feedback=s["feedback"],
            )
            for s in data["scores"]
        ]
        
        result = GradingResult(
            scores=scores,
            overall_feedback=data["overall_feedback"],
            confidence=data.get("confidence", 0.8),
        )
        
        return result, response
        
    except (json.JSONDecodeError, KeyError) as e:
        raise ValueError(f"Failed to parse grading response from {model}: {e}")


async def grade_with_council(
    transcript: str,
    rubric: list[RubricCategory],
    models: list[str],
    agreement_threshold: float = 0.8,
    user: Optional[User] = None,
    key_source: Optional[str] = None,
) -> dict:
    """Grade with multiple models using two-round deliberation.
    
    Args:
        transcript: Session transcript to grade
        rubric: Rubric categories
        models: List of model IDs to use
        agreement_threshold: Agreement threshold for skipping round 2
    
    Returns:
        Dict with round1_grades, round2_grades (if any), final_grade, metadata
    """
    # Round 1: Independent grading (parallel)
    round1_tasks = [
        grade_with_model(model, transcript, rubric, round_num=1, user=user, key_source=key_source)
        for model in models
    ]
    round1_results = await asyncio.gather(*round1_tasks, return_exceptions=True)
    
    round1_grades = []
    for model, result in zip(models, round1_results):
        if isinstance(result, Exception):
            # Log error but continue with other models
            print(f"Error grading with {model}: {result}")
            continue
        grading_result, llm_response = result
        round1_grades.append({
            "model": model,
            "scores": [s.model_dump() for s in grading_result.scores],
            "overall_feedback": grading_result.overall_feedback,
            "confidence": grading_result.confidence,
            "prompt_tokens": llm_response.prompt_tokens,
            "completion_tokens": llm_response.completion_tokens,
            "latency_ms": llm_response.latency_ms,
        })
    
    if not round1_grades:
        raise ValueError("All grading models failed")
    
    # Check agreement
    agreement = calculate_agreement(round1_grades)
    
    if agreement >= agreement_threshold:
        # Good agreement - use round 1 results
        final_grade = aggregate_grades(round1_grades, rubric)
        return {
            "round1_grades": round1_grades,
            "round2_grades": None,
            "final_grade": final_grade,
            "agreement_score": agreement,
            "rounds_used": 1,
        }
    
    # Round 2: Deliberation
    round2_tasks = [
        grade_with_model(
            model,
            transcript,
            rubric,
            round_num=2,
            previous_grades=round1_grades,
            user=user,
            key_source=key_source,
        )
        for model in models
    ]
    round2_results = await asyncio.gather(*round2_tasks, return_exceptions=True)
    
    round2_grades = []
    for model, result in zip(models, round2_results):
        if isinstance(result, Exception):
            print(f"Error in round 2 with {model}: {result}")
            continue
        grading_result, llm_response = result
        round2_grades.append({
            "model": model,
            "scores": [s.model_dump() for s in grading_result.scores],
            "overall_feedback": grading_result.overall_feedback,
            "confidence": grading_result.confidence,
            "prompt_tokens": llm_response.prompt_tokens,
            "completion_tokens": llm_response.completion_tokens,
            "latency_ms": llm_response.latency_ms,
        })
    
    # Use round 2 if available, otherwise fall back to round 1
    grades_to_use = round2_grades if round2_grades else round1_grades
    final_grade = aggregate_grades(grades_to_use, rubric)
    final_agreement = calculate_agreement(grades_to_use)
    
    return {
        "round1_grades": round1_grades,
        "round2_grades": round2_grades if round2_grades else None,
        "final_grade": final_grade,
        "agreement_score": final_agreement,
        "rounds_used": 2 if round2_grades else 1,
    }


def calculate_agreement(grades: list[dict]) -> float:
    """Calculate agreement score between graders (0-1)."""
    if len(grades) < 2:
        return 1.0
    
    # Get all category scores
    all_scores = {}
    for grade in grades:
        for score in grade["scores"]:
            cat = score["category"]
            if cat not in all_scores:
                all_scores[cat] = []
            # Normalize to 0-1
            all_scores[cat].append(score["score"] / score["max_score"])
    
    # Calculate variance for each category
    variances = []
    for cat, scores in all_scores.items():
        if len(scores) > 1:
            mean = sum(scores) / len(scores)
            variance = sum((s - mean) ** 2 for s in scores) / len(scores)
            variances.append(variance)
    
    if not variances:
        return 1.0
    
    # Convert variance to agreement (lower variance = higher agreement)
    avg_variance = sum(variances) / len(variances)
    agreement = 1.0 - min(avg_variance * 4, 1.0)  # Scale so 0.25 variance = 0 agreement
    
    return max(0.0, agreement)


def aggregate_grades(grades: list[dict], rubric: list[RubricCategory]) -> dict:
    """Aggregate multiple grades into final scores."""
    # Create category lookup
    rubric_lookup = {cat.name: cat for cat in rubric}
    
    # Aggregate scores by category
    aggregated = {}
    for grade in grades:
        for score in grade["scores"]:
            cat = score["category"]
            if cat not in aggregated:
                aggregated[cat] = {
                    "scores": [],
                    "evidence": [],
                    "feedback": [],
                    "max_score": score["max_score"],
                }
            aggregated[cat]["scores"].append(score["score"])
            aggregated[cat]["evidence"].append(score["evidence"])
            aggregated[cat]["feedback"].append(score["feedback"])
    
    # Calculate final scores (weighted average)
    final_scores = []
    total_score = 0
    max_possible = 0
    
    for cat_name, data in aggregated.items():
        avg_score = sum(data["scores"]) / len(data["scores"])
        weight = rubric_lookup.get(cat_name, RubricCategory(name=cat_name, description="", max_points=5, weight=1.0)).weight
        
        final_scores.append({
            "category": cat_name,
            "score": round(avg_score, 2),
            "max_score": data["max_score"],
            "evidence": data["evidence"][0],  # Take first evidence
            "feedback": data["feedback"][0],  # Take first feedback
        })
        
        total_score += avg_score * weight
        max_possible += data["max_score"] * weight
    
    # Aggregate feedback
    all_feedback = [g["overall_feedback"] for g in grades]
    combined_feedback = " ".join(set(all_feedback))  # Dedupe similar feedback
    
    return {
        "scores": final_scores,
        "total_score": round(total_score, 2),
        "max_possible_score": round(max_possible, 2),
        "percentage": round((total_score / max_possible * 100) if max_possible > 0 else 0, 1),
        "overall_feedback": combined_feedback[:500],  # Limit length
    }
