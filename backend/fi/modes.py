"""
Mode-specific message shaping for the Fi agent.

The chat modes are:
- ask: Q&A only, no browser actions
- agent: Full browser control with all tools
- plan: Planning mode that generates steps before execution

Only ``augment_message_for_mode`` is used by the live path (the streaming
browser agent supplies its own system prompt and tools). The old tool
registry / ModeConfig helpers were removed with the dead ``fi.tools`` tree.
"""

from typing import Literal

ModeType = Literal["ask", "agent", "plan"]


def augment_message_for_mode(message: str, mode: ModeType) -> str:
    """
    Augment the user message based on the mode.

    Args:
        message: The original user message
        mode: The chat mode

    Returns:
        Augmented message with mode-specific instructions
    """
    if mode == "agent":
        return f"""Task: {message}

Please help me accomplish this task. Start by understanding the current page state if needed."""

    if mode == "plan":
        return f"""Create a step-by-step plan for the following task.
Do NOT execute any actions yet, just outline the steps clearly.

Task: {message}

Provide the plan as a numbered list of specific, actionable steps."""

    # ask mode (and any fallback): pass the message through unchanged
    return message
