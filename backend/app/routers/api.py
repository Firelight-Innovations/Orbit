"""
API Router

Contains the main API endpoints for the Orbit application.
"""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

router = APIRouter()


class HealthResponse(BaseModel):
    """Health check response model."""
    
    status: str = Field(
        description="Current status of the API",
        examples=["healthy"]
    )
    message: str = Field(
        description="Human-readable status message",
        examples=["Orbit backend is running"]
    )
    version: str = Field(
        description="API version",
        examples=["1.0.0"]
    )
    docs_url: str = Field(
        description="URL to the API documentation",
        examples=["/docs"]
    )
    timestamp: str = Field(
        description="Current server timestamp in ISO format",
        examples=["2024-01-15T10:30:00.000Z"]
    )


class EchoRequest(BaseModel):
    """Echo request model."""
    
    message: str = Field(
        description="Message to echo back",
        min_length=1,
        max_length=1000,
        examples=["Hello, Orbit!"]
    )


class EchoResponse(BaseModel):
    """Echo response model."""
    
    original: str = Field(
        description="The original message that was sent"
    )
    echoed: str = Field(
        description="The echoed message (same as original)"
    )
    length: int = Field(
        description="Length of the message in characters"
    )
    timestamp: str = Field(
        description="Timestamp when the echo was processed"
    )


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Health Check",
    description="Check the health status of the Orbit backend API.",
    responses={
        200: {
            "description": "Backend is healthy and operational",
            "content": {
                "application/json": {
                    "example": {
                        "status": "healthy",
                        "message": "Orbit backend is running",
                        "version": "1.0.0",
                        "docs_url": "/docs",
                        "timestamp": "2024-01-15T10:30:00.000Z"
                    }
                }
            }
        }
    }
)
async def health_check() -> HealthResponse:
    """
    Perform a health check on the backend.
    
    This endpoint is used by the Electron frontend to verify
    that the Python backend is running and responsive.
    
    Returns:
        HealthResponse: Current health status of the API.
    """
    return HealthResponse(
        status="healthy",
        message="Orbit backend is running",
        version="1.0.0",
        docs_url="/docs",
        timestamp=datetime.utcnow().isoformat() + "Z"
    )


@router.post(
    "/echo",
    response_model=EchoResponse,
    summary="Echo Message",
    description="Echo back a message. Useful for testing the API connection.",
    responses={
        200: {
            "description": "Message successfully echoed",
            "content": {
                "application/json": {
                    "example": {
                        "original": "Hello, Orbit!",
                        "echoed": "Hello, Orbit!",
                        "length": 13,
                        "timestamp": "2024-01-15T10:30:00.000Z"
                    }
                }
            }
        },
        422: {
            "description": "Validation error (e.g., message too long or empty)"
        }
    }
)
async def echo(request: EchoRequest) -> EchoResponse:
    """
    Echo back a message.
    
    This endpoint receives a message and echoes it back along with
    additional metadata. Useful for testing the connection between
    the Electron frontend and Python backend.
    
    Args:
        request: The echo request containing the message to echo.
        
    Returns:
        EchoResponse: The echoed message with metadata.
    """
    return EchoResponse(
        original=request.message,
        echoed=request.message,
        length=len(request.message),
        timestamp=datetime.utcnow().isoformat() + "Z"
    )


@router.get(
    "/info",
    summary="API Information",
    description="Get detailed information about the API.",
    responses={
        200: {
            "description": "API information retrieved successfully"
        }
    }
)
async def api_info(
    include_endpoints: Annotated[
        bool,
        Query(description="Whether to include the list of available endpoints")
    ] = False
) -> dict:
    """
    Get information about the API.
    
    Returns detailed information about the Orbit backend API,
    including version, available endpoints, and capabilities.
    
    Args:
        include_endpoints: If True, includes a list of available endpoints.
        
    Returns:
        dict: API information.
    """
    info = {
        "name": "Orbit Backend API",
        "version": "1.0.0",
        "description": "Backend services for the Orbit electron application",
        "python_powered": True,
        "framework": "FastAPI",
        "documentation": {
            "swagger": "/docs",
            "redoc": "/redoc",
            "openapi_spec": "/openapi.json"
        }
    }
    
    if include_endpoints:
        info["endpoints"] = [
            {"path": "/api/health", "method": "GET", "description": "Health check"},
            {"path": "/api/echo", "method": "POST", "description": "Echo message"},
            {"path": "/api/info", "method": "GET", "description": "API information"}
        ]
    
    return info

