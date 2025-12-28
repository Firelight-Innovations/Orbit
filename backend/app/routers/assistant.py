"""Assistant chat endpoints for Orbit."""

from __future__ import annotations

from time import perf_counter

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

try:
    # Lazy import so startup does not fail if fi deps are heavy
    from fi import agent as fi_agent  # type: ignore
except Exception as import_error:  # pragma: no cover - import guard
    fi_agent = None  # type: ignore
    _import_error = import_error
else:
    _import_error = None


router = APIRouter()


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


class ChatResponse(BaseModel):
    """Response payload from the assistant."""

    response: str = Field(..., description="Natural language reply from the agent")
    took_ms: int | None = Field(
        default=None, description="Processing time in milliseconds"
    )
    error: str | None = Field(default=None, description="Error message, if any")


@router.post(
    "/assistant/chat",
    response_model=ChatResponse,
    summary="Chat with the assistant",
    description=(
        "Proxy a user message to the Fi agent. The Fi agent can control the browser "
        "via Playwright and return a textual response."
    ),
)
async def chat(request: ChatRequest) -> ChatResponse:
    """Send a message to the Fi agent and return its reply."""
    if _import_error is not None or fi_agent is None:
        raise HTTPException(
            status_code=500,
            detail=f"Assistant unavailable: {_import_error or 'Fi agent not loaded'}",
        )

    start = perf_counter()

    # Add lightweight context into the prompt for better responses.
    context_parts: list[str] = []
    if request.page_context:
        if request.page_context.url:
            context_parts.append(f"Active URL: {request.page_context.url}")
        if request.page_context.selected_text:
            context_parts.append(
                f"Selected text: {request.page_context.selected_text}"
            )

    augmented_message = request.message
    if context_parts:
        augmented_message = (
            f"{request.message}\n\nContext:\n" + "\n".join(context_parts)
        )

    try:
        reply = await fi_agent.run(augmented_message)
        took_ms = int((perf_counter() - start) * 1000)
        return ChatResponse(response=reply, took_ms=took_ms)
    except Exception as exc:  # pragma: no cover - runtime safety
        raise HTTPException(
            status_code=500, detail=f"Assistant error: {exc}"
        ) from exc

