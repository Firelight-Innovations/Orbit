"""
Streaming wrapper for the Fi agent.

This module provides streaming capabilities for agent execution,
yielding events as the agent processes requests.
"""

import asyncio
import json
import logging
from dataclasses import dataclass, asdict
from typing import Any, AsyncIterator, Callable

logger = logging.getLogger(__name__)


@dataclass
class StreamEvent:
    """Event emitted during streaming execution.

    The wire shape is documented on the renderer side in
    electron/renderer/src/components/Assistant/agentEvents.ts -- that file and
    this dataclass are two halves of the same contract, so change them together.
    """

    type: str  # "chunk", "tool_start", "tool_end", "thought", "status", "done", "error"
    content: str = ""
    tool_name: str | None = None
    tool_args: dict[str, Any] | None = None
    tool_result: str | None = None
    # Correlates a tool_start with its tool_end. The renderer falls back to
    # "most recent running step with this name" without it, which misattributes
    # results when one turn calls the same tool twice.
    id: str | None = None
    status: str | None = None  # "ok" | "error", on tool_end
    error: str | None = None
    screenshot: str | None = None  # data URI of the marked page image

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary, excluding empty values."""
        result = {"type": self.type}
        if self.content:
            result["content"] = self.content
        if self.tool_name:
            result["tool_name"] = self.tool_name
        if self.tool_args:
            result["tool_args"] = self.tool_args
        if self.tool_result is not None:
            result["tool_result"] = self.tool_result
        if self.id:
            result["id"] = self.id
        if self.status:
            result["status"] = self.status
        if self.error:
            result["error"] = self.error
        if self.screenshot:
            result["screenshot"] = self.screenshot
        return result
    
    def to_sse(self) -> str:
        """Convert to Server-Sent Events format."""
        return f"data: {json.dumps(self.to_dict())}\n\n"


class StreamingAgentWrapper:
    """
    Wraps agent execution to provide streaming events.
    
    This class intercepts tool calls and agent output to emit
    streaming events during execution.
    """
    
    def __init__(self):
        self._tool_callbacks: list[Callable] = []
        self._current_task: asyncio.Task | None = None
    
    def on_tool_call(self, callback: Callable) -> None:
        """Register a callback for tool calls."""
        self._tool_callbacks.append(callback)
    
    async def stream_execution(
        self,
        agent_run_func: Callable,
        message: str,
        mode: str = "agent"
    ) -> AsyncIterator[StreamEvent]:
        """
        Stream agent execution events.
        
        Args:
            agent_run_func: The async function to run the agent
            message: The input message
            mode: The execution mode (ask, agent, plan)
            
        Yields:
            StreamEvent objects as the agent executes
        """
        # Emit start event
        yield StreamEvent(
            type="thinking",
            content=f"Processing in {mode} mode..."
        )
        
        try:
            # For now, we run the agent and emit the result
            # In a more sophisticated implementation, we would hook into
            # the agent's tool execution to emit tool_start/tool_end events
            
            # Create a queue for streaming events
            event_queue: asyncio.Queue[StreamEvent | None] = asyncio.Queue()
            
            async def run_with_events():
                try:
                    result = await agent_run_func(message)
                    
                    # Emit the result in chunks for better UX
                    # Split into paragraphs for natural streaming
                    paragraphs = result.split('\n\n')
                    for i, paragraph in enumerate(paragraphs):
                        if paragraph.strip():
                            await event_queue.put(StreamEvent(
                                type="chunk",
                                content=paragraph + ('\n\n' if i < len(paragraphs) - 1 else '')
                            ))
                            # Small delay between chunks for visual effect
                            await asyncio.sleep(0.05)
                    
                    await event_queue.put(StreamEvent(type="done"))
                    await event_queue.put(None)  # Signal completion
                    
                except Exception as e:
                    logger.error(f"Agent execution error: {e}")
                    await event_queue.put(StreamEvent(
                        type="error",
                        content=str(e)
                    ))
                    await event_queue.put(None)
            
            # Start the agent task
            self._current_task = asyncio.create_task(run_with_events())
            
            # Yield events as they come
            while True:
                event = await event_queue.get()
                if event is None:
                    break
                yield event
                
        except asyncio.CancelledError:
            if self._current_task:
                self._current_task.cancel()
            yield StreamEvent(
                type="error",
                content="Execution cancelled"
            )
        except Exception as e:
            logger.error(f"Streaming error: {e}")
            yield StreamEvent(
                type="error",
                content=str(e)
            )
    
    def cancel(self) -> None:
        """Cancel the current execution."""
        if self._current_task:
            self._current_task.cancel()


class ToolEventEmitter:
    """
    Emits events when tools are called.
    
    This can be integrated with the tool queue to intercept tool calls.
    """
    
    def __init__(self, event_queue: asyncio.Queue):
        self.event_queue = event_queue
    
    async def emit_tool_start(self, tool_name: str, args: dict[str, Any]) -> None:
        """Emit a tool_start event."""
        await self.event_queue.put(StreamEvent(
            type="tool_start",
            tool_name=tool_name,
            tool_args=args
        ))
    
    async def emit_tool_end(self, tool_name: str, result: str) -> None:
        """Emit a tool_end event."""
        await self.event_queue.put(StreamEvent(
            type="tool_end",
            tool_name=tool_name,
            tool_result=result
        ))


async def stream_agent_execution(
    message: str,
    mode: str = "agent",
    conversation_id: str | None = None,
    active_url: str | None = None,
) -> AsyncIterator[StreamEvent]:
    """
    Convenience function to stream agent execution.

    Args:
        message: The input message
        mode: The execution mode
        conversation_id: Client-generated id keying server-side history
        active_url: URL of the foreground tab (for active-page resolution)

    Yields:
        StreamEvent objects
    """
    yield StreamEvent(type="status", content="Thinking")

    try:
        # Use browser agent for agent mode (has tools), simple agent for ask/plan
        if mode == "agent":
            from fi.browser_agent import run_with_tools

            # The agent loop runs to completion before returning its answer, so
            # tool events have to come out sideways: the agent pushes them onto
            # this queue as it goes and we drain it while it works. Awaiting the
            # agent first and replaying afterwards would show every step at once
            # the moment the turn ended, which is not streaming.
            queue: asyncio.Queue[StreamEvent] = asyncio.Queue()

            async def on_event(event: StreamEvent) -> None:
                await queue.put(event)

            task = asyncio.create_task(
                run_with_tools(
                    message,
                    conversation_id=conversation_id,
                    active_url=active_url,
                    on_event=on_event,
                )
            )

            # Drain whatever is queued until the agent finishes. The timeout is
            # what keeps this loop responsive to task completion when the agent
            # is quiet (e.g. a long model call with no tool activity).
            while not task.done():
                try:
                    yield await asyncio.wait_for(queue.get(), timeout=0.1)
                except asyncio.TimeoutError:
                    continue

            # The agent can queue events between its last yield and returning.
            while not queue.empty():
                yield queue.get_nowait()

            result = await task
        else:
            from fi.agent import run as agent_run
            result = await agent_run(message)

        # Stream the result in chunks for better UX
        if result:
            # Split into paragraphs for natural streaming
            paragraphs = result.split('\n\n')
            for i, paragraph in enumerate(paragraphs):
                if paragraph.strip():
                    yield StreamEvent(
                        type="chunk",
                        content=paragraph + ('\n\n' if i < len(paragraphs) - 1 else '')
                    )
                    # Small delay between chunks for visual effect
                    await asyncio.sleep(0.02)
        
        # Signal completion
        yield StreamEvent(type="done")
            
    except ImportError as e:
        logger.error(f"Fi agent import error: {e}")
        yield StreamEvent(
            type="error",
            content=f"Fi agent not available: {e}"
        )
    except Exception as e:
        logger.error(f"Stream execution error: {e}", exc_info=True)
        yield StreamEvent(
            type="error",
            content=str(e)
        )
