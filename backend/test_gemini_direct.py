#!/usr/bin/env python3
"""Test Gemini API directly."""

import os
from dotenv import load_dotenv
from pathlib import Path

# Load environment variables
parent_dir = Path(__file__).parent.parent
env_file = parent_dir / '.env'
load_dotenv(env_file)

import google.generativeai as genai

# Configure with API key
api_key = os.environ.get('GEMINI_API_KEY') or os.environ.get('GOOGLE_API_KEY')
print(f"Using API key: {api_key[:10]}...")

genai.configure(api_key=api_key)

# List available models
print("\nAvailable Gemini models:")
for model in genai.list_models():
    if 'gemini' in model.name.lower():
        print(f"  - {model.name}")

# Test the model
model = genai.GenerativeModel('gemini-2.5-pro')
response = model.generate_content("Say 'Hello' and nothing else")
print(f"\nDirect API test result: {response.text}")