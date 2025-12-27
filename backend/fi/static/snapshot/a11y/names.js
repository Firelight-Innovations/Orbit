import { truncateText } from '../utils/text.js';

/**
 * @param {Document} rootDoc
 * @param {string} ids
 * @returns {string}
 */
function getTextFromIds(rootDoc, ids) {
    const idList = ids.split(/\s+/).filter(Boolean);
    const parts = [];
    for (let i = 0; i < idList.length; i++) {
        const el = rootDoc.getElementById(idList[i]);
        if (el) parts.push(el.textContent || '');
    }
    return parts.join(' ').trim();
}

/**
 * @typedef {Object} TextProcessing
 * @property {boolean} [include_alt_text]
 * @property {boolean} [include_title_attributes]
 * @property {boolean} [include_placeholder_text]
 */
/**
 * @typedef {Object} AccessibilityInfo
 * @property {boolean} [include_accessible_name]
 * @property {boolean} [include_accessible_description]
 */
/**
 * @param {HTMLElement} element
 * @param {TextProcessing} [textProcessing]
 * @param {AccessibilityInfo} [accessibilityInfo]
 * @returns {string | undefined}
 */
export function getAccessibleName(element, textProcessing = /** @type {TextProcessing} */({}), accessibilityInfo = /** @type {AccessibilityInfo} */({})) {
    if (!accessibilityInfo || !accessibilityInfo.include_accessible_name) return undefined;
    try {
        const doc = element.ownerDocument || document;
        const ariaLabel = element.getAttribute('aria-label');
        if (ariaLabel) return truncateText(ariaLabel, textProcessing);

        const labelledby = element.getAttribute('aria-labelledby');
        if (labelledby) return truncateText(getTextFromIds(doc, labelledby), textProcessing);

        const tag = (element.tagName || '').toLowerCase();
        if (tag === 'img') {
            const alt = element.getAttribute('alt');
            if (textProcessing.include_alt_text && alt) return truncateText(alt, textProcessing);
        }

        const id = element.getAttribute('id');
        if (id) {
            const labelByFor = doc.querySelector("label[for='" + id.replace(/'/g, "\\'") + "']");
            if (labelByFor && labelByFor.textContent) return truncateText(labelByFor.textContent, textProcessing);
        }

        const labelParent = element.closest && element.closest('label');
        if (labelParent && labelParent.textContent) return truncateText(labelParent.textContent, textProcessing);

        const titleAttr = element.getAttribute('title');
        if (textProcessing.include_title_attributes && titleAttr) return truncateText(titleAttr, textProcessing);

        const placeholder = element.getAttribute('placeholder');
        if (textProcessing.include_placeholder_text && placeholder) return truncateText(placeholder, textProcessing);

        return truncateText(element.textContent || '', textProcessing);
    } catch (e) {
        return undefined;
    }
}

/**
 * @param {HTMLElement} element
 * @param {AccessibilityInfo} [accessibilityInfo]
 * @param {TextProcessing} [textProcessing]
 * @returns {string | undefined}
 */
export function getAccessibleDescription(element, accessibilityInfo = /** @type {AccessibilityInfo} */({}), textProcessing = /** @type {TextProcessing} */({})) {
    if (!accessibilityInfo || !accessibilityInfo.include_accessible_description) return undefined;
    try {
        const doc = element.ownerDocument || document;
        const describedby = element.getAttribute('aria-describedby');
        if (describedby) return truncateText(getTextFromIds(doc, describedby), textProcessing);
        return undefined;
    } catch (e) {
        return undefined;
    }
}


