from src.cli.console_formatter import formatter

#function_tool
async def browser_print(text: str) -> bool:
    """Prints text to the console for the user to see.

    Args:
        text (str): The text to be printed.

    Returns:
        bool: Returns 'True' if the console print was sucessful.
    """
    print(formatter.create_agent_message(text))
    return True