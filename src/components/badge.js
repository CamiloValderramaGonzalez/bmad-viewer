import { escapeHtml } from '../utils/html-escape.js';

/**
 * Render a status badge.
 * @param {{status: string, text?: string}} props
 * @returns {string} HTML string
 */
export function Badge({ status, text }) {
	const label = text || status;
	return `<span class="badge badge--${escapeHtml(status)}">${escapeHtml(label)}</span>`;
}
