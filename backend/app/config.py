"""
Application Configuration
=========================
Centralized settings loaded from environment variables.
"""

from pydantic_settings import BaseSettings
from pydantic import Field
from typing import Optional
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings with environment variable support."""
    
    # API Keys (optional for development)
    openai_api_key: str = Field(default="sk-mock-key-for-dev", env="OPENAI_API_KEY")
    anthropic_api_key: str = Field(default="sk-mock-key-for-dev", env="ANTHROPIC_API_KEY")
    google_api_key: str = Field(default="mock-google-api-key", env="GOOGLE_API_KEY")
    
    # Firebase
    firebase_project_id: str = Field(default="ai-oral-exam")
    firebase_credentials_path: Optional[str] = Field(default=None, env="FIREBASE_CREDENTIALS_PATH")
    
    # Server
    debug: bool = Field(default=True)
    cors_origins: list[str] = Field(default=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:3003",
        "http://localhost:3004",
        "http://localhost:3005",
    ])
    
    # LLM Defaults
    default_grading_models: list[str] = Field(
        default=["gpt-4o", "claude-3-5-sonnet-20241022", "gemini/gemini-1.5-pro"]
    )
    grading_agreement_threshold: float = Field(default=0.8)
    
    # Rate limiting
    max_concurrent_grading_calls: int = Field(default=10)
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
