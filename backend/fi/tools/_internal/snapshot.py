import yaml
import json
import os
import pprint
from typing import Optional

from src.core.config import (
    SnapshotConfig,
    get_weave_config,
    InclusionMode,
    RefAssignmentStrategy,
)
from src.browser.instance import BrowserInstance
from src.core import registry

class Snapshot:
    def __init__(self, config: Optional[SnapshotConfig] = None):
        self._instance: BrowserInstance = registry.get('browser_instance')
        self._config: SnapshotConfig = config or get_weave_config().snapshot
        self._ref_helpers_loaded: bool = False
        self._session_token: Optional[str] = None
        self._ref_counter: int = self._config.reference_assignment.start_counter_at

    async def _preflight_cleanup(self) -> None:
        """Remove any pre-existing Weave ref attributes and markers from the DOM."""
        page = self._instance.page

        if not page:
            return

        frames = getattr(page, 'frames', None)
        frames_list = frames if isinstance(frames, list) else None

        # Playwright's page.frames is a property; fall back to single page if unavailable
        try:
            frames_iter = page.frames
        except Exception:
            frames_iter = []

        if not frames_iter:
            frames_iter = [page]

        if self._config.debug_mode:
            print(f"[Snapshot] Running preflight cleanup in {len(frames_iter)} frame(s)")

        for frame in frames_iter:
            try:
                removed = await frame.evaluate(
                    "(arg) => window.__weaveCleanupRefs && window.__weaveCleanupRefs(arg)",
                    {
                        'attributeName': 'ref',
                    }
                )

                if self._config.debug_mode:
                    print(f"[Snapshot] Cleanup removed {removed} refs in a frame")
            except Exception:
                if self._config.debug_mode:
                    print("[Snapshot] Cleanup failed in a frame (ignored)")

                continue

            # Fallback cleanup to ensure no conflicting attributes remain
            try:
                removed_direct = await frame.evaluate(
                    """
                    () => {
                        let removed = 0;
                        document.querySelectorAll('[ref]').forEach(el => {
                            if (el.hasAttribute('ref')) { el.removeAttribute('ref'); removed++; }
                            if (el.hasAttribute('ref')) { el.removeAttribute('ref'); removed++; }
                            if (el.hasAttribute('ref')) { el.removeAttribute('ref'); removed++; }
                        });
                        // Reset any ref counters used by prior runs
                        window.__input_ref_counter = 3000;
                        window.__missed_ref_counter = 4000;
                        window.__text_ref_counter = 5000;
                        window.__final_ref_counter = 6000;
                        window.__ref_counter = 1;
                        return removed;
                    }
                    """
                )
                if self._config.debug_mode:
                    print(f"[Snapshot] Direct cleanup removed {removed_direct} attributes")
            except Exception:
                if self._config.debug_mode:
                    print("[Snapshot] Direct cleanup failed (ignored)")

    async def clean_snapshot(self, snapshot: json) -> None:
        """Remove heavy fields from the snapshot tree before LLM formatting.

        This modifies the provided snapshot in-place, pruning keys that are not
        required for the LLM view while preserving the raw snapshot returned by
        the browser for any future processing needs elsewhere in the app.
        """
        if not isinstance(snapshot, dict):
            return

        tree = snapshot.get('tree')
        meta = snapshot.get('meta')
        if not isinstance(tree, dict):
            return

        keys_to_remove = {"attributes", "computed", "isLandmark", "refInjectedCount", "totalProcessed", "totalIncluded", "refStart", "refPrefix"}

        def prune_node(node: dict) -> None:
            if not isinstance(node, dict):
                return
            # Remove unwanted keys on this node
            for key in keys_to_remove:
                if key in node:
                    node.pop(key, None)
            # Recurse into children if present
            children = node.get("children")
            if isinstance(children, list):
                for child in children:
                    prune_node(child)

        prune_node(tree)
        prune_node(meta)
    
    async def format_snapshot(self, snapshot: json) -> str:
        """Format the snapshot for the LLM by labeling nodes as "role tag [ref=#]".

        Removes redundant 'tag', 'role', and 'ref' keys from each node and nests
        the remaining data under the labeled key. Children are recursively
        transformed the same way.
        """
        def label_for(node: dict) -> str:
            role = node.get('role') or ''
            tag = node.get('tag') or ''
            ref = node.get('ref')
            parts = [p for p in [role, tag] if p]
            label = " ".join(parts).strip() or "node"
            if ref:
                label = f"{label} [ref={ref}]"
            return label

        def transform_node(node: dict):
            if not isinstance(node, dict):
                return node
            label = label_for(node)

            # Copy remaining fields except 'tag', 'role', 'ref', and recursively transform children
            payload = {}
            for k, v in node.items():
                if k in {"tag", "role", "ref"}:
                    continue
                if k == "children" and isinstance(v, list):
                    payload_children = []
                    for child in v:
                        payload_children.append(transform_node(child))
                    payload["children"] = payload_children
                else:
                    payload[k] = v

            return {label: payload}

        formatted = {}
        if isinstance(snapshot, dict):
            if isinstance(snapshot.get('meta'), dict):
                formatted['meta'] = snapshot['meta']
            tree = snapshot.get('tree')
            if isinstance(tree, dict):
                formatted['tree'] = transform_node(tree)
            elif isinstance(tree, list):
                formatted['tree'] = [transform_node(n) for n in tree]
            else:
                formatted['tree'] = tree

        return yaml.dump(formatted, sort_keys=False, default_flow_style=False)
    
    async def browser_snapshot(
        self
    ) -> str:
        """Take a screenshot of the current page and create accessibility snapshot"""
        await self._preflight_cleanup()

        # Read and inject the DOM snapshot script
        script_path = os.path.join(os.path.dirname(__file__), "..", "..", "static", "dom_snapshot.js")
        with open(script_path, 'r') as f:
            dom_script = f.read()
        
        # Inject the script and get the snapshot data
        # Load snapshot configuration from project root `config/snapshot.json`
        base_dir = os.path.dirname(__file__)
        config_path = os.path.abspath(os.path.join(base_dir, "..", "..", "..", "config", "snapshot.json"))
        if not os.path.isfile(config_path):
            raise FileNotFoundError(f"Snapshot configuration file not found at: {config_path}")

        with open(config_path, 'r', encoding='utf-8') as f:
            snapshot_config = json.load(f)
        
        # Expose the snapshot function in the page, then call it with config
        page = self._instance.page

        # Check if the snapshot function is already present
        try:
            has_function = await page.evaluate("() => typeof window.__weaveDomSnapshot === 'function'")
        except Exception:
            has_function = False

        if not has_function:
            # Prefer init script (persists across navigations) but do not force a reload here
            try:
                await page.add_init_script(dom_script)
            except Exception:
                pass

            # Immediately define in the current document without touching <script> elements
            try:
                await page.evaluate(dom_script)
            except Exception:
                if self._config.debug_mode:
                    print("[Snapshot] page.evaluate(dom_script) failed; will try frames if any")

            # For already-existing same-origin frames, attempt injection as well
            try:
                frames_iter = page.frames
            except Exception:
                frames_iter = []

            for frame in frames_iter or []:
                try:
                    await frame.evaluate(dom_script)
                except Exception:
                    # Ignore cross-origin or evaluation failures silently
                    continue

        # Verify presence before use
        try:
            has_function = await page.evaluate("() => typeof window.__weaveDomSnapshot === 'function'")
        except Exception:
            has_function = False

        if not has_function:
            raise RuntimeError(
                "Failed to initialize window.__weaveDomSnapshot. On CSP/Trusted Types pages, "
                "use init scripts before navigation or ensure evaluate() injection succeeds."
            )

        snapshot = await page.evaluate("window.__weaveDomSnapshot", snapshot_config)

        # Remove heavy fields from the snapshot tree for the LLM-facing output
        await self.clean_snapshot(snapshot)

        if not snapshot:
            if self._config.debug_mode:
                print("[Snapshot] No accessibility data available")
            return "No accessibility data available"

        # Process snapshot into YAML LLM-ready output
        formatted_yaml = await self.format_snapshot(snapshot)
        yaml_snapshot = f"```yaml\n{formatted_yaml}```"
        return yaml_snapshot

# Usage functions for Weave integration
async def snapshot() -> str:
    """Take a screenshot of the current page and create accessibility snapshot"""
    config = get_weave_config().snapshot
    screenshot_tool = Snapshot(config)
    return await screenshot_tool.browser_snapshot()
