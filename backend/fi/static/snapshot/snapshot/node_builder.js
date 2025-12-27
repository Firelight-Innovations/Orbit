/**
 * @typedef {Object} SnapshotState
 * @property {string} refPrefix
 * @property {number} refCounter
 * @property {number} [refInjectedCount]
 * @property {number} [totalIncluded]
 */
/**
 * @typedef {Object} AccessibilityInfo
 * @property {boolean} [include_role]
 */
/**
 * @typedef {Object} SemanticData
 * @property {AccessibilityInfo} [accessibility_info]
 */
/**
 * @typedef {Object} TextProcessing
 */
/**
 * @typedef {Object} BuildConfig
 * @property {Object} [element_filters]
 * @property {TextProcessing} [text_processing]
 * @property {SemanticData} [semantic_data]
 * @property {Object} [duplicate_filters]
 */
/**
 * @typedef {Object} SnapshotIframe
 * @property {string} url
 * @property {boolean} traversed
 * @property {boolean} crossOrigin
 */
/**
 * @typedef {Object} SnapshotNode
 * @property {string} ref
 * @property {string} tag
 * @property {string} [role]
 * @property {string} [name]
 * @property {string} [description]
 * @property {Object} [attributes]
 * @property {Object} [computed]
 * @property {boolean} [isLandmark]
 * @property {SnapshotNode[]} [children]
 * @property {SnapshotIframe} [iframe]
 */
/**
 * @typedef {Object} Deps
 * @property {SnapshotState} state
 * @property {(text: string, opts?: TextProcessing) => string} truncateText
 * @property {(el: Element) => (string|undefined)} getRole
 * @property {(el: Element, tp: TextProcessing, ai: AccessibilityInfo) => (string|undefined)} getAccessibleName
 * @property {(el: Element, ai: AccessibilityInfo, tp: TextProcessing) => (string|undefined)} getAccessibleDescription
 * @property {(role: (string|undefined), ai: AccessibilityInfo) => boolean} [isLandmark]
 * @property {(el: Element, filters: Object, state: SnapshotState) => boolean} shouldExclude
 * @property {(parent: Element, tp: TextProcessing, ai: AccessibilityInfo, dupCfg?: Object) => Set<Element>} [computeChildrenExclusion]
 * @property {(el: Element, tp: TextProcessing, ai: AccessibilityInfo, dupCfg?: Object) => boolean} [shouldExcludeByParentChildDuplicate]
 * @property {(el: Element, sd: SemanticData) => Object} collectAttributes
 * @property {(el: Element, sd: SemanticData, tp: TextProcessing) => Object} collectComputed
 */

/**
 * @param {Deps} deps
 * @returns {(element: Element, depth?: number, config?: BuildConfig) => (SnapshotNode | SnapshotNode[] | null)}
 */
export function buildSnapshotNodeFactory(deps) {
    const {
        state,
        getRole,
        getAccessibleName,
        getAccessibleDescription,
        isLandmark,
        shouldExclude,
        computeChildrenExclusion,
        shouldExcludeByParentChildDuplicate,
        collectAttributes,
        collectComputed
    } = deps;

    /**
     * @param {Element} element
     * @param {number} [depth=0]
     * @param {BuildConfig} [config]
     * @returns {SnapshotNode | SnapshotNode[] | null}
     */
    function buildSnapshotNode(element, depth = 0, config = /** @type {BuildConfig} */({})) {
        if (!element) return null;

        /** @type {Object} */
        const elementFilters = (config && config.element_filters) || {};
        /** @type {TextProcessing} */
        const textProcessing = (config && config.text_processing) || /** @type {TextProcessing} */({});
        /** @type {SemanticData} */
        const semanticData = (config && config.semantic_data) || /** @type {SemanticData} */({});
        const accessibilityInfo = semanticData.accessibility_info || {};
        /** @type {Object} */
        const duplicateFilters = (config && config.duplicate_filters) || /** @type {Object} */({});

        if (shouldExclude(element, elementFilters, state) || (shouldExcludeByParentChildDuplicate && shouldExcludeByParentChildDuplicate(element, textProcessing, accessibilityInfo, duplicateFilters))) {
            /** @type {SnapshotNode[]} */
            const mergedChildren = [];
            const tagWhenExcluded = (element.tagName || '').toLowerCase();
            if (tagWhenExcluded === 'iframe') {
                try {
                    /** @type {HTMLIFrameElement} */
                    const iframeEl = /** @type {HTMLIFrameElement} */ (element);
                    const doc = iframeEl.contentDocument;
                    if (doc && doc.body) {
                        const frameChildren = doc.body.children || [];
                        for (let i = 0; i < frameChildren.length; i++) {
                            const childNode = buildSnapshotNode(frameChildren[i], depth + 1, config);
                            if (Array.isArray(childNode)) {
                                for (let j = 0; j < childNode.length; j++) mergedChildren.push(childNode[j]);
                            } else if (childNode) {
                                mergedChildren.push(childNode);
                            }
                        }
                    }
                } catch (e) {
                    // Cross-origin iframe or access denied; skip
                }
            } else {
                const children = element.children || [];
                const excludeSet = computeChildrenExclusion ? computeChildrenExclusion(element, textProcessing, accessibilityInfo, duplicateFilters) : new Set();
                for (let i = 0; i < children.length; i++) {
                    const child = children[i];
                    if (child && child.nodeType === 1 && !excludeSet.has(child)) {
                        const childNode = buildSnapshotNode(child, depth + 1, config);
                        if (Array.isArray(childNode)) {
                            for (let j = 0; j < childNode.length; j++) mergedChildren.push(childNode[j]);
                        } else if (childNode) {
                            mergedChildren.push(childNode);
                        }
                    }
                }
            }
            return mergedChildren;
        }

        // Assign a ref to every included element
        const refId = state.refPrefix + (state.refCounter++);
        try {
            element.setAttribute('ref', refId);
            if (typeof state.refInjectedCount === 'number') state.refInjectedCount++;
        } catch (e) {}

        /** @type {SnapshotNode} */
        const node = {};
        const role = accessibilityInfo && accessibilityInfo.include_role ? getRole(element) : undefined;
        const name = getAccessibleName(element, textProcessing, accessibilityInfo);
        const description = getAccessibleDescription(element, accessibilityInfo, textProcessing);
        const attributes = collectAttributes(element, semanticData);
        const computed = collectComputed(element, semanticData, textProcessing);

        node.ref = refId;
        node.tag = (element.tagName || '').toLowerCase();
        if (role != null) node.role = role;
        if (name != null) node.name = name;
        if (description != null) node.description = description;
        if (Object.keys(attributes).length) node.attributes = attributes;
        if (Object.keys(computed).length) node.computed = computed;

        const isLandmarkRole = isLandmark ? isLandmark(role, accessibilityInfo) : undefined;
        if (typeof isLandmarkRole === 'boolean') node.isLandmark = isLandmarkRole;

        // Traverse children
        node.children = /** @type {SnapshotNode[]} */([]);

        const tag = (element.tagName || '').toLowerCase();
        if (tag === 'iframe') {
            try {
                /** @type {HTMLIFrameElement} */
                const iframeEl = /** @type {HTMLIFrameElement} */ (element);
                const doc = iframeEl.contentDocument;
                const win = iframeEl.contentWindow;
                node.iframe = {
                    url: (win && win.location && win.location.href) || iframeEl.getAttribute('src') || '',
                    traversed: false,
                    crossOrigin: false
                };
                if (doc && doc.body) {
                    const frameChildren = doc.body.children || [];
                    for (let i = 0; i < frameChildren.length; i++) {
                        const childNode = buildSnapshotNode(frameChildren[i], depth + 1, config);
                        if (Array.isArray(childNode)) {
                            for (let j = 0; j < childNode.length; j++) node.children.push(childNode[j]);
                        } else if (childNode) {
                            node.children.push(childNode);
                        }
                    }
                    node.iframe.traversed = true;
                }
            } catch (e) {
                node.iframe = /** @type {SnapshotIframe} */ (node.iframe || { url: '', traversed: false, crossOrigin: false });
                node.iframe.crossOrigin = true;
                node.iframe.traversed = false;
                node.iframe.url = /** @type {HTMLIFrameElement} */ (element).getAttribute('src') || '';
            }
        } else {
            const children = element.children || [];
            const excludeSet = computeChildrenExclusion ? computeChildrenExclusion(element, textProcessing, accessibilityInfo, duplicateFilters) : new Set();
            for (let i = 0; i < children.length; i++) {
                const child = children[i];
                if (child && child.nodeType === 1 && !excludeSet.has(child)) {
                    const childNode = buildSnapshotNode(child, depth + 1, config);
                    if (Array.isArray(childNode)) {
                        for (let j = 0; j < childNode.length; j++) node.children.push(childNode[j]);
                    } else if (childNode) {
                        node.children.push(childNode);
                    }
                }
            }
        }

        if (typeof state.totalIncluded === 'number') state.totalIncluded++;
        return node;
    }

    return buildSnapshotNode;
}


