// Use 'https://bot.sannysoft.com/' for anti-bot testing

(() => {
    const userAgent = '{selected_user_agent}';
    
    // COMPREHENSIVE WEBDRIVER REMOVAL - Multiple approaches
    // Method 1: Override the property completely
    Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
        set: () => {},
        enumerable: false,
        configurable: true
    });
    
    // Method 2: Remove from all possible locations
    delete Object.getPrototypeOf(navigator).webdriver;
    delete window.navigator.webdriver;
    delete Navigator.prototype.webdriver;
    
    // Method 3: Override on the prototype chain
    Object.defineProperty(Object.getPrototypeOf(navigator), 'webdriver', {
        get: () => undefined,
        set: () => {},
        enumerable: false,
        configurable: true
    });
    
    // Method 4: Override on window object
    Object.defineProperty(window, 'webdriver', {
        get: () => undefined,
        set: () => {},
        enumerable: false,
        configurable: true
    });
    
    // Method 5: Remove all webdriver-related properties
    const webdriverProps = [
        'webdriver', '__webdriver_script_fn', '__webdriver_evaluate', '__webdriver_unwrapped',
        '__fxdriver_evaluate', '__driver_evaluate', '__selenium_evaluate', '__webdriver_script_function',
        '__selenium_unwrapped', '__webdriver_script_func', '__webdriver_script_element',
        '_Selenium_IDE_Recorder', '_selenium', 'calledSelenium', '$cdc_asdjflasutopfhvcZLmcfl_',
        '$chrome_asyncScriptInfo', '__$webdriverAsyncExecutor', 'webdriver_id', '__webdriverFunc',
        'domAutomation', 'domAutomationController', '__lastWatirAlert', '__lastWatirConfirm',
        '__lastWatirPrompt', '_WEBDRIVER_ELEM_CACHE'
    ];
    
    webdriverProps.forEach(prop => {
        delete window[prop];
        delete navigator[prop];
        delete document[prop];
        try {
            Object.defineProperty(window, prop, {
                get: () => undefined,
                set: () => {},
                enumerable: false,
                configurable: true
            });
        } catch (e) {}
    });
    
    // COMPREHENSIVE AUTOMATION INDICATOR REMOVAL
    const automationIndicators = [
        'cdc_adoQpoasnfa76pfcZLmcfl_Array', 'cdc_adoQpoasnfa76pfcZLmcfl_Promise',
        'cdc_adoQpoasnfa76pfcZLmcfl_Symbol', 'cdc_adoQpoasnfa76pfcZLmcfl_JSON',
        'cdc_adoQpoasnfa76pfcZLmcfl_Object', 'cdc_adoQpoasnfa76pfcZLmcfl_Function',
        'chrome_asyncScriptInfo', '__chrome_asyncScriptInfo', '__webdriver_script_fn',
        'spawn', 'emit', '__nightmare', '_phantom', '__phantomas', 'callPhantom',
        '_selenium', 'calledSelenium', '$webdriver', '$driver', '$chrome_asyncScriptInfo'
    ];
    
    automationIndicators.forEach(prop => {
        delete window[prop];
        delete document[prop];
    });
    
    // NAVIGATOR PROPERTIES FIX
    Object.defineProperty(navigator, 'userAgent', {
        get: () => userAgent,
        enumerable: true,
        configurable: true
    });
    
    Object.defineProperty(navigator, 'appVersion', {
        get: () => userAgent.substring(userAgent.indexOf('/') + 1),
        enumerable: true,
        configurable: true
    });
    
    Object.defineProperty(navigator, 'platform', {
        get: () => 'MacIntel',
        enumerable: true,
        configurable: true
    });
    
    // ADVANCED PLUGINARRAY FIX - Complete reconstruction
    Object.defineProperty(navigator, 'plugins', {
        get: function() {
            // Create a function that acts as PluginArray constructor
            function PluginArrayImpl() {}
            PluginArrayImpl.prototype = PluginArray.prototype;
            
            // Create instance using the constructor
            const pluginArray = new PluginArrayImpl();
            
            const pluginsData = [
                {
                    name: "PDF Viewer",
                    description: "Portable Document Format",
                    filename: "internal-pdf-viewer",
                    length: 1,
                    0: {
                        type: "application/pdf",
                        suffixes: "pdf",
                        description: "Portable Document Format"
                    }
                },
                {
                    name: "Chrome PDF Viewer", 
                    description: "Portable Document Format",
                    filename: "internal-pdf-viewer",
                    length: 1,
                    0: {
                        type: "application/pdf",
                        suffixes: "pdf",
                        description: "Portable Document Format"
                    }
                },
                {
                    name: "Chromium PDF Viewer",
                    description: "Portable Document Format", 
                    filename: "internal-pdf-viewer",
                    length: 1,
                    0: {
                        type: "application/pdf",
                        suffixes: "pdf",
                        description: "Portable Document Format"
                    }
                },
                {
                    name: "Microsoft Edge PDF Viewer",
                    description: "Portable Document Format",
                    filename: "internal-pdf-viewer", 
                    length: 1,
                    0: {
                        type: "application/pdf",
                        suffixes: "pdf",
                        description: "Portable Document Format"
                    }
                },
                {
                    name: "WebKit built-in PDF",
                    description: "Portable Document Format",
                    filename: "internal-pdf-viewer",
                    length: 1,
                    0: {
                        type: "application/pdf",
                        suffixes: "pdf",
                        description: "Portable Document Format"
                    }
                }
            ];
            
            // Add plugins as indexed properties
            pluginsData.forEach((plugin, index) => {
                Object.defineProperty(pluginArray, index, {
                    value: plugin,
                    enumerable: true,
                    configurable: false
                });
            });
            
            // Set length property
            Object.defineProperty(pluginArray, 'length', {
                value: pluginsData.length,
                writable: false,
                enumerable: false,
                configurable: false
            });
            
            // Add required methods
            pluginArray.item = function(index) {
                return this[index] || null;
            };
            
            pluginArray.namedItem = function(name) {
                for (let i = 0; i < this.length; i++) {
                    if (this[i] && this[i].name === name) return this[i];
                }
                return null;
            };
            
            pluginArray.refresh = function() {};
            
            // Ensure constructor points to PluginArray
            Object.defineProperty(pluginArray, 'constructor', {
                value: PluginArray,
                writable: false,
                enumerable: false,
                configurable: false
            });
            
            // Set the correct prototype
            Object.setPrototypeOf(pluginArray, PluginArray.prototype);
            
            return pluginArray;
        },
        enumerable: true,
        configurable: true
    });
    
    // MIMETYPES ARRAY FIX
    Object.defineProperty(navigator, 'mimeTypes', {
        get: function() {
            function MimeTypeArrayImpl() {}
            MimeTypeArrayImpl.prototype = MimeTypeArray.prototype;
            
            const mimeArray = new MimeTypeArrayImpl();
            
            const mimeData = [
                {
                    type: "application/pdf",
                    suffixes: "pdf",
                    description: "Portable Document Format"
                },
                {
                    type: "text/pdf",
                    suffixes: "pdf", 
                    description: "Portable Document Format"
                }
            ];
            
            mimeData.forEach((mime, index) => {
                Object.defineProperty(mimeArray, index, {
                    value: mime,
                    enumerable: true,
                    configurable: false
                });
            });
            
            Object.defineProperty(mimeArray, 'length', {
                value: mimeData.length,
                writable: false,
                enumerable: false,
                configurable: false
            });
            
            mimeArray.item = function(index) {
                return this[index] || null;
            };
            
            mimeArray.namedItem = function(name) {
                for (let i = 0; i < this.length; i++) {
                    if (this[i] && this[i].type === name) return this[i];
                }
                return null;
            };
            
            Object.defineProperty(mimeArray, 'constructor', {
                value: MimeTypeArray,
                writable: false,
                enumerable: false,
                configurable: false
            });
            
            Object.setPrototypeOf(mimeArray, MimeTypeArray.prototype);
            
            return mimeArray;
        },
        enumerable: true,
        configurable: true
    });
    
    // COMPREHENSIVE CHROME OBJECT
    if (!window.chrome) {
        window.chrome = {};
    }
    
    // Enhanced chrome.runtime
    Object.defineProperty(window.chrome, 'runtime', {
        value: {
            onConnect: {
                addListener: function() {},
                removeListener: function() {},
                hasListener: function() { return false; }
            },
            onMessage: {
                addListener: function() {},
                removeListener: function() {},
                hasListener: function() { return false; }
            },
            connect: function() {
                throw new Error('Extension context invalidated.');
            },
            sendMessage: function() {
                throw new Error('Extension context invalidated.');
            },
            getManifest: function() {
                throw new Error('Extension context invalidated.');
            },
            getURL: function() {
                throw new Error('Extension context invalidated.');
            },
            id: undefined
        },
        writable: false,
        enumerable: true,
        configurable: false
    });
    
    // Chrome app object
    Object.defineProperty(window.chrome, 'app', {
        value: {
            isInstalled: false,
            InstallState: {
                DISABLED: "disabled",
                INSTALLED: "installed", 
                NOT_INSTALLED: "not_installed"
            },
            RunningState: {
                CANNOT_RUN: "cannot_run",
                READY_TO_RUN: "ready_to_run",
                RUNNING: "running"
            }
        },
        writable: false,
        enumerable: true,
        configurable: false
    });
    
    // Chrome loadTimes
    Object.defineProperty(window.chrome, 'loadTimes', {
        value: function() {
            const now = Date.now() / 1000;
            return {
                commitLoadTime: now - Math.random() * 2,
                finishDocumentLoadTime: now - Math.random() * 2,
                finishLoadTime: now - Math.random() * 2,
                firstPaintAfterLoadTime: 0,
                firstPaintTime: now - Math.random() * 2,
                navigationType: "Other",
                npnNegotiatedProtocol: "h2",
                requestTime: now - Math.random() * 3,
                startLoadTime: now - Math.random() * 3,
                wasAlternateProtocolAvailable: false,
                wasFetchedViaSpdy: true,
                wasNpnNegotiated: true
            };
        },
        writable: false,
        enumerable: true,
        configurable: false
    });
    
    // Chrome csi
    Object.defineProperty(window.chrome, 'csi', {
        value: function() {
            const now = Date.now();
            return {
                startE: now - Math.random() * 1000,
                onloadT: now - Math.random() * 1000,
                pageT: now - Math.random() * 1000,
                tran: 15
            };
        },
        writable: false,
        enumerable: true,
        configurable: false
    });
    
    // LANGUAGES FIX
    Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
        enumerable: true,
        configurable: true
    });
    
    // PERMISSIONS FIX
    if (navigator.permissions && navigator.permissions.query) {
        const originalQuery = navigator.permissions.query;
        navigator.permissions.query = function(parameters) {
            if (parameters.name === 'notifications') {
                return Promise.resolve({ state: 'granted' });
            }
            return originalQuery.call(navigator.permissions, parameters);
        };
    }
    
    // WEBGL FIXES
    const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(parameter) {
        if (parameter === 37445) return 'Google Inc. (Apple)';
        if (parameter === 37446) return 'ANGLE (Apple, Apple M1 Pro, OpenGL 4.1)';
        return originalGetParameter.call(this, parameter);
    };
    
    if (window.WebGL2RenderingContext) {
        const originalGetParameter2 = WebGL2RenderingContext.prototype.getParameter;
        WebGL2RenderingContext.prototype.getParameter = function(parameter) {
            if (parameter === 37445) return 'Google Inc. (Apple)';
            if (parameter === 37446) return 'ANGLE (Apple, Apple M1 Pro, OpenGL 4.1)';
            return originalGetParameter2.call(this, parameter);
        };
    }
    
    // ADDITIONAL BROWSER PROPERTIES
    Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => 8,
        enumerable: true,
        configurable: true
    });
    
    Object.defineProperty(navigator, 'deviceMemory', {
        get: () => 8,
        enumerable: true,
        configurable: true
    });
    
    // SCREEN PROPERTIES
    Object.defineProperty(screen, 'availWidth', {
        get: () => 1440,
        enumerable: true,
        configurable: true
    });
    
    Object.defineProperty(screen, 'availHeight', {
        get: () => 900,
        enumerable: true,
        configurable: true
    });
    
    // IFRAME DETECTION FIX
    Object.defineProperty(window, 'outerWidth', {
        get: () => window.innerWidth,
        enumerable: true,
        configurable: true
    });
    
    Object.defineProperty(window, 'outerHeight', {
        get: () => window.innerHeight,
        enumerable: true,
        configurable: true
    });
    
    // NOTIFICATION PERMISSION
    if ('Notification' in window) {
        Object.defineProperty(Notification, 'permission', {
            get: () => 'granted',
            enumerable: true,
            configurable: true
        });
    }
    
    // FINAL CLEANUP - Remove any remaining automation traces
    const finalCleanup = () => {
        delete window.webdriver;
        delete navigator.webdriver;
        delete Object.getPrototypeOf(navigator).webdriver;
    };
    
    finalCleanup();
    
    // Run cleanup again after a short delay
    setTimeout(finalCleanup, 1);
})();
