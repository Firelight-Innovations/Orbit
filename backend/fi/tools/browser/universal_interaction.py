import asyncio
import random
import re
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple, Union
from dataclasses import dataclass, field
from abc import ABC, abstractmethod
from playwright.async_api import Page, Locator

# Import your existing browser instance registry
from src.browser.instance import BrowserInstance
from src.core import registry

@dataclass
class ElementCandidate:
    """Represents a potential element match with confidence scoring"""
    locator: Optional[Locator]
    confidence: float
    strategy: str
    element_info: Dict[str, Any] = field(default_factory=dict)
    actions: List[str] = field(default_factory=list)

@dataclass
class ComponentState:
    """Tracks dynamic component state information"""
    has_react: bool = False
    has_vue: bool = False
    has_angular: bool = False
    is_contenteditable: bool = False
    has_event_listeners: bool = False
    is_visible: bool = False
    is_interactive: bool = False
    framework_type: Optional[str] = None
    component_id: Optional[str] = None

class DetectionStrategy(ABC):
    """Base class for element detection strategies"""
    
    @abstractmethod
    async def find_candidates(self, page: Page, intent: str) -> List[ElementCandidate]:
        pass

class AccessibilityStrategy(DetectionStrategy):
    """Primary strategy using accessibility information"""
    
    async def find_candidates(self, page: Page, intent: str) -> List[ElementCandidate]:
        candidates = []
        
        # Parse intent for role and name
        parsed_intent = self._parse_intent(intent)
        
        # Strategy 1: Use role + name (most reliable)
        if parsed_intent.get('role') and parsed_intent.get('name'):
            try:
                locator = page.get_by_role(
                    parsed_intent['role'], 
                    name=parsed_intent['name'], 
                    exact=parsed_intent.get('exact', False)
                )
                count = await locator.count()
                if count > 0:
                    candidates.append(ElementCandidate(
                        locator=locator,
                        confidence=0.95,
                        strategy='accessibility_role_name',
                        element_info=parsed_intent
                    ))
            except Exception:
                pass
        
        # Strategy 2: Use accessible name/label
        if parsed_intent.get('name'):
            try:
                label_locator = page.get_by_label(parsed_intent['name'])
                if await label_locator.count() > 0:
                    candidates.append(ElementCandidate(
                        locator=label_locator,
                        confidence=0.8,
                        strategy='accessibility_label',
                        element_info=parsed_intent
                    ))
            except Exception:
                pass
        
        return candidates
    
    def _parse_intent(self, intent: str) -> Dict[str, Any]:
        """Parse natural language intent into structured data"""
        intent_lower = intent.lower()
        
        # Common role mappings
        role_mapping = {
            'button': ['button', 'btn', 'submit', 'click'],
            'textbox': ['input', 'text', 'field', 'box', 'search'],
            'link': ['link', 'navigate', 'go to'],
            'checkbox': ['checkbox', 'check', 'select'],
            'radio': ['radio', 'option', 'choice'],
            'combobox': ['dropdown', 'select', 'combo'],
            'row': ['row', 'item', 'entry'],
            'tab': ['tab', 'panel'],
            'menuitem': ['menu', 'option']
        }
        
        result = {'exact': False}
        
        # Detect role
        for role, keywords in role_mapping.items():
            if any(keyword in intent_lower for keyword in keywords):
                result['role'] = role
                break
        
        # Extract quoted text as exact name
        import re
        quoted_match = re.search(r'["\']([^"\']+)["\']', intent)
        if quoted_match:
            result['name'] = quoted_match.group(1)
            result['exact'] = True
        else:
            # Extract key terms as name
            words = intent_lower.split()
            # Remove common action words
            action_words = {'click', 'type', 'select', 'choose', 'find', 'locate'}
            name_words = [w for w in words if w not in action_words and len(w) > 2]
            if name_words:
                result['name'] = ' '.join(name_words[:3])  # Take first 3 meaningful words
        
        return result

class PatternMatchingStrategy(DetectionStrategy):
    """Pattern-based element detection for common UI patterns"""
    
    async def find_candidates(self, page: Page, intent: str) -> List[ElementCandidate]:
        candidates = []
        
        # Common UI patterns
        patterns = await self._get_ui_patterns(intent)
        
        for pattern in patterns:
            try:
                elements = await self._find_pattern_elements(page, pattern)
                for element in elements:
                    candidates.append(ElementCandidate(
                        locator=element['locator'],
                        confidence=element['confidence'],
                        strategy='pattern_matching',
                        element_info=element
                    ))
            except Exception:
                continue
        
        return candidates
    
    async def _get_ui_patterns(self, intent: str) -> List[Dict]:
        """Get UI patterns based on intent"""
        intent_lower = intent.lower()
        patterns = []
        
        # Email/recipient patterns
        if any(word in intent_lower for word in ['email', 'recipient', 'to', 'send']):
            patterns.extend([
                {'type': 'email_input', 'selectors': ['[type="email"]', '[placeholder*="email"]', '[aria-label*="email"]']},
                {'type': 'recipient', 'selectors': ['[aria-label*="recipient"]', '[placeholder*="recipient"]']},
                {'type': 'contenteditable_email', 'selectors': ['[contenteditable="true"][aria-label*="to"]']}
            ])
        
        # Search patterns
        if 'search' in intent_lower:
            patterns.append({
                'type': 'search',
                'selectors': ['[type="search"]', '[placeholder*="search"]', '[aria-label*="search"]']
            })
        
        # Button patterns
        if any(word in intent_lower for word in ['click', 'button', 'submit']):
            patterns.append({
                'type': 'button',
                'selectors': ['button', '[type="submit"]', '[role="button"]', 'a[onclick]']
            })
        
        return patterns
    
    async def _find_pattern_elements(self, page: Page, pattern: Dict) -> List[Dict]:
        """Find elements matching UI patterns"""
        elements = []
        
        for selector in pattern['selectors']:
            try:
                locator = page.locator(selector)
                count = await locator.count()
                
                for i in range(min(count, 3)):  # Limit matches
                    element = locator.nth(i)
                    if await element.is_visible():
                        elements.append({
                            'locator': element,
                            'pattern_type': pattern['type'],
                            'confidence': 0.65,
                            'selector': selector
                        })
            except Exception:
                continue
        
        return elements

class UniversalElementDetector:
    """Main element detection coordinator"""
    
    def __init__(self, page: Page):
        self.page = page
        self.strategies = [
            AccessibilityStrategy(),
            PatternMatchingStrategy()
        ]
    
    async def find_element(self, intent: str) -> Optional[ElementCandidate]:
        """Find best element match using multiple strategies"""
        all_candidates = []
        
        # Collect candidates from all strategies
        for strategy in self.strategies:
            try:
                candidates = await strategy.find_candidates(self.page, intent)
                all_candidates.extend(candidates)
            except Exception as e:
                continue  # Strategy failed, continue with others
        
        if not all_candidates:
            return None
        
        # Rank candidates by confidence and additional factors
        best_candidate = self._rank_candidates(all_candidates, intent)
        return best_candidate
    
    def _rank_candidates(self, candidates: List[ElementCandidate], intent: str) -> Optional[ElementCandidate]:
        """Rank candidates and return the best match"""
        if not candidates:
            return None
        
        # Score candidates
        scored_candidates = []
        
        for candidate in candidates:
            score = candidate.confidence
            
            # Boost accessibility-based matches
            if candidate.strategy.startswith('accessibility'):
                score += 0.1
            
            # Boost exact matches
            if candidate.element_info.get('exact'):
                score += 0.05
            
            scored_candidates.append((score, candidate))
        
        # Return highest scoring candidate
        best_score, best_candidate = max(scored_candidates, key=lambda x: x[0])
        return best_candidate

class AdaptiveInteractionEngine:
    """Handles different interaction patterns based on element type"""
    
    def __init__(self, page: Page):
        self.page = page
    
    async def interact_with_element(
        self, 
        candidate: ElementCandidate, 
        action: str, 
        value: str = None,
        apply_stealth: bool = True
    ) -> str:
        """Perform adaptive interaction based on element characteristics"""
        
        if action == 'click':
            try:
                if apply_stealth:
                    await asyncio.sleep(0.1 + random.random() * 0.1)
                
                await candidate.locator.click()
                return "Successfully clicked element"
                
            except Exception as e:
                return f"Click failed: {str(e)}"
        
        elif action == 'type' and value:
            try:
                await candidate.locator.click()  # Focus
                
                if apply_stealth:
                    await asyncio.sleep(0.1 + random.random() * 0.1)
                
                await candidate.locator.clear()
                await candidate.locator.fill(value)
                
                return f"Successfully typed '{value}' into element"
                
            except Exception as e:
                return f"Type failed: {str(e)}"
        
        return f"Unsupported action '{action}'"

class SmartWaitStrategy:
    """Intelligent waiting for dynamic elements"""
    
    def __init__(self, page: Page):
        self.page = page
    
    async def wait_for_interactive_element(
        self, 
        detector: UniversalElementDetector, 
        intent: str, 
        max_attempts: int = 3
    ) -> Optional[ElementCandidate]:
        """Wait for element to become available and interactive"""
        
        for attempt in range(max_attempts):
            # Try to find element
            candidate = await detector.find_element(intent)
            
            if candidate and await self._is_truly_interactive(candidate.locator):
                return candidate
            
            # Try activation strategies
            await self._trigger_component_activation()
            
            # Progressive wait
            wait_time = min(1000 * (1.5 ** attempt), 3000)  # Max 3 seconds
            await asyncio.sleep(wait_time / 1000)
        
        return None
    
    async def _is_truly_interactive(self, locator: Locator) -> bool:
        """Check if element is truly interactive"""
        try:
            # Basic checks
            if not await locator.is_visible():
                return False
            
            if not await locator.is_enabled():
                return False
            
            return True
            
        except Exception:
            return False
    
    async def _trigger_component_activation(self):
        """Try to activate dormant components"""
        activation_strategies = [
            # Move mouse to trigger hover states
            lambda: self.page.mouse.move(200, 200),
            # Tab navigation to focus elements
            lambda: self.page.keyboard.press('Tab'),
            # Scroll to trigger lazy loading
            lambda: self.page.evaluate('window.scrollBy(0, 100)'),
            # Click body to trigger focus events
            lambda: self.page.click('body'),
        ]
        
        for strategy in activation_strategies:
            try:
                await strategy()
                await asyncio.sleep(0.2)
            except Exception:
                continue

# Fixed Main Universal Interact Function
#function_tool
async def universal_interact(
    action: str,
    intent: str,
    value: Optional[str] = None,
    timeout: int = 30000,
    apply_stealth: bool = True
) -> str:
    """Universal interaction function that adapts to any website component.
    
    Uses multiple detection strategies to find and interact with elements regardless of
    the underlying JavaScript framework or implementation.
    
    Args:
        action: The action to perform ('click', 'type', 'select', 'hover')
        intent: Natural language description of what to interact with
        value: Value to input (for type/select actions)
        timeout: Maximum time to wait for element
        apply_stealth: Use human-like interaction patterns
    
    Returns:
        Success/error message string
    
    Examples:
        # Works on any email compose interface
        await universal_interact("type", "recipient email field", "user@example.com")
        
        # Works on any search interface  
        await universal_interact("type", "main search box", "python tutorials")
        
        # Works on any button regardless of implementation
        await universal_interact("click", "submit button")
        
        # Gmail-specific examples
        await universal_interact("type", "to field", "colleague@company.com")
        await universal_interact("click", "compose button")
        await universal_interact("type", "subject line", "Meeting Follow-up")
    """
    
    try:
        _instance: BrowserInstance = registry.get('browser_instance')
        page = _instance.page
        
        # Initialize detection and interaction systems
        detector = UniversalElementDetector(page)
        interaction_engine = AdaptiveInteractionEngine(page)
        wait_strategy = SmartWaitStrategy(page)
        
        # Find element using smart waiting and multiple strategies
        candidate = await wait_strategy.wait_for_interactive_element(
            detector, intent, max_attempts=3
        )
        
        if not candidate:
            return f"Could not locate interactive element matching: '{intent}'"
        
        # Perform adaptive interaction
        result = await interaction_engine.interact_with_element(
            candidate, action, value, apply_stealth
        )
        
        # Apply stealth timing
        if apply_stealth:
            await asyncio.sleep(0.3 + (0.2 * random.random()))
        
        # Wait for potential state changes
        try:
            await page.wait_for_load_state("networkidle", timeout=2000)
        except:
            pass  # Continue if network doesn't idle quickly
        
        return f"Universal {action} completed: {result}"
        
    except Exception as e:
        return f"Error performing universal {action} on '{intent}': {str(e)}"
