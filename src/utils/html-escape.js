const ESCAPE_MAP = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;',
};

/**
 * Escape HTML special characters to prevent XSS.
 * @param {string} str - Raw string
 * @returns {string} - Escaped string safe for HTML insertion
 */
export function escapeHtml(str) {
	if (typeof str !== 'string') return '';
	return str.replace(/[&<>"']/g, (char) => ESCAPE_MAP[char]);
}
