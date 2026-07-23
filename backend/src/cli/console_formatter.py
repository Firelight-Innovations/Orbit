"""
Console formatter for pretty-printing agent output.
"""


class ConsoleFormatter:
    """Formats text for console output."""
    
    def __init__(self):
        self.use_colors = True
    
    def create_task_box(self, text: str, width: int = 60) -> str:
        """Create a boxed task display."""
        border = "─" * width
        lines = text.split("\n")
        formatted_lines = []
        
        for line in lines:
            # Truncate or pad to width
            if len(line) > width - 4:
                line = line[:width - 7] + "..."
            formatted_lines.append(f"│ {line.ljust(width - 4)} │")
        
        return f"┌{border}┐\n" + "\n".join(formatted_lines) + f"\n└{border}┘"
    
    def success(self, text: str) -> str:
        """Format success message."""
        return f"✓ {text}"
    
    def error(self, text: str) -> str:
        """Format error message."""
        return f"✗ {text}"
    
    def info(self, text: str) -> str:
        """Format info message."""
        return f"ℹ {text}"
    
    def warning(self, text: str) -> str:
        """Format warning message."""
        return f"⚠ {text}"


# Global formatter instance
formatter = ConsoleFormatter()
