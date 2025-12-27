import { getRole } from '../a11y/roles.js';
import { getAccessibleName } from '../a11y/names.js';

// Note: Types are intentionally loose in this module to avoid JSDoc conflicts
// with other modules. We prefer runtime guards over structural typing here.

/**
 * Normalize text for duplicate comparisons.
 * - Trim
 * - Collapse whitespace
 * - Lowercase
 * - Remove zero-width chars
 * @param {string} text
 * @returns {string}
 */
export function normalizeName(text) {
	if (!text) return '';
	return text
		.replace(/[\u200B-\u200D\uFEFF]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

/**
 * Get a cleaned accessible name (fallback to textContent).
 * @param {Element} element
 * @param {any} textProcessing
 * @param {any} accessibilityInfo
 * @returns {string}
 */
export function getCleanName(element, textProcessing, accessibilityInfo) {
	try {
		const name = getAccessibleName(/** @type {HTMLElement} */(element), /** @type {any} */(textProcessing), /** @type {any} */(accessibilityInfo));
		const raw = (name != null && name !== '') ? name : (element.textContent || '');
		return normalizeName(raw);
	} catch (e) {
		return '';
	}
}

/**
 * Determine if element should be considered interactable.
 * @param {Element} element
 * @param {any} [dupConfig]
 * @returns {boolean}
 */
export function isInteractive(element, dupConfig = /** @type {any} */({})) {
	try {
		const el = /** @type {HTMLElement} */ (element);
		const tag = (el.tagName || '').toLowerCase();

		const interactive = dupConfig && dupConfig.interactive || {};
		const interactiveTags = new Set(interactive.tags || ['a','button','input','textarea','select','summary']);
		const excludedInputTypes = new Set((interactive.input_types_excluded || ['hidden']).map(/** @param {any} t */ (t) => String(t).toLowerCase()));
		const treatTabIndex = interactive.treat_tabindex_focusable_as_interactive !== false;
		const treatOnClick = interactive.treat_onclick_as_interactive !== false;

		if (interactiveTags.has(tag)) {
			if (tag === 'input') {
				const type = (el.getAttribute('type') || 'text').toLowerCase();
				if (!excludedInputTypes.has(type)) return true;
				// else fall through
			} else {
				return true;
			}
		}

		const role = getRole(el) || '';
		const interactiveRoles = new Set(interactive.roles || [
			'button','link','checkbox','radio','switch','combobox','listbox','option','tab','menuitem','slider','spinbutton'
		]);
		if (interactiveRoles.has(role)) return true;

		const attrRules = interactive.attributes || {};
		if (el.getAttribute && attrRules.contenteditable) {
			const val = el.getAttribute('contenteditable');
			if (val != null && attrRules.contenteditable.includes(String(val))) return true;
		}
		// Use property for tabIndex; >= 0 is focusable
		if (treatTabIndex && typeof el.tabIndex === 'number' && el.tabIndex >= 0) return true;
		if (treatOnClick && el.hasAttribute && el.hasAttribute('onclick')) return true;
		return false;
	} catch (e) {
		return false;
	}
}

/**
 * Check if element is exempt from duplicate removal due to configured roles.
 * @param {Element} element
 * @param {any} [dupConfig]
 * @returns {boolean}
 */
export function isExempt(element, dupConfig = /** @type {any} */({})) {
	try {
		const role = getRole(/** @type {HTMLElement} */(element)) || '';
		const exempt = dupConfig && dupConfig.exempt || {};
		const exemptRoles = new Set(exempt.roles || ['heading','banner','navigation','main','complementary','contentinfo','search','region']);
		return exemptRoles.has(role);
	} catch (e) {
		return false;
	}
}

/**
 * Determine if current element should be excluded because its immediate parent or immediate children
 * contain an interactable element with the exact same cleaned name, while the current element is
 * not interactable and not exempt.
 * @param {Element} element
 * @param {any} textProcessing
 * @param {any} accessibilityInfo
 * @param {any} [dupConfig]
 * @returns {boolean}
 */
export function shouldExcludeByParentChildDuplicate(element, textProcessing, accessibilityInfo, dupConfig = /** @type {any} */({})) {
	try {
		if (isExempt(element, dupConfig)) return false;
		if (isInteractive(element, dupConfig)) return false;
		const selfName = getCleanName(element, textProcessing, accessibilityInfo);
		if (!selfName) return false;

		// Check immediate parent
		const parent = element.parentElement;
		if (parent) {
			if (!isExempt(parent, dupConfig) && isInteractive(parent, dupConfig)) {
				const parentName = getCleanName(parent, textProcessing, accessibilityInfo);
				if (parentName && parentName === selfName) return true;
			}
		}

		// Check immediate children
		const children = element.children || [];
		for (let i = 0; i < children.length; i++) {
			const child = children[i];
			if (!child || child.nodeType !== 1) continue;
			if (isExempt(child, dupConfig)) continue;
			if (isInteractive(child, dupConfig)) {
				const childName = getCleanName(child, textProcessing, accessibilityInfo);
				if (childName && childName === selfName) return true;
			}
		}
		return false;
	} catch (e) {
		return false;
	}
}

/**
 * Compute a set of immediate child elements to exclude from traversal due to duplicate names.
 * Rules:
 * - If any child is interactable for a given name, exclude all non-interactive, non-exempt children with that name
 * - If no interactable children share the name, keep the first occurrence and exclude later duplicates (non-exempt)
 * - Exempt roles are never excluded
 * @param {Element} parent
 * @param {any} textProcessing
 * @param {any} accessibilityInfo
 * @param {any} [dupConfig]
 * @returns {Set<Element>}
 */
export function computeChildrenExclusion(parent, textProcessing, accessibilityInfo, dupConfig = /** @type {any} */({})) {
	/** @type {Set<Element>} */
	const toExclude = new Set();
	try {
		const kids = parent.children || [];
		/** @type {Record<string, Array<{ el: Element, interactive: boolean, exempt: boolean }>>} */
		const byName = {};
		for (let i = 0; i < kids.length; i++) {
			const child = kids[i];
			if (!child || child.nodeType !== 1) continue;
			const exempt = isExempt(child, dupConfig);
			const name = getCleanName(child, textProcessing, accessibilityInfo);
			if (!name) continue;
			const interactive = isInteractive(child, dupConfig);
			if (!byName[name]) byName[name] = [];
			byName[name].push({ el: child, interactive, exempt });
		}

		for (const name in byName) {
			const list = byName[name];
			let hasInteractive = false;
			for (let i = 0; i < list.length; i++) {
				if (list[i].interactive) { hasInteractive = true; break; }
			}
			if (hasInteractive) {
				for (let i = 0; i < list.length; i++) {
					const item = list[i];
					if (!item.exempt && !item.interactive) toExclude.add(item.el);
				}
			} else {
				let seenOne = false;
				for (let i = 0; i < list.length; i++) {
					const item = list[i];
					if (!item.exempt) {
						if (!seenOne) {
							seenOne = true; // keep first occurrence
						} else {
							toExclude.add(item.el); // drop later duplicates
						}
					}
				}
			}
		}
		return toExclude;
	} catch (e) {
		return toExclude;
	}
}


