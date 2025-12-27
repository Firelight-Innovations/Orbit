/**
 * @typedef {Object} SemanticAttributesData
 * @property {string[]} [include_attributes]
 */

/**
 * @param {HTMLElement} element
 * @param {SemanticAttributesData} [semanticData]
 * @returns {Record<string, string | null>}
 */
export function collectAttributes(element, semanticData = /** @type {SemanticAttributesData} */({})) {
    /** @type {string[]} */
    const attrsList = semanticData.include_attributes || [];
    /** @type {Record<string, string | null>} */
    const attrs = {};
    for (let i = 0; i < attrsList.length; i++) {
        const name = /** @type {string} */ (attrsList[i]);
        if (name === 'class') {
            if (element.className) attrs['class'] = element.className;
            continue;
        }
        if (element.hasAttribute && element.hasAttribute(name)) {
            let val = element.getAttribute(name);
            // Basic privacy: mask password values
            if (name === 'value') {
                const type = (element.getAttribute('type') || '').toLowerCase();
                if (type === 'password') val = '***';
            }
            attrs[name] = val;
        }
    }
    return attrs;
}


