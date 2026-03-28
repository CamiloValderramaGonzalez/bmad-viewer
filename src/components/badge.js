import { escapeHtml } from '../utils/html-escape.js';

/**
 * Render a status badge.
 * @param {{status: string, text?: string, attrs?: string}} props
 * @returns {string} HTML string
 */
export function Badge({ status, text, attrs = '' }) {
	const label = text || status;
	return `<span class="badge badge--${escapeHtml(status)}"${attrs}>${escapeHtml(label)}</span>`;
}
