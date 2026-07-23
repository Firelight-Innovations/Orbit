"""Assistant chat endpoints for Orbit."""

from __future__ import annotations

import asyncio
import logging
from time import perf_counter
from typing import Literal

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

# Browser instance management
from src.core import registry
from fi.browser.instance import BrowserInstance

logger = logging.getLogger(__name__)

router = APIRouter()

# Global browser instance
_browser_instance: BrowserInstance | None = None
_connection_lock = asyncio.Lock()


class PageContext(BaseModel):
    """Lightweight context about the current page."""

    url: str | None = Field(default=None, description="Active tab URL if available")
    selected_text: str | None = Field(
        default=None, description="User-selected text on the page"
    )


class ChatRequest(BaseModel):
    """Request payload for assistant chat."""

    message: str = Field(..., min_length=1, max_length=4000)
    page_context: PageContext | None = None
    mode: Literal["ask", "agent", "plan"] = Field(
        default="ask",
        description="Chat mode: ask (Q&A only), agent (browser control), plan (show steps first)"
    )
    conversation_id: str | None = Field(
        default=None,
        description="Client-generated id keying server-side conversation history"
    )


class ChatResponse(BaseModel):
    """Response payload from the assistant."""

    response: str = Field(..., description="Natural language reply from the agent")
    took_ms: int | None = Field(
        default=None, description="Processing time in milliseconds"
    )
    error: str | None = Field(default=None, description="Error message, if any")


class ConnectionRequest(BaseModel):
    """Request to connect to browser via CDP."""
    
    port: int = Field(default=9222, description="CDP port to connect to")


class ConnectionResponse(BaseModel):
    """Response from connection attempt."""
    
    connected: bool
    page_url: str | None = None
    error: str | None = None


async def ensure_browser_connection(port: int = 9222) -> BrowserInstance:
    """
    Ensure we have an active browser connection via CDP.
    
    Returns the connected BrowserInstance.
    """
    global _browser_instance
    
    async with _connection_lock:
        # Check if we already have a valid connection
        if _browser_instance is not None:
            if await _browser_instance.validate_cdp_connection():
                return _browser_instance
            else:
                # Connection is stale, clean up
                logger.info("Existing CDP connection is stale, reconnecting...")
                try:
                    await _browser_instance.disconnect()
                except Exception:
                    pass
                _browser_instance = None
        
        # Create new connection
        _browser_instance = BrowserInstance()
        await _browser_instance.connect_via_cdp(port=port)
        
        # Register in the global registry for tools to access
        registry.set("browser_instance", _browser_instance)
        
        return _browser_instance


async def get_browser() -> BrowserInstance | None:
    """Get the current browser instance if connected."""
    global _browser_instance
    if _browser_instance and await _browser_instance.validate_cdp_connection():
        return _browser_instance
    return None


@router.post(
    "/assistant/connect",
    response_model=ConnectionResponse,
    summary="Connect to browser via CDP",
    description="Establish a connection to the Electron browser via Chrome DevTools Protocol.",
)
async def connect(request: ConnectionRequest = ConnectionRequest()) -> ConnectionResponse:
    """Connect to the browser via CDP."""
    try:
        browser = await ensure_browser_connection(request.port)
        page_url = browser.page.url if browser.page else None
        return ConnectionResponse(connected=True, page_url=page_url)
    except Exception as e:
        logger.error(f"Failed to connect to browser: {e}")
        return ConnectionResponse(connected=False, error=str(e))


@router.post(
    "/assistant/disconnect",
    response_model=ConnectionResponse,
    summary="Disconnect from browser",
    description="Disconnect from the browser (leaves browser running).",
)
async def disconnect() -> ConnectionResponse:
    """Disconnect from the browser."""
    global _browser_instance
    
    async with _connection_lock:
        if _browser_instance:
            try:
                await _browser_instance.disconnect()
            except Exception as e:
                logger.warning(f"Error during disconnect: {e}")
            finally:
                _browser_instance = None
                registry.delete("browser_instance")
        
        return ConnectionResponse(connected=False)


@router.get(
    "/assistant/status",
    summary="Get connection status",
    description="Check if we're connected to the browser.",
)
async def status() -> ConnectionResponse:
    """Get current connection status."""
    browser = await get_browser()
    if browser:
        return ConnectionResponse(
            connected=True,
            page_url=browser.page.url if browser.page else None
        )
    return ConnectionResponse(connected=False)


def _build_context_prompt(request: ChatRequest) -> str:
    """Build the augmented message with context."""
    context_parts: list[str] = []
    
    if request.page_context:
        if request.page_context.url:
            context_parts.append(f"Active URL: {request.page_context.url}")
        if request.page_context.selected_text:
            context_parts.append(
                f"Selected text: {request.page_context.selected_text}"
            )
    
    if context_parts:
        return f"{request.message}\n\nContext:\n" + "\n".join(context_parts)
    
    return request.message


async def _run_ask_mode(message: str) -> str:
    """
    Run in ask mode - Q&A only, no browser actions.
    
    Uses a simple LLM call with page context but no browser tools.
    """
    from fi.modes import augment_message_for_mode
    
    try:
        from fi import agent as fi_agent
        augmented = augment_message_for_mode(message, "ask")
        return await fi_agent.run(augmented)
    except ImportError:
        # Fallback: return a helpful message about the context
        return f"I can help answer questions about the current page. Based on the context provided: {message}"
    except Exception as e:
        logger.error(f"Ask mode error: {e}")
        return f"I encountered an error while processing your question: {e}"


async def _run_agent_mode(message: str) -> str:
    """
    Run in agent mode - full browser control.
    
    Ensures browser connection and runs agent with all browser tools.
    """
    from fi.modes import augment_message_for_mode
    
    # Ensure we're connected
    try:
        await ensure_browser_connection()
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=f"Cannot connect to browser: {e}"
        )
    
    try:
        from fi import agent as fi_agent
        augmented = augment_message_for_mode(message, "agent")
        return await fi_agent.run(augmented)
    except ImportError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Fi agent not available: {e}"
        )


async def _run_plan_mode(message: str) -> str:
    """
    Run in plan mode - generate plan without executing.
    
    Creates a step-by-step plan for the task.
    """
    from fi.modes import augment_message_for_mode
    
    try:
        from fi import agent as fi_agent
        augmented = augment_message_for_mode(message, "plan")
        return await fi_agent.run(augmented)
    except ImportError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Fi agent not available: {e}"
        )


@router.post(
    "/assistant/chat",
    response_model=ChatResponse,
    summary="Chat with the assistant",
    description=(
        "Send a message to the assistant. Behavior depends on mode:\n"
        "- ask: Q&A only, no browser actions\n"
        "- agent: Full browser control\n"
        "- plan: Generate plan without executing"
    ),
)
async def chat(request: ChatRequest) -> ChatResponse:
    """Send a message to the assistant based on the selected mode."""
    start = perf_counter()
    
    # Build context-augmented message
    augmented_message = _build_context_prompt(request)
    
    try:
        # Route to appropriate mode handler
        if request.mode == "ask":
            reply = await _run_ask_mode(augmented_message)
        elif request.mode == "agent":
            reply = await _run_agent_mode(augmented_message)
        elif request.mode == "plan":
            reply = await _run_plan_mode(augmented_message)
        else:
            reply = await _run_ask_mode(augmented_message)
        
        took_ms = int((perf_counter() - start) * 1000)
        return ChatResponse(response=reply, took_ms=took_ms)
        
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Assistant error: {exc}")
        raise HTTPException(
            status_code=500,
            detail=f"Assistant error: {exc}"
        ) from exc


@router.post(
    "/assistant/chat/stream",
    summary="Chat with streaming response",
    description=(
        "Send a message to the assistant and receive streaming responses via SSE.\n"
        "Events are sent as Server-Sent Events with the following types:\n"
        "- thinking: Agent is processing\n"
        "- chunk: Partial response content\n"
        "- tool_start: Tool execution starting\n"
        "- tool_end: Tool execution completed\n"
        "- done: Response complete\n"
        "- error: An error occurred"
    ),
)
async def chat_stream(request: ChatRequest) -> StreamingResponse:
    """Stream assistant responses via Server-Sent Events."""
    from fi.streaming import stream_agent_execution, StreamEvent

    # Build context-augmented message
    augmented_message = _build_context_prompt(request)
    active_url = request.page_context.url if request.page_context else None
    
    # Note: CDP connection for agent mode is handled separately via the Connect button.
    # The browser tools aren't wired up yet, so we skip automatic connection here.
    # When tools are implemented, uncomment the CDP connection logic.
    # 
    # if request.mode == "agent":
    #     try:
    #         await ensure_browser_connection()
    #     except Exception as e:
    #         error_msg = str(e)
    #         async def error_stream(msg: str):
    #             yield StreamEvent(type="error", content=f"Cannot connect to browser: {msg}").to_sse()
    #         return StreamingResponse(error_stream(error_msg), media_type="text/event-stream", ...)
    
    async def event_generator():
        """Generate SSE events from agent execution."""
        try:
            async for event in stream_agent_execution(
                augmented_message,
                request.mode,
                conversation_id=request.conversation_id,
                active_url=active_url,
            ):
                yield event.to_sse()
        except Exception as e:
            logger.error(f"Streaming error: {e}")
            yield StreamEvent(
                type="error",
                content=str(e)
            ).to_sse()
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        }
    )

