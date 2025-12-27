/**
 * @typedef {Object} AccessibilityInfo
 * @property {boolean} [include_landmark_info]
 */
/**
 * @param {string | undefined} role
 * @param {AccessibilityInfo} [accessibilityInfo]
 * @returns {boolean | undefined}
 */
export function isLandmark(role, accessibilityInfo = /** @type {AccessibilityInfo} */({})) {
    if (!accessibilityInfo || !accessibilityInfo.include_landmark_info) return undefined;
    const landmarks = new Set(['banner', 'navigation', 'main', 'complementary', 'contentinfo', 'search', 'region']);
    return landmarks.has(role || '');
}


