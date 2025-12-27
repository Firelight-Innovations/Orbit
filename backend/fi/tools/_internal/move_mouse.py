import asyncio
import random
import math
from typing import Tuple, List, Optional
from enum import Enum
from playwright.async_api import Page, TimeoutError as PlaywrightTimeoutError

from fi_interaction.tools._internal import snapshot
from src.core import registry
from src.browser.instance import BrowserInstance
from src.core.config import get_weave_config



class MovementStyle(Enum):
    BEZIER_SMOOTH = "bezier_smooth"
    BEZIER_ANGULAR = "bezier_angular"  
    JAGGED = "jagged"
    DIRECT_WITH_NOISE = "direct_with_noise"


class NaturalMouseMovement:
    """Handles natural, human-like mouse movements with multiple path styles"""
    
    @staticmethod
    def calculate_movement_duration(distance: float) -> float:
        """Calculate realistic movement duration based on distance"""
        # Fitts' Law inspired timing with human variation
        # Base: 200-800 pixels per second depending on distance
        
        if distance < 20:
            base_duration = 0.1  # Very short movements
        elif distance < 100:
            base_duration = 0.2 + (distance / 500)  # 0.2-0.4s
        elif distance < 300:
            base_duration = 0.4 + (distance / 600)  # 0.4-0.9s
        elif distance < 600:
            base_duration = 0.8 + (distance / 800)  # 0.8-1.6s
        else:
            base_duration = 1.2 + (distance / 1000)  # 1.2s+ for long movements
        
        # Add human variation (±30%)
        variation = random.uniform(0.7, 1.3)
        return max(0.05, base_duration * variation)
    
    @staticmethod
    def choose_movement_style(distance: float, start_x: float, start_y: float, 
                            end_x: float, end_y: float) -> MovementStyle:
        """Choose movement style based on distance and context"""
        
        # Shorter movements tend to be more direct
        if distance < 50:
            return random.choice([MovementStyle.DIRECT_WITH_NOISE, MovementStyle.BEZIER_SMOOTH])
        elif distance < 150:
            return random.choice([
                MovementStyle.BEZIER_SMOOTH, 
                MovementStyle.BEZIER_ANGULAR, 
                MovementStyle.DIRECT_WITH_NOISE
            ])
        else:
            # Longer movements have more variety
            weights = [0.3, 0.3, 0.25, 0.15]  # smooth, angular, jagged, direct
            return random.choices([
                MovementStyle.BEZIER_SMOOTH,
                MovementStyle.BEZIER_ANGULAR, 
                MovementStyle.JAGGED,
                MovementStyle.DIRECT_WITH_NOISE
            ], weights=weights)[0]
    
    @staticmethod
    def generate_smooth_bezier_path(start_x: float, start_y: float, end_x: float, end_y: float,
                                  num_points: int = 25) -> List[Tuple[float, float]]:
        """Generate a smooth, natural bezier curve"""
        distance = math.sqrt((end_x - start_x) ** 2 + (end_y - start_y) ** 2)
        
        # Control points for natural curve
        control_offset = min(distance * random.uniform(0.15, 0.4), 120)
        
        # Perpendicular direction for natural arc
        dx, dy = end_x - start_x, end_y - start_y
        perp_x, perp_y = -dy, dx
        length = math.sqrt(perp_x**2 + perp_y**2)
        if length > 0:
            perp_x, perp_y = perp_x/length, perp_y/length
        
        # Control points
        mid_x, mid_y = (start_x + end_x) / 2, (start_y + end_y) / 2
        curve_direction = random.choice([-1, 1])
        
        control1_x = start_x + (mid_x - start_x) * 0.3 + perp_x * control_offset * curve_direction * 0.5
        control1_y = start_y + (mid_y - start_y) * 0.3 + perp_y * control_offset * curve_direction * 0.5
        
        control2_x = end_x - (end_x - mid_x) * 0.3 + perp_x * control_offset * curve_direction * 0.8
        control2_y = end_y - (end_y - mid_y) * 0.3 + perp_y * control_offset * curve_direction * 0.8
        
        return NaturalMouseMovement._calculate_bezier_points(
            start_x, start_y, control1_x, control1_y, control2_x, control2_y, end_x, end_y, num_points
        )
    
    @staticmethod
    def generate_angular_bezier_path(start_x: float, start_y: float, end_x: float, end_y: float,
                                   num_points: int = 20) -> List[Tuple[float, float]]:
        """Generate a more angular, human-like path with direction changes"""
        # Create intermediate waypoint for angular movement
        dx, dy = end_x - start_x, end_y - start_y
        
        # Waypoint roughly 1/3 to 2/3 of the way
        waypoint_ratio = random.uniform(0.25, 0.75)
        waypoint_x = start_x + dx * waypoint_ratio
        waypoint_y = start_y + dy * waypoint_ratio
        
        # Add perpendicular offset for angular path
        perp_x, perp_y = -dy, dx
        length = math.sqrt(perp_x**2 + perp_y**2)
        if length > 0:
            perp_x, perp_y = perp_x/length, perp_y/length
        
        offset = random.uniform(10, min(50, math.sqrt(dx**2 + dy**2) * 0.3))
        waypoint_x += perp_x * offset * random.choice([-1, 1])
        waypoint_y += perp_y * offset * random.choice([-1, 1])
        
        # Create two bezier segments
        mid_points = int(num_points * waypoint_ratio)
        
        path1 = NaturalMouseMovement._calculate_bezier_points(
            start_x, start_y, start_x + dx*0.1, start_y + dy*0.1,
            waypoint_x - dx*0.1, waypoint_y - dy*0.1, waypoint_x, waypoint_y, mid_points
        )
        
        path2 = NaturalMouseMovement._calculate_bezier_points(
            waypoint_x, waypoint_y, waypoint_x + dx*0.1, waypoint_y + dy*0.1,
            end_x - dx*0.1, end_y - dy*0.1, end_x, end_y, num_points - mid_points
        )
        
        return path1[:-1] + path2  # Remove duplicate waypoint
    
    @staticmethod
    def generate_jagged_path(start_x: float, start_y: float, end_x: float, end_y: float,
                           num_points: int = 15) -> List[Tuple[float, float]]:
        """Generate a jagged, imperfect human path with multiple direction changes"""
        dx, dy = end_x - start_x, end_y - start_y
        distance = math.sqrt(dx**2 + dy**2)
        
        points = [(start_x, start_y)]
        
        # Create 2-4 intermediate waypoints
        num_waypoints = random.randint(2, min(4, max(2, int(distance / 100))))
        
        for i in range(1, num_waypoints + 1):
            # Base position along the line
            ratio = i / (num_waypoints + 1)
            base_x = start_x + dx * ratio
            base_y = start_y + dy * ratio
            
            # Add random offset (higher early in movement)
            max_offset = min(30, distance * 0.15) * (1.5 - ratio * 0.5)
            offset_x = random.uniform(-max_offset, max_offset)
            offset_y = random.uniform(-max_offset, max_offset)
            
            points.append((base_x + offset_x, base_y + offset_y))
        
        points.append((end_x, end_y))
        
        # Smooth the jagged path slightly with micro-bezier curves
        smooth_points = []
        for i in range(len(points) - 1):
            start_pt = points[i]
            end_pt = points[i + 1]
            
            segment_points = max(2, num_points // len(points))
            segment = NaturalMouseMovement._calculate_bezier_points(
                start_pt[0], start_pt[1], start_pt[0], start_pt[1],
                end_pt[0], end_pt[1], end_pt[0], end_pt[1], segment_points
            )
            
            if i == 0:
                smooth_points.extend(segment)
            else:
                smooth_points.extend(segment[1:])  # Skip duplicate point
        
        return smooth_points
    
    @staticmethod
    def generate_direct_with_noise_path(start_x: float, start_y: float, end_x: float, end_y: float,
                                      num_points: int = 12) -> List[Tuple[float, float]]:
        """Generate a mostly direct path with human hand tremor/noise"""
        points = []
        
        for i in range(num_points + 1):
            ratio = i / num_points
            
            # Linear interpolation
            x = start_x + (end_x - start_x) * ratio
            y = start_y + (end_y - start_y) * ratio
            
            # Add decreasing noise (more at start, less at end)
            noise_factor = (1 - ratio * 0.7) * 2
            x += random.uniform(-noise_factor, noise_factor)
            y += random.uniform(-noise_factor, noise_factor)
            
            points.append((x, y))
        
        return points
    
    @staticmethod
    def _calculate_bezier_points(start_x: float, start_y: float, cp1_x: float, cp1_y: float,
                               cp2_x: float, cp2_y: float, end_x: float, end_y: float, 
                               num_points: int) -> List[Tuple[float, float]]:
        """Calculate cubic bezier curve points"""
        points = []
        for i in range(num_points + 1):
            t = i / num_points
            
            # Cubic bezier formula
            x = (1-t)**3 * start_x + 3*(1-t)**2*t * cp1_x + 3*(1-t)*t**2 * cp2_x + t**3 * end_x
            y = (1-t)**3 * start_y + 3*(1-t)**2*t * cp1_y + 3*(1-t)*t**2 * cp2_y + t**3 * end_y
            
            # Add subtle hand tremor
            x += random.uniform(-0.5, 0.5)
            y += random.uniform(-0.5, 0.5)
            
            points.append((x, y))
        
        return points
    
    @staticmethod
    def add_human_imperfections(points: List[Tuple[float, float]], 
                              distance: float) -> List[Tuple[float, float]]:
        """Add human imperfections: corrections, overshoots, micro-pauses"""
        if len(points) < 3:
            return points
        
        enhanced_points = []
        
        for i, (x, y) in enumerate(points):
            enhanced_points.append((x, y))
            
            # Add occasional corrections (small backtrack then forward)
            if i > 2 and i < len(points) - 3 and random.random() < 0.15:  # 15% chance
                # Small backtrack
                prev_x, prev_y = points[i-1]
                back_x = x + (prev_x - x) * 0.3
                back_y = y + (prev_y - y) * 0.3
                enhanced_points.append((back_x, back_y))
                
                # Forward correction
                next_x, next_y = points[i+1]
                corr_x = x + (next_x - x) * 0.2
                corr_y = y + (next_y - y) * 0.2
                enhanced_points.append((corr_x, corr_y))
        
        # Add final overshoot and correction (30% chance for longer movements)
        if distance > 100 and random.random() < 0.3:
            final_x, final_y = points[-1]
            prev_x, prev_y = points[-2]
            
            # Overshoot
            overshoot_factor = random.uniform(1.02, 1.08)
            overshoot_x = prev_x + (final_x - prev_x) * overshoot_factor
            overshoot_y = prev_y + (final_y - prev_y) * overshoot_factor
            enhanced_points.append((overshoot_x, overshoot_y))
            
            # Correction back to target
            enhanced_points.append((final_x, final_y))
        
        return enhanced_points
    
    @staticmethod
    def calculate_dynamic_timing(points: List[Tuple[float, float]], 
                               total_duration: float) -> List[float]:
        """Calculate timing for each point with acceleration/deceleration"""
        if len(points) <= 1:
            return [0]
        
        # Calculate distances between points
        distances = []
        total_path_distance = 0
        
        for i in range(1, len(points)):
            dist = math.sqrt((points[i][0] - points[i-1][0])**2 + 
                           (points[i][1] - points[i-1][1])**2)
            distances.append(dist)
            total_path_distance += dist
        
        # Generate timing with human acceleration curve
        timings = [0]  # Start at time 0
        accumulated_time = 0
        
        for i, distance in enumerate(distances):
            # Progress through the movement (0 to 1)
            progress = sum(distances[:i+1]) / total_path_distance if total_path_distance > 0 else 0
            
            # Human acceleration curve: slow start, fast middle, slow end
            if progress < 0.2:  # Start slow (acceleration phase)
                speed_multiplier = 0.4 + progress * 2  # 0.4 to 0.8
            elif progress < 0.8:  # Fast middle
                speed_multiplier = 0.8 + (progress - 0.2) * 0.5  # 0.8 to 1.1
            else:  # Slow end (deceleration phase)
                speed_multiplier = 1.1 - (progress - 0.8) * 2  # 1.1 to 0.7
            
            # Add human variation
            speed_multiplier *= random.uniform(0.85, 1.15)
            
            # Calculate time for this segment
            if total_path_distance > 0:
                base_time = (distance / total_path_distance) * total_duration
                actual_time = base_time / speed_multiplier
            else:
                actual_time = total_duration / len(distances)
            
            accumulated_time += actual_time
            timings.append(accumulated_time)
        
        return timings
    
    @staticmethod
    async def perform_natural_movement(page: Page, start_x: float, start_y: float,
                                     end_x: float, end_y: float, cursor=None, _instance=None) -> None:
        """Perform a complete natural mouse movement with all human characteristics"""
        config = get_weave_config()
        timing_config = config.interaction_timing
        speed_multiplier = timing_config.speed_multiplier
        
        # Calculate distance
        distance = math.sqrt((end_x - start_x) ** 2 + (end_y - start_y) ** 2)
        
        # Skip complex animation for very short distances
        if distance < 3:
            if cursor and cursor.is_initialized:
                await cursor.animate_to_position(end_x, end_y, duration=50)
            else:
                await page.mouse.move(end_x, end_y)
            return
        
        # Calculate total movement duration
        total_duration = NaturalMouseMovement.calculate_movement_duration(distance) / speed_multiplier
        
        # Choose movement style
        style = NaturalMouseMovement.choose_movement_style(distance, start_x, start_y, end_x, end_y)
        
        # Generate path based on chosen style
        num_points = max(8, min(30, int(distance / 15)))  # Adaptive point count
        
        if style == MovementStyle.BEZIER_SMOOTH:
            path_points = NaturalMouseMovement.generate_smooth_bezier_path(
                start_x, start_y, end_x, end_y, num_points)
        elif style == MovementStyle.BEZIER_ANGULAR:
            path_points = NaturalMouseMovement.generate_angular_bezier_path(
                start_x, start_y, end_x, end_y, num_points)
        elif style == MovementStyle.JAGGED:
            path_points = NaturalMouseMovement.generate_jagged_path(
                start_x, start_y, end_x, end_y, num_points)
        else:  # DIRECT_WITH_NOISE
            path_points = NaturalMouseMovement.generate_direct_with_noise_path(
                start_x, start_y, end_x, end_y, num_points)
        
        # Add human imperfections
        path_points = NaturalMouseMovement.add_human_imperfections(path_points, distance)
        
        # Calculate dynamic timing
        timings = NaturalMouseMovement.calculate_dynamic_timing(path_points, total_duration)
        
        # Execute the movement
        prev_time = 0
        for i, ((x, y), target_time) in enumerate(zip(path_points, timings)):
            # Calculate sleep duration
            sleep_duration = max(0.01, target_time - prev_time)
            
            # Add occasional micro-hesitations (human uncertainty)
            if i > 0 and random.random() < 0.08:  # 8% chance
                sleep_duration += random.uniform(0.02, 0.08)
            
            # Move cursor
            if cursor and cursor.is_initialized:
                await _instance.scroll_if_needed(x, y)
                await cursor.set_position(x, y)
            else:
                await _instance.scroll_if_needed(x, y)
                await page.mouse.move(x, y)
            
            # Wait for calculated duration
            if sleep_duration > 0:
                await asyncio.sleep(sleep_duration)
            
            prev_time = target_time

    @staticmethod
    async def perform_natural_movement_with_suppression(page: Page, start_x: float, start_y: float,
                                                   end_x: float, end_y: float, cursor=None,
                                                   suppress_duration: int = 200, _instance=None) -> None:
        """Perform natural movement with automatic mouse following suppression"""
        
        # Calculate distance and duration
        distance = math.sqrt((end_x - start_x) ** 2 + (end_y - start_y) ** 2)
        total_duration = NaturalMouseMovement.calculate_movement_duration(distance)
        
        # Suppress mouse following for the entire movement plus buffer
        total_suppress_time = int((total_duration * 1000) + suppress_duration)
        
        if cursor and cursor.is_initialized:
            # Enable suppression before starting movement
            await cursor.suppress_mouse_following(True, total_suppress_time)
        
        # Perform the actual natural movement
        await NaturalMouseMovement.perform_natural_movement(
            page, start_x, start_y, end_x, end_y, cursor, _instance
        )


async def move_mouse_to_ref(
    ref: str,
    timeout: int = 30000,
    apply_stealth: bool = True,
    suppress_duration: int = 200
) -> tuple[str, Optional[object]]:
    """
    Move the playwright virtual cursor to a ref from its current position using humanized methods.
    Updated to better handle Date elements.
    
    Args:
        ref: The accessibility tree reference to move to
        timeout: Timeout in milliseconds for element operations
        apply_stealth: Whether to apply stealth measures (delays, randomization)
        suppress_duration: Duration in ms to suppress mouse following after movement
    
    Returns:
        tuple: (status_message, locator_object_or_none)
    """
    try:
        _instance: BrowserInstance = registry.get('browser_instance')
        page = _instance.page
        cursor = _instance.cursor
        
        # Enhanced stealth measures
        if apply_stealth:
            await asyncio.sleep(0.3 + (0.8 * random.random()))
        
        # Get current position for natural movement
        if cursor and cursor.is_initialized:
            try:
                current_pos = await cursor.get_current_position()
                current_x = current_pos.get('x', 400)
                current_y = current_pos.get('y', 300)
            except:
                current_x, current_y = 400, 300
        else:
            current_x, current_y = 400, 300

        # Try multiple selector strategies for better compatibility
        selectors_to_try = [
            f"[ref='{ref}']",  # Direct ref attribute
            f"*[data-ref='{ref}']",  # Data ref attribute
            f"*[id='{ref}']",  # ID matching ref
            # For Date elements specifically, try additional selectors
            f"input[type='date'][ref='{ref}']",
            f"*[role='textbox'][ref='{ref}']",
            f"*[aria-label*='Date of Birth'][ref='{ref}']",
        ]
        
        locator = None
        for selector in selectors_to_try:
            try:
                test_locator = page.locator(selector).first
                if await test_locator.count() > 0:
                    locator = test_locator
                    break
            except:
                continue

        if locator is None:
            # Fallback: try to find by ref in any element
            locator = page.locator(f"*").filter(has=page.locator(f"[ref='{ref}']")).first

        # Wait for element
        await locator.wait_for(state="attached", timeout=timeout)
        await locator.wait_for(state="visible", timeout=timeout)
        
        # Get element position
        box = await locator.bounding_box()
        if box:
            if apply_stealth:
                target_x = box['x'] + box['width'] * random.uniform(0.25, 0.75)
                target_y = box['y'] + box['height'] * random.uniform(0.25, 0.75)
            else:
                target_x = box['x'] + box['width'] / 2
                target_y = box['y'] + box['height'] / 2
            
            # Use natural movement with suppression
            await NaturalMouseMovement.perform_natural_movement_with_suppression(
                page, current_x, current_y, target_x, target_y, cursor, suppress_duration, _instance
            )
            
            # Set cursor to hovering state as requested
            if cursor and cursor.is_initialized:
                await cursor.set_cursor_state('hovering')
            
            return f"Successfully moved cursor to element with ref '{ref}' using natural movement", locator
        else:
            return f"Error: Could not get bounding box for element with ref '{ref}'", None
    
    except Exception as e:
        return f"Error moving cursor to element with ref '{ref}': {str(e)}", None
