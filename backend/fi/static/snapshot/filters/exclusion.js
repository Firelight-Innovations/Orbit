/**
 * @typedef {Object} ElementFilters
 * @property {string[]} [excluded_tags]
 * @property {string[]} [excluded_classes]
 * @property {Record<string, Array<string|number>>} [excluded_attributes]
 * @property {{ width?: number, height?: number }} [min_dimensions]
 */
/**
 * @typedef {Object} SnapshotState
 * @property {number} [totalProcessed]
 */
/**
 * @param {HTMLElement} element
 * @param {ElementFilters} [elementFilters]
 * @param {SnapshotState} [state]
 * @returns {boolean}
 */
export function shouldExclude(element, elementFilters = /** @type {ElementFilters} */ ({}), state) {
    try {
        const tag = (element.tagName || '').toLowerCase();
        if (state && typeof state.totalProcessed === 'number') state.totalProcessed++;

        // Do not exclude elements that are clearly interactive or semantically labeled,
        // even if their tag is part of the excluded set. This preserves controls like
        // div[role="button"] used by apps such as Gmail for the Compose action.
        try {
            const roleAttr = element.getAttribute && element.getAttribute('role');
            /** @type {any} */
            const anyElement = /** @type {any} */(element);
            const tabbable = typeof anyElement.tabIndex === 'number' && anyElement.tabIndex >= 0;
            const hasOnClick = element.hasAttribute && element.hasAttribute('onclick');
            if (roleAttr || tabbable || hasOnClick) return false;
        } catch (e) {
            // Ignore guard errors and continue with normal exclusion checks
        }

        // Excluded tags
        const excludedTags = /** @type {string[]} */ (elementFilters.excluded_tags || []);
        if (excludedTags.indexOf(tag) !== -1) return true;

        // Excluded classes
        const excludedClasses = /** @type {string[]} */ (elementFilters.excluded_classes || []);
        if (element.classList) {
            for (let i = 0; i < excludedClasses.length; i++) {
                if (element.classList.contains(excludedClasses[i])) return true;
            }
        }

        // Excluded attributes
        const excludedAttributes = /** @type {Record<string, Array<string|number>>} */ (elementFilters.excluded_attributes || {});
        for (const attrName in excludedAttributes) {
            if (!Object.prototype.hasOwnProperty.call(excludedAttributes, attrName)) continue;
            const disallowedVals = /** @type {Array<string|number>} */ (excludedAttributes[attrName] || []);
            if (element.hasAttribute && element.hasAttribute(attrName)) {
                const rawVal = (element.getAttribute(attrName) || '').toString().toLowerCase();
                for (let i = 0; i < disallowedVals.length; i++) {
                    const needle = (disallowedVals[i] || '').toString().toLowerCase();
                    if (rawVal.indexOf(needle) !== -1) return true;
                }
            }
        }

        // Min dimensions
        const minDim = /** @type {{ width?: number, height?: number }} */ (elementFilters.min_dimensions || {});
        const minW = typeof minDim.width === 'number' ? minDim.width : 1;
        const minH = typeof minDim.height === 'number' ? minDim.height : 1;
        const ow = element.offsetWidth || 0;
        const oh = element.offsetHeight || 0;
        if (ow < minW || oh < minH) return true;

        return false;
    } catch (e) {
        return false;
    }
}


