/**
 * Hardcoded MIME type lookup table.
 * Only supports file types needed by bmad-viewer.
 */
const MIME_TYPES = {
	'.html': 'text/html; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.js': 'application/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.ico': 'image/x-icon',
};

const DEFAULT_MIME = 'application/octet-stream';

/**
 * Get MIME type for a file extension.
 * @param {string} ext - File extension including dot (e.g., '.html')
 * @returns {string}
 */
export function getMimeType(ext) {
	return MIME_TYPES[ext.toLowerCase()] || DEFAULT_MIME;
}
