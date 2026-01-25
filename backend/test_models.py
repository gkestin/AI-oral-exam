#!/usr/bin/env python3
"""Test script to verify AI model names work with liteLLM."""

import asyncio
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
import litellm

# Load environment variables from parent directory
parent_dir = Path(__file__).parent.parent
env_file = parent_dir / '.env'
load_dotenv(env_file)

# Debug: print if we found the env
print(f"Loading .env from: {env_file}")
print(f"File exists: {env_file.exists()}")

async def test_model(model_name: str):
    """Test a single model."""
    print(f"\n Testing {model_name}...")
    try:
        # For Gemini models, use the gemini/ prefix for Google AI Studio
        if "gemini" in model_name:
            actual_model = f"gemini/{model_name}"
        else:
            actual_model = model_name

        print(f"   Using model string: {actual_model}")

        response = await litellm.acompletion(
            model=actual_model,
            messages=[{"role": "user", "content": "Say 'Hello' and nothing else."}],
            max_tokens=10,
            temperature=0.1
        )
        content = response.choices[0].message.content
        print(f"✅ {model_name} works! Response: {content}")
        return True
    except Exception as e:
        print(f"❌ {model_name} failed: {str(e)}")
        return False

async def main():
    """Test all grading models."""
    models = [
        "gpt-4.1",  # Try without the date suffix
        "claude-opus-4-5-20251101",
        "gemini-2.5-pro"
    ]

    print("Testing AI grading models with liteLLM...")
    print(f"OPENAI_API_KEY set: {'OPENAI_API_KEY' in os.environ}")
    print(f"ANTHROPIC_API_KEY set: {'ANTHROPIC_API_KEY' in os.environ}")
    print(f"GEMINI_API_KEY set: {'GEMINI_API_KEY' in os.environ or 'GOOGLE_API_KEY' in os.environ}")

    results = []
    for model in models:
        success = await test_model(model)
        results.append((model, success))

    print("\n" + "="*50)
    print("SUMMARY:")
    for model, success in results:
        status = "✅" if success else "❌"
        print(f"  {status} {model}")

    all_passed = all(success for _, success in results)
    if all_passed:
        print("\n🎉 All models are working!")
    else:
        print("\n⚠️  Some models failed. Check API keys and model names.")

if __name__ == "__main__":
    asyncio.run(main())