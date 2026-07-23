(() => {
    // This file is injected twice per page: once with page.evaluate() (for the
    // page that is already open) and once with add_init_script() (for every
    // later navigation). Bail out if we already ran so we never stack two
    // cursors -- two rAF loops writing the same transform is what made the old
    // cursor look like it was teleporting.
    if (window.botCursorAPI) return;

    // Tip of the arrow inside the SVG viewBox. Translating the wrapper by
    // (x - HOTSPOT_X, y - HOTSPOT_Y) puts the tip exactly on the click point.
    const HOTSPOT_X = 2;
    const HOTSPOT_Y = 2;
    const TRAIL_INTERVAL_MS = 40;

    function init() {
        // --- 1. STYLES ---
        const style = document.createElement('style');
        style.textContent = `
            #bot-cursor {
                position: fixed;
                top: 0;
                left: 0;
                width: 22px;
                height: 30px;
                z-index: 2147483647;
                pointer-events: none;
                display: block;
                will-change: transform;
                /* No transform transition here: the rAF loop owns translation.
                   A CSS transition on top of it fights the animation frames. */
            }

            #bot-cursor-arrow {
                position: absolute;
                top: 0;
                left: 0;
                transform-origin: ${HOTSPOT_X}px ${HOTSPOT_Y}px;
                transition: transform 0.12s ease-out;
                filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.35));
            }

            #bot-cursor-ring {
                position: absolute;
                top: ${HOTSPOT_Y}px;
                left: ${HOTSPOT_X}px;
                width: 14px;
                height: 14px;
                margin: -7px 0 0 -7px;
                border: 2px solid rgba(59, 130, 246, 0.9);
                border-radius: 50%;
                opacity: 0;
                transform: scale(0.3);
                pointer-events: none;
            }

            #bot-cursor.clicked #bot-cursor-arrow {
                transform: scale(0.82);
            }

            #bot-cursor.clicked #bot-cursor-ring {
                animation: bot-cursor-ripple 0.4s ease-out;
            }

            #bot-cursor.hovering #bot-cursor-arrow {
                transform: scale(1.12);
            }

            #bot-cursor.typing #bot-cursor-arrow {
                opacity: 0.55;
            }

            @keyframes bot-cursor-ripple {
                0%   { opacity: 0.9; transform: scale(0.3); }
                100% { opacity: 0;   transform: scale(2.6); }
            }

            .bot-cursor-trail-dot {
                position: fixed;
                width: 5px;
                height: 5px;
                margin: -2.5px 0 0 -2.5px;
                background: rgba(59, 130, 246, 0.55);
                border-radius: 50%;
                z-index: 2147483646;
                pointer-events: none;
                animation: bot-cursor-trail-fade 0.5s ease-out forwards;
            }

            @keyframes bot-cursor-trail-fade {
                to { opacity: 0; transform: scale(0.4); }
            }
        `;
        document.head.appendChild(style);

        // --- 2. CURSOR ELEMENT ---
        // A real pointer arrow: dark fill with a white outline so it stays
        // legible on both light and dark pages, like an OS cursor.
        const cursor = document.createElement('div');
        cursor.id = 'bot-cursor';
        cursor.innerHTML = `
            <div id="bot-cursor-ring"></div>
            <svg id="bot-cursor-arrow" width="22" height="30" viewBox="0 0 22 30"
                 xmlns="http://www.w3.org/2000/svg">
                <path d="M2 2 L2 22 L7.2 17.2 L10.7 25.4 L14.4 23.8 L10.9 15.9 L17.6 15.9 Z"
                      fill="#1a1a1a"
                      stroke="#ffffff"
                      stroke-width="1.7"
                      stroke-linejoin="round"/>
            </svg>
        `;
        document.body.appendChild(cursor);

        // --- 3. POSITION TRACKING ---
        window.playwrightCursor = {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
            timestamp: Date.now(),
            type: 'init'
        };

        let suppressMouseFollowing = false;
        let suppressTimeout = null;
        let animationFrame = null;
        let settleCurrent = null;

        function cancelAnimation() {
            if (animationFrame !== null) {
                cancelAnimationFrame(animationFrame);
                animationFrame = null;
            }
            // A superseded glide must still settle its promise. Python awaits
            // animateToPosition over the wire, so leaving it pending would hang
            // the caller until Playwright's evaluate timeout.
            if (settleCurrent) {
                const settle = settleCurrent;
                settleCurrent = null;
                settle({
                    x: window.playwrightCursor.x,
                    y: window.playwrightCursor.y,
                    cancelled: true
                });
            }
        }

        function releaseSuppression(delay) {
            if (suppressTimeout) clearTimeout(suppressTimeout);
            suppressTimeout = setTimeout(() => {
                suppressMouseFollowing = false;
                suppressTimeout = null;
            }, delay);
        }

        ['mousemove', 'mousedown', 'mouseup', 'click'].forEach(eventType => {
            document.addEventListener(eventType, (event) => {
                // Always record where the real mouse is, even while suppressed.
                window.playwrightCursor = {
                    x: event.clientX,
                    y: event.clientY,
                    timestamp: Date.now(),
                    type: event.type
                };

                if (suppressMouseFollowing) return;

                updateBotCursorPosition(event.clientX, event.clientY);
                if (event.type === 'click' || event.type === 'mousedown') {
                    document.dispatchEvent(new CustomEvent('bot-cursor-click'));
                }
            }, true);
        });

        // --- 4. TRAIL ---
        const trailDots = [];
        const maxTrailLength = 10;
        let lastTrailAt = 0;

        function createTrailDot(x, y) {
            // Throttled: the animation loop runs at 60fps and one DOM node per
            // frame is enough churn to visibly stutter the glide.
            const now = performance.now();
            if (now - lastTrailAt < TRAIL_INTERVAL_MS) return;
            lastTrailAt = now;

            const dot = document.createElement('div');
            dot.className = 'bot-cursor-trail-dot';
            dot.style.left = `${x}px`;
            dot.style.top = `${y}px`;
            document.body.appendChild(dot);
            trailDots.push(dot);

            if (trailDots.length > maxTrailLength) {
                trailDots.shift().remove();
            }
        }

        // --- 5. POSITION UPDATE ---
        function updateBotCursorPosition(x, y, createTrail = false) {
            cursor.style.transform =
                `translate3d(${x - HOTSPOT_X}px, ${y - HOTSPOT_Y}px, 0)`;
            if (createTrail) createTrailDot(x, y);
        }

        // easeInOutCubic: slow start, quick middle, gentle settle -- reads as a
        // hand moving to a target rather than a linear machine sweep.
        function easeInOutCubic(t) {
            return t < 0.5
                ? 4 * t * t * t
                : 1 - Math.pow(-2 * t + 2, 3) / 2;
        }

        // --- 6. PUBLIC API ---
        window.botCursorAPI = {
            getCurrentPosition: () => ({
                x: window.playwrightCursor.x,
                y: window.playwrightCursor.y,
                timestamp: window.playwrightCursor.timestamp,
                type: window.playwrightCursor.type
            }),

            setCursorPosition: (x, y, options = {}) => {
                cancelAnimation();
                suppressMouseFollowing = true;

                window.playwrightCursor.x = x;
                window.playwrightCursor.y = y;
                window.playwrightCursor.timestamp = Date.now();
                window.playwrightCursor.type = options.type || 'programmatic';

                updateBotCursorPosition(x, y, options.createTrail);
                releaseSuppression(options.suppressDuration || 150);
            },

            triggerClick: () => {
                cursor.classList.remove('clicked');
                // Force reflow so the ripple restarts on repeated clicks.
                void cursor.offsetWidth;
                cursor.classList.add('clicked');
                setTimeout(() => cursor.classList.remove('clicked'), 400);
            },

            setCursorState: (state) => {
                cursor.classList.remove('typing', 'hovering', 'clicked');
                if (state && state !== 'normal') cursor.classList.add(state);
            },

            // Smooth eased glide from the current position to the target.
            animateToPosition: (targetX, targetY, duration = 500, options = {}) => {
                // A second animate() call while one is in flight used to leave
                // both loops writing transform on alternate frames.
                cancelAnimation();
                suppressMouseFollowing = true;
                if (suppressTimeout) {
                    clearTimeout(suppressTimeout);
                    suppressTimeout = null;
                }

                const startX = window.playwrightCursor.x;
                const startY = window.playwrightCursor.y;
                const startTime = performance.now();
                const linear = options.easing === 'linear';

                return new Promise((resolve) => {
                    settleCurrent = resolve;

                    function step(now) {
                        const progress = duration > 0
                            ? Math.min((now - startTime) / duration, 1)
                            : 1;
                        const eased = linear ? progress : easeInOutCubic(progress);

                        const currentX = startX + (targetX - startX) * eased;
                        const currentY = startY + (targetY - startY) * eased;

                        window.playwrightCursor.x = currentX;
                        window.playwrightCursor.y = currentY;
                        window.playwrightCursor.timestamp = Date.now();
                        window.playwrightCursor.type = 'animation';

                        updateBotCursorPosition(currentX, currentY, options.showTrail);

                        if (progress < 1) {
                            animationFrame = requestAnimationFrame(step);
                        } else {
                            animationFrame = null;
                            settleCurrent = null;
                            releaseSuppression(options.suppressDuration || 200);
                            resolve({ x: targetX, y: targetY });
                        }
                    }

                    animationFrame = requestAnimationFrame(step);
                });
            },

            suppressMouseFollowing: (suppress, duration = 0) => {
                suppressMouseFollowing = suppress;
                if (suppressTimeout) {
                    clearTimeout(suppressTimeout);
                    suppressTimeout = null;
                }
                if (suppress && duration > 0) releaseSuppression(duration);
            },

            isMouseFollowingSuppressed: () => suppressMouseFollowing,

            setVisibility: (visible) => {
                cursor.style.display = visible ? 'block' : 'none';
            },

            clearTrail: () => {
                trailDots.forEach(dot => dot.remove());
                trailDots.length = 0;
            }
        };

        // --- 7. EVENT LISTENERS ---
        document.addEventListener('bot-cursor-move', (e) => {
            const { x, y } = e.detail;
            updateBotCursorPosition(x, y);
        });

        document.addEventListener('bot-cursor-click', () => {
            window.botCursorAPI.triggerClick();
        });

        // --- 8. INITIALIZATION ---
        window.botCursorAPI.setCursorPosition(
            window.innerWidth / 2,
            window.innerHeight / 2,
            { type: 'init', suppressDuration: 100 }
        );
    }

    // add_init_script() runs before the DOM exists, page.evaluate() runs long
    // after DOMContentLoaded has already fired. The old code only listened for
    // the event, so the evaluate() injection never built a cursor at all.
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
