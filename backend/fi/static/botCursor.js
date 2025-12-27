window.addEventListener('DOMContentLoaded', () => {
    // --- 1. DEFINE STYLES ---
    const style = document.createElement('style');
    style.textContent = `
        #bot-cursor {
            position: fixed;
            top: 0;
            left: 0;
            width: 24px;
            height: 24px;
            background: rgba(59, 130, 246, 0.4);
            border: 2px solid rgba(255, 255, 255, 0.8);
            border-radius: 50%;
            z-index: 10001; /* Higher than other elements */
            pointer-events: none; /* Cursor should not be interactive */
            transition: transform 0.1s ease-out, width 0.2s ease, height 0.2s ease, background-color 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 0 15px rgba(59, 130, 246, 0.5);
        }

        #bot-cursor-dot {
            width: 4px;
            height: 4px;
            background-color: white;
            border-radius: 50%;
            transition: transform 0.2s ease;
        }

        #bot-cursor.clicked {
            transform: scale(1.4);
            background-color: rgba(30, 64, 175, 0.6);
        }
        
        #bot-cursor.clicked #bot-cursor-dot {
            transform: scale(0.8);
        }
    `;
    document.head.appendChild(style);

    // --- 2. CREATE CURSOR HTML ---
    const cursor = document.createElement('div');
    cursor.id = 'bot-cursor';
    
    const cursorDot = document.createElement('div');
    cursorDot.id = 'bot-cursor-dot';
    
    cursor.appendChild(cursorDot);
    document.body.appendChild(cursor);

    // --- 3. CURSOR POSITION TRACKING (UPDATED WITH SUPPRESSION) ---
    
    // Initialize cursor position tracking
    window.playwrightCursor = { 
        x: window.innerWidth / 2, 
        y: window.innerHeight / 2, 
        timestamp: Date.now(),
        type: 'init'
    };

    // Flag to temporarily disable mouse following during automation
    let suppressMouseFollowing = false;
    let suppressTimeout = null;

    // Track all mouse events but respect suppression flag
    ['mousemove', 'mousedown', 'mouseup', 'click', 'hover'].forEach(eventType => {
        document.addEventListener(eventType, (event) => {
            // Always update position tracking data
            window.playwrightCursor = {
                x: event.clientX,
                y: event.clientY,
                timestamp: Date.now(),
                type: event.type
            };
            
            // Only move visual cursor if not suppressed
            if (!suppressMouseFollowing) {
                updateBotCursorPosition(event.clientX, event.clientY);
                
                // Trigger appropriate visual feedback
                if (event.type === 'click' || event.type === 'mousedown') {
                    document.dispatchEvent(new CustomEvent('bot-cursor-click'));
                }
            }
        });
    });

    // --- 4. CURSOR TRAIL SYSTEM ---
    const trailDots = [];
    const maxTrailLength = 8;

    function createTrailDot(x, y) {
        const dot = document.createElement('div');
        dot.className = 'bot-cursor-trail-dot';
        dot.style.left = `${x}px`;
        dot.style.top = `${y}px`;
        document.body.appendChild(dot);
        trailDots.push(dot);

        if (trailDots.length > maxTrailLength) {
            const oldDot = trailDots.shift();
            oldDot.remove();
        }
    }

    // --- 5. POSITION UPDATE FUNCTIONS ---
    
    function updateBotCursorPosition(x, y, createTrail = false) {
        cursor.style.transform = `translate3d(${x - 12}px, ${y - 12}px, 0)`;
        if (createTrail) {
            createTrailDot(x, y);
        }
    }

    // --- 6. API FOR EXTERNAL ACCESS (UPDATED) ---
    
    // Expose functions for Playwright to use
    window.botCursorAPI = {
        // Get current cursor position
        getCurrentPosition: () => {
            return {
                x: window.playwrightCursor.x,
                y: window.playwrightCursor.y,
                timestamp: window.playwrightCursor.timestamp,
                type: window.playwrightCursor.type
            };
        },
        
        // Set cursor position programmatically with suppression
        setCursorPosition: (x, y, options = {}) => {
            // Temporarily suppress mouse following
            suppressMouseFollowing = true;
            
            // Clear any existing timeout
            if (suppressTimeout) {
                clearTimeout(suppressTimeout);
            }
            
            // Update position tracking
            window.playwrightCursor.x = x;
            window.playwrightCursor.y = y;
            window.playwrightCursor.timestamp = Date.now();
            window.playwrightCursor.type = options.type || 'programmatic';
            
            // Move the visual cursor
            updateBotCursorPosition(x, y, options.createTrail);
            
            // Re-enable mouse following after delay
            const suppressDuration = options.suppressDuration || 150;
            suppressTimeout = setTimeout(() => {
                suppressMouseFollowing = false;
                suppressTimeout = null;
            }, suppressDuration);
        },
        
        // Trigger click animation
        triggerClick: () => {
            cursor.classList.add('clicked');
            setTimeout(() => {
                cursor.classList.remove('clicked');
            }, 200);
            
            document.dispatchEvent(new CustomEvent('bot-cursor-click'));
        },
        
        // Set cursor state
        setCursorState: (state) => {
            cursor.classList.remove('typing', 'hovering', 'clicked');
            if (state && state !== 'normal') {
                cursor.classList.add(state);
            }
        },
        
        // Smooth move animation with suppression
        animateToPosition: (targetX, targetY, duration = 500, options = {}) => {
            // Suppress mouse following during entire animation
            suppressMouseFollowing = true;
            
            // Clear any existing timeout
            if (suppressTimeout) {
                clearTimeout(suppressTimeout);
            }
            
            const currentPos = window.playwrightCursor;
            const startX = currentPos.x;
            const startY = currentPos.y;
            const startTime = Date.now();
            
            return new Promise((resolve) => {
                function animate() {
                    const elapsed = Date.now() - startTime;
                    const progress = Math.min(elapsed / duration, 1);
                    
                    const easeProgress = options.easing === 'linear' ? progress : 1 - Math.pow(1 - progress, 3);
                    
                    const currentX = startX + (targetX - startX) * easeProgress;
                    const currentY = startY + (targetY - startY) * easeProgress;
                    
                    // Update position without triggering additional suppression
                    window.playwrightCursor.x = currentX;
                    window.playwrightCursor.y = currentY;
                    window.playwrightCursor.timestamp = Date.now();
                    window.playwrightCursor.type = 'animation';
                    
                    updateBotCursorPosition(currentX, currentY, options.showTrail);
                    
                    if (progress < 1) {
                        requestAnimationFrame(animate);
                    } else {
                        // Re-enable mouse following after animation plus buffer
                        const bufferTime = options.suppressDuration || 200;
                        suppressTimeout = setTimeout(() => {
                            suppressMouseFollowing = false;
                            suppressTimeout = null;
                        }, bufferTime);
                        
                        resolve({ x: targetX, y: targetY });
                    }
                }
                
                animate();
            });
        },

        // Manual suppression control (for complex operations)
        suppressMouseFollowing: (suppress, duration = 0) => {
            suppressMouseFollowing = suppress;
            
            if (suppressTimeout) {
                clearTimeout(suppressTimeout);
                suppressTimeout = null;
            }
            
            if (suppress && duration > 0) {
                suppressTimeout = setTimeout(() => {
                    suppressMouseFollowing = false;
                    suppressTimeout = null;
                }, duration);
            }
        },

        // Get suppression state
        isMouseFollowingSuppressed: () => {
            return suppressMouseFollowing;
        },

        // Hide/Show cursor
        setVisibility: (visible) => {
            cursor.style.display = visible ? 'flex' : 'none';
        },

        // Clear trail dots
        clearTrail: () => {
            trailDots.forEach(dot => {
                if (dot.parentElement) {
                    dot.remove();
                }
            });
            trailDots.length = 0;
        }
    };

    // --- 7. EVENT LISTENERS ---
    
    // Listen for custom event to move the cursor
    document.addEventListener('bot-cursor-move', (e) => {
        const { x, y } = e.detail;
        // Use translate3d for hardware acceleration
        cursor.style.transform = `translate3d(${x - 12}px, ${y - 12}px, 0)`;
    });

    // Listen for custom event for click feedback
    document.addEventListener('bot-cursor-click', () => {
        cursor.classList.add('clicked');
        setTimeout(() => {
            cursor.classList.remove('clicked');
        }, 200); // Duration of the click animation
    });

    // --- 8. REAL-TIME POSITION BROADCASTING ---
    
    function broadcastPosition(x, y, type = 'update') {
        // This function would typically send data back to the Python side
        // For now, we'll just log it to the console.
        console.log(`Bot Cursor Position: x=${x}, y=${y}, type=${type}`);
    }

    // Enhanced position tracking with broadcasting (updated to use new setCursorPosition)
    const originalSetCursorPosition = window.botCursorAPI.setCursorPosition;
    window.botCursorAPI.setCursorPosition = function(x, y, options = {}) {
        originalSetCursorPosition(x, y, options);
        broadcastPosition(x, y, options.type || 'programmatic');
    };

    // --- 9. INITIALIZATION ---
    
    // Initialize cursor at center of screen
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    window.botCursorAPI.setCursorPosition(centerX, centerY, { 
        type: 'init', 
        suppressDuration: 100 
    });

    console.log('Bot cursor initialized with suppression-based tracking API');
});