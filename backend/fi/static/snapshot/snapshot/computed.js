import { truncateText } from '../utils/text.js';

/**
 * @typedef {Object} SemanticComputedData
 * @property {string[]} [computed_properties]
 */

/**
 * @param {HTMLElement} element
 * @param {SemanticComputedData} [semanticData]
 * @param {Object} [textProcessing]
 * @returns {Record<string, string | number>}
 */
export function collectComputed(element, semanticData = /** @type {SemanticComputedData} */({}), textProcessing = /** @type {Object} */({})) {
    /** @type {string[]} */
    const props = semanticData.computed_properties || [];
    /** @type {Record<string, string | number>} */
    const out = {};
    for (let i = 0; i < props.length; i++) {
        const p = props[i];
        if (p === 'tagName') out.tagName = element.tagName || '';
        else if (p === 'textContent') out.textContent = truncateText(element.textContent || '', textProcessing);
        else if (p === 'offsetWidth') out.offsetWidth = element.offsetWidth || 0;
        else if (p === 'offsetHeight') out.offsetHeight = element.offsetHeight || 0;
        else if (p === 'offsetTop') out.offsetTop = element.offsetTop || 0;
        else if (p === 'offsetLeft') out.offsetLeft = element.offsetLeft || 0;
    }
    return out;
}


