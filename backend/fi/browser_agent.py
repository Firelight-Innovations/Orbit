"""
Browser Agent - LLM agent with actual browser control tools.

This module provides an agent that can interact with web pages
using function calling to execute browser actions.
"""

import asyncio
import base64
import io
import json
import logging
import os
from typing import Any, Awaitable, Callable, Optional

import httpx

from src.core import registry
from fi.streaming import StreamEvent

logger = logging.getLogger(__name__)

# Sink the agent pushes progress events into. streaming.py supplies one backed
# by a queue; None disables emission entirely (the non-streaming callers).
EventSink = Optional[Callable[[StreamEvent], Awaitable[None]]]


def _make_emitter(sink: EventSink):
    """Wrap an event sink so emission can never break the agent loop.

    Reporting progress is strictly cosmetic. If the consumer has gone away --
    the user closed the sidebar, the SSE connection dropped -- the turn should
    still finish and still return its answer.
    """
    if sink is None:
        async def noop(_event: StreamEvent) -> None:
            return
        return noop

    async def emit(event: StreamEvent) -> None:
        try:
            await sink(event)
        except Exception as e:
            logger.debug(f"Dropped {event.type} event: {e}")

    return emit

try:
    from PIL import Image
    HAS_PILLOW = True
except ImportError:
    HAS_PILLOW = False
    Image = None
    logger.warning(
        "Pillow not available - page screenshots will be sent at their native "
        "size instead of letterboxed to 1024x1024. Install it with: pip install pillow"
    )

# API Configuration
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
# Must be a vision-capable model: every turn carries a screenshot of the page.
# claude-3.5-sonnet was removed from OpenRouter's catalog, so the old default
# no longer resolves at all.
DEFAULT_MODEL = os.environ.get("OPENROUTER_MODEL", "anthropic/claude-opus-4.8")

# Screenshot settings for the per-turn page image.
SCREENSHOT_SIZE = 1024
SCREENSHOT_QUALITY = 80

# Cap on labelled elements per snapshot. Applied only AFTER filtering to what is
# actually visible in the viewport -- capping in raw DOM order used to spend the
# whole budget on page chrome and truncate the real content away.
MAX_SNAPSHOT_ELEMENTS = 80

# Tools that change what the page looks like. take_snapshot only reads, so
# after it we reuse the previous capture rather than paying for a fresh image.
MUTATING_TOOLS = {
    "click_element",
    "type_text",
    "press_key",
    "navigate_to",
    "scroll_page",
    "go_back",
    "go_forward",
}

SCREENSHOT_NOTE = (
    "Screenshot of the page as it looks right now, scaled to 1024x1024 with "
    "black letterbox bars (the bars are not part of the page). Every element in "
    "the snapshot above is outlined in red and tagged with a red badge showing "
    "its ref ID, so you can match what you see to the listing. Act on elements "
    "by ref ID only -- never by pixel coordinates."
)

# Tool definitions for OpenRouter function calling
BROWSER_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "take_snapshot",
            "description": "Re-read the current page. Returns a YAML listing of the interactive elements that are visible in the viewport right now, each with a ref ID, grouped by page region. The screenshot attached to the next message is labelled with the same ref IDs. Use this after the page changes, or to see elements further down after scrolling.",
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
            "name": "press_key",
            "description": (
                "Press a key or key combination on the page. Use this to submit a "
                "search box with Enter instead of hunting for a submit button, to "
                "dismiss a dialog with Escape, to move focus with Tab, or to scroll "
                "with PageDown/End.\n"
                "Key syntax: a single key such as Enter, Escape, Tab, Backspace, "
                "Delete, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Home, End, "
                "PageUp, PageDown, F1-F12, or a single character like a or 5. "
                "Combine modifiers with '+', e.g. Control+A, Control+Shift+T, "
                "Shift+Tab. On Windows and Linux use Control (NOT Meta) for the "
                "usual shortcuts; Meta is the Command key and only applies on macOS."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "key": {
                        "type": "string",
                        "description": "The key or combination to press, e.g. 'Enter', 'Escape', 'Control+A'"
                    },
                    "ref_id": {
                        "type": "string",
                        "description": "Optional ref ID of an element to focus before pressing (e.g. 'e12'). Omit to send the key to whatever currently has focus."
                    },
                    "repeat": {
                        "type": "integer",
                        "description": "How many times to press the key (default: 1, max 20)"
                    }
                },
                "required": ["key"]
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

HOW YOU SEE THE PAGE:
Each turn you get a YAML snapshot of the elements currently visible in the
viewport, plus a screenshot of that same viewport. Every listed element is
outlined in red on the screenshot and tagged with a red badge showing its ref
ID (e1, e2, ...). The badges and the YAML always come from the same pass, so a
ref in the picture is the same ref in the listing.

Use the picture to judge what things actually are -- which thumbnail is a cat,
which button is the real "Accept", whether content loaded. Use the YAML for
names, types and state.

ACT BY REF ID ONLY. Never output pixel coordinates and never try to click a
position; the only way to act on an element is its ref ID. If the element you
want has no badge it is off-screen or covered: scroll, then take_snapshot
again. Only viewport-visible elements are ever labelled.

Tools:
- navigate_to: Go to a website. Opens/loads the page in the user's real browser tab.
- take_snapshot: Re-read the page and get a fresh YAML listing + labelled screenshot
- click_element: Click an element by its ref ID
- type_text: Type text into an input field by its ref ID
- press_key: Press a key or combination (Enter, Escape, Tab, ArrowDown, Control+A).
  Prefer pressing Enter to submit a search box over hunting for a submit button.
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


async def execute_tool(
    name: str,
    arguments: dict[str, Any],
    snapshot_sink: dict | None = None,
) -> str:
    """Execute a browser tool and return the result.

    `snapshot_sink` lets take_snapshot hand its freshly marked screenshot back
    to the agent loop, so the image the model sees comes from the very same pass
    that produced the ref IDs in the returned listing.
    """
    browser = registry.get("browser_instance")

    if browser is None or browser.context is None:
        return "Error: Not connected to browser."

    # navigate_to is the one tool that works with no page open -- it asks Orbit
    # to open a real tab. Everything else needs somewhere to act, and must never
    # fall back to one of Orbit's own views: pointing the agent at the assistant
    # sidebar made it type into its own chat box and click its own buttons.
    if browser.page is None and name != "navigate_to":
        return (
            "Error: No web page is open -- the user is on a blank tab. "
            "Use navigate_to to open a site first, then retry."
        )

    page = browser.page

    try:
        if name == "take_snapshot":
            yaml_text, image = await _snapshot_page(browser)
            if snapshot_sink is not None:
                snapshot_sink["image"] = image
            return yaml_text

        elif name == "click_element":
            ref_id = arguments.get("ref_id", "")
            result = await _click_by_ref(browser, page, ref_id)
            return result

        elif name == "type_text":
            ref_id = arguments.get("ref_id", "")
            text = arguments.get("text", "")
            clear_first = arguments.get("clear_first", True)
            result = await _type_in_element(browser, page, ref_id, text, clear_first)
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
            
        elif name == "press_key":
            key = arguments.get("key", "")
            ref_id = arguments.get("ref_id") or ""
            repeat = arguments.get("repeat", 1)
            return await _press_key(browser, page, key, ref_id, repeat)

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


# One pass over the page: stamp refs, collect element data, paint the
# set-of-marks badges. Doing this in a single evaluate is what guarantees the
# ref IDs in the YAML listing and the ref IDs drawn on the screenshot are the
# same set -- running the two separately lets the DOM shift between them.
_SNAPSHOT_JS = r"""
(opts) => {
    const MAX = opts.max;
    const OVERLAY_ATTR = 'data-agent-overlay';

    // Clear anything a previous pass left behind (including a badge layer that
    // survived a crash) so stale marks are never collected as page elements.
    document.querySelectorAll('[' + OVERLAY_ATTR + ']').forEach(n => n.remove());
    document.querySelectorAll('[data-agent-ref]').forEach(
        n => n.removeAttribute('data-agent-ref'));

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const SELECTOR = [
        'a[href]', 'button', 'input', 'textarea', 'select',
        '[role="button"]', '[onclick]', '[tabindex="0"]'
    ].join(',');

    const TAG_REGIONS = {
        HEADER: 'banner', NAV: 'navigation', MAIN: 'main',
        ASIDE: 'complementary', FOOTER: 'contentinfo', FORM: 'form'
    };
    const ROLE_REGIONS = [
        'navigation', 'main', 'banner', 'contentinfo', 'search',
        'form', 'complementary'
    ];

    const clean = (s) => (s == null ? '' : String(s)).replace(/\s+/g, ' ').trim();

    function regionOf(el) {
        let n = el;
        while (n && n !== document.body && n.nodeType === 1) {
            const role = n.getAttribute && clean(n.getAttribute('role')).toLowerCase();
            if (role && ROLE_REGIONS.indexOf(role) !== -1) return role;
            if (TAG_REGIONS[n.tagName]) return TAG_REGIONS[n.tagName];
            n = n.parentElement;
        }
        return 'other';
    }

    function roleOf(el) {
        const explicit = clean(el.getAttribute('role')).toLowerCase();
        if (explicit) return explicit;
        const tag = el.tagName.toLowerCase();
        if (tag === 'a') return 'link';
        if (tag === 'button') return 'button';
        if (tag === 'select') return 'combobox';
        if (tag === 'textarea') return 'textbox';
        if (tag === 'input') {
            const t = (el.type || 'text').toLowerCase();
            if (t === 'checkbox' || t === 'radio') return t;
            if (t === 'submit' || t === 'button' || t === 'reset') return 'button';
            if (t === 'search') return 'searchbox';
            return 'textbox';
        }
        return tag;
    }

    function nameOf(el) {
        let n = clean(el.getAttribute('aria-label'));
        if (n) return n;
        // An image-only link (a Google Images thumbnail, for example) carries
        // its label on the inner <img>, not on the anchor.
        const img = el.querySelector && el.querySelector('img[alt]');
        if (img) {
            n = clean(img.getAttribute('alt'));
            if (n) return n;
        }
        n = clean(el.getAttribute('alt')) || clean(el.getAttribute('title'));
        if (n) return n;
        const tag = el.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
            n = clean(el.innerText || el.textContent);
            if (n) return n;
        }
        return clean(el.getAttribute('placeholder')) || clean(el.value);
    }

    // --- collect, filtering to the viewport BEFORE any cap is applied ---
    const candidates = [];
    for (const el of document.querySelectorAll(SELECTOR)) {
        if (el.closest('[' + OVERLAY_ATTR + ']')) continue;

        const rect = el.getBoundingClientRect();
        if (rect.width < 4 || rect.height < 4) continue;
        // Must intersect the visible viewport; off-screen marks are noise.
        if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= vh || rect.left >= vw) continue;

        const st = window.getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden') continue;
        if (parseFloat(st.opacity) === 0) continue;

        // Drop elements buried under an overlay/cookie banner: whatever is
        // painted at their centre should be them (or their own child).
        const cx = Math.min(Math.max(rect.left + rect.width / 2, 1), vw - 1);
        const cy = Math.min(Math.max(rect.top + rect.height / 2, 1), vh - 1);
        let hit = null;
        try { hit = document.elementFromPoint(cx, cy); } catch (e) { hit = null; }
        if (hit && !(el === hit || el.contains(hit) || hit.contains(el))) continue;

        candidates.push({ el, rect });
    }

    // Reading order: row by row (24px bands), left to right within a row.
    candidates.sort((a, b) =>
        (Math.round(a.rect.top / 24) - Math.round(b.rect.top / 24)) ||
        (a.rect.left - b.rect.left));

    const total = candidates.length;
    const chosen = candidates.slice(0, MAX);

    const elements = [];
    chosen.forEach((c, i) => {
        const el = c.el;
        const ref = 'e' + (i + 1);
        el.setAttribute('data-agent-ref', ref);

        const info = { ref, region: regionOf(el), role: roleOf(el), name: nameOf(el).slice(0, 120) };
        const tag = el.tagName.toLowerCase();
        if (tag === 'input' && el.type) info.type = el.type.toLowerCase();
        if (el.getAttribute && el.getAttribute('placeholder')) {
            info.placeholder = clean(el.getAttribute('placeholder')).slice(0, 60);
        }
        if ((tag === 'input' || tag === 'textarea') && el.value) {
            info.value = clean(el.value).slice(0, 60);
        }
        if (tag === 'a' && el.href) info.href = el.href.slice(0, 100);
        if (el.disabled) info.disabled = true;
        if (typeof el.checked === 'boolean' && el.checked) info.checked = true;
        const expanded = el.getAttribute && el.getAttribute('aria-expanded');
        if (expanded) info.expanded = expanded === 'true';
        const selected = el.getAttribute && el.getAttribute('aria-selected');
        if (selected === 'true') info.selected = true;

        elements.push(info);
    });

    // --- paint the set-of-marks badges ---
    if (opts.badges) {
        const layer = document.createElement('div');
        layer.setAttribute(OVERLAY_ATTR, '1');
        layer.style.cssText =
            'position:fixed;inset:0;pointer-events:none;z-index:2147483000;';

        const placed = [];
        chosen.forEach((c, i) => {
            const r = c.rect;
            const ref = 'e' + (i + 1);

            const box = document.createElement('div');
            box.style.cssText =
                'position:fixed;border:2px solid #E11D48;box-sizing:border-box;' +
                'pointer-events:none;left:' + r.left + 'px;top:' + r.top +
                'px;width:' + r.width + 'px;height:' + r.height + 'px;';
            layer.appendChild(box);

            // Badge sized to stay legible after the 1024px letterbox downscale.
            const bw = 14 + ref.length * 12;
            const bh = 24;
            let bx = Math.min(Math.max(r.left, 0), vw - bw);
            let by = r.top >= bh ? r.top - bh : r.top;
            for (let k = 0; k < 6; k++) {
                const clash = placed.some(p =>
                    !(bx + bw <= p.x || p.x + p.w <= bx ||
                      by + bh <= p.y || p.y + p.h <= by));
                if (!clash) break;
                by += bh + 2;
            }
            placed.push({ x: bx, y: by, w: bw, h: bh });

            const badge = document.createElement('div');
            badge.textContent = ref;
            badge.style.cssText =
                'position:fixed;background:#E11D48;color:#fff;font:700 20px/24px ' +
                'Arial,Helvetica,sans-serif;text-align:center;letter-spacing:0;' +
                'border:1px solid #fff;box-sizing:border-box;pointer-events:none;' +
                'white-space:nowrap;left:' + bx + 'px;top:' + by + 'px;width:' +
                bw + 'px;height:' + bh + 'px;';
            layer.appendChild(badge);
        });

        document.body.appendChild(layer);
    }

    return {
        url: document.location.href,
        title: document.title,
        vw, vh,
        total,
        shown: elements.length,
        scrollY: Math.round(window.scrollY),
        scrollHeight: Math.round(document.documentElement.scrollHeight),
        elements
    };
}
"""

_CLEAR_BADGES_JS = """
() => {
    document.querySelectorAll('[data-agent-overlay]').forEach(n => n.remove());
}
"""


def _yaml_str(value: str) -> str:
    """Quote a scalar for the YAML flow mappings the snapshot emits."""
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _build_yaml(data: dict) -> str:
    """Render the snapshot data as a compact YAML document.

    One flow mapping per element keeps it parseable and hierarchical without
    spending four lines per node -- this ships every turn next to a 1024x1024
    image, so density matters.
    """
    lines = [
        f"url: {_yaml_str(data.get('url', ''))}",
        f"title: {_yaml_str(data.get('title', ''))}",
        f"viewport: {{w: {data.get('vw', 0)}, h: {data.get('vh', 0)}}}",
        f"scroll: {{y: {data.get('scrollY', 0)}, page_height: {data.get('scrollHeight', 0)}}}",
    ]

    elements = data.get("elements") or []
    total = data.get("total", len(elements))
    if total > len(elements):
        lines.append(
            f"note: {_yaml_str(f'{len(elements)} of {total} visible elements shown; scroll for more')}"
        )

    if not elements:
        lines.append("elements: []  # nothing interactive in the viewport")
        return "\n".join(lines)

    # Group by page region so the model can tell page chrome from content.
    order = ["search", "main", "form", "navigation", "banner", "complementary",
             "contentinfo", "other"]
    grouped: dict[str, list[dict]] = {}
    for el in elements:
        grouped.setdefault(el.get("region", "other"), []).append(el)

    lines.append("elements:")
    for region in sorted(grouped, key=lambda r: order.index(r) if r in order else 99):
        lines.append(f"  {region}:")
        for el in grouped[region]:
            parts = [f"ref: {el['ref']}", f"role: {el.get('role', '')}"]
            if el.get("name"):
                parts.append(f"name: {_yaml_str(el['name'])}")
            for key in ("type", "placeholder", "value", "href"):
                if el.get(key):
                    parts.append(f"{key}: {_yaml_str(str(el[key]))}")
            for key in ("disabled", "checked", "expanded", "selected"):
                if key in el:
                    parts.append(f"{key}: {str(el[key]).lower()}")
            lines.append("    - {" + ", ".join(parts) + "}")

    return "\n".join(lines)


async def _glide_cursor_to(browser, element, state: str = "hovering") -> None:
    """Glide the on-page synthetic cursor to an element before acting on it.

    Purely cosmetic, so every failure here is swallowed: the visual must never
    be the reason a real click doesn't happen.
    """
    cursor = getattr(browser, "cursor", None)
    if cursor is None:
        return
    try:
        box = await element.bounding_box()
        if not box:
            return
        await cursor.animate_to_position(
            box["x"] + box["width"] / 2,
            box["y"] + box["height"] / 2,
        )
        await cursor.set_cursor_state(state)
    except Exception as e:
        logger.debug(f"Cursor glide skipped: {e}")


async def _cursor_click_feedback(browser) -> None:
    """Play the click animation on the synthetic cursor."""
    cursor = getattr(browser, "cursor", None)
    if cursor is None:
        return
    try:
        await cursor.trigger_click_feedback()
    except Exception as e:
        logger.debug(f"Cursor click feedback skipped: {e}")


async def _mouse_click_center(page, element) -> None:
    """Click the element's centre with a real mouse event."""
    box = await element.bounding_box()
    if not box:
        raise RuntimeError("element has no box (hidden or detached)")
    await page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)


async def _click_by_ref(browser, page, ref_id: str) -> str:
    """Click an element by its ref ID.

    Tries progressively blunter strategies. A plain Playwright click runs full
    actionability checks, and result grids routinely cover their own tiles with
    a hover/preview layer -- the "receives pointer events" check then fails and
    burns the whole timeout even though a user could click the tile perfectly
    well. Each fallback drops one of those checks.
    """
    try:
        element = await page.query_selector(f'[data-agent-ref="{ref_id}"]')
        if not element:
            # Refs are stamped onto the DOM at snapshot time, so anything that
            # re-renders (lazy grids, virtualised lists) drops them. Re-stamp
            # once and retry before making the model spend a turn on it.
            await _snapshot_page(browser)
            element = await page.query_selector(f'[data-agent-ref="{ref_id}"]')
            if not element:
                return (
                    f"Element {ref_id} no longer exists -- the page re-rendered. "
                    "Take a new snapshot and use the new ref IDs."
                )

        # Scroll into view, walk the cursor over, then click
        await element.scroll_into_view_if_needed()
        await _glide_cursor_to(browser, element)
        await _cursor_click_feedback(browser)

        strategies = (
            ("click", lambda: element.click(timeout=3000)),
            # Skips the actionability checks, still a real input event.
            ("force click", lambda: element.click(timeout=3000, force=True)),
            # Real mouse event at the element's centre -- lands on whatever
            # overlay sits on top, which is what a user clicking would hit too.
            ("mouse click", lambda: _mouse_click_center(page, element)),
            # Last resort: fires the handler directly, bypassing hit-testing
            # entirely. Won't trigger anything that depends on real input.
            ("dom click", lambda: element.evaluate("el => el.click()")),
        )

        errors: list[str] = []
        for label, attempt in strategies:
            try:
                await attempt()
                await page.wait_for_timeout(500)
                note = "" if label == "click" else f" (via {label})"
                return f"Clicked element {ref_id}{note}"
            except Exception as e:
                errors.append(f"{label}: {str(e).splitlines()[0]}")

        return f"Failed to click {ref_id}. Tried " + "; ".join(errors)

    except Exception as e:
        return f"Failed to click {ref_id}: {str(e)}"
    finally:
        cursor = getattr(browser, "cursor", None)
        if cursor is not None:
            try:
                await cursor.set_cursor_state("normal")
            except Exception:
                pass


async def _type_in_element(browser, page, ref_id: str, text: str, clear_first: bool) -> str:
    """Type text into an element."""
    try:
        element = await page.query_selector(f'[data-agent-ref="{ref_id}"]')
        if not element:
            return f"Element {ref_id} not found. Take a new snapshot to see current elements."

        await element.scroll_into_view_if_needed()
        await _glide_cursor_to(browser, element, state="typing")

        if clear_first:
            await element.fill(text)
        else:
            await element.type(text)

        return f"Typed '{text}' into element {ref_id}"

    except Exception as e:
        return f"Failed to type in {ref_id}: {str(e)}"
    finally:
        cursor = getattr(browser, "cursor", None)
        if cursor is not None:
            try:
                await cursor.set_cursor_state("normal")
            except Exception:
                pass


async def _press_key(browser, page, key: str, ref_id: str, repeat: int) -> str:
    """Press a key or combination, optionally focusing an element first."""
    if not key:
        return "Error: no key given."

    try:
        repeat = max(1, min(int(repeat), 20))
    except (TypeError, ValueError):
        repeat = 1

    target = "the focused element"
    try:
        if ref_id:
            element = await page.query_selector(f'[data-agent-ref="{ref_id}"]')
            if not element:
                return f"Element {ref_id} not found. Take a new snapshot to see current elements."
            await element.scroll_into_view_if_needed()
            await _glide_cursor_to(browser, element)
            for _ in range(repeat):
                await element.press(key, timeout=5000)
            target = f"element {ref_id}"
        else:
            for _ in range(repeat):
                await page.keyboard.press(key)

        # Give the page a beat to react (submit, dialog close, scroll).
        await page.wait_for_timeout(300)

        times = "" if repeat == 1 else f" x{repeat}"
        return f"Pressed {key}{times} on {target}"

    except Exception as e:
        return (
            f"Failed to press '{key}': {e}. "
            "Use Playwright key names, e.g. Enter, Escape, Tab, ArrowDown, "
            "PageDown, Control+A (use Control, not Meta, on Windows)."
        )


def _letterbox(raw: bytes, size: int = SCREENSHOT_SIZE) -> bytes:
    """Fit an image into a size x size JPEG, aspect preserved, black bars added."""
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    img.thumbnail((size, size), Image.LANCZOS)
    canvas = Image.new("RGB", (size, size), (0, 0, 0))
    canvas.paste(img, ((size - img.width) // 2, (size - img.height) // 2))
    buffer = io.BytesIO()
    canvas.save(buffer, format="JPEG", quality=SCREENSHOT_QUALITY)
    return buffer.getvalue()


async def _snapshot_page(browser) -> tuple[str, str | None]:
    """Read the page once, returning (YAML listing, marked screenshot data URI).

    The listing and the image come out of a single stamping pass, so the ref IDs
    printed on the screenshot are guaranteed to be the ones in the YAML. Badges
    are always torn down again, including on the failure paths -- the user is
    looking at this page.
    """
    page = getattr(browser, "page", None)
    if page is None or page.is_closed():
        # Phrased for the model: this is what it sees as the page state, so it
        # needs to point at the way out rather than just reporting a fault.
        return "no_page: true  # no website open yet -- use navigate_to first", None

    internal = browser._is_internal_url(page.url)
    want_image = not internal
    if internal:
        logger.debug(f"Skipping screenshot for internal page: {page.url}")

    data = None
    raw = None
    try:
        data = await page.evaluate(
            _SNAPSHOT_JS, {"max": MAX_SNAPSHOT_ELEMENTS, "badges": want_image}
        )
        if want_image:
            try:
                raw = await page.screenshot(
                    type="jpeg", quality=SCREENSHOT_QUALITY, timeout=5000
                )
            except Exception as e:
                # A failed screenshot degrades the turn to text-only; the YAML
                # listing is still perfectly usable.
                logger.warning(f"Screenshot capture failed: {e}")
    except Exception as e:
        logger.error(f"Snapshot error: {e}", exc_info=True)
        return f"Error taking snapshot: {e}", None
    finally:
        if want_image:
            try:
                await page.evaluate(_CLEAR_BADGES_JS)
            except Exception as e:
                logger.warning(f"Failed to clear snapshot badges: {e}")

    yaml_text = _build_yaml(data or {})

    if raw is None:
        return yaml_text, None

    if HAS_PILLOW:
        try:
            raw = await asyncio.to_thread(_letterbox, raw)
        except Exception as e:
            logger.warning(f"Screenshot resize failed, sending native size: {e}")

    return yaml_text, "data:image/jpeg;base64," + base64.b64encode(raw).decode("ascii")


def _with_page_state(
    messages: list[dict], yaml_text: str | None, data_uri: str | None
) -> list[dict]:
    """Build the request payload with the current page state on the newest turn.

    Stored history stays text-only and the image is attached per request, so a
    long conversation costs one image per API call rather than re-sending every
    screenshot the conversation has ever taken.
    """
    parts: list[dict] = []
    if yaml_text:
        parts.append({"type": "text", "text": "Current page snapshot:\n\n" + yaml_text})
    if data_uri:
        parts.append({"type": "text", "text": SCREENSHOT_NOTE})
        parts.append({"type": "image_url", "image_url": {"url": data_uri}})

    if not parts:
        return messages

    last = messages[-1]
    if last.get("role") == "user":
        # Fold into the existing user turn; two user messages in a row is not
        # something every provider behind OpenRouter accepts.
        merged = dict(last)
        merged["content"] = [
            {"type": "text", "text": last.get("content") or ""},
            *parts,
        ]
        return messages[:-1] + [merged]

    # After tool results: a fresh user turn carrying the post-action view.
    return messages + [{"role": "user", "content": parts}]


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
        on_event: "EventSink" = None,
    ) -> str:
        """Run the agent with browser tools to complete a task.

        `on_event` receives StreamEvents as the turn progresses (tool calls and
        the model's narration between them) so the UI can show the work live
        instead of only the final answer. Emission is best-effort: a failing
        sink is logged and ignored, never allowed to abort the run.
        """
        emit = _make_emitter(on_event)

        if not self.api_key:
            return "Error: OpenRouter API key not configured."

        # Auto-connect to browser if not connected. Keyed on the CDP context,
        # not on browser.page: having no page is a legitimate state (the user is
        # on a new tab with nothing loaded), and testing page here would rebuild
        # the whole connection on every turn until they opened a website.
        browser = registry.get("browser_instance")
        if browser is None or browser.context is None:
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

        # One snapshot+image pass per model call, refreshed only when a tool
        # actually changed the page.
        snapshot_yaml: str | None = None
        screenshot: str | None = None
        needs_capture = True
        # True when take_snapshot already returned the listing as a tool result,
        # so the page-state block carries only the image.
        yaml_in_tool_result = False

        for iteration in range(self.max_iterations):
            logger.info(f"Agent iteration {iteration + 1}/{self.max_iterations}")

            if needs_capture:
                snapshot_yaml, screenshot = await _snapshot_page(browser)
                needs_capture = False
                yaml_in_tool_result = False

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
                        "messages": _with_page_state(
                            messages,
                            None if yaml_in_tool_result else snapshot_yaml,
                            screenshot,
                        ),
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

                # Narration the model wrote alongside its tool calls is its
                # reasoning for this step, not the answer -- surface it as a
                # thought so it appears in the timeline rather than being
                # silently overwritten by the next iteration.
                if message.get("content"):
                    await emit(StreamEvent(type="thought", content=message["content"]))

                # Execute each tool call
                for tool_call in tool_calls:
                    tool_name = tool_call["function"]["name"]
                    tool_args = json.loads(tool_call["function"]["arguments"])
                    call_id = tool_call.get("id")

                    logger.info(f"Executing tool: {tool_name} with args: {tool_args}")
                    await emit(StreamEvent(
                        type="tool_start",
                        id=call_id,
                        tool_name=tool_name,
                        tool_args=tool_args,
                    ))

                    # Execute the tool
                    sink: dict = {}
                    result = await execute_tool(tool_name, tool_args, sink)

                    logger.info(f"Tool result: {result[:200]}...")

                    # execute_tool reports failures as strings rather than
                    # raising, so the wire status has to be read back off the
                    # result text.
                    failed = result.startswith(("Error", "Failed", "Could not"))
                    await emit(StreamEvent(
                        type="tool_end",
                        id=call_id,
                        tool_name=tool_name,
                        tool_result=None if failed else result,
                        status="error" if failed else "ok",
                        error=result if failed else None,
                        screenshot=sink.get("image"),
                    ))

                    # Add tool result to messages
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call["id"],
                        "content": result
                    })

                    if tool_name in MUTATING_TOOLS:
                        needs_capture = True
                    elif "image" in sink:
                        # take_snapshot already did the pass; reuse its image so
                        # the picture matches the refs it just returned.
                        screenshot = sink["image"]
                        snapshot_yaml = result
                        yaml_in_tool_result = True
                        needs_capture = False
                
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
    on_event: EventSink = None,
) -> str:
    """Run a task with browser tools enabled."""
    agent = get_browser_agent()
    return await agent.run(
        task,
        conversation_id=conversation_id,
        active_url=active_url,
        on_event=on_event,
    )
