window.addEventListener('load', () => {   
    const LOGO_BASE_64 = `
        data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQQAAAEECAMAAAD51ro4AAAAAXNSR0IB2cksfwAAAAlwSFlzAAALEwAACxMBAJqcGAAAAl5QTFRFAAAAELmBELiBELiCELiDELeDEbeDEbeEEbeFEbaFEbaGEraGEraHErWHErWIErWJE7WJE7SJE7SKE7SLE7OLFLOLFLOMFLONFLKNFLKOFbKOFbKPFbGPFbGQFbGRFrGRFrCSFrCTF6+UF7CUF6+VF6+WF66WGK6WGK6XGK6YGK2YGK2ZGa2ZGa2aGayaGaybGaycGqycGqucGqudGqueG6qfGqqeG6qgG6qeG6mgG6mhHKmhHKmiHKijHKikHaikHailHaelHaemJZy8Jpy9Jpy+Jpu/HaenJpy8HqanJpu+J5u/J5vAHqenJ5rAJ5rBHqaoKJrCJ5rCKJnDHqapKJnCKJnEHqWpH6WpKZjFH6WqKZjGKJnFKZjHH6WrKZfHKpfIH6SrKpfHKpfJKpbJH6SsIKSsKpbKK5bKIKStK5bLK5XLK5XMIKOuK5XNLJTNIKOtLJTOIKOvLJXNIaOvLJTPLZPPIaKvIaKwLZPQLZPRIaKxLJPPLZLSLZLRLpLSLpLTIqGxIqGyLpHULpHVIqGzL5HVL5DWL5DXIqC0L5HWL5DYMI/YI6C0MI/ZMJDYIqG0I6C1MI/aMI7aMY7aMY7bMY7cI6C2MY3cI5+2MY3dMo3dMo3eI5+3MozeMozfJJ+3MozgM4zgJJ+4M4vhM4vgM4viJJ64NIrjM4riNIrkNInlJJ65NYnlNYnmNYjnNYnnNYjoNojoNojpNofpJJ66NofqJZ66N4frJZ26N4brNofrN4bsN4btJZ27N4XtOIXtOIXuOIXvOITvJZ28OITwOYTwOYTxOYPxOYPyZuIgTQAAAMp0Uk5TAP///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////3s/HWEA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
    `

    const style = document.createElement('style');
    style.innerHTML = `
        .fi-browser-indicator {
            position: fixed;
            top: 16px;
            left: 50%;
            transform: translateX(-50%);
            background: linear-gradient(135deg, #3B82F6 0%, #1E40AF 100%);
            color: white;
            padding: 12px 24px;
            border-radius: 12px;
            box-shadow: 0 10px 25px -5px rgba(59, 130, 246, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.1);
            z-index: 10000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            font-weight: 500;
            border: 1px solid rgba(255, 255, 255, 0.2);
            backdrop-filter: blur(10px);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            display: flex;
            align-items: center;
            gap: 12px;
            max-width: 320px;
            animation: slideDown 0.5s ease-out;
        }

        .fi-browser-indicator:hover {
            transform: translateX(-50%) translateY(-2px);
            box-shadow: 0 20px 40px -10px rgba(59, 130, 246, 0.4), 0 8px 16px -4px rgba(0, 0, 0, 0.15);
        }

        .fi-logo-container {
            width: 24px;
            height: 24px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 6px;
            padding: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            position: relative;
            overflow: hidden;
        }

        .fi-logo-img {
            width: 16px;
            height: 16px;
            object-fit: contain;
            filter: brightness(1.1);
            transition: transform 0.2s ease;
        }

        .fi-logo-container:hover .fi-logo-img {
            transform: scale(1.05);
        }

        .fi-logo-fallback {
            width: 16px;
            height: 16px;
            background: linear-gradient(45deg, #10B981, #059669);
            border-radius: 50%;
            position: relative;
            animation: pulse 2s infinite;
        }

        .fi-logo-fallback::after {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 6px;
            height: 6px;
            background: white;
            border-radius: 50%;
        }

        .fi-indicator-text {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }

        .fi-main-text {
            font-weight: 600;
            font-size: 14px;
            line-height: 1.2;
        }

        .fi-sub-text {
            font-size: 12px;
            opacity: 0.85;
            font-weight: 400;
        }

        .fi-close-btn {
            margin-left: auto;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.2);
            border: none;
            color: white;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            transition: all 0.2s ease;
            flex-shrink: 0;
        }

        .fi-close-btn:hover {
            background: rgba(255, 255, 255, 0.3);
            transform: scale(1.1);
        }

        .fi-close-logo {
            width: 24px;
            height: 24px;
            object-fit: contain;
            filter: brightness(1.2) contrast(1.1);
            opacity: 0.9;
        }

        /* Vignette Border Effect */
        .fi-browser-vignette {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            pointer-events: none;
            z-index: 9999;
            border: 4px solid #3B82F6;
            box-shadow: 
                inset 0 0 20px rgba(59, 130, 246, 0.3),
                inset 0 0 40px rgba(59, 130, 246, 0.1);
            animation: vignettePulse 3s ease-in-out infinite;
        }

        @keyframes vignettePulse {
            0%, 100% { 
                border-color: #3B82F6;
                box-shadow: 
                    inset 0 0 20px rgba(59, 130, 246, 0.3),
                    inset 0 0 40px rgba(59, 130, 246, 0.1);
            }
            50% { 
                border-color: #1E40AF;
                box-shadow: 
                    inset 0 0 30px rgba(59, 130, 246, 0.5),
                    inset 0 0 60px rgba(59, 130, 246, 0.2);
            }
        }

        /* Corner Indicators */
        .fi-corner-indicator {
            position: fixed;
            width: 40px;
            height: 40px;
            background: linear-gradient(45deg, #3B82F6, #1E40AF);
            animation: cornerPulse 2s ease-in-out infinite;
            pointer-events: none;
            z-index: 9998;
        }

        .fi-corner-indicator.top-left {
            top: 0;
            left: 0;
            clip-path: polygon(0 0, 100% 0, 0 100%);
        }

        .fi-corner-indicator.top-right {
            top: 0;
            right: 0;
            clip-path: polygon(100% 0, 0 0, 100% 100%);
        }

        .fi-corner-indicator.bottom-left {
            bottom: 0;
            left: 0;
            clip-path: polygon(0 0, 100% 100%, 0 100%);
        }

        .fi-corner-indicator.bottom-right {
            bottom: 0;
            right: 0;
            clip-path: polygon(100% 0, 0 100%, 100% 100%);
        }

        @keyframes cornerPulse {
            0%, 100% { 
                opacity: 0.7; 
                transform: scale(1); 
                filter: brightness(1);
            }
            50% { 
                opacity: 1; 
                transform: scale(1.1); 
                filter: brightness(1.2);
            }
        }

        @keyframes slideDown {
            from {
                opacity: 0;
                transform: translateX(-50%) translateY(-20px);
            }
            to {
                opacity: 1;
                transform: translateX(-50%) translateY(0);
            }
        }

        @keyframes pulse {
            0%, 100% {
                box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4);
            }
            50% {
                box-shadow: 0 0 0 8px rgba(16, 185, 129, 0);
            }
        }

        /* Responsive adjustments for mobile */
        @media (max-width: 480px) {
            .fi-browser-indicator {
                top: 12px;
                left: 12px;
                right: 12px;
                transform: none;
                max-width: none;
            }
            
            .fi-browser-vignette {
                border-width: 30px;
            }
            
            .fi-corner-indicator {
                width: 30px;
                height: 30px;
            }
        }
    `;
    document.head.appendChild(style);

    // Vignette Border Function
    function addVignetteEffect() {
        const vignette = document.createElement('div');
        vignette.className = 'fi-browser-vignette';
        document.body.appendChild(vignette);
        return vignette;
    }

    // Corner Indicators Function
    function addCornerIndicators() {
        const corners = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
        const indicators = [];
        
        corners.forEach(corner => {
            const indicator = document.createElement('div');
            indicator.className = `fi-corner-indicator ${corner}`;
            document.body.appendChild(indicator);
            indicators.push(indicator);
        });
        
        return indicators;
    }

    // Favicon Animation Function
    function animateFavicon() {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        
        let frame = 0;
        let animationId;
        
        function drawFavicon() {
            ctx.clearRect(0, 0, 32, 32);
            
            // Draw pulsing circle background
            const radius = 12 + Math.sin(frame * 0.15) * 2;
            const opacity = 0.8 + Math.sin(frame * 0.1) * 0.2;
            
            // Gradient background
            const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, radius);
            gradient.addColorStop(0, `rgba(59, 130, 246, ${opacity})`);
            gradient.addColorStop(1, `rgba(30, 64, 175, ${opacity * 0.7})`);
            
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(16, 16, radius, 0, Math.PI * 2);
            ctx.fill();
            
            // Draw AI robot icon
            ctx.fillStyle = 'white';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
            ctx.shadowBlur = 2;
            
            // Robot head (rectangle)
            ctx.fillRect(10, 8, 12, 10);
            
            // Robot eyes
            ctx.fillStyle = '#3B82F6';
            ctx.fillRect(12, 10, 2, 2);
            ctx.fillRect(18, 10, 2, 2);
            
            // Robot mouth
            ctx.fillRect(13, 14, 6, 1);
            
            // Robot antenna
            ctx.fillStyle = 'white';
            ctx.fillRect(15, 6, 2, 2);
            ctx.fillRect(14, 4, 4, 1);
            
            // Add pulsing dot on antenna
            const dotOpacity = 0.5 + Math.sin(frame * 0.3) * 0.5;
            ctx.fillStyle = `rgba(59, 130, 246, ${dotOpacity})`;
            ctx.beginPath();
            ctx.arc(16, 3, 1, 0, Math.PI * 2);
            ctx.fill();
            
            frame++;
            
            // Update favicon
            const link = document.querySelector("link[rel*='icon']") || document.createElement('link');
            link.type = 'image/x-icon';
            link.rel = 'shortcut icon';
            link.href = canvas.toDataURL();
            document.getElementsByTagName('head')[0].appendChild(link);
            
            animationId = requestAnimationFrame(drawFavicon);
        }
        
        drawFavicon();
        
        // Return cleanup function
        return () => {
            if (animationId) {
                cancelAnimationFrame(animationId);
            }
        };
    }

    // Cleanup function for all effects
    function removeAllEffects() {
        // Remove vignette
        const vignette = document.querySelector('.fi-browser-vignette');
        if (vignette) vignette.remove();
        
        // Remove corner indicators
        document.querySelectorAll('.fi-corner-indicator').forEach(indicator => indicator.remove());
        
        // Reset favicon to original
        const originalFavicon = '/favicon.ico'; // Adjust path as needed
        const link = document.querySelector("link[rel*='icon']");
        if (link) {
            link.href = originalFavicon;
        }
    }

    // Initialize all AI indicators
    function initializeAIIndicators() {
        // Add visual effects
        const vignette = addVignetteEffect();
        //const cornerIndicators = addCornerIndicators();
        const stopFaviconAnimation = animateFavicon();
        
        // Store cleanup functions for later use
        window.fiapplyCleanup = {
            removeVignette: () => vignette?.remove(),
            removeCornerIndicators: () => cornerIndicators?.forEach(indicator => indicator.remove()),
            stopFaviconAnimation: stopFaviconAnimation,
            removeAll: removeAllEffects
        };
    }

    // Create the main indicator
    const indicator = document.createElement('div');
    indicator.className = 'fi-browser-indicator';
    
    // Create initial structure with placeholder
    indicator.innerHTML = `
        <div class="fi-logo-container">
            <div class="fi-logo-fallback"></div>
        </div>
        <div class="fi-indicator-text">
            <div class="fi-main-text">Fi is actively</div>
            <div class="fi-sub-text">controlling your browser</div>
        </div>
        <img src="${typeof LOGO_BASE_64 !== 'undefined' ? LOGO_BASE_64 : ''}" 
             alt="logo" 
             class="fi-close-logo">
    `;
    
    document.body.appendChild(indicator);

    // Load the actual logo and replace placeholder (if loadLogo function exists)
    if (typeof loadLogo === 'function') {
        loadLogo().then(logoElement => {
            const placeholder = indicator.querySelector('.fi-logo-container');
            if (placeholder && logoElement) {
                placeholder.replaceWith(logoElement);
            }
        });
    }

    // Initialize all additional AI indicators
    initializeAIIndicators();

    // Auto-hide after 30 seconds (optional)
    setTimeout(() => {
        if (indicator.parentElement) {
            indicator.style.opacity = '0';
            indicator.style.transform = 'translateX(-50%) translateY(-20px)';
            setTimeout(() => {
                if (indicator.parentElement) {
                    indicator.remove();
                    // Optionally remove other effects as well
                    // window.fiapplyCleanup?.removeAll();
                }
            }, 300);
        }
    }, 300000);
});
