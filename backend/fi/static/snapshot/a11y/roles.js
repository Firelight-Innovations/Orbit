/**
 * @param {HTMLElement} element
 * @returns {string}
 */
export function getRole(element) {
    const explicitRole = element.getAttribute && element.getAttribute('role');
    if (explicitRole) return explicitRole;

    const tag = (element.tagName || '').toLowerCase();
    if (tag === 'a' && element.hasAttribute('href')) return 'link';
    if (tag === 'button') return 'button';
    if (tag === 'input') {
        const type = (element.getAttribute('type') || 'text').toLowerCase();
        if (type === 'checkbox') return 'checkbox';
        if (type === 'radio') return 'radio';
        if (type === 'submit' || type === 'button' || type === 'image' || type === 'reset') return 'button';
        return 'textbox';
    }
    if (tag === 'textarea') return 'textbox';
    if (tag === 'select') return 'combobox';
    if (tag === 'summary') return 'button';
    if (tag === 'img') return 'img';
    if (/^h[1-6]$/.test(tag)) return 'heading';
    if (tag === 'nav') return 'navigation';
    if (tag === 'header') return 'banner';
    if (tag === 'main') return 'main';
    if (tag === 'aside') return 'complementary';
    if (tag === 'footer') return 'contentinfo';
    if (tag === 'form') return 'form';
    if (tag === 'section') return 'region';
    return 'generic';
}


