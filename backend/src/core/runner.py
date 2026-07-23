"""
Agent runner for the Fi agent.

This module provides the OptimizedRunner class that executes agent workflows.
"""

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any, AsyncIterator

logger = logging.getLogger(__name__)


@dataclass
class RunConfig:
    """Configuration for an agent run."""
    workflow_name: str = "default"
    max_iterations: int = 50
    timeout_seconds: float = 300.0


@dataclass
class RunOutput:
    """Output from an agent run."""
    final_output: str = ""
    iterations: int = 0
    success: bool = True
    error: str | None = None
    tool_calls: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class StreamEvent:
    """Event emitted during streaming execution."""
    type: str  # "chunk", "tool_start", "tool_end", "done", "error"
    content: str = ""
    tool_name: str | None = None
    tool_args: dict[str, Any] | None = None
    tool_result: str | None = None


class OptimizedRunner:
    """
    Runner for executing agent workflows.
    
    This is a compatibility layer that wraps the underlying agent framework.
    """
    
    def __init__(self):
        self._lock = asyncio.Lock()
    
    async def run(
        self,
        starting_agent: Any,
        input: str,
        run_config: RunConfig | None = None
    ) -> RunOutput:
        """
        Run an agent to completion.
        
        Args:
            starting_agent: The agent to run
            input: The input/task string
            run_config: Optional run configuration
            
        Returns:
            RunOutput with the agent's final response
        """
        config = run_config or RunConfig()
        
        async with self._lock:
            try:
                logger.info(f"Starting agent run: {config.workflow_name}")
                
                # The agent should have a run method that takes the input
                # For now, we'll try to call the underlying agent framework
                if hasattr(starting_agent, 'run'):
                    result = await starting_agent.run(input)
                    return RunOutput(
                        final_output=str(result),
                        success=True
                    )
                elif hasattr(starting_agent, '__call__'):
                    result = await starting_agent(input)
                    return RunOutput(
                        final_output=str(result),
                        success=True
                    )
                else:
                    return RunOutput(
                        final_output="",
                        success=False,
                        error="Agent does not have a run method"
                    )
                    
            except asyncio.TimeoutError:
                logger.error(f"Agent run timed out after {config.timeout_seconds}s")
                return RunOutput(
                    final_output="",
                    success=False,
                    error=f"Timeout after {config.timeout_seconds} seconds"
                )
            except Exception as e:
                logger.error(f"Agent run failed: {e}")
                return RunOutput(
                    final_output="",
                    success=False,
                    error=str(e)
                )
    
    async def run_stream(
        self,
        starting_agent: Any,
        input: str,
        run_config: RunConfig | None = None
    ) -> AsyncIterator[StreamEvent]:
        """
        Run an agent with streaming output.
        
        Args:
            starting_agent: The agent to run
            input: The input/task string
            run_config: Optional run configuration
            
        Yields:
            StreamEvent objects as the agent executes
        """
        config = run_config or RunConfig()
        
        try:
            logger.info(f"Starting streaming agent run: {config.workflow_name}")
            
            # Check if agent supports streaming
            if hasattr(starting_agent, 'run_stream'):
                async for event in starting_agent.run_stream(input):
                    yield StreamEvent(
                        type="chunk",
                        content=str(event)
                    )
            else:
                # Fall back to non-streaming execution
                result = await self.run(starting_agent, input, run_config)
                
                if result.success:
                    # Emit the result as a single chunk
                    yield StreamEvent(
                        type="chunk",
                        content=result.final_output
                    )
                else:
                    yield StreamEvent(
                        type="error",
                        content=result.error or "Unknown error"
                    )
            
            yield StreamEvent(type="done")
            
        except Exception as e:
            logger.error(f"Streaming agent run failed: {e}")
            yield StreamEvent(
                type="error",
                content=str(e)
            )
