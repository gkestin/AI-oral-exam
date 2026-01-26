#!/usr/bin/env python3
"""Test Gemini with LiteLLM directly."""

import os
import asyncio
from dotenv import load_dotenv
from pathlib import Path
import litellm

# Load environment variables
parent_dir = Path(__file__).parent.parent
env_file = parent_dir / '.env'
load_dotenv(env_file)

async def test():
    # Try different ways of setting the API key
    api_key = os.environ.get('GEMINI_API_KEY') or os.environ.get('GOOGLE_API_KEY')
    print(f"API key from env: {api_key[:20]}...")

    # Set it directly for litellm
    os.environ['GEMINI_API_KEY'] = api_key

    # Enable debug mode
    litellm.set_verbose = True

    try:
        response = await litellm.acompletion(
            model="gemini/gemini-2.5-pro",
            messages=[{"role": "user", "content": "Say 'Hello' and nothing else."}],
            api_key=api_key,  # Pass API key directly
            max_tokens=10
        )
        print(f"✅ Success: {response.choices[0].message.content}")
    except Exception as e:
        print(f"❌ Failed: {e}")

        # Try gemini-2.5-flash which we know exists
        print("\nTrying gemini-2.5-flash...")
        try:
            response = await litellm.acompletion(
                model="gemini/gemini-2.5-flash",
                messages=[{"role": "user", "content": "Say 'Hello' and nothing else."}],
                api_key=api_key,
                max_tokens=10
            )
            print(f"✅ gemini-2.5-flash works: {response.choices[0].message.content}")
        except Exception as e2:
            print(f"❌ gemini-2.5-flash also failed: {e2}")

if __name__ == "__main__":
    asyncio.run(test())