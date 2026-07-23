"""
Orbit Backend API

FastAPI application providing the backend services for the Orbit electron app.
Includes automatic OpenAPI documentation.
"""

import logging
from pathlib import Path

# Load environment variables from .env file
from dotenv import load_dotenv
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(env_path)

# Configure logging to show INFO level messages
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import api, assistant

# Create FastAPI application with OpenAPI documentation
app = FastAPI(
    title="Orbit API",
    description="""
## Orbit Backend API

This API powers the Orbit electron application.

### Features

* **Health Check** - Monitor backend status
* **OpenAPI Documentation** - Interactive API docs (you're looking at it!)

### Documentation

- **Swagger UI**: Available at `/docs`
- **ReDoc**: Available at `/redoc`
- **OpenAPI JSON**: Available at `/openapi.json`
    """,
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    license_info={
        "name": "MIT",
    },
)

# Configure CORS for Electron renderer
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict this
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(api.router, prefix="/api", tags=["API"])
app.include_router(assistant.router, prefix="/api", tags=["Assistant"])


@app.get("/", tags=["Root"])
async def root():
    """
    Root endpoint returning basic API information.
    
    Returns:
        dict: Basic API information including version and documentation URLs.
    """
    return {
        "name": "Orbit API",
        "version": "1.0.0",
        "documentation": {
            "swagger_ui": "/docs",
            "redoc": "/redoc",
            "openapi_json": "/openapi.json"
        }
    }

