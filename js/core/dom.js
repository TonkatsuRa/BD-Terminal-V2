// js/core/dom.js — tiny DOM helpers shared across the app.

const domByIdCache = new Map();

/**
 * Memoized `document.getElementById`. The cache invalidates automatically when
 * a previously-cached element has been removed from the DOM.
 * @param {string} id
 * @returns {HTMLElement|null}
 */
export function getById(id) {
    const cached = domByIdCache.get(id);
    if (cached && cached.isConnected) return cached;
    const element = document.getElementById(id);
    if (element) domByIdCache.set(id, element);
    else domByIdCache.delete(id);
    return element;
}

/** Remove all children (text-content reset). Null-safe. */
export function clearElement(element) {
    if (element) element.textContent = '';
}

/**
 * Create an element with optional class and text content.
 * Replaces the repeated createElement/className/textContent triplets.
 * @param {string} tag
 * @param {string} [className]
 * @param {string} [text]
 * @returns {HTMLElement}
 */
export function el(tag, className = '', text = '') {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
}
