"""
Fi Agent - Browser automation agent using LLM.

This module provides a simple agent that can control the browser
and answer questions using an LLM backend (OpenRouter/Anthropic).
"""

import os
import logging
import httpx
from typing import Any

logger = logging.getLogger(__name__)

# Get API configuration from environment
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_MODEL = os.environ.get("OPENROUTER_MODEL", "anthropic/claude-3.5-sonnet")


class FiAgent:
    """
    Simple LLM-based agent for browser automation.
    
    Uses OpenRouter for LLM access and can operate in different modes.
    """
    
    def __init__(
        self,
        model: str = DEFAULT_MODEL,
        api_key: str | None = None,
        system_prompt: str | None = None
    ):
        self.model = model
        self.api_key = api_key or OPENROUTER_API_KEY
        self.system_prompt = system_prompt or self._default_system_prompt()
        self._client: httpx.AsyncClient | None = None
    
    def _default_system_prompt(self) -> str:
        return """You are a helpful AI assistant integrated into a web browser.

You can help users with:
- Answering questions about web pages they're viewing
- Explaining content and providing analysis
- Helping navigate and understand websites
- Providing information and assistance

When given context about the current page (URL, selected text), use it to provide relevant answers.

Be concise but thorough. If you don't know something, say so."""

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=120.0)
        return self._client
    
    async def _call_llm(self, messages: list[dict[str, str]]) -> str:
        """Make a call to the LLM API."""
        logger.info("_call_llm starting...")
        
        if not self.api_key:
            logger.warning("No OpenRouter API key configured")
            return "I'm sorry, but the AI backend is not configured. Please set the OPENROUTER_API_KEY environment variable."
        
        logger.info("Getting HTTP client...")
        client = await self._get_client()
        logger.info("Got client, making API request...")
        
        try:
            response = await client.post(
                f"{OPENROUTER_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://orbit.browser",
                    "X-Title": "Orbit Browser"
                },
                json={
                    "model": self.model,
                    "messages": messages,
                    "max_tokens": 4096,
                    "temperature": 0.7
                }
            )
            
            logger.info(f"Got response with status: {response.status_code}")
            
            if response.status_code != 200:
                error_text = response.text
                logger.error(f"LLM API error: {response.status_code} - {error_text}")
                return f"I encountered an error communicating with the AI service: {response.status_code}"
            
            data = response.json()
            logger.info("Parsed response JSON successfully")
            return data["choices"][0]["message"]["content"]
            
        except httpx.TimeoutException:
            logger.error("LLM API timeout")
            return "The request timed out. Please try again."
        except Exception as e:
            logger.error(f"LLM API error: {e}", exc_info=True)
            return f"I encountered an error: {str(e)}"
    
    async def run(self, task: str) -> str:
        """
        Run the agent with the given task/message.
        
        Args:
            task: The user's message or task
            
        Returns:
            The agent's response
        """
        messages = [
            {"role": "system", "content": self.system_prompt},
            {"role": "user", "content": task}
        ]
        
        return await self._call_llm(messages)
    
    async def close(self) -> None:
        """Clean up resources."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()


# Global agent instance
_agent: FiAgent | None = None


def get_agent() -> FiAgent:
    """Get or create the global agent instance."""
    global _agent
    if _agent is None:
        _agent = FiAgent()
    return _agent


async def run(task: str) -> str:
    """
    Module-level function to run a task.
    
    This is the main entry point for the assistant router.
    
    Args:
        task: The user's message or task
        
    Returns:
        The agent's response
    """
    logger.info(f"fi.agent.run called with task length: {len(task)}")
    try:
        agent = get_agent()
        logger.info("Got agent instance, calling run...")
        result = await agent.run(task)
        logger.info(f"Agent returned result length: {len(result) if result else 0}")
        return result
    except Exception as e:
        logger.error(f"Agent run error: {e}", exc_info=True)
        raise


def register() -> None:
    """Placeholder for compatibility. Does nothing."""
    pass
