"""
Browser Agent - LLM agent with actual browser control tools.

This module provides an agent that can interact with web pages
using function calling to execute browser actions.
"""

import json
import logging
import os
from typing import Any

import httpx

from src.core import registry

logger = logging.getLogger(__name__)

# API Configuration
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_MODEL = os.environ.get("OPENROUTER_MODEL", "anthropic/claude-3.5-sonnet")

# Tool definitions for OpenRouter function calling
BROWSER_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "take_snapshot",
            "description": "Take a snapshot of the current page to see its structure and available elements. Returns a simplified DOM with ref IDs you can use for clicking.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "click_element",
            "description": "Click on an element identified by its ref ID from the snapshot.",
            "parameters": {
                "type": "object",
                "properties": {
                    "ref_id": {
                        "type": "string",
                        "description": "The ref ID of the element to click (e.g., 'e12')"
                    }
                },
                "required": ["ref_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "type_text",
            "description": "Type text into an input field identified by its ref ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "ref_id": {
                        "type": "string",
                        "description": "The ref ID of the input element"
                    },
                    "text": {
                        "type": "string",
                        "description": "The text to type"
                    },
                    "clear_first": {
                        "type": "boolean",
                        "description": "Whether to clear the field before typing (default: true)"
                    }
                },
                "required": ["ref_id", "text"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "navigate_to",
            "description": "Open a website in the user's real browser tab. Use this whenever the user wants to go to, open, or visit a site, or to run a search. Prefer a full https:// URL.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "Full URL to open, e.g. https://www.google.com or https://www.google.com/search?q=cats"
                    }
                },
                "required": ["url"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "scroll_page",
            "description": "Scroll the page up or down.",
            "parameters": {
                "type": "object",
                "properties": {
                    "direction": {
                        "type": "string",
                        "enum": ["up", "down"],
                        "description": "Direction to scroll"
                    },
                    "amount": {
                        "type": "integer",
                        "description": "Pixels to scroll (default: 500)"
                    }
                },
                "required": ["direction"]
            }
        }
    },
    {
        "type": "function", 
        "function": {
            "name": "go_back",
            "description": "Go back to the previous page.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "go_forward", 
            "description": "Go forward to the next page.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    }
]

SYSTEM_PROMPT = """You are a browser automation agent that controls the user's real browser tab to accomplish tasks.

Tools:
- navigate_to: Go to a website. Opens/loads the page in the user's real browser tab.
- take_snapshot: See the current page structure with clickable elements (ref IDs)
- click_element: Click an element by its ref ID from a snapshot
- type_text: Type text into an input field by its ref ID
- scroll_page: Scroll the page up or down
- go_back/go_forward: Navigate browser history

NAVIGATION (most important):
- When the user asks to go to, open, visit, or "take me to" a site, call navigate_to
  IMMEDIATELY with a full https:// URL. Do NOT snapshot first and do NOT ask the user
  for the URL when you can infer it.
- Infer obvious URLs from names: "google" -> https://www.google.com,
  "youtube" -> https://www.youtube.com, "gmail" -> https://mail.google.com,
  "amazon" -> https://www.amazon.com. Add https:// if the user gave a bare domain.
- To run a search, navigate straight to the results URL, e.g. search cats ->
  https://www.google.com/search?q=cats.
- NEVER try to type a URL into the browser's own address bar; that is what
  navigate_to is for. Only use type_text for input fields inside a web page.

GENERAL WORKFLOW:
1. If the task is to go somewhere, navigate_to first.
2. To read or interact with page content, take_snapshot, then click/type using ref IDs.
3. After an action that changes the page, take another snapshot to confirm.
4. When done (or blocked), briefly say what you did and what happened.

Be decisive: act with the tools rather than asking the user for details you can infer.
Only ask a clarifying question when the destination or action is genuinely ambiguous."""


async def execute_tool(name: str, arguments: dict[str, Any]) -> str:
    """Execute a browser tool and return the result."""
    browser = registry.get("browser_instance")
    
    if browser is None or browser.page is None:
        return "Error: Not connected to browser."
    
    page = browser.page
    
    try:
        if name == "take_snapshot":
            # Get a simplified snapshot of the page
            snapshot = await _get_page_snapshot(page)
            return snapshot
            
        elif name == "click_element":
            ref_id = arguments.get("ref_id", "")
            result = await _click_by_ref(page, ref_id)
            return result
            
        elif name == "type_text":
            ref_id = arguments.get("ref_id", "")
            text = arguments.get("text", "")
            clear_first = arguments.get("clear_first", True)
            result = await _type_in_element(page, ref_id, text, clear_first)
            return result
            
        elif name == "navigate_to":
            url = arguments.get("url", "")
            # Route through Orbit's tab system so the page loads in the real
            # browser tab (created if the active tab is orbit://newtab), not in
            # a raw CDP renderer like the assistant sidebar.
            result_page = await browser.navigate_active_tab(url)
            landed = result_page.url if result_page else url
            return f"Navigated to {landed}"
            
        elif name == "scroll_page":
            direction = arguments.get("direction", "down")
            amount = arguments.get("amount", 500)
            delta = amount if direction == "down" else -amount
            await page.evaluate(f"window.scrollBy(0, {delta})")
            return f"Scrolled {direction} by {amount}px"
            
        elif name == "go_back":
            await page.go_back(timeout=10000)
            return "Navigated back"
            
        elif name == "go_forward":
            await page.go_forward(timeout=10000)
            return "Navigated forward"
            
        else:
            return f"Unknown tool: {name}"
            
    except Exception as e:
        logger.error(f"Tool execution error: {e}", exc_info=True)
        return f"Error executing {name}: {str(e)}"


async def _get_page_snapshot(page) -> str:
    """Get a simplified snapshot of the page for the agent."""
    try:
        # Get basic page info
        url = page.url
        title = await page.title()
        
        # Get interactive elements with a simple script
        elements = await page.evaluate("""() => {
            const results = [];
            let refId = 1;
            
            // Helper to get visible text
            const getVisibleText = (el) => {
                const text = el.innerText || el.textContent || '';
                return text.trim().substring(0, 100);
            };
            
            // Get all interactive elements
            const selectors = [
                'a[href]',
                'button',
                'input',
                'textarea',
                'select',
                '[role="button"]',
                '[onclick]',
                '[tabindex="0"]'
            ];
            
            const elements = document.querySelectorAll(selectors.join(','));
            
            for (const el of elements) {
                // Skip hidden elements
                const rect = el.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) continue;
                
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden') continue;
                
                const ref = 'e' + refId++;
                el.setAttribute('data-agent-ref', ref);
                
                const info = {
                    ref: ref,
                    tag: el.tagName.toLowerCase(),
                    type: el.type || null,
                    text: getVisibleText(el),
                    placeholder: el.placeholder || null,
                    value: el.value || null,
                    href: el.href || null,
                    ariaLabel: el.getAttribute('aria-label') || null
                };
                
                // Clean up null values
                Object.keys(info).forEach(k => info[k] === null && delete info[k]);
                
                results.push(info);
                
                // Limit to 50 elements for readability
                if (results.length >= 50) break;
            }
            
            return results;
        }""")
        
        # Format the snapshot
        lines = [
            f"Page: {title}",
            f"URL: {url}",
            "",
            "Interactive Elements:"
        ]
        
        for el in elements:
            ref = el.get('ref', '')
            tag = el.get('tag', '')
            text = el.get('text', '')[:50] if el.get('text') else ''
            href = el.get('href', '')
            placeholder = el.get('placeholder', '')
            el_type = el.get('type', '')
            
            desc = f"[{ref}] {tag}"
            if el_type:
                desc += f" type={el_type}"
            if text:
                desc += f' "{text}"'
            elif placeholder:
                desc += f' placeholder="{placeholder}"'
            elif href:
                # Truncate long URLs
                short_href = href[:50] + "..." if len(href) > 50 else href
                desc += f' href="{short_href}"'
                
            lines.append(desc)
        
        if not elements:
            lines.append("(No interactive elements found)")
            
        return "\n".join(lines)
        
    except Exception as e:
        logger.error(f"Snapshot error: {e}", exc_info=True)
        return f"Error taking snapshot: {str(e)}"


async def _click_by_ref(page, ref_id: str) -> str:
    """Click an element by its ref ID."""
    try:
        element = await page.query_selector(f'[data-agent-ref="{ref_id}"]')
        if not element:
            return f"Element {ref_id} not found. Take a new snapshot to see current elements."
        
        # Scroll into view and click
        await element.scroll_into_view_if_needed()
        await element.click(timeout=5000)
        
        # Wait a moment for any navigation/updates
        await page.wait_for_timeout(500)
        
        return f"Clicked element {ref_id}"
        
    except Exception as e:
        return f"Failed to click {ref_id}: {str(e)}"


async def _type_in_element(page, ref_id: str, text: str, clear_first: bool) -> str:
    """Type text into an element."""
    try:
        element = await page.query_selector(f'[data-agent-ref="{ref_id}"]')
        if not element:
            return f"Element {ref_id} not found. Take a new snapshot to see current elements."
        
        await element.scroll_into_view_if_needed()
        
        if clear_first:
            await element.fill(text)
        else:
            await element.type(text)
        
        return f"Typed '{text}' into element {ref_id}"
        
    except Exception as e:
        return f"Failed to type in {ref_id}: {str(e)}"


class BrowserAgent:
    """Agent with browser control capabilities using function calling."""
    
    def __init__(
        self,
        model: str = DEFAULT_MODEL,
        api_key: str | None = None,
        max_iterations: int = 10
    ):
        self.model = model
        self.api_key = api_key or OPENROUTER_API_KEY
        self.max_iterations = max_iterations
        self._client: httpx.AsyncClient | None = None
        # Server-side conversation history keyed by client conversation_id.
        # Persists across requests so context isn't wiped every message.
        self.conversations: dict[str, list[dict]] = {}
    
    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=120.0)
        return self._client
    
    async def run(
        self,
        task: str,
        conversation_id: str | None = None,
        active_url: str | None = None,
    ) -> str:
        """Run the agent with browser tools to complete a task."""
        if not self.api_key:
            return "Error: OpenRouter API key not configured."

        # Auto-connect to browser if not connected
        browser = registry.get("browser_instance")
        if browser is None or browser.page is None:
            logger.info("Browser not connected, attempting auto-connect...")
            try:
                from fi.browser.instance import BrowserInstance
                browser = BrowserInstance()
                await browser.connect_via_cdp(port=9222)
                registry.set("browser_instance", browser)
                logger.info("Auto-connected to browser successfully")
            except Exception as e:
                logger.error(f"Auto-connect failed: {e}")
                return (f"I couldn't connect to the browser automatically. "
                       f"Error: {str(e)}\n\n"
                       "**Tip:** Make sure no other Electron instances are running. "
                       "Try closing all browser windows and restarting the app.")

        # Point the agent at the foreground tab (fixes acting on a stale page).
        try:
            await browser.resolve_active_page(active_url)
        except Exception as e:
            logger.warning(f"Could not resolve active page: {e}")

        # Load or seed the conversation history for this client conversation.
        key = conversation_id or "default"
        messages = self.conversations.get(key)
        if messages is None:
            messages = [{"role": "system", "content": SYSTEM_PROMPT}]
            self.conversations[key] = messages
        messages.append({"role": "user", "content": task})

        client = await self._get_client()
        final_response = ""
        
        for iteration in range(self.max_iterations):
            logger.info(f"Agent iteration {iteration + 1}/{self.max_iterations}")
            
            try:
                response = await client.post(
                    f"{OPENROUTER_BASE_URL}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                        "HTTP-Referer": "https://orbit.browser",
                        "X-Title": "Orbit Browser Agent"
                    },
                    json={
                        "model": self.model,
                        "messages": messages,
                        "tools": BROWSER_TOOLS,
                        "tool_choice": "auto",
                        "max_tokens": 4096,
                        "temperature": 0.3
                    }
                )
                
                if response.status_code != 200:
                    logger.error(f"API error: {response.status_code} - {response.text}")
                    return f"Error communicating with AI: {response.status_code}"
                
                data = response.json()
                message = data["choices"][0]["message"]
                
                # Add assistant message to history
                messages.append(message)
                
                # Check if we have tool calls
                tool_calls = message.get("tool_calls", [])
                
                if not tool_calls:
                    # No tool calls - agent is done
                    final_response = message.get("content", "")
                    break
                
                # Execute each tool call
                for tool_call in tool_calls:
                    tool_name = tool_call["function"]["name"]
                    tool_args = json.loads(tool_call["function"]["arguments"])
                    
                    logger.info(f"Executing tool: {tool_name} with args: {tool_args}")
                    
                    # Execute the tool
                    result = await execute_tool(tool_name, tool_args)
                    
                    logger.info(f"Tool result: {result[:200]}...")
                    
                    # Add tool result to messages
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call["id"],
                        "content": result
                    })
                
                # If the last message has content alongside tool calls, capture it
                if message.get("content"):
                    final_response = message["content"]
                    
            except Exception as e:
                logger.error(f"Agent error: {e}", exc_info=True)
                return f"Error during agent execution: {str(e)}"
        
        return final_response or "Task completed."
    
    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()


# Global instance
_browser_agent: BrowserAgent | None = None


def get_browser_agent() -> BrowserAgent:
    """Get or create the browser agent instance."""
    global _browser_agent
    if _browser_agent is None:
        _browser_agent = BrowserAgent()
    return _browser_agent


async def run_with_tools(
    task: str,
    conversation_id: str | None = None,
    active_url: str | None = None,
) -> str:
    """Run a task with browser tools enabled."""
    agent = get_browser_agent()
    return await agent.run(task, conversation_id=conversation_id, active_url=active_url)
