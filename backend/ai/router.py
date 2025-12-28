from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.ai.agent import run as run_agent, create_agent
from backend.ai.runtime.browser import get_browser
from backend.ai.runtime.snapshot import take_snapshot_yaml

router = APIRouter()


class ConnectRequest(BaseModel):
    port: int | None = None


class RunRequest(BaseModel):
    task: str


@router.post("/ai/connect")
async def ai_connect(body: ConnectRequest):
    conn = await get_browser()
    if body.port and conn.browser:
        # Reconnect to a different port if requested
        await conn.close()
        await conn.connect(body.port)
    return {"status": "ok", "page": conn.page.url if conn.page else None}


@router.post("/ai/run")
async def ai_run(body: RunRequest):
    if not body.task:
        raise HTTPException(status_code=400, detail="task is required")
    await create_agent()  # ensure tools and browser are ready
    output = await run_agent(body.task)
    return {"output": output}


@router.get("/ai/snapshot")
async def ai_snapshot():
    conn = await get_browser()
    if not conn.page:
        raise HTTPException(status_code=400, detail="No active page")
    snap = await take_snapshot_yaml(conn.page)
    return {"snapshot": snap}


@router.post("/ai/disconnect")
async def ai_disconnect():
    conn = await get_browser()
    await conn.close()
    return {"status": "disconnected"}

