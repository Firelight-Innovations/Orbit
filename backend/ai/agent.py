from functools import lru_cache

from langchain.agents import AgentType, initialize_agent
from langchain_openai import ChatOpenAI

from backend.ai.runtime.browser import get_browser
from backend.ai.runtime.config import get_settings
from backend.ai.prompts import SYSTEM_PROMPT
from backend.ai.tools import get_all_tools


@lru_cache(maxsize=1)
def _llm():
    settings = get_settings()
    return ChatOpenAI(
        model=settings.model,
        api_key=settings.openrouter_api_key,
        base_url="https://openrouter.ai/api/v1",
        temperature=0,
    )


async def create_agent():
    # Ensure browser connection exists before agent runs tools.
    await get_browser()
    tools = get_all_tools()
    llm = _llm()
    agent = initialize_agent(
        tools,
        llm,
        agent=AgentType.ZERO_SHOT_REACT_DESCRIPTION,
        verbose=False,
        handle_parsing_errors=True,
        system_message=SYSTEM_PROMPT,
    )
    return agent


async def run(task: str) -> str:
    agent = await create_agent()
    result = await agent.arun(task)
    return result if isinstance(result, str) else str(result)

