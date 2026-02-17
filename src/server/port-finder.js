import { createServer } from 'node:net';

const DEFAULT_PORT = 4000;
const MAX_ATTEMPTS = 10;

/**
 * Find an available port starting from the given port.
 * Tries up to MAX_ATTEMPTS ports incrementally.
 *
 * @param {number|null} preferredPort - Preferred port, or null for default
 * @returns {Promise<number>} - Available port number
 */
export async function findAvailablePort(preferredPort = null) {
	const startPort = preferredPort || DEFAULT_PORT;

	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		const port = startPort + attempt;
		const available = await isPortAvailable(port);
		if (available) {
			return port;
		}
	}

	throw new Error(
		`Could not find available port after ${MAX_ATTEMPTS} attempts (tried ${startPort}-${startPort + MAX_ATTEMPTS - 1})`,
	);
}

/**
 * Check if a port is available by trying to bind to it.
 * @param {number} port
 * @returns {Promise<boolean>}
 */
function isPortAvailable(port) {
	return new Promise((resolve) => {
		const server = createServer();
		server.listen(port, '127.0.0.1', () => {
			server.close(() => resolve(true));
		});
		server.on('error', () => resolve(false));
	});
}
