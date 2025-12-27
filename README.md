# Orbit

An Electron application with a Python (FastAPI) backend, featuring a custom title bar and Chrome-like detachable tabs.

## Features

- **Custom Title Bar** - Frameless window with draggable title bar and window controls
- **Chrome-like Tabs** - Multiple tabs with drag-to-reorder and detach-to-new-window support
- **Python Backend** - FastAPI powers the backend with automatic OpenAPI documentation
- **Modern UI** - Dark theme with smooth animations and responsive design

## Project Structure

```
Orbit/
├── electron/
│   ├── main/           # Electron main process
│   │   ├── index.ts    # App entry, window management
│   │   ├── ipc.ts      # IPC handlers
│   │   └── python.ts   # Python backend spawner
│   ├── preload/        # Preload scripts
│   └── renderer/       # React frontend
│       └── src/
│           ├── components/
│           │   ├── TitleBar/   # Custom title bar
│           │   └── Tabs/       # Tab system
│           └── styles/
├── backend/            # Python FastAPI backend
│   ├── app/
│   │   ├── main.py     # FastAPI app
│   │   └── routers/    # API routes
│   └── requirements.txt
└── package.json
```

## Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.10+
- **pip** (Python package manager)

## Installation

### 1. Install Node dependencies

```bash
npm install
```

### 2. Install Python dependencies

```bash
cd backend
pip install -r requirements.txt
cd ..
```

## Development

Start the application in development mode:

```bash
npm run dev
```

This will:
1. Start the Electron app with hot-reload
2. Automatically spawn the Python backend server

### Running the backend separately (optional)

```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

Then visit:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **OpenAPI JSON**: http://localhost:8000/openapi.json

## Building

Build for production:

```bash
# Build for current platform
npm run build

# Build for Windows
npm run build:win

# Build for macOS
npm run build:mac

# Build for Linux
npm run build:linux
```

## API Documentation

The FastAPI backend provides automatic OpenAPI documentation:

| Endpoint | Description |
|----------|-------------|
| `/docs` | Swagger UI - Interactive API explorer |
| `/redoc` | ReDoc - Alternative API documentation |
| `/openapi.json` | OpenAPI 3.0 specification (JSON) |

### Available Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Root endpoint with API info |
| GET | `/api/health` | Health check |
| POST | `/api/echo` | Echo a message |
| GET | `/api/info` | API information |

## Tab System

The tab system supports Chrome-like functionality:

- **Create tabs**: Click the + button or use keyboard shortcuts
- **Close tabs**: Click the × button on each tab
- **Reorder tabs**: Drag and drop tabs within the tab bar
- **Detach tabs**: Drag a tab outside the window to create a new window

## Technology Stack

### Frontend
- Electron
- React 18
- TypeScript
- Vite (via electron-vite)

### Backend
- Python 3.10+
- FastAPI
- Uvicorn (ASGI server)
- Pydantic (data validation)

## License

MIT

