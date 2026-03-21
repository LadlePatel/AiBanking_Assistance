"""
Centralized LLM Configuration Module

This module provides a unified interface for initializing LLM instances.
It supports both OpenAI and local LLM providers through environment variables.
"""

import os
from langchain_openai import ChatOpenAI
from typing import Optional


def get_llm(
    model: Optional[str] = None,
    temperature: Optional[float] = None,
    **kwargs
) -> ChatOpenAI:
    """
    Get an LLM instance based on environment configuration.
    
    Args:
        model: Override the model name from env vars
        temperature: Override the temperature from env vars
        **kwargs: Additional arguments to pass to ChatOpenAI
    
    Returns:
        ChatOpenAI instance configured for the selected provider
    
    Environment Variables:
        LLM_PROVIDER: "openai" or "local" (default: "openai")
        LLM_MODEL: Model name (default: "gpt-4o-mini")
        LOCAL_LLM_BASE_URL: Base URL for local LLM (required when LLM_PROVIDER=local)
        LOCAL_LLM_API_KEY: API key for local LLM (default: "not-needed")
        LOCAL_LLM_TEMPERATURE: Default temperature for local LLM
    """
    provider = os.getenv("LLM_PROVIDER", "openai").lower()
    
    # Determine model
    if model is None:
        model = os.getenv("LLM_MODEL", "gpt-4o-mini")
    
    # Determine temperature
    if temperature is None and "LOCAL_LLM_TEMPERATURE" in os.environ:
        try:
            temperature = float(os.getenv("LOCAL_LLM_TEMPERATURE"))
        except (ValueError, TypeError):
            temperature = None
    
    if provider == "local":
        # Local LLM configuration
        base_url = os.getenv("LOCAL_LLM_BASE_URL")
        if not base_url:
            raise ValueError(
                "LOCAL_LLM_BASE_URL must be set when LLM_PROVIDER=local. "
                "Example: http://localhost:1234/v1"
            )
        
        api_key = os.getenv("LOCAL_LLM_API_KEY", "not-needed")
        
        # Build kwargs for local LLM
        llm_kwargs = {
            "model": model,
            "base_url": base_url,
            "api_key": api_key,
            **kwargs
        }
        
        if temperature is not None:
            llm_kwargs["temperature"] = temperature
        
        print(f"[LLM CONFIG] Using local LLM: {base_url} with model: {model}")
        return ChatOpenAI(**llm_kwargs)
    
    else:
        # OpenAI configuration
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError(
                "OPENAI_API_KEY must be set when LLM_PROVIDER=openai"
            )
        
        # Build kwargs for OpenAI
        llm_kwargs = {
            "model": model,
            "api_key": api_key,
            **kwargs
        }
        
        if temperature is not None:
            llm_kwargs["temperature"] = temperature
        
        print(f"[LLM CONFIG] Using OpenAI with model: {model}")
        return ChatOpenAI(**llm_kwargs)


def get_provider_info() -> dict:
    """
    Get information about the current LLM provider configuration.
    
    Returns:
        Dictionary with provider information
    """
    provider = os.getenv("LLM_PROVIDER", "openai").lower()
    model = os.getenv("LLM_MODEL", "gpt-4o-mini")
    
    info = {
        "provider": provider,
        "model": model
    }
    
    if provider == "local":
        info["base_url"] = os.getenv("LOCAL_LLM_BASE_URL", "Not configured")
    
    return info
